# BrainBook

**Get the ideas out of your head, see how they connect, and start working on them with Hermes.**

BrainBook is a Mac app with an 80s Vice City look. Ideas are saved as Markdown notes in an [Obsidian](https://obsidian.md) vault on your Mac, so Obsidian, BrainBook and your AI agents all read the same files. Notes and task storage stay local. Optional Router and OpenCode features use the provider settings on your own Mac; do not enable them with sensitive task text unless you have reviewed those providers.

- **Dump**: type everything that's on your mind, one line per idea. Indent a line to make it a branch of the idea above it.
- **Map**: see every idea by name, grouped by topic. A light shows where each one stands: gold = done, pulsing pink = in progress, cyan ring = taking shape, dim = still a seed. **Tree** and **Map** give you a 3D brain view of how ideas connect.
- **Build**: press ▶ on an idea to paste it, with connected ideas, into the existing local [Hermes](https://hermes-agent.nousresearch.com) Dashboard input. BrainBook reuses `http://127.0.0.1:9119/`; it never starts another Hermes process. Nothing runs until you press Enter.
- **Pick up where you stopped**: *Save where I stopped* records what you did and your next step in the note itself.
- **Level up**: finishing an idea gives XP. XP is always recalculated from your notes.
- **Your own character**: choose a name and picture for your companion in the profile menu.
- **Phone**: open BrainBook on your iPhone or Android through [Tailscale](https://tailscale.com). It stays on your private network and never goes onto the open internet.
- **Tasks**: a board and timeline with Work/Personal focus and a top-bar list of scheduled tasks. With the [OpenCode](https://opencode.ai) CLI installed, *Analyze* turns a task into a step-by-step plan.

## Install (Apple silicon Mac, macOS 13 or later)

1. Download `BrainBook-…-arm64.zip` from the [latest release](../../releases/latest).
2. Double-click the zip, then drag **BrainBook.app** into your **Applications** folder.
3. The app isn't signed by Apple, so macOS blocks the first launch. To allow it:
   - Open BrainBook once. When macOS says it can't be opened, click **Done**.
   - Go to **System Settings → Privacy & Security**, scroll down and click **Open Anyway** next to BrainBook.
   - Or, in Terminal: `xattr -dr com.apple.quarantine /Applications/BrainBook.app`
4. Open BrainBook. On first launch it asks for your name and where your ideas should live:
   - If you already use Obsidian, pick your vault. BrainBook writes only to its `ideas` folder.
   - If you don't, choose **Start a new vault**. You can open that folder in Obsidian later with **Open folder as vault**.

5. If your vault is in **Documents** (or Desktop, or iCloud Drive), macOS asks: *"BrainBook" would like to access files in your Documents folder.* Click **Allow**. BrainBook waits until you answer, so if it seems stuck on first launch, look for this dialog. It may be behind other windows or on another screen.

That's everything. BrainBook includes its own runtime, so you don't need Node.js.

### Optional extras

- **Hermes**: install [Hermes Agent](https://hermes-agent.nousresearch.com/docs) and start its local Dashboard to use the right-hand pane and ▶ Start in Hermes. BrainBook does not start or expose the Dashboard; it must already answer on `127.0.0.1:9119`. Without Hermes, everything else still works.
- **Phone**: install Tailscale on both the Mac and the phone and sign in to the same account. In BrainBook, click the phone icon, switch **Phone access** on and scan the QR code. Once it opens, choose *Add to Home Screen* on the phone.
- **Your own topics**: ideas are sorted into general topics (AI / Agents, Code / Apps, Game / 3D, Content, Business, Study). To use your own, create `~/Library/Application Support/BrainBook/streams.json`:

  ```json
  { "streams": [
    { "id": "shop", "label": "My shop", "color": "#ff7a45", "patterns": ["shop", "inventory", "pop-up"] },
    { "id": "band", "label": "Band", "color": "#2be8d9", "patterns": ["gig", "song", "rehearsal"], "priority": "high" }
  ] }
  ```

  `patterns` are words, or regular expressions, that decide which ideas and tasks go on that topic. `"priority": "high"` marks that topic's tasks as high priority. Restart BrainBook after editing.
- **Settings**: to change your name or vault later, open the profile menu (the letter in the top-right corner) and choose **Settings…**.

### Task priority

- Manual priority always wins. Clear high/low signals use BrainBook's local rules; only a new task or an explicit title/description edit can invoke a model.
- Jev is off unless the server process has both `JEV_TASK_PRIORITY_ENABLED=1` and `JEV_CONTROL_ENABLED=1`. When enabled, it shares the Router's existing $1 monthly ceiling. If Jev is disabled, unavailable, over budget, or returns an unusable answer, BrainBook tries the configured local classifier before using its deterministic rules.
- The local classifier reads the canonical model and endpoint from `~/Documents/SystemAPPS/Developer-Settings/.config/local-ai/config.json`. It never starts or switches a model. Before sending the bounded title/description input to llama.cpp on loopback, BrainBook verifies the served model ID and checks that ComfyUI is not using the shared GPU. If either check is uncertain, it skips inference and keeps the deterministic priority.
- Local answers are constrained to a small JSON schema and checked again by BrainBook. With Jev explicitly enabled, Jev receives the bounded title/description and a stable opaque task hash, never the raw task ID; the local model receives only bounded title/description text and no task ID. Raw task IDs and free-form model explanations are not logged. The inspector labels whether priority came from Jev, the local model, a manual choice, or local rules.
- The JSON-schema request follows [llama.cpp's structured-output/grammar documentation](https://github.com/ggml-org/llama.cpp/blob/master/grammars/README.md).

## Where your data lives

| What | Where |
| --- | --- |
| Ideas | `<your vault>/ideas/*.md` (normal Markdown notes) |
| Settings, tasks, character, topics, paired phones | `~/Library/Application Support/BrainBook/` |
| Logs | `~/Library/Logs/BrainBook/` |

To uninstall, delete the app. Delete the Application Support folder too if you want to remove your settings; your idea notes stay in your vault.

## How an idea note looks

```markdown
---
title: "Open a small coffee stand"
status: "active"          # draft · active · done · parked
next_step: "Ask the landlord about rent"
---
# Open a small coffee stand

## Links
- [[idea-…|Find a spot near the station]]

## Progress
- 2026-09-29 00:50 — Walked around the station, found 2 spots → next: Ask the landlord about rent
```

Hermes (and any other agent) can update `## Progress` and `next_step` too, so the lights stay accurate whoever did the work.

## Build from source

Requirements: Apple silicon Mac, Xcode Command Line Tools, and Node.js 22 or later.

```bash
git clone https://github.com/<owner>/brainbook.git
cd brainbook
npm install
npm run build
node scripts/test-task-focus.mjs && node scripts/test-priority.mjs
node scripts/test-ideas.mjs && node scripts/test-remote.mjs   # tests
macos/build-app.sh             # builds and installs /Applications/BrainBook.app
macos/build-app.sh --package   # builds a zip for sharing, in macos/build/
```

For development, `npm run dev` serves the UI with hot reload at http://127.0.0.1:4173. Set `OBSIDIAN_VAULT_PATH=/path/to/vault` to try it on a copy of a vault.

## Privacy and safety

- The server listens on `127.0.0.1` only. Phone access is off by default. When you switch it on, BrainBook listens only on your Tailscale address, and each phone must be paired with a one-time QR code.
- The native right pane can only reach the existing Hermes Dashboard on loopback. The BrainBook app server never proxies that UI to phones. Local idea handoffs only paste into the Dashboard input and never press Enter. Paired phones retain the separate authenticated terminal path.
- BrainBook writes only inside `<vault>/ideas`. Checking off a reminder changes only that one checkbox line in its note.

## License

MIT. See [LICENSE](LICENSE).

## Run (24/7 hand-off to Bigkiji)

- **Run** on a task card creates one card on the Hermes Kanban board `owner`, assigned to Bigkiji (profile `default`). The Hermes gateway dispatcher checks every 60 seconds, all day, so work starts even when the owner is away. BrainBook never runs work itself (one scheduler only).
- New **Work** tasks with **high** priority start automatically; everything else waits for Run. Personal tasks never auto-run.
- Bigkiji routes engineering through the AI Router: MiMo first, Claude Code as the paid escalation. Codex is retired (its files are kept).
- GPU tasks (video, render, ComfyUI, keyframes, local models) are parked in **Scheduled**. The Hermes cron job `night-gpu-window` (`~/Documents/Hermes/.hermes/scripts/night-gpu-window.sh`, every 10 minutes) releases one at a time between 01:00 and 06:00, only when ComfyUI is idle and no `movie-pro.operator-hold` exists.
- Card state follows the Kanban card (refreshed every 20 seconds while anything runs): Queued → Running (animated border) → Done, or Needs you when Bigkiji blocks.
- The Mac must be awake; a sleeping Mac pauses the dispatcher.
- Test: `node scripts/test-run.mjs` (uses a fake `hermes` CLI; creates no real cards).
