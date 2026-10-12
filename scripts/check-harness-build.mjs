// The shipped JavaScript that neither baseline check reaches, in one gate `npm run build` runs.
//
// `npx tsc --noEmit` is this project's baseline check, and it covers src/, release/ and the harness
// pages — but only because tsconfig lists them. The browser-driven evidence is plain `.mjs`, and
// tsconfig has `allowJs: false`, so scripts/test-team-sheet-fit.mjs, scripts/test-voice.mjs and the
// rest of the measurement scripts are not in the program at all: a rewrite of one of them still exits
// 0, and the file whose job is to prove the layout is the one thing a syntax error can kill silently.
// `vite build` does not help either — it builds index.html, so the harness pages those tests drive
// were compiled by nothing, and a change to a harness page or to the component it imports (src/
// TeamRail.tsx, src/ControlCenter.tsx, src/MeetingRoom.tsx) could break the page every layout claim is
// measured on while both baseline checks stayed green. Two green checks that covered none of the files
// under review is the state this gate exists to end.
//
// Five halves. The third is a report rather than a gate, and the fourth and fifth both gate and report:
//   * every shipped `.mjs` is parsed with `node --check` — parsed, never executed, so the gate cannot
//     start a server, launch a browser or write to a user's data
//   * every harness page is compiled through vite's own pipeline with the react plugin, resolving the
//     same imports the dev server resolves
//   * evidence/team-sheet-manifest.json is read and compared against a sha256 fingerprint of the four
//     files that decide the team popup's layout (scripts/source-fingerprint.mjs). Two rounds of handover
//     shipped real screenshots with nothing tying them to a stylesheet, which reads as a finished run;
//     this half is what makes a build after a popup change say so. It warns rather than fails on
//     purpose — the gate that can fail is `npm run verify:popup`, and a build that waits on a browser
//     measurement turns a screenshot into a hostage instead of evidence.
//     …and it names them. The one warning this half could print before was "the team popup has never been
//     measured on this tree", which is what you say about an empty folder, and `evidence/` was not empty:
//     it held five `team-sheet-*.png` files made by a stylesheet that has since changed. "Never measured"
//     invites the reader to think nothing was ever produced, which is the comfortable reading and the wrong
//     one. So every non-green branch appends the captures actually sitting on disk, by name, as attributed
//     to no finished measurement of this source — the sentence that makes the folder refuse to read as a
//     pass. It also stops taking the manifest's word for what is on disk: a `complete` run whose own capture
//     list names a file the folder does not have is reported by name, rather than as the green line.
//   * the Next Work List contract, tests/next-work.test.mjs, is EXECUTED. The half above only parses
//     src/next-work.mjs, so a rewrite that drops the label fix still exits 0: two green checks covering
//     none of the behaviour under review is exactly the state this file exists to end. The gate it reaches
//     is `npm run test:criteria`, and this is why the build runs it too — a round that changed the ranking
//     and reported `tsc` plus `build` green had proved nothing about the row labels the owner was shown.
//     This half fails rather than warns, because unlike the captures it needs no browser and no user data:
//     the module is pure and the contract reads the rules, so there is no hostage to take and nothing to
//     wait for. The Control Center's browser half stays a report for the same reason the popup's does.
//   * evidence/control-center-manifest.json is read against a fingerprint of the four files that decide
//     those rows, exactly as half 3 does for the popup, and names its two captures when they are
//     unattributed. Before this, the two captures the Control Center finish line is stated in were the
//     only thing in evidence/ no check claimed, nothing tied them to a source, and `evidence/*` was
//     git-ignored — so the proof of the card's acceptance criterion could not be opened by a review of
//     the change at all, which is the same dead end the popup round had already written the fix for.
//   * …and before that report can mean anything, the measurement that writes those captures is RUN.
//     A criterion that lives in a script no gate calls is a criterion no run can fail: the round this
//     gate was extended for shipped a correct module, a correct component and an excellent measurement
//     script, and evidence/ with zero Control Center files in it, because `test:control-center` had
//     never been run and every supplied check was green anyway. So `npm run build` runs the
//     measurement. It FAILS the build when the measurement runs and a row label reads
//     `[object Object]`, and WARNS - explicitly UNVERIFIED, never a pass - when the machine has no
//     Chromium to run it on. That is the difference between the popup's captures (evidence) and this
//     card's (the acceptance criterion itself), and it is why this one gates and that one reports.
//
// Nothing is written outside `.run/` and `evidence/`: `write: false` with `emptyOutDir: false` keeps
// this a reachability check rather than a second dist/, and says so in the config instead of relying on
// the build order. The one half that writes is the measurement, and it writes only its own captures
// into evidence/ — the folder the owner's criterion is stated in, and the folder it already writes to
// when run by hand.
//
// Usage: node scripts/check-harness-build.mjs  (npm run build runs it; npm run check:harness too)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { CARD_CAPTURES, CARD_MANIFEST, CARD_SOURCES, cardFingerprint, LAYOUT_SOURCES, layoutFingerprint, MANIFEST, POPUP_CAPTURES, readCardManifest, readManifest } from './source-fingerprint.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
// Build output, dependencies, scratch and the user's own files. Mirrors the set
// scripts/check-release-info.mjs walks with, so the two nets agree on what is not source.
const SKIP = new Set(['node_modules', 'dist', '.git', '.run', '.playwright-cli', '.venv', '__pycache__',
  'build', 'coverage', 'data', 'evidence', 'inputs', 'package-lock.json']);

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  if (SKIP.has(entry.name)) return [];
  const full = path.join(dir, entry.name);
  if (entry.isDirectory()) return walk(full);
  return entry.isFile() ? [full] : [];
});

