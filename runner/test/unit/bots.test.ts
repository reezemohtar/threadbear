// The managed bots' record (src/bots.ts, experiment `bots`): its rules alone,
// then the record kept by a real Runner on a fake CLI, as wait-for.test.ts
// does for waits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Bots, BOTS_FILE, FINAL_BATCH_MS, OPEN_TASK_CAP, botName, openTasks, parseState, readManaged, reportKind, reportText, runnerHost, type BotRecord, type BotsState } from '../../src/bots.ts';
import { makeHarness, tick, tmpDir, type Harness } from '../helpers/fakes.ts';

const END_TURN = 'mcp__threadbear__end_turn';

// ------------------------------------------------------------ the rules

test('bots: a folder is a bot by the same rule as the website, from one list of cases', () => {
  // web/src/bots.test.ts reads the same file against botFolder, so the two copies of the rule can't drift.
  const cases = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '../../../web/src/bots-folders.json'), 'utf8')) as { folder: string; bot: string | null }[];
  assert.ok(cases.length >= 8);
  for (const c of cases) assert.equal(botName(c.folder) ?? null, c.bot, c.folder);
});

test('bots: only what runner.json lists is managed, and only folders that can be bots', () => {
  const same = (p: string) => p;
  assert.deepEqual(readManaged(undefined, same), []);
  assert.deepEqual(readManaged({ bots: {} }, same), []);
  assert.deepEqual(readManaged({ bots: { managed: 'all' } }, same), [], 'never everything');
  const managed = readManaged({ bots: { managed: [{ folder: '/s/bots/juno', deadlineMinutes: 2 }, '/s/bots/wren/', { folder: '/s/dev/site' }, { folder: '/s/bots/_shared' }, { folder: '/s/bots/juno' }, { folder: '/t/bots/juno' }, 7, null, { folder: '' }] } }, same);
  assert.deepEqual(managed, [
    { name: 'juno', folder: '/s/bots/juno', deadlineMs: 2 * 60_000 },
    { name: 'wren', folder: '/s/bots/wren', deadlineMs: 120 * 60_000 },
  ]);
  assert.equal(readManaged({ bots: { managed: [{ folder: '/s/bots/a', deadlineMinutes: -5 }] } }, same)[0]!.deadlineMs, 120 * 60_000, 'a deadline that makes no sense is the default');
});

test('bots: a report is how the turn ended, and still-going is no report', () => {
  const end = (over: Partial<Parameters<typeof reportKind>[0]>) => reportKind({ outcome: 'completed', needsYou: false, finished: false, turnRunning: false, ...over });
  assert.equal(end({ outcome: 'interrupted', finished: true }), 'stopped', 'stopped is never final');
  assert.equal(end({ outcome: 'failed', needsYou: true }), 'failed');
  assert.equal(end({ needsYou: true, finished: true }), 'needs-you');
  assert.equal(end({ finished: true }), 'final');
  assert.equal(end({ finished: true, turnRunning: true }), undefined, 'a queued message started its next turn');
  assert.equal(end({}), undefined, 'a job in the background, a wait of its own: progress');
});

