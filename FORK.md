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
| `web/src/App.tsx` | Two imports; `Shell` returns the Bots page for the `bots` route while the experiment is on, and counts its id as "something is open"; `ThreadView` takes an optional `back` (default `/`, so nothing else changes) | The page sits where the sidebar and main column are, and reuses the site's own thread view for the chat |
| `docs/website.md` | A paragraph on the mock site and a section on the Bots page | Repo rule: docs stay true |
| `docs/experiments.md` | Generated (`npm run experiment-docs`) from the new experiment file | Repo rule |

### Files added

| File | What it is |
|---|---|
| `web/src/bots.ts`, `web/src/bots.test.ts` | The rules (which projects are bots, sections, order, the chat a bot opens, status, look, the switch) and their tests |
| `web/src/bots-page.tsx`, `web/src/bots.css` | The page and its look |
| `web/src/bots-avatar.tsx` | The 12 avatar shapes (our own drawings) and the rail icon |
| `web/mock/` | The site on made-up data with no backend, for looking at a page (dev server only) |
| `runner/src/experiments/bots.md` | The experiment's file. Its `reminder` is a placeholder: no check-in schedule is booked |
| `FORK.md` | This file |
