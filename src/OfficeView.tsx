// Read-only Hermes-wide console. Counts come from unique board/card identities in office.mjs.
import { StateNote } from './ui';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Building2, ChevronDown } from 'lucide-react';
import { memberTone } from './TeamRail';
import { personaOf } from './agentRoster';
import { useAgentFlow } from './AgentFlow';
import { projectOffice, type OfficeCard as Card, type OfficeData as Office, type OfficeFlow, type ProjectedAgent, type TeamAssociation } from './office-projection.mjs';
import { VoiceCommand } from './VoiceInput';
import { messageSummary, resultLinks, displayTitle, shortTitle, statusLabel } from './owner-console.mjs';

export const OFFICE_REFRESH = 'brainbook:office-refresh';

function TaskDetails({card}:{card:Card}) {
  return <details className="console-task">
    <summary>{displayTitle(card.title)} <em>{statusLabel(card.status)}</em></summary>
    <p>Original title: {card.title}</p>{card.assignmentSource==='latest_report_author' && <p>Latest reporter; current worker not recorded.</p>}
    {card.reason && <><p>Summary: {messageSummary(card.reason)}</p><details><summary>Original stop reason</summary><p className="source-text">{card.reason}</p></details></>}
    {card.summary && <p className="source-text">{card.summary}</p>}
    {resultLinks(`${card.summary || ''} ${card.reason || ''}`).map(url=><a key={url} href={url} target="_blank" rel="noreferrer">Open result</a>)}
    <details><summary>Source</summary><small>{card.board} · {card.id} · {card.who || 'Worker unknown'}</small></details>
  </details>;
}
/** The roster feed (/api/office), polled while visible. Shared by the Data page's agent section. */
export function useOfficeData() {
 const [office,setOffice]=useState<Office|null>(null);
 const [error,setError]=useState('');
 useEffect(()=>{
  let alive=true;
  const load=async()=>{
   try {
    const response=await fetch('/api/office',{cache:'no-store'});const data=await response.json();
    if (!response.ok || data.error || !Array.isArray(data.rooms)) throw new Error('Agent status unavailable.');
    if(alive){setOffice(data);setError('');}
   }catch{if(alive)setError('Update failed. Showing the last report.');}
  };
  void load();const timer=window.setInterval(load,20000);
  const visible=()=>{if(document.visibilityState==='visible')void load();};
  window.addEventListener(OFFICE_REFRESH,load);document.addEventListener('visibilitychange',visible);
   return()=>{alive=false;window.clearInterval(timer);window.removeEventListener(OFFICE_REFRESH,load);document.removeEventListener('visibilitychange',visible);};
 },[]);
 return {office,error};
}

export function OfficeView({remote=false, teams=[], selectedTeam=null, onAll=()=>{}, onOpenHome=()=>{}, dataRow}:{onOpenHome?:()=>void;remote?:boolean;teams?:TeamAssociation[];selectedTeam?:string|null;onAll?:()=>void;dataRow?:(agent:ProjectedAgent)=>ReactNode}) {
 const flow=useAgentFlow(false);
 const {office,error}=useOfficeData();
 return <OfficeStatus office={office} flow={flow} teams={teams} selectedTeam={selectedTeam} onAll={onAll} onOpenHome={onOpenHome} remote={remote} error={error} dataRow={dataRow}/>;
}

