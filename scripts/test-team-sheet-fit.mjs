// Measured proof that the team popup fits one screen, plus the screenshots the owner asked to see.
// Usage: node scripts/test-team-sheet-fit.mjs [outDir]   (default: ./evidence)
//
// The acceptance criterion for src/TeamRail.tsx is a visual fit, so it is measured rather than
// eyeballed. The page is scripts/team-sheet-harness (the real TeamRail) fed the teams agent-feed.py
// can actually emit, and every assertion below is a real scrollHeight/clientHeight or bounding-box
// comparison taken at a real viewport. No server, model, scheduler or network beyond localhost is
// used.
//
// What is asserted (hard):
//   * the sheet is measured in the app's own faces. Every bound below is a pixel comparison, and the
//     popup is set in Bungee, Manrope, DM Mono and VT323; a substituted face has different metrics, so
//     a harness without the @fontsource files src/main.tsx imports measures a layout the app does not
//     ship and every other `ok` in this run then describes that one. The faces are read out of
//     document.fonts rather than trusted from an import list
//   * the popup itself never scrolls, at any of the five viewports below, for either long team
//   * zero member-card x (message box | "Now" list) intersections, counted at rest and at 0%, 50%
//     and 100% of every scrollable region, at 1440x900, 1440x700, 1280x720, 1024x768 and 390x844.
//     Overlap is measured, not eyeballed: the 390x844 capture showed both boxes painted on top of
//     the crew, and sideways overflow alone does not see it.
//   * header, chain summary and the "tell a member directly" box stay inside the popup and the
//     viewport, at every viewport, including after every scrollable region is pushed to its end
//   * every member is reachable: with each scrollable region pushed to its end, the last card's
//     bottom is at or above the popup's bottom, and no card is cut by a region that cannot scroll.
//     The cut is found by walking out of each card to its NEAREST clipping ancestor and asking
//     whether that ancestor scrolls, rather than by naming a region up front: a check that picks a
//     region it then requires to be non-scrolling can never fail, and a check that cannot fail is
//     the same defect as the sideways-only overflow check one level up
//   * the crew grid resolves to at least four columns at 1440 and keeps two on a phone, so fifteen
//     members never fall back to the one-card tower the grid exists to prevent
//   * the popup is content-sized, not clamped: at 1440x900 it ends half a member row clear of its own
//     `max-height`, the row measured off the grid on screen. So it has room rather than having spent
//     every pixel it has — "does not scroll" on its own is satisfied by a popup one row from breaking,
//     which is the whole risk here
//   * that room is spent on the real thing: the grid's free member slots are computed from the columns
//     it resolved to, cards are added to the live grid, and the popup is measured again. A threshold in
//     pixels would pass on a layout whose next member breaks it; the free slots are the grid's own
//     arithmetic, so the claim is "these members cost nothing" and it is measured rather than assumed
//   * every team the rail can open is measured, and the rail carries the eight ids agent-feed.py emits.
//     The set is read off the rail's own `data-team`, not out of the list in this file, because four of
//     the eight cards the server emits were never measured at any viewport while every check here
//     printed ok on the four that were
//   * no card depends on a `title` for the text it clamps: every card carries an `aria-describedby`
//     whose words include the model line and the role, so a phone or screen-reader user reaches the
//     full text without a hover
//   * the *tap* path carries the same words, which is the claim the last review asked to have
//     confirmed instead of assumed: the "what does this agent do?" card a member card opens prints that
//     member's own model line and its own role sentence in full. A description note covers a screen
//     reader; a hand reaching for the card covers everyone else, and until this line existed the role
//     sentence the grid clamps to two rows was on neither
//   * the popup keeps Tab inside itself. It is a modal dialog (`aria-modal="true"`), so Tab from the
//     last control inside it wraps to the first, Shift+Tab from the first wraps to the last, and focus
//     never lands on the app behind it - which is what a dialog that only takes focus on open leaves
//   * no crew card announces a pressed state. A card that opens a dialog is a disclosure trigger, not a
//     toggle, so `aria-pressed` on it describes a state the button never changes; `aria-haspopup` and
//     the description are the whole contract
//   * every name stays inside its own card, at every viewport including 390x844, and no card paints
//     anything wider than itself. This is the gap the last review found: a persona is one unbreakable
//     word, so as an anonymous flex item its min-content width was the whole name and it painted over
//     the card edge on the 150px phone track - nothing here was measuring for that
//   * no assertion in this file passes on a sheet that rendered nothing. This is the shape the last three
//     handovers kept hitting, one layer at a time: a sideways-only overflow check that could not see an
//     overlap, a clip check that named a region it then required to be non-scrolling, and finally a set of
//     assertions whose subject lists are empty when the component renders nothing — `hasHeadroom`'s bar is
//     0, `freeSlotsFit` compares 0 to 0, `end.lastBottom` is null and `null <= x` is true, `modelLines`
//     and `described` and `recipients` are empty, and the sweep's 45 checks walk no cards at all. Every
//     one of those now asserts the thing it is about first. A check that measures nothing is the same
//     defect as a check that measures the wrong thing
//   * the model line follows whichever rule the stylesheet has actually resolved for it, read from the
//     rendered line instead of from a breakpoint repeated here: a nowrap line stays one line (that is
//     what keeps fifteen cards inside 900px) and a wrapping line is cut neither sideways nor vertically.
//     The two used to be one assertion applied to both, so the phone fix was reported as a failure
//   * the chain band is measured rather than assumed: a team that ships one carries a non-empty line in
//     it and a team that does not (InvestPro) has no band at all, and the arrow summary the owner asked
//     to keep carries its arrows wherever it is drawn. An assertion that quietly passes on a missing
//     element proves nothing about the layout, which is how a band could be "checked" here and never
//     once exist
//   * every control the popup puts in front of a finger is at least 44px tall on a phone, where the
//     input method is touch: the recipient chips, and also the composer's Send, the mic, both language
//     chips and the header's close button. The chips were measured first and the rest were left at
//     their desktop heights (34px, 32px, ~20px, 34px), so a check that read only the chips called a
//     half-fixed control set a fixed one
//   * the recipient chips behave like the radiogroup they claim to be, and the tab strip steps in
//     opposite directions: arrows move the selection, focus and the roving tabindex follow, and
//     Home and End reach the ends
//   * a short team is not stretched: four members sit in one row of the four-column grid and content-size
//     their cards, and the lead is one cell like the rest rather than a full-width bar above them
//   * nothing overflows sideways, at 1440 or at 390
//   * every screenshot this file writes is actually on disk at the end of the run, and every one is
//     written *before* the assertions that can fail. A check that asserts first and captures last
//     leaves no file behind when it fails, so the artifact list shrinks to the checks that passed and
//     a missing capture says nothing about which check failed: three of the eight were absent from
//     evidence/ with nothing in the run's output to explain them. The numbers behind every row are
//     therefore also written to evidence/team-sheet-measurements.json, on a pass and on a failure —
//     a red run has to leave the picture and the measurements that explain it.
//   * …and the evidence folder describes itself without this file being run at all.
//     evidence/team-sheet-measurements.json is written *inside* the run, so its absence proves only that
//     a run did not reach its tail — it says nothing about the five PNGs that were already on disk, and
//     nothing about which `styles.css` produced them. Two rounds of evidence handover failed on exactly
//     that: a folder of pictures with nothing in it tying a picture to a source, which reads as a pass.
//     So this file now writes evidence/team-sheet-manifest.json *before the first check*, carrying the
//     status (`running`), a sha256 fingerprint of the four files that decide this layout, and the
//     captures the run owes; it deletes any capture left by an earlier run so a stale picture cannot
//     survive a new one; and it rewrites the manifest at the end with the same fingerprint, every
//     capture's own hash and every failed check. Absent manifest = no run; `running` = a run that did not
//     finish; `complete` + fingerprint = the only state that describes a picture. `npm run build` reads
//     the same fingerprint through scripts/check-harness-build.mjs and says out loud when a source change
//     has left the last measurement stale.
//   * …and it leaves them on every exit, not only the one at the bottom of the file. That writer sat
//     below `await browser.close()`, which rejects whenever the browser has already gone, so a run that
//     died anywhere above it — including inside `close()` itself — died with no measurements file, no
//     missing-capture list, and only the pictures that happened to be written before. The writer and
//     the capture list now live above the first check, and `uncaughtException` / `unhandledRejection`
//     call it on the way out, so a run that stops early reports what it measured and what it owed.
//
// The fixtures are the point, so read the harness before trusting an `ok` here. Two rounds measured a
// team lighter than anything the server sends — no member live, six role chips, six work rows, and no
// Router team at all — so every `ok` those rounds printed had never been asked whether the tallest
// sheet BrainBook ships fits, or even whether all of them were looked at. The harness now builds every
// card the server can emit: five Router cards through one builder (agent-feed.py `reviewed_structure()`,
// seven members plus one per configured profile), the film unit, BlogPro, InvestPro, and one card that
// is not a team at all — MoviePro's fifteen members carrying AppPro's sixteen chips and ten work rows,
// the union of the two heaviest shapes. The fit is measured on that bound, so it is a claim about the
// layout rather than about today's roster. Both are measured at 1440x900, and every card is walked at
// all five viewports.
//
// What is reported (not asserted): how far the crew list or the "Now" list has to scroll at a
// viewport too short for them. That is the documented fallback region; the owner's criterion is that
// the popup and the member list do not scroll at 1440x900, that the header and message box never
// leave the screen, and that nothing is ever drawn on top of anything else.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { launchTestBrowser } from './browser.mjs';
import { layoutFingerprint, LAYOUT_SOURCES, MANIFEST, POPUP_CAPTURES } from './source-fingerprint.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const OUT = path.resolve(process.argv[2] || process.env.BRAINBOOK_EVIDENCE_DIR || path.join(root, 'evidence'));
mkdirSync(OUT, { recursive: true });

const DESKTOP = { width: 1440, height: 900 };
const SHORT = { width: 1440, height: 700 };
const WIDE_SHORT = { width: 1280, height: 720 };
const NARROW_SHORT = { width: 1024, height: 768 };
const PHONE = { width: 390, height: 844 };
const NO_SLOP = 1;

// The eight teams the server emits: TEAM_SHORT names seven registry teams (agent-feed.py:447) and
// `teams()` appends BlogPro. Written out here on purpose rather than read out of the harness: a new team
// on the server has to fail this file instead of quietly widening a fixture list nobody re-reads.
const SERVER_TEAM_IDS = ['accountpro', 'app-dev', 'blog', 'hs-school-ops', 'igataya-web', 'investment', 'marketing', 'movie'];
// …and the one card in the rail that is not a team: the bound the popup is measured against.
const BOUND_TEAM_ID = 'stress-router';
// Every team label this run actually opened, so the coverage check at the end can prove each card the
// rail can open was measured rather than trusting the viewport list below to still match the roster.
const MEASURED = new Set();
let failed = false;
// Every failed check is kept by name, so the end of the run can say which one to look at instead of
// leaving a reader to scan the log for the single FAIL among sixty-odd `ok` lines.
const failures = [];
// `MEASUREMENTS` and `RECORD` are declared here rather than beside the measurement helpers further down,
// because `writeEvidence` below reads both and `died` can reach it from the browser launch: a
// `ReferenceError` for a `const` that has not been evaluated yet would throw *inside* the crash handler,
// which is the one place that cannot afford to throw and would leave exactly the empty evidence this file
// exists to prevent. Same reason the manifest block sits below these two declarations.
const MEASUREMENTS = 'team-sheet-measurements.json';
const RECORD = [];

// ── the evidence, declared before anything can throw ───────────────────────────────────────────────
// `mkdirSync` above is the last statement allowed to fail silently, so the capture list, the manifest
// writers, the two crash handlers and the server and browser launches below are all placed where a
// failure in any of them still leaves the folder describable. That is the whole point of the manifest,
// and putting it after the browser launch would have made it decorative: the likeliest place for a run to
// die is a browser that will not start, which is exactly where `status: "running"` has to already be on
// disk. The crash handlers are registered in this same block for the same reason — and `died` can only
// run because the handlers are above the launch that would otherwise take the process down first.
// The capture list is not written out here: it lives in scripts/source-fingerprint.mjs next to the
// manifest name, because `npm run build` has to be able to recognise a popup capture in evidence/ in
// order to say anything about one. A list only this file can read is a list the build cannot check — and
// "the build cannot name the pictures in the folder" is why `evidence/` could hold five of them with
// nothing saying they described a stylesheet that no longer exists.
const CAPTURES = POPUP_CAPTURES;
const measurementsPath = () => path.join(OUT, MEASUREMENTS);
// `MANIFEST` is the name defined once in scripts/source-fingerprint.mjs, which `check-harness-build.mjs`
// reads the same way. See that file for what the manifest is for; this is only the writer of it.
const manifestPath = () => path.join(OUT, MANIFEST);
const sha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 16);
const startedAt = new Date().toISOString();
// Captured once, here, so the fingerprint on the manifest and the fingerprint a reader compares it
// against are the same number even if a source file is edited while the browser is open.
const fingerprint = layoutFingerprint();

