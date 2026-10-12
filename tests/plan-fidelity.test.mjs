import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import vm from 'node:vm';
const source=await fs.readFile(process.env.BRAINBOOK_PLAN_SOURCE||new URL('../server.mjs',import.meta.url),'utf8');
const code=source.slice(source.indexOf('const normalizePlan ='),source.indexOf('const generateTaskPlan ='));
const ctx=vm.createContext({trim:(s,n)=>String(s||'').slice(0,n),now:()=> 'fixture'});vm.runInContext(code+'\nthis.normalize=normalizePlan;',ctx);
test('actual normalizer keeps assigned department/actor/Skills and scopes',()=>{
 const assignment={department:'app-dev',actor:'Router-selected qualified actor',skills:[{name:'test-driven-development',source:'/confirmed/skill/path'}],scope:{write:['src/file.ts']},validation:['real check']};
 const result=ctx.normalize({summary:'test',assignments:[assignment],phases:[{name:'build',intent:'bounded',steps:['inspect'],owner:'actor',exitCriteria:'verified',skills:assignment.skills,department:'app-dev',scope:assignment.scope}]},{model:'fixture',worker:'fixture',taskId:'fixture'});
 assert.deepEqual(JSON.parse(JSON.stringify(result.assignments)),[assignment]);assert.deepEqual(JSON.parse(JSON.stringify(result.phases[0].skills)),assignment.skills);assert.equal(result.phases[0].department,'app-dev');
});
test('actual normalizer keeps long Unicode constraints instead of silent cuts',()=>{
 const tail='a'.repeat(300)+'保持する末尾条件';const r=ctx.normalize({summary:tail,phases:[{steps:[tail],owner:'actor',exitCriteria:tail}],risks:[tail]},{model:'fixture'});assert.equal(r.phases[0].steps[0],tail);assert.equal(r.phases[0].exitCriteria,tail);assert.equal(r.risks[0],tail);
});
