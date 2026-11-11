// Bots (experiment `bots`; the page is bots-page.tsx): which projects are
// bots, the sections they go in, each one's row and its look. Nothing here
// touches Convex or the page, so it can be tested alone:
// node --test web/src/bots.test.ts
//
// A bot is a project. With no schema of its own yet, everything it needs
// comes from what the phone's API already carries:
// - It's a bot when one of its folders sits inside a folder named `bots`
//   (".../bots/juno"), and the folder's own name doesn't start with `_` or
//   `.` (so ".../bots/_shared" isn't one, and ".../bots/_test/juno" is).
// - Its section is Business unless its goals have a line "Section: Personal".
// - Its role line is the first other line of its goals.
// - It's pinned while one of its open threads is starred.
// - Its threads are the ones in the project, and any on the bot's own runner
//   whose folder is the bot's own, so a chat started from this page counts
//   before it has joined. The same path on another runner is another
//   machine's folder, and never counts.
import { plain } from './format.ts';

export type BotProject = { runnerId: string; id: string; title: string; folders: string[]; goals: string; archived?: boolean; updatedAt?: string; lastActivityAt?: string };

// The fields of a thread's row (phone:threads) this reads.
export type BotThread = {
  threadId: string;
  runnerId: string;
  title: string;
  cwd: string;
  status: string;
  needsYou: boolean;
  unread: boolean;
  preview: string;
  lastActivityMs: number;
  view?: string;
  archivedAt?: string;
  starredAt?: string;
  working?: string;
  projects?: { id: string }[];
  asks?: { action: string }[];
  pendingApproval?: unknown;
  createdAt?: string;
  // Who started it, when it wasn't the owner: `kind` 'thread' is another
  // thread's agent, which is what makes it a task (isTask).
  startedBy?: { kind: string; label?: string };
};

export type Section = 'business' | 'personal';
export type BotStatus = 'needs' | 'working' | 'failed' | 'idle';

// A bot's avatar is a robot head, our own drawing (bots-avatar.tsx): what's
// on top, the head's outline, the eyes in its visor, and a colour. Each is
// picked apart from the others.
export const TOPS = ['antenna', 'pods', 'feelers', 'none'] as const;
export const HEADS = ['square', 'wide', 'dome'] as const;
export const VISORS = ['round', 'bar', 'smile'] as const;
// Fills from the design spec's hues. `black` turns to near-white in dark
// (bots.css), as a black head on a black list can't be seen.
export const COLORS = { black: '#1c1c1c', red: '#e72e3b', orange: '#ee620d', amber: '#da830e', green: '#10ab61', cyan: '#10a693', blue: '#1680f3', violet: '#8351e4', magenta: '#e52f8b', gray: '#7d7d82', brown: '#9d6937' } as const;
export type Color = keyof typeof COLORS;
export type Look = { top: (typeof TOPS)[number]; head: (typeof HEADS)[number]; visor: (typeof VISORS)[number]; color: Color };

export type Bot = {
  // The project's id, which is also what the page's address carries.
  id: string;
  runnerId: string;
  title: string;
  role: string;
  folder: string;
  section: Section;
  pinned: boolean;
  look: Look;
  status: BotStatus;
  // One line under the name: what it's asking, what it's doing, or the start
  // of its last reply.
  line: string;
  unread: number;
  // When it was last active, for the row's time and the order.
  at: number;
  // Its main chat, which is the chat a click opens (mainChat): never a task.
  threadId?: string;
  // Its open tasks (threads its agent started) waiting on you, and working.
  // Counted apart from the main chat, so neither is counted twice.
  tasksWaiting: number;
  tasksWorking: number;
};

/**
 * Only what the page uses of a project. phone:project also carries its
 * notes, state and icon, which can be long and are nothing to do with
 * this page, so they're dropped before anything is kept.
 */
export function slimProject(p: BotProject): BotProject {
  return { runnerId: p.runnerId, id: p.id, title: p.title, folders: [...p.folders], goals: p.goals, ...(p.archived ? { archived: true } : {}), ...(p.updatedAt ? { updatedAt: p.updatedAt } : {}), ...(p.lastActivityAt ? { lastActivityAt: p.lastActivityAt } : {}) };
}

