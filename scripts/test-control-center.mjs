// Measured proof that the Control Center / Next Work List renders text and stays reachable, plus the
// screenshots the owner asked for. Usage: node scripts/test-control-center.mjs [outDir] (default: ./evidence)
//
// The finish line for "consolidate the task entry points into the Control Center / Next Work List" is a
// rendering: the list at 1440x900 and 390x844 must show no `[object Object]`. A unit test cannot settle
// that - the string a row label is built from can be right in the module and wrong on screen - and a
// screenshot cannot be trusted with it either, because `[object Object]` is easy to skim past in a
// thumbnail. So it is measured, the way scripts/test-team-sheet-fit.mjs measures the team popup: the
// page is scripts/control-center-harness (the real ControlCenter, the real stylesheet, the real ranking
// module) fed fixtures that include the two rows that printed the object.
//
// What is asserted (hard):
//   * no row label anywhere in the card reads "[object Object]", and the two rows that broke read
//     the compact English report summary by default; each matched fixture retains its exact original
//     title, legacy reason and full report in collapsed source details (not default owner prose)
//   * every row's title and reason are whole: no line needs more room than it has, at either viewport.
//     `.control-center` clips its own overflow, so "it fits its box" is not the question - whether the
//     text element itself needed more room than it was given is, and that is what a clip hides
//   * every row's title and reason box is the size of the words in it. A `flex-basis` is a main-axis
//     size, so a wide-layout rule becomes a height on the stacked phone layout: nothing overflows,
//     nothing is cut, the row is still 44px wide - only the box against its own text shows it
//   * every row sits inside the card, so the card cannot be hiding a row past its own edge
//   * every rank is carried by a word and a glyph, never by colour alone, and the two ranks that share
//     the red pill ("Overdue", "Today") do not share a glyph
//   * nothing depends on a hover tooltip: every control in a row resolves its `aria-describedby` to a
//     real sentence. A `title` is a mouse-only channel - touch has no hover to wait for and a screen
//     reader never reads one - so a row whose only full wording sat in a `title` fails here
//   * every text/background pair on the card clears 4.5:1, measured against the worst backdrop the
//     element can actually land on. The page gradient behind the card is painted `fixed`, so it moves
//     under the card as the page scrolls: the worst declared stop is a backdrop it really renders on,
//     not a hypothetical. (This is how styles.css documents the rank pills, and it reproduces those
//     figures - 6.11:1 for the unfilled pill, 5.87:1 on the red one.) The one exception is a disabled
//     control, which WCAG exempts from a contrast minimum; there the assertion is that the state is
//     named in words instead of only dimmed.
//   * on a phone every control in a row is a 44px target and two of them never overlap, including the
//     longest Run label there is ("Waits for night GPU") on a row that also owns a tick
//   * `prefers-reduced-motion` stops the running row and its Run button, and a control case asserts
//     they animate at all, so the reduced-motion pass cannot go green on an element that never moved
//   * every screenshot this file writes is actually on disk at the end of the run, and every one is
//     written before the assertions that can fail - a check that asserts first and captures last leaves
//     nothing behind when it fails, so the artifact list shrinks to the checks that passed
//   * …and the folder describes itself without this file being run at all.
//     evidence/control-center-manifest.json is written *before* the first check, carrying the status
//     (`running`), a sha256 fingerprint of the four files that decide these rows and the captures the run
//     owes; any capture left by an earlier run is deleted first, so a stale picture cannot survive a new
//     one; and the manifest is rewritten at the end with the same fingerprint, each capture's own hash
//     and every failed check. `npm run build` RUNS this file (scripts/check-harness-build.mjs, half 4b)
//     and fails on a measurement that ran and found something, so the card's own acceptance criterion can
//     no longer go unmeasured on a green build; half 5 then reads the fingerprint this run just wrote and
//     says out loud when a source change has left the last measurement stale. Before this, the two
//     captures the owner's finish line is stated in were the only evidence in evidence/ that no check
//     claimed, nothing tied them to a source, `evidence/*` was git-ignored, and no supplied check ever
//     called this script - so the proof of the one thing this card was judged on could not be opened by a
//     review of the change at all, and the round that shipped it reported itself green.
//
// The fixtures are the point, so read the harness before trusting an `ok` here: it carries all seven
// ranks, every Run state, a card nobody on the page owns, and a note title made of one 162-character
// word. A harness with three tidy rows would pass every line above while proving nothing about the
// shapes that broke.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { launchTestBrowser } from './browser.mjs';
import { CARD_CAPTURES, CARD_MANIFEST, CARD_SOURCES, cardFingerprint } from './source-fingerprint.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const OUT = path.resolve(process.argv[2] || process.env.BRAINBOOK_EVIDENCE_DIR || path.join(root, 'evidence'));

