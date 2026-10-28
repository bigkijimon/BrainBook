# app-dev — TEAM-STATE

## 2026-10-24: new-app-root registration gap (RoboFab, 7th app-dev app)

AppAgent built RoboFab (7th app-dev app after HabitFit; `/Users/yuma/Documents/Projects/
Apps/RoboFab`, a Phase B MVP DIY-robot-building offline simulation game) this session.
Full evidence, Pi check (brief+verify, both real and passing) and the independent-review
status are in `/Users/yuma/Documents/Projects/Apps/RoboFab/REPORT.md`.

**Standing gap, confirmed by reading the live file directly (2026-10-24):** none of
RocketCraft, Pet Trimmer Tycoon, MusicTheoryDojo, SafeSpend, ShelfLife, HabitFit or
RoboFab are registered in `AI/router/config/teams.yaml`'s `app-dev.roots`/`checks` map.
This blocks the Router's qualified-independent-review gate for every one of them
(`context/skill_kits.team_for_root` cannot resolve team identity for an unregistered
root → `qa_team_root_unverified` if the team is declared, or zero qualified reviewers if
it is not — confirmed live via `bin/submit`, see RoboFab's REPORT.md section 4 for the
exact job records). SafeSpend's README already flagged this on 2026-10-23 for itself
alone; this confirms it is a blanket gap across all 7 apps, not a one-off.

**Separately observed, also blocking:** the free `mimo`/`opencode` worker pool was
saturated at the time of this session (dozens of concurrent unrelated
`router-brainbook-*` BrainBook-autopilot jobs, `ps aux`, 2026-10-23/24) — 3 of 4 real
Router dispatch attempts for RoboFab (2 build, 1 read-only inspection) timed out
(`free_runtime_guard: opencode_timeout`) even after raising the budget to 1200s.

**Proposed fix (control-plane write, not mine to apply):** add all 7 roots + their
`node --check`/`npm test` (or equivalent) checks to `teams.yaml`'s `app-dev` team via the
control-plane release procedure (`AI/router` is a protected root per `policies.yaml`
`control_plane.roots`). Exact JSON for RoboFab is in its `REPORT.md` section 6; the other
6 apps follow the same `logic.js`+`node --test` or `app.js`+smoke-check pattern and can be
added the same way. This file (this section) is the durable pointer; do not re-discover
this gap from scratch next session.