// Cleared before anything can throw, not after the last check. A capture left by an earlier run
// describes that run's `styles.css`, not this one's: left in place, five stale PNGs plus a missing
// measurements file is indistinguishable from a finished run, which is precisely the state the last
// handover shipped.
const cleared = [];
for (const name of CAPTURES) {
  const file = path.join(OUT, name);
  if (existsSync(file)) { cleared.push(name); rmSync(file, { force: true }); }
}
const writeManifest = (status, extra = {}) => {
  try {
    writeFileSync(manifestPath(), `${JSON.stringify({
      what: 'Provenance for the team-popup captures in this folder.',
      // `running` before anything is launched, `complete` only after every capture is on disk and no
      // check failed. Nothing here is ever `complete` while a capture is missing.
      status,
      startedAt,
      finishedAt: status === 'complete' ? new Date().toISOString() : undefined,
      measuredBy: 'node scripts/test-team-sheet-fit.mjs against scripts/team-sheet-harness',
      // The four files below decide every pixel this folder claims. A reviewer who changes one of them
      // can see, from this file alone, that the pictures no longer describe the source.
      layoutSources: LAYOUT_SOURCES,
      layoutFingerprint: fingerprint,
      captures: CAPTURES.map((name) => {
        const file = path.join(OUT, name);
        return existsSync(file) ? { file: name, bytes: statSync(file).size, sha256: sha(file) } : { file: name, missing: true };
      }),
      ...extra,
    }, null, 2)}\n`);
  } catch (error) {
    failed = true;
    failures.push({ name: `writing ${MANIFEST}`, message: error instanceof Error ? error.message : String(error) });
  }
};
const writeEvidence = (extra = {}) => {
  const missing = CAPTURES.filter((name) => !existsSync(path.join(OUT, name)));
  // Stamped before the measurements file, so a reader who finds one without the other knows which is
  // the stale one. `complete` is unreachable while a capture is missing, and `failed` names every check.
  writeManifest(missing.length || failures.length ? 'failed' : 'complete', {
    checksFailed: failures.map((entry) => ({ name: entry.name, message: entry.message })),
    capturesMissing: missing,
    // Named in the manifest rather than only in a log line, so the folder records what it replaced.
    clearedBeforeRun: cleared,
    ...extra,
  });
  try {
    writeFileSync(measurementsPath(), `${JSON.stringify({
      what: 'Team popup fit, measured by scripts/test-team-sheet-fit.mjs against scripts/team-sheet-harness.',
      rule: 'At 1440x900 every card must fit with headroom of at least half a crew row (crewRow / 2); every other viewport only has to avoid overlap and keep every member reachable.',
      units: 'pixels',
      // The same fingerprint the manifest carries, so the numbers and the pictures can be tied to one
      // source without opening a second file — and so a reader comparing two runs can see whether they
      // measured the same layout at all.
      layoutFingerprint: fingerprint,
      checksFailed: failures.map((entry) => entry.name),
      rows: RECORD,
    }, null, 2)}\n`);
  } catch (error) {
    // A record that cannot be written is itself a failed check, not the end of the run: the capture
    // list below still has to be reported, because that is the part a reader acts on.
    failed = true;
    failures.push({ name: `writing ${MEASUREMENTS}`, message: error instanceof Error ? error.message : String(error) });
  }
  for (const name of missing) {
    failed = true;
    console.log(`FAIL screenshot ${name} was not written to ${OUT}`);
  }
  return missing;
};
// The exit the run takes when it does not reach its own tail. One line of reason, the same evidence
// write, and a non-zero code: a run that dies mid-way has to leave behind as much as a run that
// finishes, or the folder of pictures says less than the run did.
const died = (why) => {
  // Stamped here as well as at the tail, so a run that dies leaves `status: "failed"` with the reason in
  // it rather than the `running` marker from the top — which is what makes that marker trustworthy.
  //
  // The write is guarded, and it has to be: this is the one function that runs when something has already
  // gone wrong, so it must not be able to become a second fault. A throw here would escape an exception
  // handler, and Node would exit with the folder still marked `running` and the reason only in a line of
  // stderr — the exact handover state this file was rebuilt to end, produced by the code meant to prevent
  // it. So `writeEvidence` is best-effort here and the reason is printed either way.
  const reason = (why && typeof why.message === 'string' ? why.message : String(why || 'unknown')).split('\n')[0];
  let missing = CAPTURES;
  try { missing = writeEvidence({ endedEarly: true, reason }); }
  catch (error) { console.error(`     the manifest could not be written on the way out: ${error instanceof Error ? error.message : String(error)}`); }
  console.error(`\nTEAM_SHEET_FIT_FAIL  the run ended early (${reason}). ${failures.length} check(s) failed, ${missing.length} capture(s) missing. Measurements: ${measurementsPath()}. Manifest: ${manifestPath()}. Re-run: npm run test:team-sheet`);
  process.exit(1);
};
// `unhandledRejection` is here for the same reason: an await that rejects inside a `page.evaluate` a
// check did not catch would otherwise print a warning and let the run carry on into the next check,
// which is how a run reaches its tail having silently measured nothing.
process.on('uncaughtException', died);
process.on('unhandledRejection', died);

if (cleared.length) console.log(`     cleared ${cleared.length} capture(s) from an earlier run: ${cleared.join(', ')}`);
writeManifest('running');

