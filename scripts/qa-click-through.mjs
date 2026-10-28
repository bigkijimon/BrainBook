// Read-only click-through QA of a running BrainBook (default the installed app, :4183).
// 1) nav accessible-name audit (expanded + compact) on every page; 2) press every visible button on
// every page except a denylist of mutating actions, logging console/page errors, 4xx/5xx and dialogs.
// Usage: node scripts/qa-click-through.mjs [baseUrl] [outFile]
import { writeFileSync } from 'node:fs';
import { launchTestBrowser } from './browser.mjs';

const base = process.argv[2] || 'http://127.0.0.1:4183';
const out = process.argv[3] || 'qa-click-through-result.json';
const MUTATING = /\b(send|save|create|delete|remove|archive|submit|run|instruct|approve|dispatch|execute|kill|restart|apply|post|complete|mark|pair|deploy|merge|reset|clear|import|upload|attach|dictat|record|speak|listen|start|stop|decide|adopt|reject|launch|retry)\b|送信|保存|削除|実行|開始/i;
const browser = await launchTestBrowser();
const report = { base, at: new Date().toISOString(), nav: [], clicks: [], pageLoads: [] };

async function open(route) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(`console: ${m.text().slice(0, 160)}`); });
  page.on('pageerror', (e) => errs.push(`pageerror: ${String(e).slice(0, 160)}`));
  page.on('response', (r) => { if (r.status() >= 400 && !/icon\.png|favicon/.test(r.url())) errs.push(`HTTP ${r.status()} ${r.url().replace(base, '')}`); });
  await page.goto(`${base}/#${route}`, { waitUntil: 'load' });
  await page.waitForFunction(() => !document.querySelector('.boot-overlay, #boot, .boot-splash'), null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
  return { ctx, page, errs };
}

// Accessible name of an element the way a screen reader sees it: aria-label, else rendered (visible) text.
const NAME_FN = () => {
  const vis = (el) => { const s = getComputedStyle(el); return s.display !== 'none' && s.visibility !== 'hidden'; };
  const text = (n) => n.nodeType === 3 ? n.textContent : (n.nodeType === 1 && vis(n) && n.getAttribute('aria-hidden') !== 'true' ? [...n.childNodes].map(text).join('') : '');
  return [...document.querySelectorAll('nav button, nav input, nav a, nav [role=button]')].map((el) => ({
    tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 40),
    name: (el.getAttribute('aria-label') || text(el) || el.getAttribute('title') || '').trim(),
    hidden: !!el.closest('[hidden]') || !vis(el),
  })).filter((x) => !x.hidden);
};

for (const route of ['home', 'ideas', 'data']) {
  const { ctx, page, errs } = await open(route);
  const navCount = await page.locator('nav, [role=navigation]').count();
  for (const mode of ['expanded', 'compact']) {
    const isCompact = await page.locator('.app-nav.is-compact').count();
    if ((mode === 'compact') !== !!isCompact) { await page.locator('.nav-compact-btn').click(); await page.waitForTimeout(300); }
    const items = await page.evaluate(NAME_FN);
    const unnamed = items.filter((i) => !i.name);
    const appIcons = await page.locator('.managed-apps svg.lucide-app-window:visible').count();
    report.nav.push({ route, mode, navLandmarks: navCount, controls: items.length, unnamed, managedAppsVisibleAppWindowIcons: appIcons });
  }
  report.pageLoads.push({ route, errors: errs, h1: await page.locator('h1, h2').first().innerText().catch(() => '') });
  await ctx.close();
}

// Click-through: fresh context per button so one broken state cannot poison the next press.
for (const route of ['home', 'ideas', 'data']) {
  const probe = await open(route);
  const names = await probe.page.evaluate(() => [...document.querySelectorAll('button, [role=tab], summary')].filter((el) => el.offsetParent !== null || getComputedStyle(el).position === 'fixed').map((el, i) => ({ i, name: (el.getAttribute('aria-label') || el.textContent || el.title || '').trim().replace(/\s+/g, ' ').slice(0, 60) })));
  await probe.ctx.close();
  for (const b of names) {
    if (MUTATING.test(b.name)) { report.clicks.push({ route, ...b, result: 'SKIPPED (mutating/side-effect)' }); continue; }
    const { ctx, page, errs } = await open(route);
    // Find by name + occurrence among same-named visible controls (index drift between loads gave false failures).
    const occ = names.slice(0, b.i).filter((n) => n.name === b.name).length;
    const tag = await page.evaluate(({ name, occ }) => {
      const nm = (el) => (el.getAttribute('aria-label') || el.textContent || el.title || '').trim().replace(/\s+/g, ' ').slice(0, 60);
      const list = [...document.querySelectorAll('button, [role=tab], summary')].filter((el) => (el.offsetParent !== null || getComputedStyle(el).position === 'fixed') && nm(el) === name);
      const el = list[occ]; if (!el) return false; el.setAttribute('data-qa-target', '1'); return true;
    }, { name: b.name, occ });
    if (!tag) { report.clicks.push({ route, ...b, result: 'NOT FOUND ON FRESH LOAD (list is time-dependent)', errors: errs }); await ctx.close(); continue; }
    const target = page.locator('[data-qa-target="1"]');
    let result = 'ok';
    try {
      const before = await page.evaluate(() => ({ hash: location.hash, dialogs: document.querySelectorAll('dialog[open],[role=dialog]').length, html: document.body.innerHTML.length }));
      await target.click({ timeout: 4000 });
      await page.waitForTimeout(500);
      const after = await page.evaluate(() => ({ hash: location.hash, dialogs: document.querySelectorAll('dialog[open],[role=dialog]').length, html: document.body.innerHTML.length }));
      const effect = [];
      if (after.hash !== before.hash) effect.push(`hash ${before.hash}→${after.hash}`);
      if (after.dialogs !== before.dialogs) effect.push(`dialogs ${before.dialogs}→${after.dialogs}`);
      if (after.html !== before.html) effect.push('DOM changed');
      result = effect.length ? effect.join('; ') : 'NO VISIBLE EFFECT';
      if (after.dialogs > before.dialogs) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); const closed = await page.evaluate(() => document.querySelectorAll('dialog[open],[role=dialog]').length); if (closed > before.dialogs) result += ' | Escape did NOT close'; }
    } catch (e) { result = `CLICK FAILED: ${String(e).replace(/\s+/g, ' ').slice(0, 330)}`; }
    report.clicks.push({ route, ...b, result, errors: errs });
    await ctx.close();
  }
}
await browser.close();
writeFileSync(out, JSON.stringify(report, null, 1));
const bad = report.clicks.filter((c) => /FAILED|NO VISIBLE|did NOT|NOT FOUND/.test(c.result) || c.errors?.length);
console.log(JSON.stringify({ nav: report.nav, pageLoads: report.pageLoads, clicked: report.clicks.filter((c) => !c.result.startsWith('SKIPPED')).length, skipped: report.clicks.filter((c) => c.result.startsWith('SKIPPED')).length, flagged: bad }, null, 1));
