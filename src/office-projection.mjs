// Read-only view projection. Actor identity comes from names/profile associations, never personas or task prose.
const key = value => String(value || '').trim().toLowerCase();
const emptyCounts = () => ({working:0,queued:0,blocked:0,done:0});
export function projectOffice(office, flow, teams=[], selectedTeam=null) {
 const allRooms=office?.rooms || [], known=new Map(), aliases=new Map();
 const remember=(name,room='Room unknown',agent={})=>{
  if (!key(name)) return;
  const id=aliases.get(key(name)) || key(name);
  if (!known.has(id)) known.set(id,{name,room,profiles:[],models:[],tasks:[],counts:emptyCounts(),state:'unknown',...agent,activity:[],active:null,lastActivityAt:null});
  aliases.set(key(name),id);
  for(const profile of agent.profiles || []) aliases.set(key(profile),id);
  return id;
 };
 for(const room of allRooms) for(const agent of room.agents) remember(agent.name,room.label,agent);
 for(const team of teams) for(const member of team.members || []) remember(member.name,'Team roster');
 for(const actor of flow?.agents || []) remember(actor.name);
 // A team recipient is not an actor. Keep actual recipient/service identities even if absent from Office.
 for(const handoff of flow?.handoffs || []) if(handoff.recipientKind!=='team' && handoff.to) remember(handoff.to);
 const canonical=name=>aliases.get(key(name)) || key(name);
 const cardKeys=new Set(allRooms.flatMap(r=>[...r.board.working,...r.board.waiting,...r.board.stopped,...r.shelf,...r.agents.flatMap(a=>a.tasks)]).map(c=>`${c.board}:${c.id}`));
 const activeFlags=new Set((flow?.agents || []).filter(a=>a.active).map(a=>canonical(a.name)));
 const seen=new Set();
 for(const handoff of flow?.handoffs || []) {
  if(!handoff.active || handoff.recipientKind==='team') continue;
  const agent=known.get(canonical(handoff.to));if(!agent) continue;
  const receiptKey=`${canonical(handoff.to)}:${handoff.source}:${handoff.id}`;
  if(seen.has(receiptKey))continue;seen.add(receiptKey);
  // Source 'kanban' also carries GPU processes in the existing feed. Only exact card identity proves a card.
  const kind=handoff.source==='session'?'session':cardKeys.has(handoff.id)?'card':handoff.source==='router'?'router':'unlinked';
  agent.activity.push({...handoff,kind});
  if(Number.isFinite(handoff.at))agent.lastActivityAt=Math.max(agent.lastActivityAt || 0,handoff.at);
  activeFlags.add(canonical(handoff.to));
 }
 for(const [id,agent] of known) agent.active=flow?.available ? activeFlags.has(id) : null;
 const selected=selectedTeam ? teams.find(t=>t.id===selectedTeam) : null;
 const rooms=selectedTeam ? allRooms.filter(r=>(r.teams || []).includes(selectedTeam)) : allRooms;
 const scopedMembers=new Set([...rooms.flatMap(r=>r.agents.map(a=>canonical(a.name))),...(selected?.members || []).map(m=>canonical(m.name))]);
 const roomIds=new Set(rooms.map(r=>r.id));
 const scopedCards=[...new Map([...rooms.flatMap(r=>[...r.board.working,...r.board.waiting.filter(c=>c.room===r.id),...r.board.stopped,...r.shelf]),...[...known.values()].flatMap(a=>a.tasks.filter(c=>roomIds.has(c.room)))].map(c=>[`${c.board}:${c.id}`,c])).values()];
 const scopedKeys=new Set(scopedCards.map(c=>`${c.board}:${c.id}`));
 const agents=[...known.entries()].filter(([id])=>!selectedTeam || scopedMembers.has(id)).map(([,agent])=>{
  if(!selectedTeam)return agent;
  const tasks=agent.tasks.filter(c=>scopedKeys.has(`${c.board}:${c.id}`));
  const counts=emptyCounts();for(const c of tasks) {
   if(['running','working'].includes(c.status))counts.working++;
   else if(['blocked','failed','stopped','needs_attention'].includes(c.status))counts.blocked++;
   else if(['done','completed','complete'].includes(c.status))counts.done++;
   else counts.queued++;
  }
  return {...agent,tasks,counts};
 }).sort((a,b)=>Number(b.active===true)-Number(a.active===true) || b.counts.working-a.counts.working || b.counts.blocked-a.counts.blocked || b.counts.queued-a.counts.queued || a.name.localeCompare(b.name));
 const cardTotals=selectedTeam ? {working:rooms.reduce((n,r)=>n+r.board.working.length,0),waiting:rooms.reduce((n,r)=>n+r.board.waiting.filter(c=>c.room===r.id).length,0),stopped:rooms.reduce((n,r)=>n+r.board.stopped.length,0),delivered:rooms.reduce((n,r)=>n+r.delivered,0),profiles:new Set(agents.flatMap(a=>a.profiles)).size} : office?.totals;
 return {rooms,agents,cardTotals,activeActors:flow?.available?agents.filter(a=>a.active===true).length:null,selected,scopeLabel:selectedTeam ? selected?.name || 'Team unknown' : 'All teams',roomAssociationKnown:!selectedTeam || rooms.length>0};
}