// Only now is anything launched. Everything above is on disk; everything below can fail into `died`.
const server = await createServer({ root, cacheDir: path.join(root, '.vite-test'), configFile: false, plugins: [react()], logLevel: 'error', server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}/scripts/team-sheet-harness/index.html`;
const browser = await launchTestBrowser();
const check = async (name, fn) => {
  try { await fn(); console.log(`ok   ${name}`); }
  catch (error) {
    failed = true;
    // `check` is the only thing between a failed assertion and the tail of this file, where the
    // captures are counted and the measurements are written. A throw that is not an Error would take
    // that with it — `error.message.split` on a string throws — and a run that dies in its own error
    // handler leaves exactly the empty evidence this file exists to prevent. So the message is
    // normalised before anything reads it.
    const message = (error && typeof error.message === 'string' ? error.message : String(error)).split('\n');
    failures.push({ name, message: message[0] });
    console.log(`FAIL ${name}\n     ${message.slice(0, 6).join(' | ')}`);
  }
};

const open = async (viewport) => {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
  await page.goto(base, { waitUntil: 'load' });
  await page.waitForSelector('.team-item');
  return page;
};
const openSheet = async (page, team) => {
  MEASURED.add(team);
  await page.locator('.team-item', { hasText: team }).first().click();
  await page.waitForSelector('.team-sheet');
  // The fonts before the first measurement of them. `waitUntil: 'load'` covers the stylesheets but not
  // the faces those stylesheets pull in, and a face is only fetched once something on the page uses
  // it — the sheet is what uses Bungee at 22px. Measuring during that swap measures the fallback the
  // face was about to replace, which is the same class of mistake as measuring a page with no fonts
  // at all: a real number for the wrong layout (audit: the evidence has to be the thing it claims).
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
};
const closeSheet = async (page) => {
  await page.locator('.team-sheet header .icon-button').click();
  await page.waitForSelector('.team-sheet', { state: 'detached' });
};
// The rail's own cards, read off the DOM rather than out of the list below: the server's id (the rail
// carries it as `data-team`) and the label a click matches. The id is what ties a card in this test to a
// team in agent-feed.py, which is the one thing a fixture written by hand cannot do for itself.
const railTeams = async (page) => page.evaluate(() => [...document.querySelectorAll('.team-item')].map((el) => ({
  id: el.getAttribute('data-team'),
  name: (el.querySelector('span:not(.team-status)')?.textContent || '').trim(),
})));
const shot = (name) => path.join(OUT, name);

// What goes into `RECORD` (declared above, beside the writers that serialise it): the headroom, the
// resolved column count and each region's overflow, for every card at every viewport. "Fits one screen" is
// a pixel comparison, and a pixel comparison nobody can read after the browser is closed is not evidence.
// It is written on failure too — a red run is exactly the run whose numbers are worth reading.
// `m.roster` / `m.pane` / `m.work` are absent on the one view of this dialog that has no crew (the
// EVOLUTION arena replaces it), so every one of them is read defensively: a record that throws while
// writing the evidence takes the evidence with it.
const over = (part) => (part ? Math.max(0, part.scrollHeight - part.clientHeight) : 0);
const record = (team, m) => RECORD.push({
  team,
  viewport: `${m.viewport.width}x${m.viewport.height}`,
  popup: Math.round(m.sheet.box.height),
  cap: Math.round(m.maxHeight),
  // The number the card is judged on: the popup's own height cap minus the popup. Half a crew row is
  // the bar `hasHeadroom` holds it to, and `crewRow` is that row measured, so a reader can see whether
  // the layout had room or was spending the last of it.
  headroom: Math.round(m.maxHeight - m.sheet.box.height),
  crewRow: Math.round(rowPitch(m)),
  columns: m.columns,
  members: m.cards.length,
  // How many more members this popup takes before the grid needs another row. The two room checks
  // answer different questions and a red run read as though they disagreed: `hasHeadroom` asks whether
  // the popup is half a crew row clear of its own `max-height`, `freeSlotsFit` asks whether one more
  // card actually costs a row. StressPro at 1440x900 fails the first (31px spare against a 53px bar)
  // and passes the second — 15 members in 4 columns leaves one free cell, so the 16th member costs
  // nothing and it is the 17th that needs a fifth row. `headroom`, `crewRow`, `members` and `columns`
  // are all written above, so the arithmetic was recoverable but had to be re-derived by every reader;
  // this is the number the next round reads first, and it is what decides whether that failure is
  // urgent or a card one member away from a free cell.
  freeMemberSlots: m.columns > 0 ? freeSlots(m.cards.length, m.columns) : 0,
  chips: m.chips,
  workRows: m.workRows,
  stacked: m.stacked,
  // What each region has to scroll by, in pixels. Zero on every line is "one screen, no scrollbar".
  popupOver: over(m.sheet),
  crewOver: over(m.roster),
  paneOver: over(m.pane),
  nowOver: over(m.work),
});

// The controls Tab stops on inside the popup, read off the dialog rather than guessed. `tabindex="-1"`
// is a programmatic focus target and not a tab stop, so the dialog itself is left out - and so are the
// two roving groups, which each keep a single stop: the tab strip's selected tab and the recipient
// radiogroup's checked chip. This has to match what src/TeamRail.tsx traps between, or the check below
// would be measuring the test's own idea of the ends.
//
// The roles are written unscoped and scoped once per dialog, because there are two dialogs and they are
// not nested. The "what does this agent do?" card is a *sibling* of the popup, portalled to <body>
// (TeamRail.tsx), so it is not inside `.team-sheet`. Deriving its list by prefixing `.agent-info ` onto
// entries that already carried `.team-sheet ` produced `.agent-info .team-sheet button`, a descendant of
// a card that is not a descendant of the sheet — which matches nothing, so the check reported "the info
// card has 0 focusable control(s)" for a card that draws two. Same defect as `m.side.box.top`, one level
// up: a check reading a shape that does not exist where it looks for it, and calling the empty result a
// measurement.
const STOP_ROLES = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const stopsInside = (container) => STOP_ROLES.split(', ').map((role) => `${container} ${role}`).join(', ');
const TAB_STOPS = stopsInside('.team-sheet');
const INFO_STOPS = stopsInside('.agent-info');

const MEASURE = () => {
  const one = (selector) => document.querySelector(selector);
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height }; };
  const flow = (el) => el ? { scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth } : null;
  const sheet = one('.team-sheet');
  // The crew pane is read once, here, because there is a view of this dialog that has none: EVOLUTION
  // replaces the crew, the chain band and the message box with the arena (TeamRail.tsx `wide`), so
  // `.team-pane` is absent from the DOM rather than hidden. `getComputedStyle(null)` throws a
  // TypeError, which took the whole run down on the one view whose layout was already correct - and a
  // crash reads exactly like a failing fit, so it hides the answer the run was asked for. `stacked` is
  // therefore false when there is no pane at all: "not stacked" and "not side by side either" is the
  // honest reading, and it keeps `assert.ok(m.stacked)` meaningful on the phone, where the pane is the
  // whole point of the assertion.
  const pane = one('.team-pane');
  const paneStyle = pane ? getComputedStyle(pane) : null;
  return {
    viewport: { width: window.innerWidth, height: window.innerHeight },
    // The dialog is stacked (crew above conversation) below 1210px, where the pane is the scroll
    // region instead of the crew list. Both are named here so an assertion cannot quietly read the
    // wrong one. The number is not repeated from a breakpoint: it is `getComputedStyle` on the pane,
    // which is the property this is asking about. styles.css carries the arithmetic for why 1210
    // and what it replaced — the crew column stops holding four 196px tracks at 100vw = 1204, and the
    // rule used to sit at 1000px, two hundred pixels inside the structure it was defending.
    stacked: !!paneStyle && paneStyle.display.startsWith('flex') && paneStyle.flexDirection === 'column',
    sheet: { box: box(sheet), ...flow(sheet) },
    // The popup's own height cap, read from the resolved value rather than recomputed from the viewport:
    // it is what decides whether the dialog is content-sized (and so has room to grow) or clamped (and so
    // needs a scrollbar the moment one member is added).
    maxHeight: Number.parseFloat(getComputedStyle(sheet).maxHeight) || 0,
    header: box(one('.team-sheet header')),
    tabs: box(one('.team-tabs')),
    brief: { box: box(one('.team-brief')), lines: [...document.querySelectorAll('.team-brief p')].map((el) => el.textContent.trim()) },
    chain: { box: box(one('.team-chain')), text: one('.team-chain')?.textContent.trim() || '' },
    direct: box(one('.direct-box')),
    side: box(one('.team-side')),
    roster: { box: box(one('.team-roster')), ...flow(one('.team-roster')) },
    pane: { box: box(pane), ...flow(pane) },
    roles: flow(one('.team-roles')),
    chips: document.querySelectorAll('.team-roles em').length,
    work: flow(one('.team-work')),
    // How many rows the "Now" list actually rendered. The ceiling the server caps it at
    // (`jobs[:5] + cards[:5]`, and `[:6]` for the film card) is only a bound if the bound card carries it.
    workRows: document.querySelectorAll('.team-work p').length,
    columns: one('.team-grid') ? getComputedStyle(one('.team-grid')).gridTemplateColumns.split(' ').length : 0,
    cards: [...document.querySelectorAll('.team-grid .member-frame')].map((el) => ({
      name: (el.querySelector('strong')?.textContent || '').trim(),
      lead: !!el.closest('.team-cell')?.classList.contains('is-lead'),
      box: box(el),
      // The name and the id chip are separate elements precisely so they can shrink; their own rects are
      // therefore readable, which is what makes "the name is inside its card" a measurement. `spill` is
      // the same question asked of the card as a whole, so a line that overflows for any other reason
      // cannot pass by leaving these two rects inside.
      nameBox: box(el.querySelector('.member-name')),
      idBox: box(el.querySelector('.member-id')),
      // `strong` is the row both live in. Its own rect is inside the card by construction, so it proves
      // nothing on its own - which is why the two boxes above are the ones that can fail - but it is
      // measured too, so the row cannot be pushed out of the card either.
      rowBox: box(el.querySelector('strong')),
      spill: el.scrollWidth > el.clientWidth + 1,
    })),
    // The three things the last review read off a screenshot instead of measuring: how many lines the
    // model line takes and whether it is cut sideways, how tall a recipient chip is, and whether the
    // text the card clamps is reachable without a hover tooltip.
    modelLines: [...document.querySelectorAll('.member-model-text')].map((el) => ({
      text: el.textContent.trim(),
      // Which of the two model-line rules the stylesheet resolved for this width, read off the element
      // rather than guessed from a viewport: `nowrap` is the desktop's one-line row, anything else is the
      // phone's wrapping line.
      wrap: getComputedStyle(el).whiteSpace,
      cut: el.scrollWidth > el.clientWidth + 1,
      clipped: el.scrollHeight > el.clientHeight + 1,
      height: Math.round(el.getBoundingClientRect().height),
    })),
    recipients: [...document.querySelectorAll('.direct-to button[data-member]')].map((el) => ({ member: el.dataset.member, height: el.getBoundingClientRect().height })),
    // The rest of what a finger lands on in this popup: the composer's Send, the mic, both language
    // chips and the header's close button. `touchTargets` used to measure the recipient chips and
    // nothing else, so "every control in the popup is hittable with a thumb" was a claim about four of
    // them — Send, the popup's primary action, was 34px tall and the mic 32px. Scoped to `.team-sheet`
    // on purpose: the "what does this agent do?" card is portalled to <body>, so its own Send-shaped
    // button cannot be counted as one of the crew sheet's.
    controls: [...document.querySelectorAll('.team-sheet .direct-send, .team-sheet .voice-mic, .team-sheet .voice-lang button, .team-sheet header .icon-button')]
      .map((el) => ({ name: (el.getAttribute('aria-label') || el.textContent || el.className).trim().slice(0, 24), height: el.getBoundingClientRect().height })),
    described: [...document.querySelectorAll('.team-grid .member-frame.can-talk')].map((el) => {
      const id = el.getAttribute('aria-describedby');
      const node = id ? document.getElementById(id) : null;
      return {
        name: (el.querySelector('strong')?.textContent || '').trim(),
        title: el.getAttribute('title'),
        described: node ? node.textContent.trim() : '',
        model: (el.querySelector('.member-model-text')?.textContent || '').trim(),
        role: (el.querySelector('small')?.textContent || '').trim(),
      };
    }),
  };
};
const inside = (outer, inner, label) => {
  if (!inner) return;
  assert.ok(inner.top >= outer.top - NO_SLOP && inner.bottom <= outer.bottom + NO_SLOP && inner.left >= outer.left - NO_SLOP && inner.right <= outer.right + NO_SLOP,
    `${label} ${JSON.stringify(inner)} escapes ${JSON.stringify({ top: outer.top, bottom: outer.bottom, left: outer.left, right: outer.right })}`);
};
const onScreen = (part, m, label) => inside({ top: 0, bottom: m.viewport.height, left: 0, right: m.viewport.width }, part, `${label} left the viewport`);
const noPopupScroll = (m, label) => assert.ok(m.sheet.scrollHeight <= m.sheet.clientHeight + NO_SLOP, `${label}: the popup scrolls (${m.sheet.scrollHeight} > ${m.sheet.clientHeight})`);

const noSideways = (m, label) => {
  assert.ok(m.sheet.scrollWidth <= m.sheet.clientWidth + NO_SLOP, `${label}: the popup scrolls sideways (${m.sheet.scrollWidth} > ${m.sheet.clientWidth})`);
  assert.ok(m.sheet.scrollWidth <= m.viewport.width, `${label}: the popup is wider than the window (${m.sheet.scrollWidth} > ${m.viewport.width})`);
};

// ── headroom: room to grow, measured on the popup that is already on screen ──────────────────────
// "Fits one screen" is only a durable claim while the popup is content-sized rather than clamped by its
// own `max-height`. A clamped dialog has spent every pixel it has and needs a scrollbar the moment a
// member is added, which is exactly what a Router team does whenever a profile is configured for it
// (agent-feed.py: seven members plus one per profile, nothing capped). The bar is half a crew row and
// the row is measured, not assumed: the distance between the first two rows of the grid that is on
// screen. A number typed in here would be a guess about the type scale wearing a measurement's clothes.
const rowPitch = (m) => {
  const tops = [...new Set(m.cards.map((card) => Math.round(card.box.top)))].sort((a, b) => a - b);
  return tops.length > 1 ? tops[1] - tops[0] : Math.round(m.cards[0]?.box.height || 0);
};
const hasHeadroom = (m, label) => {
  // A crew is asserted before the bar is computed, not after. `rowPitch` falls back to the first card's
  // height and to 0 when there is no card at all, so on an empty crew the bar is 0 and `spare >= 0` is
  // true on any layout: the one check that decides whether the popup is clamped or content-sized would
  // pass against nothing. That is the same class of defect as `null <= x` below, and the same one this
  // file was rebuilt to end.
  assert.ok(m.cards.length > 0, `${label}: the sheet drew no member card, so the headroom bar is measured against nothing`);
  const spare = m.maxHeight - m.sheet.box.height;
  const bar = Math.round(rowPitch(m) / 2);
  assert.ok(bar > 0, `${label}: half a member row is ${bar}px, so the headroom bar cannot judge anything`);
  assert.ok(spare >= bar,
    `${label}: the popup is ${Math.round(m.sheet.box.height)}px tall against a ${Math.round(m.maxHeight)}px cap — ${Math.round(Math.max(0, spare))}px from the edge where half a member row (${bar}px) is the bar, so the popup is clamped and one more member would scroll it`);
  return `${Math.round(spare)}px of headroom (bar ${bar}px)`;
};

// Every member is one cell of one grid — the lead took a full-width row of its own until this round, and
// removing it is what makes this arithmetic exact (styles.css `.team-cell`) — so a grid of `columns`
// tracks holding `members` members has this many cells free in its last row: fifteen members in four
// columns is four rows with one cell left, four members in four columns is one row with none. It is
// read off the columns the grid actually resolved to rather than out of a breakpoint, and the cards are
// then added to the live grid and the popup measured again — a pixel threshold could pass on a layout
// whose next member breaks it, but "these members are free slots" is arithmetic the grid already agrees
// with. The formula used to subtract one cell for the lead's row; that reservation does not exist any
// more, and a formula that keeps it would under-count the free cells of every long chain and read a
// full grid as one with room.
const freeSlots = (members, columns) => (columns - (members % columns)) % columns;

const roomForMoreMembers = async (page, extra) => page.evaluate((count) => {
  const grid = document.querySelector('.team-grid');
  const sheet = document.querySelector('.team-sheet');
  const roster = document.querySelector('.team-roster');
  const cells = [...document.querySelectorAll('.team-grid .team-cell')];
  const rows = () => new Set(cells.map((cell) => Math.round(cell.getBoundingClientRect().top))).size;
  const before = rows();
  const source = cells.filter((cell) => !cell.classList.contains('is-lead')).pop() || cells[0];
  const added = [];
  for (let index = 0; index < count; index += 1) {
    const clone = source.cloneNode(true);
    // A clone would carry the original's id and its `aria-describedby`, and two elements sharing one id
    // is a different bug than a tall one. The clone never outlives this call — it is removed below,
    // before the measured numbers are returned.
    clone.removeAttribute('id');
    clone.querySelectorAll('[id]').forEach((node) => node.remove());
    clone.querySelectorAll('[aria-describedby]').forEach((node) => node.removeAttribute('aria-describedby'));
    cells.push(clone);
    grid.appendChild(clone);
    added.push(clone);
  }
  const after = rows();
  const result = {
    before, after,
    sheetOver: sheet.scrollHeight - sheet.clientHeight,
    rosterOver: roster.scrollHeight - roster.clientHeight,
    height: Math.round(sheet.getBoundingClientRect().height),
  };
  // What this call actually touched, so the caller can tell "these members were free" from "there was no
  // grid to add them to". See the assertion in `freeSlotsFit`.
  result.foundGrid = !!grid;
  result.foundRoster = !!roster;
  result.added = added.length;
  added.forEach((node) => node.remove());
  return result;
}, extra);

// The crew is measured here too, for the same reason `hasHeadroom` measures it: this check adds cards to
// a grid that has to exist. On an empty crew `cells` is empty, `before` and `after` are both 0 and every
// comparison below passes — "these members cost nothing" proved against no grid at all.
const freeSlotsFit = async (page, m, label) => {
  assert.ok(m.cards.length > 0, `${label}: the sheet drew no member card, so there are no free slots to measure`);
  // The column count the arithmetic below is built on. It comes off `gridTemplateColumns`, so a grid that
  // resolved to zero tracks makes `freeSlots` return a division of nothing and the room assertions pass
  // on any layout at all.
  assert.ok(m.columns > 0, `${label}: the crew grid resolved to no columns, so the free-slot arithmetic cannot judge anything`);
  const extra = freeSlots(m.cards.length, m.columns);
  const room = await roomForMoreMembers(page, extra);
  // The grid it added cards to, asserted rather than assumed. `roomForMoreMembers` reads `.team-grid` and
  // `.team-roster` off the document: if either were renamed or not rendered, both reads are null and the
  // arithmetic above is `0 === 0` and `null - null <= 1` — true on a sheet with no grid at all.
  assert.ok(room.foundGrid && room.foundRoster,
    `${label}: the crew grid or the crew list was not on the page, so "free slots" was measured against nothing (grid ${room.foundGrid}, list ${room.foundRoster})`);
  // `added === extra` rather than `added > 0`, because "at least one" is an assertion about the shape of
  // the fixture rather than about the layout: a four-member team in a four-column grid has no free cell at
  // all, and a check that needs one to exist fails the one card that legitimately has none. Comparing the
  // two numbers is the same claim either way and it can still fail — a grid that took fewer cards than its
  // arithmetic says, or one whose rows grew when they should not have.
  assert.equal(room.added, extra,
    `${label}: the grid says ${extra} free member slot(s) for ${m.cards.length} members in ${m.columns} columns, and ${room.added} card(s) were added to it`);
  if (extra === 0) {
    // No free cell in the last row is a real state, not a skipped check: the card's grid is exactly full,
    // so the question worth answering is the one `hasHeadroom` already measured — how much of the popup's
    // own cap is left for the member that will cost a row.
    return `0 free member slot(s): ${m.cards.length} members fill ${m.columns} columns exactly; popup ${room.height}px of ${Math.round(m.maxHeight)}px, ${Math.round(m.maxHeight - room.height)}px of headroom`;
  }
  assert.equal(room.after, room.before,
    `${label}: ${extra} more member(s) should be free cells in a ${m.columns}-column grid (${m.cards.length} members), but the crew grew from ${room.before} to ${room.after} rows`);
  assert.ok(room.sheetOver <= NO_SLOP && room.rosterOver <= NO_SLOP,
    `${label}: ${extra} free member slot(s) still put the popup ${room.sheetOver}px and the crew list ${room.rosterOver}px over`);
  return `${extra} free member slot(s); popup ${room.height}px of ${Math.round(m.maxHeight)}px, ${Math.round(m.maxHeight - room.height)}px of headroom`;
};

// Does any member card sit under the message box or the "Now" list? At rest and at every scroll
// position of every scrollable region in the sheet, because the 390x844 capture only overlapped
// part way down the pane. Rectangles are read live, so a card that scrolls underneath a box is
// caught too, not only one that overlaps while nothing has been scrolled. Counted, not just
// reported: the earlier version of this file measured sideways overflow and printed ok for a layout
// with both boxes painted across the crew.
const overlapSweep = (page) => page.evaluate(() => {
  const name = (card) => (card.querySelector('strong')?.textContent || '').trim();
  const label = (el) => (el.classList.contains('direct-box') ? 'the message box' : 'the "Now" list');
  const crossing = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
  const hits = () => {
    const found = [];
    for (const box of document.querySelectorAll('.direct-box, .team-work')) {
      const t = box.getBoundingClientRect();
      for (const card of document.querySelectorAll('.team-grid .member-frame')) {
        if (crossing(card.getBoundingClientRect(), t)) found.push(`${name(card)} under ${label(box)}`);
      }
    }
    return found;
  };
  const found = hits();
  const scrollers = ['.team-pane', '.team-roster', '.team-side', '.team-work']
    .map((selector) => document.querySelector(selector)).filter((el) => el && el.scrollHeight > el.clientHeight + 1);
  for (const scroller of scrollers) {
    const reach = scroller.scrollHeight - scroller.clientHeight;
    // Every position, not three samples. The requirement is "no overlap at any scroll position", and a
    // card can cross under the composer's edge between 0%, 50% and 100% without ever being at one of
    // them: with a composer this far down the sheet the crossing band is a few dozen pixels out of
    // several hundred. The step is the smaller of a card height and 40px, so no single step can jump over
    // the band, and the count of positions is bounded by that rather than by a chosen sample size.
    const step = Math.max(1, Math.min(40, scroller.clientHeight / 4));
    for (let at = 0; at <= reach + step; at += step) {
      scroller.scrollTop = Math.min(at, reach);
      found.push(...hits());
    }
    scroller.scrollTop = 0;
  }
  return [...new Set(found)];
});
const noOverlap = async (page, label) => {
  const hits = await overlapSweep(page);
  assert.deepEqual(hits, [], `${label}: ${hits.length} member card(s) drawn under the message box or the "Now" list — ${hits.slice(0, 4).join('; ')}`);
};
// The same sweep, counted rather than trusted: the intersection count has to be reported, because "no
// overlap" and "the sweep never ran" are the same `ok` in a log. This is the check the round input names
// directly — count intersections at 1440x900, 1440x700 and 390x844, and they must be 0 — so the number
// appears in the log at each of those three viewports rather than only as a verdict.
const overlapCount = (page) => overlapSweep(page).then((hits) => hits.length);

// Truncated text has to be reachable without a hover tooltip: a `title` is a mouse-only channel, so a
// card that clamps its model line or its role may not depend on one. Every card describes itself with
// `aria-describedby`, and that description has to carry the words the card cuts.
const noTitleDependence = (m, label) => {
  // Every card is asserted, not just the ones that misbehave: on a sheet where no card is a
  // `can-talk` button, all three lists below are empty and "no card still leans on a title" is true.
  assert.ok(m.described.length > 0, `${label}: the sheet drew no described member card, so the truncated-text claim is measured against nothing`);
  const titled = m.described.filter((card) => card.title !== null).map((card) => card.name);
  assert.deepEqual(titled, [], `${label}: ${titled.join(', ')} still carry a title tooltip instead of a description`);
  const silent = m.described.filter((card) => !card.described).map((card) => card.name);
  assert.deepEqual(silent, [], `${label}: ${silent.join(', ')} have no aria-describedby text at all`);
  const lost = m.described.filter((card) => (card.model && !card.described.includes(card.model)) || (card.role && !card.described.includes(card.role))).map((card) => card.name);
  assert.deepEqual(lost, [], `${label}: the description of ${lost.join(', ')} does not carry the text the card clamps`);
};
// One desktop model line is what keeps fifteen cards inside 900px; on a phone the same line is given room
// and wraps. Those are two rules on purpose, in one stylesheet, so which one is in force is read off the
// rendered line instead of out of a breakpoint written down in a second place - the two disagreeed, and
// the phone was then reported as failing a layout that was correct.
// A 10.5px/1.35 line is ~14px tall; 20px leaves room for font rounding and still rules out a second row.
const ONE_LINE = 20;
const modelLinesFit = (m, label) => {
  assert.ok(m.modelLines.length > 0, `${label}: no member card carries a model line, so the model-line rules cannot judge anything`);
  const tall = m.modelLines.filter((line) => line.wrap === 'nowrap' && line.height > ONE_LINE).map((line) => `${line.text} (${line.height}px)`);
  assert.deepEqual(tall, [], `${label}: a nowrap model line took a second row: ${tall.join('; ')}`);
  // A wrapping line has room for the whole id, so an ellipsis or a hidden third row would be a
  // regression: "MiMo v2.6 Flash (backup Qwen3.8 27B · local)" cut to "MiMo v2.6 Flash (backup…"
  // tells the owner nothing at a glance. The words stay recoverable either way (see noTitleDependence).
  const cut = m.modelLines.filter((line) => line.wrap !== 'nowrap' && line.cut).map((line) => line.text);
  assert.deepEqual(cut, [], `${label}: a wrapping model line is still cut sideways: ${cut.join('; ')}`);
  const hidden = m.modelLines.filter((line) => line.wrap !== 'nowrap' && line.clipped).map((line) => line.text);
  assert.deepEqual(hidden, [], `${label}: a wrapping model line is cut vertically: ${hidden.join('; ')}`);
};
// …and the phone half is not a free pass either. Without this, "one line" goes green again the moment the
// wrap stops happening, with every model id ellipsized behind a width nobody was looking at any more.
const modelWraps = (m, label) => {
  const wrapped = m.modelLines.filter((line) => line.wrap !== 'nowrap');
  assert.ok(wrapped.length > 0, `${label}: no model line wraps here, so the phone rule has stopped applying and the ids are back behind an ellipsis`);
  assert.ok(wrapped.some((line) => line.height > ONE_LINE), `${label}: the model line is set to wrap but no line ever takes a second row`);
};
// Every name inside its own card, and nothing painted wider than the card it belongs to. A persona is one
// unbreakable word and used to be an anonymous flex item, which no rule can give `min-width: 0`, so at
// 390x844 it painted over the card edge and under its neighbour while every width-based check here
// printed ok. `spill` asks the card itself, so a line that overflows for any other reason cannot pass by
// leaving those rects inside.
const namesInside = (m, label) => {
  // The one assertion in this file that every other "no card is wrong" check depends on. With no card at
  // all the loop below has nothing to walk and `spill` is empty, so "every name stays inside its own
  // card" would be reported for a sheet that drew no names.
  assert.ok(m.cards.length > 0, `${label}: the sheet drew no member card, so the names are measured against nothing`);
  for (const card of m.cards) {
    for (const [part, rect] of [['name', card.nameBox], ['id', card.idBox], ['name row', card.rowBox]]) {
      if (!rect) continue;
      assert.ok(rect.left >= card.box.left - NO_SLOP && rect.right <= card.box.right + NO_SLOP
        && rect.top >= card.box.top - NO_SLOP && rect.bottom <= card.box.bottom + NO_SLOP,
      `${label}: ${card.name} paints its ${part} outside its own card (${Math.round(rect.left)}–${Math.round(rect.right)}px in a card at ${Math.round(card.box.left)}–${Math.round(card.box.right)}px)`);
    }
  }
  const spill = m.cards.filter((card) => card.spill).map((card) => card.name);
  assert.deepEqual(spill, [], `${label}: ${spill.join(', ')} paint content wider than their own card`);
};
// The chain band, measured. `expectBand` is what the fixture says the server sends: InvestPro is not a
// reviewed team, so it has no chain and no note, and a sheet without a band is correct there. "If there is
// a band it is inside the popup" alone would let a band that stopped rendering pass for one that fits.
const briefHonest = (m, label, expectBand) => {
  if (expectBand) {
    assert.ok(m.brief.lines.length > 0, `${label}: this team ships a chain band and the sheet drew none`);
    assert.deepEqual(m.brief.lines.filter((line) => !line), [], `${label}: the chain band drew ${m.brief.lines.length} line(s) and one of them is empty`);
  } else {
    assert.equal(m.brief.box, null, `${label}: a band with no text is drawn above the crew`);
  }
  inside(m.sheet.box, m.brief.box, 'the chain summary band');
  // The owner's criterion for this band is the chain-arrow summary, so a band that is drawn has to carry
  // arrows: BlogPro ships a note and no chain, which is why this is read off the rendered line instead of
  // assumed for every team. The glyph is a set rather than one character, because the arrow is the
  // server's wording to choose and this file should not fail over which one it picked.
  if (m.chain.text) {
    const arrows = m.chain.text.match(/[\u2190-\u21FF\u27F0-\u27FF\u2900-\u297F]/g) || [];
    assert.ok(arrows.length >= 2, `${label}: the chain summary is drawn but carries ${arrows.length} arrow(s), not a chain: "${m.chain.text}"`);
  }
  inside(m.sheet.box, m.chain.box, 'the chain summary line');
};
// 44px is the smallest reliable touch target (adapt: the input method decides, not the width alone).
const touchTargets = (m, label, min = 44) => {
  // Asserted here because every caller is guarded by `m.stacked` and by a team that ships recipients: a
  // team with no composer draws no chips, and "every chip is at least 44px" is then true of none.
  assert.ok(m.recipients.length > 0, `${label}: the composer drew no recipient chip, so the touch-target claim is measured against nothing`);
  const small = m.recipients.filter((chip) => chip.height < min - 0.5).map((chip) => `${chip.member} ${Math.round(chip.height)}px`);
  assert.deepEqual(small, [], `${label}: recipient chip under ${min}px: ${small.join(', ')}`);
  // …and the chips are not the whole set. A phone user meets Send, the mic, the language toggle and
  // Close with a finger too, and they were all left at their desktop heights while the chips were
  // fixed: measuring the chips alone made "every touch target in the popup is 44px" true of four
  // controls out of nine, which is the same defect one level up — a check that measures part of what
  // it claims and reports the part. Asserted non-empty for the same reason the chip list above is.
  assert.ok(m.controls.length >= 4, `${label}: the popup drew ${m.controls.length} of the controls the touch-target claim is about, so that claim is measured against almost nothing`);
  const thin = m.controls.filter((control) => control.height < min - 0.5).map((control) => `${control.name} ${Math.round(control.height)}px`);
  assert.deepEqual(thin, [], `${label}: touch target under ${min}px: ${thin.join(', ')}`);
};

// Push every scrollable region of the popup to its end and read where the last member, the header,
// the chain band and the message box ended up. This is the reachability proof, and it is also the
// only way to read the composer on a phone, where it sits below the fold in normal flow.
//
// `clipped` is the one clipping case that has no recovery: a card cut by a region that cannot
// scroll, because then no gesture brings the rest of it back. A region that *does* scroll always
// has a card under its edge — that is what scrolling is for — so it is measured, not asserted.
//
// The clipper is found by walking out of the card to its NEAREST clipping ancestor, rather than by
// guessing which region clips. That distinction is the whole check: the previous version picked a
// region only when it scrolled and then asserted it did not scroll, a condition that can never be
// true, so `clipped` was always empty and every "no member is cut off" line in this file passed
// without ever having looked at a card. A check that cannot fail is the same defect as the sideways
// -only overflow check that let the 390x844 composer overlap through, one level up.
//
// Recovery stops at the nearest clipper rather than continuing outwards, and that is not a
// shortcut. Scrolling a region also moves what is inside it, so once a scrolling ancestor has been
// found a card outside it is reachable by definition — continuing outwards would then measure the
// popup's own `overflow: hidden` box and report a perfectly reachable card as lost, which is how a
// clipping check turns into a false alarm.
const atEnd = (page) => page.evaluate(() => {
  const scrollers = ['.team-pane', '.team-roster', '.team-side', '.team-work']
    .map((selector) => document.querySelector(selector)).filter((el) => el && el.scrollHeight > el.clientHeight + 1);
  for (const scroller of scrollers) scroller.scrollTop = scroller.scrollHeight;
  const plain = (selector) => { const el = document.querySelector(selector); if (!el) return null; const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; };
  const cards = [...document.querySelectorAll('.team-grid .member-frame')];
  const name = (card) => (card.querySelector('strong')?.textContent || '').trim();
  const clipped = [];
  for (const card of cards) {
    const r = card.getBoundingClientRect();
    for (let node = card.parentElement; node && node !== document.body; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.overflowX === 'visible' && style.overflowY === 'visible') continue;
      const box = node.getBoundingClientRect();
      const scrolls = node.scrollHeight > node.clientHeight + 1 || node.scrollWidth > node.clientWidth + 1;
      const outside = r.top < box.top - 1 || r.bottom > box.bottom + 1 || r.left < box.left - 1 || r.right > box.right + 1;
      if (!scrolls && outside) {
        // `className` is a string on every element this walk can reach, but a live `SVGAnimatedString`
        // would throw on `.split()` — and this helper runs before a screenshot, so a throw here takes
        // the capture with it (the evidence rule at the top of this file).
        const label = typeof node.className === 'string' ? node.className.split(' ')[0] : node.tagName.toLowerCase();
        clipped.push(`${name(card)} (cut by .${label || node.tagName.toLowerCase()})`);
      }
      break;
    }
  }
  // `cards.at(-1)` and not `cards[cards.length - 1]`: the two checks that capture a scrolled-to-end
  // state call this *before* their screenshots, and a helper that throws before a screenshot takes the
  // capture down with it — the evidence rule this file is built on. A sheet with no member is a failed
  // check and not a crash, so `hasCards` says so and the callers assert it.
  const last = cards.at(-1);
  return {
    scrolled: scrollers.length,
    clipped: [...new Set(clipped)],
    hasCards: !!last,
    lastName: last ? name(last) : null,
    lastBottom: last ? last.getBoundingClientRect().bottom : null,
    sheetBottom: document.querySelector('.team-sheet').getBoundingClientRect().bottom,
    header: plain('.team-sheet header'), tabs: plain('.team-tabs'), brief: plain('.team-brief'), direct: plain('.direct-box'),
  };
});
const noClippedCards = (end, label) => assert.deepEqual(end.clipped, [], `${label}: ${end.clipped.join(', ')} is cut off by a region that cannot scroll, so no gesture brings the rest of it back`);
// `null <= 1` is true, so an empty crew would pass every "can the last member be reached" comparison
// below by having nothing to measure. One check says there is a crew at all.
const hasCrew = (end, label) => assert.ok(end.hasCards, `${label}: the sheet drew no member card, so reachability is measured against nothing`);

const CROP = { clip: { x: 0, y: 0, width: DESKTOP.width, height: DESKTOP.height } };
// Read defensively, for the same reason `MEASURE` is: the EVOLUTION view has no crew pane, and this
// string is printed after a check that may have opened it. `m.roster` is a `flow` object that is `null`
// when the element is absent, and `null.scrollHeight` is the TypeError that used to take a whole run down.
const report = (m) => `sheet ${Math.round(m.sheet.box.height)}/${m.viewport.height}px tall, ${m.columns} columns, ` +
  `crew ${Math.max(0, (m.roster?.scrollHeight || 0) - (m.roster?.clientHeight || 0))}px over, pane ${Math.max(0, (m.pane?.scrollHeight || 0) - (m.pane?.clientHeight || 0))}px over, ` +
  `"Now" ${Math.max(0, (m.work?.scrollHeight || 0) - (m.work?.clientHeight || 0))}px over`;

// ---- the measurement is taken on the glyphs that ship -------------------------------------------
// Every bound below is a pixel comparison, and the sheet is set in four faces the design is drawn in
// (styles.css: Bungee for the header and the band labels, Manrope for the member names and role lines,
// DM Mono for the count, VT323 for the LIVE badge). The harness now imports the same seven
// @fontsource files src/main.tsx imports, but an import list is not a measurement: a face is only
// fetched once something on the page uses it, and the sheet is what uses Bungee at 22px.
//
// Read out of `document.fonts` rather than out of that import list, and deliberately not
// `document.fonts.check(spec)`: per spec `check()` also answers true when the text can be rendered
// without the listed font, so for a missing Bungee it returns true and this check would pass on the
// exact layout it exists to catch. A face is `loaded` here or it is not there at all.
const APP_FACES = ['Bungee', 'Manrope', 'DM Mono', 'VT323'];
await check('the sheet is measured in the app\'s own fonts: every face the popup is set in is loaded before anything is measured', async () => {
  const page = await open(DESKTOP);
  await openSheet(page, 'StressPro');
  const faces = await page.evaluate(() => [...document.fonts].map((face) => ({ family: face.family, status: face.status })));
  const missing = APP_FACES.filter((family) => !faces.some((face) => face.family === family && face.status === 'loaded'));
  assert.deepEqual(missing, [],
    `the popup is being measured in a substituted face for: ${missing.join(', ')}. scripts/team-sheet-harness/main.tsx has to import the same @fontsource files src/main.tsx does, or every bound in this file describes a layout the app does not ship`);
  console.log(`     ${APP_FACES.join(', ')} loaded (${faces.filter((face) => APP_FACES.includes(face.family) && face.status === 'loaded').length} faces); the sheet is measured in the glyphs it ships in`);
  await page.close();
});

// ---- the tallest sheet BrainBook ships: AppPro, 11 members, 16 role chips, 10 work rows ---------
await check('AppPro (11 members, 16 role chips, 10 work rows) at 1440x900: popup and crew both fit, nothing overlaps', async () => {
  const page = await open(DESKTOP);
  await openSheet(page, 'AppPro');
  const m = await page.evaluate(MEASURE);
  record('AppPro', m);
  // Captured before anything is asserted (see the header): this file is the picture of the layout that
  // the numbers below are about, and a failing assertion must not be the reason there is no file.
  await page.screenshot({ path: shot('team-sheet-apppro-1440x900.png'), ...CROP });
  assert.equal(m.cards.length, 11, `expected all 11 members, saw ${m.cards.length}`);
  noPopupScroll(m, 'AppPro 1440x900');
  noSideways(m, 'AppPro 1440x900');
  assert.ok(m.roster.scrollHeight <= m.roster.clientHeight + NO_SLOP, `the crew list scrolls (${m.roster.scrollHeight} > ${m.roster.clientHeight})`);
  assert.ok(m.columns >= 4, `crew grid resolved to ${m.columns} columns at 1440, expected 4`);
  inside(m.sheet.box, m.header, 'the header');
  briefHonest(m, 'AppPro 1440x900', true);
  inside(m.sheet.box, m.direct, 'the message box');
  onScreen(m.header, m, 'the header');
  onScreen(m.direct, m, 'the message box');
  for (const card of m.cards) { assert.ok(card.box.height > 0, `${card.name} collapsed`); inside(m.sheet.box, card.box, `member ${card.name}`); }
  // The fixture exists because the last round never measured this shape: sixteen role chips and ten
  // work rows is the server's own ceiling (`roles[:16]`, `jobs[:5] + cards[:5]`), and the chip strip
  // is the part of the crew column that grows with it.
  assert.equal(m.chips, 16, `expected the roster's 16 role-file chips, saw ${m.chips}`);
  noTitleDependence(m, 'AppPro 1440x900');
  modelLinesFit(m, 'AppPro 1440x900');
  namesInside(m, 'AppPro 1440x900');
  await noOverlap(page, 'AppPro 1440x900');
  const end = await atEnd(page);
  noClippedCards(end, 'AppPro 1440x900');
  assert.ok(end.lastBottom <= end.sheetBottom + NO_SLOP, `${end.lastName} cannot be reached inside the popup`);
  // The two halves of "there is room": the popup is content-sized rather than clamped, and the grid has
  // free cells left. Both are measured on the popup that is already open, so neither can pass on a
  // layout that is one member row from scrolling.
  hasHeadroom(m, 'AppPro 1440x900');
  console.log(`     ${report(m)}; ${await freeSlotsFit(page, m, 'AppPro 1440x900')}`);
  await page.close();
});

