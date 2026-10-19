# BrainBook / task-system — RUNBOOK

Team root for the `app-dev` Router team's BrainBook/task-system app. Owned by whichever worker Router/Themis selects for a given task (one writer per scope); AppAgent (`apppro`) is the supervisory receiver, not a writer here. Canon: `/Users/yuma/Documents/ObsidianVault/Vault/Agents/Teams/App-Development.md`. Measured facts behind the numbers below: `/Users/yuma/Documents/ObsidianVault/Vault/knowledge/app-dev-brainbook-facts-2026-10-19.md`.

## Run (dev)
```
npm run dev          # node server.mjs --dev, Vite dev server
npm run start         # node server.mjs (no --dev)
PORT=4199 node server.mjs   # second instance on another port, e.g. for UI testing before a rebuild
```
Default port if `PORT` is unset: 4173 (`server.mjs`). The installed macOS app binds 4183 (`BRAINBOOK_PORT`, see `macos/ship.sh`).

## Verify (run before calling anything done)
```
npm run smoke          # node server.mjs --smoke -> must print TASK_SYSTEM_OK, exit 0
npm run test:criteria  # node --test over jev-decisions/worker-router/next-work/live-work -> 45/45 pass as of 2026-10-19
npm run check:ts-scope # confirms every shipped .ts/.tsx is inside the tsc program (55 files as of 2026-10-19)
npm run check:release  # 23 release-metadata checks (version/build/licence/asset name) against release/release-info.mjs
```
A change is not verified by "it built" alone — run the test and check scripts above and read their actual pass/fail line, not just the exit code.

## Ship (the ONLY path that counts as "shipped")
```
macos/ship.sh
```
One atomic command, owner-mandated 2026-10-11 after a fix sat built-but-undeployed for 5+ hours while reported as done: `tsc --noEmit` -> `npm run build` -> Xcode build (`build-app.sh` is retired; Xcode via `ship.sh` is the only native build path since commit `3e3e992`) -> sha256 hash-verify the installed `.app`'s `dist/` matches what was just built -> quit+relaunch `/Applications/BrainBook.app` -> poll `http://127.0.0.1:$PORT/api/office` (default port 4183) for HTTP 200 within 15s. A non-zero exit means it did NOT ship; there is no partial-success state to interpret.

## Recover
- Server not answering: check `evidence/server.log` and `evidence/server.pid`; `BRAINBOOK_PORT=<port> curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:<port>/api/office` should return 200 once the process is actually up.
- `ship.sh` fails at the health check: the previous `/Applications/BrainBook.app` was moved (not deleted — `ship.sh` uses `mv`, not `rm -rf`, specifically for this) to a backup dir shown in its own output; restore it from there if the new build cannot be fixed quickly.
- A fresh clone cannot build the macOS app until `macos/node-self-contained` (Node v22.17.0, universal, sha256 `90a1636b7b14df6...`, not tracked in git since commit `93b37d0`) is fetched/copied into place separately.
- `git status --short` may show in-progress changes from another worker; do not resolve or commit someone else's uncommitted diff — that breaks the one-writer-per-scope rule. Check with Bigkiji/Router who currently holds this root before writing source here.

## Scope note
This file documents how to run/verify/recover the app; it does not grant AppAgent (or any non-selected worker) a write path into this root's source. Source edits, builds and ships are Router-selected `app-dev` worker actions, verified independently before AppAgent accepts the result (see `TEAM-STATE.md` in this same directory and the canon note above).
