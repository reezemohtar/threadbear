---
id: bots
name: Bots page
title: Bots page: the website shows one row per bot (a project in a bots folder), with its chat beside it
added: 2026-11-11
on: false
reminder: 00000000
---

## What it does

The website gets a Bots page, beside Threads, Scheduled and Projects (a tab on a phone). A bot is a project with a folder inside a folder named `bots`, like `~/work/bots/juno`. Each bot is one row: its shape and colour, its name, one line saying what it last said, is doing or is asking you, the time, and marks for unread, working and needs you. Bots sit under Business, or under Personal when the project's goals have a line `Section: Personal`, and a bot with a starred open thread is pinned on top. Clicking a bot opens its newest open chat right there, where you read, send and answer cards as on any thread; a bot with no open chat lets you start one in its folder. On a wide window a pane beside the chat shows the bot's role (the first line of its goals) and its recent chats. The bot's colour tints your bubble, the send button and a picked answer.

It's switched on per browser, as the website can't read `runner.json`: open the site once with `?experiment=bots` on the end of the address (`?experiment=bots-off` turns it off again). The `experiments.bots` switch in `runner.json` does nothing yet.

No check-in is booked for this one: `reminder` is a placeholder until the fork's owner allows schedules.

## Lives in

`web/src/bots.ts` (the rules, with `bots.test.ts`), `bots-loader.ts` (reading the projects, with its test), `bots-page.tsx`, `bots-avatar.tsx`, `bots.css`; the `bots` route in `web/src/route.ts`, the rail entry in `rail.tsx`, and the branch in `Shell` and `ThreadView`'s `back` in `App.tsx`; `web/mock/` (the site on made-up data, for looking at the page). No backend, runner or app code.

## Taking it out

Self-contained: delete the `web/src/bots*` files and `web/mock/`, then the lines that name them in `route.ts`, `rail.tsx` and `App.tsx` (FORK.md lists them).
