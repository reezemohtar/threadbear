---
id: bots
name: Bots page
title: Bots: the website's page of bots, and the runner's own record of each managed bot's main chat, tasks and reports
added: 2026-11-11
on: false
reminder: 00000000
---

## What it does

The website gets a Bots page, beside Threads, Scheduled and Projects (a tab on a phone). A bot is a project with a folder inside a folder named `bots`, like `~/work/bots/juno`. Each bot is one row: its robot-head avatar (a top, a head, eyes and a colour, set from the project until they can be picked), its name, one line saying what it last said, is doing or is asking you, the time, and marks for unread, working and needs you. Bots sit under Business, or under Personal when the project's goals have a line `Section: Personal`, and a bot with a starred open thread is pinned on top. Clicking a bot opens its main chat right there (the starred one of its open chats, else its oldest; never a job it started in the background), where you read, send and answer cards as on any thread; a bot with no open chat lets you start one in its folder. On a wide window a pane beside the chat shows the bot's role (the first line of its goals) and its recent chats. The bot's colour tints your bubble, the send button and a picked answer. In a bot's chat, replies are bubbles, a question or approval card sits in the conversation, and the message box is one pill; where the browser can turn speech into text on the device itself it has a mic, which never sends audio anywhere, and Send waits until it has stopped. A search button cuts the list down as you type, a section folds when you click its heading, and the pane has two tabs: Activity (the bot's tasks, which are the threads it started in the background, each with its state and a Stop while it works, then its recent chats) and Library (the open chat's pictures).

It's switched on per browser, as the website can't read `runner.json`: open the site once with `?experiment=bots` on the end of the address (`?experiment=bots-off` turns it off again). The `experiments.bots` switch in `runner.json` does nothing yet.

No check-in is booked for this one: `reminder` is a placeholder until the fork's owner allows schedules.

The runner's part needs the `experiments.bots` switch in `runner.json` and a list of the bots it manages: `"bots": { "managed": [ { "folder": "~/scratch/bots/juno", "deadlineMinutes": 120 } ] }`. None is managed until listed. For each one the runner keeps, in `bots.json` in its data folder, which thread is the bot's main chat (the first one you start in its folder) and the tasks that chat starts there. When a task's turn ends, the runner itself writes a report (finished, needs you, failed or stopped) with the task's last reply and what it made, and sends it to the bot's main chat. A task that hasn't reported by its deadline (2 hours unless you set another) is said once. More than 3 open tasks is said too. `tb rpc bots.list` shows the record. The website doesn't read it yet.

## Lives in

`web/src/bots.ts` (the rules, with `bots.test.ts`), `bots-loader.ts` (reading the projects, with its test), `bots-page.tsx`, `bots-lazy.tsx`, `bots-mic.tsx`, `bots-avatar.tsx`, `bots.css`; the `bots` route in `web/src/route.ts`, the rail entry in `rail.tsx`, and in `App.tsx` the branch in `Shell`, `ThreadView`'s `back`, and the optional `chat` look on `ThreadView`, `Dock` and `ApprovalCard`; `web/mock/` (the site on made-up data, for looking at the page). The runner's record: `runner/src/bots.ts` (with `test/unit/bots.test.ts`), built in `main.ts`, with one line each in `runner.ts` (`endTurn`, `delete`), `runner/new-threads.ts` (`create`) and `rpc.ts` (`bots.list`); `web/src/bots-folders.json` is the list of cases both copies of the folder rule are tested against. No backend or app code.

## Taking it out

Self-contained: delete the `web/src/bots*` files and `web/mock/`, then the lines that name them in `route.ts`, `rail.tsx` and `App.tsx`; and `runner/src/bots.ts` with its test, then the lines that name `bots` in `runner.ts`, `runner/new-threads.ts`, `main.ts` and `rpc.ts` (FORK.md lists them all). `bots.json` in the data folder can go.