**Blockers for the next session / Bigkiji / Router operator:**
1. Apply the `teams.yaml` addition above (control-plane release), then re-submit
   RoboFab's archived review packet (`/Users/yuma/.hermes/profiles/appagent/cache/
   scratch/robofab_review_packet.json`) once free worker capacity is no longer saturated.
2. HabitFit (6th app) is still sitting in `AI/jobs/waiting/` (`WAITING_MODEL_CAPACITY`,
   `UI_IMPLEMENTATION`, 0 qualified models) from an earlier session — unrelated to
   RoboFab's own build method, but the same underlying free-capacity scarcity.

---

## 2026-10-19: BrainBook display-name rename (prior task, kept for history)

Current state of the `app-dev` team's BrainBook/task-system root, as observed/changed 2026-10-19 by AppAgent (`appagent`, acting as Claude Code within the AppAgent session, per the owner order relayed the same day) for the display-name rename (MoviePro→MovieAgent, AppPro→AppAgent, AccountPro→AccountAgent, ClassPro→ClassAgent, InvestPro→InvestAgent, SecurityPro→SecurityAgent, RentPro→Igataya/Web Services; CreativePro unchanged). Overwritten each time this is refreshed. See `RUNBOOK.md` for run/verify/recover and `/Users/yuma/Documents/ObsidianVault/Vault/knowledge/app-dev-brainbook-facts-2026-10-19.md` for the morning's measured baseline.

## Skill consulted
`test-driven-development` (installed Hermes skill, category `software-development`, path `profiles/appagent/skills/software-development/test-driven-development`). Applied pragmatically: this is a scoped display-string rename riding on the existing regression suite as the safety net, not new behaviour — every test assertion that legitimately needed to change for the new display strings was updated and re-run to confirm it failed against the old code for the right reason, then the matching source line was changed and the suite re-run green.

## What changed (display strings only; no seat key, Router team id, or profile id touched)
- `src/team-marks.mjs`: `TEAM_MARKS[...].name` — AppPro→AppAgent, AccountPro→AccountAgent, ClassPro→ClassAgent, InvestPro→InvestAgent, RentPro→Igataya, MoviePro→MovieAgent, SecurityPro→SecurityAgent. `marketing`/`blog` (CreativePro, CreativePro Marketing) unchanged.
- `src/agentRoster.ts`: `Steve.persona` 'Steven Spielberg'→'MovieAgent' (the department-Top persona label itself, owner's explicit instruction); every "MoviePro" mention inside MiMo/Space Bunny/HideoKojima/Ryūichi/Kuro/Shimajiro/Ame/Maru role text → "MovieAgent". Seat/object key `Steve` unchanged.
- `src/AgentFlow.tsx`: flow-panel labels ACCOUNTPRO/INVESTPRO/RENTPRO/MOVIEPRO → ACCOUNTAGENT/INVESTAGENT/"IGATAYA · WEB SERVICES"/MOVIEAGENT. `lead: 'Steve'` id untouched (resolves to the new persona automatically via `personaOf`).
- `office-map.json`: room `group`/`label` for apppro/moviepro/classpro/accountpro/investpro/securitypro → the new *Agent names; `rentpro` room → group "Web Services", label "Igataya". `creativepro` room untouched. All `seats` arrays (seat keys) and room/team/board/profile ids untouched.
- `meeting.mjs`: `MovieProTop-Mame.persona` → 'MovieAgent', its `group` → 'MovieAgent (lesson videos)'; `MiMo.group` → 'AppAgent (app building)'. `CreativeProTop-Momo` entry untouched. ATTENDEES/MEMBERS keys (seat keys) untouched.
- `agent-feed.py`: `boardName` 'MoviePro'→'MovieAgent' (3 call sites), `PROJECT_LABELS` 'MoviePro (lesson videos)'→'MovieAgent (lesson videos)' and 'AccountPro'→'AccountAgent', the lesson-chain fallback string, `TEAM_SHORT` dict (the left-menu/live-strip team-name source) for all seven renamed teams, the `movie` team card's `name`, and `security_team()`'s `name`/member `name`/`workflow` string. `PROFILE_OF`/`MOVIE_PARENT`/`MOVIE_CREW`/`MOVIE_DIRECT`/`MOVIE_PROFILE`/`CREATIVE_PROFILE` (seat keys, ids) and `MOVIE_WORKFLOW` (contains the literal seat key `MovieProTop-Mame` in a sentence — left as-is per the hard rule against renaming that exact seat-key string, see Found below) untouched.
- `docs/hermes3d-office-design.md`: the 決定1 room table (the one `scripts/check-office-design.mjs` partially reads) and the SecurityAgent prose line. `docs/theme-colors.md`: one SecurityPro→SecurityAgent prose mention.
- Tests updated to match (red confirmed against pre-change code, then green): `tests/team-marks.test.mjs` (`markFor('movie-pro').name` expectation), `tests/test_reviewed_team_structure.py` (`team_short_name` expectations for `app-dev`/`movie`/`movie-pro`).
- PortMenuBar (`/Users/yuma/Documents/System/PortMenuBar/Sources`): `rg` found **zero** occurrences of any old department name — its service labels are generic infra names (Hermes Gateway, ComfyUI, n8n, H&S Academy, ...), never department names, so there was nothing to rename there. `000_WHERE.md`'s Ports table is the same: no agent-name labels present. No "new port registry" needed renaming.
- `macos/main.swift` / `macos/DashboardConnection.swift`: zero matches; the native macOS app's menu items read live from the server's JSON (the renamed fields above), nothing hardcoded there.

## What did NOT change (by rule, confirmed with `git diff --stat`)
- `server.mjs`, `package.json`: byte-for-byte as left by the other session (diff stat identical before/after: `package.json | 1+`, `server.mjs | 32+/-7`). Not touched.
- Seat keys (`MovieProTop-Mame`, `CreativeProTop-Momo`, `AppProTop-Sora`, `AccountProTop-Riku`, `ClassProTop-Nana`, `InvestProTop-Rin`, `RentProTop-Kai`, `MarketProTop-Yui`, `SecurityProTop-Taiga`), Router team ids (`movie`, `movie-pro`, `app-dev`, `accountpro`, `hs-school-ops`, `investment`, `igataya-web`, `marketing`), profile ids (`moviepro`, `apppro`, `classpro`, `accountpro`, `investpro`, `rentpro`, `marketpro`, `securitypro`, `creativepro`, `blogpro`).
- `CreativePro` everywhere (owner has not renamed it).

## Verified evidence
- Baseline (measured before any edit): `node --test tests/*.test.mjs` 144 pass/2 fail; `python3 -m pytest tests/` 14 pass/3 fail — both pre-existing, unrelated to this task (a prior, separate seat-key rename left `Steve`-literal assertions in `teams-moviepro.test.mjs`, `security-office.test.mjs`, `test_reviewed_team_structure.py` out of sync with the real seat keys `MovieProTop-Mame`/`SecurityProTop-Taiga` already in the code).
- After this change, same two suites: **144 pass/2 fail** and **14 pass/3 fail** — identical counts, same 5 pre-existing failing tests, zero new failures.
- `npm run smoke` → `TASK_SYSTEM_OK`; `npm run test:criteria` → 45/45; `npm run check:ts-scope` → 55/55 TS files; `npm run check:release` → PASS 23 checks. All match the morning's measured baseline exactly.
- Preview verification (NOT the live port): copied the working tree (minus node_modules/.git/dist/evidence, node_modules symlinked, `macos/` assets copied, `data/` copied) to a scratch dir, `npm run build` there, then `PORT=4190 BRAINBOOK_HOME=<copy>/data-copy node server.mjs`. Live JSON from that preview instance:
  - `/api/agents/teams`: `app-dev→AppAgent, accountpro→AccountAgent, hs-school-ops→ClassAgent, investment→InvestAgent, igataya-web→Igataya, marketing→CreativePro Marketing, movie→MovieAgent, blog→CreativePro, securitypro→SecurityAgent`.
  - `/api/office`: room `group`/`label` values: `AppAgent, MovieAgent, CreativePro, ClassAgent, AccountAgent, InvestAgent, Web Services/Igataya, SecurityAgent` (plus unchanged shared rooms).
  - `/api/meetings`: `MovieProTop-Mame.persona = "MovieAgent"`, `group = "MovieAgent (lesson videos)"`; `MiMo.group = "AppAgent (app building)"`; `CreativeProTop-Momo` unchanged.
  - Built JS bundle (`dist/assets/index-*.js`) grep: `MovieAgent`×15, `AppAgent`/`SecurityAgent`/`Igataya`×1 each present; `AccountPro`/`ClassPro`/`RentPro`/`SecurityPro` (bare, without `Top`) = 0 occurrences; the one remaining `MarketPro` hit is the seat key `MarketProTop-Yui` inside `TeamRail.tsx`'s colour map (correctly kept).
  - Preview server killed after verification; the live launchd service (port 4183, `com.bigkiji.brainbookserver`, serving `dist/` directly from this same repo folder) was never touched — its `dist/` is still the pre-rename build from Oct 18 07:43.
- Mistake made and fixed: `npm run test:team-sheet` (a heavy Playwright screenshot harness, not wired into any required check) was foreground-run, exceeded the terminal timeout and was interrupted mid-capture; it had already deleted the old `evidence/team-sheet-*.png` files and partially rewritten `evidence/team-sheet-manifest.json` before being killed. Restored with a narrowly-scoped `git checkout -- <those exact files>` (not the other session's `evidence/control-center-*`/`server.mjs`/`package.json` diff, which is untouched). `git status` after restore shows only the pre-existing other-session diff.

## Intentionally-kept old-name occurrences (`rg -n -i "MoviePro|MarketPro|AppPro|AccountPro|ClassPro|InvestPro|SecurityPro|RentPro|Steven Spielberg|\bSteve\b"` over the live tree, excluding node_modules/dist/.git/graphify-out/.pytest_cache)
1. **Seat keys / Router team ids / profile ids** everywhere they appear as identifiers (not display text) — `office-map.json` seats/teams/boards/profiles maps, `meeting.mjs` ATTENDEES/MEMBERS keys, `agent-feed.py` PROFILE_OF/MOVIE_PARENT/MOVIE_CREW/MOVIE_DIRECT/MOVIE_PROFILE/CREATIVE_PROFILE, `server.mjs` DIRECT_MEMBERS, test fixtures that construct these same ids.
2. `agent-feed.py` `MOVIE_WORKFLOW` string — contains the literal seat key `MovieProTop-Mame` inside a human-readable sentence; left unchanged because hard rule 1 names this exact string as a seat key not to rename, even in prose.
3. Design-rationale code comments/docstrings across `office.mjs`, `AgentFlow.tsx`, `agent-feed.py`, `meeting.mjs`, `investment-evolution.mjs`, `TeamRail.tsx`, `InvestProEvolution.tsx`, `src/investpro-evolution.css`, `src/styles.css`, `office-map.json`'s `_comment`/`_teams_comment`, and most of `docs/hermes3d-office-design.md`'s free-text explanation (outside the 決定1 table) — non-rendered developer documentation describing past decisions (e.g. the 2026-10-17 BlogPro/MarketPro merge), not current UI text.
4. Pre-existing, unrelated test debt (same before and after this task, confirmed by the baseline run): `tests/teams-moviepro.test.mjs`, `tests/security-office.test.mjs`, `tests/test_reviewed_team_structure.py`'s `DisplayTests` class, `tests/test_owner_feed.py` — these assert a literal `'Steve'`/`'SecurityPro'` member name that a prior, separate seat-key rename already replaced with `MovieProTop-Mame`/`SecurityProTop-Taiga` in the real code, before this session started.
5. Not run to completion (heavy, not in any required check, and already stale independent of this task — evidence dated 2026-10-05/2026-10-02): `scripts/test-team-sheet-fit.mjs`, `scripts/team-sheet-harness/main.tsx`, `scripts/test-office.mjs`, `scripts/test-office-vr.mjs`, `scripts/test-owner-projection.mjs`, `scripts/test-evolution-ui.mjs`, `scripts/test-owner-acceptance-browser.mjs`, `scripts/test-installed-acceptance.mjs`, `scripts/test-meeting-render.mjs`, `scripts/test-icon-navigation.mjs`, `scripts/check-merged-panel.mjs`, `scripts/shot-marketing.mjs`, `scripts/test-theme-colors.mjs`, `scripts/evolution-harness/main.tsx`, `scripts/source-fingerprint.mjs`, `evidence/*.json`/`*.md`. `scripts/check-office-design.mjs` (not wired into package.json) was already failing **before** this session (`AppAgent has 0 rooms` — `SYSTEMS.md`'s Company-groups table already said "AppAgent" etc. this morning, ahead of BrainBook's own files) and remains failing after, for a larger, separate reason: `SYSTEMS.md` now also lists "CommercialPro" and "Web Services" as company groups with no corresponding office room in `office-map.json`/`hermesHqMap.ts` — that is new-room/layout territory, forbidden by the UI freeze and explicitly deferred to the Environment-Migration-Plan cutover, not this task.

## Known discrepancy to flag (found, not fixed — outside this task's lane)
`Vault/SYSTEMS.md`'s "## Company groups" table (edited by a different, concurrent session today) keeps the MoviePro **group/division** name as "MoviePro" (only its *Lead* is written as "MovieAgent"), while this task's explicit instruction was "MoviePro → MovieAgent" for the department display as a whole — which is what BrainBook's `office-map.json`/`team-marks.mjs`/`agent-feed.py` now consistently show. The two sources disagree on whether "MoviePro" as a department/room name is retired. I followed this task's literal instruction for BrainBook's own display strings and did not edit `SYSTEMS.md` (Vault canon, outside this session's lane); Bigkiji/the owner should reconcile which is authoritative before the Environment-Migration-Plan cutover.

Also found, unrelated to BrainBook and outside this lane: `Vault/Projects/CommercialPro-Rename-Inventory.md`'s correction section names exactly 3 remaining stale **live** strings in `AI/router/` (Router control-plane, not touched here): `AI/router/bin/team-run:850` (`BlogProTop-Momo`), `AI/router/config/teams.yaml:410` (`BlogPro: lead Sora...`), `AI/router/config/teams.yaml:329` (`MarketPro (Web Marketing & Web Sales)`). These need the external-operator release lane per `Vault/AGENTS.md`'s implementation note, not a direct profile/skill write.

## Ship path (not run; owner/operator decision)
`dist/` in this folder is exactly what the live launchd service (`com.bigkiji.brainbookserver`, port 4183) reads on every request — there is no separate "installed app bundle" copy; rebuilding `dist/` here would be live the instant it finishes, which is why this session verified on an isolated copy at port 4190 instead of rebuilding in place. To ship this rename to the owner, someone needs to run, from this exact folder: `npm run build` (picks up tsc/vite build of the changes above) followed by the health check `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4183/api/office` (expect 200; the launchd process picks up the new `dist/` on its very next request, no restart needed) — or, if the owner wants the Xcode-packaged `.app` on the next full release too, `macos/ship.sh` (the only path RUNBOOK recognises as "shipped"). Neither was run by this session.

## Blockers for the next session / Router-selected app-dev worker
- None hard-blocking the rename itself. The `server.mjs`/`package.json`/`src/App.tsx`/`evidence/control-center-*` diff from the other session is still uncommitted and still outside this scope — confirm ownership with Bigkiji/Router before anyone else edits those files (same note as the prior TEAM-STATE entry).
- `npm run build` + the `:4183` health check above (or `macos/ship.sh`) is an owner/operator-run step, not run by this session.
- The pre-existing 5 failing tests (2 node, 3 pytest, listed above) are real test debt from an earlier seat-key rename and are not caused by this task; worth a dedicated card to either fix the fixtures or the tests, independent of this rename.
- `scripts/check-office-design.mjs` needs the owner to decide whether `SYSTEMS.md`'s new "CommercialPro"/"Web Services" company groups get real BrainBook office rooms (a layout change, phase 2) or whether that check should stop requiring 1:1 room coverage for non-physical groupings.
