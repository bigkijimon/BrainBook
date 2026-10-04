// The Chromium that the browser-driven tests (scripts/test-voice.mjs) drive. The tests fake speech
// recognition and the API, so any Chromium works — the browser only has to exist.
//
// It is a module with a small interface because "which Chromium, and what if none of them start" is
// the whole problem. browserCandidates plans the search; launchTestBrowser runs it and reports which
// one it used. Everything between — Google Chrome, other installed browsers, any Chromium already in
// the local Playwright cache, and only then Playwright's own pinned revision — stays inside.
//
// Why the cache matters: playwright-core pins one revision and downloads nothing by itself, so a
// machine without Google Chrome used to end the run with "Executable doesn't exist". Revisions
// installed by any other Playwright on the machine are perfectly good browsers, so they are searched
// before the pinned one.
import { existsSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';

const INSTALLED = [
  ['/Applications/Chromium.app/Contents/MacOS/Chromium', 'Chromium.app'],
  ['/Applications/Brave Browser.app/Contents/MacOS/Brave Browser', 'Brave Browser.app'],
  ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', 'Microsoft Edge.app'],
  ['/usr/bin/google-chrome', 'google-chrome'],
  ['/usr/bin/chromium', 'chromium'],
  ['/usr/bin/chromium-browser', 'chromium-browser'],
];

// Where each platform puts the binary inside a Playwright revision directory. The headless shell is
// first: it is the smallest thing that can run a page.
const LAYOUTS = [
  'chrome-headless-shell-mac-arm64/chrome-headless-shell',
  'chrome-headless-shell-mac-x64/chrome-headless-shell',
  'chrome-headless-shell-win/chrome-headless-shell.exe',
  'chrome-headless-shell-linux/chrome-headless-shell',
  'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
  'chrome-win/chrome.exe',
  'chrome-linux/chrome',
];

const cacheHome = (env) => env.PLAYWRIGHT_BROWSERS_PATH
  || path.join(env.HOME || os.homedir(), 'Library', 'Caches', 'ms-playwright');
// Newest revision first: 1243 before 1208, and "1243" before "124" for two-digit revisions.
const byNewest = (left, right) => Number(right.replace(/\D/g, '') || 0) - Number(left.replace(/\D/g, '') || 0)
  || right.localeCompare(left);

const readRevisions = (cache) => {
  try { return readdirSync(cache).filter((name) => name.startsWith('chromium')).sort(byNewest); }
  catch { return []; }
};

export function browserCandidates(env = process.env, exists = existsSync, { cache = cacheHome(env) } = {}) {
  const explicit = env.BRAINBOOK_TEST_CHROMIUM;
  if (explicit) return [{ label: explicit, option: { executablePath: explicit } }];
  const candidates = [{ label: 'Google Chrome', option: { channel: 'chrome' } }];
  for (const [bin, label] of INSTALLED) {
    if (exists(bin)) candidates.push({ label, option: { executablePath: bin } });
  }
  // Read through the injected `exists` so a caller can plan against a filesystem it describes itself.
  // A cache that is gone, unreadable or mid-cleanup must not end the run: it is only a source of candidates.
  const revisions = exists(cache) ? readRevisions(cache) : [];
  for (const revision of revisions) {
    for (const layout of LAYOUTS) {
      const bin = path.join(cache, revision, layout);
      if (exists(bin)) { candidates.push({ label: `Playwright cache ${revision}/${layout}`, option: { executablePath: bin } }); break; }
    }
  }
  candidates.push({ label: 'Playwright pinned revision', option: {} });
  const seen = new Set();
  return candidates.filter((candidate) => {
    const key = JSON.stringify(candidate.option);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function launchTestBrowser({ env = process.env, exists = existsSync, candidates, launch = chromium.launch.bind(chromium), log = console.log, ...extra } = {}) {
  const options = candidates ?? browserCandidates(env, exists);
  const reasons = [];
  for (const { label, option } of options) {
    try {
      const browser = await launch({ ...option, headless: true, ...extra });
      log(`note browser: ${label} ${browser.version()}`);
      return browser;
    } catch (error) { reasons.push(`${label}: ${error.message.split('\n')[0]}`); }
  }
  throw new Error(`No Chromium for the browser tests.\n     ${reasons.join('\n     ')}\n     Install Google Chrome, or run \`npx playwright-core install chromium-headless-shell\`, or point BRAINBOOK_TEST_CHROMIUM at a Chromium binary.`);
}
