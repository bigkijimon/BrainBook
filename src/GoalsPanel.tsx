// Goals (owner 2026-09-30): "add a Goals item: for each goal show the connected tasks and ideas and
// how far it is toward being achieved". Reads /api/goals, which is built from Projects/Goals/*.md in
// the vault: the steps are the note's checkboxes, the connections are its "Connected to" list plus
// any note that links back to it. Nothing here is decorative: progress = ticked steps / all steps.
import { useCallback, useEffect, useState } from 'react';
import { ArrowUpRight, Check, ChevronDown, Lightbulb, Link2, ListChecks, Play, Target, Trophy } from 'lucide-react';
import type { VaultTask } from './types';

type GoalLink = { kind: string; title: string; why: string; url?: string; status?: string; id?: string };
export type Goal = {
  path: string; url: string; title: string; status: 'active' | 'achieved' | 'paused'; createdAt: string; updatedAt: string;
  words: string; reason: string; progressLog: string[]; steps: (VaultTask & { state?: string; workingOn?: string | null; uses?: { kind: string; title: string; status: string; id?: string; url?: string | null } | null })[]; links: GoalLink[];
  tasks: { id: string; title: string; status: string }[]; done: number; working?: number; waiting?: number; pct?: number; total: number; next: VaultTask | null;
};
const KIND_LABEL: Record<string, string> = { goal: 'Goal', idea: 'Idea', task: 'Task', project: 'Project', card: 'Agent card' };
const RUN_LABEL: Record<string, string> = { ready: 'Handed to an agent', todo: 'Handed to an agent', running: 'An agent is on it', review: 'In review', blocked: 'Needs you', scheduled: 'Scheduled', done: 'Agent finished' };
type StepState = 'done' | 'working' | 'waiting' | 'todo';
const STATE_LABEL: Record<StepState, string> = { done: 'Done', working: 'In progress', waiting: 'Needs you', todo: '' };
type Autopilot = { enabled: boolean; lastTick: string | null; started: { goal: string; step: string; card: string }[] };

