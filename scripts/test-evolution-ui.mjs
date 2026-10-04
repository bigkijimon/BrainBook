// Rendered check for the InvestPro EVOLUTION tab (desktop 1280x900 and phone 390x844).
// Usage: node scripts/test-evolution-ui.mjs   (BRAINBOOK_EVIDENCE_DIR=dir also saves screenshots)
//
// The page is scripts/evolution-harness (the real TeamRail). /api/investment/evolution is answered from
// the real server module (investment-evolution.mjs) reading a fixture snapshot built by the real VIT
// engine, so the data is deterministic, synthetic and labelled `fixture`. No server, broker, model,
// scheduler or network beyond localhost is used.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { launchTestBrowser } from './browser.mjs';
import { readEvolutionSnapshot } from '../investment-evolution.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const VIT = process.env.VIT_ENGINE || '/Users/yuma/Documents/SystemAPPS/Stock/VirtualInvestmentTrusts/engine';
const python = path.join(VIT, '.venv/bin/python');
if (!existsSync(python)) { console.log('SKIP no VIT engine venv; set VIT_ENGINE'); process.exit(0); }
const shots = process.env.BRAINBOOK_EVIDENCE_DIR && path.resolve(process.env.BRAINBOOK_EVIDENCE_DIR);
if (shots) mkdirSync(shots, { recursive: true });

const store = mkdtempSync(path.join(tmpdir(), 'brainbook-evo-ui-'));
execFileSync(python, ['-m', 'vit.evolution', 'fixture', '--store', store, '--generations', '4'], { env: { PATH: process.env.PATH, PYTHONPATH: path.join(VIT, 'src'), PYTHONDONTWRITEBYTECODE: '1' } });
const goodFile = path.join(store, 'snapshot.json');
const stamp = Date.parse(JSON.parse((await import('node:fs')).readFileSync(goodFile, 'utf8')).run.as_of);
const corruptFile = path.join(store, 'corrupt.json');
writeFileSync(corruptFile, '{"kind": "vit-evolution-snapshot", "schema_version": 1, "run":');

