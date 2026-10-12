import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {pathToFileURL} from 'node:url';
const source=process.env.BRAINBOOK_TEST_SOURCE || process.cwd();
const helpers=await import(pathToFileURL(source+'/src/owner-console.mjs'));
const presentation=helpers.goalPresentation || (goals=>({originalCount:goals.length,groupCount:goals.length,groups:helpers.groupGoals(goals).map(g=>({...g,kind:'objective'}))}));
const goal=(path,title,done,total)=>({path,url:'obsidian://open?file='+path,title,status:'active',words:'元の目的：'+path,reason:'固有の達成条件：'+path,createdAt:'',updatedAt:'2026-10-10',progressLog:['記録：'+path],links:[],tasks:[],done,total,next:null,steps:Array.from({length:total},(_,i)=>({id:path+':'+i,path,text:'元の手順 '+path+' '+i,done:i<done}))});
const published=goal('arbitrary/publication.md','役に立つWebアプリを1つ公開して、使われ方を測る',2,4);
const sales=goal('different/sales.md','APPを販売してアプリ開発エンジニアと稼ぐ',0,5);
const unrelated=[goal('company','LLMだけの会社で本当にお金を稼げるか確かめる',1,4),goal('education','H&S AcademyとUPCLASSの発信を回す',0,5),goal('movie','授業動画（movie-pro）を完成品として出せるようにする',1,5),goal('infra','Bigkijiが24時間、私なしで回る会社にする',1,6),goal('visualization','Hermes3Dで自分のAI会社が見えるようにする',4,5)];
test('related but distinct app objectives form one explicitly related presentation bundle, not duplicate goals',()=>{
 const p=presentation([published,...unrelated,sales]);
 assert.equal(p.originalCount,7);assert.equal(p.groupCount,6);
 const related=p.groups.find(g=>g.kind==='related');assert.ok(related);assert.ok(related.title.includes('Related goals'));
 assert.equal(related.groups.length,2);assert.notEqual(related.groups[0].key,related.groups[1].key);
 assert.deepEqual(p.groups.filter(g=>g.kind==='objective').flatMap(g=>g.goals.map(v=>v.path)),unrelated.map(g=>g.path));
});
test('topic classification uses explicit title terms; unrelated app infrastructure and education remain separate',()=>{
 assert.equal(typeof helpers.goalTopic,'function');
 assert.equal(helpers.goalTopic('Publish a web app and measure usage'),'app-portfolio');
 assert.equal(helpers.goalTopic('Sell an app as a developer'),'app-portfolio');
 assert.equal(helpers.goalTopic('アプリを公開する'),'app-portfolio');
 assert.equal(helpers.goalTopic('アプリを販売する'),'app-portfolio');
 for(const title of ['AI会社で売上を測る','授業用アプリを公開して利用を測る','アプリのインフラを公開して利用を測る','映画アプリを販売して開発する','Webアプリを監視する']) assert.equal(helpers.goalTopic(title),null,title);
 assert.equal(presentation([published]).groups[0].kind,'objective','a single app goal needs no related wrapper');
 assert.equal(presentation([published,{...published,path:'copy'}]).groups[0].kind,'objective','exact equivalents do not establish related distinct objectives');
 assert.ok(presentation([published,{...published,path:'paused-copy',status:'paused'}]).groups.every(g=>g.kind==='objective'),'different status is not a distinct objective');
});
test('projection preserves original identities, every step, status and conditions without aggregate progress or mutations',()=>{
 const inputs=[published,sales,...unrelated],before=structuredClone(inputs);
 const p=presentation(inputs),related=p.groups.find(g=>g.kind==='related');assert.ok(related);
 assert.deepEqual(inputs,before);
 const originals=p.groups.flatMap(g=>g.kind==='related'?g.groups.flatMap(v=>v.goals):g.goals);
 for(const original of inputs) {assert.ok(originals.includes(original));assert.strictEqual(originals.find(g=>g.path===original.path).steps,original.steps);}
 for(const field of ['pct','done','total','status','steps','url']) assert.ok(!(field in related),'parent must not acquire '+field);
 assert.equal(helpers.goalSummary(published).pct,50);assert.equal(helpers.goalSummary(sales).pct,0);
});
await build({stdin:{contents:await readFile(source+'/src/GoalsPanel.tsx','utf8'),sourcefile:'GoalsPanel.tsx',loader:'tsx',resolveDir:source+'/src'},outfile:'evidence/compiled/related-goals/GoalsPanel.js',bundle:true,format:'esm',platform:'node',jsx:'automatic',external:['react','react-dom','lucide-react']});
const panel=await import(pathToFileURL(process.cwd()+'/evidence/compiled/related-goals/GoalsPanel.js'));
test('real Goals renderer keeps parent display-only and originals individually actionable with separate progress and conditions',()=>{
 assert.equal(typeof panel.GoalPresentationList,'function');assert.equal(typeof panel.GoalSource,'function');
 const p=presentation([published,sales,...unrelated]),bundle=p.groups.find(g=>g.kind==='related');
 const html=renderToStaticMarkup(createElement(panel.GoalPresentationList,{presentation:p,open:bundle.key,onOpen:()=>{},all:true,renderSource:g=>createElement(panel.GoalSource,{key:g.path,goal:g,busy:null,onToggle:async()=>{},run:async()=>{},setStatus:async()=>{}})}));
 const parent=html.slice(0,html.indexOf('<ul class="goal-sources">'));
 assert.ok(parent.includes('Related goals')&&!parent.includes('%'));assert.ok(!parent.includes('Pause')&&!parent.includes('実行')&&!parent.includes('Mark achieved'));
 for(const g of [published,sales]) {assert.ok(html.includes(g.path)&&html.includes(g.reason)&&html.includes(g.words));for(const s of g.steps) assert.ok(html.includes(s.text));assert.ok(html.includes(g.url));}
 assert.ok(html.includes('50% (2/4 Done)')&&html.includes('0% (0/5 Done)'));
 const readable=html.replace(/<[^>]+>/g,'');
 assert.equal((readable.match(/Pause/g)||[]).length,2);assert.equal((readable.match(/Mark achieved/g)||[]).length,2);
 const count=renderToStaticMarkup(createElement(panel.GoalCounts,{originalCount:8,unarchivedCount:7,groupCount:6}));
 assert.ok(count.includes('Original goals: 8')&&count.includes('Unachieved: 7')&&count.includes('Display groups: 6'));
 const sourceText=readFile(source+'/src/GoalsPanel.tsx','utf8');return sourceText.then(text=>assert.ok(text.includes('goalPresentation(')&&text.includes('<GoalCounts')));
});