// ── half 1: every shipped .mjs parses ─────────────────────────────────────────────────────────────
// `node --check` reads a `.mjs` as an ES module, top-level await included, on the Node this project
// runs. That is asserted here rather than assumed, because the two ways it can be wrong are the two
// ways this gate could lie: if this Node parsed `.mjs` as CommonJS, every file would report a
// syntax error and fail a build that is fine, and if the probe were skipped the half would pass
// having checked nothing. So the probe runs first and its answer decides.
const probe = path.join(root, '.run', 'esm-probe.mjs');
mkdirSync(path.dirname(probe), { recursive: true });
writeFileSync(probe, "import { readFileSync } from 'node:fs';\nawait Promise.resolve(readFileSync(__filename, 'utf8'));\nexport default 1;\n");
const parsesEsm = (() => {
  try { execFileSync(process.execPath, ['--check', probe], { stdio: ['ignore', 'ignore', 'pipe'] }); return true; }
  catch { return false; }
})();
rmSync(probe, { force: true });

if (parsesEsm) {
  const scripts = walk(root).filter((file) => file.endsWith('.mjs'));
  const broken = [];
  for (const file of scripts) {
    try { execFileSync(process.execPath, ['--check', file], { stdio: ['ignore', 'ignore', 'pipe'] }); }
    catch (error) {
      const message = String(error.stderr || error.message).trim().split('\n').filter(Boolean);
      broken.push(`${path.relative(root, file)}: ${message[message.length - 1] || 'does not parse'}`);
    }
  }
  if (broken.length) {
    console.error(`FAIL ${broken.length} shipped .mjs file(s) do not parse — npm run build runs them, and a syntax error in one is a check that can no longer measure anything:`);
    for (const entry of broken) console.error(`       ${entry}`);
    process.exit(1);
  }
  console.log(`ok   ${scripts.length} shipped .mjs files parse as ES modules (node --check, none executed)`);
} else {
  console.log(`warn this Node cannot syntax-check a .mjs as an ES module, so ${walk(root).filter((file) => file.endsWith('.mjs')).length} file(s) are unchecked here`);
}

// ── half 2: every harness page compiles ─────────────────────────────────────────────────────────────
// The pages scripts/test-team-sheet-fit.mjs, scripts/test-voice.mjs and scripts/test-control-center.mjs
// serve and drive. Each one is a real entry: the crew grid, the composer and the "what does this
// agent do?" card are measured on the page, so a page that cannot load cannot be evidence, and that is
// a fact about the module graph rather than about a browser. Compiling here resolves every import each
// page pulls in — the components, the stylesheet and the faces — the same way the dev server does.
const pages = walk(path.join(root, 'scripts'))
  .filter((file) => file.endsWith('.html') && path.basename(path.dirname(file)).endsWith('-harness'))
  .sort();
