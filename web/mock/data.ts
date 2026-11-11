// What the mock backend (convex-react.tsx) answers with: a handful of
// made-up bots and their chats. Nothing here is anyone's real project,
// thread or name. The ids were picked for a spread of looks, and still give a spread of
// colours (lookOf in src/bots.ts).
const NOW = Date.now();
const MIN = 60_000;
const iso = (ms: number) => new Date(ms).toISOString();

type Bot = { id: string; title: string; goals: string; folder?: string };
const BOTS: Bot[] = [
  { id: 'juno-0008', title: 'Juno · Router', goals: 'Routes work between your bots and queues your decisions' },
  { id: 'pico-0027', title: 'Pico · Research', goals: 'Finds and checks facts before anyone acts on them' },
  { id: 'wren-000d', title: 'Wren · Client Replies', goals: 'Sorts client messages and writes reply drafts for you to approve' },
  { id: 'tally-0027', title: 'Tally · Bookkeeping', goals: 'Keeps the test ledger tidy' },
  { id: 'nova-0029', title: 'Nova · Ops', goals: 'Watches the overnight jobs' },
  { id: 'echo-00c8', title: 'Echo · Support', goals: 'Answers the test help desk' },
  { id: 'kiko-006c', title: 'Kiko · Funding', goals: 'Tracks the made-up grant deadlines' },
  { id: 'bram-0009', title: 'Bram · Hiring', goals: 'Screens the sample applications' },
  { id: 'fern-0031', title: 'Fern · Fitness', goals: 'Section: Personal\nKeeps the training plan and logs check-ins' },
  { id: 'odo-0005', title: 'Odo · Travel', goals: 'Section: Personal\nPlans trips and keeps the bookings in one place' },
  { id: 'site-0001', title: 'Website', goals: 'Not a bot: an ordinary project', folder: '/Users/me/dev/site' },
];
// A stress run (?stress=200): that many more bots, twice as many ordinary
// projects, three chats a bot and long notes on every project, to see how
// the page holds up on a big account. Still all made up.
const STRESS = Math.max(0, Math.min(2000, Number(new URLSearchParams(location.search).get('stress')) || 0));
for (let i = 0; i < STRESS; i++) {
  const k = String(i).padStart(4, '0');
  BOTS.push({ id: `sb-${k}`, title: `Bot ${k} · Stress`, goals: `${i % 5 === 0 ? 'Section: Personal\n' : ''}Made-up bot number ${i} for the stress run` });
  BOTS.push({ id: `sp-${k}a`, title: `Project ${k}a`, goals: 'Not a bot', folder: `/Users/me/dev/p${k}a` });
  BOTS.push({ id: `sp-${k}b`, title: `Project ${k}b`, goals: 'Not a bot', folder: `/Users/me/dev/p${k}b` });
}
const NOTES = STRESS ? 'Made-up notes, long on purpose. '.repeat(160) : '';

const folderOf = (b: Bot) => b.folder ?? `/Users/me/work/bots/${b.id.startsWith('sb-') ? b.id : b.id.split('-')[0]}`;

const projects = BOTS.map((b) => ({ runnerId: 'r1', id: b.id, title: b.title, folders: [folderOf(b)], goals: b.goals, state: '', notes: NOTES, createdBy: 'user', archived: false, createdAt: iso(NOW - 30 * 24 * 60 * MIN), updatedAt: iso(NOW - 3 * 24 * 60 * MIN), threadCount: 2 }));

type Thread = Record<string, unknown> & { threadId: string; lastActivityMs: number; projects: { id: string; title: string }[] };
let n = 0;
function thread(botId: string, title: string, preview: string, agoMin: number, over: Record<string, unknown> = {}): Thread {
  const b = BOTS.find((x) => x.id === botId)!;
  const at = NOW - agoMin * MIN;
  return { threadId: `thread-${++n}`, runnerId: 'r1', title, cwd: folderOf(b), accountId: 'main', provider: 'claude', status: 'idle', needsYou: false, unread: false, preview, createdAt: iso(at - 60 * MIN), lastActivityAt: iso(at), lastActivityMs: at, view: 'inbox', projects: [{ id: b.id, title: b.title }], ...over };
}

