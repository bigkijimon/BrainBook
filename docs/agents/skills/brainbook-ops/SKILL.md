---
name: brainbook-ops
description: Use when BrainBook phone, Ideas, or team view misbehave.
---

# BrainBook operations

Source: `<app root>` (your clone of the BrainBook repo). Installed app:
`/Applications/BrainBook.app` (a built copy of the source; after editing source, run
`macos/build-app.sh`, then quit and reopen the app). Log: `~/Library/Logs/BrainBook/server.log`.
State: `~/Library/Application Support/BrainBook/`.

## Rules

- Back up files you are about to edit before changing them (there is no git history unless you
  initialized one — do `git init` once if you haven't).
- Run tests before rebuilding: `node --test tests/*.test.mjs` and any `node scripts/test-*.mjs`.
- Verify phone changes on a real paired device: pair a throwaway device
  (`POST /api/remote/pair` on `127.0.0.1`, claim it over your Tailscale network), drive the page
  at 390x844 in a browser, then delete the test device with `DELETE /api/remote/devices/<id>`.
  Never remove your own real phone's pairing.
- A phone session that renders but ignores key presses is frozen, not idle — its animation
  keeps drawing so "it looks alive" is not a correctness signal. Force-restart from the phone's
  on-screen control. Starting fresh always opens a new terminal/chat session; prior history is
  still reachable through your agent's own resume/history feature.
- Image attach from phone: the attach button posts to `/api/terminal/image`. The server saves
  it under `attachments/` and the path gets pasted into the input, then your agent is expected
  to pick it up from there. HEIC images get re-encoded to JPEG client-side.
- The Ideas list reads `<your vault>/ideas/*.md` and skips `ideas/archive/`. If you build an
  automated sweep that archives stale machine-drafted notes, mark your own hand-written notes
  with a flag (e.g. `curated: true`) so the sweep never touches them.
- Any "team status" or "live agent" view should read from a small, explicit mapping of
  process-name → member, not from free-text matching. When you add a new background job/tool,
  add it to that mapping — do not special-case it with an if/else chain.
- Test UI changes on a second dev server (e.g. `PORT=4199 node server.mjs`) before rebuilding
  the installed app. Check layouts at both a desktop width (~1280-1440px) and a phone width
  (390x844).
- `build-app.sh` only copies files it is told to copy. If you add a new top-level `.mjs` module
  that the server imports, make sure the build script includes it — a missing module makes the
  installed server fail to start silently. After every rebuild, curl the server's local port
  and confirm you get a 200 response before calling it done.
- A dev server started without your app's "data home" env var set may silently point at a
  different config than production (e.g. an old vault path). Check which config file a
  debugging session is actually reading before trusting what it shows you.

## General lessons that generalize beyond BrainBook

- Hierarchy (who reports to whom) in any dashboard should be driven by data (a parent/child
  mapping), not hardcoded into the rendering component — this way adding a new team member
  anywhere in the tree doesn't require a UI change.
- When several independent sessions might build the same thing in parallel (e.g. two people or
  two agents both noticing a missing feature), grep for existing work in the obvious location
  before starting — duplicated build-outs are expensive to merge later.
- A small restore (e.g. starting a stopped local server) is fine to do immediately while
  diagnosing a bigger issue, but say so explicitly and don't let it stand in for the real fix.