// ── the browser, launched before anything on disk is touched ─────────────────────────────────────────
// First, and before the manifest and the deletion below, because this run now runs inside `npm run
// build` (scripts/check-harness-build.mjs, half 4b) and a machine with no Chromium must not pay for
// that: the deletion under "the manifest, written before anything can fail" removes every capture an
// earlier run left, so a browser-less build would erase a good measurement and then report the card
// UNVERIFIED. Losing the evidence because the tool was missing is the worst of the three outcomes.
//
// A failure here exits 3, before the manifest is written and before any file is removed, so the folder
// is left exactly as it was found. `finish` is not registered yet either, and deliberately: there is no
// manifest to update, because nothing was measured and nothing was overwritten. The build gate reads
// the "No Chromium" message and warns UNVERIFIED rather than failing.
let browser;
try {
  browser = await launchTestBrowser();
} catch (error) {
  console.error(`${error.message}\n     evidence/ was left untouched: no capture was written, none was deleted, and no manifest was overwritten.`);
  process.exit(3);
}
mkdirSync(OUT, { recursive: true });

// ── the manifest, written before anything can fail ──────────────────────────────────────────────────
// Above the first check, and below the browser, on purpose. A manifest written at the end of a run is
// absent whenever the run dies, and an absent manifest cannot be told apart from a run that never
// started - which is the state a folder of half a run's screenshots is most easily mistaken for a
// finished one.
const CARD_FINGERPRINT = cardFingerprint();
const startedAt = new Date().toISOString();
// Every capture an earlier run left here describes a stylesheet that may since have changed, so it is
// deleted before this run writes its own. A stale picture surviving a fresh run is indistinguishable
// from a fresh one once it is on disk, which is how `team-sheet-measurements.json` ended up naming a
// capture nobody had looked at in two rounds.
const clearedBeforeRun = [];
for (const name of CARD_CAPTURES) {
  if (!existsSync(path.join(OUT, name))) continue;
  rmSync(path.join(OUT, name), { force: true });
  clearedBeforeRun.push(name);
}

