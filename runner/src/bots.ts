// Bots (experiment `bots`): the runner's own record of each managed bot, in
// one file, `bots.json`, in the data folder. A bot is a folder inside a
// folder named `bots`, and only the ones listed in runner.json's
// `bots.managed` are managed: none is by default.
//
// For each it keeps a pointer to the bot's main chat, and the tasks that
// chat started: which thread, when, by when it should report (its
// deadline), and the report the runner wrote when the task's turn ended.
// The report goes to the bot's main chat, found by the pointer, so the
// main chat hears how a task came out whether it finished, needs the
// owner, failed or was stopped. Nothing here trusts what an agent says
// about its own task: who started what comes from the runner's own
// `startedBy`, and a report's kind from how the turn ended.
//
// With the experiment off, or no bot listed, nothing is recorded and no
// file is written: every entry point returns before doing anything.
//
// The rules are plain functions (tested alone, runner/test/unit/bots.test.ts);
// `Bots` holds the state and the timers; `runnerHost` is what it needs of
// the Runner. This slice records and reports. It does not yet reconcile
// after a crash, mirror to the website, retire a main chat or add rules to
// a turn: those are later slices.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Clock, TimerHandle } from './clock.ts';
import { expandHome } from './config.ts';
import { experimentOn } from './experiments.ts';
import { atomicWriteFileSync, readJsonSync } from './fsutil.ts';
import type { Runner } from './runner.ts';

export const BOTS_FILE = 'bots.json';
// By when a task should have reported, unless the bot's entry says otherwise.
export const DEFAULT_DEADLINE_MINUTES = 120;
// How many of a bot's tasks may be open at once. One past it is still
// made (create_thread must not break), recorded as over the cap, and the
// main chat is told.
export const OPEN_TASK_CAP = 3;
// Tasks that finish within this long of each other are told in one message.
export const FINAL_BATCH_MS = 3000;
const REPLY_CHARS = 2000;
const EVIDENCE_MAX = 12;

// ------------------------------------------------------------ rules

const segments = (p: string) => p.split('/').filter(Boolean);

/**
 * A bot's name, if this folder can be a bot's: it sits inside a folder
 * named `bots`, and its own name doesn't start with `_` or `.`. The same
 * rule as the website's (web/src/bots.ts, botFolder); the two are held
 * together by one list of cases both test (web/src/bots-folders.json).
 */
export function botName(folder: string): string | undefined {
  const parts = segments(folder);
  const name = parts.at(-1) ?? '';
  return parts.slice(0, -1).includes('bots') && name && !/^[_.]/.test(name) ? name : undefined;
}

export const insideFolder = (p: string, folder: string) => p === folder || p.startsWith(folder.replace(/\/+$/, '') + '/');

export type ManagedBot = { name: string; folder: string; deadlineMs: number };

/**
 * The bots runner.json lists: `"bots": { "managed": [ { "folder":
 * "~/scratch/bots/juno", "deadlineMinutes": 2 } ] }` (a bare path works
 * too). One that isn't a bot's folder by the rule above is left out, as is
 * a second entry for the same folder or the same name.
 */
export function readManaged(runnerJson: unknown, resolve: (p: string) => string = (p) => path.resolve(expandHome(p))): ManagedBot[] {
  const listed = (runnerJson as { bots?: { managed?: unknown } } | undefined)?.bots?.managed;
  if (!Array.isArray(listed)) return [];
  const out: ManagedBot[] = [];
  for (const entry of listed) {
    const raw = typeof entry === 'string' ? entry : (entry as { folder?: unknown } | null)?.folder;
    if (typeof raw !== 'string' || !raw.trim()) continue;
    const folder = resolve(raw.trim()).replace(/\/+$/, '');
    const name = botName(folder);
    if (!name || out.some((b) => b.name === name || b.folder === folder)) continue;
    const minutes = typeof entry === 'object' && entry ? (entry as { deadlineMinutes?: unknown }).deadlineMinutes : undefined;
    const deadlineMs = (typeof minutes === 'number' && Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_DEADLINE_MINUTES) * 60_000;
    out.push({ name, folder, deadlineMs });
  }
  return out;
}

