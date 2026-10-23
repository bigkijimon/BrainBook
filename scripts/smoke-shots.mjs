// Isolated screenshot + layout smoke for BrainBook (390px phone and desktop).
// Run: node scripts/smoke-shots.mjs <scratch-home-dir> <out-dir> [--themes]
//
// The scratch home MUST hold its own config.json whose vaultPath is a throwaway folder: BRAINBOOK_HOME
// alone does not isolate vault writes (skill brainbook-ops). The server starts with
// BRAINBOOK_NO_AUTOPILOT=1 on port 4199 and a scratch tasks file, and is killed when the run ends.
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchTestBrowser } from './browser.mjs';

// --root=<dir> runs another copy of the app (e.g. the installed bundle's Resources/app) for a true "before".
const root = process.argv.find((arg) => arg.startsWith('--root='))?.slice(7) || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [home, out] = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
if (!home || !out) throw new Error('usage: node scripts/smoke-shots.mjs <scratch-home-dir> <out-dir> [--themes]');
const config = JSON.parse(await fs.readFile(path.join(path.resolve(home), 'config.json'), 'utf8'));
if (!config.vaultPath || /ObsidianVault|Mobile Documents/.test(config.vaultPath)) throw new Error(`refusing: scratch config.json points at a real vault (${config.vaultPath})`);
await fs.mkdir(out, { recursive: true });

