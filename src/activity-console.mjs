import { liveWork } from './live-work.mjs';
import { nextWorkList, NEXT_WORK_RANKS } from './next-work.mjs';
const text = value => typeof value === 'string' ? value.trim() : '';
const timestamp = value => typeof value === 'number' && Number.isFinite(value) && value>0 ? value : null;
const unknownSender = value => !text(value) || /^(?:unknown|指示元未記録|Sender (?:unknown|not recorded))$/i.test(text(value));
const teamOf = (value, teams) => teams.find(t=>t.id===value || t.name===value)?.name || text(value);
function department(explicit, name, teams, sender=false) {
 if (sender && unknownSender(name)) return {label:'Department not recorded',basis:'Sender is not recorded; origin department cannot be established.'};
 if (text(explicit)) return {label:teamOf(explicit,teams),basis:'Department recorded on this activity.'};
 const memberships=teams.filter(t=>t.members?.some(m=>m.name===name));
 if(memberships.length===1)return {label:memberships[0].name,basis:'One unambiguous registered group association; not a dispatch receipt.'};
 return {label:'Department not recorded',basis:memberships.length>1?'Shared group membership does not identify this instruction’s department.':'No department recorded or unambiguous group association.'};
}
export function activityKind(handoff,tasks=[]) {
 if(handoff.activityKind==='gpu' || /^gpu-/.test(text(handoff.id)))return 'gpu';
 if(handoff.source==='session')return 'session';
 if(handoff.source==='router')return 'router';
 if(handoff.activityKind==='card' && handoff.cardIdentity?.board===handoff.board && `${handoff.cardIdentity.board}:${handoff.cardIdentity.id}`===handoff.id)return 'card';
 if(tasks.some(t=>t.kanban?.board===handoff.board && `${t.kanban.board}:${t.kanban.id}`===handoff.id))return 'card';
 return 'unlinked';
}
export function activityMetrics(handoff) {
 const p=handoff.progress, at=timestamp(p?.at);
 const basis=text(p?.basis);
 let progress={label:'Progress not recorded',basis:'No measured progress in the activity record.',at:null,percent:null};
 if(at && basis && typeof p?.percent==='number' && Number.isFinite(p.percent) && p.percent>=0 && p.percent<=100)progress={label:`${p.percent}%`,basis,at,percent:p.percent};
 else if(at && basis && typeof p?.completed==='number' && typeof p?.total==='number' && Number.isFinite(p.completed) && Number.isFinite(p.total) && p.total>0 && p.completed>=0 && p.completed<=p.total)progress={label:`${p.completed}/${p.total}${text(p.unit)?` ${text(p.unit)}`:''}`,basis,at,percent:p.completed/p.total*100};
 const e=handoff.eta, finish=timestamp(e?.finishAt), etaAt=timestamp(e?.at);
 const eta=finish && etaAt && text(e?.basis)?{label:new Date(finish*1000).toISOString(),finishAt:finish,at:etaAt,basis:text(e.basis)}:{label:'ETA not recorded',finishAt:null,at:null,basis:'No expected finish with a recorded basis. Uptime is not an estimate.'};
 return {progress,eta,stage:text(handoff.stage)||'Stage not recorded'};
}
// Structural reporting line (team roster `parent` + configured `model`), never a dispatch receipt:
// the sketch the owner drew (Bigkiji -> department top -> agent, each with its model) is built from
// this, and `basis` says which end was recorded and which was read from the roster.
const rosterMember=(name,teams)=>{for(const t of teams){const m=t.members?.find(x=>x.name===name);if(m)return m;}return null;};
export function activityFlow(row,teams=[]){
 if(!row.toKnown)return null;
 const agent=rosterMember(row.agent,teams);
 const fromName=row.fromKnown?row.from:text(agent?.parent);
 if(!fromName)return null;
 const from=rosterMember(fromName,teams);
 return {from:{name:fromName,model:text(from?.model)||null},to:{name:row.agent,model:text(agent?.model)||null},basis:row.fromKnown?'Sender recorded on the activity; models from the team roster.':'Sender read from the team roster reporting line, not a dispatch receipt.'};
}
export function projectLiveActivity(flow,teams=[],tasks=[]) {
 if(!flow?.available)return [];
 const seen=new Set();
 return (flow.handoffs || []).filter(h=>h.active===true && ['working','running'].includes(h.state)).filter(h=>{const key=`${h.source}:${h.id}`;if(seen.has(key))return false;seen.add(key);return true;}).map(h=>{
  const row=liveWork([h])[0];
  const base={...row,key:`${h.source}:${h.id}`,kind:activityKind(h,tasks),fromKnown:!unknownSender(h.from),toKnown:Boolean(text(h.to))&&!/unknown|担当者未記録/.test(h.to),
  fromDepartment:department(h.fromDepartment,h.from,teams,true),toDepartment:department(h.toDepartment || h.team,h.to,teams),
  metrics:activityMetrics(h),original:h};
  return {...base,flow:activityFlow(base,teams)};
 });
}
// Owner feedback 2026-10-13 (screenshot): the same agent (e.g. Bigkiji) running two things at once
// drew two near-identical cards back to back, each repeating the agent's name/icon/colour. The top
// pulse meter already merges an agent's concurrent activity into one coloured group with a bar per
// running item (`liveAgentDistribution` in work-signals.mjs) — this does the same grouping for the
// card list below it, so the card list and the pulse meter agree on "one agent, N things". A row
// with no recorded recipient (`toKnown` false) is never merged with another unknown row: there is
// no identity to group by, so each becomes its own one-row group (grouped under its own `key`
// instead of a shared "unknown" bucket, which would have wrongly implied they were the same actor).
export function aggregateByAgent(rows) {
 const order=[],map=new Map();
 for(const row of rows){
  const groupKey=row.toKnown?`agent:${row.agent}`:`row:${row.key}`;
  if(!map.has(groupKey)){map.set(groupKey,{key:groupKey,agent:row.agent,toKnown:row.toKnown,rows:[]});order.push(groupKey);}
  map.get(groupKey).rows.push(row);
 }
 return order.map(groupKey=>{
  const group=map.get(groupKey);
  group.rows.sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
  group.count=group.rows.length;
  return group;
 });
}
export function relationshipGraph(rows) {
 const nodes=new Map(),edges=[];
 for(const row of rows) {
  const end=(name,dept)=>{const id=JSON.stringify([name,dept.label]);if(!nodes.has(id))nodes.set(id,{id,name,department:dept.label,activities:[]});const node=nodes.get(id);if(!node.activities.includes(row.key))node.activities.push(row.key);return id;};
  const target=row.toKnown?end(row.agent,row.toDepartment):null;
  const source=row.fromKnown?end(row.from,row.fromDepartment):null;
  if(source && target)edges.push({id:row.key,source,target,activity:row.key});
 }
 return {nodes:[...nodes.values()],edges};
}
export function otherWorkInventory(work,liveRows=[],now=Date.now()) {
 const liveCardIds=new Set(liveRows.filter(r=>r.kind==='card').map(r=>r.original.id));
 const isLive=thing=>thing?.kanban && liveCardIds.has(`${thing.kanban.board}:${thing.kanban.id}`);
 const completed=[...(work.tasks||[]).filter(t=>!t.isArchived && t.status==='done').map(t=>({key:t.id,kind:'task',rank:NEXT_WORK_RANKS.next,title:t.title,detail:t.description||'',boardTask:t,noteTask:null,href:null,dueAt:null})),...(work.vaultTasks||[]).filter(n=>n.done).map(n=>({key:n.id,kind:'note',rank:NEXT_WORK_RANKS.next,title:n.text,detail:n.title||'',boardTask:null,noteTask:n,href:n.url,dueAt:null}))];
 const rows=[...nextWorkList({...work,now}),...completed].filter(r=>!isLive(r.boardTask||r.noteTask));
 const groups={queued:[],attention:[],scheduled:[],completed:[],unverified:[]};
 for(const row of rows){const t=row.boardTask||row.noteTask,status=t?.kanban?.status;
 const category=t?.status==='done'||t?.done||status==='done'?'completed':row.kind==='ask'||row.rank<=NEXT_WORK_RANKS.attention||['blocked','failed','stopped','needs_attention'].includes(status)?'attention':status==='scheduled'?'scheduled':['running','working'].includes(status)||t?.status==='working'?'unverified':'queued';
 groups[category].push(row);}
 return {rows,groups,counts:Object.fromEntries(Object.entries(groups).map(([k,v])=>[k,v.length])),total:rows.length,sources:{board:rows.filter(r=>r.kind==='task').length,notes:rows.filter(r=>r.kind==='note').length,requests:rows.filter(r=>r.kind==='ask').length}};
}
