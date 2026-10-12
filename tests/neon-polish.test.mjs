import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const source=process.env.BRAINBOOK_TEST_SOURCE||new URL('../',import.meta.url).pathname;
const signals=await import(source+'src/work-signals.mjs').catch(()=>({}));
test('live distribution counts activity records, never historical jobs or card totals',()=>{
 assert.equal(typeof signals.liveDistribution,'function');
 const rows=[{kind:'session'},{kind:'gpu'},{kind:'session'},{kind:'unlinked'}];
 const data=signals.liveDistribution(rows);assert.equal(data.total,4);assert.equal(data.segments.reduce((n,s)=>n+s.count,0),4);assert.equal(data.segments.find(s=>s.key==='session').count,2);assert.ok(data.segments.every(s=>s.count>0));assert.equal(signals.liveDistribution([]).total,0);
});
test('unknown progress is distinct from measured zero and malformed values never become progress',()=>{
 assert.equal(typeof signals.progressGauge,'function');
 assert.deepEqual(signals.progressGauge(null),{known:false,percent:null});
 assert.deepEqual(signals.progressGauge({percent:0}),{known:true,percent:0});
 for(const value of [NaN,Infinity,-1,101,'20'])assert.equal(signals.progressGauge({percent:value}).known,false);
});
test('embedded Other work does not reclassify category counts with legacy queued prose',async()=>{
 const code=await readFile(source+'src/ControlCenter.tsx','utf8');assert.match(code,/rowsOverride.*Showing.*records/s);assert.match(code,/!rowsOverride\s*&&\s*counts.needYou/);
});
test('neon is bounded, paused by visibility and reduced motion; interactive feedback is interruptible',async()=>{
 const css=await readFile(source+'src/styles.css','utf8');const component=await readFile(source+'src/NeonAccent.tsx','utf8');
 assert.match(component,/IntersectionObserver/);assert.match(component,/visibilitychange/);assert.match(component,/disconnect/);
 assert.match(css,/neon-deco\[data-playing="true"\]/);assert.match(css,/scale\(0\.96\)/);assert.match(css,/cubic-bezier\(0\.2, 0, 0, 1\)/);assert.match(css,/prefers-reduced-motion:reduce/);
});
test('ARIA modal owns Tab/Escape before sidebar, skips nested owner, restores focus and cleans listener; first-run cannot dismiss',async()=>{
 const {ownModalFocus}=await import('../src/modal-focus.mjs');let closed=0,restored=0,prevented=0;const listeners=new Map();
 const opener={isConnected:true,focus:()=>restored++,closest:()=>null};const doc={activeElement:opener,addEventListener:(k,fn)=>listeners.set(k,fn),removeEventListener:(k,fn)=>{if(listeners.get(k)===fn)listeners.delete(k);}};
 const node={querySelectorAll:()=>items,contains:e=>items.includes(e),focus:()=>{doc.activeElement=node;},closest:()=>node};
 const items=[0,1].map(()=>({getClientRects:()=>[1],closest:()=>node,focus(){doc.activeElement=this;}}));
 const event=(key,shiftKey=false)=>({key,shiftKey,preventDefault:()=>prevented++,stopPropagation:()=>{}});
 let cleanup=ownModalFocus(node,()=>closed++,{document:doc});assert.equal(doc.activeElement,items[0]);listeners.get('keydown')(event('Tab',true));assert.equal(doc.activeElement,items[1]);listeners.get('keydown')(event('Tab'));assert.equal(doc.activeElement,items[0]);
 doc.activeElement={closest:()=>({})};listeners.get('keydown')(event('Escape'));assert.equal(closed,0,'nested modal retains Escape');doc.activeElement=items[0];listeners.get('keydown')(event('Escape'));assert.equal(closed,1);cleanup();assert.equal(restored,1);assert.equal(listeners.size,0);assert.equal(prevented,3);
 cleanup=ownModalFocus(node,()=>closed++,{document:doc,dismiss:false});listeners.get('keydown')(event('Escape'));assert.equal(closed,1);cleanup();
});