const checks = [];
const captureEntry = (name) => {
  const file = path.join(OUT, name);
  if (!existsSync(file)) return { file: name, missing: true };
  // Each capture's own hash, so a picture that was replaced by hand is distinguishable from one this run
  // wrote. The fingerprint above says the stylesheet has not changed; this says the file itself is the
  // one that was measured.
  return { file: name, bytes: statSync(file).size, sha256: createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 16) };
};
const writeManifest = (status) => {
  const manifest = {
    what: 'Provenance for the Control Center / Next Work List captures in this folder.',
    status,
    startedAt,
    measuredBy: 'node scripts/test-control-center.mjs against scripts/control-center-harness',
    cardSources: CARD_SOURCES,
    cardFingerprint: CARD_FINGERPRINT,
    captures: CARD_CAPTURES.map(captureEntry),
    checks,
  };
  const missing = manifest.captures.filter((entry) => entry.missing).map((entry) => entry.file);
  if (missing.length) manifest.capturesMissing = missing;
  if (status !== 'running' && clearedBeforeRun.length) manifest.clearedBeforeRun = clearedBeforeRun;
  writeFileSync(path.join(OUT, CARD_MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
};

writeManifest('running');

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
const NO_SLOP = 1;
// WCAG 1.4.3 for normal text. 10.5px bold is not large text (that is 18.66px bold), so the 3:1 allowance
// has no argument anywhere on this card.
const TEXT_MIN = 4.5;
// adapt: on touch the smallest reliable target is 44px.
const TOUCH_MIN = 44;
// Independent expectations: neither a changed fixture nor a changed summary helper can make a
// broken default label or a lost source agree with the validator.
const ASK_SUMMARY = 'Report available. See Original.';
const ASK_FIXTURES = [
  { title: 'Fix the sign-in redirect that drops the return path',
    legacyDetail: 'App Dev · QA did not pass. Needs your decision.',
    report: '⛔ STOPPED FOR YUMA: not approved after the review. A second sentence that must be dropped.' },
  { title: 'Book the venue for the autumn meetup',
    legacyDetail: 'Next Work List · The review tool failed. Needs a retry.',
    report: 'STOPPED FOR YUMA: unsupported format from the review tool.' },
];
const GPU_SOURCE_TITLE = 'Render lesson 04 keyframes on the GPU';

// A run that stops anywhere - including inside `browser.close()` below - still has to leave behind the
// manifest that says what it measured and what it owed. Without this the writer sat at the bottom of the
// file and a run that threw above it died with only the captures it happened to write.
let writtenUp = false;
const finish = (status) => {
  if (writtenUp) return;
  writtenUp = true;
  try { writeManifest(status); } catch (error) { console.error(`could not write ${CARD_MANIFEST}: ${error.message}`); }
};
process.on('uncaughtException', (error) => { finish('failed'); console.error(error); process.exit(1); });
process.on('unhandledRejection', (error) => { finish('failed'); console.error(error); process.exit(1); });

const server = await createServer({ root, cacheDir: path.join(root, '.vite-test'), configFile: false, plugins: [react()], logLevel: 'error', server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}/scripts/control-center-harness/index.html`;
let failed = false;
const check = async (name, fn) => {
  try { await fn(); console.log(`ok   ${name}`); }
  catch (error) {
    failed = true;
    // Normalised once: a rejected value that is not an Error has no `.message`, and a reporter that
    // throws while reporting is how a run dies without writing the manifest that says what it measured.
    const message = String(error?.message ?? error);
    // The name and the first line of the message, into the manifest as well as the log: the folder has to
    // be able to say which check failed without the log that said it being kept.
    checks.push({ name, message: message.split('\n')[0] });
    console.log(`FAIL ${name}\n     ${message.split('\n').slice(0, 6).join(' | ')}`);
  }
};
const shot = (name) => path.join(OUT, name);
const crossing = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;

// Everything below runs inside the page, so it may not close over anything out here. It reads the
// rendered card: the strings it shows, the geometry of every row and control, which animations are
// running, and the contrast of each text/background pair over the backdrop stack that element really
// paints on.
const MEASURE = () => {
  const one = (sel) => document.querySelector(sel);
  const rect = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
  };
  // "Does this element need more room than it was given" - asked of the text element itself, because
  // `.control-center` sets `overflow: hidden` and would hide the answer on the way up.
  const cut = (el) => !!el && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1);
  // "How tall are the words inside it", asked with a Range. `getBoundingClientRect` answers for the
  // BOX, and a flex `flex-basis` can inflate that box to any size an author asked for while one line
  // of text sits at the top of it. Nothing overflows and nothing is cut in that state, so an overflow
  // check and a screenshot both pass it - only this measurement sees it.
  const inkHeight = (el) => {
    if (!el) return 0;
    const range = document.createRange();
    range.selectNodeContents(el);
    const rects = [...range.getClientRects()];
    if (!rects.length) return 0;
    return Math.max(...rects.map((r) => r.bottom)) - Math.min(...rects.map((r) => r.top));
  };

  const parse = (value) => {
    if (!value) return null;
    const open = value.indexOf('(');
    if (open < 0) return null;
    const body = value.slice(open + 1, value.lastIndexOf(')'));
    const numbers = body.match(/[\d.]+/g);
    if (!numbers || numbers.length < 3) return null;
    const [r, g, b] = numbers.slice(0, 3).map(Number);
    let a = numbers.length > 3 ? Number(numbers[3]) : 1;
    if (body.includes('%')) a /= 100;
    return { r, g, b, a: Math.min(1, Math.max(0, a)) };
  };
  const over = (top, bottom) => ({
    r: top.r * top.a + bottom.r * (1 - top.a),
    g: top.g * top.a + bottom.g * (1 - top.a),
    b: top.b * top.a + bottom.b * (1 - top.a),
    a: 1,
  });
  const lum = ({ r, g, b }) => {
    const channel = (raw) => { const v = raw / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };
  const ratio = (fg, bg) => { const hi = lum(fg) + 0.05; const lo = lum(bg) + 0.05; return hi > lo ? hi / lo : lo / hi; };
  const CANVAS = { r: 255, g: 255, b: 255, a: 1 };
  // Paint order: the outermost box is the base and the element itself is on top, so the ancestor stack
  // is walked upward and then composited downward. Each ancestor contributes its background colour with
  // its own alpha, and a gradient contributes every declared stop - all of them are backdrops the
  // element can sit on, so all of them are candidates and the worst one decides.
  const backdrops = (el) => {
    const stack = [];
    for (let node = el; node; node = node.parentElement) {
      const cs = getComputedStyle(node);
      const stops = cs.backgroundImage === 'none' ? [] : (cs.backgroundImage.match(/rgba?\([^)]*\)/g) || []).map(parse).filter(Boolean);
      stack.push({ stops, fill: parse(cs.backgroundColor) });
    }
    let candidates = [CANVAS];
    for (let i = stack.length - 1; i >= 0; i -= 1) {
      const layer = stack[i];
      const next = [];
      for (const base of candidates) {
        const under = layer.fill && layer.fill.a > 0 ? over(layer.fill, base) : base;
        if (!layer.stops.length) next.push(under);
        else for (const stop of layer.stops) next.push(over(stop, under));
      }
      candidates = next.length > 64 ? next.slice(0, 64) : next;
    }
    return candidates;
  };
  const contrast = (el) => {
    if (!el) return null;
    const ink = parse(getComputedStyle(el).color);
    if (!ink) return null;
    let worst = Infinity;
    for (const base of backdrops(el)) {
      const value = ratio(ink.a < 1 ? over(ink, base) : ink, base);
      if (value < worst) worst = value;
    }
    return Math.round(worst * 100) / 100;
  };
  const animationOf = (el, pseudo) => (el ? getComputedStyle(el, pseudo || null).animationName : null);

  const rows = [...document.querySelectorAll('.owner-now-list > li')]
    .filter((li) => li.getAttribute('role') !== 'presentation')
    .map((li) => {
      const body = li.firstElementChild;
      const pill = li.querySelector('.owner-tag');
      const glyph = pill ? pill.querySelector('svg') : null;
      const title = li.querySelector('.owner-text strong');
      const detail = li.querySelector('.owner-text small');
      const source = li.querySelector('.owner-source');
      const sourceParagraphs = source ? [...source.querySelectorAll(':scope > p')] : [];
      const rawReport = source ? source.querySelector('.source-text') : null;
      const described = [...li.querySelectorAll('[aria-describedby]')].map((el) => {
        const id = el.getAttribute('aria-describedby');
        const node = id ? document.getElementById(id) : null;
        return { name: (el.getAttribute('aria-label') || el.textContent || '').trim(), described: node ? node.textContent.trim() : '' };
      });
      return {
        cls: li.className,
        text: li.innerText.trim(),
        source: {
          title: sourceParagraphs[0]?.textContent.trim() || '',
          legacyDetail: sourceParagraphs[1]?.textContent.trim() || '',
          report: rawReport ? rawReport.textContent.replace(/^Original: /, '') : '',
          reportContext: rawReport?.nextElementSibling?.textContent.trim() || '',
          collapsed: !!source && !source.open,
        },
        body: {
          tag: body ? body.tagName.toLowerCase() : '',
          interactive: !!body && (body.tagName === 'BUTTON' || body.tagName === 'A'),
          described: !!body && body.hasAttribute('aria-describedby'),
          box: rect(body),
        },
        pill: {
          text: pill ? pill.textContent.trim() : '',
          glyphs: glyph ? 1 : 0,
          // The glyph's own markup, so "overdue" and "today" can be told apart by shape. Two ranks that
          // share a fill must not share this string.
          glyph: glyph ? glyph.innerHTML.replace(/\s+/g, ' ').slice(0, 48) : '',
          contrast: contrast(pill),
        },
        title: { text: title ? title.textContent.trim() : '', box: rect(title), ink: inkHeight(title), cut: cut(title), contrast: contrast(title) },
        detail: { text: detail ? detail.textContent.trim() : '', box: rect(detail), ink: inkHeight(detail), cut: cut(detail), contrast: contrast(detail) },
        // The row body is measured as `body`; these are the controls that sit beside it, and each one
        // brings its own colours.
        controls: [...li.querySelectorAll('button, a')].filter((el) => el !== body).map((el) => ({
          cls: el.className,
          name: (el.getAttribute('aria-label') || el.textContent || '').trim(),
          box: rect(el),
          cut: cut(el),
          disabled: !!el.disabled,
          contrast: contrast(el),
        })),
        described,
        animation: { row: animationOf(li), ring: animationOf(li, '::before') },
      };
    });

  const more = one('.owner-now-more');
  return {
    viewport: { width: window.innerWidth, height: window.innerHeight },
    text: one('.control-center') ? one('.control-center').innerText : '',
    card: rect(one('.control-center')),
    more: more ? { text: more.textContent.trim(), box: rect(more), cut: cut(more) } : null,
    groups: [...document.querySelectorAll('.owner-group')].map((el) => el.textContent.trim()),
    rows,
    // The card's other text, measured on its own terms: the header, the footer and the band headings are
    // the sentences a first-time reader meets before the first row.
    ink: ['.control-center-head h3', '.control-center-head small', '.control-center-add', '.control-center-foot', '.control-center-foot span', '.owner-group', '.owner-now-more']
      .map((sel) => { const el = one(sel); return el ? { sel, contrast: contrast(el) } : null; })
      .filter(Boolean),
  };
};

const open = async (viewport) => {
  const page = await browser.newPage({ viewport });
  await page.goto(base, { waitUntil: 'load' });
  await page.waitForSelector('.owner-now-list li');
  // The card previews six rows; the rest sit behind "Show all", and every row is in scope here.
  const more = page.locator('.owner-now-more');
  if (await more.count()) {
    await more.click();
    await page.waitForTimeout(120);
  }
  return page;
};
const inside = (outer, inner, label) => {
  if (!inner || !outer) return;
  assert.ok(inner.top >= outer.top - NO_SLOP && inner.bottom <= outer.bottom + NO_SLOP && inner.left >= outer.left - NO_SLOP && inner.right <= outer.right + NO_SLOP,
    `${label} ${JSON.stringify(inner)} escapes the card ${JSON.stringify({ top: outer.top, bottom: outer.bottom, left: outer.left, right: outer.right })}`);
};

// Every label a row renders is text. This is the assertion the round was failed on, and it is asked of
// the rendered card rather than of the module's return value, because the bug was in what left the
// module on its way to the label.
const rowsAreText = (m, label) => {
  const printed = m.rows.filter((row) => row.text.includes('[object Object]')).map((row) => row.title.text.slice(0, 40));
  assert.deepEqual(printed, [], `${label}: ${printed.length} row(s) render "[object Object]"`);
  assert.ok(!m.text.includes('[object Object]'), `${label}: the card still prints "[object Object]" outside any row`);
  for (const row of m.rows) {
    const name = row.title.text.slice(0, 30);
    assert.ok(row.title.text, `${label}: a row has an empty title (${row.cls})`);
    assert.ok(!row.title.cut, `${label}: the title "${name}" is cut - it needs more room than it has`);
    if (row.detail.text) assert.ok(!row.detail.cut, `${label}: the reason "${row.detail.text.slice(0, 40)}" is cut - it needs more room than it has`);
    assert.ok(row.pill.text, `${label}: "${name}" has no rank label, so its rank can only be read as colour`);
    assert.ok(row.pill.glyphs >= 1, `${label}: "${name}" has no glyph beside its rank label`);
    inside(m.card, row.body.box, `the row body of "${name}"`);
    inside(m.card, row.title.box, `the title of "${name}"`);
  }
  reportsAreReadable(m, label);
  // Rank by shape, not by hue: seven ranks, seven glyphs, and the two sharing the red pill differ.
  const glyphs = new Set(m.rows.map((row) => row.pill.glyph));
  assert.ok(glyphs.size >= 6, `${label}: ${m.rows.length} rows drew only ${glyphs.size} distinct glyph(s), so the rank is being carried by colour`);
  const overdue = m.rows.find((row) => row.pill.text === 'Overdue');
  const today = m.rows.find((row) => row.pill.text === 'Today');
  assert.ok(overdue && today, `${label}: the fixture lost its overdue or today row (pills: ${m.rows.map((row) => row.pill.text).join(', ')})`);
  assert.notEqual(overdue.pill.glyph, today.pill.glyph, `${label}: "Overdue" and "Today" share a glyph and a fill, so nothing but colour separates them`);
};

// Match the actual source, not an abbreviated title or the shared generic summary. The originals
// remain independently asserted in details while the default and accessible description stay readable.
const reportsAreReadable = (m, label) => {
  for (const fixture of ASK_FIXTURES) {
    const matches = m.rows.filter((row) => row.source.title === fixture.title);
    assert.equal(matches.length, 1, `${label}: expected exactly one source row for "${fixture.title}"`);
    const row = matches[0];
    assert.equal(row.detail.text, ASK_SUMMARY, `${label}: "${fixture.title}" lost its English default report summary`);
    assert.equal(row.source.legacyDetail, fixture.legacyDetail, `${label}: "${fixture.title}" lost its original reason`);
    assert.equal(row.source.report, fixture.report, `${label}: "${fixture.title}" lost its full original report`);
    assert.ok(row.source.collapsed, `${label}: "${fixture.title}" exposes raw source by default`);
    assert.ok(row.source.reportContext.includes('Reported from: owner') && row.source.reportContext.includes('Report time unknown') && row.source.reportContext.includes('Current execution is unverified.'), `${label}: the source must remain a timestamp-unrecorded report, not verified execution`);
    assert.ok(row.described.some((control) => control.described.includes(ASK_SUMMARY) && control.described.includes('This is a report; current execution is unverified.')), `${label}: "${fixture.title}" lost its readable accessible report description`);
    assert.ok(!m.text.includes(fixture.legacyDetail) && !m.text.includes(fixture.report), `${label}: raw English source leaked into default prose`);
  }
};

// A row's text box is the size of the words in it.
//
// This is the regression the round was failed on, and it is invisible to every other assertion here:
// a `flex-basis` is a main-axis size, so a rule written for the wide layout (title and reason side by
// side) silently becomes a HEIGHT where the phone block stacks them - one line of title in a ~195px
// box, and a ~3000px card at 390x844. `cut` is false (nothing is clipped), `inside` is true (the card
// grows with its content), and `touchTargets` is true (the box is still 44px wide). Only the ratio
// between the box and the text inside it names the defect. The allowance covers a browser that
// reports a text range by font ascent rather than by line box, which is ~1.3x, not ~10x.
const boxesFitTheirText = (m, label) => {
  const fat = [];
  for (const row of m.rows) {
    const name = row.title.text.slice(0, 28);
    for (const [what, part] of [['title', row.title], ['reason', row.detail]]) {
      if (!part.box || !part.text || !part.ink) continue;
      const allowed = part.ink * 1.5 + 6;
      if (part.box.height > allowed) fat.push(`the ${what} of "${name}" is a ${Math.round(part.box.height)}px box around ${Math.round(part.ink)}px of text`);
    }
  }
  assert.deepEqual(fat, [], `${label}: ${fat.length} text box(es) taller than the words in them - ${fat.join(', ')}`);
};

// A row must not need a pointer to be read. Every control resolves its description to a real sentence.
const noTooltipDependence = (m, label) => {
  for (const row of m.rows) {
    for (const control of row.described) {
      const name = control.name.slice(0, 40);
      assert.ok(control.described, `${label}: ${name} has no aria-describedby text, so its full wording lives in a tooltip no finger reaches`);
      assert.ok(control.described.length >= 20, `${label}: ${name} describes itself with ${control.described.length} characters, which is not a sentence`);
    }
    if (row.body.interactive) assert.ok(row.body.described, `${label}: the ${row.body.tag} row body for "${row.title.text.slice(0, 30)}" carries no aria-describedby`);
  }
};

// Every text pair on the card, measured over the backdrop stack the element really paints on.
//
// A disabled Run button is measured but not held to 4.5:1, and that is WCAG's own exception rather
// than a convenience: text that is part of an inactive component has no contrast minimum. What is
// asserted instead is that its state is named in words - the labels are Queued / Waits for night GPU /
// Running / Needs you / Done, never a bare "Run" in a dimmer colour (fixing-accessibility: a disabled
// state must not rely on colour alone).
const RUN_STATES = ['Queued', 'GPU wait', 'Working', 'Needs you', 'Done'];
const readable = (m, label, min = TEXT_MIN) => {
  const bad = [];
  const inactive = [];
  for (const row of m.rows) {
    if (row.pill.contrast !== null && row.pill.contrast < min) bad.push(`the "${row.pill.text}" rank pill ${row.pill.contrast}:1`);
    if (row.title.contrast !== null && row.title.contrast < min) bad.push(`the title "${row.title.text.slice(0, 28)}" ${row.title.contrast}:1`);
    if (row.detail.contrast !== null && row.detail.contrast < min) bad.push(`the reason "${row.detail.text.slice(0, 28)}" ${row.detail.contrast}:1`);
    for (const control of row.controls) {
      if (control.contrast === null) continue;
      if (control.disabled) {
        inactive.push(`${control.name.slice(0, 28)} ${control.contrast}:1`);
        assert.ok(RUN_STATES.some((state) => control.name.includes(state)), `${label}: a disabled control named "${control.name.slice(0, 40)}" does not say which state it is in`);
        continue;
      }
      if (control.contrast < min) bad.push(`the "${control.name.slice(0, 24)}" control ${control.contrast}:1`);
    }
  }
  for (const item of m.ink) if (item.contrast !== null && item.contrast < min) bad.push(`${item.sel} ${item.contrast}:1`);
  assert.deepEqual(bad, [], `${label}: ${bad.length} text pair(s) under ${min}:1 - ${bad.join(', ')}`);
  return inactive;
};

// adapt: the input method is touch, so a row is planned for a finger rather than scaled down.
const touchTargets = (m, label, min = TOUCH_MIN) => {
  const small = [];
  const overlaps = [];
  for (const row of m.rows) {
    const boxes = [];
    const name = row.title.text.slice(0, 24);
    if (row.body.interactive && row.body.box) boxes.push({ what: `the row body of "${name}"`, box: row.body.box });
    for (const control of row.controls) if (control.box) boxes.push({ what: `${control.cls || control.name.slice(0, 20)} in "${name}"`, box: control.box });
    for (const item of boxes) {
      if (item.box.height < min - 0.5 || item.box.width < min - 0.5) small.push(`${item.what} ${Math.round(item.box.width)}x${Math.round(item.box.height)}px`);
    }
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        if (crossing(boxes[i].box, boxes[j].box)) overlaps.push(`${boxes[i].what} under ${boxes[j].what}`);
      }
    }
  }
  if (m.more && m.more.box && m.more.box.height < min - 0.5) small.push(`"${m.more.text}" ${Math.round(m.more.box.height)}px`);
  assert.deepEqual(small, [], `${label}: control(s) under ${min}px: ${small.join(', ')}`);
  assert.deepEqual(overlaps, [], `${label}: ${overlaps.length} control pair(s) overlap on one row: ${overlaps.join(', ')}`);
};

const runningRows = (m) => m.rows.filter((row) => row.cls.includes('run-running'));
const tallest = (m) => Math.round(Math.max(0, ...m.rows.map((row) => (row.body.box || {}).height || 0)));
// The tallest row is logged at both viewports on purpose: it is the number that moved when a phone row
// went from ~110px to ~310px, and it is what a reader of the log needs in order to trust the fix without
// opening the capture.
const report = (m) => `${m.rows.length} rows, ${m.rows.filter((row) => row.controls.some((control) => control.cls.includes('run-button'))).length} with a Run button, tallest row ${tallest(m)}px, card ${Math.round((m.card || {}).height || 0)}px tall, bands: ${m.groups.join(' / ')}`;

for (const [name, viewport] of [['1440x900', DESKTOP], ['390x844', PHONE]]) {
  await check(`the Next Work List at ${name}: every row is text, in full, inside the card`, async () => {
    const page = await open(viewport);
    const m = await page.evaluate(MEASURE);
    assert.ok(m.rows.length >= 12, `${name}: only ${m.rows.length} rows rendered; the fixture is meant to carry every rank and Run state`);
    rowsAreText(m, name);
    boxesFitTheirText(m, name);
    noTooltipDependence(m, name);
    const inactive = readable(m, name);
    for (const row of m.rows) {
      for (const control of row.controls) assert.ok(!control.cut, `${name}: the "${control.name.slice(0, 30)}" control is cut - the longest Run label still has to fit`);
    }
    if (m.more) assert.ok(!m.more.cut, `${name}: "Show all" is cut`);
    console.log(`     ${report(m)}`);
    if (inactive.length) console.log(`     inactive (no 4.5:1 minimum, state named in words): ${inactive.join(', ')}`);
    await page.screenshot({ path: shot(`control-center-${name}.png`), fullPage: true });
    await page.close();
  });
}

await check('every control in a row is a 44px target at 390x844, and none of them overlap', async () => {
  const page = await open(PHONE);
  const m = await page.evaluate(MEASURE);
  touchTargets(m, 'phone 390x844');
  // The row that carries both a long Run label and a tick is the case worth naming, because it is what
  // the phone layout was rebuilt around.
  const gpuMatches = m.rows.filter((row) => row.source.title === GPU_SOURCE_TITLE);
  assert.equal(gpuMatches.length, 1, 'the fixture must have exactly one GPU source row');
  const gpu = gpuMatches[0];
  assert.ok(gpu.cls.split(' ').includes('run-waiting-gpu'), 'the actual GPU fixture lost its waiting-GPU state');
  const gpuRun = gpu.controls.filter((control) => control.cls.split(' ').includes('run-button'));
  assert.equal(gpuRun.length, 1, 'the GPU fixture must retain its Run control');
  assert.equal(gpuRun[0].name, `GPU wait: ${GPU_SOURCE_TITLE}`, 'the GPU fixture lost its English state or full accessible source title');
  assert.ok(gpuRun[0].disabled, 'the scheduled GPU fixture must stay disabled');
  assert.ok(gpu.controls.every((control) => !control.cut), `the GPU row cut ${gpu.controls.filter((control) => control.cut).map((control) => control.name).join(', ')}`);
  console.log(`     the GPU row carries ${gpu.controls.length} control(s): ${gpu.controls.map((control) => `${control.cls || control.name} ${Math.round(control.box?.width || 0)}x${Math.round(control.box?.height || 0)}px`).join(', ')}`);
  await page.close();
});

// The control case first: without it a reduced-motion pass can be green because the element never moved.
await check('a running row animates by default', async () => {
  const page = await open(DESKTOP);
  const m = await page.evaluate(MEASURE);
  const rows = runningRows(m);
  assert.ok(rows.length >= 1, 'the fixture lost its running row, so reduced motion would be checked against nothing');
  assert.notEqual(rows[0].animation.row, 'none', `the running row has no animation at all ("${rows[0].animation.row}"), so the reduced-motion check would pass vacuously`);
  const spin = await page.evaluate(() => [...document.querySelectorAll('.run-spinner')].map((el) => getComputedStyle(el).animationName));
  assert.ok(spin.length >= 1 && spin.every((name) => name !== 'none'), `the spinner does not animate by default (${spin.join(', ')})`);
  await page.close();
});

await check('prefers-reduced-motion stops the running row, its Run button and the spinner', async () => {
  const page = await open(DESKTOP);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(150);
  const m = await page.evaluate(MEASURE);
  const rows = runningRows(m);
  assert.ok(rows.length >= 1, 'the fixture lost its running row');
  for (const row of rows) {
    assert.equal(row.animation.row, 'none', `a running row still animates "${row.animation.row}" under prefers-reduced-motion`);
    assert.equal(row.animation.ring, 'none', `the running row's rotating border still animates "${row.animation.ring}" under prefers-reduced-motion`);
  }
  // The Run button on a running row, and the spinner inside it, are separate elements with separate
  // rules; read them off the page rather than assuming the row's rule reached them.
  const moving = await page.evaluate(() => [...document.querySelectorAll('.run-button, .run-spinner')]
    .map((el) => ({ cls: el.className, animation: getComputedStyle(el).animationName })));
  const live = moving.filter((item) => item.animation !== 'none');
  assert.deepEqual(live, [], `${live.length} control(s) still animate under prefers-reduced-motion: ${live.map((item) => `${item.cls} ${item.animation}`).join(', ')}`);
  await page.close();
});

await browser.close();
await server.close();

// Pi reads the screenshots, not this log: prove they exist rather than assume the writes landed. Read
// off the same list the manifest and `npm run build` name (CARD_CAPTURES), so a capture this check
// cannot see and a capture the build cannot attribute are not two different sets.
const EXPECTED = CARD_CAPTURES;
for (const name of EXPECTED) {
  if (existsSync(path.join(OUT, name))) continue;
  failed = true;
  checks.push({ name: `screenshot ${name}`, message: `was not written to ${OUT}` });
  console.log(`FAIL screenshot ${name} was not written to ${OUT}`);
}

// The manifest is rewritten last, after the screenshot existence check, so a run that ended without its
// captures is recorded as `failed` with the capture it owes rather than as a finished measurement whose
// own list says the file is missing. `complete` is reachable only when every capture is on disk and no
// check failed.
finish(failed ? 'failed' : 'complete');

console.log(failed ? '\nCONTROL_CENTER_FAIL' : `\nCONTROL_CENTER_OK  ${EXPECTED.length} screenshots in ${OUT}`);
process.exit(failed ? 1 : 0);