// ---- the longest chain in the roster, at the viewport the owner named --------------------------
await check('MoviePro (15 members) at 1440x900: the popup and the crew list do not scroll, and nothing overlaps', async () => {
  const page = await open(DESKTOP);
  await openSheet(page, 'MoviePro');
  const m = await page.evaluate(MEASURE);
  record('MoviePro', m);
  // The one capture whose absence was the review's blocking finding, and it was absent because the
  // capture sat after the assertions: a red check wrote nothing at all.
  await page.screenshot({ path: shot('team-sheet-moviepro-1440x900.png'), ...CROP });
  assert.equal(m.cards.length, 15, `expected all 15 members, saw ${m.cards.length}`);
  noPopupScroll(m, 'MoviePro 1440x900');
  noSideways(m, 'MoviePro 1440x900');
  assert.ok(m.roster.scrollHeight <= m.roster.clientHeight + NO_SLOP, `the crew list scrolls (${m.roster.scrollHeight} > ${m.roster.clientHeight})`);
  assert.ok(m.columns >= 4, `crew grid resolved to ${m.columns} columns at 1440, expected 4`);
  onScreen(m.sheet.box, m, 'the popup');
  inside(m.sheet.box, m.header, 'the header');
  briefHonest(m, 'MoviePro 1440x900', true);
  inside(m.sheet.box, m.direct, 'the message box');
  for (const card of m.cards) { assert.ok(card.box.height > 0, `${card.name} collapsed`); inside(m.sheet.box, card.box, `member ${card.name}`); }
  // Seven chips: the film unit's six department skills plus the script lane's own role file, which is
  // what the server emits for the one merged MoviePro card (agent-feed.py role_labels). Counting them
  // is what makes "the merged card lost nothing" a measurement; an earlier fixture listed six and would
  // have kept passing after a merge dropped the lane's roles again.
  assert.equal(m.chips, 7, `expected the six film skills plus the script lane's role file, saw ${m.chips}`);
  noTitleDependence(m, 'MoviePro 1440x900');
  modelLinesFit(m, 'MoviePro 1440x900');
  namesInside(m, 'MoviePro 1440x900');
  await noOverlap(page, 'MoviePro 1440x900');
  hasHeadroom(m, 'MoviePro 1440x900');
  const end = await atEnd(page);
  noClippedCards(end, 'MoviePro 1440x900');
  assert.ok(end.lastBottom <= end.sheetBottom + NO_SLOP, `${end.lastName} cannot be reached inside the popup`);
  console.log(`     ${report(m)}; ${await freeSlotsFit(page, m, 'MoviePro 1440x900')}`);
  await page.close();
});