const segments = (path: string) => path.split('/').filter(Boolean);

/** The first of a project's folders that makes it a bot, if any. */
export function botFolder(folders: string[]): string | undefined {
  return folders.find((f) => {
    const parts = segments(f);
    const name = parts.at(-1) ?? '';
    return parts.slice(0, -1).includes('bots') && !/^[_.]/.test(name);
  });
}

const SECTION_LINE = /^\s*section\s*:\s*(business|personal)\s*\.?\s*$/i;

export function sectionOf(goals: string): Section {
  for (const line of goals.split('\n')) {
    const m = line.match(SECTION_LINE);
    if (m) return m[1]!.toLowerCase() as Section;
  }
  return 'business';
}

/** A bot's role: the first line of its goals that isn't the section line. */
export function roleOf(goals: string): string {
  for (const line of goals.split('\n')) {
    if (SECTION_LINE.test(line)) continue;
    const text = plain(line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, ''));
    if (text) return text;
  }
  return '';
}

// FNV-1a: the same key always gives the same number, on any device.
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A bot's look, from its project's id until one can be picked and saved. */
export function lookOf(key: string): Look {
  const h = hash(key);
  const colors = Object.keys(COLORS) as Color[];
  return { top: TOPS[h % 4]!, head: HEADS[Math.floor(h / 4) % 3]!, visor: VISORS[Math.floor(h / 12) % 3]!, color: colors[Math.floor(h / 36) % colors.length]! };
}

const busy = (t: { status: string }) => t.status === 'running' || t.status === 'starting';
const inside = (path: string, folder: string) => path === folder || path.startsWith(folder.replace(/\/+$/, '') + '/');

export const isLive = (t: { archivedAt?: string; view?: string }) => !t.archivedAt && t.view !== 'den';

type BotKey = { id: string; runnerId: string; folder: string };

/** Whether a thread is one of a bot's: in its project, or in its folder on its runner. */
export function belongs(bot: BotKey, t: BotThread): boolean {
  return !!t.projects?.some((p) => p.id === bot.id) || (t.runnerId === bot.runnerId && inside(t.cwd, bot.folder));
}

/** A bot's threads out of these, newest first. */
export function threadsOf<T extends BotThread>(bot: BotKey, threads: T[]): T[] {
  const seen = new Set<string>();
  return threads
    .filter((t) => {
      if (seen.has(t.threadId) || !belongs(bot, t)) return false;
      seen.add(t.threadId);
      return true;
    })
    .sort((a, b) => b.lastActivityMs - a.lastActivityMs);
}

/**
 * A task: a thread another thread's agent started, as a bot does when it
 * hands a job to the background. With today's data that's all that marks
 * one, so a thread the owner started by hand is never a task, whatever it
 * was for.
 */
export const isTask = (t: BotThread) => t.startedBy?.kind === 'thread';

const born = (t: BotThread) => {
  const at = Date.parse(t.createdAt ?? '');
  return Number.isFinite(at) ? at : t.lastActivityMs;
};

/**
 * A bot's main chat: of its open threads that aren't tasks, the starred one
 * if there is one, else the oldest. Nothing is stored for this yet, so it has
 * to be a rule that gives the same answer on every reload: the newest thread
 * doesn't, as every task a bot starts, and every new chat, would take the
 * place over. The oldest stays the oldest; a star is how the owner names
 * another. Between two starred, or two as old as each other, the older, then
 * the lower id.
 */
export function mainChat<T extends BotThread>(bot: BotKey, threads: T[]): T | undefined {
  const mine = threadsOf(bot, threads).filter((t) => isLive(t) && !isTask(t));
  const starred = mine.filter((t) => !!t.starredAt);
  return (starred.length ? starred : mine).sort((a, b) => born(a) - born(b) || a.threadId.localeCompare(b.threadId))[0];
}

/**
 * The chat to show for a bot: the one already open (`held`) while it's still
 * one of the bot's open chats, so it doesn't change under what's being typed;
 * else its main chat. Never a task: those are opened by name, from the list.
 */