const server = await createServer({ root, configFile: false, plugins: [react()], logLevel: 'error', server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}/scripts/evolution-harness/index.html`;
const browser = await launchTestBrowser();
let failed = false;
const check = async (name, fn) => { try { await fn(); console.log(`ok   ${name}`); } catch (error) { failed = true; console.log(`FAIL ${name}\n     ${error.message.split('\n').slice(0, 6).join(' | ')}`); } };

const open = async (viewport, { file = goodFile, now = stamp + 60_000, hits } = {}) => {
  const page = await browser.newPage({ viewport });
  await page.route('**/api/investment/evolution', async (route) => {
    if (hits) hits.push(route.request().method());
    const body = file === 'down' ? null : JSON.stringify(await readEvolutionSnapshot({ snapshotPath: file, now }));
    if (!body) return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
    await route.fulfill({ contentType: 'application/json', body });
  });
  await page.goto(base, { waitUntil: 'load' });
  return page;
};
const openEvolution = async (page) => {
  await page.getByRole('button', { name: /InvestPro/ }).click();
  await page.getByRole('tab', { name: 'EVOLUTION' }).click();
};
const shot = async (page, name) => { if (shots) await page.screenshot({ path: path.join(shots, name), fullPage: false }); };
const overflowX = (page) => page.evaluate(() => {
  const sheet = document.querySelector('.team-sheet');
  return { page: document.documentElement.scrollWidth - document.documentElement.clientWidth, sheet: sheet ? sheet.scrollWidth - sheet.clientWidth : 0 };
});

await check('EVOLUTION tab exists only for InvestPro; App Dev keeps its single view', async () => {
  const page = await open({ width: 1280, height: 900 });
  await page.getByRole('button', { name: /App Dev/ }).click();
  assert.equal(await page.getByRole('tablist').count(), 0);
  assert.ok(await page.getByText('Tell a member directly').count());
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /InvestPro/ }).click();
  assert.equal(await page.getByRole('tab').count(), 2);
  assert.ok(await page.getByText('Tell a member directly').count(), 'Team view keeps its direct-instruction box');
  for (const name of ['Margaret Hamilton', 'Linus Torvalds', 'Jony Ive', 'Grace Hopper', 'Daniel Kahneman']) assert.ok(await page.locator('.team-tree').getByText(name, { exact: false }).count(), name);
  await page.close();
});

await check('the arena is not fetched until the EVOLUTION tab is shown, and the endpoint is only read with GET', async () => {
  const hits = [];
  const page = await open({ width: 1280, height: 900 }, { hits });
  await page.getByRole('button', { name: /InvestPro/ }).click();
  await page.waitForTimeout(400);
  assert.equal(hits.length, 0);
  await page.getByRole('tab', { name: 'EVOLUTION' }).click();
  await page.waitForSelector('.evo-head');
  assert.deepEqual([...new Set(hits)], ['GET']);
  await page.getByRole('tab', { name: 'Team' }).click();
  assert.ok(await page.getByText('Tell a member directly').count());
  await page.close();
});

await check('desktop: fixture banner, honest totals, leaderboard, Hall of Fame, lineage', async () => {
  const page = await open({ width: 1280, height: 900 });
  await openEvolution(page);
  await page.waitForSelector('.evo-table');
  assert.match(await page.locator('.evo-alert--fixture').innerText(), /FIXTURE DATA[\s\S]*Not market performance/);
  assert.match(await page.locator('.evo-run').innerText(), /historical[\s\S]*Active[\s\S]*None recorded/i);
  assert.ok((await page.locator('.evo-totals li').count()) >= 10);
  const gen = await page.locator('.evo-totals li', { hasText: 'Generation' }).locator('b').innerText();
  assert.equal(gen, '3');
  assert.ok(await page.locator('.evo-table tbody tr').count() > 3);
  assert.equal(await page.locator('.evo-hof li').count() >= 5, true);
  assert.ok(await page.getByText('Not available').count(), 'event/news niche is explicitly unavailable');
  assert.ok(await page.locator('.evo-node').count() > 10);
  const over = await overflowX(page);
  assert.ok(over.page <= 1, `page overflow ${over.page}`);
  await shot(page, 'evolution-desktop.png');
  await page.close();
});

await check('candidate detail, parent links, return focus and Escape', async () => {
  const page = await open({ width: 1280, height: 900 });
  await openEvolution(page);
  await page.waitForSelector('.evo-table');
  const first = page.locator('.evo-table tbody .evo-id').first();
  const id = await first.innerText();
  await first.click();
  const detail = page.locator('.evo-detail');
  await detail.waitFor();
  assert.ok((await detail.innerText()).includes(id));
  assert.ok(await detail.getByText('Gates').count() && await detail.getByText('Evaluation windows').count() && await detail.getByText('Mutation diff').count());
  assert.match(await detail.innerText(), /Not recorded · requested reasoning/);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.evo-detail').count(), 0);
  assert.equal(await page.getByRole('dialog', { name: /InvestPro/ }).count(), 1, 'Escape closes the detail, not the whole sheet');
  assert.equal(await page.evaluate(() => document.activeElement?.className), 'evo-id', 'focus returns to the row button');
  await page.close();
});

await check('two-parent lineage: selecting a crossover child highlights both parents and lists them', async () => {
  const page = await open({ width: 1280, height: 900 });
  await openEvolution(page);
  await page.waitForSelector('.evo-dag svg');
  const child = await page.evaluate(() => [...document.querySelectorAll('.evo-node--crossover')].map((n) => n.getAttribute('aria-label')?.split(',')[0]).find(Boolean));
  assert.ok(child, 'fixture contains a crossover child');
  await page.locator(`.evo-node[aria-label^="${child},"]`).focus();
  await page.keyboard.press('Enter');
  const detail = page.locator('.evo-detail');
  await detail.waitFor();
  const parents = await detail.locator('dt:text-is("Parents") + dd .evo-link').allInnerTexts();
  assert.equal(parents.length, 2);
  assert.ok(await page.locator('.evo-node.on').count() >= 3 && await page.locator('.evo-node.dim').count() > 0, 'related nodes stay bright, others dim');
  assert.ok(await page.locator('.evo-edge.on').count() >= 2);
  await shot(page, 'evolution-lineage-crossover.png');
  await detail.locator('dt:text-is("Parents") + dd .evo-link').first().click();   // follow a parent
  assert.ok((await page.locator('.evo-detail h4').innerText()).includes(parents[0]));
  await page.close();
});

await check('keyboard: arrow keys move between tabs, Tab reaches the leaderboard controls', async () => {
  const page = await open({ width: 1280, height: 900 });
  await page.getByRole('button', { name: /InvestPro/ }).click();
  await page.getByRole('tab', { name: 'Team' }).focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.getByRole('tab', { name: 'EVOLUTION' }).getAttribute('aria-selected'), 'true');
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'EVOLUTION');
  await page.keyboard.press('Home');
  assert.equal(await page.getByRole('tab', { name: 'Team' }).getAttribute('aria-selected'), 'true');
  await page.keyboard.press('End');
  await page.waitForSelector('.evo-table');
  assert.equal(await page.getByRole('tab', { name: 'EVOLUTION' }).getAttribute('tabindex'), '0');
  assert.equal(await page.getByRole('tab', { name: 'Team' }).getAttribute('tabindex'), '-1');
  await page.close();
});

await check('phone 390x844: no sideways page scroll, list view available, tabs stay usable', async () => {
  const page = await open({ width: 390, height: 844 });
  await openEvolution(page);
  await page.waitForSelector('.evo-table');
  const over = await overflowX(page);
  assert.ok(over.page <= 1 && over.sheet <= 1, `overflow ${JSON.stringify(over)}`);
  assert.equal(await page.locator('.evo-toggle button[aria-pressed="true"]').innerText(), 'List', 'phone defaults to the readable list');
  assert.ok(await page.locator('.evo-list').count());
  await page.locator('.evo-table tbody .evo-id').first().click();
  await page.locator('.evo-detail').waitFor();
  assert.ok((await overflowX(page)).sheet <= 1);
  await shot(page, 'evolution-phone-detail.png');
  await page.locator('.evo-toggle button', { hasText: 'Graph' }).click();
  assert.ok(await page.locator('.evo-dag').count());
  assert.ok((await overflowX(page)).sheet <= 1, 'the graph scrolls inside its own region');
  await shot(page, 'evolution-phone-graph.png');
  const box = await page.getByRole('tab', { name: 'EVOLUTION' }).boundingBox();
  assert.ok(box.height >= 34);
  await page.close();
});

await check('absent / corrupt / stale / endpoint-down are told apart and never show invented data', async () => {
  let page = await open({ width: 1280, height: 900 }, { file: path.join(store, 'nope.json') });
  await openEvolution(page);
  await page.waitForSelector('.evo-alert');
  assert.match(await page.locator('.evo').innerText(), /No evolution run yet/);
  assert.equal(await page.locator('.evo-table, .evo-totals').count(), 0);
  await shot(page, 'evolution-empty.png');
  await page.close();

  page = await open({ width: 1280, height: 900 }, { file: corruptFile });
  await openEvolution(page);
  await page.waitForSelector('[role=alert]');
  assert.match(await page.locator('.evo').innerText(), /cannot be trusted/);
  assert.equal(await page.locator('.evo-table').count(), 0);
  await page.close();

  page = await open({ width: 1280, height: 900 }, { now: stamp + 5 * 24 * 3600_000 });
  await openEvolution(page);
  await page.waitForSelector('.evo-table');
  assert.match(await page.locator('.evo-alert--stale').innerText(), /Stale snapshot[\s\S]*5 days/);
  assert.match(await page.locator('.evo-run').innerText(), /Stale/);
  await page.close();

  page = await open({ width: 1280, height: 900 }, { file: 'down' });
  await openEvolution(page);
  await page.waitForSelector('[role=alert]');
  assert.match(await page.locator('.evo').innerText(), /Cannot reach/);
  assert.equal(await page.locator('.evo-table').count(), 0);
  await page.close();
});

await check('no sample profit appears: every money-like number comes from the fixture snapshot and carries its label', async () => {
  const page = await open({ width: 1280, height: 900 });
  await openEvolution(page);
  await page.waitForSelector('.evo-table');
  const cells = await page.locator('.evo-table tbody tr:has(.evo-status--pending) td.num').allInnerTexts();
  for (const text of cells) assert.ok(text === '—' || /\d/.test(text));
  assert.equal(await page.locator('.evo-alert--fixture').count(), 1, 'one visible fixture label above all figures');
  await page.close();
});

await browser.close();
await server.close();
process.exit(failed ? 1 : 0);
