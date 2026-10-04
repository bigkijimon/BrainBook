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
- **Tasks**: the Control Center at the top of the page is the one place work enters and the one answer to "what next" — capture there, and read the Next Work List under it (board tasks, your Obsidian checklist lines, and anything an agent is waiting on you for). Below it sits the board and timeline with Work/Personal focus and a top-bar list of scheduled tasks. With the [OpenCode](https://opencode.ai) CLI installed, *Analyze* turns a task into a step-by-step plan.

## Install (Apple silicon Mac, macOS 13 or later)

1. Download `BrainBook-…-arm64.zip` from the [latest release](../../releases/latest). The file name and its version come from `release/release-info.mjs`, so this page cannot advertise a build that was not shipped.
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

## Release figures

Everything a download depends on — version, build number, bundle id, minimum macOS, architecture, the
packaged asset name and the release link — is declared once in [`release/release-info.mjs`](release/release-info.mjs).
`macos/build-app.sh` generates `Info.plist` from it and names the zip with the asset name the same
module prints, and this README only states the pattern the module derives. `npm run check:release`
recomputes all of it and fails when a surface disagrees, including when some new file writes a
concrete `BrainBook-<version>` by hand.

Plan, price and payment provider are **not** declared yet: they are the owner's decision (provider,
account, tax handling, licence), and a guessed figure must not reach a download page. When they are
decided they belong in the same declaration, so the price shown in the app and the price in a release
note are checked against each other rather than typed twice.

## Jev's decision points

Jev is advice, never a decision. `jev-decisions.mjs` is the one place that says whether a Jev answer may
be used (pass) or must be sent back and replaced (fall back). A caller passes the raw answer and reads the
verdict; the rules are never repeated at the call site.

| Decision point | Question | May answer | May not | Sent back to |
| --- | --- | --- | --- | --- |
| `task-priority` | How urgent is this new or edited task? | `low`, `normal`, `high` with confidence ≥ 0.72 | never start work, approve anything or spend | the local classifier, then the deterministic rules |
| `worker-lane` | Which lane should take this task? | one bounded free lane id with confidence ≥ 0.72 | never pick the worker, name a paid worker, or approve spending | the deterministic stream rules |
| `repair-or-hold` | After a failed check, retry the free lane or hold for the owner? | `retry` or `hold_for_owner` | never grant paid escalation: a failed free attempt is not spending authority | `hold_for_owner` |

An answer is sent back with one of six codes, and each send-back falls back on its own row. Each code has one
meaning, in the words the log shows (`JEV_SEND_BACK_MEANING`), and the reason is generated from that table, so a
reason always says which point refused, what the code means, and what actually failed:

- `no_answer` — nothing usable came back.
- `provider_refused` — the provider did not answer (`disabled`, `budget_exhausted`, an error, or a different source such as the Router's own deterministic rule). Attribution and ability-to-answer are read as two separate facts, because the Router reports them on two fields: `"source":"jev"` says the decision is Jev's advice, and `"status":"ready"` says it produced one. An answer the Router refused is a refusal, not a value out of range. A field that is simply absent is not a reported refusal — it says nothing, and the value and confidence rules judge what is there.
- `over_authority` — the answer claimed a decision Jev must not make: approval, spending, escalation, or naming a paid lane. A lane id is paid when it contains a paid name once `-._:` are dropped, so `claude-code`, `claude.code` and `claudecode` are one lane and all three are refused; the id the app actually ships is `claudecode` (`server.mjs` `ROUTER_DIRECT`, `office-map.json` `profiles`, `agent-feed.py` `AGENT_NAME`), and a word-boundary match missed it. The paid names are the single exported list `JEV_PAID_LANES`, and `tests/jev-decisions.test.mjs` reads the paid ids back out of those three tables, so adding a paid lane to the product fails the test instead of becoming advice. The rule is one predicate, `isFreeLaneId`, and it is applied to **both** branches of a Router lane answer — Jev's advice and the Router's own deterministic decision — because free-only execution is an invariant of the app, not of one branch; a deterministic answer naming `claudecode` used to be forwarded unchecked. Cost and budget figures a provider reports *about* the run (`budget`, `cost_policy`) are metadata, not a claim, and never send an otherwise valid answer back; only the answer's own value and an explicit approval, escalation or spending flag can.
- `out_of_range` — the value is not an allowed answer (an enum for priority and repair, a bounded lane token for routing).
- `low_confidence` — the confidence is below the floor: a real number under 0.72. A send-back never invents a confidence; it falls back.
- `unusable_confidence` — there is no confidence to read: the field is missing, empty, not a number, or outside 0–1 (a provider answering `1.4` or `"very"` is broken, not hesitant). Uncertainty and nonsense are separate codes so a log can be triaged without guessing.

Two adapters reach Jev, and both are judged by those same rules:

- `task-priority` — the local helper (`AI/router/jev/task_priority.py`), which reads one opaque task hash and the bounded title/description from stdin.
- `worker-lane` — your Router itself (`<router> --json --check --origin hermes "<task text>"`, in `worker-router.mjs`, through `judgeRouterLane`). Only an answer the Router reports as `"source":"jev"` is treated as advice; the Router's own deterministic decision is used as it is, except that it may not name a paid lane, and every send-back leaves the deterministic stream lane in place.

Not yet confirmed: the `worker-lane` envelope is your Router's contract, and `tests/worker-router.test.mjs` exercises it against a stand-in Router script. Capturing one real `--check --origin hermes` answer with `"source":"jev"` and committing it as a fixture is still open.

Sent-backs are logged by one function, `formatJevSendBack`, as `decision support sent back: <point>/<code> -> <fallback>`
with no task text and no provider answer, so the record an unattended run leaves is the same line whichever
adapter produced it. Every Kanban card repeats the `repair-or-hold` point and the send-back codes in its rules,
generated from the same declaration, so the words Bigkiji reads cannot drift from the enforced criteria.

Run the checks that reach this declaration with `npm run test:criteria`; the full suite is `node --test tests/*.test.mjs`. `test:criteria` also runs `tests/next-work.test.mjs`, the contract for the Next Work List ranking (`src/next-work.mjs`), so the one ranked queue is checked on every criteria run.

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

## Agent construction (multi-agent setup)

Want **Run** to dispatch across more than one coding agent, with cheap work on a free/local
model and hard work on a paid one? See [`docs/agents/`](docs/agents/) for a generic Hermes
profile template, a minimal task-router sample, and two sanitized operating skills — no
company-specific data, just the pattern.

## Build from source

Requirements: Apple silicon Mac, Xcode Command Line Tools, and Node.js 22 or later.

```bash
git clone https://github.com/<owner>/brainbook.git
cd brainbook
npm install
npm run build
node scripts/test-task-focus.mjs && node scripts/test-priority.mjs
node scripts/test-ideas.mjs && node scripts/test-remote.mjs   # tests
npm run test:criteria                                         # Jev pass/send-back criteria + the Next Work List contract
npm run check:release                                         # release figures agree with the declaration, the plist and this page
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

- **Run** on a task card — or on its row in the Control Center — creates one card on the Hermes Kanban board `owner`, assigned to Bigkiji (profile `default`). The Hermes gateway dispatcher checks every 60 seconds, all day, so work starts even when the owner is away. BrainBook never runs work itself (one scheduler only).
- Every way the app adds work lands on the Control Center: **New task**, the `N` key and **Capture another** in the Inbox all open that one capture box, and the Next Work List under it is the only ranked queue (agents waiting on you → needs attention → overdue → today → high priority → due this week → the rest, including the open lines of your own `Projects/Next-Work-List.md`). The ranking is one function, `src/next-work.mjs`, and the Run state of a row is the Run state of its card. The top-bar **Run** button is a shortcut to that list, not a second queue and not a third capture box; a task is handed to Bigkiji from a row in the list or from the card. One piece of work is one row: an agent stopped on a card that is already in the list adds its reason to that row instead of listing the same work twice.
- New **Work** tasks with **high** priority start automatically; everything else waits for Run. Personal tasks never auto-run.
- Bigkiji routes engineering through the AI Router: free workers selected for the task and capable free reviewers for QA/debugging. Claude Code is the coordinating brain; a failed free attempt grants no paid escalation authority. Codex is retired (its files are kept).
- GPU tasks (video, render, ComfyUI, keyframes, local models) are parked in **Scheduled**. The Hermes cron job `night-gpu-window` (`~/Documents/Hermes/.hermes/scripts/night-gpu-window.sh`, every 10 minutes) releases one at a time between 01:00 and 06:00, only when ComfyUI is idle and no `movie-pro.operator-hold` exists.
- Card state follows the Kanban card (refreshed every 20 seconds while anything runs): Queued → Running (animated border) → Done, or Needs you when Bigkiji blocks.
- The Mac must be awake; a sleeping Mac pauses the dispatcher.
- Test: `node scripts/test-run.mjs` (uses a fake `hermes` CLI; creates no real cards).

### Optional external Graphify output

Set `BRAINBOOK_GRAPHIFY_PATH` to the existing graph JSON when moving derived Graphify output outside the Vault. The default remains `<vault>/graphify-out/graph.json` until that migration is verified. BrainBook only reads this file; it does not rebuild or move graphs. A code-graph timestamp does not prove that Markdown semantics are current.
