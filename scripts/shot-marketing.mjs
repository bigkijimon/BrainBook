// Screenshot the BrainBook home top bar (team tabs) so the CreativePro Marketing tab can be
// compared with its neighbours by eye. Run: node scripts/shot-marketing.mjs [outDir]
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { launchTestBrowser } from './browser.mjs';

const OUT = process.argv[2] || fileURLToPath(new URL('../evidence/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const URL_ = process.env.BRAINBOOK_URL || 'http://127.0.0.1:4183/';

const browser = await launchTestBrowser({ env: { ...process.env, BRAINBOOK_TEST_CHROMIUM: process.env.BRAINBOOK_CHROME } });
for (const [name, viewport] of [['marketing-1440', { width: 1440, height: 900 }], ['marketing-390', { width: 390, height: 844 }]]) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
  await page.goto(URL_, { waitUntil: 'networkidle' });
  await page.waitForSelector('.team-item, .area-item', { timeout: 20000 });
  await page.waitForTimeout(1200);
  const tabs = await page.locator('.team-item span, .area-all span').allTextContents();
  console.log(`${name}: ${tabs.join(' | ')}`);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  // Narrow layouts scroll the tab strip, so scroll CreativePro Marketing next to its neighbours
  // before judging that it looks like them.
  const strip = page.locator('.app-nav').first();
  if (await strip.evaluate((el) => el.scrollWidth > el.clientWidth + 4)) {
    await page.locator('.team-item').filter({ has: page.locator('[aria-label="CreativePro Marketing"]') }).first().evaluate((el) => el.scrollIntoView({ block: 'nearest', inline: 'center' }));
    await page.waitForTimeout(400);
    console.log(`${name}-scrolled: CreativePro Marketing brought into view among ${tabs.join(' | ')}`);
    await page.screenshot({ path: `${OUT}/${name}-scrolled.png` });
  }
  await page.close();
}
// The team sheet is the second place a group shows up: click the tab and the whole
// crew (same as InvestPro) must come out with the CreativePro Marketing label.
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await page.goto(URL_, { waitUntil: 'networkidle' });
  await page.waitForSelector('.team-item', { timeout: 20000 });
  await page.locator('.team-item').filter({ has: page.locator('[aria-label="CreativePro Marketing"]') }).first().click();
  await page.waitForSelector('.team-sheet', { timeout: 10000 });
  await page.waitForTimeout(400);
  const head = await page.locator('.team-sheet header').innerText();
  const crew = (await page.locator('.team-tree .member-frame strong').allTextContents()).map((t) => t.split('\n')[0]);
  const roles = await page.locator('.team-roles em').allTextContents();
  console.log(`team sheet: ${head.replace(/\n/g, ' | ')}`);
  console.log(`team sheet crew: ${crew.join(' | ')}`);
  console.log(`team sheet role files: ${roles.slice(0, 6).join(', ')}${roles.length > 6 ? ` … (${roles.length})` : ''}`);
  await page.screenshot({ path: `${OUT}/marketing-team-sheet.png` });
  await page.close();
}
// The office view is a row list, so its CreativePro room is proved by its own row.
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await page.addInitScript(() => localStorage.setItem('brainbook.office', 'open'));
  await page.goto(URL_, { waitUntil: 'networkidle' });
  await page.waitForSelector('.office-row[data-zone="z-text"]', { timeout: 30000 });
  console.log(`office room z-text: ${(await page.locator('.office-row[data-zone="z-text"]').innerText()).replace(/\n/g, ' | ')}`);
  await page.locator('.office-row[data-zone="z-text"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  await page.locator('.office').screenshot({ path: `${OUT}/marketing-office-room.png` });
  await page.close();
}
await browser.close();
console.log(`Wrote ${OUT}/marketing-1440.png, marketing-390.png and marketing-office-room.png`);