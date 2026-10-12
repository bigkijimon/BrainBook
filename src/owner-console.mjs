// Presentation only: preserve original records and never infer people, models or execution.
export const statusLabel = state => ({working:'Working',running:'Working',queued:'Queued',ready:'Queued',todo:'Not started',waiting:'Queued',blocked:'Needs you',failed:'Stopped',stopped:'Stopped',done:'Done','needs you':'Needs you','left over':'No update',scheduled:'Scheduled',reported:'Reported',review:'In review',idle:'Queued',paused:'Paused',active:'In progress',achieved:'Achieved'}[state] || 'State unknown');
export function shortTitle(value, max=54) {
 const text=String(value || 'Work title unknown').replace(/^\s*t_[\w]+\s*[「:]?/, '').replace(/\[t_[\w]+\]/g,'').replace(/^(?:DESIGN REPAIR|REPAIR ROUND[^:]*):\s*/i,'').replace(/\/Users\/[^\s)]+/g,'a file').trim();
 return text.length>max ? `${text.slice(0,max-1).trimEnd()}…` : text;
}
// Unknown multilingual work keeps a labelled, bounded original title; never invent a translation.
export function displayTitle(value, max=54) {
 const raw=typeof value==='string' && value ? value : 'Work title unknown';
 const caption=/[ぁ-んァ-ン一-龥]/.test(raw)?outcomeTitle(raw):raw;
 return caption==='Goal (see Original)' ? shortTitle(`Original title: ${shortTitle(raw,max)}`,max) : shortTitle(caption,max);
}
export function outcomeTitle(title) {
 const rules=[[/役に立つWebアプリ.*公開/,'Publish a web app and measure use'],[/H&S Academy.*UPCLASS.*発信/,'Keep H&S and UPCLASS publishing'],[/授業動画.*完成品/,'Finish the lesson videos'],[/LLMだけの会社.*お金/,'Test whether an AI-only company can earn money'],[/Hermes3D.*AI会社/,'Show my AI company in Hermes3D'],[/Bigkiji.*24時間/,'Run the company around the clock with Bigkiji'],[/APP.*販売.*エンジニア/,'Sell apps and earn as an app developer']];
 return rules.find(([match])=>match.test(title))?.[1] || (/[ぁ-んァ-ン一-龥]/.test(title)?'Goal (see Original)':shortTitle(title,40));
}
const goalObjective = title => String(title||'').normalize('NFKC').replace(/[\s。、，,.!！「」]/g,'').toLowerCase();
export function groupGoals(goals) {
 const groups=new Map();
 for (const goal of goals || []) {
  // Exact equivalent objectives only. Sharing a task can connect different business outcomes.
  const objective=goalObjective(goal.title);
  const key=objective ? `${goal.status}:${objective}` : goal.path;
  if (!groups.has(key)) groups.set(key,{key,title:outcomeTitle(goal.title),goals:[]});
  groups.get(key).goals.push(goal);
 }
 return [...groups.values()];
}
// Topic affinity is a display hint, never evidence that objectives or work are identical.
export function goalTopic(title) {
 const text=String(title || '').normalize('NFKC').toLowerCase();
 // Keep explicit education, movie, AI-company and infrastructure outcomes separate.
 if (/授業|教育|学校|academy|school|upclass|h&s|動画|映画|movie|video|インフラ|infrastructure|セキュリティ|依存|database|データベース|24時間|ai会社|ai.company|llm.*会社|hermes/i.test(text)) return null;
 if (!/アプリ|\bapps?\b|\bapplications?\b/.test(text)) return null;
 const publication=/公開|publish|publication|launch/.test(text);
 const sale=/販売|売る|sell|sales?/.test(text);
 return publication || sale ? 'app-portfolio' : null;
}
export function goalPresentation(goals) {
 const objectives=groupGoals(goals);
 const topics=new Map();
 for (const group of objectives) {
  const topic=goalTopic(group.goals[0].title);
  if (topic) { if (!topics.has(topic)) topics.set(topic,[]); topics.get(topic).push(group); }
 }
 const seen=new Set(), groups=[];
 for (const group of objectives) {
  const topic=goalTopic(group.goals[0].title), related=topics.get(topic);
  if (related?.length>1 && new Set(related.map(member=>goalObjective(member.goals[0].title))).size>1) {
   if (!seen.has(topic)) groups.push({kind:'related',key:`related:${topic}`,title:'Related goals · Publish, measure and sell apps',groups:related});
   seen.add(topic);
  } else groups.push({...group,kind:'objective'});
 }
 // Counts describe presentation only. Original objects, paths, steps and statuses are retained.
 return {originalCount:(goals || []).length,groupCount:groups.length,groups};
}
export function messageSummary(value) {
 const raw=String(value||'').trim();
 const exact={
  'New task on the board.':'New work item added.','Started working on it.':'Work started.','Task completed.':'Work was reported complete.','Unblocked — back in progress.':'The blocker was cleared; work resumed.',
  'No invited member answered; the meeting has no discussion result.':'No participant replied; there is no meeting result.',
  'The host could not open the meeting; no member rounds were started.':'The host could not start; no discussion took place.',
 };
 if (exact[raw]) return exact[raw];
 if (/Waiting for owner-selected Space Bunny model capacity/.test(raw)) return 'Waiting for Space Bunny capacity and an external operator. No alternative model is authorized.';
 if (/bounded attempts used/.test(raw)) return 'Stopped after reaching the retry limit.';
 if (/depth guard|a design repair of a design repair/.test(raw)) return 'The repair failed again. No further repair was created.';
 if (/Router refused admission/.test(raw)) return 'Work was refused: team registration or qualification evidence is missing.';
 if (/requires the owner.?s authority/.test(raw)) return 'Owner approval is needed before handover.';
 if (!raw) return 'Report text unknown';
 const head=raw.split(/\n\s*Details:/)[0].replace(/^(?:BLOCKED|DONE|FAILED|COMMENT):\s*/i,'').trim();
 if (/t_[0-9a-f]{6,}|\/Users\/|repair[-_ ]round|root_lock|stderr|stdout/i.test(head)) return 'Report available. See Original.';
 if (!/[ぁ-んァ-ン一-龥]/.test(head)) return 'Report available. See Original.';
 return 'Report available. See Original.';
}
export function resultLinks(text) {
 return [...new Set((String(text||'').match(/https?:\/\/[^\s<>"'`]+/g)||[]).map(url=>url.replace(/[.,;:)]+$/,'')))];
}
export function conversationGroups(items) {
 const groups=new Map();
 for (const item of items || []) {
  const key=item.author || 'Author unknown';
  if (!groups.has(key)) groups.set(key,{key,items:[]});
  groups.get(key).items.push(item);
 }
 return [...groups.values()].map(group=>({...group,items:group.items.sort((a,b)=>a.at-b.at),last:[...group.items].sort((a,b)=>b.at-a.at)[0]})).sort((a,b)=>b.last.at-a.last.at);
}
// Owner 2026-10-11 ("Agentたちのやり取りをセッションごとにまとめたもの... 作業中のタスクも表示"):
// same feed items as conversationGroups, grouped by SESSION (task/card) instead of by author, so
// the Home screen reads "what is being built and how far along", not "who said what". State is
// the latest report's own kind -- never a fabricated percent the feed doesn't carry.
const SESSION_STATE_LABEL={blocked:'Needs you',failed:'Stopped',done:'Done',progress:'Working',new:'Working',comment:'Working'};
export function sessionGroups(items) {
 const groups=new Map();
 for (const item of items || []) {
  const key=item.taskId || `${item.boardName || 'unknown'}:${item.taskTitle || 'untitled'}`;
  if (!groups.has(key)) groups.set(key,{key,taskTitle:item.taskTitle,board:item.board,boardName:item.boardName,items:[]});
  groups.get(key).items.push(item);
 }
 return [...groups.values()].map(group=>{
  const sorted=group.items.slice().sort((a,b)=>a.at-b.at);
  const last=sorted[sorted.length-1];
  const participants=[...new Set(group.items.map(item=>item.author).filter(Boolean))];
  return {...group,items:sorted,last,participants,
   state:last.kind==='done'?'done':(last.kind==='blocked'||last.kind==='failed')?'waiting':'working',
   stateLabel:SESSION_STATE_LABEL[last.kind]||'Working'};
 }).sort((a,b)=>b.last.at-a.last.at);
}
export function stepPresentation(step) {
 if (step.done || step.state==='done') return {state:'done',label:'Done'};
 const status=step.kanban?.status || (step.uses?.kind==='card' ? step.uses.status : '');
 if (status==='blocked' || status==='needs_attention') return {state:'waiting',label:'Needs you'};
 if (status==='failed' || status==='stopped') return {state:'waiting',label:'Stopped'};
 if (status==='running' || status==='working') return {state:'working',label:'Working'};
 if (['ready','todo','triage','scheduled','review'].includes(status)) return {state:'queued',label:statusLabel(status)};
 if (step.workingOn || step.state==='working') return {state:'unknown',label:'Written as working (activity unverified)'};
 if (step.state==='waiting') return {state:'waiting',label:'Needs you'};
 return {state:'todo',label:'Not started'};
}
export function goalSummary(goal) {
 const states=(goal.steps || []).map(stepPresentation);
 return {pct:goal.status==='achieved'?100:goal.total?Math.round(goal.done/goal.total*100):0,
  working:states.filter(s=>s.state==='working').length,waiting:states.filter(s=>s.state==='waiting').length,queued:states.filter(s=>s.state==='queued').length};
}
