// Control Center (owner 2026-10-02): "consolidate the task entry points into the Control Center /
// Next Work List". One card at the top of the page: the capture box here is the one place the app
// UI adds work, and the Next Work List under it is the one ranked answer to "what is next". Every
// other entry point that used to keep its own queue — the top-bar Run popup, the "New" button, the
// Inbox "Capture another" button, the "From Obsidian" strip at the bottom of the page — opens this
// card instead of repeating the work. Anything created elsewhere (voice, a meeting) lands on the
// same board and therefore in this list too.
//
// Ranking is not decided here: src/next-work.mjs owns it, so this list cannot drift from the Run
// state on a board card. The Run button lives here for the same reason — the same work shown as a
// row and as a card must offer the same button.
import { useState } from 'react';
import type React from 'react';
import { Check, ListChecks, Play, Plus, Radio, X } from 'lucide-react';
import { CaptureSorter, type Saved } from './CaptureSorter';
import { NEXT_WORK_RANKS, nextWorkCounts, nextWorkList, runState, type NextWorkRank, type NextWorkRow, type Runnable, type RunState } from './next-work.mjs';
import type { Task, VaultTask } from './types';

type Ask = { taskId: string; taskTitle: string; boardName: string; text: string };
// The Control Center reads exactly what src/next-work.mjs reads, handed over as one object.
export type ControlWork = { tasks: Task[]; vaultTasks: VaultTask[]; asks: Ask[]; focus: 'work' | 'personal' };
type Entry = { open: boolean; onToggle: () => void; onSaved: (saved: Saved) => void };
type Actions = {
  openTask: (id: string) => void;
  runTask: (task: Task) => void;
  runVault: (line: VaultTask) => void;
  toggle: (line: VaultTask) => void;
};

const PREVIEW = 6;
// The module owns the rank numbers; the card owns the words. This is the only join between them, so
// adding a rank to src/next-work.mjs is a one-line change here and it cannot silently fall back.
const RANK_NAME: Record<number, NextWorkRank> = {};
for (const [name, rank] of Object.entries(NEXT_WORK_RANKS) as [NextWorkRank, number][]) RANK_NAME[rank] = name;
const TAG_TONE: Record<NextWorkRank, string> = { ask: 'urgent', attention: 'urgent', overdue: 'due', today: 'due', high: 'high', soon: 'soon', next: 'soon' };
const TAG_LABEL: Record<NextWorkRank, string> = { ask: 'Agent waiting', attention: 'Needs you', overdue: 'Overdue', today: 'Today', high: 'High', soon: 'This week', next: 'Next' };

function formatShort(value: string | null) {
  if (!value) return 'Soon';
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric' }).format(new Date(value));
}

const RUN_LABEL: Record<RunState, string> = { idle: 'Run', queued: 'Queued', 'waiting-gpu': 'Waits for night GPU', running: 'Running', blocked: 'Needs you', done: 'Done' };
const RUN_HINT: Record<RunState, string> = {
  idle: 'Hand this task to Bigkiji. It starts within about a minute, even when you are away.',
  queued: 'Waiting for the Hermes dispatcher to pick it up (checks every minute).',
  'waiting-gpu': 'Needs the GPU, so it starts in the night window (01:00–06:00) when the GPU is free.',
  running: 'Bigkiji is working on this now.',
  blocked: 'Bigkiji stopped and needs a decision from you. See the agent updates.',
  done: 'Finished. See the agent updates for the summary.',
};

export function RunButton<T extends Runnable>({ task, onRun }: { task: T; onRun: (task: T) => void }) {
  const run = runState(task);
  if (task.status === 'done' && run === 'idle') return null;
  return <button type="button" className={`run-button run-${run}`} disabled={run !== 'idle'} title={RUN_HINT[run]} aria-label={`${RUN_LABEL[run]}: ${task.title}`} onClick={(event) => { event.stopPropagation(); onRun(task); }}>
    {run === 'running' ? <span className="run-spinner" aria-hidden="true" /> : run === 'idle' ? <Play size={12} strokeWidth={2.2} /> : null}
    {RUN_LABEL[run]}
  </button>;
}

