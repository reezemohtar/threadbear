// node --test web/src/bots.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allBots, belongs, canDictateHere, dayLine, isLoadFailure, libraryChips, libraryOf, matchBots, readFoldedBots, toggleFolded, liveOf, namedChat, slimProject, startFolder, watchKeys, botFolder, botPath, botsSwitch, buildBots, chatFor, COLORS, singleFlight, lineOf, lookOf, newestLive, readBotId, roleOf, sectionOf, HEADS, TOPS, VISORS, statusOf, threadsOf, type BotProject, type BotThread, approvalOrder, followCard, micHolds, sendOrStop, botLine, isTask, latchPerKey, mainChat, taskStatus, tasksOf } from './bots.ts';

const NOW = Date.parse('2026-11-11T10:00:00Z');
let n = 0;
const thread = (over: Partial<BotThread> = {}): BotThread => ({ threadId: `t${++n}`, runnerId: 'r1', title: 'A chat', cwd: '/Users/me/elsewhere', status: 'idle', needsYou: false, unread: false, preview: '', lastActivityMs: NOW - 1000 * n, view: 'inbox', ...over });
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

test('a look is a top, a head, eyes and a colour, each picked apart, the same every time', () => {
  const looks = Array.from({ length: 400 }, (_, i) => lookOf(`project-${i}`));
  for (const l of looks) {
    assert.ok(TOPS.includes(l.top) && HEADS.includes(l.head) && VISORS.includes(l.visor));
    assert.ok(l.color in COLORS);
  }
  assert.deepEqual(lookOf('project-7'), lookOf('project-7'));
  assert.equal(new Set(looks.map((l) => l.top)).size, 4, 'every top gets used');
  assert.equal(new Set(looks.map((l) => l.head)).size, 3);
  assert.equal(new Set(looks.map((l) => l.visor)).size, 3);
  assert.equal(new Set(looks.map((l) => l.color)).size, Object.keys(COLORS).length, 'every colour gets used');
  assert.ok(new Set(looks.map((l) => `${l.top}/${l.head}/${l.visor}`)).size >= 30, 'the parts vary apart, so few bots look alike');
});

