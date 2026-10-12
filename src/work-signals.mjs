// Presentation over already-verified live projections. Counts are records, not jobs or achievement.
const LABELS={card:'Matched card',session:'Session outside cards',gpu:'GPU outside cards',router:'Dispatched job',unlinked:'Unmatched activity'};
export function liveDistribution(rows){const segments=Object.entries(LABELS).map(([key,label])=>({key,label,count:rows.filter(r=>r.kind===key).length})).filter(s=>s.count>0);return {total:rows.length,segments};}
// Owner 2026-10-11: "棒のアニメーションも動いてるエージェントの色で表現してください" — the pulse bars must
// show WHICH agent is live, not which internal activity kind it is. One group per known agent
// (an unknown-sender row falls back to the 'unlinked' kind bucket, unchanged).
export function liveAgentDistribution(rows){
 const known=rows.filter(r=>r.toKnown&&r.agent);
 const unlinked=rows.length-known.length;
 const byAgent=new Map();
 for(const r of known){byAgent.set(r.agent,(byAgent.get(r.agent)||0)+1);}
 const segments=[...byAgent.entries()].map(([agent,count])=>({key:agent,label:agent,count}));
 if(unlinked>0)segments.push({key:'unlinked',label:LABELS.unlinked,count:unlinked});
 return {total:rows.length,segments};
}
// Metrics are validated by activityMetrics first. Missing remains missing, including in ARIA.
export function progressGauge(progress){const n=progress?.percent;return typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=100?{known:true,percent:n}:{known:false,percent:null};}
