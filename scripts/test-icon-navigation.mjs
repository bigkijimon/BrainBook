import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {launchTestBrowser} from './browser.mjs';
const out=process.env.BRAINBOOK_ICON_EVIDENCE||'evidence/icon-navigation';
const {mkdir}=await import('node:fs/promises');await mkdir(out,{recursive:true});
const browser=await launchTestBrowser(),results=[];
try {
 for(const device of [{name:'desktop',width:1440,height:900},{name:'portrait',width:390,height:844,touch:true},{name:'landscape',width:844,height:390,touch:true}]){
  const ctx=await browser.newContext({viewport:{width:device.width,height:device.height},hasTouch:!!device.touch,isMobile:!!device.touch});
  const p=await ctx.newPage();await p.route('**/api/**',r=>r.request().method()==='GET'?r.continue():r.abort());await p.routeWebSocket('**/*',w=>w.close());
  await p.goto(process.env.BRAINBOOK_TEST_URL||'http://127.0.0.1:4199');await p.locator('#bb-boot').waitFor({state:'detached'});await p.locator('[data-team="app-dev"]').waitFor({state:'attached'});
  if(device.touch&&await p.locator('.nav-menu-btn').isVisible())await p.locator('.nav-menu-btn').tap();
  const team=p.locator('[data-team="app-dev"]');await team.scrollIntoViewIfNeeded();await team.focus();
  await p.getByRole('tooltip').filter({hasText:'AppPro'}).waitFor({state:'visible'});
  assert.equal(await team.getAttribute('aria-label'),'AppPro');
  const box=await team.boundingBox();assert.ok(box.width>=44&&box.height>=44,JSON.stringify(box));
  await p.keyboard.press('Escape');await p.getByRole('tooltip').waitFor({state:'detached'});
  if(device.touch&&!await team.isVisible())await p.locator('.nav-menu-btn').tap();
  if(device.touch)await team.tap();else await team.click();
  await p.waitForFunction(()=>document.querySelector('[data-team="app-dev"]')?.getAttribute('aria-pressed')==='true');
  if(device.touch&&!await p.locator('.area-all').isVisible())await p.locator('.nav-menu-btn').tap();
  await p.locator('.area-all').click();assert.equal(await p.locator('.area-all').getAttribute('aria-pressed'),'true');
  const bg=await p.locator('.synthwave-backdrop').evaluate(e=>({image:getComputedStyle(e).backgroundImage,pointerEvents:getComputedStyle(e).pointerEvents}));assert.ok(bg.image.includes('brainbook-synthwave-bg.png'));assert.equal(bg.pointerEvents,'none');
  const imageStatus=await p.evaluate(async()=>{const i=new Image();i.src='/brainbook-synthwave-bg.png';await i.decode();return [i.naturalWidth,i.naturalHeight];});assert.ok(imageStatus.every(x=>x>0));
  await p.screenshot({path:`${out}/${device.name}.png`});results.push({device:device.name,passed:true,box,background:bg,imageStatus});await ctx.close();
 }
} finally {await writeFile(`${out}/result.json`,JSON.stringify(results,null,2));await browser.close();}
console.log(JSON.stringify({devices:results.length,checks:'focus label, Escape, icon touch target, real team filtering/ALL, real decorative image and noninterception',passed:true}));