test('original step and individual status callbacks receive their exact original objects; bundle toggles display only',async()=>{
 const calls=[];
 const walk=(node)=>Array.isArray(node)?node.flatMap(walk):node && typeof node==='object'?[node,...walk(node.props?.children)]:[];
 for(const original of [published,sales]) {
  const tree=panel.GoalSource({goal:original,busy:null,onToggle:async step=>calls.push(['toggle',step]),run:async step=>calls.push(['run',step]),setStatus:async (g,status)=>calls.push([status,g])});
  const buttons=walk(tree).filter(n=>n.type==='button');
  await buttons.find(n=>n.props.className==='goal-check').props.onClick();
  assert.strictEqual(calls.at(-1)[1],original.steps[0]);
  buttons.find(n=>n.props.className==='goal-go').props.onClick();
  assert.strictEqual(calls.at(-1)[1],original.steps.find(s=>!s.done));
  const actions=buttons.filter(n=>n.props.className==='capture-btn');
  actions[0].props.onClick();assert.deepEqual(calls.at(-1),['achieved',original]);
  actions[1].props.onClick();assert.deepEqual(calls.at(-1),['paused',original]);
 }
 const p=presentation([published,sales]),key=p.groups[0].key;
 const before=calls.length;
 const tree=panel.GoalPresentationList({presentation:p,open:null,onOpen:value=>calls.push(['display',value]),all:true,renderSource:()=>null});
 walk(tree).find(n=>n.type==='button').props.onClick();
 assert.equal(calls.length,before+1);assert.deepEqual(calls.at(-1),['display',key]);
});