function NextWorkRow({ row, actions }: { row: NextWorkRow; actions: Actions }) {
  const rank = RANK_NAME[row.rank] || 'next';
  const target = row.boardTask || row.noteTask || null;
  const run = runState(target);
  const body = <><span className={`owner-tag tone-${TAG_TONE[rank]}`}>{rank === 'soon' ? formatShort(row.dueAt) : TAG_LABEL[rank]}</span><span className="owner-text"><strong>{row.title}</strong>{row.detail && <small>{row.detail}</small>}</span></>;
  const hand = () => { if (row.boardTask) actions.runTask(row.boardTask); else if (row.noteTask) actions.runVault(row.noteTask); };
  return <li className={target ? `run-${run}` : ''}>
    {row.boardTask ? <button type="button" onClick={() => actions.openTask(row.boardTask!.id)}>{body}</button>
      : row.href ? <a href={row.href} title="Open in Obsidian">{body}</a>
        : <div>{body}</div>}
    {target && <RunButton task={target} onRun={hand} />}
    {row.noteTask && <button type="button" className="owner-done" title="Mark done in Obsidian" aria-label={`Mark ${row.title} done`} onClick={() => actions.toggle(row.noteTask!)}><Check size={14} strokeWidth={2} /></button>}
  </li>;
}

export function ControlCenter({ work, entry, actions, notes = 0, loading = false, sectionRef }: {
  work: ControlWork;
  entry: Entry;
  actions: Actions;
  notes?: number;
  loading?: boolean;
  sectionRef?: React.Ref<HTMLElement>;
}) {
  const [all, setAll] = useState(false);
  const rows = nextWorkList({ ...work, now: Date.now() });
  const counts = nextWorkCounts(rows);
  const shown = all ? rows : rows.slice(0, PREVIEW);
  // One line, built from the same counts the badge uses, so the headline and the list cannot disagree.
  const parts = [
    counts.needYou ? `${counts.needYou} need you` : '',
    counts.ready ? `${counts.ready} ready to hand off` : '',
    counts.running ? `${counts.running} running` : '',
  ].filter(Boolean);
  const summary = loading ? 'Reading your vault…' : rows.length === 0 ? 'Nothing needs you right now' : parts.join(' · ') || 'Next work, in order';
  return (
    <section className="control-center card-shell" ref={sectionRef} aria-labelledby="control-center-heading">
      <header className="control-center-head">
        <h3 id="control-center-heading"><Radio size={16} strokeWidth={1.8} /> Control Center {counts.needYou > 0 && <b title={`${counts.needYou} need you`}>{counts.needYou}</b>}</h3>
        <small>{summary}</small>
        <button className={`control-center-add ${entry.open ? 'is-open' : ''}`} type="button" aria-expanded={entry.open} onClick={entry.onToggle}>
          {entry.open ? <X size={14} strokeWidth={1.6} /> : <Plus size={14} strokeWidth={1.7} />}{entry.open ? 'Close' : 'New task'}
        </button>
      </header>

      {entry.open && <CaptureSorter onClose={entry.onToggle} onSaved={entry.onSaved} />}

      {rows.length === 0
        ? <p className="owner-now-empty">{loading ? 'Reading the vault…' : 'You are clear. Add a task here, or dump an idea with Dump in the top bar.'}</p>
        : <ol className="owner-now-list next-work-list" aria-label="Next work">
          {shown.map((row) => <NextWorkRow key={row.key} row={row} actions={actions} />)}
        </ol>}
      {rows.length > PREVIEW && <button type="button" className="owner-now-more" onClick={() => setAll((value) => !value)}>{all ? 'Show less' : `Show all ${rows.length}`}</button>}

      <footer className="control-center-foot">
        <ListChecks size={13} strokeWidth={1.6} />
        <span>Everything is captured here and ranked below: board tasks, your Obsidian checklist lines, and anything an agent is waiting on you for.</span>
        {notes > 0 && <small title="Markdown notes read from your Obsidian vault">{notes} notes synced</small>}
      </footer>
    </section>
  );
}