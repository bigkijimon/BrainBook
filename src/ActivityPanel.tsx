import {useMemo,useState,type Ref} from 'react';
import {Radio,Plus,Cpu,GitBranch,ClipboardList,HelpCircle} from 'lucide-react';
import {useAgentFlow,type Handoff} from './AgentFlow';
import {ControlCenter,type ControlWork} from './ControlCenter';
import {OwnerDialog} from './OwnerDialog';
import {RelationshipView} from './RelationshipView';
import {projectLiveActivity,relationshipGraph,otherWorkInventory,type LiveActivity} from './activity-console.mjs';
import {displayTitle,statusLabel,resultLinks} from './owner-console.mjs';
import {LiveDistribution,LivePulseMeter,ProgressGauge,WorkDistribution} from './WorkSignals';
import {memberTone} from './TeamRail';
import {NeonAccent} from './NeonAccent';
import {elapsedLabel} from './live-work.mjs';
import type {TeamAssociation} from './office-projection.mjs';
const KIND={gpu:'GPU activity (outside cards)',session:'Session (outside cards)',router:'Dispatched job',card:'Matched card',unlinked:'Activity without a matched card'};
const KIND_ICON:Record<keyof typeof KIND,typeof Radio>={gpu:Cpu,session:Radio,router:GitBranch,card:ClipboardList,unlinked:HelpCircle};
const CATEGORY={queued:'Queued',attention:'Needs attention / stopped',scheduled:'Scheduled',completed:'Completed',unverified:'Activity unverified'};
type Props={work:ControlWork;teams:TeamAssociation[];entry:Parameters<typeof ControlCenter>[0]['entry'];actions:Parameters<typeof ControlCenter>[0]['actions'];notes:number;loading:boolean;problem:boolean;sectionRef:Ref<HTMLElement>;workOpen:boolean;onCloseWork:()=>void;onOpenWork:(compose:boolean)=>void};
export function ActivityPanel(props:Props){const flow=useAgentFlow(false);return <ActivityConsole {...props} flow={flow}/>;}
export function ActivityConsole({work,teams,entry,actions,notes,loading,problem,sectionRef,workOpen,onCloseWork,onOpenWork,flow}:Props&{flow:{handoffs:Handoff[];agents:{name:string;active:boolean;count:number}[];available:boolean;readAt:number|null}}){
 const rows=useMemo(()=>projectLiveActivity(flow,teams,work.tasks),[flow.handoffs,flow.available,teams,work.tasks]);
 const graph=useMemo(()=>relationshipGraph(rows),[rows]);
 const inventory=useMemo(()=>otherWorkInventory(work,rows),[work,rows]);
 const [localOpen,setLocalOpen]=useState(false),[selected,setSelected]=useState<string|null>(null),[category,setCategory]=useState<keyof typeof CATEGORY|'all'>('all');
 const close=()=>{setLocalOpen(false);onCloseWork();};
 const activeActors=new Set(rows.filter(r=>r.toKnown&&r.original.recipientKind!=='team').map(r=>r.agent)).size;
 const companyWorking=work.tasks.filter(t=>['running','working'].includes(t.kanban?.status||'')).length;
 return <section ref={sectionRef} className="active-work card-shell" aria-labelledby="active-work-heading">
 <NeonAccent/><header className="active-work-head"><h3 id="active-work-heading"><Radio size={17}/>Active Agents <b>{flow.available?activeActors:'?'}</b>{flow.available&&rows.length>0&&<span className="live-badge"><i/>LIVE</span>}</h3><span className="activity-supervision">Bigkiji · Company overview</span><div><button type="button" className="ghost-button other-work-show" aria-haspopup="dialog" aria-expanded={workOpen||localOpen} onClick={()=>{setCategory('all');setLocalOpen(true);}}>Show ({inventory.total})</button></div></header>
 <p className="active-work-scope">Live activity records only · {flow.readAt?`Read ${new Date(flow.readAt*1000).toLocaleTimeString('en-GB')}`:'Read time unavailable'} · Working cards in BrainBook: {companyWorking}</p>
 {flow.available&&rows.length>0&&<LivePulseMeter rows={rows}/>}
 {!flow.available?<p role="status">Activity unavailable. No live state is inferred from card reports.</p>:!rows.length?<p>No current live work recorded.</p>:<ul className="active-work-list" aria-label="Live work only">{rows.map(row=><LiveWorkItem row={row} key={row.key} selected={selected===row.key} onSelect={()=>setSelected(row.key)}/>)}</ul>}
 {flow.available&&rows.length>0&&<LiveDistribution rows={rows}/>}
 {flow.available&&rows.length>0&&<RelationshipView graph={graph} selected={selected} onSelect={setSelected}/>}
 {(workOpen||localOpen)&&<OwnerDialog title="Other work" onClose={close} className="other-work-dialog"><p>Next Work sources: Board {inventory.sources.board} · Obsidian checklist {inventory.sources.notes} · Agent requests {inventory.sources.requests}. These are BrainBook’s records, not company-wide card totals.</p><WorkDistribution counts={inventory.counts} total={inventory.total}/><div className="work-categories" role="group" aria-label="Other work categories"><button type="button" aria-pressed={category==='all'} onClick={()=>setCategory('all')}>All ({inventory.total})</button>{(Object.keys(CATEGORY) as (keyof typeof CATEGORY)[]).map(key=><button type="button" key={key} aria-pressed={category===key} onClick={()=>setCategory(key)}>{CATEGORY[key]} ({inventory.counts[key]})</button>)}</div><ControlCenter work={work} entry={entry} actions={actions} notes={notes} loading={loading} problem={problem} rowsOverride={category==='all'?inventory.rows:inventory.groups[category]}/></OwnerDialog>}
 </section>;
}
// Owner feedback 2026-10-11 (screenshot): each card showed ~9 lines of mostly "not recorded"
// text (FROM/TO department, stage, progress, ETA, recorded time) before you could see what the
// agent was actually doing. Keep only the essentials always visible (who, what, how long) with a
// status icon standing in for the kind/department text; everything else that was already honest
// "not recorded" filler moves into the existing expandable details, unchanged in content.
// Owner sketch 2026-10-11: "Bigkiji (Sonnet) -> department top (LLM model)". Each end shows its configured model
// from the team roster; the title says whether the sender was recorded or read from the reporting line.
function FlowLine({flow}:{flow:NonNullable<LiveActivity['flow']>}){
 const end=(e:{name:string;model:string|null})=><span className="flow-end" style={{'--tone':memberTone(e.name)} as React.CSSProperties}><b>{e.name}</b><small>{e.model||'model not recorded'}</small></span>;
 return <div className="flow-line" title={flow.basis}>{end(flow.from)}<span className="flow-arrow" aria-hidden="true"/>{end(flow.to)}</div>;
}
export function LiveWorkItem({row,selected,onSelect}:{row:LiveActivity;selected:boolean;onSelect:()=>void}){
 const {progress,eta,stage}=row.metrics,at=row.updatedAt;
 const Icon=KIND_ICON[row.kind]||HelpCircle;
 const who=row.toKnown?row.agent:'Recipient not recorded';
 const agentColor=row.toKnown?memberTone(row.agent):undefined;
 const summaryLabel=`${KIND[row.kind]} · ${statusLabel(row.state)} · from ${row.from} to ${who} · ${at?elapsedLabel(at):'time not recorded'}`;
 return <li className={`live-work-item ${selected?'is-selected':''}`} data-activity={row.key}><button type="button" className="activity-select" aria-pressed={selected} aria-label={summaryLabel} onClick={onSelect}><span className="activity-kind-icon" data-kind={row.kind} style={agentColor?{'--tone':agentColor} as React.CSSProperties:undefined} title={`${KIND[row.kind]} · ${statusLabel(row.state)}`} aria-hidden="true"><Icon size={18}/></span><span className="activity-who"><b style={agentColor?{color:agentColor}:undefined}>{who}</b><small>{at?elapsedLabel(at):'time not recorded'}</small></span><strong>{displayTitle(row.title,96)}</strong></button>{row.flow&&<FlowLine flow={row.flow}/>}{progress.percent!==null&&<ProgressGauge progress={progress}/>}<details className="activity-source"><summary>Details</summary><p>From: {row.from} · {displayTitle(row.fromDepartment.label,48)}</p><p>To: {who}{row.original.recipientKind==='team'?' (team; worker not recorded)':''} · {displayTitle(row.toDepartment.label,48)}</p><p>Stage: {displayTitle(stage,60)} · Progress: {progress.percent===null?'Not recorded':progress.label}</p><p>Expected finish: {eta.finishAt?new Date(eta.finishAt*1000).toLocaleString('en-GB'):'Not recorded (no estimate)'}</p><p>Original title: {row.original.title}</p><p>Sender: {row.from} · {row.fromKnown?(row.original.senderBasis||'Sender recorded in the activity source.'):'Sender metadata is missing; no identity inferred.'}</p><p>From department: {row.fromDepartment.basis}</p><p>To department: {row.toDepartment.basis}</p><p>Progress: {progress.basis}{progress.at?` · Recorded ${new Date(progress.at*1000).toISOString()}`:''}</p><p>ETA means expected finish: {eta.basis}{eta.at?` · Recorded ${new Date(eta.at*1000).toISOString()}`:''}{eta.finishAt&&eta.finishAt<Date.now()/1000?' · Recorded estimate is past; no new finish inferred.':''}</p><p>Source: {row.original.source} · {row.original.id} · Activity recorded {at?new Date(at*1000).toISOString():'time not recorded'}. Source tag alone is not card identity.</p>{row.original.note&&<p className="source-text">Original report: {row.original.note}</p>}{resultLinks(row.original.note||'').map(url=><a key={url} href={url} target="_blank" rel="noreferrer">Open result</a>)}</details></li>;
}
