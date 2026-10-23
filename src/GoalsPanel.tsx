// Goals (owner 2026-09-30): "add a Goals item: for each goal show the connected tasks and ideas and
// how far it is toward being achieved". Reads /api/goals, which is built from Projects/Goals/*.md in
// the vault: the steps are the note's checkboxes, the connections are its "Connected to" list plus
// any note that links back to it. Nothing here is decorative: progress = ticked steps / all steps.
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ArrowUpRight, Check, ChevronDown, Lightbulb, Link2, ListChecks, Play, Target, Trophy } from 'lucide-react';
import type { VaultTask } from './types';
import { goalPresentation, goalSummary, stepPresentation, displayTitle, type GoalPresentation } from './owner-console.mjs';
import { StateNote } from './ui';

type GoalLink = { kind: string; title: string; why: string; url?: string; status?: string; id?: string };
export type Goal = {
  path: string; url: string; title: string; status: 'active' | 'achieved' | 'paused'; createdAt: string; updatedAt: string;
  words: string; reason: string; progressLog: string[]; steps: (VaultTask & { state?: string; workingOn?: string | null; uses?: { kind: string; title: string; status: string; id?: string; url?: string | null } | null })[]; links: GoalLink[];
  tasks: { id: string; title: string; status: string }[]; done: number; working?: number; waiting?: number; pct?: number; total: number; next: VaultTask | null;
};
const KIND_LABEL: Record<string, string> = { goal: 'Goals', idea: 'Ideas', task: 'Tasks', project: 'Project', card: 'Agent card' };
type Autopilot = { enabled: boolean; lastTick: string | null; started: { goal: string; step: string; card: string }[] };