export function GoalsPanel({ refreshKey, onToggle, onRun, notify }: { refreshKey: number; onToggle: (step: VaultTask) => Promise<void>; onRun: (step: VaultTask) => Promise<void>; notify: (text: string) => void }) {
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pilot, setPilot] = useState<Autopilot | null>(null);
  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/goals', { cache: 'no-store' });
      if (response.ok) setGoals((await response.json()).goals);
      const auto = await fetch('/api/goals/autopilot', { cache: 'no-store' });
      if (auto.ok) setPilot(await auto.json());
    } catch { /* keep last */ }
  }, []);
  useEffect(() => { void load(); const timer = window.setInterval(load, 30000); return () => window.clearInterval(timer); }, [load, refreshKey]);
  if (!goals) return null;
  const active = goals.filter((goal) => goal.status !== 'achieved');
  const achieved = goals.filter((goal) => goal.status === 'achieved');

  const run = async (step: Goal['steps'][number]) => {
    setBusy(step.id);
    try { await onRun(step); } finally { setBusy(null); void load(); }
  };

  const setStatus = async (goal: Goal, status: Goal['status']) => {
    await fetch('/api/goals/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: goal.path, status }) });
    notify(status === 'achieved' ? `🏆 Achieved: ${goal.title}` : `Goal ${status}.`);
    void load();
  };

  const renderGoal = (goal: Goal) => {
    const pct = goal.pct ?? (goal.total ? Math.round((goal.done / goal.total) * 100) : 0);
    const expanded = open === goal.path;
    const summary = [`${goal.done}/${goal.total} done`, goal.working ? `${goal.working} in progress` : '', goal.waiting ? `${goal.waiting} need you` : '', `${goal.links.length} connected`].filter(Boolean).join(' · ');
    return <li key={goal.path} className={`goal is-${goal.status}`}>
      <button type="button" className="goal-row" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : goal.path)}>
        <span className="goal-ring" style={{ ['--pct' as string]: `${pct}` }} aria-label={`${pct}% done`}><span>{goal.status === 'achieved' ? <Trophy size={14} /> : `${pct}%`}</span></span>
        <span className="goal-main">
          <b>{goal.title}</b>
          <small>{summary}{goal.next && goal.status === 'active' ? <> · Next: {goal.next.text}</> : null}</small>
        </span>
        <ChevronDown size={16} className="goal-chevron" />
      </button>
      {expanded && <div className="goal-body">
        {goal.words && <p className="goal-words">“{goal.words}”</p>}
        <div className="goal-cols">
          <section>
            <h4><ListChecks size={13} /> Steps to reach it</h4>
            <ol className="goal-steps">{goal.steps.map((step) => {
              const state = (step.state || (step.done ? 'done' : 'todo')) as StepState;
              const label = state !== 'done' && step.kanban && RUN_LABEL[step.kanban.status] ? RUN_LABEL[step.kanban.status] : STATE_LABEL[state];
              const canRun = goal.status !== 'achieved' && state === 'todo' && !(step.uses?.kind === 'card' && step.uses.status !== 'gone');
              return <li key={step.id} className={`is-${state}`}>
                <button type="button" className="goal-check" aria-pressed={step.done} aria-label={step.done ? 'Mark not done' : 'Mark done'} onClick={async () => { await onToggle(step); void load(); }}>{step.done && <Check size={12} strokeWidth={3} />}</button>
                <span>{step.text}{label && <em className={`goal-run is-${state}`}>{label}</em>}
                  {step.workingOn && <small className="goal-uses">{step.workingOn}</small>}
                  {step.uses && <small className="goal-uses"><em className={`capture-tag is-${step.uses.kind}`}>{KIND_LABEL[step.uses.kind] || step.uses.kind}</em> {step.uses.title}{step.uses.status && <> · <b>{step.uses.status}</b></>}</small>}</span>
                {canRun && <button type="button" className="goal-go" disabled={busy === step.id} onClick={() => void run(step)} title="Hand this step to an agent"><Play size={11} /> {busy === step.id ? 'Sending…' : 'Run'}</button>}
              </li>;
            })}</ol>
          </section>
          <section>
            <h4><Link2 size={13} /> How it connects</h4>
            {goal.links.length === 0 && goal.tasks.length === 0 ? <p className="goals-empty">Nothing connected yet.</p> : <ul className="goal-links">
              {goal.links.map((link, index) => <li key={`${link.title}-${index}`}>
                <em className={`capture-tag is-${link.kind}`}>{KIND_LABEL[link.kind] || link.kind}</em>
                <span><b>{link.url ? <a href={link.url}>{link.title} <ArrowUpRight size={11} /></a> : link.title}</b>{link.status && <i> · {link.status}</i>}<small>{link.why}</small></span>
              </li>)}
              {goal.tasks.map((task) => <li key={task.id}><em className="capture-tag is-task">Task</em><span><b>{task.title}</b><i> · {task.status}</i></span></li>)}
            </ul>}
          </section>
        </div>
        {goal.progressLog.length > 0 && <p className="goal-log"><Lightbulb size={12} /> {goal.progressLog[goal.progressLog.length - 1]}</p>}
        <div className="goal-actions">
          <a className="capture-btn" href={goal.url}>Open in Obsidian <ArrowUpRight size={12} /></a>
          {goal.status !== 'achieved' ? <button type="button" className="capture-btn" onClick={() => void setStatus(goal, 'achieved')}><Trophy size={12} /> Mark achieved</button>
            : <button type="button" className="capture-btn" onClick={() => void setStatus(goal, 'active')}>Reopen</button>}
          {goal.status === 'active' && <button type="button" className="capture-btn" onClick={() => void setStatus(goal, 'paused')}>Pause</button>}
          {goal.status === 'paused' && <button type="button" className="capture-btn" onClick={() => void setStatus(goal, 'active')}>Resume</button>}
        </div>
      </div>}
    </li>;
  };

  return <section className="goals card-shell" aria-labelledby="goals-heading">
    <header className="goals-head">
      <h3 id="goals-heading"><Target size={16} strokeWidth={1.8} /> Goals <b>{goals.filter((goal) => goal.status === 'active').length}</b></h3>
      <small>{pilot?.enabled ? <>🟢 Autopilot on: while BrainBook is open, agents keep one step of every goal moving{pilot.lastTick ? ` · checked ${new Date(pilot.lastTick).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}.</> : 'Write a goal in New task. BrainBook links it to what you already have and breaks it into steps.'}</small>
    </header>
    {goals.length === 0 && <p className="goals-empty">No goals yet. Tap <b>New task</b> and write what you want to reach, for example “I want to sell an app and call myself an app engineer”.</p>}
    <ol className="goals-list">{active.map(renderGoal)}</ol>
    {achieved.length > 0 && <details className="goals-archive">
      <summary><Trophy size={13} /> Done · archived ({achieved.length})</summary>
      <ol className="goals-list">{achieved.map(renderGoal)}</ol>
    </details>}
  </section>;
}