export type ReportKind = 'final' | 'needs-you' | 'failed' | 'stopped';
export type Evidence = { kind: string; title: string; where?: string };
export type BotReport = {
  id: string;
  kind: ReportKind;
  at: string;
  reply?: string;
  // What the runner itself found the task made: reported, not verified.
  evidence: Evidence[];
  // Where it went: the main chat, the main chat's own waitFor (so not sent
  // again), or nowhere, as the bot had no main chat to tell.
  delivered?: 'main' | 'waitFor' | 'no-main';
  deliveredAt?: string;
};
export type BotTask = {
  parentThreadId: string;
  generation: number;
  // 'working' until a report, then the report's kind. Plain strings.
  state: string;
  createdAt: string;
  deadline: string;
  lastActivityAt: string;
  // Made while the bot already had OPEN_TASK_CAP open.
  overCap?: true;
  // The main chat has been told it missed its deadline.
  overdueAt?: string;
  report?: BotReport;
  reports?: number;
};
export type BotRecord = {
  name: string;
  folder: string;
  projectId?: string;
  generation: number;
  main?: { threadId: string; generation: number };
  tasks: Record<string, BotTask>;
  // Threads started in the bot's folder by a thread that isn't its main
  // chat (a task's own helper, another bot's thread): known, and not tasks.
  plain: Record<string, { parentThreadId: string; createdAt: string }>;
};
export type BotsState = { version: 1; bots: Record<string, BotRecord> };

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** The file's contents as state, or undefined for anything that isn't whole: a cut-off write must never be taken as a record. */
export function parseState(text: string): BotsState | undefined {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!isObject(data) || data.version !== 1 || !isObject(data.bots)) return undefined;
  for (const bot of Object.values(data.bots)) {
    if (!isObject(bot) || typeof bot.name !== 'string' || typeof bot.folder !== 'string' || typeof bot.generation !== 'number' || !isObject(bot.tasks) || !isObject(bot.plain)) return undefined;
    if (bot.main !== undefined && (!isObject(bot.main) || typeof bot.main.threadId !== 'string' || typeof bot.main.generation !== 'number')) return undefined;
    for (const task of Object.values(bot.tasks)) {
      if (!isObject(task) || typeof task.parentThreadId !== 'string' || typeof task.state !== 'string' || typeof task.deadline !== 'string' || typeof task.createdAt !== 'string') return undefined;
    }
  }
  return data as BotsState;
}

/**
 * What a task's turn ending amounts to. Stopped and failed are how the turn
 * ended. A turn that completed is `needs-you` if it left something for the
 * owner (an ask, an open card), `final` if the runner itself marked the
 * thread finished with nothing left running, and otherwise nothing: it's
 * still going (a queued message, a job in the background, a wait of its
 * own), which is progress, not a report.
 */
export function reportKind(end: { outcome: 'completed' | 'failed' | 'interrupted'; needsYou: boolean; finished: boolean; turnRunning: boolean }): ReportKind | undefined {
  if (end.outcome === 'interrupted') return 'stopped';
  if (end.outcome === 'failed') return 'failed';
  if (end.needsYou) return 'needs-you';
  return end.finished && !end.turnRunning ? 'final' : undefined;
}

const STATUS: Record<ReportKind, string> = { final: 'finished', 'needs-you': 'needs the owner', failed: 'failed', stopped: 'stopped' };

