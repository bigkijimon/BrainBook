import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import {mkdir,readFile} from 'node:fs/promises';import {createElement as h} from 'react';import {renderToStaticMarkup as render} from 'react-dom/server';import {pathToFileURL} from 'node:url';
await mkdir('evidence/compiled/acceptance',{recursive:true});
for(const [name,file] of [['activity','src/ActivityPanel.tsx'],['work','src/ControlCenter.tsx'],['apps','src/ManagedApps.tsx']])await build({entryPoints:[file],outfile:`evidence/compiled/acceptance/${name}.mjs`,bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react','react-dom','react-dom/server','lucide-react','three','three/*']});
const {ActivityConsole}=await import(pathToFileURL(process.cwd()+'/evidence/compiled/acceptance/activity.mjs'));
const {ControlCenter}=await import(pathToFileURL(process.cwd()+'/evidence/compiled/acceptance/work.mjs'));
const {ManagedApps}=await import(pathToFileURL(process.cwd()+'/evidence/compiled/acceptance/apps.mjs'));
const {otherWorkInventory}=await import('../src/activity-console.mjs');
const props={teams:[],entry:{open:false,onToggle:()=>{},onSaved:()=>{}},actions:{openTask:()=>{},runTask:()=>{},runVault:()=>{},toggle:()=>{}},notes:0,loading:false,problem:false,sectionRef:null,workOpen:false,onCloseWork:()=>{},onOpenWork:()=>{}};
const input=JSON.parse(await readFile('../latest-flow-schema.json','utf8'));
const work={tasks:[{id:'queued',title:'Distinct queued work',status:'inbox',kanban:{id:'queued',board:'owner',status:'ready'}},{id:'done',title:'Completed original work',status:'done'}],vaultTasks:[],asks:[],focus:'all'};
test('real caller schema renders only live recipients with English unknowns, no stale fallback, no false progress/ETA/cards or35jobs',()=>{
 const html=render(h(ActivityConsole,{...props,work,flow:{...input,available:true,readAt:100}}));
 assert.ok(html.includes('Active Agents')&&html.includes('Sender not recorded')&&html.includes('Bigkiji')&&html.includes('ComfyUI'));
 for(const absent of ['Distinct queued work','Completed original work','35 jobs','35 items','0%','指示元未記録','next-work-list','control-search'])assert.ok(!html.includes(absent),absent);
 assert.ok(html.includes('Session (outside cards)')&&html.includes('GPU activity (outside cards)')&&html.includes('Stage not recorded')&&html.includes('Not recorded (no estimate)'));
 assert.ok(html.includes('Show (2)')&&html.includes('0 recorded instruction links'));
 const no=render(h(ActivityConsole,{...props,work,flow:{...input,handoffs:input.handoffs.filter(v=>!v.active),available:true,readAt:100}}));assert.ok(no.includes('No current live work recorded.'));assert.ok(!no.includes('live-work-item'));
});
test('actual popup row renderer preserves completed/queued originals and actions, completed items cannot offer Run',()=>{
 const inventory=otherWorkInventory(work,[],0),html=render(h(ControlCenter,{...props,work,rowsOverride:inventory.rows}));assert.ok(html.includes('Distinct queued work')&&html.includes('Completed original work'));assert.ok(html.includes('Original title: Completed original work'));assert.ok(html.includes('Source: Task board'));assert.ok(!html.includes('Run: Completed original work'));
 const doneNote={id:'line',text:'Original completed checklist',title:'Original note title',done:true,url:'obsidian://open?vault=owner&amp;file=original.md'};
 const completed=otherWorkInventory({...work,tasks:[],vaultTasks:[doneNote]},[],0);
 const noteHtml=render(h(ControlCenter,{...props,work:{...work,tasks:[],vaultTasks:[doneNote]},rowsOverride:completed.rows}));assert.ok(noteHtml.includes('Reopen Original completed checklist'));assert.ok(noteHtml.includes('obsidian://open'));assert.ok(!noteHtml.includes('Run: Original completed checklist'));
});
test('complete actual registry has functioning app-detail triggers, labelled app/group distinction and unverified health',async()=>{
 const inventory=JSON.parse(await readFile('evidence/managed-app-inventory.json','utf8'));const html=render(h(ManagedApps,{inventory}));assert.ok(html.includes(`Managed Apps <b>${inventory.count}</b>`));assert.equal((html.match(/data-app=/g)||[]).length,inventory.count);assert.equal((html.match(/aria-haspopup="dialog"/g)||[]).length,inventory.count+1);assert.ok(html.includes('Igataya')&&!html.includes('IgatayaPro'));assert.ok(html.includes(`Show registry (${inventory.count})`));
});