if (!pages.length) {
  console.error('FAIL no harness page found under scripts/*-harness/*/index.html, so nothing can measure a layout in the browser');
  process.exit(1);
}
const input = Object.fromEntries(pages.map((file) => [path.basename(path.dirname(file)), file]));
try {
  await build({
    root,
    base: './',
    configFile: false,
    logLevel: 'error',
    clearScreen: false,
    plugins: [react()],
    build: { write: false, emptyOutDir: false, rollupOptions: { input } },
  });
} catch (error) {
  console.error(`FAIL the harness page(s) do not compile, so the measurements that drive them cannot run: ${Object.keys(input).join(', ')}`);
  console.error(`     ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
console.log(`ok   ${pages.length} harness page(s) compile with every import resolved: ${Object.keys(input).join(', ')}`);

// ── half 4: the Next Work List contract executes ────────────────────────────────────────────────────
// Halves 1 and 2 answer "can this still run?". This one asks what the code does. `src/next-work.mjs` is
// plain JS and not in the tsc program, so half 1 only parses it: every check that touched this ranking
// could stay green over a module that had been rewritten to print "[object Object]" in a row label
// again. The gate that answers the question is `npm run test:criteria`, and a round is free to run
// something else instead — which is what happened, and why a build reported green over a card whose two
// named row labels were the whole acceptance criterion.
//
// It fails rather than warns, unlike halves 3 and 5 below, because it has nothing to wait for: the module
// is pure (caller passes the clock and the data), the contract asserts the rules and reads no vault, no
// server and no browser, and `node --test` on it takes milliseconds. Only a capture is a hostage; this
// is not.
const CONTRACT = path.join(root, 'tests', 'next-work.test.mjs');
if (!existsSync(CONTRACT)) {
  console.error('FAIL tests/next-work.test.mjs is missing, so the one ranked task list has no contract and `npm run test:criteria` cannot reach it');
  process.exit(1);
}
try {
  execFileSync(process.execPath, ['--test', CONTRACT], { cwd: root, stdio: ['ignore', 'ignore', 'pipe'] });
  console.log('ok   the Next Work List contract passes (tests/next-work.test.mjs)');
} catch (error) {
  console.error('FAIL the Next Work List contract fails, so a row label can read "[object Object]" again on a tree whose build is otherwise green:');
  for (const line of String(error.stderr || error.message).split('\n').filter((entry) => /not ok|fail|Error|\[object Object\]/.test(entry)).slice(0, 8)) {
    console.error(`       ${line.trim()}`);
  }
  process.exit(1);
}

// ── half 4b: the Next Work List is rendered, measured, and captured ────────────────────────────────
// Halves 1, 2 and 4 answer "can this still run?" and "does the ranking still hold?". This one asks the
// question the card's acceptance criterion is actually stated in: *does the card render the list, at
// 1440x900 and at 390x844, with no `[object Object]` in it*, and it answers it by running the
// measurement rather than by reporting on whatever a previous run left in evidence/.
//
// It runs here rather than only behind `npm run test:control-center` because of what the previous round
// proved: a criterion that lives in a script no gate calls is a criterion no run can fail. That round
// shipped a correct module, a correct component, an excellent measurement script - and evidence/ with
// zero Control Center files in it, because `test:control-center` had never been run and every supplied
// check was green anyway. Half 5 below then reported "the Control Center has never been measured on
// this tree" as a `warn`, which is the honest half of the answer and not the whole one: a build that
// only warns about the card's own criterion will be reported green on a card whose criterion was never
// looked at. A screenshot is a hostage only when it is the ONLY evidence; here it is the evidence, and
// there is a module contract behind it that costs nothing.
//
// So: run it, and let the run decide.
//     * every render assertion passes and both captures land on disk -> ok, and the folder describes
//     itself from this run's fingerprint (half 5 reads what this just wrote)
//     * the measurement ran and something failed -> FAIL the build. This is a card defect, not a
//     missing file: the measurement prints which assertion and why, and half 5 then names the
//     captures sitting in the folder unattributed
//     * no Chromium on the machine -> warn, and say the criterion is UNVERIFIED rather than met. The
//     build must not die on a machine with no browser installed, but it must also not let a missing
//     browser read as a passing card. The measurement exits 3 for that case and touches nothing on
//     disk, so a browser-less build leaves a good earlier measurement exactly as it found it.
const CARD_MEASUREMENT = path.join(root, 'scripts', 'test-control-center.mjs');
if (!existsSync(CARD_MEASUREMENT)) {
  console.error('FAIL scripts/test-control-center.mjs is missing, so the Next Work List finish line ("captures at 1440x900 and 390x844 with no [object Object]") has no gate on this tree');
  process.exit(1);
}
{
  let stdout = '';
  let stderr = '';
  let code = 0;
  try {
    // stdio is piped, not inherited: the measurement prints a dozen `ok` lines and the build log is
    // read for failures. Inheriting would bury the half that failed.
    stdout = execFileSync(process.execPath, [CARD_MEASUREMENT], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    code = typeof error.status === 'number' ? error.status : 1;
    stdout = String(error.stdout || '');
    stderr = String(error.stderr || error.message || '');
  }
  // Exit 3 is the measurement's own "there is no browser" code: it exits that before writing its
  // manifest or deleting a capture, so nothing in evidence/ was disturbed. Anything else that fails is
  // a measurement that ran and found something, which is a defect on this tree.
  const NO_BROWSER = /No Chromium for the browser tests/i;
  if (code === 0) {
    const measured = (stdout.match(/^ok\s+/gm) || []).length;
    console.log(`ok   the Next Work List renders at 1440x900 and 390x844 with no "[object Object]" in it (${measured} assertion${measured === 1 ? '' : 's'}, captures in ${path.relative(root, path.join(root, 'evidence')) || 'evidence'})`);
  } else if (code === 3 || NO_BROWSER.test(`${stdout}\n${stderr}`)) {
    console.log(`warn this machine has no Chromium, so the Next Work List finish line is UNVERIFIED: the list was not rendered at either viewport and evidence/ was left untouched. Install Google Chrome, or run \`npx playwright-core install chromium-headless-shell\`, then npm run test:control-center`);
  } else {
    console.error('FAIL the Next Work List does not render the acceptance criterion, so a card on this tree can still print "[object Object]":');
    for (const line of `${stdout}\n${stderr}`.split('\n').map((entry) => entry.trimEnd()).filter((entry) => /^FAIL|CONTROL_CENTER_FAIL|\[object Object\]/.test(entry.trim())).slice(0, 10)) {
      console.error(`       ${line}`);
    }
    process.exit(1);
  }
}

