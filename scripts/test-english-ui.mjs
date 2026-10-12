import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import {build} from 'esbuild';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const source=process.env.BRAINBOOK_TEST_SOURCE || process.cwd();
const helpers=await import(pathToFileURL(source+'/src/owner-console.mjs'));
const japanese=/[ぁ-んァ-ン一-龥]/;
test('English captions preserve source identities and do not invent translations for unknown work',()=>{
 assert.equal(typeof helpers.displayTitle,'function');
 const goal={path:'unchanged.md',title:'役に立つWebアプリを1つ公開して、使われ方を測る',status:'active',steps:[{id:'keep',text:'元の手順'}]};
 const before=structuredClone(goal),groups=helpers.goalPresentation([goal]);
 assert.equal(groups.groups[0].title,'Publish a web app and measure use');assert.strictEqual(groups.groups[0].goals[0],goal);assert.deepEqual(goal,before);
 assert.equal(helpers.displayTitle('翻訳を確認できない個人の依頼'),'Original title: 翻訳を確認できない個人の依頼');
 assert.equal(helpers.messageSummary('個人の報告 https://example.com/result'),'Report available. See Original.');
 assert.equal(helpers.messageSummary('🧹 Pi cleanup: stdout /Users/private/root_lock.py'),'Report available. See Original.');
 assert.equal(helpers.statusLabel('running'),'Working');assert.equal(helpers.statusLabel('never-known'),'State unknown');
});
test('distinct untranslated task titles remain recognizable, bounded and explicitly original',()=>{
 const originals=['予約画面の表示を確認する','請求書の計算結果を確認する'];
 const before=structuredClone(originals),captions=originals.map(title=>helpers.displayTitle(title));
 assert.deepEqual(captions,originals.map(title=>'Original title: '+title));
 assert.notEqual(captions[0],captions[1]);assert.deepEqual(originals,before);
 const long=helpers.displayTitle(originals[0].repeat(20),60);
 assert.ok(long.startsWith('Original title: '+originals[0]));assert.ok(long.endsWith('…'));assert.ok(long.length<=60);
 assert.equal(helpers.displayTitle('t_deadbeef 「予約画面の表示を確認する [t_cafebabe]'),'Original title: 予約画面の表示を確認する');
 assert.equal(helpers.displayTitle({id:'t_deadbeef',title:originals[0]}),'Work title unknown');
 assert.equal(helpers.displayTitle('Fix the sign-in redirect'),'Fix the sign-in redirect');
 assert.equal(helpers.displayTitle('役に立つWebアプリを1つ公開して、使われ方を測る'),'Publish a web app and measure use');
});
test('static interface copy and native route labels are English; multilingual matching rules stay intact',async()=>{
 const files=['App.tsx','AgentChat.tsx','AgentChatPanel.tsx','AgentFeed.tsx','GoalsPanel.tsx','OfficeView.tsx','ControlCenter.tsx','MeetingRoom.tsx','TeamRail.tsx','AgentFlow.tsx','owner-console.mjs','live-work.mjs','office-projection.mjs','ActivityPanel.tsx','ManagedApps.tsx','OwnerDialog.tsx','RelationshipView.tsx','activity-console.mjs'];
 const found=[];
 for(const file of files) {
  const body=await readFile(source+'/src/'+file,'utf8');
  const tree=ts.createSourceFile(file,body,ts.ScriptTarget.Latest,true,file.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.JS);
  const visit=node=>{if((ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node)||ts.isJsxText(node)||node.kind===ts.SyntaxKind.TemplateHead||node.kind===ts.SyntaxKind.TemplateMiddle||node.kind===ts.SyntaxKind.TemplateTail)&&japanese.test(node.text))found.push(file+': '+node.text);ts.forEachChild(node,visit);};visit(tree);
 }
 assert.deepEqual(found,[],'Generated UI strings must be English; source data and classifier regexes are excluded');
 const native=await readFile(source+'/macos/main.swift','utf8');
 for(const label of ['Home','Ideas','Agents','Tasks']) assert.ok(native.includes('withTitle: "'+label+'"'));
 const helper=await readFile(source+'/src/owner-console.mjs','utf8');assert.ok(helper.includes('/役に立つWebアプリ.*公開/'),'source matching must retain original-language evidence');
});
await mkdir('evidence/compiled/english',{recursive:true});
let TermsHelp;
if(existsSync(source+'/src/TermsHelp.tsx')) {
 await build({stdin:{contents:await readFile(source+'/src/TermsHelp.tsx','utf8'),resolveDir:source+'/src',sourcefile:'TermsHelp.tsx',loader:'tsx'},outfile:'evidence/compiled/english/terms.mjs',bundle:true,format:'esm',platform:'node',jsx:'automatic',external:['react','react-dom']});
 TermsHelp=(await import(pathToFileURL(process.cwd()+'/evidence/compiled/english/terms.mjs'))).TermsHelp;
}
test('plain-language glossary is folded and explains models, sessions, cards, profiles, GPU and QA without implying execution',()=>{
 assert.equal(typeof TermsHelp,'function');
 const html=renderToStaticMarkup(createElement(TermsHelp));
 assert.ok(html.includes('<summary>Terms explained</summary>')&&!/<details[^>]*\bopen/.test(html));
 for(const word of ['Model','Session','Card','Profile','GPU','QA'])assert.ok(html.includes('<dt>'+word+'</dt>'));
 for(const phrase of ['AI engine','chat or work run','tracked work item','Saved agent settings','image and video work','quality check','Set model','Seen in session','Neither proves a card used that model'])assert.ok(html.includes(phrase));
});
// Exercise the official gate's new text/source assertions against the real fixtures and renderer.
// This verifies assertion wiring without claiming browser geometry or synthetic screenshot proof.
const {default:vm}=await import('node:vm');
const {nextWorkList}=await import('../src/next-work.mjs');
const gate=await readFile(source+'/scripts/test-control-center.mjs','utf8');
const part=(body,start,end)=>body.slice(body.indexOf(start),body.indexOf(end,body.indexOf(start)));
const harness=await readFile('scripts/control-center-harness/main.tsx','utf8');
await build({stdin:{contents:harness.slice(0,harness.indexOf('createRoot(document.getElementById'))+'\nexport {work};',sourcefile:'main.tsx',loader:'tsx',resolveDir:process.cwd()+'/scripts/control-center-harness'},outfile:'evidence/compiled/english/fixture.mjs',bundle:true,format:'esm',platform:'node',jsx:'automatic',external:['react','react-dom','react-dom/client','lucide-react'],loader:{'.css':'empty'}});
await build({stdin:{contents:await readFile(source+'/src/ControlCenter.tsx','utf8')+'\nexport {NextWorkRow};',sourcefile:'ControlCenter.tsx',loader:'tsx',resolveDir:source+'/src'},outfile:'evidence/compiled/english/row.mjs',bundle:true,format:'esm',platform:'node',jsx:'automatic',external:['react','react-dom','lucide-react']});
const {work}=await import(pathToFileURL(process.cwd()+'/evidence/compiled/english/fixture.mjs'));
const {NextWorkRow}=await import(pathToFileURL(process.cwd()+'/evidence/compiled/english/row.mjs'));
const plain=html=>html.replace(/<[^>]*>/g,'').replace(/&amp;/g,'&');
test('official Control Center gate accepts English fixture rendering and retains identity, source and all measurement gates',async()=>{
 const actions={openTask:()=>{},runTask:()=>{},runVault:()=>{},toggle:()=>{}};
 const htmlRows=nextWorkList({...work,now:Date.now()}).map((row,index)=>renderToStaticMarkup(createElement(NextWorkRow,{row,index,actions,report:work.asks.find(ask=>ask.taskId===(row.boardTask?.kanban?.id || row.noteTask?.kanban?.id || (row.kind==='ask'?row.key.slice(4):'')))})));
 const rows=htmlRows.map(html=> {
  const detail=html.match(/<details class="owner-source">([\s\S]*?)<\/details>/)?.[1]||'';
  const paragraphs=[...detail.matchAll(/<p(?: class="[^"]*")?>([\s\S]*?)<\/p>/g)].map(m=>plain(m[1]));
  const raw=paragraphs.findIndex(p=>p.startsWith('Original: '));
  return {cls:html.match(/^<li class="([^"]*)"/)[1],detail:{text:plain(html.match(/<small>([\s\S]*?)<\/small>/)[1])},source:{title:paragraphs[0],legacyDetail:paragraphs[1],report:raw<0?'':paragraphs[raw].replace(/^Original: /,''),reportContext:paragraphs[raw+1]||'',collapsed:!/<details[^>]*\bopen=/.test(html)},described:[...html.matchAll(/<span class="sr-only"[^>]*>([\s\S]*?)<\/span>/g)].map(m=>({described:plain(m[1])})),controls:[...html.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)].map(m=>({cls:m[1].match(/class="([^"]*)"/)?.[1]||'',name:m[1].match(/aria-label="([^"]*)"/)?.[1]||plain(m[2]),disabled:/\bdisabled=/.test(m[1])}))};
 });
 const m={rows,text:htmlRows.map(html=>plain(html.replace(/<details\b[\s\S]*?<\/details>/g,''))).join('\n')};
 const constants=part(gate,'const ASK_SUMMARY =','// A run that stops anywhere'),report=part(gate,'const reportsAreReadable =',"// A row's text box"),gpu=part(gate,'  const gpuMatches =','  assert.ok(gpu.controls.every');
 const run=(data,code)=>vm.runInContext(constants+report+'\n'+code,vm.createContext({assert,m:data,label:'actual English fixture SSR'}));
 run(m,'reportsAreReadable(m,label);\n'+gpu);
 const corrupt=structuredClone(m);corrupt.rows.find(r=>r.source.title==='Fix the sign-in redirect that drops the return path').source.report='partial';assert.throws(()=>run(corrupt,'reportsAreReadable(m,label);'));
 const wrongGpu=structuredClone(m);wrongGpu.rows.find(r=>r.source.title==='Render lesson 04 keyframes on the GPU').source.title='Render…';assert.throws(()=>run(wrongGpu,gpu));
 const old=await readFile('evidence/english-originals/scripts/test-control-center.mjs','utf8');
 for(const [start,end] of [['const boxesFitTheirText =','// A row must not need a pointer'],['const noTooltipDependence =','// Every text pair'],['const readable =','const runningRows ='],['const runningRows =','for (const [name, viewport]'],['for (const [name, viewport]',"await check('every control"],["await check('a running row animates",'await browser.close();'],['await browser.close();','process.exit(failed ? 1 : 0);']])assert.equal(part(gate,start,end),part(old,start,end),start+' measurement gate changed');
 assert.ok(gate.includes('const TOUCH_MIN = 44;')&&gate.includes("'[object Object]'"));
});