/** A report as the main chat reads it: status, result, evidence, what would unblock it. */
export function reportText(task: { threadId: string; title: string }, report: BotReport): string {
  const id8 = task.threadId.slice(0, 8);
  const evidence = report.evidence.length ? report.evidence.map((e) => `- ${e.kind}: ${e.title}${e.where ? ` (${e.where})` : ''}`).join('\n') : '- none found';
  const unblock: Record<ReportKind, string> = {
    final: 'Nothing: it is done.',
    'needs-you': `The owner has to answer it. Tell them what it is asking; read_thread ${id8} has the question.`,
    failed: `read_thread ${id8} for the error, then send it a message to try again or start a new task.`,
    stopped: `It was stopped before it finished. Send it a message to carry on, or leave it stopped.`,
  };
  return [
    `Task "${task.title}" (thread ${id8})`,
    `Status: ${STATUS[report.kind]}`,
    `Result: ${report.reply?.trim() || '(it gave no reply)'}`,
    `Evidence (found by Threadbear in the task's own record; reported, not verified):\n${evidence}`,
    `What would unblock it: ${unblock[report.kind]}`,
    `Report ${report.id}`,
  ].join('\n');
}

/** The tasks that count against the cap: still working, or waiting on the owner. */
export const openTasks = (bot: BotRecord) => Object.entries(bot.tasks).filter(([, t]) => t.state === 'working' || t.state === 'needs-you');

// ------------------------------------------------------------ what it needs of the runner

export type ThreadView = {
  id: string;
  title: string;
  cwd: string;
  archived: boolean;
  turnRunning: boolean;
  // The last turn left something for the owner: an ask, or an open card.
  needsYou: boolean;
  // The runner marked it finished (nothing needed, nothing left running).
  finished: boolean;
  // The threads it has hibernated to wait on (end_turn's waitFor) and not yet heard from.
  waitingOn: { threadId: string; until?: string }[];
};

export type BotsHost = {
  home: string;
  clock: Clock;
  log?: { info(msg: string, extra?: object): void; warn(msg: string, extra?: object): void };
  on(): boolean;
  runnerJson(): unknown;
  thread(threadId: string): ThreadView | undefined;
  /** Sends a message from the runner to a thread, queued behind any turn it is on. False if it couldn't. */
  tell(threadId: string, text: string, why: string): boolean;
  evidence(threadId: string): Evidence[];
  reply(threadId: string): string;
  projectFor(folder: string): string | undefined;
  /** Runs once the turn that is ending has finished its own bookkeeping. */
  defer(fn: () => void): void;
};

/** The host a real Runner gives. Built before the runner is (main.ts), so it takes a way to reach it. */
export function runnerHost(runner: () => Runner, home: string, clock: Clock, log?: BotsHost['log']): BotsHost {
  return {
    home,
    clock,
    log,
    on: () => experimentOn(home, 'bots'),
    runnerJson: () => readJsonSync<unknown>(path.join(home, 'runner.json')),
    thread(threadId) {
      const st = runner().threads.get(threadId);
      if (!st || st.rt.deleted) return undefined;
      const { rec, rt } = st;
      const asked = rec.needs?.needs === 'you' && rec.needs.seq >= rec.lastTurnCompletedSeq;
      return {
        id: rec.id,
        title: rec.title,
        cwd: rec.cwd,
        archived: Boolean(rec.archivedAt),
        turnRunning: Boolean(rt.turn),
        needsYou: asked || rec.status === 'waiting' || rt.approvals.size > 0,
        finished: Boolean(rec.finished),
        waitingOn: (rec.waitingOn ?? []).filter((w) => !w.done).map((w) => ({ threadId: w.threadId, ...(w.until ? { until: w.until } : {}) })),
      };
    },
    tell(threadId, text, why) {
      const r = runner();
      const st = r.threads.get(threadId);
      if (!st || st.rt.deleted || st.rec.archivedAt) return false;
      // As a wait that's over wakes its thread (hibernation.ts, deliverWaits).
      if (r.bucket(st.rec) === 'snoozed') {
        r.wake(st, { why });
        r.armSnoozeTimer();
      }
      r.sendTo(st, text, [], { origin: 'runner', queue: true });
      return true;
    },
    evidence(threadId) {
      try {
        return runner()
          .highlights(threadId)
          .highlights.filter((h) => h.how !== 'mentioned')
          .slice(-EVIDENCE_MAX)
          .map((h) => ({ kind: h.kind, title: h.title, ...(h.path || h.url || h.sha ? { where: h.path ?? h.url ?? h.sha } : {}) }));
      } catch {
        return [];
      }
    },
    reply(threadId) {
      const st = runner().threads.get(threadId);
      let text = st?.rec.finished?.reply ?? '';
      if (!text) {
        try {
          text = runner().threadGist(threadId, { recent: 1, chars: REPLY_CHARS }).recent.filter((x) => x.who === 'assistant').at(-1)?.text ?? '';
        } catch {
          text = '';
        }
      }
      return text.length > REPLY_CHARS ? text.slice(0, REPLY_CHARS) + '…' : text;
    },
    projectFor: (folder) => runner().projects?.list().find((p) => p.folders.includes(folder))?.id,
    defer: (fn) => queueMicrotask(fn),
  };
}

