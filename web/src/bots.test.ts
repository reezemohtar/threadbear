// node --test web/src/bots.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allBots, botFolder, botPath, botsSwitch, buildBots, COLORS, lineOf, lookOf, newestLive, readBotId, roleOf, sectionOf, SHAPES, statusOf, threadsOf, type BotProject, type BotThread } from './bots.ts';

const NOW = Date.parse('2026-11-11T10:00:00Z');
let n = 0;
const thread = (over: Partial<BotThread> = {}): BotThread => ({ threadId: `t${++n}`, title: 'A chat', cwd: '/Users/me/elsewhere', status: 'idle', needsYou: false, unread: false, preview: '', lastActivityMs: NOW - 1000 * n, view: 'inbox', ...over });
const project = (id: string, over: Partial<BotProject> = {}): BotProject => ({ runnerId: 'r1', id, title: id, folders: [`/Users/me/work/bots/${id}`], goals: '', ...over });
const titles = (bots: { title: string }[]) => bots.map((b) => b.title);

test('a project is a bot when one of its folders is inside a folder named bots', () => {
  assert.equal(botFolder(['/Users/me/work/bots/juno']), '/Users/me/work/bots/juno');
  assert.equal(botFolder(['/Users/me/dev/site', '/Users/me/work/bots/juno']), '/Users/me/work/bots/juno');
  assert.equal(botFolder(['/Users/me/work/bots/_test/juno/']), '/Users/me/work/bots/_test/juno/', 'a group of test bots');
  assert.equal(botFolder(['/Users/me/work/bots']), undefined, 'the bots folder itself');
  assert.equal(botFolder(['/Users/me/work/bots/_shared']), undefined, 'shared files, not a bot');
  assert.equal(botFolder(['/Users/me/work/bots/.cache']), undefined);
  assert.equal(botFolder(['/Users/me/work/robots/juno']), undefined, 'the whole folder name, not part of one');
  assert.equal(botFolder([]), undefined);
});

test('the section is Business unless the goals say Personal', () => {
  assert.equal(sectionOf(''), 'business');
  assert.equal(sectionOf('Keeps the books.\nSection: Personal'), 'personal');
  assert.equal(sectionOf('  section : PERSONAL.  '), 'personal');
  assert.equal(sectionOf('Section: Business'), 'business');
  assert.equal(sectionOf('This section: personal notes go here'), 'business', 'only a line of its own');
});

test('the role is the first line of the goals that is not the section line', () => {
  assert.equal(roleOf('Section: Personal\n\n- **Sorts** requests and writes `drafts`\nMore.'), 'Sorts requests and writes drafts');
  assert.equal(roleOf('# Routes work between bots'), 'Routes work between bots');
  assert.equal(roleOf('Section: Personal'), '');
  assert.equal(roleOf(''), '');
});

test('a look is one of the 12 shapes and a colour, the same every time', () => {
  const looks = Array.from({ length: 200 }, (_, i) => lookOf(`project-${i}`));
  for (const l of looks) {
    assert.ok(SHAPES.includes(l.shape));
    assert.ok(l.color in COLORS);
  }
  assert.deepEqual(lookOf('project-7'), lookOf('project-7'));
  assert.equal(new Set(looks.map((l) => l.shape)).size, SHAPES.length, 'every shape gets used');
  assert.equal(new Set(looks.map((l) => l.color)).size, Object.keys(COLORS).length, 'every colour gets used');
  assert.ok(new Set(looks.map((l) => `${l.shape}/${l.color}`)).size > 60, 'shape and colour vary apart');
});

test("a bot's threads are its project's and any in its own folder, newest first, each once", () => {
  const bot = { id: 'juno', folder: '/Users/me/work/bots/juno' };
  const joined = thread({ projects: [{ id: 'juno' }], lastActivityMs: NOW - 5000 });
  const inFolder = thread({ cwd: '/Users/me/work/bots/juno', lastActivityMs: NOW - 1000 });
  const below = thread({ cwd: '/Users/me/work/bots/juno/notes', lastActivityMs: NOW - 9000 });
  const sibling = thread({ cwd: '/Users/me/work/bots/juno-two' });
  const other = thread({ projects: [{ id: 'pico' }] });
  assert.deepEqual(
    threadsOf(bot, [joined, sibling, inFolder, other, below, joined]).map((t) => t.threadId),
    [inFolder.threadId, joined.threadId, below.threadId],
  );
});

test('the chat a bot opens is its newest thread that is not archived', () => {
  const old = thread({ lastActivityMs: NOW - 9000 });
  const asleep = thread({ lastActivityMs: NOW - 3000, view: 'hibernating' });
  const gone = thread({ lastActivityMs: NOW - 1000, view: 'den', archivedAt: '2026-11-10T00:00:00Z' });
  assert.equal(newestLive([old, gone, asleep])?.threadId, asleep.threadId);
  assert.equal(newestLive([gone]), undefined);
  assert.equal(newestLive([]), undefined);
});