const threads: Thread[] = [
  thread('juno-0008', 'Old review copies', 'Seven of them, about 6.8 GB, are safe to clear.', 4, {
    starredAt: iso(NOW - 9 * 24 * 60 * MIN),
    needsYou: true,
    needs: 'you',
    pendingApproval: { approvalId: 'mock-approval', kind: 'approval', name: 'Bash', title: 'Allow Juno to clear the 7 safe review copies?', options: ['allow', 'deny'], inputSummary: 'rm -r ~/made-up/review-copies/{1..7}\n# about 6.8 GB, nothing is using them' },
  }),
  thread('juno-0008', 'Monday plan', 'The week is laid out in the plan page.', 26 * 60),
  thread('pico-0027', 'Venue shortlist', 'Three venues fit the dates.', 1, { starredAt: iso(NOW - 5 * 24 * 60 * MIN), status: 'running', working: 'Comparing the three venues' }),
  thread('wren-000d', 'Client inbox today', 'Four replies are drafted and none are sent.', 2, {
    needsYou: true,
    needs: 'you',
    unread: true,
    asksSeq: 4,
    asks: [{ action: 'Send the two quick confirmations?', why: 'Both are short thank-you replies. The other two stay as drafts.', options: ['Yes, send those two', 'Show me the drafts first'], suggested: 0 }],
  }),
  thread('wren-000d', 'Tone rules', 'Saved the sign-off rules.', 3 * 24 * 60, { unread: true }),
  thread('tally-0027', 'October close', 'Starting on the receipts.', 0, { status: 'running', working: 'Checking the two sample ledgers' }),
  thread('nova-0029', 'Overnight jobs', 'The **coaching deck** is ready to review.', 65, { unread: true }),
  thread('echo-00c8', 'Help desk sweep', 'All overnight tickets are answered.', 3 * 60),
  thread('kiko-006c', 'Grant calendar', 'Two deadlines moved to next month.', 26 * 60),
  thread('bram-0009', 'Sample applications', 'The last turn stopped early.', 2 * 24 * 60, { status: 'error' }),
  thread('fern-0031', 'Check-ins', 'Evening check-in logged.', 2 * 60),
  thread('site-0001', 'Landing page copy', 'Draft two is up.', 30),
];

for (let i = 0; i < STRESS; i++) {
  // One bot in four has no open chat.
  if (i % 4 === 0) continue;
  const id = `sb-${String(i).padStart(4, '0')}`;
  const state = i % 7 === 0 ? { needsYou: true, needs: 'you', asksSeq: 4, asks: [{ action: `Approve the made-up step for bot ${i}?`, options: ['Yes', 'Not now'] }] } : i % 5 === 0 ? { status: 'running', working: 'Working on a made-up job' } : i % 3 === 0 ? { unread: true } : {};
  threads.push(thread(id, `Chat one of bot ${i}`, `Latest line from bot ${i}, long enough to need cutting short in the row.`, 5 + i, state));
  threads.push(thread(id, `Chat two of bot ${i}`, 'An older chat.', 600 + i, i % 11 === 0 ? { starredAt: iso(NOW - 60 * MIN) } : {}));
}

const archived: Thread[] = [thread('juno-0008', 'Bot roster', 'All ten bots listed.', 9 * 24 * 60, { view: 'den', archivedAt: iso(NOW - 8 * 24 * 60 * MIN) })];