// ------------------------------------------------------------ the record

export class Bots {
  private host: BotsHost;
  private state?: BotsState;
  private deadlineTimer?: TimerHandle;
  private batchTimer?: TimerHandle;
  // Finished tasks waiting to be told together, by bot.
  private batch = new Map<string, string[]>();

  constructor(host: BotsHost) {
    this.host = host;
  }

  private get file(): string {
    return path.join(this.host.home, BOTS_FILE);
  }

  private iso(): string {
    return new Date(this.host.clock.now()).toISOString();
  }

  /** The record, read once. A file that isn't whole is set aside, never used and never written over. */
  private load(): BotsState {
    if (this.state) return this.state;
    let text: string | undefined;
    try {
      text = fs.readFileSync(this.file, 'utf8');
    } catch {
      text = undefined;
    }
    const parsed = text === undefined ? undefined : parseState(text);
    if (text !== undefined && !parsed) {
      const aside = `${this.file}.unreadable-${this.host.clock.now()}`;
      try {
        fs.renameSync(this.file, aside);
      } catch {
        /* left where it is: the next save replaces it */
      }
      this.host.log?.warn('bots.json could not be read and was set aside', { aside });
    }
    this.state = parsed ?? { version: 1, bots: {} };
    return this.state;
  }

  private save(): void {
    if (!this.state) return;
    atomicWriteFileSync(this.file, JSON.stringify(this.state, null, 2) + '\n');
  }

  private managed(): ManagedBot[] {
    return this.host.on() ? readManaged(this.host.runnerJson()) : [];
  }

  private find(threadId: string): { bot: BotRecord; task: BotTask } | undefined {
    for (const bot of Object.values(this.load().bots)) {
      const task = bot.tasks[threadId];
      if (task) return { bot, task };
    }
    return undefined;
  }

  /** Re-arms what the file says is pending. Called once the runner's threads are loaded. */
  start(): void {
    if (!this.host.on() || !fs.existsSync(this.file)) return;
    this.armDeadlines();
  }

  stop(): void {
    this.deadlineTimer?.cancel();
    this.batchTimer?.cancel();
  }

