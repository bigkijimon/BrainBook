import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import {mkdir} from 'node:fs/promises';import {createElement as h} from 'react';import {renderToStaticMarkup as render} from 'react-dom/server';import {pathToFileURL} from 'node:url';
await mkdir('evidence/neon-compiled',{recursive:true});
for(const [name,file] of [['signals','src/WorkSignals.tsx'],['control','src/ControlCenter.tsx']])await build({entryPoints:[file],outfile:`evidence/neon-compiled/${name}.mjs`,bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react','react-dom','react-dom/server','lucide-react','three','three/*']});
const {ProgressGauge,LiveDistribution,WorkDistribution}=await import(pathToFileURL(process.cwd()+'/evidence/neon-compiled/signals.mjs'));
const {ControlCenter}=await import(pathToFileURL(process.cwd()+'/evidence/neon-compiled/control.mjs'));
test('rendered zero measurement is accessible; unknown has no percentage or progressbar; source counts match labels',()=>{
 const zero=render(h(ProgressGauge,{progress:{percent:0,label:'0/8 frames',basis:'Fixture count'}}));assert.match(zero,/aria-valuenow="0"/);assert.match(zero,/0\/8 frames/);
 const unknown=render(h(ProgressGauge,{progress:{percent:null,label:'Not recorded',basis:'No measured progress in this source.'}}));assert.ok(!unknown.includes('progressbar')&&!unknown.includes('aria-valuenow')&&!unknown.includes('0%'));assert.match(unknown,/No measured progress/);
 const html=render(h(LiveDistribution,{rows:[{kind:'session'},{kind:'gpu'}]}));assert.match(html,/data-total="2"/);assert.equal((html.match(/data-count="1"/g)||[]).length,2);assert.ok(!html.includes('35'));assert.match(html,/not a completion score/);
 const mixed=render(h(WorkDistribution,{total:5,counts:{queued:2,attention:1,scheduled:0,completed:1,unverified:1}}));assert.match(mixed,/data-total="5"/);assert.match(mixed,/Scheduled/);assert.match(mixed,/data-count="0"/);
});
test('embedded header reports the exact selected records without duplicate Queued reclassification, retains originals/actions',()=>{
 const task={id:'fixture-original',title:'Recognizable original',status:'inbox',kanban:{board:'owner',id:'fixture-original',status:'ready'}};
 const props={work:{tasks:[task],vaultTasks:[],asks:[],focus:'all'},entry:{open:false,onToggle:()=>{},onSaved:()=>{}},actions:{openTask:()=>{},runTask:()=>{},runVault:()=>{},toggle:()=>{}},rowsOverride:[{key:'task:fixture-original',kind:'task',rank:5,title:task.title,detail:'Exact source description',boardTask:task}]};
 const html=render(h(ControlCenter,props)),header=html.match(/<header[\s\S]*?<\/header>/)[0];assert.match(header,/Showing 1 records in this category/);assert.ok(!header.includes('Queued'));assert.match(html,/Recognizable original/);assert.match(html,/Exact source description/);assert.match(html,/aria-label="Queued: Recognizable original"/);assert.match(html,/class="run-button run-queued" disabled=/);
});