test('bots: a report reads as status, result, evidence and what would unblock it', () => {
  const text = reportText({ threadId: 'abcdef12-0000', title: 'Check the venues' }, { id: 'r-1', kind: 'failed', at: '2026-11-12T00:00:00.000Z', reply: 'Could not reach the site.', evidence: [{ kind: 'file', title: 'venues.md', where: '/s/bots/juno/venues.md' }] });
  assert.match(text, /^Task "Check the venues" \(thread abcdef12\)\nStatus: failed\nResult: Could not reach the site\.\nEvidence \(found by Threadbear in the task's own record; reported, not verified\):\n- file: venues\.md \(\/s\/bots\/juno\/venues\.md\)\nWhat would unblock it: read_thread abcdef12/);
  assert.match(text, /Report r-1$/);
  assert.match(reportText({ threadId: 'abcdef12', title: 'T' }, { id: 'r', kind: 'final', at: '', evidence: [] }), /Result: \(it gave no reply\)\n[^\n]*\n- none found\nWhat would unblock it: Nothing/);
});

test('bots: a file that is not whole is never read as a record', () => {
  const good: BotsState = { version: 1, bots: { juno: { name: 'juno', folder: '/s/bots/juno', generation: 1, main: { threadId: 'm', generation: 1 }, tasks: { t: { parentThreadId: 'm', generation: 1, state: 'working', createdAt: 'a', deadline: 'b', lastActivityAt: 'a' } }, plain: {} } } };
  const text = JSON.stringify(good);
  assert.deepEqual(parseState(text), good);
  for (let cut = 1; cut < text.length; cut += 7) assert.equal(parseState(text.slice(0, cut)), undefined, `cut at ${cut}`);
  assert.equal(parseState('{}'), undefined);
  assert.equal(parseState(JSON.stringify({ version: 2, bots: {} })), undefined);
  assert.equal(parseState(JSON.stringify({ version: 1, bots: { juno: { name: 'juno' } } })), undefined);
  assert.equal(parseState(JSON.stringify({ version: 1, bots: { juno: { ...good.bots.juno, tasks: { t: { state: 'working' } } } } })), undefined);
});

// ------------------------------------------------------------ with a runner

type Kit = ReturnType<typeof setup>;

// A scratch folder with two bots in it, a runner whose runner.json lists
// them (or not), and the pieces a test plays a thread with.
function setup(opts: { on?: boolean; managed?: boolean; home?: string; scratch?: string } = {}) {
  const home = opts.home ?? tmpDir();
  const scratch = opts.scratch ?? tmpDir();
  const juno = path.join(scratch, 'bots', 'juno');
  const wren = path.join(scratch, 'bots', 'wren');
  const elsewhere = path.join(scratch, 'dev', 'site');
  for (const d of [juno, wren, elsewhere]) fs.mkdirSync(d, { recursive: true });
  if (!opts.home) {
    fs.writeFileSync(path.join(home, 'runner.json'), JSON.stringify({ experiments: { bots: opts.on ?? true }, ...(opts.managed === false ? {} : { bots: { managed: [{ folder: juno, deadlineMinutes: 2 }, { folder: wren }] } }) }));
  }
  let h!: Harness;
  const clock = { now: () => h.clock.now(), setTimeout: (fn: () => void, ms: number) => h.clock.setTimeout(fn, ms) };
  const bots = new Bots(runnerHost(() => h.runner, home, clock));
  h = makeHarness(home, {}, { bots });
  bots.start();
  const file = path.join(home, BOTS_FILE);
  const record = (): BotsState | undefined => (fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')) as BotsState) : undefined);
  const session = (id: string) => h.adapter.sessions.filter((s) => s.opts.threadId === id).at(-1)!;
  // The owner starts a chat; its first turn is left running unless ended.
  const chat = (cwd: string, text = 'Hello') => h.runner.create({ text, accountId: 'claude-3', cwd, worktree: false }).thread.id;
  // A thread starts one, as create_thread does.
  const startedBy = (parent: string, cwd: string, text = 'Do the job') => h.runner.create({ text, accountId: 'claude-3', cwd, worktree: false, startedBy: { kind: 'thread', label: 'Agent', threadId: parent } }).thread.id;
  // Ends the turn a thread is on: with end_turn's needs, or as the CLI says it ended.
  const end = async (id: string, how: 'nothing' | 'you' | 'failed' | 'interrupted' | 'no end_turn', reply = 'Done.', extra: Record<string, unknown> = {}) => {
    const s = session(id);
    s.init();
    if (how === 'interrupted') {
      h.runner.interrupt(id);
      await tick();
      s.result('interrupted');
    } else if (how === 'failed') s.result('failed', undefined, 'The model stopped answering.');
    else {
      if (how !== 'no end_turn') s.out({ kind: 'event', event: { type: 'tool.call', itemId: `e-${id}`, name: END_TURN, kind: 'mcp', title: 'end_turn', input: { needs: how, ...extra } } });
      s.text(`m-${id}`, reply);
      s.result();
    }
    await tick();
  };
  // What the runner itself has sent a thread.
  const told = (id: string) => h.events(id).filter((e) => e.type === 'user.message' && e.origin === 'runner').map((e) => e.text as string);
  const bot = (name = 'juno'): BotRecord | undefined => record()?.bots[name];
  return { h, home, scratch, juno, wren, elsewhere, bots, file, record, bot, session, chat, startedBy, end, told };
}

// A bot with its main chat idle, ready to start tasks.
async function withMain(k: Kit): Promise<string> {
  const main = k.chat(k.juno);
  await k.end(main, 'nothing', 'Ready.');
  return main;
}

const steps = (h: Harness, id: string) => h.events(id).map((e) => e.type + (e.type === 'turn.completed' ? `:${e.outcome}` : ''));

test('bots: with the experiment off nothing is recorded and threads behave as they did', async () => {
  // The same create, turn end, task, stop and delete, with the module there but off, and with no module.
  const play = async (k: Pick<Kit, 'h' | 'chat' | 'startedBy' | 'end'> & { juno: string }) => {
    const main = k.chat(k.juno);
    await k.end(main, 'nothing');
    const task = k.startedBy(main, k.juno);
    await k.end(task, 'interrupted');
    const other = k.startedBy(main, k.juno);
    await k.end(other, 'failed');
    k.h.clock.advance(10 * 60_000);
    const seen = [steps(k.h, main), steps(k.h, task), steps(k.h, other), k.h.runner.get(main).status, k.h.runner.get(task).status];
    k.h.runner.delete(task);
    return { seen: JSON.stringify(seen), main };
  };
  const off = setup({ on: false });
  const withOff = await play(off);
  assert.equal(fs.existsSync(off.file), false, 'no bots.json');
  assert.deepEqual(off.bots.list(), { on: false, managed: [], bots: [] });
  assert.deepEqual(off.told(withOff.main), [], 'the main chat is told nothing');

  // A runner built with no bots module at all.
  const home = tmpDir();
  const h = makeHarness(home);
  const juno = off.juno;
  const session = (id: string) => h.adapter.sessions.filter((s) => s.opts.threadId === id).at(-1)!;
  const bare = await play({
    h,
    juno,
    chat: (cwd) => h.runner.create({ text: 'Hello', accountId: 'claude-3', cwd, worktree: false }).thread.id,
    startedBy: (parent, cwd) => h.runner.create({ text: 'Do the job', accountId: 'claude-3', cwd, worktree: false, startedBy: { kind: 'thread', label: 'Agent', threadId: parent } }).thread.id,
    end: async (id, how) => {
      const s = session(id);
      s.init();
      if (how === 'interrupted') {
        h.runner.interrupt(id);
        await tick();
        s.result('interrupted');
      } else if (how === 'failed') s.result('failed', undefined, 'The model stopped answering.');
      else {
        s.out({ kind: 'event', event: { type: 'tool.call', itemId: `e-${id}`, name: END_TURN, kind: 'mcp', title: 'end_turn', input: { needs: how } } });
        s.text(`m-${id}`, 'Done.');
        s.result();
      }
      await tick();
    },
  });
  assert.equal(withOff.seen, bare.seen, 'event for event the same');
});

test('bots: a bot that is not listed is ignored, even with the experiment on', async () => {
  const k = setup({ managed: false });
  const main = k.chat(k.juno);
  await k.end(main, 'nothing');
  const task = k.startedBy(main, k.juno);
  await k.end(task, 'failed');
  assert.equal(fs.existsSync(k.file), false);
  assert.deepEqual(k.told(main), []);
  assert.deepEqual(k.bots.list(), { on: true, managed: [], bots: [] });
  // And a folder that isn't a bot's at all, on a runner that does list bots.
  const listed = setup();
  listed.chat(listed.elsewhere);
  assert.equal(fs.existsSync(listed.file), false);
});

test("bots: the owner's first chat in a bot's folder becomes its main chat, and a second does not move it", async () => {
  const k = setup();
  const main = k.chat(k.juno);
  assert.deepEqual(k.bot()?.main, { threadId: main, generation: 1 });
  assert.equal(k.bot()?.folder, k.juno);
  await k.end(main, 'nothing');
  const second = k.chat(k.juno, 'Another chat');
  assert.deepEqual(k.bot()?.main, { threadId: main, generation: 1 }, 'the pointer stays');
  assert.equal(k.bot()?.tasks[second], undefined);
  assert.equal(k.bot()?.plain[second], undefined, "the owner's other chat is neither a task nor a helper");
  // The other bot has its own.
  const wrenMain = k.chat(k.wren);
  assert.equal(k.bot('wren')?.main?.threadId, wrenMain);
  // A thread a schedule starts in the folder is not the owner's chat.
  const fresh = setup();
  fresh.h.runner.create({ text: 'Morning check', accountId: 'claude-3', cwd: fresh.juno, worktree: false, origin: 'schedule', scheduleId: 's1' });
  assert.equal(fresh.bot(), undefined);
});

test("bots: a thread the main chat starts in the bot's folder is a task; a task's own helper and another bot's thread are not", async () => {
  const k = setup();
  const main = await withMain(k);
  const task = k.startedBy(main, k.juno);
  const t = k.bot()!.tasks[task]!;
  assert.equal(t.parentThreadId, main);
  assert.equal(t.generation, 1);
  assert.equal(t.state, 'working');
  assert.equal(Date.parse(t.deadline) - k.h.clock.now(), 2 * 60_000, "the bot's own deadline, saved at creation");
  // One level only: what a task starts is known, and plain.
  const helper = k.startedBy(task, k.juno);
  assert.equal(k.bot()!.tasks[helper], undefined);
  assert.deepEqual(k.bot()!.plain[helper]?.parentThreadId, task);
  // Another bot's main chat starts a thread in this bot's folder: not this bot's task.
  const wrenMain = k.chat(k.wren);
  const visitor = k.startedBy(wrenMain, k.juno);
  assert.equal(k.bot()!.tasks[visitor], undefined);
  assert.equal(k.bot()!.plain[visitor]?.parentThreadId, wrenMain);
  assert.equal(k.bot('wren')!.tasks[visitor], undefined, 'nor a task of the bot that started it: it is not in that bot\'s folder');
  // The main chat starting a thread somewhere else: not a task either.
  const away = k.startedBy(main, k.elsewhere);
  assert.equal(JSON.stringify(k.record()).includes(away), false);
  // Deleting a task takes it out of the record.
  k.h.runner.delete(task);
  assert.equal(k.bot()!.tasks[task], undefined);
});

test('bots: a finished task reports final to the main chat, with the reply and what it made', async () => {
  const k = setup();
  const main = await withMain(k);
  const task = k.startedBy(main, k.juno, 'Compare the venues');
  await k.end(task, 'nothing', 'Three venues fit. The notes are in venues.md.');
  const report = k.bot()!.tasks[task]!.report!;
  assert.equal(report.kind, 'final');
  assert.equal(k.bot()!.tasks[task]!.state, 'final');
  assert.match(report.reply ?? '', /Three venues fit/);
  assert.ok(Array.isArray(report.evidence));
  assert.match(report.id, /^[0-9a-f-]{36}$/);
  assert.deepEqual(k.told(main), [], 'an ordinary finish waits a moment for others');
  k.h.clock.advance(FINAL_BATCH_MS);
  const [text, ...more] = k.told(main);
  assert.deepEqual(more, []);
  assert.match(text!, /^One of your tasks has reported\./);
  assert.match(text!, new RegExp(`Task ".*" \\(thread ${task.slice(0, 8)}\\)\\nStatus: finished\\nResult: Three venues fit`));
  assert.match(text!, /reported, not verified/);
  assert.ok(text!.includes(`Report ${report.id}`));
  assert.equal(k.bot()!.tasks[task]!.report!.delivered, 'main');
});

test('bots: two tasks that end together are both recorded and both told, in one message', async () => {
  const k = setup();
  const main = await withMain(k);
  const a = k.startedBy(main, k.juno, 'Job A');
  const b = k.startedBy(main, k.juno, 'Job B');
  // Both turns end before anything else runs.
  for (const [id, reply] of [[a, 'A is done.'], [b, 'B is done.']] as const) {
    const s = k.session(id);
    s.init();
    s.out({ kind: 'event', event: { type: 'tool.call', itemId: `e-${id}`, name: END_TURN, kind: 'mcp', title: 'end_turn', input: { needs: 'nothing' } } });
    s.text(`m-${id}`, reply);
    s.result();
  }
  await tick();
  const tasks = k.bot()!.tasks;
  assert.equal(tasks[a]!.report!.kind, 'final');
  assert.equal(tasks[b]!.report!.kind, 'final');
  assert.notEqual(tasks[a]!.report!.id, tasks[b]!.report!.id);
  assert.match(tasks[a]!.report!.reply!, /A is done/);
  assert.match(tasks[b]!.report!.reply!, /B is done/, 'neither wrote over the other');
  k.h.clock.advance(FINAL_BATCH_MS);
  const told = k.told(main);
  assert.equal(told.length, 1, 'the head wakes once');
  assert.match(told[0]!, /^2 of your tasks have reported\./);
  assert.ok(told[0]!.includes('A is done.') && told[0]!.includes('B is done.'));
  assert.deepEqual([k.bot()!.tasks[a]!.report!.delivered, k.bot()!.tasks[b]!.report!.delivered], ['main', 'main']);
});

test('bots: stopped is stopped, failed is failed, needs-you is needs-you, each told at once', async () => {
  const k = setup();
  const main = await withMain(k);
  const stopped = k.startedBy(main, k.juno, 'Long job');
  await k.end(stopped, 'interrupted');
  assert.equal(k.bot()!.tasks[stopped]!.report!.kind, 'stopped', 'not final, though the thread reads idle');
  assert.equal(k.h.runner.get(stopped).status, 'idle');
  assert.equal(k.told(main).length, 1, 'told at once, no waiting for a batch');
  assert.match(k.told(main)[0]!, /Status: stopped/);
  // The main chat reads each report in a turn of its own; the next waits behind it.
  await k.end(main, 'no end_turn', 'Noted.');

  const failed = k.startedBy(main, k.juno, 'Flaky job');
  await k.end(failed, 'failed');
  assert.equal(k.bot()!.tasks[failed]!.report!.kind, 'failed');
  assert.match(k.told(main).at(-1)!, /Status: failed/);
  await k.end(main, 'no end_turn', 'Noted.');

  const asking = k.startedBy(main, k.juno, 'Job with a question');
  await k.end(asking, 'you', 'Which of the two dates?');
  assert.equal(k.bot()!.tasks[asking]!.report!.kind, 'needs-you');
  assert.match(k.told(main).at(-1)!, /Status: needs the owner\nResult: Which of the two dates\?/);
  assert.equal(k.told(main).length, 3);

  // A turn that ends with nothing said about being done is progress: no report, nobody woken.
  const going = k.startedBy(main, k.juno, 'Still going');
  await k.end(going, 'no end_turn', 'Working on it.');
  assert.equal(k.bot()!.tasks[going]!.report, undefined);
  assert.equal(k.bot()!.tasks[going]!.state, 'working');
  k.h.clock.advance(FINAL_BATCH_MS);
  assert.equal(k.told(main).length, 3);
});

test('bots: a main chat already waiting on the task through waitFor is told once', async () => {
  const k = setup();
  const main = k.chat(k.juno);
  k.session(main).init();
  const task = k.startedBy(main, k.juno, 'Measure it');
  // The main chat hibernates until the task finishes.
  await k.end(main, 'nothing', 'Waiting on the task.', { waitFor: [task.slice(0, 8)] });
  assert.equal(k.h.runner.get(main).waitingOn?.[0]?.threadId, task);
  await k.end(task, 'nothing', 'Measured: 38% less.');
  k.h.clock.advance(FINAL_BATCH_MS);
  const told = k.told(main);
  assert.equal(told.length, 1, 'once, not twice');
  assert.match(told[0]!, /you hibernated to wait on/, "the wait's own delivery");
  const report = k.bot()!.tasks[task]!.report!;
  assert.equal(report.kind, 'final');
  assert.equal(report.delivered, 'waitFor');
  // A wait does not carry a failure, so that one the record delivers.
  const k2 = setup();
  const main2 = k2.chat(k2.juno);
  k2.session(main2).init();
  const task2 = k2.startedBy(main2, k2.juno);
  await k2.end(main2, 'nothing', 'Waiting.', { waitFor: [task2.slice(0, 8)] });
  await k2.end(task2, 'failed');
  assert.equal(k2.told(main2).length, 1);
  assert.match(k2.told(main2)[0]!, /Status: failed/);
});

test('bots: a task that never reports is said at its deadline, once, and a restart before then does not lose it', async () => {
  const k = setup();
  const main = await withMain(k);
  const task = k.startedBy(main, k.juno, 'Sleeps for ever');
  k.h.clock.advance(2 * 60_000 - 1);
  assert.deepEqual(k.told(main), []);
  k.h.clock.advance(1);
  assert.equal(k.told(main).length, 1);
  assert.match(k.told(main)[0]!, new RegExp(`\\(thread ${task.slice(0, 8)}\\) has not reported by its deadline \\(2 min after it started\\)\\.\\nStatus: overdue, still working`));
  assert.ok(k.bot()!.tasks[task]!.overdueAt);
  k.h.clock.advance(60 * 60_000);
  assert.equal(k.told(main).length, 1, 'once');

  // The runner stops and starts again before the deadline.
  const first = setup();
  const main1 = await withMain(first);
  const sleepy = first.startedBy(main1, first.juno, 'Sleeps through a restart');
  first.h.clock.advance(30_000);
  first.bots.stop();
  const again = setup({ home: first.home, scratch: first.scratch });
  assert.equal(again.bot()!.tasks[sleepy]!.overdueAt, undefined);
  assert.deepEqual(again.told(main1), []);
  // The new runner's clock starts over; the deadline is a time of day, kept in the file.
  again.h.clock.advance(Math.max(0, Date.parse(again.bot()!.tasks[sleepy]!.deadline) - again.h.clock.now()));
  assert.equal(again.told(main1).length, 1, 'the timer was armed again from bots.json');
  assert.match(again.told(main1)[0]!, /has not reported by its deadline/);
});

test(`bots: a task past the limit of ${OPEN_TASK_CAP} is still made, recorded as over it, and the main chat is told once`, async () => {
  const k = setup();
  const main = await withMain(k);
  const made = [1, 2, 3].map((n) => k.startedBy(main, k.juno, `Job ${n}`));
  assert.deepEqual(k.told(main), []);
  assert.equal(openTasks(k.bot()!).length, 3);
  const fourth = k.startedBy(main, k.juno, 'Job 4');
  assert.equal(k.h.runner.get(fourth).status !== undefined, true, 'create_thread still worked');
  assert.equal(k.bot()!.tasks[fourth]!.overCap, true);
  assert.equal(made.some((id) => k.bot()!.tasks[id]!.overCap), false);
  assert.equal(k.told(main).length, 1);
  assert.match(k.told(main)[0]!, new RegExp(`already had 3 tasks open.*thread ${fourth.slice(0, 8)}`));
  // One finishes: there is room again, and the next is not over.
  await k.end(made[0]!, 'nothing');
  await k.end(fourth, 'nothing');
  const next = k.startedBy(main, k.juno, 'Job 5');
  assert.equal(k.bot()!.tasks[next]!.overCap, undefined);
});

test('bots: the record survives a restart, and a file cut off mid-write is set aside, not read', async () => {
  const k = setup();
  const main = await withMain(k);
  const task = k.startedBy(main, k.juno);
  await k.end(task, 'failed');
  const before = k.record()!;
  k.bots.stop();
  const again = setup({ home: k.home, scratch: k.scratch });
  assert.deepEqual(again.bots.list().bots.map(({ openTasks: _n, ...b }) => b), Object.values(before.bots));
  assert.equal(again.bot()!.main?.threadId, main);
  assert.equal(again.bot()!.tasks[task]!.report!.kind, 'failed');
  assert.deepEqual(fs.readdirSync(k.home).filter((f) => f.startsWith('.bots.json')), [], 'no temp file left by a save');

  // Half a file, as a crash mid-write would leave if writes were not atomic.
  again.bots.stop();
  const whole = fs.readFileSync(k.file, 'utf8');
  fs.writeFileSync(k.file, whole.slice(0, Math.floor(whole.length / 2)));
  const broken = setup({ home: k.home, scratch: k.scratch });
  assert.deepEqual(broken.bots.list().bots, [], 'nothing of the cut-off file is believed');
  const aside = fs.readdirSync(k.home).filter((f) => f.startsWith('bots.json.unreadable-'));
  assert.equal(aside.length, 1, 'it is kept, for someone to look at');
  assert.equal(fs.readFileSync(path.join(k.home, aside[0]!), 'utf8'), whole.slice(0, Math.floor(whole.length / 2)));
});

test('bots: bots.list shows the record, and a deleted main chat leaves the bot without one', async () => {
  const k = setup();
  const main = await withMain(k);
  k.startedBy(main, k.juno);
  const list = k.bots.list();
  assert.equal(list.on, true);
  assert.deepEqual(list.managed.map((m) => [m.name, m.deadlineMinutes]), [['juno', 2], ['wren', 120]]);
  assert.equal(list.bots.length, 1);
  assert.equal(list.bots[0]!.main?.threadId, main);
  assert.equal(list.bots[0]!.openTasks, 1);
  list.bots[0]!.tasks = {};
  assert.equal(Object.keys(k.bots.list().bots[0]!.tasks).length, 1, 'what it hands out is a copy');
  k.h.runner.delete(main);
  assert.equal(k.bot()!.main, undefined);
  assert.equal(k.bot()!.generation, 2);
  const next = k.chat(k.juno, 'A new start');
  assert.deepEqual(k.bot()!.main, { threadId: next, generation: 2 });
});