// ── half 3: the team-popup evidence describes the source it was measured against ─────────────────────
// The two halves above answer "can this measurement still run?". This one answers "is there a
// measurement, and does it describe the source being built?" — the question two rounds of handover got
// wrong, because evidence/ held five PNGs, no measurements file, and nothing tying a picture to the
// stylesheet that produced it, which reads exactly like a finished run.
//
// It is a report, not a gate. The gate that can fail is `npm run verify:popup`, and making this one
// fail would mean a build cannot proceed until someone runs a browser measurement — which turns a
// screenshot into a hostage rather than evidence. Two things it must never do: stay quiet about a build
// after a change to the popup's own source, and describe a folder it has not looked in.
const evidenceDir = process.env.BRAINBOOK_EVIDENCE_DIR
  ? path.resolve(root, process.env.BRAINBOOK_EVIDENCE_DIR)
  : path.join(root, 'evidence');
const fingerprint = layoutFingerprint();
const manifest = readManifest(evidenceDir);
// The popup captures actually sitting in the folder, named one by one. This is the half the old line
// could not say, and it is the half that decides how a reader takes the folder: a build that prints
// "the team popup has never been measured on this tree" while five `team-sheet-*.png` files sit in the
// same directory describes a folder nobody ever produced anything in, when the truth is the one that
// actually shipped twice — pictures were produced, against a `styles.css` that has since changed, and
// nothing on disk attributes them to anything. A folder of unattributed screenshots reads exactly like a
// finished run, which is why the name of each one belongs in the build log and not only in a note nobody
// opens. Read off the same list the measurement run writes (`POPUP_CAPTURES`), so this cannot drift from
// what a run would actually leave behind.
const onDisk = POPUP_CAPTURES.filter((name) => existsSync(path.join(evidenceDir, name)));
// One sentence appended to every branch that is not the green one, so no state is reported without it.
// "No finished measurement of this source" rather than "no manifest", because a run that was still
// `running` when it was interrupted has written a manifest — one that describes this source and describes
// nothing else, which is the state a folder of half a run's pictures is most easily mistaken for a
// finished one.
const unattributed = onDisk.length
  ? ` ${onDisk.length} popup capture(s) in ${path.relative(root, evidenceDir) || evidenceDir} are on disk and attributed to no finished measurement of this source: ${onDisk.join(', ')}`
  : '';
