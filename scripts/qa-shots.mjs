// Screenshots of the installed app for owner acceptance: compact nav on each page + the products card.
import { mkdirSync } from 'node:fs';
import { launchTestBrowser } from './browser.mjs';
const base = process.argv[2] || 'http://127.0.0.1:4183';
const dir = process.argv[3] || 'qa-shots';
mkdirSync(dir, { recursive: true });
const browser = await launchTestBrowser();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
for (const route of ['home', 'ideas', 'data']) {
  await page.goto(`${base}/#${route}`, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  if (!(await page.locator('.app-nav.is-compact').count())) await page.locator('.nav-compact-btn').click();
  await page.waitForTimeout(400);
  await page.locator('nav.app-nav').screenshot({ path: `${dir}/nav-compact-${route}.png` });
}
await page.goto(`${base}/#home`, { waitUntil: 'load' });
await page.waitForTimeout(3500);
const card = page.locator('.products-overview');
await card.scrollIntoViewIfNeeded();
await card.screenshot({ path: `${dir}/products-card.png` });
console.log(await card.innerText());
console.log('icon naturalWidth:', await page.evaluate(() => [...document.querySelectorAll('.products-overview-product-icon')].map((i) => `${i.src.split('/').slice(2, 4).join('/')}:${i.naturalWidth}`)));
await browser.close();
