import { chromium } from 'playwright-core';
const out = '/Users/yuma/Documents/Hermes/.hermes/cache/scratch/bb-phone-after';
const url = process.argv[2] || 'http://127.0.0.1:4199/';
const prefix = process.argv[3] || 'r4';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await p.goto(url, { waitUntil: 'load' }); await p.waitForSelector('.topbar'); await p.waitForTimeout(3000);
const total = await p.evaluate(() => document.documentElement.scrollHeight);
let i = 0;
for (let y = 0; y < total; y += 700, i++) {
  await p.evaluate((y) => window.scrollTo(0, y), y); await p.waitForTimeout(350);
  await p.screenshot({ path: `${out}/${prefix}-390x844-${String(i).padStart(2, '0')}.png` });
}
const board = await p.evaluate(() => { const el = document.querySelector('.board'); el?.scrollIntoView({ block: 'start' }); return el ? Math.round(el.getBoundingClientRect().top + scrollY) : -1; });
await p.waitForTimeout(350); await p.screenshot({ path: `${out}/${prefix}-390x844-board.png` });
console.log(`phone: ${i} steps over ${total}px, board at y=${board}`);
const d = await b.newPage({ viewport: { width: 1280, height: 900 } });
await d.goto(url, { waitUntil: 'load' }); await d.waitForSelector('.topbar'); await d.waitForTimeout(3000);
await d.screenshot({ path: `${out}/${prefix}-1280x900.png` });
await b.close();
