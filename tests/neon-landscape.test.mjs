import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import postcss from 'postcss';
const exerciseNeonMotion=async(...args)=>(await import('../scripts/neon-scenarios.mjs')).exerciseNeonMotion(...args);

// Source cascade check, not a browser layout measurement.
function mediaMatches(query,width,height){
 return query.split(',').some(part=>[...part.matchAll(/\((min|max)-(width|height):\s*(\d+)px\)/g)].every(([,bound,axis,n])=>bound==='min'?(axis==='width'?width:height)>=+n:(axis==='width'?width:height)<=+n));
}
async function workspaceDisplay(width,height,collapsed){
 const css=postcss.parse(await readFile(new URL('../src/styles.css',import.meta.url),'utf8'));
 let result,priority=-1;
 const classes=new Set(['app-shell','workspace',...(collapsed?['sidebar-collapsed']:[])]);
 css.walkRules(rule=>{
  for(let p=rule.parent;p;p=p.parent)if(p.type==='atrule'&&p.name==='media'&&!mediaMatches(p.params,width,height))return;
  for(const selector of rule.selectors){
   if(!/^\.(?:app-shell\s+\.)?workspace(?:\.sidebar-collapsed)?$/.test(selector))continue;
   const names=[...selector.matchAll(/\.([\w-]+)/g)].map(x=>x[1]);if(!names.every(c=>classes.has(c)))continue;
   rule.walkDecls('display',d=>{if(names.length>=priority){priority=names.length;result=d.value;}});
  }
 });return result;
}
for(const collapsed of [false,true])test(`intermediate landscape restores grid reservation (collapsed=${collapsed}), preserves portrait/desktop`,async()=>{
 for(const [w,h] of [[761,800],[844,390],[900,800],[960,390]])assert.equal(await workspaceDisplay(w,h,collapsed),'grid',`${w}x${h}: rail gets its column`);
 for(const w of [360,390,430,760])assert.equal(await workspaceDisplay(w,844,collapsed),'block',`${w}: existing mobile menu`);
 assert.equal(await workspaceDisplay(1440,900,collapsed),'grid');
});

function fixture(reduced,{offscreen=true,stuck=false}={}){
 let visible=false,time=0;const events=[];
 const deco={count:async()=>1,evaluate:async fn=>{
  const text=fn.toString();
  if(text.includes('scrollIntoView')){visible=true;events.push('scroll-visible');return;}
  if(text.includes('getBoundingClientRect'))return text.includes('r.bottom<=0')?!visible:true;
  if(text.includes('getAnimations'))return [reduced?null:time];
  throw Error(text);
 },getAttribute:async()=>String(visible&&!reduced)};
 const page={locator:selector=>{assert.equal(selector,'.neon-deco');return deco;},
  waitForFunction:async(fn,arg,opts)=>{assert.ok(opts.timeout<=5000);assert.equal(await deco.getAttribute('data-playing'),arg.expected);events.push('observe-'+arg.expected);},
  waitForTimeout:async()=>{if(visible&&!reduced&&!stuck)time+=120;},
  evaluate:async fn=>{assert.match(fn.toString(),/scrollTo/);visible=!offscreen;events.push('scroll-offscreen');},
 };
 return{page,events,capture:async name=>events.push(name)};
}
for(const reduced of [false,true])test(`motion fixture ${reduced?'reduce':'normal'} scrolls before playback, checks offscreen pause and restores visibility`,async()=>{
 const f=fixture(reduced);assert.equal(await exerciseNeonMotion(f.page,reduced?'reduce':'no-preference',f.capture),true);
 assert.ok(f.events.indexOf('scroll-visible')<f.events.indexOf('observe-'+!reduced));
 assert.ok(f.events.includes('home-neon-visible'));assert.ok(f.events.includes('home-neon-offscreen'));
 assert.equal(f.events.filter(e=>e==='scroll-visible').length,2);
});
test('normal motion that does not advance still fails',async()=>{
 const f=fixture(false,{stuck:true});await assert.rejects(exerciseNeonMotion(f.page,'no-preference',f.capture),/neon actually advances/);
});