test("a bot's threads are its project's and any in its own folder, newest first, each once", () => {
  const bot = { id: 'juno', runnerId: 'r1', folder: '/Users/me/work/bots/juno' };
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
  const threads = [thread({ projects: [{ id: 'wren' }], starredAt: '2026-11-01T00:00:00Z' }), thread({ projects: [{ id: 'juno' }], unread: true, preview: 'All sorted.', createdAt: '2026-11-01T00:00:00Z' }), thread({ projects: [{ id: 'juno' }], unread: true, createdAt: '2026-11-05T00:00:00Z' }), thread({ projects: [{ id: 'site' }] })];
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

test("the same folder path on another runner is not the bot's chat", () => {
  const folder = '/Users/me/work/bots/juno';
  const onA = { id: 'juno-a', runnerId: 'runner-a', folder };
  const here = thread({ runnerId: 'runner-a', cwd: folder, lastActivityMs: NOW - 9000 });
  const elsewhere = thread({ runnerId: 'runner-b', cwd: folder, lastActivityMs: NOW - 1000 });
  assert.equal(belongs(onA, elsewhere), false);
  assert.deepEqual(
    threadsOf(onA, [elsewhere, here]).map((t) => t.threadId),
    [here.threadId],
  );
  assert.equal(chatFor(onA, [elsewhere, here]), here.threadId, "never the other runner's newer thread");
  // Each runner's bot gets its own runner's thread, though the paths are the same.
  const lists = buildBots([project('juno-a', { runnerId: 'runner-a', folders: [folder] }), project('juno-b', { runnerId: 'runner-b', folders: [folder] })], [elsewhere, here]);
  assert.deepEqual(
    lists.business.map((b) => [b.id, b.threadId]),
    [
      ['juno-b', elsewhere.threadId],
      ['juno-a', here.threadId],
    ],
  );
  // A thread that has joined the project is the project's, whichever runner it is on.
  assert.equal(belongs(onA, thread({ runnerId: 'runner-b', projects: [{ id: 'juno-a' }] })), true);
});

test("a chat named in the address must be one of the bot's, archived or not", () => {
  const juno = { id: 'juno', runnerId: 'r1', folder: '/Users/me/work/bots/juno' };
  assert.equal(belongs(juno, thread({ projects: [{ id: 'wren' }], cwd: '/Users/me/work/bots/wren' })), false, "another bot's thread");
  assert.equal(belongs(juno, thread({ projects: [{ id: 'juno' }], view: 'den', archivedAt: '2026-11-01T00:00:00Z' })), true, 'its own archived thread');
  assert.equal(belongs(juno, thread({ cwd: '/Users/me/work/bots/juno' })), true);
});

test('the open chat stays while it is still open, and a new one never takes its place', () => {
  const bot = { id: 'juno', runnerId: 'r1', folder: '/Users/me/work/bots/juno' };
  const first = thread({ projects: [{ id: 'juno' }], lastActivityMs: NOW - 5000, createdAt: '2026-11-01T00:00:00Z' });
  assert.equal(chatFor(bot, [first]), first.threadId);
  const newer = thread({ projects: [{ id: 'juno' }], lastActivityMs: NOW, createdAt: '2026-11-09T00:00:00Z' });
  assert.equal(chatFor(bot, [first, newer]), first.threadId, 'nothing held: the main chat, not the newest');
  assert.equal(chatFor(bot, [first, newer], newer.threadId), newer.threadId, 'another chat, opened and held: it stays');
  assert.equal(chatFor(bot, [{ ...first, view: 'den', archivedAt: '2026-11-11T00:00:00Z' }, newer], first.threadId), newer.threadId, 'put away: move on');
  assert.equal(chatFor(bot, [newer], 'someone-elses'), newer.threadId);
  assert.equal(chatFor(bot, []), undefined);
});

test('a second press while the first is still going starts nothing, and a failure frees it', async () => {
  let started = 0;
  let finish: (v: string) => void = () => {};
  let fail: (e: Error) => void = () => {};
  const start = singleFlight(
    (text: string) =>
      new Promise<string>((resolve, reject) => {
        started++;
        finish = () => resolve(`made ${text}`);
        fail = reject;
      }),
  );
  const first = start('hello');
  assert.deepEqual(await start('hello'), { ran: false });
  assert.deepEqual(await start('hello'), { ran: false });
  assert.equal(started, 1, 'Return held down queues one chat, not three');
  finish('');
  assert.deepEqual(await first, { ran: true, value: 'made hello' });
  const second = start('again');
  fail(new Error('offline'));
  await assert.rejects(second, /offline/);
  const third = start('once more');
  assert.equal(started, 3, 'free again after the failure');
  finish('');
  assert.deepEqual(await third, { ran: true, value: 'made once more' });
});

test('a named chat is judged from its row as it is now, so one moved to another bot stops showing', () => {
  const juno = { id: 'juno', runnerId: 'r1', folder: '/Users/me/work/bots/juno' };
  assert.equal(namedChat(juno, undefined), 'checking');
  assert.equal(namedChat(juno, null), 'no', 'no such thread');
  // An archived thread of Juno's, kept in a folder outside Juno's.
  const row = thread({ projects: [{ id: 'juno' }], cwd: '/Users/me/dev/site', view: 'den', archivedAt: '2026-11-01T00:00:00Z' });
  assert.equal(namedChat(juno, row), 'ok');
  // The same thread after it's moved to Wren's project: the row that arrives next says so.
  assert.equal(namedChat(juno, { ...row, projects: [{ id: 'wren' }] }), 'no');
  assert.equal(namedChat({ id: 'wren', runnerId: 'r1', folder: '/Users/me/work/bots/wren' }, { ...row, projects: [{ id: 'wren' }] }), 'ok');
});

test('the selected bot is always watched, even past the cap', () => {
  const bots = Array.from({ length: 50 }, (_, i) => `r1/p${i}`);
  const watched = watchKeys('r1/p47', bots, 40);
  assert.equal(watched.length, 40);
  assert.equal(watched[0], 'r1/p47', 'the one past the first 40 is there');
  assert.equal(new Set(watched).size, 40, 'and only once');
  assert.deepEqual(watchKeys('r1/p3', bots, 40).filter((k) => k === 'r1/p3'), ['r1/p3']);
  assert.equal(watchKeys(undefined, bots, 40).length, 40);
  assert.deepEqual(watchKeys('r1/x', [], 0), ['r1/x'], 'even with no room at all');
  assert.deepEqual(watchKeys(undefined, [], 40), []);
});

test('a new chat starts only in the folder the project has right now', () => {
  assert.equal(startFolder(undefined), undefined, 'not known yet: no chat can start');
  assert.equal(startFolder(null), undefined, 'the project has gone');
  assert.equal(startFolder(project('juno')), '/Users/me/work/bots/juno');
  // The folder was changed somewhere else since the page read it.
  assert.equal(startFolder(project('juno', { folders: ['/Users/me/work/bots/juno-moved'] })), '/Users/me/work/bots/juno-moved');
  assert.equal(startFolder(project('juno', { folders: ['/Users/me/dev/site'] })), undefined, 'no longer a bot');
  assert.equal(startFolder(project('juno', { archived: true })), undefined);
});

test('only the fields the page uses are kept of a project', () => {
  const whole = { ...project('juno', { goals: 'Routes work', lastActivityAt: '2026-11-10T00:00:00Z' }), notes: 'long private notes', state: 'where it stands', icon: { url: 'https://example.invalid/i.png', by: 'user' }, createdBy: 'user', threadCount: 3 };
  const kept = slimProject(whole);
  assert.deepEqual(Object.keys(kept).sort(), ['folders', 'goals', 'id', 'lastActivityAt', 'runnerId', 'title']);
  assert.equal(JSON.stringify(kept).includes('private notes'), false);
  assert.deepEqual(buildBots([kept], []).business.map((b) => b.role), ['Routes work']);
});

test("a failed check of the selected bot's project is said, and never starts a chat", () => {
  assert.deepEqual(liveOf(undefined), { state: 'checking' });
  assert.deepEqual(liveOf(new Error('offline')), { state: 'failed' });
  assert.deepEqual(liveOf(null), { state: 'known', project: null });
  const juno = project('juno');
  assert.deepEqual(liveOf(juno), { state: 'known', project: juno });
  // Whatever the state, a chat starts only from a known project with a bots folder.
  const folder = (a: Parameters<typeof liveOf>[0]) => {
    const l = liveOf(a);
    return startFolder(l.state === 'known' ? l.project : undefined);
  };
  assert.equal(folder(new Error('offline')), undefined, 'fails closed');
  assert.equal(folder(undefined), undefined);
  assert.equal(folder(null), undefined);
  assert.equal(folder(juno), '/Users/me/work/bots/juno');
});

test("the page's code failing to arrive is told apart from a fault in the page", () => {
  assert.equal(isLoadFailure(new TypeError('Failed to fetch dynamically imported module: http://x/src/bots-page.tsx')), true);
  assert.equal(isLoadFailure(new TypeError('Importing a module script failed.')), true);
  assert.equal(isLoadFailure(Object.assign(new Error('Loading chunk 7 failed'), { name: 'ChunkLoadError' })), true);
  assert.equal(isLoadFailure(new TypeError("Cannot read properties of undefined (reading 'title')")), false);
  assert.equal(isLoadFailure(new Error('boom')), false);
  // A query or a picture failing to fetch is not the page's code failing to load.
  assert.equal(isLoadFailure(new TypeError('Failed to fetch')), false);
  assert.equal(isLoadFailure(new TypeError('Load failed')), false);
  assert.equal(isLoadFailure(new TypeError('error loading dynamically imported module: http://x/assets/bots-page.js')), true);
  assert.equal(isLoadFailure('a string'), false);
  assert.equal(isLoadFailure(null), false);
});

test('the search keeps the bots whose name, role or latest line has the words', () => {
  const lists = buildBots(
    [project('juno', { title: 'Juno · Router', goals: 'Routes work between bots' }), project('wren', { title: 'Wren · Replies', goals: 'Writes reply drafts' }), project('fern', { title: 'Fern', goals: 'Section: Personal\nKeeps the training plan' }), project('pico', { title: 'Pico' })],
    [thread({ projects: [{ id: 'pico' }], starredAt: '2026-11-01T00:00:00Z', preview: 'Three venues fit' })],
  );
  assert.equal(matchBots(lists, '  '), lists, 'nothing typed: the same lists');
  assert.deepEqual(titles(matchBots(lists, 'ROUT').business), ['Juno · Router'], 'by name, any case');
  assert.deepEqual(titles(matchBots(lists, 'drafts').business), ['Wren · Replies'], 'by role');
  assert.deepEqual(titles(matchBots(lists, 'venues').pinned), ['Pico'], 'by latest line, pinned ones too');
  assert.deepEqual(titles(matchBots(lists, 'training').personal), ['Fern']);
  assert.equal(allBots(matchBots(lists, 'zzz')).length, 0);
});

test('folded sections are remembered, and junk in the saved value is ignored', () => {
  assert.deepEqual([...readFoldedBots(null)], []);
  assert.deepEqual([...readFoldedBots('["personal","hidden",3]')], ['personal']);
  assert.deepEqual([...readFoldedBots('not json')], []);
  assert.deepEqual([...readFoldedBots('{"personal":true}')], []);
  const once = toggleFolded(new Set(), 'business');
  assert.deepEqual([...once], ['business']);
  assert.deepEqual([...toggleFolded(once, 'business')], []);
  assert.deepEqual([...readFoldedBots(JSON.stringify([...toggleFolded(once, 'personal')]))].sort(), ['business', 'personal']);
});

test('the library holds only what the website is really given: pictures', () => {
  assert.deepEqual(libraryChips(libraryOf([])), [], 'no pictures: no chips at all');
  const lib = libraryOf([
    { seq: 3, url: 'https://example.invalid/a.png' },
    { seq: 9, url: 'https://example.invalid/b.png', pinned: true },
    { seq: 5, url: 'https://example.invalid/a.png' },
    { seq: 7, url: '' },
  ]);
  assert.deepEqual(lib.media.map((p) => p.seq), [9, 5], 'newest first, each picture once, none without an address');
  assert.deepEqual(libraryChips(lib), ['media']);
});

test('there is no Pinned list while the API can drop a pin', () => {
  // A picture pinned AND shown in a reply arrives without its pin (convex/share.ts,
  // replyImagesFrom), so a list of the pinned ones would be missing it.
  const asTheApiSendsIt = [
    { seq: 4, url: 'https://example.invalid/pinned-and-in-a-reply.png', src: 'chart.png' },
    { seq: 6, url: 'https://example.invalid/pinned-only.png', pinned: true },
  ];
  const lib = libraryOf(asTheApiSendsIt);
  assert.deepEqual(Object.keys(lib), ['media'], 'no pinned list is made at all');
  assert.equal(lib.media.length, 2, 'both pictures are in Media, pin or no pin');
  assert.deepEqual(libraryChips(lib), ['media']);
});

test('a date line goes above the first message and the first of each new day', () => {
  const at = (y: number, m: number, d: number, h: number) => new Date(y, m - 1, d, h, 30).toISOString();
  const now = new Date(2026, 10, 11, 15, 0).getTime();
  assert.match(dayLine(at(2026, 11, 11, 8), undefined, now)!, /^Today /);
  assert.equal(dayLine(at(2026, 11, 11, 9), at(2026, 11, 11, 8), now), undefined, 'same day: no line');
  assert.match(dayLine(at(2026, 11, 10, 23), undefined, now)!, /^Yesterday /);
  assert.match(dayLine(at(2026, 11, 11, 0), at(2026, 11, 10, 23), now)!, /^Today /, 'past midnight: a new line');
  const older = dayLine(at(2026, 11, 3, 8), undefined, now)!;
  assert.ok(!/^Today|^Yesterday/.test(older) && /3/.test(older), older);
  assert.equal(dayLine('not a date', undefined, now), undefined);
});

test('the mic is offered only where speech can be turned to text on the device', async () => {
  assert.equal(await canDictateHere(undefined, 'en-US'), false, 'no speech recognition at all');
  assert.equal(await canDictateHere(class {}, 'en-US'), false, 'a browser that can only send audio to a server');
  const asked: unknown[] = [];
  const local = class {
    static async available(options: unknown) {
      asked.push(options);
      return 'available';
    }
  };
  assert.equal(await canDictateHere(local, 'en-US'), true);
  assert.deepEqual(asked, [{ langs: ['en-US'], processLocally: true }], 'it asks for on-device only');
  assert.equal(await canDictateHere(class { static async available() { return 'downloadable'; } }, 'en-US'), false, 'not without a download nobody asked for');
  assert.equal(await canDictateHere(class { static async available() { throw new Error('no'); } }, 'en-US'), false);
});

test('the conversation follows its card when the card is new, or grows under someone at the bottom', () => {
  assert.equal(followCard({ replaced: true, distance: 900, grew: 0 }), true, 'a new approval: its buttons must be seen');
  // Details opened: the card is 140 taller, so the bottom is now 140 away.
  assert.equal(followCard({ replaced: false, distance: 140, grew: 140 }), true, 'they were at the bottom before it grew');
  assert.equal(followCard({ replaced: false, distance: 700, grew: 140 }), false, 'they had scrolled up to read: left alone');
  assert.equal(followCard({ replaced: false, distance: 60, grew: -140 }), true, 'Details closed, near the bottom');
  assert.equal(followCard({ replaced: false, distance: 81, grew: 0 }), false);
});

test('Send waits while the mic is listening or still stopping', () => {
  assert.equal(micHolds('idle'), false);
  assert.equal(micHolds('listening'), true);
  assert.equal(micHolds('stopping'), true, 'the last words may still be on their way');
});

test("an approval's buttons are shown and tabbed in one order, the allowing one last", () => {
  assert.deepEqual(approvalOrder(['allow', 'deny']), ['deny', 'allow']);
  assert.deepEqual(approvalOrder(['allow', 'allowAlways', 'deny']), ['allowAlways', 'deny', 'allow']);
  assert.deepEqual(approvalOrder(['deny']), ['deny']);
  const given = ['allow', 'deny'];
  approvalOrder(given);
  assert.deepEqual(given, ['allow', 'deny'], 'what the thread sent is left as it was');
});

test('the message box shows Stop while a turn runs and Send cannot be pressed', () => {
  const shows = (busy: boolean, ready: boolean, held: boolean) => sendOrStop({ busy, ready, held });
  // Not in a chat, held is never true: exactly the site's own rule.
  assert.equal(shows(false, false, false), 'send');
  assert.equal(shows(false, true, false), 'send');
  assert.equal(shows(true, false, false), 'stop', 'a running turn, nothing typed');
  assert.equal(shows(true, true, false), 'send', 'typed during a turn: it goes into the turn');
  // In a chat with the mic on.
  assert.equal(shows(true, true, true), 'stop', 'dictated words made it ready, but Send is held: the turn must still be stoppable');
  assert.equal(shows(true, false, true), 'stop');
  assert.equal(shows(false, true, true), 'send', 'no turn to stop: Send, held until the mic is done');
  assert.equal(shows(false, false, true), 'send');
});

// ---- tasks (stage A, slice 1)
const JUNO = { id: 'juno', runnerId: 'r1', folder: '/Users/me/work/bots/juno' };
const chat = (over: Partial<BotThread> = {}) => thread({ projects: [{ id: 'juno' }], ...over });
const task = (over: Partial<BotThread> = {}) => thread({ projects: [{ id: 'juno' }], startedBy: { kind: 'thread', label: 'Juno' }, ...over });

test('a thread is a task only when another thread started it', () => {
  assert.equal(isTask(task()), true);
  assert.equal(isTask(chat()), false, 'started by the owner');
  assert.equal(isTask(chat({ startedBy: { kind: 'schedule', label: 'Every morning' } })), false);
  assert.equal(isTask(chat({ startedBy: { kind: 'phone', label: 'Phone' } })), false);
});

test("a new task does not take over the bot's chat", () => {
  const main = chat({ createdAt: '2026-11-01T00:00:00Z', lastActivityMs: NOW - 60_000, preview: 'On it.' });
  const before = buildBots([project('juno')], [main]).business[0]!;
  assert.equal(before.threadId, main.threadId);
  // The bot starts a job in the background: it is now the newest thread by far.
  const job = task({ createdAt: '2026-11-11T09:59:00Z', lastActivityMs: NOW, status: 'running', working: 'Rendering' });
  const after = buildBots([project('juno')], [job, main]).business[0]!;
  assert.equal(after.threadId, main.threadId, 'a reload still opens the main chat');
  assert.equal(chatFor(JUNO, [job, main]), main.threadId);
  assert.equal(chatFor(JUNO, [job, main], job.threadId), main.threadId, 'a task is never held as the chat');
  assert.deepEqual(tasksOf(JUNO, [job, main]).map((t) => t.threadId), [job.threadId]);
  // A bot with only tasks has no main chat, rather than a task standing in for one.
  assert.equal(buildBots([project('juno')], [job]).business[0]!.threadId, undefined);
});

test('the main chat is the starred one, else the oldest, the same on every reload', () => {
  const oldest = chat({ createdAt: '2026-10-01T00:00:00Z', lastActivityMs: NOW - 9_000_000 });
  const middle = chat({ createdAt: '2026-10-20T00:00:00Z', lastActivityMs: NOW });
  const newest = chat({ createdAt: '2026-11-10T00:00:00Z', lastActivityMs: NOW - 1000 });
  const all = [newest, middle, oldest];
  assert.equal(mainChat(JUNO, all)?.threadId, oldest.threadId, 'the oldest, however quiet');
  assert.equal(mainChat(JUNO, [...all].reverse())?.threadId, oldest.threadId, 'whatever order they arrive in');
  // Activity moves; the answer does not.
  assert.equal(mainChat(JUNO, [{ ...newest, lastActivityMs: NOW + 5000 }, middle, oldest])?.threadId, oldest.threadId);
  // New tasks and a new chat arrive: still the same.
  assert.equal(mainChat(JUNO, [task({ lastActivityMs: NOW + 9000 }), chat({ createdAt: '2026-11-11T09:00:00Z' }), ...all])?.threadId, oldest.threadId);
  // A star names another; two stars, the older of them.
  const starred = { ...middle, starredAt: '2026-11-02T00:00:00Z' };
  assert.equal(mainChat(JUNO, [newest, starred, oldest])?.threadId, middle.threadId);
  assert.equal(mainChat(JUNO, [{ ...newest, starredAt: '2026-11-03T00:00:00Z' }, starred, oldest])?.threadId, middle.threadId);
  // A starred task is still a task.
  assert.equal(mainChat(JUNO, [task({ starredAt: '2026-11-04T00:00:00Z', createdAt: '2026-09-01T00:00:00Z' }), oldest])?.threadId, oldest.threadId);
  // Once the main chat is archived, the next oldest.
  assert.equal(mainChat(JUNO, [newest, middle, { ...oldest, view: 'den', archivedAt: '2026-11-11T00:00:00Z' }])?.threadId, middle.threadId);
  assert.equal(mainChat(JUNO, []), undefined);
});

test('two tasks finishing together both show, each with its own status', () => {
  const a = task({ title: 'Voice files', lastActivityMs: NOW });
  const b = task({ title: 'Captions', lastActivityMs: NOW, status: 'error' });
  const c = task({ title: 'Render', lastActivityMs: NOW - 1000, status: 'running', working: 'Frame 40 of 90' });
  const d = task({ title: 'Upload', lastActivityMs: NOW - 2000, needsYou: true });
  const list = tasksOf(JUNO, [a, b, c, d, chat()]);
  assert.equal(list.length, 4, 'every task, none merged, the chat left out');
  assert.deepEqual(Object.fromEntries(list.map((t) => [t.title, taskStatus(t)])), { 'Voice files': 'finished', Captions: 'failed', Render: 'working', Upload: 'needs' });
  assert.equal(tasksOf(JUNO, [a, a, b]).length, 2, 'each once');
});

test('only a working task can be stopped, and a stopped one reads as finished', () => {
  const canStop = (t: BotThread) => taskStatus(t) === 'working';
  assert.equal(canStop(task({ status: 'running' })), true);
  assert.equal(canStop(task({ status: 'starting' })), true);
  assert.equal(canStop(task()), false, 'finished');
  assert.equal(canStop(task({ status: 'error' })), false);
  assert.equal(canStop(task({ needsYou: true, status: 'running' })), false, 'waiting on an answer, not on a Stop');
  // Today's limit, said plainly: an interrupted turn ends idle, the same as a finished one.
  assert.equal(taskStatus(task({ status: 'idle' })), 'finished');
});

test('Stop pressed twice sends one stop', async () => {
  const sent: string[] = [];
  let done: () => void = () => {};
  const stops = latchPerKey(async (id: string) => {
    sent.push(id);
    await new Promise<void>((r) => (done = r));
  });
  const first = stops.press('t1');
  assert.equal(await stops.press('t1'), 'ignored');
  assert.equal(stops.held('t1'), true);
  done();
  assert.equal(await first, 'sent');
  assert.equal(await stops.press('t1'), 'ignored', 'still held until the task is seen to have stopped');
  assert.deepEqual(sent, ['t1']);
  // Another task has its own.
  const other = stops.press('t2');
  done();
  assert.equal(await other, 'sent');
  // Seen stopped, then working again later: it can be stopped again.
  stops.release('t1');
  const again = stops.press('t1');
  done();
  assert.equal(await again, 'sent');
  assert.deepEqual(sent, ['t1', 't2', 't1']);
  // A stop that fails lets go, so it can be tried again.
  const failing = latchPerKey(async () => {
    throw new Error('offline');
  });
  assert.equal(await failing.press('t9'), 'failed');
  assert.equal(failing.held('t9'), false);
});

test('tasks that need you are counted apart from the main chat, neither twice', () => {
  const main = chat({ createdAt: '2026-11-01T00:00:00Z', needsYou: true, asks: [{ action: 'Approve the script?' }] });
  const waiting1 = task({ needsYou: true });
  const waiting2 = task({ pendingApproval: { kind: 'approval' } });
  const working = task({ status: 'running' });
  const done = task();
  const gone = task({ needsYou: true, view: 'den', archivedAt: '2026-11-10T00:00:00Z' });
  const bot = buildBots([project('juno')], [main, waiting1, waiting2, working, done, gone]).business[0]!;
  assert.equal(bot.tasksWaiting, 2, 'two open tasks, not the main chat, not the archived one');
  assert.equal(bot.tasksWorking, 1);
  assert.equal(bot.status, 'needs');
  assert.equal(bot.line, 'Approve the script?', 'the main chat is asking: its own line, as a click opens it');
  // The main chat quiet: the tasks speak.
  const quiet = buildBots([project('juno')], [{ ...main, needsYou: false, asks: undefined, preview: 'All done.' }, waiting1, waiting2, working]).business[0]!;
  assert.equal(quiet.line, '2 tasks need you');
  assert.equal(quiet.tasksWaiting, 2);
  assert.equal(botLine(main, 0, 0), 'Approve the script?');
  assert.equal(botLine({ ...main, needsYou: false, asks: undefined, preview: 'All done.' }, 0, 3), 'Working on 3 tasks');
  assert.equal(botLine({ ...main, needsYou: false, asks: undefined, preview: 'All done.' }, 1, 3), '1 task needs you');
  assert.equal(botLine(undefined, 0, 1), 'Working on 1 task');
  assert.equal(botLine(undefined, 0, 0), 'No open chat');
  // A second chat of the bot's, not a task and not the main one, is waiting.
  const second = chat({ createdAt: '2026-11-09T00:00:00Z', needsYou: true });
  const two = buildBots([project('juno')], [{ ...main, needsYou: false, asks: undefined, preview: 'All done.' }, second]).business[0]!;
  assert.equal(two.threadId, main.threadId);
  assert.equal(two.line, '1 other chat needs you');
  assert.equal(two.tasksWaiting, 0, 'a chat is not a task');
});
