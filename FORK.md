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

## Fixes to Mike's code, until his release has them

| File | Change | Why |
|---|---|---|
| `check.sh` | One word: `THREADBEAR_THREAD_KEY` is cleared with the other thread variables before the checks run | Release 2026-11-11 sets that key in a thread's shell. The script cleared the thread's id but not the key, and with one gone and the other left, two runner tests (`tb.test.ts`, `worktrees-landing.test.ts`) failed whenever the check ran from a thread, which is how `tb land` runs it |
| `web/src/share-history.test.ts` | The paced-stream test's CPU limit is 500 ms, not 100 | On this Mac under load it took 106.7 ms and refused a landing (`tb land`, 11 Nov 2026). The fault it guards against cost seconds, so 500 still catches it |
| `runner/test/deploy/deploy.test.ts` | One line: the fake repo also gets `src/secure-url.ts` | Release 2026-11-11 made `convex-admin.ts` import it, and every deploy test failed without it. Drop this row once a release of Mike's copies it too |
| `ios/ThreadbearKit/Tests/ThreadbearKitTests/MessageHistoryTests.swift` | The paced-stream test's time limit is 10 seconds, not 2 | On this M2 Pro it took 2.3 to 2.7 seconds inside `tb land`'s check and refused the landing twice (0.35 alone). Take Mike's side if he changes the limit |
| `runner/src/adapters/codex/adapter.ts`, `runner/test/unit/codex-adapter.test.ts` | Codex's "until the project is trusted" config warning isn't raised as a notice | It showed in the error bar for every new folder (10 Nov 2026) |