export function chatFor(bot: BotKey, threads: BotThread[], held?: string): string | undefined {
  const chats = threadsOf(bot, threads).filter((t) => isLive(t) && !isTask(t));
  return held && chats.some((t) => t.threadId === held) ? held : mainChat(bot, threads)?.threadId;
}

/** A bot's tasks out of these, newest first, each once. Archived ones too. */
export function tasksOf<T extends BotThread>(bot: BotKey, threads: T[]): T[] {
  return threadsOf(bot, threads).filter(isTask);
}

export type TaskStatus = 'needs' | 'working' | 'failed' | 'finished';

/**
 * What a task's row says, from the thread's own state. `finished` is every
 * task that isn't working, waiting or failed, which today includes one that
 * was stopped: a stopped turn ends the same way a finished one does, and
 * nothing the website is given tells them apart.
 */
export function taskStatus(t: BotThread): TaskStatus {
  if (t.needsYou || !!t.pendingApproval) return 'needs';
  if (busy(t)) return 'working';
  return t.status === 'error' ? 'failed' : 'finished';
}

/**
 * One press at a time for each key (a thread's Stop): a press while that
 * key's is still going, or has gone and not been released, does nothing, so
 * Stop pressed twice sends one stop. `release` lets it be pressed again
 * (the thread stopped, or was started again); a failed press releases itself.
 */
export function latchPerKey<K>(run: (key: K) => Promise<unknown>): { press: (key: K) => Promise<'sent' | 'ignored' | 'failed'>; held: (key: K) => boolean; release: (key: K) => void } {
  const latched = new Set<K>();
  return {
    async press(key) {
      if (latched.has(key)) return 'ignored';
      latched.add(key);
      try {
        await run(key);
        return 'sent';
      } catch {
        latched.delete(key);
        return 'failed';
      }
    },
    held: (key) => latched.has(key),
    release: (key) => void latched.delete(key),
  };
}

/**
 * A chat named in the address, judged from its row as it is now: `row` is
 * undefined until it's known and null when there's no such thread. It's
 * shown only while it's one of the bot's, so a thread moved to another
 * project stops being shown under this bot's name.
 */
export function namedChat(bot: BotKey, row: BotThread | null | undefined): 'checking' | 'ok' | 'no' {
  if (row === undefined) return 'checking';
  return row && belongs(bot, row) ? 'ok' : 'no';
}

/**
 * Which projects to watch live: the selected bot first, whatever the cap,
 * then the others up to `most`. The selected one is where a message or a
 * new chat goes, so it must never be the one left unwatched.
 */
export function watchKeys(selected: string | undefined, bots: string[], most: number): string[] {
  const out = selected ? [selected] : [];
  for (const key of bots) {
    if (out.length >= Math.max(most, out.length ? 1 : 0)) break;
    if (key !== selected) out.push(key);
  }
  return out;
}

/**
 * The folder a new chat for a bot starts in, from the project as the live
 * query has it right now. Undefined while that isn't known (`live`
 * undefined), or if the project has gone or is no longer a bot: a chat is
 * never started from a folder read earlier.
 */
export function startFolder(live: BotProject | null | undefined): string | undefined {
  return live && !live.archived ? botFolder(live.folders) : undefined;
}

/**
 * The selected bot's project as its live query answers: still checking, an
 * answer (null: the project has gone), or failed. A failure is not an
 * answer, so nothing can be started from it; the page says so and offers to
 * try again, rather than sitting at "checking".
 */
export function liveOf(answer: BotProject | null | Error | undefined): { state: 'checking' } | { state: 'failed' } | { state: 'known'; project: BotProject | null } {
  if (answer === undefined) return { state: 'checking' };
  if (answer instanceof Error) return { state: 'failed' };
  return { state: 'known', project: answer };
}

/**
 * Whether an error is the page's own code failing to arrive (offline, or the
 * site was updated since the tab opened), going by what browsers say for a
 * failed import. Anything else is a fault in the page, and is worded as one.
 */
export function isLoadFailure(error: unknown): boolean {
  const e = error as { name?: unknown; message?: unknown } | null;
  const text = `${typeof e?.name === 'string' ? e.name : ''} ${typeof e?.message === 'string' ? e.message : String(error)}`;
  return /ChunkLoadError|dynamically imported module|Importing a module script failed|Unable to preload/i.test(text);
}