  /** A thread was made (Runner.create): the bot's main chat, one of its tasks, or neither. */
  created(rec: { id: string; cwd: string; createdAt: string; startedBy?: { kind: string; threadId?: string } }): void {
    const managed = this.managed().find((b) => insideFolder(rec.cwd, b.folder));
    if (!managed) return;
    const state = this.load();
    const had = state.bots[managed.name];
    const parent = rec.startedBy?.kind === 'thread' ? rec.startedBy.threadId : undefined;
    // What it is, before anything is recorded: the owner's own chat is the
    // bot's main chat if it has none (and nothing if it has one, whatever
    // the owner starts next); a thread another thread started is a task or
    // a plain thread; one a schedule, a tool or the runner started is none
    // of these.
    const role = !rec.startedBy ? (had?.main ? undefined : 'main') : parent ? (had?.main && parent === had.main.threadId ? 'task' : 'plain') : undefined;
    if (!role) return;
    const bot = (state.bots[managed.name] ??= { name: managed.name, folder: managed.folder, generation: 1, tasks: {}, plain: {} });
    bot.folder = managed.folder;
    const projectId = this.host.projectFor(managed.folder);
    if (projectId) bot.projectId = projectId;
    if (role === 'main') {
      bot.main = { threadId: rec.id, generation: bot.generation };
    } else if (role === 'task' && parent && bot.main) {
      const over = openTasks(bot).length >= OPEN_TASK_CAP;
      const now = this.host.clock.now();
      bot.tasks[rec.id] = {
        parentThreadId: parent,
        generation: bot.main.generation,
        state: 'working',
        createdAt: rec.createdAt,
        deadline: new Date(now + managed.deadlineMs).toISOString(),
        lastActivityAt: this.iso(),
        ...(over ? { overCap: true as const } : {}),
      };
      if (over) {
        const text = `This bot already had ${OPEN_TASK_CAP} tasks open, which is its limit, and thread ${rec.id.slice(0, 8)} was started as another. It was started anyway and is recorded as over the limit. Finish or stop a task before starting more.`;
        this.host.tell(bot.main.threadId, text, 'a task over the limit');
      }
    } else if (parent) {
      // Started by a thread that isn't this bot's main chat (a task's own
      // helper, another bot's thread): known, and not a task. One level only.
      bot.plain[rec.id] = { parentThreadId: parent, createdAt: rec.createdAt };
    }
    this.save();
    this.armDeadlines();
  }

  /** A turn ended (Runner.endTurn). For a task, the runner writes its report once the turn's own bookkeeping is done. */
  turnEnded(threadId: string, outcome: 'completed' | 'failed' | 'interrupted'): void {
    if (!this.host.on()) return;
    const found = this.find(threadId);
    if (!found) return;
    // Read now, before the finish wakes it: is the bot's main chat already
    // waiting on this task through its own waitFor? Then that tells it.
    const main = found.bot.main ? this.host.thread(found.bot.main.threadId) : undefined;
    const waited = Boolean(main?.waitingOn.some((w) => w.threadId === threadId && !w.until));
    this.host.defer(() => this.settle(threadId, outcome, waited));
  }

  private settle(threadId: string, outcome: 'completed' | 'failed' | 'interrupted', waited: boolean): void {
    const found = this.find(threadId);
    const view = this.host.thread(threadId);
    if (!found || !view) return;
    const { bot, task } = found;
    task.lastActivityAt = this.iso();
    const kind = reportKind({ outcome, needsYou: view.needsYou, finished: view.finished, turnRunning: view.turnRunning });
    if (!kind) {
      // Still going: progress, which wakes nobody.
      task.state = 'working';
      this.save();
      return;
    }
    const reply = this.host.reply(threadId);
    const report: BotReport = { id: crypto.randomUUID(), kind, at: this.iso(), ...(reply ? { reply } : {}), evidence: this.host.evidence(threadId) };
    task.state = kind;
    task.report = report;
    task.reports = (task.reports ?? 0) + 1;
    if (kind === 'final' && waited) {
      // The main chat hibernated to wait on this task, so its finish has
      // already been sent to it with the reply: told once, not twice.
      report.delivered = 'waitFor';
      report.deliveredAt = this.iso();
      this.save();
    } else if (kind === 'final') {
      this.save();
      this.batch.set(bot.name, [...(this.batch.get(bot.name) ?? []), threadId]);
      this.batchTimer ??= this.host.clock.setTimeout(() => this.flush(), FINAL_BATCH_MS);
    } else {
      // Needs the owner, failed or stopped: told at once.
      this.deliver(bot, [threadId]);
    }
    this.armDeadlines();
  }

  /** Tells each bot's main chat about the tasks that finished together. */
  private flush(): void {
    this.batchTimer = undefined;
    const batch = this.batch;
    this.batch = new Map();
    for (const [name, threadIds] of batch) {
      const bot = this.load().bots[name];
      if (bot) this.deliver(bot, threadIds);
    }
  }

