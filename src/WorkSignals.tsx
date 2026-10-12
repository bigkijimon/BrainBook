import type {CSSProperties} from 'react';
import {liveDistribution,liveAgentDistribution,progressGauge} from './work-signals.mjs';
import {memberTone} from './TeamRail';
import type {LiveActivity} from './activity-console.mjs';
// Owner feedback 2026-10-11: the flat distribution bar below is a static width split — it cannot
// show that work is happening *right now*. The owner remembered an earlier UI with moving colored
// bars that made "how many agents are live" readable at a glance without reading any numbers.
// This adds that back as a small equalizer: one pulsing bar per live record, grouped and tinted
// per AGENT (owner 2026-10-11: "棒のアニメーションも動いてるエージェントの色で表現してください" — not by
// internal activity kind, every agent gets its own stable color, same tones as the team rail).
// The flat bar + legend stay underneath, unchanged, as the exact-count fallback.
const PULSE_CAP=6;
export function LivePulseMeter({rows}:{rows:LiveActivity[]}){
 const data=liveAgentDistribution(rows);
 if(!data.total)return null;
 return <div className="live-pulse" role="img" aria-label={`${data.total} agents working now: ${data.segments.map(s=>`${s.count} ${s.label}`).join(', ')}`}>
  {data.segments.map(s=><span className="live-pulse-group" key={s.key} title={`${s.label} · ${s.count}`}><em className="pulse-avatar" style={{'--tone':s.key==='unlinked'?'#8f769e':memberTone(s.key)} as CSSProperties} aria-hidden="true">{(s.label||'?').trim().charAt(0).toUpperCase()}</em>
   {Array.from({length:Math.min(s.count,PULSE_CAP)}).map((_,i)=><i key={i} style={{'--tone':s.key==='unlinked'?'#8f769e':memberTone(s.key),'--delay':`${i*120}ms`} as CSSProperties}/>)}
   {s.count>PULSE_CAP&&<b>+{s.count-PULSE_CAP}</b>}
  </span>)}
 </div>;
}
export function LiveDistribution({rows}:{rows:LiveActivity[]}){
 const data=liveDistribution(rows);
 return <figure className="work-distribution" data-total={data.total}><figcaption>Live activity mix <small>Source: activity records · {data.total} records · not a completion score</small></figcaption><div className="distribution-track" aria-hidden="true">{data.segments.map(s=><span key={s.key} className={`signal-${s.key}`} style={{flexGrow:s.count}}/>)}</div><ul>{data.segments.map(s=><li key={s.key} data-count={s.count}><i className={`signal-${s.key}`} aria-hidden="true"/>{s.label} <b>{s.count}</b></li>)}</ul></figure>;
}
export function ProgressGauge({progress}:{progress:LiveActivity['metrics']['progress']}){
 const gauge=progressGauge(progress);
 return <div className="progress-gauge"><span>{gauge.known?`Recorded progress · ${progress.label}`:'Progress not recorded'}</span>{gauge.known?<div className="progress-track" role="progressbar" aria-label="Recorded task progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={gauge.percent!} aria-valuetext={progress.label}><i style={{'--progress':gauge.percent!/100} as CSSProperties}/></div>:<div className="progress-unknown" aria-hidden="true"/>}<small>{gauge.known?'A recorded measurement; completion is not inferred.':progress.basis}</small></div>;
}
export function WorkDistribution({counts,total}:{counts:Record<string,number>;total:number}){
 const labels:Record<string,string>={queued:'Queued',attention:'Needs attention / stopped',scheduled:'Scheduled',completed:'Completed',unverified:'Activity unverified'};
 return <figure className="work-distribution other-distribution" data-total={total}><figcaption>Other work by category <small>Source: this popup’s Next Work records · {total} records</small></figcaption><div className="distribution-track" aria-hidden="true">{Object.entries(counts).filter(([,n])=>n>0).map(([key,n])=><span className={`signal-${key}`} key={key} style={{flexGrow:n}}/>)}</div><ul>{Object.entries(counts).map(([key,n])=><li key={key} data-count={n}><i className={`signal-${key}`} aria-hidden="true"/>{labels[key]} <b>{n}</b></li>)}</ul></figure>;
}
