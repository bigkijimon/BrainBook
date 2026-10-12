import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {buildOffice} from '../office.mjs';
const map=JSON.parse(fs.readFileSync(new URL('../office-map.json',import.meta.url),'utf8'));
test('native security board/profile sit in one explicit unassigned department room',()=>{
 const view=buildOffice({map,profiles:['securitypro'],cards:[{id:'fixture-only',board:'securitypro',assignee:null,title:'Synthetic',status:'ready'}]});
 const room=view.rooms.find(r=>r.group==='SecurityPro');assert.ok(room);assert.equal(room.zone,null);assert.equal(view.rooms.filter(r=>r.group==='SecurityPro').length,1);assert.equal(room.board.waiting[0].id,'fixture-only');assert.ok(room.agents.some(a=>a.name==='SecurityPro'));assert.ok(!map.teams.securitypro);assert.ok(!['z-kitchen','z-image'].includes(room.zone));
});