/**
 * Lets one call through at a time: a second while the first is still going
 * is dropped (`ran: false`), so a double click or a held Return can't start
 * the same thing twice. A failure frees it for the next try.
 */
export function singleFlight<A extends unknown[], R>(run: (...args: A) => Promise<R>): (...args: A) => Promise<{ ran: true; value: R } | { ran: false }> {
  let going = false;
  return async (...args) => {
    if (going) return { ran: false };
    going = true;
    try {
      return { ran: true, value: await run(...args) };
    } finally {
      going = false;
    }
  };
}

/** The chat a click on the bot opens: its newest thread that isn't archived. */
export function newestLive<T extends BotThread>(threads: T[]): T | undefined {
  return threads.filter(isLive).sort((a, b) => b.lastActivityMs - a.lastActivityMs)[0];
}

const waiting = (t: BotThread) => t.needsYou || !!t.pendingApproval;

/** What the row's dot says, from the bot's open threads: needs you wins. */
export function statusOf(live: BotThread[]): BotStatus {
  if (live.some(waiting)) return 'needs';
  if (live.some(busy)) return 'working';
  return newestLive(live)?.status === 'error' ? 'failed' : 'idle';
}

/** The one line under the name. No model writes it: it's the thread's own. */
export function lineOf(live: BotThread[]): string {
  const asking = live.filter(waiting).sort((a, b) => b.lastActivityMs - a.lastActivityMs)[0];
  if (asking) return plain(asking.asks?.[0]?.action ?? '') || 'Waiting for your answer';
  const working = live.filter(busy).sort((a, b) => b.lastActivityMs - a.lastActivityMs)[0];
  if (working) return plain(working.working ?? '') || 'Working';
  const newest = newestLive(live);
  if (!newest) return 'No open chat';
  if (newest.status === 'error') return 'The last turn failed';
  return plain(newest.preview) || newest.title || 'No messages yet';
}

