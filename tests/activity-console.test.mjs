import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {pathToFileURL} from 'node:url';
const root=process.env.BRAINBOOK_TEST_SOURCE||process.cwd();
const helper=await import(pathToFileURL(root+'/src/activity-console.mjs')).catch(()=>({}));
const record=(patch={})=>({id:'session:s',source:'session',board:'session',boardName:'Hermes terminal',from:'指示元未記録',to:'Bigkiji',title:'Working on Hermes',state:'working',active:true,at:1791609928,note:'',...patch});
const flow=handoffs=>({available:true,handoffs});
const teams=[{id:'hq',name:'HQ',members:[{name:'Bigkiji'}]},{id:'app-dev',name:'AppPro',members:[{name:'MiMo'},{name:'Router'}]},{id:'movie',name:'MoviePro',members:[{name:'MiMo'},{name:'ComfyUI'}]}];
test('live default accepts native sessions and GPU leases with zero working cards, excludes non-live/stale/ready',()=>{
 assert.equal(typeof helper.projectLiveActivity,'function');
 const input=[record(),record({id:'gpu-30332',source:'kanban',board:'movie',to:'ComfyUI',title:'GPU render'}),record({id:'ready',state:'queued',active:true}),record({id:'stop',state:'failed',active:false}),record({id:'stale',state:'left over',active:false})];const before=structuredClone(input);
 const rows=helper.projectLiveActivity(flow(input),teams,[]);assert.equal(rows.length,2);assert.deepEqual(rows.map(r=>r.kind),['session','gpu']);assert.deepEqual(rows.map(r=>r.from),['Sender not recorded','Sender not recorded']);assert.ok(rows.every(r=>!r.fromKnown));assert.deepEqual(input,before);assert.deepEqual(helper.projectLiveActivity({...flow(input),available:false},teams,[]),[]);
});
test('recorded direction and unique departments are shown; shared memberships and parent diagrams never identify origin',()=>{
 assert.equal(typeof helper.projectLiveActivity,'function');
 const rows=helper.projectLiveActivity(flow([record({from:'MiMo',to:'ComfyUI'}),record({id:'two',from:'Router',to:'MiMo',fromDepartment:'app-dev',toDepartment:'movie'})]),teams,[]);
 assert.equal(rows[0].fromDepartment.label,'Department not recorded');assert.match(rows[0].fromDepartment.basis,/Shared/);assert.equal(rows[0].toDepartment.label,'MoviePro');assert.equal(rows[1].fromDepartment.label,'AppPro');assert.equal(rows[1].toDepartment.label,'MoviePro');
 const missing=helper.projectLiveActivity(flow([record({fromDepartment:'hq'})]),teams,[])[0];assert.equal(missing.fromDepartment.label,'Department not recorded');
});
test('progress and ETA require recorded measurement/basis/time; unknown is not zero or uptime-derived finish',()=>{
 assert.equal(typeof helper.activityMetrics,'function');
 const no=helper.activityMetrics(record());assert.equal(no.progress.percent,null);assert.equal(no.eta.finishAt,null);assert.match(no.eta.basis,/Uptime/);
 const yes=helper.activityMetrics(record({stage:'Rendering',progress:{completed:2,total:8,unit:'frames',at:100,basis:'Job counter'},eta:{finishAt:1000,at:100,basis:'Recorded job estimate'}}));assert.equal(yes.progress.label,'2/8 frames');assert.equal(yes.progress.percent,25);assert.equal(yes.eta.finishAt,1000);assert.equal(yes.stage,'Rendering');
 for(const progress of [{percent:0},{percent:15,at:100},{percent:101,at:100,basis:'counter'},{completed:2,total:0,at:100,basis:'counter'}])assert.equal(helper.activityMetrics({progress}).progress.percent,null);
 assert.equal(helper.activityMetrics({progress:{percent:0,at:100,basis:'Measured counter'}}).progress.percent,0);
});
test('only exact board/card evidence proves a card; legacy GPU source never counts as a card',()=>{
 assert.equal(typeof helper.activityKind,'function');const tasks=[{kanban:{board:'owner',id:'same'}}];assert.equal(helper.activityKind(record({source:'kanban',id:'owner:same',board:'owner'}),tasks),'card');assert.equal(helper.activityKind(record({source:'kanban',id:'movie:same',board:'movie'}),tasks),'unlinked');assert.equal(helper.activityKind(record({source:'kanban',id:'gpu-30332',board:'movie'}),tasks),'gpu');assert.equal(helper.activityKind(record({source:'kanban',id:'owner:remote',board:'owner',activityKind:'card',cardIdentity:{board:'owner',id:'remote'}}),[]),'card');assert.equal(helper.activityKind(record({source:'kanban',id:'unknown',activityKind:'card'}),[]),'unlinked');
});
test('relationship scene uses only observed endpoints/edges, no unknown sender people; selection IDs preserve work',()=>{
 assert.equal(typeof helper.relationshipGraph,'function');
 const rows=helper.projectLiveActivity(flow([record(),record({id:'known',from:'Router',to:'MiMo'})]),teams,[]);const graph=helper.relationshipGraph(rows);
 assert.equal(graph.edges.length,1);assert.equal(graph.edges[0].id,'session:known');assert.equal(graph.nodes.length,3);assert.ok(graph.nodes.every(n=>!n.name.includes('not recorded')));assert.ok(graph.nodes.some(n=>n.name==='Bigkiji'&&n.activities.includes('session:session:s')));assert.ok(graph.nodes.some(n=>n.id===graph.edges[0].source&&n.name==='Router'));
});
test('Show contains non-live records and honest category/source totals; original action targets retained',()=>{
 assert.equal(typeof helper.otherWorkInventory,'function');
 const tasks=[{id:'ready',title:'Ready title',status:'inbox',kanban:{board:'owner',id:'ready',status:'ready'}},{id:'stopped',title:'Stopped title',status:'needs_attention',kanban:{board:'owner',id:'stopped',status:'blocked'}},{id:'scheduled',title:'Scheduled title',status:'inbox',kanban:{board:'owner',id:'scheduled',status:'scheduled'}},{id:'done',title:'Done title',status:'done'},{id:'live',title:'Live title',status:'working',kanban:{board:'owner',id:'live',status:'running'}},{id:'old',title:'Old working report',status:'working',kanban:{board:'owner',id:'old',status:'running'}}];
 const work={tasks,vaultTasks:[],asks:[{taskId:'foreign',taskTitle:'Foreign request',text:'Decision',boardName:'Other board'}],focus:'all'},before=structuredClone(work);
 const live=helper.projectLiveActivity(flow([record({id:'owner:live',board:'owner',source:'kanban'})]),teams,tasks);
 const inventory=helper.otherWorkInventory(work,live,0);assert.equal(inventory.total,6);assert.deepEqual(inventory.counts,{queued:1,attention:2,scheduled:1,completed:1,unverified:1});assert.deepEqual(inventory.sources,{board:5,notes:0,requests:1});assert.ok(!inventory.rows.some(r=>r.title==='Live title'));assert.strictEqual(inventory.groups.completed[0].boardTask,tasks[3]);assert.strictEqual(inventory.groups.queued[0].boardTask,tasks[0]);assert.deepEqual(work,before);
});
test('Home mounts the unified live box and Show popup, not an expanded separate ControlCenter or stale fallback',async()=>{
 const app=await readFile(root+'/src/App.tsx','utf8');assert.ok(app.includes('<ActivityPanel'));assert.ok(!app.includes("page === 'home' && <ControlCenter"));assert.ok(!app.includes('recent.map((handoff)'));
});