export function OfficeStatus({office,flow,teams,selectedTeam=null,onAll,onOpenHome=()=>{},remote=false,error='',dataRow}:{onOpenHome?:()=>void;office:Office|null;flow:OfficeFlow;teams:TeamAssociation[];selectedTeam?:string|null;onAll:()=>void;remote?:boolean;error?:string;dataRow?:(agent:ProjectedAgent)=>ReactNode}) {
 const [view,setView]=useState<'agents'|'teams'>('agents');
 const [all,setAll]=useState(false);
 const [query,setQuery]=useState('');
 useEffect(()=>{setAll(false);setQuery('');},[selectedTeam]);
 const projection=useMemo(()=>projectOffice(office,flow,teams,selectedTeam),[office,flow,teams,selectedTeam]);
 const {agents,rooms}=projection;
 const filtered=agents.filter(a=>`${a.name} ${personaOf(a.name)} ${a.room} ${a.profiles.join(' ')}`.toLowerCase().includes(query.toLowerCase()));
 const totals=projection.cardTotals;
 return <section id="agent-status" className="office card-shell owner-console" aria-labelledby="office-heading">
  <header className="console-heading"><h3 id="office-heading"><Building2 size={16}/> Agent status <b>{agents.length}</b></h3><small>{office?.readAt ? `${new Date(office.readAt*1000).toLocaleTimeString('en-GB')} read` : 'Loading'}</small></header>
  <p className="console-totals">Scope: {projection.scopeLabel} (agents and associated room cards){selectedTeam && <button type="button" className="console-more" onClick={onAll}>Reset to ALL</button>}</p>
  {selectedTeam && <p className="console-totals">Only agent status is filtered. Goals, next work and chat remain company-wide. Shared members show company-wide activity.</p>}
  {!projection.roomAssociationKnown && <p role="status">Room association unknown. Unassigned cards are not added to this team.</p>}
  <p className="console-totals">Who is running right now lives on Home. <button type="button" className="console-more" onClick={onOpenHome}>Open Active Agents</button></p>
  {error && <StateNote kind="error">{error}</StateNote>}
  {totals && <p className="console-totals">Cards: Working {totals.working} · Queued {totals.waiting} · Stopped {totals.stopped} · Done {totals.delivered} (7 days)</p>}
  <div className="console-tools"><div role="group" aria-label="Status view"><button type="button" aria-pressed={view==='agents'} onClick={()=>{setView('agents');setAll(false);}}>Agents</button><button type="button" aria-pressed={view==='teams'} onClick={()=>{setView('teams');setAll(false);}}>Teams</button></div><label className="console-search"><span className="sr-only">Search agents</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search name or team"/></label></div>
  {view==='agents' ? <ul className="console-list">{filtered.slice(0,all||query ? undefined : 5).map(agent=><li key={agent.name}>
   <details className="console-agent"><summary><span className="console-person" style={{color:memberTone(agent.name)}}><b>{personaOf(agent.name)}</b><small>{agent.name===personaOf(agent.name)?agent.room:`${agent.name} · ${agent.room}`}</small></span><span className="console-agent-state"><small>{agent.active===null?'Activity unverified':agent.active?'Active (activity record)':'No activity recorded'}{agent.lastActivityAt ? ` · Last recorded ${new Date(agent.lastActivityAt*1000).toLocaleTimeString('en-GB')}` : ' · Activity time unknown'}{agent.activity.length ? ` · Sessions ${agent.activity.filter(a=>a.kind==='session').length} · Matched cards ${agent.activity.filter(a=>a.kind==='card').length} · Other / unmatched ${agent.activity.filter(a=>a.kind==='router'||a.kind==='unlinked').length}` : ''}</small><small>Set model: {shortTitle(agent.models.find(m=>m.configured)?.configured || "Model unknown",42)} · Seen in session: {shortTitle(agent.models.find(m=>m.observed)?.observed || "Not recorded",42)}</small><span className="console-counts">Cards: Working {agent.counts.working} · Queued {agent.counts.queued} · Stopped {agent.counts.blocked} · Done {agent.counts.done}</span>{dataRow?.(agent)}</span><ChevronDown size={14}/></summary>
   <div className="console-body"><p>Activity comes from the last activity record, not card states or model settings. Shared members show company-wide activity even in a team view.</p>
    {agent.activity.map(activity=><details key={`${activity.source}:${activity.id}`}><summary>{activity.kind==='session'?'Session outside cards':activity.kind==='card'?'Matched card activity':'Activity without a matched card (GPU or service)'}: {displayTitle(activity.title || 'Work title unknown')}</summary><p>Original title: {activity.title}</p><p>Activity recorded: {activity.at ? new Date(activity.at*1000).toLocaleString('en-GB'):'Time unknown'} · Read: {flow.readAt ? new Date(flow.readAt*1000).toLocaleString('en-GB'):'Time unknown'}{!flow.available?' · Current activity unverified':''}</p><p className="source-text">{activity.source} · {activity.id} · {activity.team || 'Team association unknown'} · {activity.note || ''}</p>{resultLinks(activity.note || '').map(url=><a key={url} href={url} target="_blank" rel="noreferrer">Open result</a>)}</details>)}
    <p>Card state: {statusLabel(agent.state)}{agent.state==='unknown'?' (Card worker state unknown)':agent.state==='reported'?' (Related card reporter; worker unverified)':''}</p>
    {agent.models.length ? agent.models.map(model=><div className="console-model" key={model.profile}><p>Set model: {model.configured || 'Model unknown'} <small> (profile: {model.profile})</small></p><p>Seen in session: {model.observed || 'Model unknown'} <small> (No proven link to a particular card)</small></p><details><summary>Model source</summary><p>{model.source || 'Settings source unknown'} · {model.observedSource || 'Session model source unknown'}{model.observedAt ? ` · ${new Date(model.observedAt*1000).toLocaleString('en-GB')}` : ''}</p></details></div>) : <p>No model record.</p>}
    {agent.tasks.map(card=><TaskDetails key={`${card.board}:${card.id}`} card={card}/>)}
    {!agent.tasks.length && <p>No assigned cards recorded.</p>}
   </div></details>
  </li>)}</ul> : <ul className="console-list">{rooms.filter(r=>`${r.label} ${r.teams?.join(' ')}`.toLowerCase().includes(query.toLowerCase())).slice(0,all||query?undefined:5).map(room=><li key={room.id}><details className="console-team"><summary><b>{room.label}</b><span className="console-counts">Cards: Working {room.board.working.length} · Queued {room.board.waiting.filter(c=>c.room===room.id).length} · Stopped {room.board.stopped.length} · Done {room.delivered}</span><ChevronDown size={14}/></summary><div className="console-body"><p>{room.agents.map(a=>`${personaOf(a.name)} (${a.name})`).join(', ') || 'Worker unknown'}</p>{[...room.board.working,...room.board.stopped,...room.board.waiting.filter(c=>c.room===room.id),...room.shelf].map(card=><TaskDetails key={`${card.board}:${card.id}`} card={card}/>)}</div></details></li>)}</ul>}
  {!query && (view==='agents'?filtered.length:rooms.length)>5 && <button className="console-more" type="button" aria-expanded={all} onClick={()=>setAll(v=>!v)}>{all?'Show less':`Show all (${view==='agents'?filtered.length:rooms.length})`}</button>}
  <div className="console-tools"><details className="compose-fold"><summary>Send a request by voice or text</summary><VoiceCommand tone={memberTone('Bigkiji')} remote={remote}/></details><a className="office-vr-link" href="/vr" target="_blank" rel="noreferrer">3D / VR</a></div>
  <details className="console-source"><summary>Count sources</summary><p>Read from Hermes boards, saved profiles, the team roster and /api/agents/flow. Active flags and recipient activity show the last recorded activity; historical count is never a current-job count. Sessions are separate from cards. GPU or service activity without a proven card match stays unmatched. Team filtering uses recorded room/team IDs and member names only. Cards are counted once per board and card ID. Completed counts cover 7 days; team result previews show the last 5 items. Set models and session models are separate evidence, and do not prove the model used for any card.</p></details>
 </section>;
}