// ---- the bound: not a team, the union of the two heaviest cards the server can build --------------
// MoviePro's fifteen members carrying AppPro's sixteen role chips and ten work rows in one card. Five of
// the eight teams are Router cards whose member count is seven plus one per configured profile with
// nothing capping the profile list, so a fit measured only on today's longest team is a claim about
// today's roster: this card is the claim about the layout.
await check('StressPro (15 members, 16 role chips, 10 work rows) at 1440x900: the bound fits, with room, and nothing overlaps', async () => {
  const page = await open(DESKTOP);
  await openSheet(page, 'StressPro');
  const m = await page.evaluate(MEASURE);
  record('StressPro', m);
  // Written before the first assertion, and this is the capture that was missing from `evidence/` while
  // the round reported the bound as measured: this check is the one that fails first if the bound does
  // not fit, and a file written after the assertions is a file a red check never leaves behind.
  await page.screenshot({ path: shot('team-sheet-stresspro-1440x900.png'), ...CROP });
  assert.equal(m.cards.length, 15, `expected the bound card's 15 members, saw ${m.cards.length}`);
  assert.equal(m.chips, 16, `expected the roster's 16 role-file chips, saw ${m.chips}`);
  // Ten "Now" rows: `jobs[:5] + cards[:5]` is the server's own ceiling, and the bound has to carry it or
  // it is only MoviePro's member count in a lighter card.
  assert.equal(m.workRows, 10, `expected the server's 10 work rows, saw ${m.workRows}`);
  noPopupScroll(m, 'StressPro 1440x900');
  noSideways(m, 'StressPro 1440x900');
  assert.ok(m.roster.scrollHeight <= m.roster.clientHeight + NO_SLOP, `the crew list scrolls (${m.roster.scrollHeight} > ${m.roster.clientHeight})`);
  assert.ok(m.columns >= 4, `crew grid resolved to ${m.columns} columns at 1440, expected 4`);
  inside(m.sheet.box, m.header, 'the header');
  briefHonest(m, 'StressPro 1440x900', true);
  inside(m.sheet.box, m.direct, 'the message box');
  onScreen(m.header, m, 'the header');
  onScreen(m.direct, m, 'the message box');
  for (const card of m.cards) { assert.ok(card.box.height > 0, `${card.name} collapsed`); inside(m.sheet.box, card.box, `member ${card.name}`); }
  noTitleDependence(m, 'StressPro 1440x900');
  modelLinesFit(m, 'StressPro 1440x900');
  namesInside(m, 'StressPro 1440x900');
  await noOverlap(page, 'StressPro 1440x900');
  const end = await atEnd(page);
  noClippedCards(end, 'StressPro 1440x900');
  assert.ok(end.lastBottom <= end.sheetBottom + NO_SLOP, `${end.lastName} cannot be reached inside the popup`);
  hasHeadroom(m, 'StressPro 1440x900');
  console.log(`     ${report(m)}; ${await freeSlotsFit(page, m, 'StressPro 1440x900')}`);
  await page.close();
});

