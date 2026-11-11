# What this fork changes

This is Reeze's fork of mikecann/threadbear. Every file of Mike's that the
fork has edited is listed here with why, so bringing in his releases stays
easy: a conflict in one of these files is ours to sort out, and anything
not listed should merge clean. New files the fork adds are listed after.
Rules: branches are `reeze/<slice>`, the backend's `API_VERSION` is never
bumped here, and Mike's releases come in through the Updates panel.

## Bots page, slice 1 (branch `reeze/bots-page`, 11 Nov 2026)

The website's Bots page, as the experiment `bots` (docs/experiments.md).
Off by default. No backend, runner or Mac app code changed.

### Existing files edited

| File | Change | Why |
|---|---|---|
| `web/src/route.ts` | `'bots'` added to `RailView` and to the path pattern; one comment line | So `/bots` and `/bots/<id>` are addresses the site knows |
| `web/src/rail.tsx` | Two imports and one line: a Bots entry after Projects, shown only while the experiment is on | The way into the page, on the rail and the phone's tab bar |
| `web/src/App.tsx` | Two imports; `Shell` returns the Bots page (`LazyBots`, loaded only then) for the `bots` route while the experiment is on, and counts its id as "something is open" only then; `ThreadView` takes an optional `back` (default `/`, so nothing else changes) | The page sits where the sidebar and main column are, and reuses the site's own thread view for the chat |
| `docs/website.md` | A paragraph on the mock site and a section on the Bots page | Repo rule: docs stay true |
| `docs/experiments.md` | Generated (`npm run experiment-docs`) from the new experiment file | Repo rule |

### Files added

| File | What it is |
|---|---|
| `web/src/bots.ts`, `web/src/bots.test.ts` | The rules (which projects are bots, sections, order, the chat a bot opens, status, look, the switch) and their tests |
| `web/src/bots-loader.ts`, `web/src/bots-loader.test.ts` | Reads each project's folders a few at a time, and its tests |
| `web/src/bots-page.tsx`, `web/src/bots.css` | The page and its look |
| `web/src/bots-lazy.tsx` | Fetches the page only when it's opened, with a Reload if that fetch fails |
| `web/src/bots-mic.tsx` | The mic in a bot's message box: on-device dictation, drawn only where the browser can do it |
| `web/src/bots-avatar.tsx` | The robot-head avatars (our own drawings: a top, a head, a visor) and the rail icon |
| `web/mock/` | The site on made-up data with no backend, for looking at a page (dev server only) |
| `runner/src/experiments/bots.md` | The experiment's file. Its `reminder` is a placeholder: no check-in schedule is booked |
| `FORK.md` | This file |

## Bots page, style pass (branch `reeze/bots-style`, 11 Nov 2026)

The look brought to the Bots design's reference: bubbles, cards in the
conversation, the pill message box with a mic, the tabbed pane, search and
folding sections. Web only, still the `bots` experiment, off by default.

### Existing files edited

| File | Change | Why |
|---|---|---|
| `web/src/App.tsx` | `ThreadView`, `Dock` and `ApprovalCard` take an optional `chat` (type `ChatLook`), passed only by the Bots page. With it: the dock's card is drawn through a portal into a slot in the conversation, a line is drawn for each new day, the message box says "Message <name>" and can hold a tool beside Send, and an approval gets a label and a Details fold. Two imports. | The reference shows cards in the conversation and a mic in the message box. The card, its state and what it sends are the same code either way; without `chat` nothing changes. Rebased onto release 2026-11-11 (main `855d383e`): Mike's recap box above the dock, his Stop button in place of Send while a turn runs, his Recommended mark and option notes are all kept as he wrote them; the `chat` props sit beside them (the mic's tool goes before his Send/Stop block, the card slot is watched for size so its buttons stay in view, and in a chat an approval's buttons are rendered in shown order) |
| `docs/website.md`, `docs/experiments.md` | The Bots section and the experiment's text | Repo rule: docs stay true |

## Bots page, tasks (branch `reeze/bots-tasks`, 11 Nov 2026)

Stage A, slice 1: a bot's background threads are listed as its Tasks, with
Stop, and no longer take the place of its main chat. Web only, in the Bots
files (`bots.ts`, `bots-page.tsx`, `bots.css`, the mock) and the docs.

### Existing files edited

| File | Change | Why |
|---|---|---|
| `web/src/App.tsx` | Two more optional fields on `ChatLook`, used only by the Bots page: `draft` and `stop`. In `Dock`: the text box starts from `chat?.draft?.text` (one changed line) and tells `chat?.draft?.set` when it changes (one added effect); the Stop button's spinner reads `chat.stop.pending` and its click calls `chat.stop.press()` when `chat.stop` is given (two changed lines). The type itself grew from one line to six with its comment. Without those fields every line behaves as before: the box starts empty, and Stop is the message box's own | A draft has to outlive the message box to survive a look at a task, and a thread's two Stop buttons (its row in Tasks, its own message box) have to be one Stop, or two stops can be sent |

## Bots, the runner's record (branch `reeze/bots-record`, 12 Nov 2026)

Stage A, slice 2: the runner keeps `bots.json` for the bots listed in
`runner.json` (`bots.managed`), behind the `bots` experiment. New files:
`runner/src/bots.ts`, `runner/test/unit/bots.test.ts`,
`web/src/bots-folders.json` (the cases both copies of the folder rule are
tested against).

### Existing files edited

Every line is added beside an existing line of the same kind; nothing is
moved or reformatted. The list is as it stands after the first skeptic
round's fixes (the first commit's one line in `endTurn` is gone).

