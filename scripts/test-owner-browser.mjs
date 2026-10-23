// Actual staged app + real stylesheet at the caller-owned server. Never starts/stops a server.
// All requests remain read-only. A synthetic feed response is used only AFTER real-feed captures.
import assert from 'node:assert/strict';
import {mkdir, writeFile, readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {launchTestBrowser} from './browser.mjs';
const root=process.cwd(), out=path.join(root,'evidence');
const base=process.env.BRAINBOOK_TEST_URL || 'http://127.0.0.1:4199';
await mkdir(path.join(out,'browser-scratch'),{recursive:true});
await mkdir(path.join(out,'captures'),{recursive:true});
process.env.TMPDIR=path.join(out,'browser-scratch');
const report={status:'running',base,startedAt:new Date().toISOString(),serverOwnership:'caller PID19256; never started or stopped here',measurements:[],captures:[],failures:[]};
report.sourceHashes=Object.fromEntries(await Promise.all(['src/styles.css','src/App.tsx','src/AgentFeed.tsx'].map(async file=>[file,createHash('sha256').update(await readFile(file)).digest('hex')])));
const save=()=>writeFile(path.join(out,'continuation-browser.json'),JSON.stringify(report,null,2)+'\n');
await save();
let browser;
try { browser=await launchTestBrowser({timeout:10000}); }
catch(error){ report.status='blocked_browser_launch';report.failures.push(error.message);await save();console.error(error.message);process.exit(3); }
try {
 for(const [label,viewport] of [['desktop',{width:1440,height:900}],['mobile',{width:390,height:844}]]) {
  const context=await browser.newContext({viewport,reducedMotion:'reduce'}),page=await context.newPage();
  await page.route('**/api/**',route=>route.request().method()==='GET'?route.continue():route.abort('blockedbyclient'));
  await page.goto(base+'/#home',{waitUntil:'domcontentloaded'});
  await page.locator('.other-work-show').click();
  await page.locator('.control-search input').waitFor();
  await page.waitForTimeout(1200);
  const measurements=await page.evaluate(()=>{
   const box=s=>{const r=document.querySelector(s).getBoundingClientRect();return {height:r.height,width:r.width,x:r.x,y:r.y};};
   return {search:box('.control-search input'),searchLabel:box('.control-search'),header:box('.topbar'),nav:[...document.querySelectorAll('.app-nav .nav-pages button')].map(b=>({text:b.textContent,height:b.getBoundingClientRect().height,width:b.getBoundingClientRect().width})),overflow:document.documentElement.scrollWidth>innerWidth};
  });report.measurements.push({label,...measurements});
  const capture=path.join(out,'captures',`continuation-${label}-top.png`);
  await page.screenshot({path:capture});report.captures.push(capture);
  await page.locator('.control-search input').scrollIntoViewIfNeeded();
  const controlCapture=path.join(out,'captures',`continuation-${label}-control.png`);
  await page.screenshot({path:controlCapture});report.captures.push(controlCapture);await save();
  assert.ok(measurements.search.height>=44&&measurements.search.height<=48,`${label}: search input height ${measurements.search.height}`);
  assert.ok(measurements.searchLabel.height>=44&&measurements.searchLabel.height<=48,`${label}: search label height ${measurements.searchLabel.height}`);
  assert.ok(measurements.header.height<=100,`${label}: header height ${measurements.header.height}`);
  assert.ok(measurements.nav.every(b=>b.height>=44&&b.width>=44),`${label}: primary navigation targets`);
  assert.equal(measurements.overflow,false,`${label}: horizontal overflow`);
  await page.getByRole('button',{name:'Close Other work',exact:true}).click();
  await page.waitForFunction(()=>document.activeElement?.classList.contains('other-work-show')); // focus returns to the opener before the nav is exercised
  const nav=page.getByRole('navigation',{name:'Main navigation'});
  for(const [name,route] of [['Ideas','ideas'],['Today','tasks'],['Home','home']]) {
   const button=nav.getByRole('button',{name:new RegExp('^'+name)});await button.focus();await button.press('Enter');
   await page.waitForFunction(route=>location.hash==='#'+route,route);
   assert.equal(await button.getAttribute('aria-current'),'page');assert.equal(new URL(page.url()).hash,'#'+route);
  }
  // Exercise the native menu's web event bridge and the existing filters sidebar by keyboard.
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('brainbook:navigate',{detail:'ideas'})));
  await page.waitForFunction(()=>location.hash==='#ideas');
  // One nav: on desktop the compact toggle collapses it to icons; on phones the Menu button opens the sheet.
  const allTasks=nav.getByRole('button',{name:/^All tasks/});
  if(viewport.width>=761){const compact=page.locator('.nav-compact-btn');await compact.focus();await compact.press('Enter');await page.locator('.app-nav.is-compact').waitFor();await compact.press('Enter');await page.locator('.app-nav:not(.is-compact)').waitFor();}
  await allTasks.focus();await allTasks.press('Enter');
  await page.waitForFunction(()=>location.hash==='#tasks');assert.ok((await allTasks.getAttribute('class')).includes('active'));
  await nav.getByRole('button',{name:/^Home/}).click();
  await page.waitForFunction(()=>location.hash==='#home');
  const more=page.getByLabel('More actions');await more.focus();await more.press('Enter');
  assert.equal(await page.locator('.topbar-more').getAttribute('open'),'');
  for(const selector of ['.routine-toggle','.bell-button','.run-top','.dump-toggle','.brain-toggle','.avatar-button']) assert.ok(await page.locator('.topbar-secondary '+selector).isVisible(),`${label}: ${selector} available`);
  await more.press('Tab');assert.ok(await page.evaluate(()=>!!document.activeElement.closest('.topbar-secondary')),'Tab enters secondary actions');
  await page.keyboard.press('Escape');assert.equal(await page.locator('.topbar-more').getAttribute('open'),null);
  assert.ok(await more.evaluate(el=>el===document.activeElement),'Escape returns focus to More');
  await page.locator('.other-work-show').click();
  await page.locator('.control-search input').fill('存在しない検索語');
  assert.equal(await page.locator('.control-search input').inputValue(),'存在しない検索語');await page.locator('.control-search input').fill('');
  await page.getByRole('button',{name:'Close Other work',exact:true}).click();
  await page.waitForFunction(()=>document.activeElement?.classList.contains('other-work-show')); // focus returns to the opener before the nav is exercised
  // No fixture data is stored or submitted. Exercise the same default toast presenter as real feed.
  const raw='🧹 Pi cleanup: no test server left running; kept /Users/test/root_lock.py\nDetails:\nstdout t_123abc https://example.com/result https://example.com/log';
  await page.route('**/api/agents/feed**',route=>route.fulfill({json:{items:[{id:'presentation-only-fixture-'+label,kind:'comment',author:'pi',taskTitle:'作業の報告',text:raw,at:Math.floor(Date.now()/1000),boardName:'fixture'}]}}));
  const toast=page.locator('.toast-stack .agent-msg').filter({hasText:'Original title: 作業の報告'});await toast.waitFor({timeout:12000});
  assert.ok(!(await toast.locator('.agent-line').innerText()).includes('Pi cleanup'));
  assert.ok(await toast.getByRole('link',{name:'Open result 1',exact:true}).isVisible());
  assert.ok(await toast.getByRole('link',{name:'Open result 2',exact:true}).isVisible());
  // Toasts are deliberately transient and compact; originals live in the bell history.
  await more.click();await page.locator('.bell-button').click();
  const history=page.locator('.feed-panel .feed-agent-group').filter({hasText:'Original title: 作業の報告'});
  await history.locator(':scope > summary').click();
  const original=history.locator('.thread-items > li').filter({hasText:'stdout t_123abc'});
  await original.locator('.agent-details summary').click();
  assert.ok((await original.locator('.source-text').innerText()).includes(raw));
  await context.close();
 }
 report.status='passed';
} catch(error){report.status='failed';report.failures.push(error.stack||String(error));process.exitCode=1;}
finally{await browser.close();await save();}
console.log(`browser regression: ${report.status}; ${report.captures.length} actual captures`);
