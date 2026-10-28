// Read-only probe: does the home page render the MoviePro schedule card, and with what text?
import { launchTestBrowser } from './browser.mjs';

const browser = await launchTestBrowser();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(process.argv[2] || 'http://127.0.0.1:4183/', { waitUntil: 'load' });
  await page.waitForSelector('.movie-schedule .movie-rule', { timeout: 30000 });
  console.log((await page.innerText('.movie-schedule')).slice(0, 1500));
  await page.screenshot({ path: process.argv[3] || '/tmp/movie-card.png', clip: undefined });
} finally {
  await browser.close();
}