// --base=<url> screenshots an already-running app read-only (navigation + tab clicks only) instead of spawning a server.
const external = process.argv.find((arg) => arg.startsWith('--base='))?.slice(7);
const port = 4199;
const server = external ? null : spawn(process.execPath, ['server.mjs'], {
  cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, PORT: String(port), BRAINBOOK_NO_AUTOPILOT: '1', BRAINBOOK_HOME: path.resolve(home), BRAINBOOK_DATA_FILE: path.join(path.resolve(home), 'tasks.json') },
});
let log = '';
server?.stdout.on('data', (d) => { log += d; });
server?.stderr.on('data', (d) => { log += d; });
const base = external || `http://127.0.0.1:${port}`;
const results = [];
let browser;
try {
  for (let i = 0; i < 100; i += 1) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 100)); }
  browser = await launchTestBrowser();
  const viewports = [['mobile', { width: 390, height: 844 }], ['desktop', { width: 1440, height: 900 }]];
  const pages = ['home', 'ideas', 'tasks', 'goals', 'office', 'data', 'chat'];
  for (const [name, viewport] of viewports) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: name === 'mobile', isMobile: name === 'mobile' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/#home`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !document.getElementById('bb-boot'), null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1200);
    for (const target of pages) {
      await page.evaluate((hash) => { location.hash = hash; }, target);
      await page.waitForTimeout(700);
      const facts = await page.evaluate(() => ({
        navs: document.querySelectorAll('nav,[role=navigation]').length,
        overflowX: document.documentElement.scrollWidth - window.innerWidth,
        h2: document.querySelector('main h2')?.textContent?.trim() || null,
        bottomBar: (() => { const nav = document.querySelector('nav.app-nav'); if (!nav) return null; const r = nav.getBoundingClientRect(); return { top: Math.round(r.top), height: Math.round(r.height), vh: window.innerHeight }; })(),
      }));
      results.push({ viewport: name, page: target, ...facts });
      await page.screenshot({ path: path.join(out, `${name}-${target}.png`) });
    }
    if (name === 'mobile') {
      await page.evaluate(() => { location.hash = 'ideas'; });
      await page.waitForTimeout(500);
      await page.locator('.nav-menu-btn').click().catch(() => {});
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(out, 'mobile-menu-open.png') });
      await page.keyboard.press('Escape');
    }
    // Ideas tabs.
    await page.evaluate(() => { location.hash = 'ideas'; });
    await page.waitForTimeout(500);
    for (const label of ['New idea', 'Idea cards']) {
      const tab = page.getByRole('tab', { name: label });
      if (await tab.count()) { await tab.click(); await page.waitForTimeout(700); await page.screenshot({ path: path.join(out, `${name}-ideas-${label.replace(/\s+/g, '-').toLowerCase()}.png`) }); }
    }
    // Idea Card + theme picker (new in the 2026-10-23 update; absent from older builds, so each step is optional).
    if (!external && process.argv.includes('--card')) {
      const seed = await fetch(`${base}/api/ideas/cards`).then((r) => r.json()).catch(() => ({ items: [] }));
      const target = seed.items?.[0];
      if (target) {
        await fetch(`${base}/api/ideas/card`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: target.path, card: {
          niche: 'Wealth — freelancer irregular-income budgeting',
          volume: { value: 840000, unit: 'per month', source: 'SearchSpy, Top 10 Personal Finance Trends 2026' },
          trend: { pct: 212, window: '12 months', source: 'SearchSpy, same report' },
          series: [{ label: '2025', value: 0.26 }, { label: '2030', value: 0.75 }, { label: '2035', value: 2 }], seriesUnit: 'USD B', seriesSource: 'NextMSC AI budgeting app market report',
          quote: { text: 'My primary challenge isn\'t tracking my expenses; it\'s figuring out how much I can afford to spend on any given day.', source: 'r/Freelancers' },
          pitch: { name: 'SafeSpend', line: 'The one number that matters: how much is safe to spend today.' },
          decision: 'selected', decisionReason: 'Broadest pain coverage in the smallest MVP scope vs 3 rejected candidates.',
        } }) });
        await page.evaluate(() => { location.hash = 'ideas'; });
        await page.waitForTimeout(400);
        await page.getByRole('tab', { name: 'Idea cards' }).click();
        await page.waitForTimeout(500);
        await page.locator('.idea-card-row-btn').first().click();
        await page.waitForTimeout(700);
        await page.screenshot({ path: path.join(out, `${name}-idea-card-view.png`), fullPage: false });
        await page.locator('.idea-card').scrollIntoViewIfNeeded();
        await page.locator('.idea-card-detail details > summary').click();
        await page.waitForTimeout(500);
        await page.screenshot({ path: path.join(out, `${name}-idea-card-form.png`), fullPage: true });
      }
      await page.evaluate(() => { location.hash = 'home'; });
      await page.waitForTimeout(400);
      await page.evaluate(() => window.scrollTo(0, 0));
      const opened = await page.locator('summary[aria-label="More actions"]').click({ timeout: 4000 }).then(() => page.locator('.avatar-button').click({ timeout: 4000 })).then(() => page.waitForTimeout(400)).then(() => page.screenshot({ path: path.join(out, `${name}-settings-step1.png`) })).then(() => page.locator('.profile-settings').click({ timeout: 4000 })).then(() => true).catch((e) => { results.push({ viewport: name, settingsOpenFailed: e.message.slice(0, 700) }); return false; });
      if (!opened) await page.screenshot({ path: path.join(out, `${name}-settings-failed.png`) });
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(out, `${name}-settings-theme.png`) });
      await page.getByRole('radio', { name: /Aurora/ }).click().catch(() => {});
      await page.waitForTimeout(500);
      results.push({ viewport: name, themeAfterPick: await page.evaluate(() => document.documentElement.dataset.theme), navsWithDialog: await page.evaluate(() => document.querySelectorAll('nav,[role=navigation]').length) });
      await page.screenshot({ path: path.join(out, `${name}-settings-theme-aurora.png`) });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
      results.push({ viewport: name, themeAfterCancel: await page.evaluate(() => document.documentElement.dataset.theme) });
    }
    if (process.argv.includes('--themes')) {
      for (const theme of ['miami', 'aurora', 'ember', 'slate']) {
        await page.evaluate((t) => { document.documentElement.dataset.theme = t; window.dispatchEvent(new CustomEvent('brainbook-themechange', { detail: t })); }, theme);
        await page.waitForTimeout(500);
        const night = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--theme-night').trim());
        results.push({ viewport: name, theme, night });
        await page.screenshot({ path: path.join(out, `${name}-theme-${theme}.png`) });
      }
    }
    results.push({ viewport: name, pageErrors: errors });
    await context.close();
  }
} finally {
  await browser?.close().catch(() => {});
  server?.kill('SIGTERM');
}
console.log(JSON.stringify(results, null, 1));
if (!results.length) console.log(log.slice(-2000));