// ---- the shortest chain in the roster, at the same viewport -----------------------------------
await check('BlogPro (4 members) at 1440x900: every member visible, nothing stretched, nothing overlaps', async () => {
  const page = await open(DESKTOP);
  await openSheet(page, 'BlogPro');
  const m = await page.evaluate(MEASURE);
  record('BlogPro', m);
  await page.screenshot({ path: shot('team-sheet-blogpro-1440x900.png'), ...CROP });
  assert.equal(m.cards.length, 4, `expected 4 members, saw ${m.cards.length}`);
  noPopupScroll(m, 'BlogPro 1440x900');
  noSideways(m, 'BlogPro 1440x900');
  assert.ok(m.roster.scrollHeight <= m.roster.clientHeight + NO_SLOP, `the crew list scrolls (${m.roster.scrollHeight} > ${m.roster.clientHeight})`);
  briefHonest(m, 'BlogPro 1440x900', true);
  inside(m.sheet.box, m.direct, 'the message box');
  const rows = new Set(m.cards.map((card) => Math.round(card.box.top)));
  // `rows.size` is 0 on an empty crew, so the count is asserted before the layout is read off it: "four
  // members sit in one row" measured against no rows is the same check that cannot fail.
  assert.ok(m.cards.length > 0, 'the short-team popup drew no member card, so its layout is measured against nothing');
  // One row of four, and one row is the honest shape for four members: the lead used to take a full-width
  // row of its own, which made this popup two rows tall and the widest box in it three quarters empty. A
  // short team has to look intentional, and a row reserved for a hierarchy that the tint, the badge and
  // the reading order already carry is the opposite of that (see `.team-cell`, styles.css).
  assert.equal(rows.size, 1, `4 members should sit in 1 row of the ${m.columns}-column crew grid, saw ${rows.size}`);
  const lead = m.cards.filter((card) => card.lead);
  assert.equal(lead.length, 1, 'Sora should be the one lead card');
  // …and the lead is one cell, not a bar. It leads by being first and by depth 0, so a card four times its
  // neighbours' width is the stretch this check exists to reject, not the intent.
  assert.ok(lead[0].box.width <= 420, `the lead card is ${Math.round(lead[0].box.width)}px wide; it should be one cell like every other member`);
  assert.equal(Math.round(lead[0].box.left), Math.round(Math.min(...m.cards.map((card) => card.box.left))),
    'the lead card is not in the first cell of the first row');
  for (const card of m.cards.filter((entry) => !entry.lead)) {
    // A 4-member team must look like a small grid, not a stretched tall layout: content-sized cards.
    assert.ok(card.box.height <= 120, `member ${card.name} is stretched to ${Math.round(card.box.height)}px in a 4-member team`);
    assert.ok(card.box.width <= 420, `member ${card.name} is stretched to ${Math.round(card.box.width)}px wide`);
  }
  assert.ok(m.sheet.box.height < DESKTOP.height * 0.9, `a 4-member popup fills ${Math.round(m.sheet.box.height)}px of ${DESKTOP.height}px; it should be content-sized`);
  namesInside(m, 'BlogPro 1440x900');
  await noOverlap(page, 'BlogPro 1440x900');
  // A short team has to look intentional, and "content-sized" is the whole of that: the popup ends far
  // above its own cap and the cards keep their own height rather than filling the column.
  hasHeadroom(m, 'BlogPro 1440x900');
  // Free slots here too, and for the same reason as on the long cards: the claim "the layout has room to
  // grow" is a claim about every card the rail can open, and a four-member popup is the one most likely
  // to pass a height check while having no free cell left in its grid.
  console.log(`     sheet ${Math.round(m.sheet.box.height)}/${DESKTOP.height}px tall, ${m.columns} columns, tallest card ${Math.round(Math.max(...m.cards.map((card) => card.box.height)))}px, ${Math.round(m.maxHeight - m.sheet.box.height)}px of headroom; ${await freeSlotsFit(page, m, 'BlogPro 1440x900')}`);
  await page.close();
});

// ---- the documented fallback: a window too short for the crew, header still pinned ------------
await check('MoviePro at 1440x700: the popup still does not scroll, nothing overlaps and header, chain and message box stay put', async () => {
  const page = await open(SHORT);
  await openSheet(page, 'MoviePro');
  const m = await page.evaluate(MEASURE);
  record('MoviePro', m);
  // Both of this check's measurements and both of its captures run before its first assertion. It reads
  // as a capture sandwiched between two blocks of checks, which is why the run could reach this line
  // with seven of its files on disk and this one missing: a red assertion above threw out of the check
  // body and the line below never ran. The state the fallback capture shows is the crew list scrolled
  // to its last member with the composer still pinned, so it has to be taken after `atEnd` and before
  // anything that can throw (see the header).
  const end = await atEnd(page);
  await page.screenshot({ path: shot('team-sheet-moviepro-1440x700-fallback.png'), ...CROP });
  assert.equal(m.cards.length, 15, `expected all 15 members, saw ${m.cards.length}`);
  noPopupScroll(m, 'MoviePro 1440x700');
  inside(m.sheet.box, m.header, 'the header');
  briefHonest(m, 'MoviePro 1440x700', true);
  inside(m.sheet.box, m.direct, 'the message box');
  onScreen(m.header, m, 'the header');
  onScreen(m.brief.box, m, 'the chain summary band');
  onScreen(m.direct, m, 'the message box');
  await noOverlap(page, 'MoviePro 1440x700');
  hasCrew(end, 'MoviePro 1440x700');
  noClippedCards(end, 'MoviePro 1440x700');
  assert.ok(end.scrolled === 0 || end.lastBottom <= end.sheetBottom + NO_SLOP, `${end.lastName} cannot be reached by scrolling the crew list`);
  onScreen(end.header, m, 'the header after scrolling the crew list');
  onScreen(end.brief, m, 'the chain summary band after scrolling the crew list');
  onScreen(end.direct, m, 'the message box after scrolling the crew list');
  console.log(`     crew list scrolled ${end.scrolled ? 'yes' : 'no'}; last member ${end.lastName} ${end.lastBottom <= end.sheetBottom + NO_SLOP ? 'reached' : 'did not reach the fold'}; ${report(m)}`);
  await page.close();
});

// ---- phone -------------------------------------------------------------------------------------
await check('MoviePro at 390x844: the crew and the message box never overlap, and nothing overflows sideways', async () => {
  const page = await open(PHONE);
  await openSheet(page, 'MoviePro');
  const m = await page.evaluate(MEASURE);
  record('MoviePro', m);
  await page.screenshot({ path: shot('team-sheet-moviepro-390x844.png'), fullPage: false });
  // The second capture and the state it shows, taken here — before the first assertion in this check can
  // fail — which is the rule the header states and the 1440x700 check below already obeys. This one did
  // not: the composer capture sat after eight assertions, so a phone run that failed any of them threw
  // out of the body before reaching it and left `team-sheet-moviepro-390x844-composer.png` off disk. That
  // is the failure this file exists to end, and it is not a cosmetic one — a missing capture says
  // nothing about which check failed, so the run looks like it stopped rather than like it reported.
  //
  // Reading the scrolled-to-end state before the overlap sweep cannot change what the sweep measures:
  // `overlapSweep` walks every scroll position of every scroller itself and restores each one to 0, and
  // the assertions below read `end`, which is a snapshot of numbers rather than live rects.
  const end = await atEnd(page);
  await page.screenshot({ path: shot('team-sheet-moviepro-390x844-composer.png'), fullPage: false });
  assert.equal(m.cards.length, 15, `expected 15 members, saw ${m.cards.length}`);
  assert.ok(m.stacked, 'the phone layout is not the stacked pane; the composer would sit beside the crew again');
  noSideways(m, 'MoviePro 390x844');
  // A phone must not put the chain back into one 15-card column: the grid keeps two tracks there, so
  // the crew reads as a grid instead of the tower the desktop rule exists to prevent.
  assert.ok(m.columns >= 2, `crew grid resolved to ${m.columns} column at ${PHONE.width}px; 15 members would be a 15-card tower`);
  briefHonest(m, 'MoviePro 390x844', true);
  onScreen(m.header, m, 'the header');
  onScreen(m.brief.box, m, 'the chain summary band');
  // Stacked, the two columns are one column of content-sized rows, so the composer and the "Now" list
  // begin below the crew in normal flow. Overlap was drawn on top of the cards in the 390x844 capture.
  //
  // `side` and `roster` are not the same shape, which is what this assertion got wrong. `side` is the
  // flat rectangle `box()` returns (MEASURE, above), so it is read as `m.side.top`. `roster` is the
  // crew pane with its scroll metrics spread flat *around* a `box` key (also MEASURE), so its rectangle
  // is `m.roster.box.bottom` and `m.roster.bottom` is `undefined`. Reading either of them through the
  // other's shape threw a TypeError here, which `check` caught as a FAIL and the rest of this phone
  // check never ran — the overlap count was exactly what was lost.
  assert.ok(m.side && m.roster?.box, 'the phone sheet drew no crew pane at all, so the stacking claim is measured against nothing');
  assert.ok(m.side.top >= m.roster.box.bottom - NO_SLOP,
    `the message column starts at ${Math.round(m.side.top)}px, inside the crew (ends at ${Math.round(m.roster.box.bottom)}px)`);
  // A phone is where the reviewer's three findings live: the model line used to ellipsize hard, a
  // recipient chip was 30px tall, and the clamped words rode a `title` no touch or screen-reader user
  // ever reaches. All three are measured here, on the width where they happen, and so is the fourth: a
  // persona is one unbreakable word, so a card that could not shrink its name painted it over the edge.
  noTitleDependence(m, 'MoviePro 390x844');
  modelLinesFit(m, 'MoviePro 390x844');
  modelWraps(m, 'MoviePro 390x844');
  touchTargets(m, 'MoviePro 390x844');
  namesInside(m, 'MoviePro 390x844');
  await noOverlap(page, 'MoviePro 390x844');
  // The number the round input asks for, printed: member cards drawn under the composer or the "Now"
  // list, at this viewport, over every scroll position of every scrollable region. 0 is the claim.
  console.log(`     member card x (message box | "Now") intersections at ${PHONE.width}x${PHONE.height}: ${await overlapCount(page)} (must be 0, at every scroll position)`);
  console.log(`     ${report(m)}`);
  // The checks on the scrolled-to-end state `end` carries, which was taken above with the capture: the
  // header and chain band still pinned, the composer reached, and the last member inside the popup.
  onScreen(end.header, m, 'the header after scrolling the pane');
  onScreen(end.brief, m, 'the chain summary band after scrolling the pane');
  onScreen(end.direct, m, 'the composer after scrolling the pane');
  noClippedCards(end, 'MoviePro 390x844');
  assert.ok(end.lastBottom <= end.sheetBottom + NO_SLOP, `${end.lastName} cannot be reached inside the popup`);
  await page.close();
});