  private deliver(bot: BotRecord, threadIds: string[]): void {
    const due = threadIds.flatMap((id) => {
      const task = bot.tasks[id];
      return task?.report && !task.report.delivered ? [{ id, report: task.report }] : [];
    });
    if (!due.length) return;
    const parts = due.map(({ id, report }) => reportText({ threadId: id, title: this.host.thread(id)?.title ?? 'A task' }, report));
    const head = due.length === 1 ? 'One of your tasks has reported.' : `${due.length} of your tasks have reported.`;
    const text = `${head}\n\n${parts.join('\n\n')}`;
    const told = bot.main ? this.host.tell(bot.main.threadId, text, due.length === 1 ? 'a task reported' : 'tasks reported') : false;
    for (const { report } of due) {
      report.delivered = told ? 'main' : 'no-main';
      report.deliveredAt = this.iso();
    }
    this.save();
  }

  /** One timer, for the next task due. A task past its deadline with no report: the main chat is told, once. */
  private armDeadlines(): void {
    this.deadlineTimer?.cancel();
    this.deadlineTimer = undefined;
    if (!this.host.on()) return;
    const now = this.host.clock.now();
    let next: number | undefined;
    let changed = false;
    for (const bot of Object.values(this.load().bots)) {
      for (const [threadId, task] of Object.entries(bot.tasks)) {
        if (task.state !== 'working' || task.overdueAt) continue;
        const at = Date.parse(task.deadline);
        if (!Number.isFinite(at)) continue;
        if (at > now) {
          next = next === undefined ? at : Math.min(next, at);
          continue;
        }
        task.overdueAt = this.iso();
        changed = true;
        const view = this.host.thread(threadId);
        const minutes = Math.round((at - Date.parse(task.createdAt)) / 60_000);
        const text = `Task "${view?.title ?? 'A task'}" (thread ${threadId.slice(0, 8)}) has not reported by its deadline (${minutes} min after it started).\nStatus: overdue, ${view ? (view.turnRunning ? 'still working' : 'no turn running (it may be waiting on a job in the background)') : 'its thread has gone'}\nWhat would unblock it: read_thread ${threadId.slice(0, 8)} to see where it is, then wait, send it a message, or stop it with interrupt_thread.`;
        if (bot.main) this.host.tell(bot.main.threadId, text, 'a task is overdue');
      }
    }
    if (changed) this.save();
    if (next !== undefined) this.deadlineTimer = this.host.clock.setTimeout(() => this.armDeadlines(), next - now);
  }

  /** A thread was deleted (Runner.delete): it leaves the record. A deleted main chat leaves the bot with none, for the owner's next chat to become. */
  deleted(threadId: string): void {
    if (!this.host.on() || !fs.existsSync(this.file)) return;
    let changed = false;
    for (const bot of Object.values(this.load().bots)) {
      if (bot.tasks[threadId]) {
        delete bot.tasks[threadId];
        changed = true;
      }
      if (bot.plain[threadId]) {
        delete bot.plain[threadId];
        changed = true;
      }
      if (bot.main?.threadId === threadId) {
        delete bot.main;
        bot.generation += 1;
        changed = true;
      }
    }
    if (!changed) return;
    this.save();
    this.armDeadlines();
  }

  /** What the record holds, for bots.list. Read-only. */
  list(): { on: boolean; managed: { name: string; folder: string; deadlineMinutes: number }[]; bots: (BotRecord & { openTasks: number })[] } {
    const on = this.host.on();
    const managed = this.managed().map((b) => ({ name: b.name, folder: b.folder, deadlineMinutes: b.deadlineMs / 60_000 }));
    const bots = on && fs.existsSync(this.file) ? Object.values(this.load().bots).map((b) => ({ ...structuredClone(b), openTasks: openTasks(b).length })) : [];
    return { on, managed, bots };
  }
}