| File | Lines added | Why |
|---|---|---|
| `runner/src/runner.ts` | `import type { Bots } from './bots.ts';` after the `Projects` import | The type |
| `runner/src/runner.ts` | `bots?: Bots;` in `RunnerDeps`, after `projects?: Projects;` | Handed in like `projects` |
| `runner/src/runner.ts` | `bots?: Bots;` in the class, after `projects?: Projects;` | The field |
| `runner/src/runner.ts` | `this.bots = deps.bots;` in the constructor, after `this.projects = deps.projects;` | Kept |
| `runner/src/runner.ts` | In `completeTurn`, after the `markFinished` line: `this.bots?.turnEnded({ threadId: rec.id, turnId: turn.turnId, outcome, needsYou: said?.needs === 'you' \|\| rec.status === 'waiting', finished: finished && !review && !rec.labReviewOwed, reply: turn.lastText });` | Told after the turn's own bookkeeping and its waits, with a fixed account of how it ended |
| `runner/src/runner.ts` | In `failTurn`, after `this.endTurn(...)`: `this.bots?.turnEnded({ threadId: rec.id, turnId: turn.turnId, outcome: interrupted ? 'interrupted' : 'failed', needsYou: false, finished: false, reply: turn.lastText });` | The same, for a turn that was stopped or failed |
| `runner/src/runner.ts` | `this.bots?.deleted(threadId);` in `delete`, after `this.waitedOnDeleted(threadId);` | A deleted thread leaves the record |
| `runner/src/runner/new-threads.ts` | `this.bots?.created(st.rec, params.byOwner === true);` in `create`, after `makeThread` | A new thread is classed as the main chat, a task or neither |
| `runner/src/runner/new-threads.ts` | `byOwner?: true;` with a one-line comment, last in `create`'s params | Proof the call came on the owner's token: only then can a thread become a bot's main chat |
| `runner/src/main.ts` | `import { Bots, runnerHost } from './bots.ts';` after the `Projects` import | Built here |
| `runner/src/main.ts` | `bots: new Bots(runnerHost(() => runner, cfg.home, realClock, log)),` in `new Runner({...})`, after `projects,` | Built and handed in |
| `runner/src/main.ts` | `runner.bots?.start();` with a one-line comment, after `tellLaunchListening();` | Started last: a report owed from before a restart is a message to a thread, so the scheduler and the server are up first |
| `runner/src/main.ts` | `runner.bots?.stop();` twice: in `shutdown` after `scheduler.stop();`, and in `handOver` after `scheduler.stop();` | A runner that is stopping or has handed over writes nothing more and holds no timer |
| `runner/src/rpc.ts` | `case 'bots.list': return r.bots?.list() ?? { on: false, managed: [], refused: [], bots: [] };` (two lines) after `pools.list` | The read-only look at the record |
| `runner/src/rpc.ts` | `...(conn.caller === undefined ? { byOwner: true as const } : {}),` last in `threads.create`'s call to `r.create` | Says the call was the owner's (the token, no thread's key) |
| `runner/src/rpc-gate.ts` | In `CallerGate.check`, just before the line that passes a Full access thread: a two-line comment, `if (method.startsWith('bots.')) throw ...notAllowed`, and one line that, only while the experiment is on (`this.deps.runner.bots?.on()`), returns `threads.create`'s params with `startedBy.kind` set to `thread`, `startedBy.threadId` to the calling thread and a blank label to `Agent`, after whatever the caller sent, for a Full access key. Also `bots?: { on(): boolean };` in `CallerGateDeps.runner` | The record is closed to every thread's key, and while bots are on no thread can make one that passes as the owner's chat or as another thread's task. **With the experiment off** the create line does nothing: the params reach the runner exactly as sent, as before this branch. What still acts while off: `bots.*` is a reserved name thread keys are refused; one `stat` of `runner.json` per thread made, deleted or turn ended; the module's start and stop, which do nothing. **With it on**, someone using the app could notice that a thread a Full access agent made with no `startedBy`, or as a `tool` (`tb new --from` inside a thread), now shows as started by the agent's thread |
| `web/src/bots.test.ts` | Two imports and one test | The website's copy of the folder rule is tested against the shared cases |
| `docs/protocol.md`, `docs/on-your-mac.md`, `docs/experiments.md` (generated) | The Bots section and method row; the new file; the experiment's text | Repo rules |

## Fixes to Mike's code, until his release has them

| File | Change | Why |
|---|---|---|
| `check.sh` | One word: `THREADBEAR_THREAD_KEY` is cleared with the other thread variables before the checks run | Release 2026-11-11 sets that key in a thread's shell. The script cleared the thread's id but not the key, and with one gone and the other left, two runner tests (`tb.test.ts`, `worktrees-landing.test.ts`) failed whenever the check ran from a thread, which is how `tb land` runs it |
| `web/src/share-history.test.ts` | The paced-stream test's CPU limit is 500 ms, not 100 | On this Mac under load it took 106.7 ms and refused a landing (`tb land`, 11 Nov 2026). The fault it guards against cost seconds, so 500 still catches it |
| `runner/test/deploy/deploy.test.ts` | One line: the fake repo also gets `src/secure-url.ts` | Release 2026-11-11 made `convex-admin.ts` import it, and every deploy test failed without it. Drop this row once a release of Mike's copies it too |
| `ios/ThreadbearKit/Tests/ThreadbearKitTests/MessageHistoryTests.swift` | The paced-stream test's time limit is 10 seconds, not 2 | On this M2 Pro it took 2.3 to 2.7 seconds inside `tb land`'s check and refused the landing twice (0.35 alone). Take Mike's side if he changes the limit |
| `runner/src/adapters/codex/adapter.ts`, `runner/test/unit/codex-adapter.test.ts` | Codex's "until the project is trusted" config warning isn't raised as a notice | It showed in the error bar for every new folder (10 Nov 2026) |
