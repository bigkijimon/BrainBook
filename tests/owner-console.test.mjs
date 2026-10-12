import test from 'node:test';
import assert from 'node:assert/strict';
import { liveWork } from '../src/live-work.mjs';
import { buildOffice } from '../office.mjs';
import { readFile } from 'node:fs/promises';
const presentation = await import('../src/owner-console.mjs').catch(() => ({ groupGoals: goals => goals.map(goal => ({ goals: [goal] })), messageSummary: text => text }));
const goal = (path, title, id, status='active') => ({path,title,status,tasks:id?[{id}]:[],links:[],steps:[]});
test('equivalent goal fixtures collapse without losing sources; shared incidental tasks and AI keywords do not merge distinct outcomes', () => {
 const goals=[goal('a','Webアプリを公開する','t1'),goal('b','Webアプリを公開する','t1'),goal('c','AI会社で売上を測る','t1'),goal('d','AI授業動画を完成させる','t2'),goal('e','Webアプリを公開する','t1','achieved')];
 const groups=presentation.groupGoals(goals);
 assert.equal(groups.length,4);
 assert.deepEqual(groups[0].goals.map(g=>g.path),['a','b']);
 assert.deepEqual(groups.flatMap(g=>g.goals.map(v=>v.path)).sort(),['a','b','c','d','e']);
});
test('live direction has explicit unknown sender and distinct handoffs even for the same card', () => {
 const row={id:'c',source:'kanban',active:true,title:'render',to:'ComfyUI',state:'working',at:1};
 assert.equal(liveWork([row])[0].from,'Sender not recorded');
 assert.equal(liveWork([{...row,from:'Steve'},{...row,from:'Maru'}]).length,2);
});
test('machine boilerplate is English summary, never invented conversation', () => {
 assert.equal(presentation.messageSummary('New task on the board.'),'New work item added.');
 assert.equal(presentation.messageSummary('No invited member answered; the meeting has no discussion result.'),'No participant replied; there is no meeting result.');
});
test('office counts unique source cards and idle profiles with model provenance', () => {
 const map={profiles:{default:'Bigkiji',hermes:'Bigkiji',idle:'Idle'},rooms:[{id:'hq',seats:['Bigkiji']},{id:'idle',seats:[]},{id:'gpu',seats:[]}],inbox:'hq',idle:'idle',gpu:'gpu',boards:{},teams:{}};
 const c={id:'c',board:'b',title:'later',assignee:'default',status:'scheduled',createdAt:1};
 const out=buildOffice({map,profiles:['default','hermes','idle'],profileModels:{default:{configured:'test-model',source:'config.yaml'}},cards:[c,c,{...c,id:'d',status:'done',completedAt:100}],now:100});
 assert.equal(out.totals.waiting,1);
 assert.equal(out.totals.delivered,1);
 const agents=out.rooms.flatMap(r=>r.agents);
 assert.equal(agents.filter(a=>a.name==='Bigkiji').length,1);
 assert.ok(agents.some(a=>a.name==='Idle'));
 assert.deepEqual(agents.find(a=>a.name==='Bigkiji').counts,{working:0,queued:1,blocked:0,done:1});
 assert.equal(agents.find(a=>a.name==='Bigkiji').models[0].configured,'test-model');
 assert.equal(agents.find(a=>a.name==='Bigkiji').models[0].observed,null);
});
test('native shell reserves the real titlebar and has no embedded Dashboard or dead menu command', async () => {
 const text=await readFile(new URL('../macos/main.swift',import.meta.url),'utf8');
 assert.ok(!text.includes('.fullSizeContentView'));
 assert.ok(!text.includes('NSSplitView'));
 assert.ok(!text.includes('Toggle Hermes Dashboard'));
});
test('goal presentation counts only completed steps; queued and blocked never become running through an old working note', () => {
 const goal={status:'active',pct:63,done:2,total:4,steps:[{done:true},{done:true},{state:'working',workingOn:'old note',kanban:{status:'ready'}},{state:'working',workingOn:'old note',kanban:{status:'blocked'}}]};
 const summary=presentation.goalSummary(goal);
 assert.equal(summary.pct,50);assert.equal(summary.working,0);assert.equal(summary.waiting,1);assert.equal(summary.queued,1);
 assert.equal(presentation.stepPresentation({state:'working',workingOn:'pipeline'}).label,'Written as working (activity unverified)');
});