// ---- keyboard ----------------------------------------------------------------------------------
// The last review passed "radiogroup with roving tabindex" by reading the code, and the finding it
// did raise was an arrow key that stepped the wrong way. Reading cannot settle either, so both
// keyboards are driven here and the selection is read back from the DOM after every press.
await check('AppPro: the recipient chips are a radiogroup — arrows move the selection, focus follows, Home and End reach the ends', async () => {
  const page = await open(DESKTOP);
  await openSheet(page, 'AppPro');
  const chips = () => page.evaluate(() => {
    const all = [...document.querySelectorAll('.direct-to button[data-member]')];
    return {
      checked: document.querySelector('.direct-to button[aria-checked="true"]')?.getAttribute('data-member') ?? null,
      tabbable: document.querySelector('.direct-to button[tabindex="0"]')?.getAttribute('data-member') ?? null,
      focused: document.activeElement?.getAttribute?.('data-member') ?? null,
      first: all[0]?.getAttribute('data-member') ?? null,
      last: all[all.length - 1]?.getAttribute('data-member') ?? null,
    };
  });
  const start = await chips();
  assert.ok(start.checked && start.checked === start.tabbable, `on open the checked chip (${start.checked}) and the tabbable chip (${start.tabbable}) are not the same one`);
  await page.locator('.direct-to button[aria-checked="true"]').focus();
  await page.keyboard.press('ArrowRight');
  const right = await chips();
  assert.notEqual(right.checked, start.checked, `ArrowRight left the recipient on ${right.checked}`);
  assert.equal(right.focused, right.checked, `focus stayed on ${right.focused} while ${right.checked} is the selected chip`);
  assert.equal(right.tabbable, right.checked, `the roving tabindex stayed on ${right.tabbable}`);
  await page.keyboard.press('ArrowLeft');
  assert.equal((await chips()).checked, start.checked, 'ArrowLeft did not step back to the chip before');
  await page.keyboard.press('End');
  assert.equal((await chips()).checked, (await chips()).last, 'End did not select the last chip');
  await page.keyboard.press('Home');
  const home = await chips();
  assert.equal(home.checked, home.first, 'Home did not select the first chip');
  assert.equal(home.focused, home.first, `focus did not follow Home (on ${home.focused})`);
  await page.close();
});

await check('InvestPro: the tab strip steps in opposite directions on all four arrows, and Home/End reach the ends', async () => {
  const page = await open(DESKTOP);
  await openSheet(page, 'InvestPro');
  const tabs = () => page.evaluate(() => ({
    selected: document.querySelector('.team-tabs [role="tab"][aria-selected="true"]')?.textContent ?? null,
    focused: document.activeElement?.textContent ?? null,
  }));
  await page.locator('.team-tabs [role="tab"][aria-selected="true"]').focus();
  await page.keyboard.press('ArrowRight');
  assert.equal((await tabs()).selected, 'EVOLUTION', 'ArrowRight did not select the EVOLUTION tab');
  // Two tabs make the two directions coincide, which is exactly why this read as working: the fix is a
  // signed step, and the assertion below keeps both directions covered when the strip grows.
  await page.keyboard.press('ArrowRight');
  assert.equal((await tabs()).selected, 'Team', 'ArrowRight did not wrap back to the first tab');
  await page.keyboard.press('ArrowLeft');
  const left = await tabs();
  assert.equal(left.selected, 'EVOLUTION', 'ArrowLeft did not step to the other tab');
  assert.equal(left.focused, 'EVOLUTION', `focus stayed on ${left.focused} after ArrowLeft`);
  // The vertical pair is driven too, and it is the half that was read rather than measured: the strip
  // is horizontal, so a handler that answered only Left/Right is correct for every tab a reader can
  // reach today, and the next vertical tablist on this rail would inherit the gap. A tablist that
  // claims `role="tablist"` answers all four arrows, so all four are pressed here (fixing-accessibility:
  // a role has to behave like the role).
  await page.keyboard.press('ArrowDown');
  const down = await tabs();
  assert.equal(down.selected, 'Team', `ArrowDown did not step forward off EVOLUTION (on ${down.selected})`);
  assert.equal(down.focused, 'Team', `focus stayed on ${down.focused} after ArrowDown`);
  await page.keyboard.press('ArrowUp');
  const up = await tabs();
  assert.equal(up.selected, 'EVOLUTION', `ArrowUp did not step back off Team (on ${up.selected})`);
  assert.equal(up.focused, 'EVOLUTION', `focus stayed on ${up.focused} after ArrowUp`);
  await page.close();
});

// ---- focus stays in the dialog ------------------------------------------------------------------
// `aria-modal="true"` is a claim about focus, and a claim has to be measured like any other. Taking
// focus on open is half of it: without the other half, Tab walked off the last control and into the app
// behind the popup with the team sheet still open, which is how a modal stops being one.
await check('AppPro: Tab wraps inside the popup, so focus never reaches the app behind it', async () => {
  const page = await open(DESKTOP);
  await openSheet(page, 'AppPro');
  const ends = await page.evaluate((selector) => {
    const stops = [...document.querySelectorAll(selector)];
    const name = (el) => (el?.getAttribute('aria-label') || el?.textContent || el?.className || '').trim().slice(0, 40);
    return { count: stops.length, first: name(stops[0]), last: name(stops.at(-1)) };
  }, TAB_STOPS);
  assert.ok(ends.count > 3, `the popup has ${ends.count} control(s) to tab through, so the wrap cannot be proved from it`);
  const focused = () => page.evaluate(() => {
    const el = document.activeElement;
    return { inSheet: !!document.querySelector('.team-sheet')?.contains(el), name: (el?.getAttribute('aria-label') || el?.textContent || el?.className || '').trim().slice(0, 40) };
  });
  await page.evaluate((selector) => { [...document.querySelectorAll(selector)].at(-1).focus(); }, TAB_STOPS);
  assert.equal((await focused()).name, ends.last, `the last control in the popup is not the one this check assumed (${ends.last})`);
  await page.keyboard.press('Tab');
  const forward = await focused();
  assert.ok(forward.inSheet, `Tab from the last control left the popup, onto "${forward.name}"`);
  assert.equal(forward.name, ends.first, `Tab from the last control landed on "${forward.name}" instead of wrapping to the first control ("${ends.first}")`);
  await page.keyboard.press('Shift+Tab');
  const back = await focused();
  assert.ok(back.inSheet, `Shift+Tab from the first control left the popup, onto "${back.name}"`);
  assert.equal(back.name, ends.last, `Shift+Tab from the first control landed on "${back.name}" instead of wrapping to the last control ("${ends.last}")`);
  await page.close();
});

// ---- the tap path ------------------------------------------------------------------------------
// `aria-describedby` covers a screen-reader user. This is the other half: the card a finger can reach
// has to carry everything the grid cut, and the dialog has to take focus and hand it back.
await check('AppPro: tapping a member card opens its model and its reporting line, focus goes there and comes back, and the card\u2019s own description carries its role', async () => {
  const page = await open(DESKTOP);
  await openSheet(page, 'AppPro');
  const card = page.locator('.team-grid .member-frame.can-talk').nth(1);
  const wanted = await page.evaluate(() => {
    const el = document.querySelectorAll('.team-grid .member-frame.can-talk')[1];
    const id = el.getAttribute('aria-describedby');
    return {
      name: (el.querySelector('strong')?.textContent || '').trim(),
      model: (el.querySelector('.member-model-text')?.textContent || '').trim(),
      role: (el.querySelector('small')?.textContent || '').trim(),
      note: id ? (document.getElementById(id)?.textContent || '').trim() : '',
    };
  });
  assert.ok(wanted.note.includes(wanted.role), `${wanted.name}: the note beside the card does not carry its role ("${wanted.role}")`);
  await card.click();
  await page.waitForSelector('.agent-info');
  // Focus lands in an effect after the dialog is painted, so this waits rather than samples once.
  const focusedInside = await page.waitForFunction(() => {
    const panel = document.querySelector('.agent-info');
    return !!panel && panel.contains(document.activeElement);
  }, null, { timeout: 3000 }).then(() => true, () => false);
  const info = await page.evaluate(() => {
    const panel = document.querySelector('.agent-info');
    return { terms: [...panel.querySelectorAll('dt')].map((dt) => dt.textContent), text: panel.innerText };
  });
  assert.ok(focusedInside, 'the info card did not take focus when it opened');
  assert.ok(info.terms.includes('Reports to'), `the info card has no reporting line (${info.terms.join(', ')})`);
  assert.ok(info.text.includes(wanted.model), `the info card does not carry the model line "${wanted.model}"`);
  // The role line is the second half of the same promise. `textContent` is the whole sentence whatever
  // the two-row clamp shows, so this reads the cut text itself: if the tap path ever drops it again,
  // a phone user has no way back to it.
  assert.ok(info.text.includes(wanted.role), `the info card does not carry the role line "${wanted.role}" (${info.terms.join(', ')})`);
  // A disclosure trigger is not a toggle. `aria-pressed` here would be read out as a state the card
  // never changes, which is worse than saying nothing.
  const pressed = await page.evaluate(() => document.querySelectorAll('.team-grid .member-frame.can-talk[aria-pressed]').length);
  assert.equal(pressed, 0, `${pressed} crew card(s) still announce a pressed state instead of opening a dialog`);
  await page.keyboard.press('Escape');
  await page.waitForSelector('.agent-info', { state: 'detached' });
  const back = await page.waitForFunction(() => !!document.activeElement?.classList.contains('member-frame'), null, { timeout: 3000 })
    .then(() => true, () => false);
  assert.ok(back, `focus did not return to the ${wanted.name} card that opened the info`);
  await page.close();
});

// ---- the card over the card ---------------------------------------------------------------------
// The "what does this agent do?" card carries `aria-modal="true"`, which is a claim about focus, and the
// popup's own trap cannot keep that claim for it: React routes this card's events through the React tree
// while the crew's trap reads its stop list out of the DOM, where a card portalled to <body> is not a
// descendant. So Tab pressed inside this card reached the crew's trap, which read it as focus escaping
// and pulled focus back into the crew — Tab moved the owner out of the card they were reading. Both
// directions are pressed here on a member the composer can also instruct, because that is the one shape
// with a second control to wrap between.
await check('the "what does this agent do?" card keeps focus inside itself, and the crew tab trap does not answer for it', async () => {
  const page = await open(DESKTOP);
  await openSheet(page, 'AppPro');
  // The member is picked out of the rendered sheet rather than typed in: it is the one the composer
  // can instruct, which is what gives the card its second control, and a name in this file goes stale
  // the moment agentRoster.ts renames a persona.
  const pick = await page.evaluate(() => {
    const name = (document.querySelector('.direct-to button[data-member]')?.textContent || '').trim();
    const cards = [...document.querySelectorAll('.team-grid .member-frame.can-talk')];
    return { name, index: cards.findIndex((el) => (el.querySelector('.member-name')?.textContent || '').trim() === name) };
  });
  assert.ok(pick.name && pick.index >= 0, `no crew card matches the composer's own first recipient (${pick.name})`);
  await page.locator('.team-grid .member-frame.can-talk').nth(pick.index).click();
  await page.waitForSelector('.agent-info');
  // Two, because the card it is used on draws two: the header's close control and the "give them an
  // instruction" button that only exists on a member the composer can instruct. Read against the
  // rendered card rather than the member's name, because a name in this file goes stale the moment
  // agentRoster.ts renames a persona — and a message naming Linus Torvalds for a defect in this file's
  // own selector sent the last round looking at the roster instead.
  const stops = await page.evaluate((selector) => ({
    count: document.querySelectorAll(selector).length,
    names: [...document.querySelectorAll(selector)].map((el) => (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40)),
    cardFound: !!document.querySelector('.agent-info'),
  }), INFO_STOPS);
  assert.ok(stops.cardFound, 'the info card did not open, so there is no card to keep focus inside');
  assert.ok(stops.count >= 2,
    `${stops.count} focusable control(s) found in the open info card (${stops.names.join(' | ') || 'none'}), so its focus containment cannot be proved from it — check INFO_STOPS still matches what the card renders`);
  const focused = () => page.evaluate(() => {
    const panel = document.querySelector('.agent-info');
    const el = document.activeElement;
    return { inInfo: !!panel?.contains(el), name: (el?.getAttribute('aria-label') || el?.textContent || el?.className || '').trim().slice(0, 40) };
  });
  await page.evaluate((selector) => [...document.querySelectorAll(selector)].at(-1).focus(), INFO_STOPS);
  await page.keyboard.press('Tab');
  const forward = await focused();
  assert.ok(forward.inInfo, `Tab from the last control in the info card left it, onto "${forward.name}" — the crew's tab trap answered for a card that is not part of it`);
  await page.keyboard.press('Shift+Tab');
  const back = await focused();
  assert.ok(back.inInfo, `Shift+Tab from the first control in the info card left it, onto "${back.name}"`);
  // And the popup underneath is still a modal of its own once this card is gone.
  await page.keyboard.press('Escape');
  await page.waitForSelector('.agent-info', { state: 'detached' });
  const inSheet = () => page.evaluate(() => !!document.querySelector('.team-sheet')?.contains(document.activeElement));
  await page.evaluate((selector) => [...document.querySelectorAll(selector)].at(-1).focus(), TAB_STOPS);
  await page.keyboard.press('Tab');
  assert.ok(await inSheet(), 'Tab from the last control in the popup left it once the info card closed');
  await page.close();
});