test('the row says needs you before working, and failed only for the newest thread', () => {
  assert.equal(statusOf([]), 'idle');
  assert.equal(statusOf([thread()]), 'idle');
  assert.equal(statusOf([thread({ status: 'running' })]), 'working');
  assert.equal(statusOf([thread({ status: 'starting' })]), 'working');
  assert.equal(statusOf([thread({ status: 'running' }), thread({ needsYou: true })]), 'needs');
  assert.equal(statusOf([thread({ pendingApproval: { kind: 'approval' } })]), 'needs');
  assert.equal(statusOf([thread({ status: 'error', lastActivityMs: NOW })]), 'failed');
  assert.equal(statusOf([thread({ status: 'error', lastActivityMs: NOW - 9000 }), thread({ lastActivityMs: NOW })]), 'idle');
});

test('the line under the name is the ask, else the work, else the last reply', () => {
  assert.equal(lineOf([]), 'No open chat');
  assert.equal(lineOf([thread({ preview: '**Done.** Two files changed.' })]), 'Done. Two files changed.');
  assert.equal(lineOf([thread({ preview: '', title: 'Morning check' })]), 'Morning check');
  assert.equal(lineOf([thread({ preview: 'Earlier', status: 'running', working: 'Reading the notes' })]), 'Reading the notes');
  assert.equal(lineOf([thread({ status: 'running' })]), 'Working');
  assert.equal(lineOf([thread({ status: 'running', working: 'Reading' }), thread({ needsYou: true, asks: [{ action: 'Send the two\nconfirmations?' }] })]), 'Send the two confirmations?');
  assert.equal(lineOf([thread({ pendingApproval: { kind: 'approval' } })]), 'Waiting for your answer');
  assert.equal(lineOf([thread({ status: 'error', preview: 'Half a reply' })]), 'The last turn failed');
});

test('bots go under Business and Personal, with starred ones pinned and the rest left out', () => {
  const projects = [
    project('juno', { title: 'Juno', goals: 'Routes work between bots' }),
    project('fern', { title: 'Fern', goals: 'Section: Personal\nKeeps the training plan' }),
    project('wren', { title: 'Wren' }),
    project('site', { title: 'The site', folders: ['/Users/me/dev/site'] }),
    project('old', { title: 'Old bot', archived: true }),
    project('juno', { title: 'Juno again' }),
  ];
  const threads = [thread({ projects: [{ id: 'wren' }], starredAt: '2026-11-01T00:00:00Z' }), thread({ projects: [{ id: 'juno' }], unread: true, preview: 'All sorted.' }), thread({ projects: [{ id: 'juno' }], unread: true }), thread({ projects: [{ id: 'site' }] })];
  const lists = buildBots(projects, threads);
  assert.deepEqual(titles(lists.pinned), ['Wren']);
  assert.deepEqual(titles(lists.business), ['Juno']);
  assert.deepEqual(titles(lists.personal), ['Fern']);
  const juno = lists.business[0]!;
  assert.equal(juno.role, 'Routes work between bots');
  assert.equal(juno.unread, 2);
  assert.equal(juno.threadId, threads[1]!.threadId);
  assert.equal(juno.line, 'All sorted.');
  assert.equal(juno.folder, '/Users/me/work/bots/juno');
  assert.equal(lists.personal[0]!.threadId, undefined);
  assert.equal(lists.personal[0]!.line, 'No open chat');
  assert.equal(allBots(lists).length, 3);
});

test('an archived starred thread does not pin its bot', () => {
  const lists = buildBots([project('juno')], [thread({ projects: [{ id: 'juno' }], starredAt: '2026-11-01T00:00:00Z', view: 'den', archivedAt: '2026-11-02T00:00:00Z' })]);
  assert.equal(lists.pinned.length, 0);
  assert.equal(lists.business[0]!.threadId, undefined);
});

test('in a section: waiting on you first, then whoever was active last', () => {
  const projects = [project('a', { title: 'Quiet', lastActivityAt: '2026-11-01T00:00:00Z' }), project('b', { title: 'Recent' }), project('c', { title: 'Asking' }), project('d', { title: 'Earlier' })];
  const threads = [thread({ projects: [{ id: 'b' }], lastActivityMs: NOW - 1000 }), thread({ projects: [{ id: 'c' }], lastActivityMs: NOW - 90_000, needsYou: true }), thread({ projects: [{ id: 'd' }], lastActivityMs: NOW - 60_000 })];
  assert.deepEqual(titles(buildBots(projects, threads).business), ['Asking', 'Recent', 'Earlier', 'Quiet']);
});

test("a bot's address carries its project, and a thread when it isn't the newest", () => {
  assert.equal(botPath(), '/bots');
  assert.equal(botPath('p1'), '/bots/p1');
  assert.equal(botPath('p1', 't 9'), '/bots/p1~t%209');
  assert.deepEqual(readBotId(undefined), {});
  assert.deepEqual(readBotId('p1'), { botId: 'p1' });
  assert.deepEqual(readBotId('p1~t9'), { botId: 'p1', threadId: 't9' });
  assert.deepEqual(readBotId('p1~'), { botId: 'p1' });
});

test('the page is off until this browser turns it on, and stays as it was left', () => {
  assert.deepEqual(botsSwitch('', null), { on: false });
  assert.deepEqual(botsSwitch('?experiment=bots', null), { on: true, save: '1' });
  assert.deepEqual(botsSwitch('', '1'), { on: true });
  assert.deepEqual(botsSwitch('?experiment=bots-off', '1'), { on: false, save: '0' });
  assert.deepEqual(botsSwitch('?experiment=other', '0'), { on: false });
});