if (!manifest) {
  console.log(`warn no ${MANIFEST} in ${path.relative(root, evidenceDir) || evidenceDir}: the team popup has never been measured on this tree (npm run verify:popup).${unattributed}`);
} else if (manifest.status === 'unreadable') {
  console.log(`warn ${MANIFEST} does not parse, so nothing in evidence/ is attributable to a source: ${manifest.error}${unattributed}`);
} else if (manifest.status === 'running') {
  console.log(`warn ${MANIFEST} is still "running": a team-sheet measurement started at ${manifest.startedAt} and did not finish, so the captures there are partial${unattributed}`);
} else if (manifest.status === 'failed') {
  // Status is checked before the fingerprint on purpose. A failed run on *this* source still means the
  // criterion was not met, so reporting "evidence describes this source" on the strength of a matching
  // hash would answer a different question than the one asked — and the reader would have to open the
  // manifest to learn the checks failed.
  const named = (manifest.checksFailed || []).map((entry) => entry.name || entry);
  console.log(`warn the last team-sheet measurement on this source failed${named.length ? `: ${named.join('; ')}` : ''}${unattributed}`);
} else if (manifest.layoutFingerprint !== fingerprint) {
  // The one line that closes the gap. The pictures on disk are real, they were measured, and they describe
  // a different stylesheet than the one being shipped.
  console.log(`warn the team popup changed since the last measurement: ${LAYOUT_SOURCES.join(', ')} now hash ${fingerprint}, evidence/ was measured on ${manifest.layoutFingerprint}. Re-run npm run verify:popup${unattributed}`);
} else {
  // `complete` is the only status left, but the count is still read rather than assumed: a manifest whose
  // captures are all `missing` would otherwise be reported as the one `ok` this half can print, which is
  // the same defect as a check that asserts nothing — the happy line would then be reachable with no
  // picture behind it. The pictures are read off the disk rather than out of the manifest's own list, so
  // a manifest that claims a capture it never wrote cannot report itself as complete.
  if (manifest.status !== 'complete' || !onDisk.length) {
    console.log(`warn ${MANIFEST} claims status "${manifest.status}" with ${onDisk.length} capture(s) on disk, which is not a finished measurement. Re-run npm run verify:popup${unattributed}`);
  } else if ((manifest.captures || []).some((entry) => !onDisk.includes(entry.file))) {
    // The manifest lists a capture the folder does not have. This is the one state in which the folder
    // and its own description disagree, so it is named rather than counted: a build that reported the
    // happy line here would be reporting a claim it has just read and found false.
    const lost = (manifest.captures || []).filter((entry) => !onDisk.includes(entry.file)).map((entry) => entry.file);
    console.log(`warn ${MANIFEST} claims ${lost.length} capture(s) that are not in ${path.relative(root, evidenceDir) || evidenceDir}: ${lost.join(', ')}. Re-run npm run verify:popup`);
  } else {
    console.log(`ok   team-popup evidence describes this source (${fingerprint}, ${onDisk.length}/${POPUP_CAPTURES.length} captures, every check passed)`);
  }
}

// ── half 5: the Control Center captures describe the source they were measured against ──────────────
// The same question, asked of the second measured surface. The Control Center / Next Work List finish
// line is a picture too — the list at 1440x900 and 390x844 with no `[object Object]` in it — and until
// this half existed it was the one criterion in evidence/ that no build could see: `scripts/
// test-control-center.mjs` wrote two PNGs, nothing recorded that they had been measured against
// anything, and `evidence/*` was git-ignored, so the captures could not even be opened by a review of
// the change. That is the dead end the popup round had already written down and fixed; this surface
// needed the same fix and did not get it.
//
// A report, on the popup half's reasoning: the gate that can fail is `npm run test:control-center`, and a
// build that waits on a browser measurement turns a screenshot into a hostage rather than evidence. The
// three states it can name are the popup half's, for the same reasons: an unreadable manifest attributes
// nothing, a `running` manifest describes a run that did not finish, and a capture list naming a file the
// folder does not have is a folder disagreeing with its own description.
//
// …and the captures have to be openable by a review of the change at all. That was the actual reason the
// Control Center's proof could not be judged: `evidence/*` in .gitignore matched both PNGs and this
// manifest, so a run wrote its evidence and the repository kept none of it. A manifest check cannot see
// that on its own — it reads a file the ignore rules may be swallowing — so the rules are read here, from
// the same list the run writes. Last matching rule wins, as git reads them.
//
// Deliberately narrow: only `dir/glob` and `bare-name` shapes are decided, and anything this matcher is
// not sure about counts as NOT ignored, so the half can only ever warn about a capture it has actually
// resolved. A gate that cries wolf about the tree's own .gitignore would be turned off, and a gate that
// is off protects nothing.
const ignoreFile = path.join(root, '.gitignore');
const gitIgnored = (relative) => {
  if (!existsSync(ignoreFile)) return false;
  const rules = readFileSync(ignoreFile, 'utf8').split('\n').map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
  const match = (pattern, target) => {
    if (pattern.endsWith('/')) return false;          // a directory rule never matches a file path here
    // `**` goes through a placeholder: turning it into `.*` first and then globbing the single `*` would
    // rewrite the `*` inside the `.*` it had just produced.
    const body = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0001').replace(/\*/g, '[^/]*').replace(/\u0001/g, '.*');
    try { return new RegExp(`^${body}$`).test(target); } catch { return false; }
  };
  let ignored = false;
  for (const rule of rules) {
    const negate = rule.startsWith('!');
    const pattern = negate ? rule.slice(1) : rule;
    if (!match(pattern, relative)) continue;
    ignored = !negate;
  }
  return ignored;
};
const swallowed = [...CARD_CAPTURES, CARD_MANIFEST].filter((name) => gitIgnored(`evidence/${name}`));
if (swallowed.length) {
  console.log(`warn .gitignore ignores ${swallowed.length} Control Center capture file(s), so a review of the change cannot open the evidence: ${swallowed.map((name) => `evidence/${name}`).join(', ')}. Add a !evidence/ rule for each`);
}

