import assert from 'node:assert/strict';import {launchTestBrowser} from './browser.mjs';import {writeFile,mkdir} from 'node:fs/promises';
const out='/Users/yuma/Documents/Hermes/work/brainbook-theme-20261010/evidence/installed-final';await mkdir(out,{recursive:true});
const b=await launchTestBrowser();try{
 for(const [name,viewport,touch] of [['desktop',{width:1440,height:900},false],['touch390',{width:390,height:844},true]]){
  const ctx=await b.newContext({viewport,hasTouch:touch,isMobile:touch});const p=await ctx.newPage();
  await p.route('**/api/**',r=>r.request().method()==='GET'?r.continue():r.abort());await p.routeWebSocket('**/*',w=>w.close());
  await p.goto('http://127.0.0.1:4183');await p.locator('#bb-boot').waitFor({state:'detached'});await p.locator('[data-team="app-dev"]').waitFor({state:'attached'});
  if(touch&&await p.locator('.rail-mobile-trigger').isVisible())await p.locator('.rail-mobile-trigger').tap();
  const team=p.locator('[data-team="app-dev"]');await team.scrollIntoViewIfNeeded();await team.focus();
  await p.getByRole('tooltip').filter({hasText:'AppPro'}).waitFor({state:'visible'});
  assert.equal(await team.getAttribute('aria-label'),'AppPro');
  await p.keyboard.press('Escape');await p.getByRole('tooltip').waitFor({state:'detached'});
  await p.screenshot({path:`${out}/${name}.png`});
  await ctx.close();
 }
 console.log(JSON.stringify({checked:['desktop','touch390'],installed:true,port:4183}));
}finally{await b.close();}
