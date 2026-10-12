// Actual browser/CSS-cascade regression, isolated DOM; no server or production data.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { launchTestBrowser } from './browser.mjs';
import { themePalette, themeDeclarations } from '../src/theme-palette.mjs';
const out = process.env.BRAINBOOK_THEME_EVIDENCE || process.cwd() + '/evidence/theme';
await mkdir(out, { recursive: true });
const css = await readFile('src/styles.css', 'utf8') + '\n' + await readFile('src/investpro-evolution.css', 'utf8');
const browser = await launchTestBrowser();
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
const checks = [];
const rgb = hex => `rgb(${[1,3,5].map(i => parseInt(hex.slice(i,i+2),16)).join(', ')})`;
try {
  await page.route('**/*', route => route.abort());
  await page.setContent(`<style>${themeDeclarations()}\n${css}</style><div class="app-shell"><section class="active-work card-shell"><h3>Measured progress</h3><div class="progress-gauge"><span>50% recorded</span><div class="progress-track"><i style="--progress:.5"></i></div></div><figure class="work-distribution"><div class="distribution-track"><span class="signal-session" style="flex-grow:2"></span><span class="signal-completed" style="flex-grow:1"></span></div></figure><button class="ghost-button">Show details</button><button class="primary-button">New request</button></section><nav class="area-rail"><h3 class="rail-section-label">Groups</h3></nav><div class="evo"><ul class="evo-totals"><li><b>8</b></li></ul></div></div>`);
  for (const [selector, property, token] of [['.progress-track i','backgroundColor','pink'],['.signal-session','backgroundColor','lavender'],['.signal-completed','backgroundColor','peach'],['.ghost-button','color','text'],['.rail-section-label','color','lavender'],['.evo-totals b','color','lavender']]) {
    const actual = await page.locator(selector).evaluate((e,p) => getComputedStyle(e)[p], property);
    checks.push({selector,property,actual,expected:rgb(themePalette[token])});
    assert.equal(actual,rgb(themePalette[token]),`${selector} does not follow sunset ${token}`);
  }
  await page.locator('.ghost-button').hover();
  // The real UI intentionally transitions border color for 150ms.
  await page.waitForTimeout(180);
  const border = await page.locator('.ghost-button').evaluate(e => getComputedStyle(e).borderTopColor);
  checks.push({state:'hover',border,expected:rgb(themePalette.lavender)});
  assert.equal(border,rgb(themePalette.lavender),'hover border escaped theme');
  const buttonBackground = await page.locator('.ghost-button').evaluate(e => getComputedStyle(e).backgroundColor);
  checks.push({state:'ghost background',actual:buttonBackground,expected:rgb(themePalette.deep)});
  assert.equal(buttonBackground,rgb(themePalette.deep),'unstyled buttons fell back to platform gray');
  await page.screenshot({path:out+'/cascade.png'});
} finally {
  await writeFile(out+'/cascade-result.json',JSON.stringify({kind:'isolated actual CSS cascade; not installed app',checks},null,2));
  await browser.close();
}
console.log(`THEME_CASCADE_OK ${checks.length} actual computed-state checks`);
