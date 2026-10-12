# BrainBook

**Get the ideas out of your head, see how they connect, and start working on them with Hermes.**

BrainBook is a Mac app with an 80s Vice City look. Ideas are saved as Markdown notes in an [Obsidian](https://obsidian.md) vault on your Mac, so Obsidian, BrainBook and your AI agents all read the same files. Notes and task storage stay local. Optional Router and OpenCode features use the provider settings on your own Mac; do not enable them with sensitive task text unless you have reviewed those providers.

- **Dump**: type everything that's on your mind, one line per idea. Indent a line to make it a branch of the idea above it.
- **Map**: see every idea by name, grouped by topic. A light shows where each one stands: gold = done, pulsing pink = in progress, cyan ring = taking shape, dim = still a seed. **Tree** and **Map** give you a 3D brain view of how ideas connect.
- **Build**: use an idea’s copy action to copy its contextual instruction, including connected ideas and saved progress. Paste it into your existing external Hermes session when you want to continue. BrainBook no longer embeds a Hermes terminal or Dashboard pane.
- **Pick up where you stopped**: *Save where I stopped* records what you did and your next step in the note itself.
- **Level up**: finishing an idea gives XP. XP is always recalculated from your notes.
- **Your own character**: choose a name and picture for your companion in the profile menu.
- **Phone**: open BrainBook on your iPhone or Android through [Tailscale](https://tailscale.com). It stays on your private network and never goes onto the open internet.
- **Tasks**: the Control Center at the top of the page is the one place work enters and the one answer to "what next" — capture there, and read the Next Work List under it (board tasks, your Obsidian checklist lines, and anything an agent is waiting on you for). Home also shows compact goals, agent status and conversations. The Tasks tab holds the board and timeline; Ideas holds the Obsidian shelf and tree. Scheduled tasks remain reachable from the top bar. With the [OpenCode](https://opencode.ai) CLI installed, *Analyze* turns a task into a step-by-step plan.

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

- **Hermes**: install [Hermes Agent](https://hermes-agent.nousresearch.com/docs) and use your existing external session for copied idea instructions. The native window reserves a standard draggable titlebar and uses its full content width. View menu shortcuts are ⌘1 Home, ⌘2 Ideas, ⌘3 Agent status, and ⌘4 Tasks.
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
packaged asset name, the release link, the licence and the price — is declared once in
[`release/release-info.mjs`](release/release-info.mjs). `macos/build-app.sh` generates `Info.plist`
from it and names the zip with the asset name the same module prints, and the app's screens read the
version from it, so this README only states the pattern the module derives. `npm run check:release`
recomputes all of it and fails when a surface disagrees, including when some new file writes a
concrete `BrainBook-<version>` by hand.

Plan, price, currency, payment provider and checkout link are declared in that same file, and are
**not set yet**. They are the owner's decision (provider, account, tax, refunds), and a guessed figure
must not reach a download page. The licence is declared there too, because [`LICENSE`](LICENSE) is
MIT; `npm run check:release` reads that file and fails if the wording ever says something else. The
same check fails when a concrete price is written anywhere outside the one declaration, so the price
on a page and the price in a release note are compared rather than typed twice. It also fails when the
app stops reading that file for the offer, so the account menu cannot drift away from this page.

### Price and payment

BrainBook has no plan or price set yet, so there is no checkout to link to.

Deciding it is one edit in [`release/release-info.mjs`](release/release-info.mjs): set
`purchase.amount`, `purchase.currency`, `purchase.provider`, `purchase.checkoutUrl` and
`purchase.status`. This page, the app's account menu (the letter in the top-right corner) and any
release note read the wording from that object, so nothing states the price a second time — and the
account menu's **Buy BrainBook** action appears by itself, because its link is only rendered when the
whole offer is declared. Until then the download is the whole offer: get
`BrainBook-…-arm64.zip` from the [latest release](../../releases/latest), unzip it, and move
**BrainBook.app** into `/Applications`.

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
- `over_authority` — the answer claimed a decision Jev must not make: approval, spending, escalation, or naming a paid lane. A lane id is paid when it contains a paid name once `-._:` are dropped, so `claude-code`, `claude.code` and `claudecode` are one lane and all three are refused. The app ships three ids for that one paid lane — `claude` (the Router's own worker id, `agent-feed.py` `ROUTER_WORKERS` and `AGENT_NAME`), `claudecode` (the Hermes profile behind it, `server.mjs` `ROUTER_DIRECT`, `office-map.json` `profiles`) and `codex` (retired, files kept) — and a word-boundary match had no boundary inside `claudecode`, so a shipped id was accepted as free. The paid names are the single exported list `JEV_PAID_LANES`, and `tests/jev-decisions.test.mjs` reads those three ids back out of those three tables and holds them against the rule, so adding a paid lane to the product fails the test instead of becoming advice. The rule is one predicate, `isFreeLaneId`, and it is applied to **both** branches of a Router lane answer — Jev's advice and the Router's own deterministic decision — because free-only execution is an invariant of the app, not of one branch; a deterministic answer naming `claudecode` used to be forwarded unchecked. Both branches also refuse a paid lane with the same code and the same sentence, so one lane can never be logged two ways. Cost and budget figures a provider reports *about* the run (`budget`, `cost_policy`) are metadata, not a claim, and never send an otherwise valid answer back; only the answer's own value and an explicit approval, escalation or spending flag can.
- `out_of_range` — the value is not an allowed answer (an enum for priority and repair, a bounded lane token for routing).
- `low_confidence` — the confidence is below the floor: a real number under 0.72. A send-back never invents a confidence; it falls back. An *accepted* Router decision never invents one either: it shows the confidence the Router reported, or the one declared fallback if it reported none.
- `unusable_confidence` — there is no confidence to read: the field is missing, empty, not a number, or outside 0–1 (a provider answering `1.4` or `"very"` is broken, not hesitant). Uncertainty and nonsense are separate codes so a log can be triaged without guessing.

Two adapters reach Jev, and both are judged by those same rules:

- `task-priority` — the local helper (`AI/router/jev/task_priority.py`), which reads one opaque task hash and the bounded title/description from stdin.
- `worker-lane` — your Router itself (`<router> --json --check --origin hermes "<task text>"`, in `worker-router.mjs`, through `judgeRouterLane`). Only an answer the Router reports as `"source":"jev"` is treated as advice, and only that advice has to clear the 0.72 floor. The Router's own deterministic decision is used as it is, **including the confidence it reported**: the single number `ROUTER_OWN_DECISION_CONFIDENCE` (0.76) is only the fallback for a decision that reported none, so the figure on a row is always a figure someone measured. It may still not name a paid lane, and every send-back leaves the deterministic stream lane in place.

Not yet confirmed: the `worker-lane` envelope is your Router's contract, and `tests/worker-router.test.mjs` exercises it against a stand-in Router script. Capturing one real `--check --origin hermes` answer with `"source":"jev"` and committing it as a fixture is still open.

Sent-backs are logged by one function, `formatJevSendBack`, as `decision support sent back: <point>/<code> -> <fallback>`
with no task text and no provider answer, so the record an unattended run leaves is the same line whichever
adapter produced it. Every Kanban card repeats the `repair-or-hold` point and the send-back codes in its rules,
generated from the same declaration, so the words Bigkiji reads cannot drift from the enforced criteria.

Run the checks that reach this declaration with `npm run test:criteria`; the full suite is `node --test tests/*.test.mjs`. `test:criteria` also runs `tests/next-work.test.mjs`, the contract for the Next Work List ranking (`src/next-work.mjs`), so the one ranked queue is checked on every criteria run — including the two row labels the owner was shown after an earlier round printed `App Dev · [object Object]` and `Next Work List · [object Object]`. Those two strings are the words half of the acceptance criterion and they are pinned in that contract, so `test:criteria` alone cannot go green on a row label that is not text. `npm run build` runs that contract too, and **fails** on it: `src/next-work.mjs` is plain JS outside the tsc program, so without it a build could stay green over a module rewritten to print `[object Object]` again, which is exactly what the round that reported `tsc` plus `build` as its evidence did.

What the contract cannot see is what the list *renders*, and that is a separate gate: `npm run test:control-center` drives the real card in a browser (`scripts/control-center-harness`) and measures it — no row label may read `[object Object]`, no row text may be cut, every rank is a word plus a glyph, every text pair clears 4.5:1 against the worst backdrop it can land on, every control on a phone is a 44px target, and `prefers-reduced-motion` stops the running row. **`npm run build` runs this measurement**, because a criterion that lives in a script no gate calls is a criterion no run can fail: the round before this one shipped a correct module, a correct component and this measurement script, and an `evidence/` folder with zero Control Center files in it, because nothing in the supplied checks ever called it. The build **fails** when the measurement runs and a row label reads `[object Object]`; on a machine with no Chromium it **warns and says UNVERIFIED** rather than dying, and it never lets a missing browser read as a passing card.

The measurement writes the two captures the owner's acceptance criterion is stated in to `evidence/`, and it writes `evidence/control-center-manifest.json` **before the first check**, carrying the status (`running`), a sha256 fingerprint of `src/ControlCenter.tsx`, `src/next-work.mjs`, `src/styles.css` and `scripts/control-center-harness/main.tsx` — the four files that decide every row — and the captures the run owes; it deletes any capture an earlier run left, and rewrites the manifest at the end with each capture's own hash and every failed check. Absent manifest = never measured here, `running` = a run that did not finish, `complete` + fingerprint = the only state that describes a picture. `npm run build` reads that fingerprint too (`scripts/check-harness-build.mjs`, half 5) and prints `ok   Control Center evidence describes this source`, or warns which files changed under the captures and names the ones sitting in the folder unattributed. The captures and the manifest are un-ignored in `.gitignore`: an ignored capture is a file no review of the change can open, so the proof of this card's own acceptance criterion was unreachable however many times it was regenerated — and `npm run build` now warns if a `.gitignore` edit swallows them again.

Every string the card prints — the row label, the Run button's accessible name, the Obsidian tick's name, the rank pill's word, the id each row's `aria-describedby` points at — is built in `src/next-work.mjs` beside the numbers rows are ranked by, and passes through one exported guard, `asText`. That is the fix for the round this card was failed for: the first attempt guarded `title` and `detail` inside the module and left the component free to concatenate its own strings out of raw `task.title` and `row.key`, which is the same bug through a different door — `aria-label="Run: [object Object]"`, or a `.replace` TypeError on a record `row.key`. `tests/next-work.test.mjs` pins every one of those joins, so `npm run test:criteria` fails on the seam, not only on the module. Treat a round that changes this card as unfinished until `test:criteria` and `test:control-center` have both been run on this machine and both are green.

The team popup's acceptance criterion is a picture too — *the whole chain on one screen* — so it is measured the same way: `npm run test:team-sheet` drives the real left-rail popup (`scripts/team-sheet-harness`) in a browser. Every card the server can send is opened at all five viewports (1440x900, 1440x700, 1280x720, 1024x768, 390x844), and which cards those are is read off the rail's own `data-team` rather than out of a list in the test: four of the eight teams were never measured at any viewport while the file printed ok throughout, and only a check that compares the measurement against the product can catch that. The heaviest card is measured as a **bound** — fifteen members (a Router card's seven-member lane plus eight configured profiles) carrying the server's own sixteen role chips and ten work rows, the union of the two tallest cards in the roster — because a fit that holds only on today's longest team is a claim about today's roster, not about the layout. "Fits one screen" is checked as headroom rather than as absence of a scrollbar: the popup has to end half a member row clear of its own height cap (a clamped popup needs a scrollbar the moment a member is added), and the grid's free cells are filled with real cards and the popup measured again. Its captures also go to `evidence/`, so treat a round that changes this card as unfinished until `npm run verify:popup` — `test:team-sheet` then `test:voice`, so a handover cannot ship one and forget the other — has been run on this machine and printed `TEAM_SHEET_FIT_OK` and `VOICE_OK`. Each capture is now written *before* the assertions that can fail, and the run writes `evidence/team-sheet-measurements.json` either way: a check that asserts first and captures last leaves no file behind when it fails, which is how three captures went missing while the round reported the fit as measured — a red run has to leave the picture and the numbers that explain it.

Those two files only prove a run *reached its tail*. What makes `evidence/` self-describing — so a folder of PNGs can never again read as a finished run, and a picture can be tied to the source that produced it — is `evidence/team-sheet-manifest.json`, written by the same command *before* it launches anything. Read `status` first: absent = never measured here, `running` = a run started and did not finish, `failed` = it finished and `checksFailed` says why, `complete` = every capture is on disk and every check passed. `layoutFingerprint` is a sha256 over `src/TeamRail.tsx`, `src/styles.css`, `src/agentRoster.ts` and `scripts/team-sheet-harness/main.tsx` — the four files that decide every pixel in the pictures — and each entry in `captures[]` carries that PNG's own size and hash. `npm run build` reads the same fingerprint (`scripts/check-harness-build.mjs`, half 3) and prints `ok team-popup evidence describes this source` or warns which files changed under the captures; it warns rather than fails on purpose, because a build that waits on a browser measurement turns a screenshot into a hostage instead of evidence. Every one of those warnings also **names the popup captures it found sitting in the folder unattributed**, from the same list the run writes (`POPUP_CAPTURES` in `scripts/source-fingerprint.mjs`), because "the team popup has never been measured on this tree" is what you say about an empty folder and `evidence/` has twice not been empty: five `team-sheet-*.png` files made by a stylesheet that has since changed, with nothing on disk to attribute them, read exactly like a finished run. If a build lists captures by name, those files describe no source — do not open them as evidence, and run `npm run verify:popup` (`test:team-sheet` then `test:voice`), which deletes all eight and rewrites the folder with a manifest that matches this fingerprint.

Two rules the measurement holds itself to, both learned by the check being unable to fail: no assertion passes on a sheet that rendered nothing (each one asserts its crew, its grid, its chips or its model lines first, because an empty subject list makes "nothing is wrong" true), and the overlap sweep walks *every* scroll position of every scrollable region rather than three samples, printing the member-card × (message box | "Now" list) intersection count at 1440x900, 1440x700 and 390x844 — each must be 0.

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
npm run test:control-center                                   # the Control Center list measured at 1440x900 and 390x844, plus the captures
npm run check:release                                         # release figures agree with the declaration, the plist and this page
macos/ship.sh                  # builds via Xcode, installs to /Applications/BrainBook.app, verifies, restarts
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
