// Test for scripts/browser.mjs — the Chromium the browser-driven tests (scripts/test-voice.mjs)
// drive. It exists because `npm run test:voice` used to depend on whatever Chromium happened to be
// installed: with no Google Chrome it fell through to Playwright's own pinned revision, which nothing
// downloads, so the suite could not run at all. Run: node scripts/test-browser.mjs
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { browserCandidates, launchTestBrowser } from './browser.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const CHROMIUM = '/Applications/Chromium.app/Contents/MacOS/Chromium';
const HOME_CACHE = path.join(process.env.HOME || '', 'Library', 'Caches', 'ms-playwright');
const SHELL_LAYOUT = 'chrome-headless-shell-mac-arm64/chrome-headless-shell';
let failed = false;
const check = async (name, fn) => {
  try { await fn(); console.log(`ok   ${name}`); } catch (error) { failed = true; console.log(`FAIL ${name}\n     ${error.message.split('\n').slice(0, 6).join(' | ')}`); }
};

// A filesystem where only the listed paths exist, so candidate planning is checked without one.
const fakeExists = (...real) => (target) => real.includes(String(target));

await check('an explicit BRAINBOOK_TEST_CHROMIUM is the only candidate: it is never silently ignored', () => {
  const candidates = browserCandidates({ BRAINBOOK_TEST_CHROMIUM: '/opt/my-chrome' }, fakeExists('/opt/my-chrome'));
  assert.deepEqual(candidates.map((c) => c.label), ['/opt/my-chrome']);
  assert.deepEqual(candidates[0].option, { executablePath: '/opt/my-chrome' });
});

await check('candidates run: Google Chrome, installed browsers, cached Playwright builds, pinned revision', () => {
  const labels = browserCandidates({}, fakeExists(CHROMIUM, HOME_CACHE, `${HOME_CACHE}/chromium-1243/${SHELL_LAYOUT}`)).map((c) => c.label);
  assert.deepEqual(labels.slice(0, 2), ['Google Chrome', 'Chromium.app']);
  assert.ok(labels.some((label) => label.startsWith('Playwright cache ')), `the cache is not searched: ${labels.join(', ')}`);
  assert.equal(labels.at(-1), 'Playwright pinned revision');
  assert.deepEqual(labels, [...new Set(labels)], 'a candidate is listed twice');
});

await check('the newest cached Playwright Chromium is preferred over an older one', () => {
  const cache = browserCandidates({}, fakeExists(HOME_CACHE, `${HOME_CACHE}/chromium-1243/${SHELL_LAYOUT}`, `${HOME_CACHE}/chromium-1208/chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium`), { cache: `${HOME_CACHE}` });
  const cached = cache.map((c) => c.label).filter((label) => label.startsWith('Playwright cache'));
  assert.deepEqual(cached, [`Playwright cache chromium-1243/${SHELL_LAYOUT}`], `expected only the newest: ${cached.join(', ')}`);
});

await check('a path that does not exist is not offered as a candidate', () => {
  const labels = browserCandidates({}, fakeExists(HOME_CACHE)).map((c) => c.label);
  assert.deepEqual(labels, ['Google Chrome', 'Playwright pinned revision']);
});

await check('the first candidate that launches wins, and the browser used is named once', async () => {
  const tried = [];
  const notes = [];
  const browser = await launchTestBrowser({
    candidates: [{ label: 'first', option: {} }, { label: 'second', option: {} }],
    launch: async (option) => { tried.push(option); if (tried.length === 1) throw new Error('nope'); return { version: () => '999' }; },
    log: (line) => notes.push(line),
  });
  assert.equal(browser.version(), '999');
  assert.equal(tried.length, 2, 'the second candidate was never tried');
  assert.deepEqual(notes, ['note browser: second 999']);
});

await check('an explicit browser that cannot launch fails loudly instead of falling through', async () => {
  let attempts = 0;
  await assert.rejects(
    launchTestBrowser({
      env: { BRAINBOOK_TEST_CHROMIUM: '/opt/my-chrome' },
      launch: async () => { attempts += 1; throw new Error('bad binary'); },
    }),
    (error) => {
      assert.match(error.message, /BRAINBOOK_TEST_CHROMIUM/, 'the error must say which setting produced it');
      assert.match(error.message, /bad binary/, 'the error must carry the underlying reason');
      assert.match(error.message, /^ {5}\/opt\/my-chrome: bad binary$/m, 'the error must name the browser the owner asked for');
      return true;
    },
  );
  assert.equal(attempts, 1, 'it fell through to another browser');
});

await check('when no candidate works the error lists every reason and both ways out', async () => {
  await assert.rejects(
    launchTestBrowser({ candidates: [{ label: 'Google Chrome', option: {} }, { label: 'Playwright pinned revision', option: {} }], launch: async () => { throw new Error('missing'); } }),
    (error) => {
      assert.match(error.message, /Google Chrome: missing/);
      assert.match(error.message, /Playwright pinned revision: missing/);
      assert.match(error.message, /npx playwright-core install/);
      assert.match(error.message, /BRAINBOOK_TEST_CHROMIUM/);
      return true;
    },
  );
});

await check('extra launch options reach every candidate', async () => {
  const seen = [];
  await launchTestBrowser({
    candidates: [{ label: 'only', option: {} }],
    launch: async (option) => { seen.push(option); return { version: () => '1' }; },
    args: ['--enable-unsafe-swiftshader'],
    log: () => {},
  });
  assert.deepEqual(seen, [{ headless: true, args: ['--enable-unsafe-swiftshader'] }]);
});

// The regression that started all this: with Google Chrome unavailable, a Chromium already in the
// local Playwright cache is used and a real browser comes up. A real launch, not a fake.
await check('the default launcher works with no injection at all', async () => {
  const notes = [];
  const browser = await launchTestBrowser({ log: (line) => notes.push(line) });
  try { await browser.newPage(); } finally { await browser.close(); }
  assert.match(notes[0], /^note browser: Google Chrome \d/, `named the browser: ${notes[0]}`);
});

await check('no Google Chrome: a Chromium already in the Playwright cache launches for real', async () => {
  const real = chromium.launch.bind(chromium);
  const chosen = [];
  const browser = await launchTestBrowser({
    exists: (target) => String(target).startsWith(HOME_CACHE),
    launch: (option) => {
      chosen.push(option);
      if (option.channel === 'chrome') return Promise.reject(new Error('no Google Chrome on this machine'));
      return real(option);
    },
    log: () => {},
  });
  try {
    const page = await browser.newPage();
    assert.equal(await page.evaluate(() => 1 + 1), 2, 'the launched browser does not work');
  } finally { await browser.close(); }
  const used = chosen.at(-1).executablePath;
  assert.ok(used, `no cached Chromium was chosen; tried ${JSON.stringify(chosen)}`);
  console.log(`     used ${path.relative(root, used)}`);
});

console.log(failed ? 'BROWSER_FAIL' : 'BROWSER_OK');
process.exit(failed ? 1 : 0);