// ---- every team, at every viewport, on the same hard invariants ----------------------------------
// The dialog has three ways to give height back (crew list, pane, "Now" list) and which one is used
// depends on the width and the height, so every combination is walked rather than reasoned about — and
// it is walked for *every* card the rail can open. The previous list sampled three teams, which is how
// four of the eight teams the server emits were never measured at a single viewport while this file
// printed ok throughout. The set is checked against the rail itself at the end of the run, so a team
// added to the harness without being swept fails there rather than passing quietly.
const SWEEP_TEAMS = ['AppPro', 'AccountPro', 'ClassPro', 'RentPro', 'MarketPro', 'StressPro', 'MoviePro', 'BlogPro', 'InvestPro'];
const SWEEP_VIEWPORTS = [DESKTOP, SHORT, WIDE_SHORT, NARROW_SHORT, PHONE];
const SWEEP = SWEEP_TEAMS.flatMap((team) => SWEEP_VIEWPORTS.map((viewport) => [team, viewport]));
for (const [team, viewport] of SWEEP) {
  const at = `${viewport.width}x${viewport.height}`;
  await check(`${team} at ${at}: the popup never scrolls, nothing overlaps, every member stays reachable`, async () => {
    const page = await open(viewport);
    await openSheet(page, team);
    const m = await page.evaluate(MEASURE);
    record(team, m);
    // First, before anything is measured off the sheet: an empty crew makes every comparison below
    // vacuously true — `rows.size` is 0, `lastBottom` is null and `null <= x` holds, `modelLines` is
    // empty and "no model line is cut" passes on no model line. This sweep is 45 of the run's checks, so
    // one check that says "there is something here at all" is what keeps the other 44 honest.
    assert.ok(m.cards.length > 0, `${team} at ${at}: the sheet drew no member card, so this viewport is measured against nothing`);
    noPopupScroll(m, `${team} ${at}`);
    noSideways(m, `${team} ${at}`);
    // The owner's criterion is "the whole popup on one screen at 1440x900", so it is asserted for every
    // card at that viewport rather than only for the few the dedicated checks above open: neither the
    // popup nor the crew list may scroll, and the popup has to have half a member row in hand.
    if (viewport === DESKTOP) {
      assert.ok(m.roster.scrollHeight <= m.roster.clientHeight + NO_SLOP,
        `${team} ${at}: the crew list scrolls (${m.roster.scrollHeight} > ${m.roster.clientHeight})`);
      hasHeadroom(m, `${team} ${at}`);
    }
    inside(m.sheet.box, m.header, 'the header');
    // InvestPro is the one fixture the server sends without a chain, so its sheet is meant to have no
    // band; every other team is meant to have one. Either way it is checked, not skipped.
    briefHonest(m, `${team} ${at}`, team !== 'InvestPro');
    onScreen(m.header, m, 'the header');
    onScreen(m.brief.box, m, 'the chain summary band');
    // The same invariants at every width: the model line follows whichever rule the stylesheet resolved
    // (one nowrap line on a desktop, a wrapping line on a phone), and no name paints out of its card.
    noTitleDependence(m, `${team} ${at}`);
    modelLinesFit(m, `${team} ${at}`);
    namesInside(m, `${team} ${at}`);
    if (m.stacked) touchTargets(m, `${team} ${at}`);
    await noOverlap(page, `${team} ${at}`);
    // Counted and reported at the three viewports the round input names, so the intersection count is a
    // number in the log at each of them rather than a single verdict repeated. Everything else in the
    // sweep still runs at all five.
    if ([DESKTOP, SHORT, PHONE].includes(viewport)) {
      console.log(`     member card x (message box | "Now") intersections at ${at}: ${await overlapCount(page)} (must be 0, at every scroll position)`);
    }
    const end = await atEnd(page);
    noClippedCards(end, `${team} ${at}`);
    // Asserted before the comparison, and not only in the checks that count the cards themselves: a sheet
    // that drew no crew leaves `lastBottom` null, and `null <= anything` is true, so the reachability
    // comparison below passes on an empty grid at every viewport.
    hasCrew(end, `${team} ${at}`);
    assert.ok(end.lastBottom <= end.sheetBottom + NO_SLOP,
      `${end.lastName} cannot be reached inside the popup (its bottom is ${Math.round(end.lastBottom)}px, the popup ends at ${Math.round(end.sheetBottom)}px)`);
    // The message box must be reachable at some scroll position and must never leave the window.
    // Side by side it is pinned in view; stacked it is below the crew and arrives with the pane.
    if (!m.stacked) inside(m.sheet.box, m.direct, 'the message box');
    onScreen(end.direct, m, `the message box at ${at} after scrolling to the end`);
    onScreen(end.header, m, `the header at ${at} after scrolling to the end`);
    console.log(`     ${m.stacked ? 'stacked' : 'side by side'}; ${report(m)}`);
    await page.close();
  });
}

// ---- headroom, on every card the rail can open --------------------------------------------------
// The layout's real risk is tomorrow's roster, not today's: five of the eight teams are Router cards
// whose member count is seven plus one per configured profile (agent-feed.py `reviewed_structure`),
// and nothing caps the profile list, so any of them can gain a member at any time. One page walks the
// whole rail so every card is measured for the two things that decide whether a member added tomorrow
// costs a scrollbar: how far the popup is from its own height cap, and how many cells the grid has
// left before it needs another row.
await check('every card has room to grow at 1440x900: the popup is content-sized and the grid has free member slots', async () => {
  const page = await open(DESKTOP);
  // The rail itself, not the list above: this loop is the only place a card the server emits but this file
  // does not name gets measured, and an empty rail would otherwise pass it by measuring nothing.
  const rail = await railTeams(page);
  assert.ok(rail.length > 0, 'the harness rail drew no team card, so "every card has room" measured nothing');
  for (const entry of rail) {
    await openSheet(page, entry.name);
    const m = await page.evaluate(MEASURE);
    record(entry.name, m);
    // One card on the rail drew no members at all would end the loop silently through `closeSheet`, and
    // `hasHeadroom` below would then pass on a 0px bar: the coverage check at the tail would still count
    // the card as "measured", because MEASURED is keyed on having opened it.
    assert.ok(m.cards.length > 0, `${entry.name} (${entry.id}) drew no member card, so its headroom is measured against nothing`);
    console.log(`     ${entry.name} (${entry.id}): ${m.cards.length} members in ${m.columns} columns — ${hasHeadroom(m, `${entry.name} 1440x900`)}, ${await freeSlotsFit(page, m, `${entry.name} 1440x900`)}`);
    await closeSheet(page);
  }
  await page.close();
});

// ---- the one view of this dialog that is allowed to scroll ------------------------------------
await check('InvestPro EVOLUTION at 1440x900: the header and the tabs stay pinned and the popup still does not scroll', async () => {
  const page = await open(DESKTOP);
  await openSheet(page, 'InvestPro');
  await page.locator('.team-tabs [role="tab"]', { hasText: 'EVOLUTION' }).click();
  // The arena reads /api/investment/evolution, which this harness does not serve, so it settles on its
  // own error state. Every terminal state renders `.evo`, which is what makes this wait honest.
  await page.waitForSelector('.evo', { timeout: 20000 });
  await page.waitForTimeout(300);
  const m = await page.evaluate(MEASURE);
  // This view has no crew pane at all (`wide` replaces it), so the record notes the shape it has rather
  // than throwing on the pane it does not.
  RECORD.push({ team: 'InvestPro EVOLUTION', viewport: `${m.viewport.width}x${m.viewport.height}`,
    popup: Math.round(m.sheet.box.height), cap: Math.round(m.maxHeight),
    headroom: Math.round(m.maxHeight - m.sheet.box.height), crewRow: 0,
    // `freeMemberSlots: 0` because there is no grid to have a free cell in, not because the arena is
    // full. It is written rather than left out so every row of `rows` carries the same fields: a
    // measurements file whose entries have different shapes is one a reader has to check before reading.
    columns: 0, members: m.cards.length, freeMemberSlots: 0, chips: m.chips, workRows: m.workRows,
    stacked: m.stacked, popupOver: over(m.sheet), crewOver: 0, paneOver: 0, nowOver: 0 });
  // Captured before the assertions below, like every other capture in this file: the arena settles on an
  // error state here, so this is the only picture of it, and an assertion that fails must not be the
  // reason it does not exist.
  await page.screenshot({ path: shot('team-sheet-investpro-evolution-1440x900.png'), ...CROP });
  noPopupScroll(m, 'InvestPro EVOLUTION 1440x900');
  noSideways(m, 'InvestPro EVOLUTION 1440x900');
  inside(m.sheet.box, m.header, 'the header');
  inside(m.sheet.box, m.tabs, 'the tab strip');
  onScreen(m.header, m, 'the header');
  onScreen(m.tabs, m, 'the tab strip');
  const arena = await page.evaluate(() => { const r = document.querySelector('.evo').getBoundingClientRect(); const s = document.querySelector('.team-sheet').getBoundingClientRect(); return { bottom: r.bottom, sheetBottom: s.bottom, top: r.top }; });
  assert.ok(arena.top >= m.header.bottom - NO_SLOP, `the arena starts at ${Math.round(arena.top)}px, under the header (ends ${Math.round(m.header.bottom)}px)`);
  console.log(`     arena ${Math.round(arena.top)}–${Math.round(arena.bottom)}px inside a popup ending at ${Math.round(arena.sheetBottom)}px`);
  await page.close();
});

// ---- coverage: the measurement cannot quietly cover less than the product offers -----------------
// Read off the rail's own ids rather than out of the list at the top of this file, which is the whole
// point: a team added to the harness without being swept, and a team the server emits that the harness
// has quietly stopped carrying, both fail here. Before this check existed, four of the eight cards the
// server emits were never measured at a single viewport and the file printed ok throughout.
await check('every team the rail can open was measured, and the rail is the eight ids agent-feed.py emits', async () => {
  const page = await open(DESKTOP);
  const rail = await railTeams(page);
  const ids = rail.map((entry) => entry.id);
  assert.ok(ids.includes(BOUND_TEAM_ID), `the harness lost its bound card (${BOUND_TEAM_ID}), so the fit is measured against today's longest team instead of the heaviest one it can be sent`);
  assert.deepEqual(ids.filter((id) => id !== BOUND_TEAM_ID).sort(), SERVER_TEAM_IDS,
    `the rail does not carry the ids agent-feed.py emits: saw ${ids.join(', ')}, expected ${SERVER_TEAM_IDS.join(', ')}`);
  const missing = rail.filter((entry) => !MEASURED.has(entry.name)).map((entry) => `${entry.name} (${entry.id})`);
  assert.deepEqual(missing, [], `these rail teams were never opened at any viewport: ${missing.join(', ')}`);
  console.log(`     ${rail.length} cards measured: ${rail.map((entry) => entry.name).join(', ')}`);
  await page.close();
});

// Closing is best-effort and never fatal. `browser.close()` rejects whenever the browser has already
// gone — a crash mid-run, a killed process — and it sat directly above the only code that writes the
// measurements and names the missing captures, so a dead browser meant a run that reported nothing at
// all and a folder of pictures with no list of what was still owed. It is caught and logged here; the
// write below runs either way.
try { await browser.close(); } catch (error) { console.log(`     the browser did not close cleanly: ${error instanceof Error ? error.message : String(error)}`); }
try { await server.close(); } catch (error) { console.log(`     the vite server did not close cleanly: ${error instanceof Error ? error.message : String(error)}`); }

// Every number this run took, the manifest stamped `complete` or `failed`, and every capture it owes,
// counted on the way out. The captures are the picture, this is the measurement behind it, and the
// manifest is what ties both to the source they describe. It is written whether the run passed or
// failed, because a red run's numbers are the ones worth reading, and a claim about a fit that nobody
// can re-check is the failure this file exists to prevent. It is the same writer the crash handler
// calls, so a run that dies early leaves behind exactly what a run that finishes leaves.
const missingShots = writeEvidence();

// A red run says which check failed and how to get another one. Sixty-odd `ok` lines around a single
// FAIL is how a round reads as finished when it is not.
if (failures.length) {
  console.log(`\n${failures.length} check(s) failed:`);
  for (const entry of failures) console.log(`  - ${entry.name}\n      ${entry.message}`);
}
if (missingShots.length) console.log(`\n${missingShots.length} capture(s) missing from ${OUT}: ${missingShots.join(', ')}`);

console.log(failed
  ? `\nTEAM_SHEET_FIT_FAIL  ${failures.length} check(s) failed, ${missingShots.length} capture(s) missing. Measurements: ${measurementsPath()}. Manifest: ${manifestPath()} (status "failed"). Re-run: npm run test:team-sheet`
  // The fingerprint is in the closing line on purpose: a green run whose manifest says `complete` is the
  // only artefact a reviewer needs, and naming it here means the folder, the log and the build's third
  // line all quote the same number.
  : `\nTEAM_SHEET_FIT_OK  ${CAPTURES.length} screenshots, ${MEASUREMENTS} and ${MANIFEST} (status "complete", layout ${fingerprint}) in ${OUT}`);
process.exit(failed ? 1 : 0);