const count = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`);

/**
 * The row's line: the main chat's own (lineOf), unless the main chat has
 * nothing pressing and its tasks do. A main chat that's asking always wins,
 * as it's what a click opens.
 */
export function botLine(main: BotThread | undefined, tasksWaiting: number, tasksWorking: number, chatsWaiting = 0): string {
  const own = lineOf(main ? [main] : []);
  if (main && (waiting(main) || (busy(main) && !tasksWaiting))) return own;
  if (tasksWaiting) return count(tasksWaiting, 'task needs you', 'tasks need you');
  // Another of its chats, not the main one: say so, or the amber mark would sit beside the main chat's words.
  if (chatsWaiting) return count(chatsWaiting, 'other chat needs you', 'other chats need you');
  if (tasksWorking) return `Working on ${count(tasksWorking, 'task', 'tasks')}`;
  return own;
}

export type BotLists = { pinned: Bot[]; business: Bot[]; personal: Bot[] };

/** Every bot among these projects, in the lists the page shows. */
export function buildBots(projects: BotProject[], threads: BotThread[]): BotLists {
  const out: BotLists = { pinned: [], business: [], personal: [] };
  const seen = new Set<string>();
  for (const p of projects) {
    const folder = botFolder(p.folders);
    if (!folder || p.archived || seen.has(p.id)) continue;
    seen.add(p.id);
    const key = { id: p.id, runnerId: p.runnerId, folder };
    const live = threadsOf(key, threads).filter(isLive);
    const main = mainChat(key, threads);
    const tasks = live.filter(isTask);
    const tasksWaiting = tasks.filter(waiting).length;
    const tasksWorking = tasks.filter((t) => !waiting(t) && busy(t)).length;
    const newest = live[0];
    const last = Date.parse(p.lastActivityAt ?? p.updatedAt ?? '');
    const bot: Bot = {
      id: p.id,
      runnerId: p.runnerId,
      title: p.title,
      role: roleOf(p.goals),
      folder,
      section: sectionOf(p.goals),
      pinned: live.some((t) => !!t.starredAt),
      look: lookOf(p.id),
      status: statusOf(live),
      line: botLine(main, tasksWaiting, tasksWorking, live.filter((t) => !isTask(t) && t.threadId !== main?.threadId && waiting(t)).length),
      unread: live.filter((t) => t.unread).length,
      at: newest?.lastActivityMs ?? (Number.isFinite(last) ? last : 0),
      ...(main ? { threadId: main.threadId } : {}),
      tasksWaiting,
      tasksWorking,
    };
    (bot.pinned ? out.pinned : out[bot.section]).push(bot);
  }
  // Waiting on you first, then whoever spoke last. Pinned ones keep to their
  // names, so a tile doesn't move under the pointer.
  const order = (a: Bot, b: Bot) => Number(b.status === 'needs') - Number(a.status === 'needs') || b.at - a.at || a.title.localeCompare(b.title);
  out.business.sort(order);
  out.personal.sort(order);
  out.pinned.sort((a, b) => a.title.localeCompare(b.title));
  return out;
}

export const allBots = (lists: BotLists): Bot[] => [...lists.pinned, ...lists.business, ...lists.personal];

// ------------------------------------------------------------ the list's own controls

/** The bots whose name, role or latest line has these words. */
export function matchBots(lists: BotLists, query: string): BotLists {
  const q = query.trim().toLowerCase();
  if (!q) return lists;
  const has = (b: Bot) => [b.title, b.role, b.line].some((x) => x.toLowerCase().includes(q));
  return { pinned: lists.pinned.filter(has), business: lists.business.filter(has), personal: lists.personal.filter(has) };
}

// Which sections are folded, kept in this browser ('["personal"]').
export const BOTS_FOLDED_KEY = 'threadbear.botsFolded';

export function readFoldedBots(saved: string | null): Set<Section> {
  try {
    const list: unknown = JSON.parse(saved ?? '[]');
    return new Set(Array.isArray(list) ? list.filter((x): x is Section => x === 'business' || x === 'personal') : []);
  } catch {
    return new Set();
  }
}

export function toggleFolded(folded: Set<Section>, section: Section): Set<Section> {
  const next = new Set(folded);
  if (!next.delete(section)) next.add(section);
  return next;
}

// ------------------------------------------------------------ the library

// What the website is given of a chat's files today: its pictures
// (phone:images). Pages, files and links stay on the Mac, so the Library has
// no chips for them. Nor one for Pinned yet: the API marks a pinned picture,
// but leaves the mark off one that is also shown in a reply
// (convex/share.ts, replyImagesFrom), so a Pinned list made here would
// silently miss pictures. That needs the backend to keep the pin.
export type LibraryPicture = { seq: number; url: string; pinned?: boolean; src?: string };
export type LibraryChip = 'media';

/** A chat's pictures for the Library, newest first, each once. */
export function libraryOf(images: LibraryPicture[]): Record<LibraryChip, LibraryPicture[]> {
  const seen = new Set<string>();
  const media = [...images]
    .sort((a, b) => b.seq - a.seq)
    .filter((p) => {
      if (!p.url || seen.has(p.url)) return false;
      seen.add(p.url);
      return true;
    });
  return { media };
}

/** The chips to show: only the ones with something real behind them. */
export function libraryChips(library: Record<LibraryChip, LibraryPicture[]>): LibraryChip[] {
  return (['media'] as const).filter((chip) => library[chip].length > 0);
}

// ------------------------------------------------------------ a card in the conversation

/**
 * Whether the conversation should scroll to keep its card (a question or an
 * approval, with its buttons) in view after the card changed or its size
 * did. Yes for a new or replaced card, as it's waiting on an answer. For
 * the same card growing or shrinking (Details opened), only if the reader
 * was at the bottom before it did: `distance` is how far from the bottom
 * they are now, `grew` how much taller the card just got. Someone who has
 * scrolled up to read is left where they are.
 */
export function followCard(change: { replaced: boolean; distance: number; grew: number }): boolean {
  if (change.replaced) return true;
  return change.distance - Math.max(0, change.grew) <= 80;
}

// ------------------------------------------------------------ dictation and Send

export type MicState = 'idle' | 'listening' | 'stopping';

/**
 * Whether Send waits for the mic. While it's listening, or has been told to
 * stop and hasn't yet said it has, words may still be on their way: sending
 * then would leave them out of the message and drop them into the next
 * one. So Send is held until the mic is idle.
 */
export function micHolds(state: MicState): boolean {
  return state !== 'idle';
}

/**
 * Which button the message box shows. Stop while a turn is running and
 * there's nothing to send, as everywhere on the site; and also while Send
 * is held by the mic, since a held Send can't be pressed and the turn must
 * still be stoppable. `held` is only ever true in a bot's chat.
 */
export function sendOrStop(box: { busy: boolean; ready: boolean; held: boolean }): 'send' | 'stop' {
  return box.busy && (!box.ready || box.held) ? 'stop' : 'send';
}

/** An approval's buttons in the order they're shown and tabbed through: the one that allows it last. */
export function approvalOrder(options: string[]): string[] {
  return [...options].sort((a, b) => Number(a === 'allow') - Number(b === 'allow'));
}

// ------------------------------------------------------------ the chat's date lines

/**
 * The centred line above a message when it's the first shown, or the first
 * of a new day: "Today 8:39 AM", "Yesterday 8:39 AM", "Mon 3 Nov, 8:39 AM".
 * Undefined when the message before it was on the same day.
 */
export function dayLine(at: string, before: string | undefined, now: number): string | undefined {
  const day = (ms: number) => {
    const d = new Date(ms);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  };
  const mine = Date.parse(at);
  if (!Number.isFinite(mine)) return undefined;
  if (before !== undefined && Number.isFinite(Date.parse(before)) && day(Date.parse(before)) === day(mine)) return undefined;
  const time = new Date(mine).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const days = Math.round((day(now) - day(mine)) / 86_400_000);
  if (days === 0) return `Today ${time}`;
  if (days === 1) return `Yesterday ${time}`;
  return `${new Date(mine).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}, ${time}`;
}

// ------------------------------------------------------------ dictation

/**
 * Whether this browser can turn speech into text on the device itself,
 * given its SpeechRecognition constructor (undefined where there is none).
 * Only then is the mic shown: a browser that can only do it by sending the
 * audio to a server doesn't count, as nothing said to a bot should leave
 * the machine that way.
 */
export async function canDictateHere(Recognition: unknown, lang: string): Promise<boolean> {
  const available = (Recognition as { available?: (options: { langs: string[]; processLocally: boolean }) => Promise<string> } | undefined)?.available;
  if (typeof available !== 'function') return false;
  try {
    return (await available.call(Recognition, { langs: [lang], processLocally: true })) === 'available';
  } catch {
    return false;
  }
}

// ------------------------------------------------------------ the address

// "/bots/<projectId>" is a bot's newest chat, "/bots/<projectId>~<threadId>"
// one of its others.
export function readBotId(id: string | undefined): { botId?: string; threadId?: string } {
  if (!id) return {};
  const at = id.indexOf('~');
  return at < 0 ? { botId: id } : { botId: id.slice(0, at), ...(id.slice(at + 1) ? { threadId: id.slice(at + 1) } : {}) };
}

export function botPath(botId?: string, threadId?: string): string {
  if (!botId) return '/bots';
  return `/bots/${encodeURIComponent(threadId ? `${botId}~${threadId}` : botId)}`;
}

// ------------------------------------------------------------ the switch

// The page is an experiment, off unless this browser has turned it on: the
// website has no way to read runner.json, so its switch is kept here.
// "?experiment=bots" on any address turns it on, "?experiment=bots-off" off.
export const BOTS_KEY = 'threadbear.experiments.bots';

export function botsSwitch(search: string, saved: string | null): { on: boolean; save?: '1' | '0' } {
  const asked = new URLSearchParams(search).get('experiment');
  if (asked === 'bots') return { on: true, save: '1' };
  if (asked === 'bots-off') return { on: false, save: '0' };
  return { on: saved === '1' };
}

export function botsOn(): boolean {
  const { on, save } = botsSwitch(location.search, localStorage.getItem(BOTS_KEY));
  if (save && localStorage.getItem(BOTS_KEY) !== save) localStorage.setItem(BOTS_KEY, save);
  return on;
}
