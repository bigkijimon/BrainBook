// Read-only probe: how much always-on motion/blur does the page keep alive?
// usage: node scripts/measure-animations.mjs [url]   (default http://127.0.0.1:4183/)
// Reports running CSS animations, elements with backdrop-filter, whether <html data-lite> is set,
// and whether a WebGL canvas is mounted. Used before/after the lite-mode change (2026-10-28).
import { launchTestBrowser } from './browser.mjs';

const url = process.argv[2] || 'http://127.0.0.1:4183/';
const browser = await launchTestBrowser();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  // FIXTURE_LIVE='{"running":[]}' answers /api/agents/live with that body (a labelled fixture, not a
  // live measurement) to check that lite mode switches off again when no GPU job is running.
  const fixture = process.argv[3] || process.env.FIXTURE_LIVE;
  if (fixture) await page.route('**/api/agents/live', (route) => route.fulfill({ contentType: 'application/json', body: fixture }));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(25000); // boot overlay + one /api/agents/live poll (20 s)
  const result = await page.evaluate(() => {
    const all = [...document.querySelectorAll('*')];
    const blur = all.filter((el) => { const s = getComputedStyle(el); return (s.backdropFilter && s.backdropFilter !== 'none') || (s.webkitBackdropFilter && s.webkitBackdropFilter !== 'none'); }).length;
    const infinite = document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations === Infinity && a.playState === 'running').length;
    return {
      lite: document.documentElement.hasAttribute('data-lite'),
      runningAnimations: document.getAnimations().filter((a) => a.playState === 'running').length,
      infiniteRunning: infinite,
      backdropFilterElements: blur,
      canvases: document.querySelectorAll('canvas').length,
    };
  });
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