type Message = { seq: number; role: 'user' | 'assistant'; text: string; origin?: string; at: string };
// A third item marks who else sent it ('agent': another thread's agent).
const say = (lines: [Message['role'], string, string?][]): Message[] => lines.map(([role, text, origin], i) => ({ seq: i + 1, role, text, ...(origin ? { origin } : {}), at: iso(NOW - (lines.length - i) * 2 * MIN) }));
const chats: Record<string, Message[]> = {
  'thread-1': say([
    ['user', 'Morning. Anything waiting on me from the other bots?'],
    ['assistant', 'Two things. Wren has four client replies drafted and wants a yes on two of them. Tally finished the October close and found nothing odd.'],
    ['user', 'Good. Separate question: my disk is nearly full again. Can you find out what is taking the room, and whether any of it is safe to clear? I do not want anything removed that a running job still needs.'],
    ['assistant', 'Looking now. The biggest items are old review copies of three projects, about 9 GB in all.'],
    ['user', 'Is it safe to clear those old review copies?'],
    ['assistant', "Most likely yes, but I haven't checked it myself yet. I'm asking Pico to confirm nothing is using them before anything is removed."],
    ['user', 'OK. Tell me what it finds.'],
    ['assistant', 'Pico checked each folder and changed nothing. Seven of them, about 6.8 GB, are safe to clear. Three are still in use, so they stay.'],
  ]),
  'thread-4': say([
    ['user', "What's waiting in the client inbox?"],
    ['assistant', 'Four replies are drafted and none are sent. Two are quick confirmations, one needs a date from you, and one is a pricing question.'],
    ['user', 'Thursday is free on the made-up calendar.', 'agent'],
    ['assistant', 'Noted, thank you.'],
    ['user', 'Use Thursday for the date.'],
    ['assistant', 'Thursday is open, so I used that date in the third draft.\n\n| Draft | Kind | State |\n|---|---|---|\n| 1 | Confirmation | Ready |\n| 2 | Confirmation | Ready |\n| 3 | Date | Ready |\n| 4 | Pricing | Needs you |'],
  ]),
};
const chatOf = (threadId: string): Message[] => {
  const t = [...threads, ...archived].find((x) => x.threadId === threadId);
  if (chats[threadId]) return chats[threadId]!;
  if (STRESS) return say(Array.from({ length: 60 }, (_, i): [Message['role'], string] => (i % 2 ? ['assistant', `Reply ${i} in ${t?.title}.\n\n- one made-up point\n- another, with \`code\`\n\n| a | b |\n|---|---|\n| 1 | 2 |`] : ['user', `Question ${i} for ${t?.title}?`])));
  return say([['user', 'How is it going?'], ['assistant', String(t?.preview ?? 'All quiet.')]]);
};

// Made-up pictures for the Library: plain coloured squares, drawn here.
const square = (colour: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="10" fill="${colour}"/></svg>`)}`;
// On Nova's chat only, off the main demo chats: enough to exercise pictures in a
// reply and the Library's Media list.
const pictures: Record<string, { seq: number; url: string; pinned?: boolean }[]> = {
  'thread-7': [
    { seq: 2, url: square('#7d7d82') },
    { seq: 2, url: square('#9d6937'), pinned: true },
  ],
};

export function answer(name: string, args: Record<string, unknown>): unknown {
  switch (name) {
    case 'phone:images':
      return pictures[String(args.threadId)] ?? [];
    case 'phone:me':
      return { name: 'web-mock', expiresAt: iso(NOW + 24 * 60 * MIN), apiVersion: 0 };
    case 'phone:runners':
      return [{ runnerId: 'r1', name: 'Mock Mac', version: '0', lastSeenAt: iso(NOW), draining: false, startedAt: iso(NOW - 60 * MIN), threadCount: threads.length, main: true }];
    case 'phone:threadsAt':
      return { rows: args.view === 'inbox' ? threads : [], at: NOW };
    case 'phone:threadsSince':
      return { rows: [], gone: [] };
    case 'phone:threads':
      return args.view === 'inbox' ? threads : args.view === 'den' ? archived : [];
    case 'phone:counts':
      return { hibernating: 0, den: archived.length };
    case 'phone:threadRow':
      return [...threads, ...archived].find((t) => t.threadId === args.threadId) ?? null;
    case 'phone:messages':
      return { messages: args.beforeSeq === undefined ? chatOf(String(args.threadId)) : [], hasMore: false };
    case 'phone:projects':
      return projects.map((p) => ({ ...p, folders: [], goals: '' }));
    case 'phone:project':
      return projects.find((p) => p.id === args.id) ?? null;
    case 'phone:projectThreads':
      return [...threads, ...archived].filter((t) => t.projects.some((p) => p.id === args.projectId)).sort((a, b) => b.lastActivityMs - a.lastActivityMs);
    case 'phone:command':
      return { state: 'done' };
    default:
      // Lists nothing here fills: schedules, wakes, pictures, logins, searches.
      return [];
  }
}