const cardFinger = cardFingerprint();
const cardManifest = readCardManifest(evidenceDir);
const cardOnDisk = CARD_CAPTURES.filter((name) => existsSync(path.join(evidenceDir, name)));
const where = path.relative(root, evidenceDir) || evidenceDir;
// The same "attributed to no finished measurement" sentence, for the same reason: a build that said
// "never measured" while the folder held pictures of the list would describe an empty folder, which is
// the comfortable reading and the wrong one.
const cardUnattributed = cardOnDisk.length
  ? ` ${cardOnDisk.length} Next Work List capture(s) in ${where} are on disk and attributed to no finished measurement of this source: ${cardOnDisk.join(', ')}`
  : '';
if (!cardManifest) {
  console.log(`warn no ${CARD_MANIFEST} in ${where}: the Control Center / Next Work List has never been measured on this tree (npm run test:control-center).${cardUnattributed}`);
} else if (cardManifest.status === 'unreadable') {
  console.log(`warn ${CARD_MANIFEST} does not parse, so nothing in it is attributable to a source: ${cardManifest.error}${cardUnattributed}`);
} else if (cardManifest.status === 'running') {
  console.log(`warn ${CARD_MANIFEST} is still "running": a Control Center measurement started at ${cardManifest.startedAt} and did not finish, so the captures there are partial${cardUnattributed}`);
} else if (cardManifest.status === 'failed') {
  // Status before the fingerprint, as the popup half does: a failed run on *this* source still means the
  // criterion was not met, so reporting "evidence describes this source" on a matching hash would answer
  // a different question, and the reader would have to open the manifest to learn the checks failed.
  const named = (cardManifest.checks || []).map((entry) => entry.name || entry);
  console.log(`warn the last Control Center measurement on this source failed${named.length ? `: ${named.join('; ')}` : ''}${cardUnattributed}`);
} else if (cardManifest.cardFingerprint !== cardFinger) {
  // `src/next-work.mjs` is in CARD_SOURCES, so this also fires when the ranking changed and not the
  // stylesheet: a picture of the list cannot show that a row label is the wrong words.
  console.log(`warn the Control Center changed since the last measurement: ${CARD_SOURCES.join(', ')} now hash ${cardFinger}, ${CARD_MANIFEST} was measured on ${cardManifest.cardFingerprint}. Re-run npm run test:control-center${cardUnattributed}`);
} else if (cardManifest.status !== 'complete' || !cardOnDisk.length) {
  console.log(`warn ${CARD_MANIFEST} claims status "${cardManifest.status}" with ${cardOnDisk.length} capture(s) on disk, which is not a finished measurement. Re-run npm run test:control-center${cardUnattributed}`);
} else if ((cardManifest.captures || []).some((entry) => !cardOnDisk.includes(entry.file))) {
  const lost = (cardManifest.captures || []).filter((entry) => !cardOnDisk.includes(entry.file)).map((entry) => entry.file);
  console.log(`warn ${CARD_MANIFEST} claims ${lost.length} capture(s) that are not in ${where}: ${lost.join(', ')}. Re-run npm run test:control-center`);
} else {
  console.log(`ok   Control Center evidence describes this source (${cardFinger}, ${cardOnDisk.length}/${CARD_CAPTURES.length} captures, every check passed)`);
}