export function GoalsPanel({ refreshKey, onToggle, onRun, notify }: { refreshKey: number; onToggle: (step: VaultTask) => Promise<void>; onRun: (step: VaultTask) => Promise<void>; notify: (text: string) => void }) {
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const [problem, setProblem] = useState(false);
  const [readAt, setReadAt] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pilot, setPilot] = useState<Autopilot | null>(null);
  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/goals', { cache: 'no-store' });
      if (!response.ok) throw new Error('goals unavailable');
      setGoals((await response.json()).goals); setProblem(false); setReadAt(Date.now());
      const auto = await fetch('/api/goals/autopilot', { cache: 'no-store' });
      if (auto.ok) setPilot(await auto.json());
    } catch { setProblem(true); /* retain previous snapshot, label stale */ }
  }, []);
  useEffect(() => { void load(); const timer = window.setInterval(load, 30000); const visible = () => { if (document.visibilityState === 'visible') void load(); }; document.addEventListener('visibilitychange', visible); return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', visible); }; }, [load, refreshKey]);
  if (!goals) return problem ? <section className="goals card-shell"><p role="status">Goals unavailable.</p></section> : null;
  const unarchived = goals.filter((goal) => goal.status !== 'achieved');
  const active = goalPresentation(unarchived);
  const achieved = goals.filter((goal) => goal.status === 'achieved');

  const run = async (step: Goal['steps'][number]) => {
    setBusy(step.id);
    try { await onRun(step); } finally { setBusy(null); void load(); }
  };

  const setStatus = async (goal: Goal, status: Goal['status']) => {
    const response = await fetch('/api/goals/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: goal.path, status }) });
    if (!response.ok) { notify('Could not update goal status.'); return; }
    notify(status === 'achieved' ? `Achieved: ${displayTitle(goal.title)}` : 'Goal status updated.');
    void load();
  };

  const renderSource = (goal: Goal) => <GoalSource key={goal.path} goal={goal} busy={busy} onToggle={async step => { await onToggle(step); void load(); }} run={run} setStatus={setStatus} />;

  return <section className="goals card-shell" aria-labelledby="goals-heading">
    <header className="goals-head">
      <h3 id="goals-heading"><Target size={16} strokeWidth={1.8} aria-hidden="true" /><span className="sr-only">Goals ({goals.length})</span></h3>
      <GoalCounts originalCount={goals.length} unarchivedCount={unarchived.length} groupCount={active.groupCount} />
      <small>{problem ? 'Update failed. Showing the last report.' : readAt ? `${new Date(readAt).toLocaleTimeString('en-GB')} read` : 'Loading'} · {pilot?.enabled ? 'Auto advance on' : 'Auto advance off'}</small>

    </header>
    {goals.length === 0 && <StateNote kind="empty">No goals yet. “New request” lets you describe what you want to achieve.</StateNote>}
    <GoalPresentationList presentation={active} open={open} onOpen={setOpen} all={all} renderSource={renderSource} />
    {active.groupCount>4 && <button type="button" className="console-more" aria-expanded={all} onClick={()=>setAll(v=>!v)}>{all?'Show less':`All display groups (${active.groupCount})`}</button>}
    {achieved.length > 0 && <details className="goals-archive">
      <summary><Trophy size={13} /> Achieved / archived ({achieved.length})</summary>
      <ol className="goals-list">{achieved.map(renderSource)}</ol>
    </details>}
  </section>;
}

export function GoalSource({goal,busy,onToggle,run,setStatus}: {goal:Goal;busy:string|null;onToggle:(step:VaultTask)=>Promise<void>;run:(step:Goal['steps'][number])=>Promise<void>;setStatus:(goal:Goal,status:Goal['status'])=>Promise<void>}) {
    const {pct} = goalSummary(goal);

    return <li key={goal.path} className={`goal is-${goal.status}`}>
      <p className="goal-source-title">Original goal: {goal.title} · {pct}% ({goal.done}/{goal.total} Done)</p><details><summary>Original goal and progress source</summary><p>{goal.path} · Updated record: {goal.updatedAt || "Not recorded"} · Original progress value: {goal.pct ?? "Not recorded"}</p><p>Progress counts completed steps only. Settings or written claims do not prove activity.</p></details>
      <div className="goal-body">
        {goal.words && <p className="goal-words">Original purpose: “{goal.words}”</p>}
        {goal.reason && <p className="goal-words">Original conditions and reason: {goal.reason}</p>}
        <div className="goal-cols">
          <section>
            <h4><ListChecks size={13} /> Original steps to achieve this goal</h4>
            <ol className="goal-steps">{goal.steps.map((step) => {
              const {state, label} = stepPresentation(step);
              const canRun = goal.status !== 'achieved' && state === 'todo' && !(step.uses?.kind === 'card' && step.uses.status !== 'gone');
              return <li key={step.id} className={`is-${state}`}>
                <button type="button" className="goal-check" aria-pressed={step.done} aria-label={step.done ? 'Mark unfinished' : 'Mark done'} onClick={async () => { await onToggle(step); }}>{step.done && <Check size={12} strokeWidth={3} />}</button>
                <span>{step.text}{label && <em className={`goal-run is-${state}`}>{label}</em>}
                  {step.workingOn && <small className="goal-uses">{step.workingOn}</small>}
                  {step.uses && <small className="goal-uses"><em className={`capture-tag is-${step.uses.kind}`}>{KIND_LABEL[step.uses.kind] || step.uses.kind}</em> {step.uses.title}{step.uses.status && <> · <b>{step.uses.status}</b></>}</small>}</span>
                {canRun && <button type="button" className="goal-go" disabled={busy === step.id} onClick={() => void run(step)} title="Hand this step to an agent"><Play size={11} /> {busy === step.id ? 'Sending…' : 'Run'}</button>}
              </li>;
            })}</ol>
          </section>
          <section>
            <h4><Link2 size={13} /> Related work</h4>
            {goal.links.length === 0 && goal.tasks.length === 0 ? <StateNote kind="empty">No related records.</StateNote> : <ul className="goal-links">
              {goal.links.map((link, index) => <li key={`${link.title}-${index}`}>
                <em className={`capture-tag is-${link.kind}`}>{KIND_LABEL[link.kind] || link.kind}</em>
                <span><b>{link.url ? <a href={link.url}>{link.title} <ArrowUpRight size={11} /></a> : link.title}</b>{link.status && <i> · {link.status}</i>}<small>{link.why}</small></span>
              </li>)}
              {goal.tasks.map((task) => <li key={task.id}><em className="capture-tag is-task">Tasks</em><span><b>{task.title}</b><i> · {task.status}</i></span></li>)}
            </ul>}
          </section>
        </div>
        {goal.progressLog.length > 0 && <p className="goal-log"><Lightbulb size={12} /> {goal.progressLog[goal.progressLog.length - 1]}</p>}
        <div className="goal-actions">
          <a className="capture-btn" href={goal.url}>Open original in Obsidian <ArrowUpRight size={12} /></a>
          {goal.status !== 'achieved' ? <button type="button" className="capture-btn" onClick={() => void setStatus(goal, 'achieved')}><Trophy size={12} /> Mark achieved</button>
            : <button type="button" className="capture-btn" onClick={() => void setStatus(goal, 'active')}>Resume</button>}
          {goal.status === 'active' && <button type="button" className="capture-btn" onClick={() => void setStatus(goal, 'paused')}>Pause</button>}
          {goal.status === 'paused' && <button type="button" className="capture-btn" onClick={() => void setStatus(goal, 'active')}>Resume</button>}
        </div>
      </div>
    </li>;
  }

export function GoalCounts({originalCount,unarchivedCount,groupCount}: {originalCount:number;unarchivedCount:number;groupCount:number}) {
 return <small>Original goals: {originalCount} (includes archived) · Unachieved: {unarchivedCount} · Display groups: {groupCount}</small>;
}
function ObjectiveSummary({group}: {group:{title:string;goals:Goal[]}}) {
 const goal=group.goals[0], {pct,working,waiting,queued}=goalSummary(goal);
 return <><span className="goal-compact-pct">{group.goals.length>1?'Per record':`${pct}%`}</span><span className="goal-main"><b>{group.title}</b><small>{group.goals.length>1?`${group.goals.length} equivalent goal records · Steps and progress stay separate`:`${goal.done}/${goal.total} Done${working?` · Working ${working}`:''}${waiting?` · Needs you ${waiting}`:''}${queued?` · Queued ${queued}`:''}${goal.status==='paused'?' · Pause':''}${goal.next?` · Next: ${displayTitle(goal.next.text,40)}`:''}`}</small></span><ChevronDown size={16}/></>;
}
export function GoalPresentationList({presentation,open,onOpen,all,renderSource}: {presentation:GoalPresentation<Goal>;open:string|null;onOpen:(key:string|null)=>void;all:boolean;renderSource:(goal:Goal)=>ReactNode}) {
 return <ol className="goals-list">{presentation.groups.slice(0,all?undefined:4).map(group=> {
  const expanded=open===group.key;
  return <li className="goal goal-group" key={group.key}><button type="button" className="goal-row" aria-expanded={expanded} onClick={()=>onOpen(expanded?null:group.key)}>
   {group.kind==='related' ? <><span className="goal-main"><b>{group.title}</b><small>{group.groups.reduce((count,g)=>count+g.goals.length,0)} distinct goals · Separate progress and conditions; no combined score</small></span><ChevronDown size={16}/></> : <ObjectiveSummary group={group}/>}
  </button>{expanded && <ul className="goal-sources">{group.kind==='related' ? group.groups.map(member=><li key={member.key}><details className="goal-group"><summary className="goal-row"><ObjectiveSummary group={member}/></summary><ul className="goal-sources">{member.goals.map(renderSource)}</ul></details></li>) : group.goals.map(renderSource)}</ul>}</li>;
 })}</ol>;
}
