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
// row and as a card must offer the same button. The WORDS are not decided here either: the rank labels,
// the Run labels and the three joins a row is made of all come from that module, because a label built
// in this file out of a raw feed field is how the owner was shown "App Dev · [object Object]". This
// component lays out what the module hands it and draws the glyphs; it does not assemble strings.
import { Fragment, useId, useState } from 'react';
import type React from 'react';
import { ArrowUp, CalendarDays, Check, CircleAlert, CircleDot, Clock, ListChecks, MessageCircle, Play, Plus, Radio, TriangleAlert, X, type LucideIcon } from 'lucide-react';
import { CaptureSorter, type Saved } from './CaptureSorter';
import {
  GROUP_LABEL, NEXT_WORK_RANKS, RANK_GROUP, RANK_HINT, RANK_LABEL, RANK_TONE, RUN_HINT, RUN_LABEL,
  markDoneName, nextWorkCounts, nextWorkList, rankName, rowNoteId, runName, runState,
  type NextWorkGroup, type NextWorkRank, type NextWorkRow, type Runnable, type RunState,
} from './next-work.mjs';
import type { Task, VaultTask } from './types';
import { displayTitle, messageSummary } from './owner-console.mjs';

type Ask = { taskId: string; taskTitle: string; boardName: string; text: string; at?:number };
// The Control Center reads exactly what src/next-work.mjs reads, handed over as one object.
export type ControlWork = { tasks: Task[]; vaultTasks: VaultTask[]; asks: Ask[]; focus: 'work' | 'personal' | 'all' };
type Entry = { open: boolean; onToggle: () => void; onSaved: (saved: Saved) => void };
type Actions = {
  openTask: (id: string) => void;
  runTask: (task: Task) => void;
  runVault: (line: VaultTask) => void;
  toggle: (line: VaultTask) => void;
};

const PREVIEW = 3;
const OWNER_RANK = {ask:"Needs you",attention:"Attention",overdue:"Overdue",today:"Today",high:"Priority",soon:"Upcoming",next:"Next work"};
const OWNER_RUN = {idle:"Run",queued:"Queued", "waiting-gpu":"GPU wait",running:"Working",blocked:"Needs you",done:"Done"};
// The words a rank prints live in src/next-work.mjs beside the numbers the rows are ranked by, not
// here. That is the fix for the bug this card was failed for: four `Record<NextWorkRank, …>` tables
// used to sit in this file, so the two strings the card assembles for itself - the Run button's
// accessible name and the row's `aria-describedby` id - were built here out of raw `task.title` and
// `row.key`, past the module's guard. Every string this card prints now comes out of the module.
//
// What stays here is what is not text: the glyph and the tone. Colour carries the severity family
// (urgent / due / high / soon) and the glyph carries the exact rank, one shape per rank, so "overdue"
// and "today" - which deliberately share the red pill - are told apart by form as well as hue, and
// nothing in this list reads by colour alone (refactoring-ui hard rule 7; fixing-accessibility §7).
// Three fills is one more than the severity needs, which is deliberate: the pill is the one place in
// this card where colour is loud, and the label word plus the glyph below mean nothing here is read by
// colour alone.
const TAG_ICON: Record<NextWorkRank, LucideIcon> = { ask: MessageCircle, attention: CircleAlert, overdue: TriangleAlert, today: Clock, high: ArrowUp, soon: CalendarDays, next: CircleDot };

// One rank, one set of words, checked rather than assumed. Every lookup below falls back to the
// quietest rank when a number is not in `rankName`, which is right for a stale saved row and wrong for
// a rank the ranking module added and this card never heard about: the row would read "Next" with the
// backlog's glyph and band, and the owner would be told a pressing thing is nothing. The rank names
// come from the ranking module's own runtime object, not from the `NextWorkRank` union, so this loop
// compares the two places the same list is written down and refuses to start if they disagree.
// (fixing-accessibility: a state must not be conveyed by something the reader cannot check.)
for (const name of Object.keys(NEXT_WORK_RANKS)) {
  if (name in RANK_TONE && name in TAG_ICON && name in RANK_LABEL && name in RANK_HINT && name in RANK_GROUP) continue;
  throw new Error(`Control Center: src/next-work.mjs ranks work as "${name}", and this card has no tone, glyph, label, sentence or band for it`);
}

function formatShort(value: string | null) {
  if (!value) return 'Upcoming';
  return new Intl.DateTimeFormat('en-GB', { month: 'numeric', day: 'numeric' }).format(new Date(value));
}

export function RunButton<T extends Runnable>({ task, onRun }: { task: T; onRun: (task: T) => void }) {
  const run: RunState = runState(task);
  // `useId`, because the same work can carry a Run button in two places at once - a Next Work row and
  // its board card - and two buttons must not point at one description node. It is read before the early
  // return below, which is the order hooks have to be called in.
  const hintId = useId();
  if (task.status === 'done' && run === 'idle') return null;
  return <button type="button" className={`run-button run-${run}`} disabled={run !== 'idle'} title={RUN_HINT[run]} aria-describedby={hintId} aria-label={`${OWNER_RUN[run]}: ${task.title}`} onClick={(event) => { event.stopPropagation(); onRun(task); }}>
    {run === 'running' ? <span className="run-spinner" aria-hidden="true" /> : run === 'idle' ? <Play size={12} strokeWidth={2.2} /> : null}
    {OWNER_RUN[run]}
    {/* `aria-label` above already names the button, so this text is read as its description and never
        folded into the name; the tooltip stays for the desktop pointer user it does work for. */}
    <span className="sr-only" id={hintId}>Current state: {OWNER_RUN[run]}。For queued or stopped work, open Details for the reason.</span>
  </button>;
}

function NextWorkRow({ row, index, actions, report }: { row: NextWorkRow; index: number; actions: Actions; report?:Ask }) {
  const rank = rankName(row.rank);
  const target = row.boardTask || row.noteTask || null;
  const run = runState(target);
  const completed=Boolean(row.noteTask?.done || row.boardTask?.status==='done' || run==='done');
  const Glyph = TAG_ICON[rank] || CircleDot;
  // The row is abbreviated; its full title/reason remain in aria-describedby and native details. The title and the reason
  // both wrap (see `.owner-text`), and the pill's one-sentence explanation - the only wording with
  // room for a sentence - is an `sr-only` note the row points at, which is what the member cards in
  // TeamRail do and what `title` used to do badly here: a tooltip is a mouse-only channel, so touch
  // has no hover to wait for and a screen reader never reads one (web-design-guidelines: truncated
  // text stays reachable; better-typography: an ellipsis needs a way back - so there is no ellipsis).
  const noteId = rowNoteId(index, row.key);
  // Where the row leads belongs to what the row says, and the anchor's `title` is a mouse-only channel,
  // so the destination rides in the same sr-only note as the rank's sentence rather than in a tooltip.
  const leads = row.href ? 'Opens in Obsidian.' : row.boardTask ? 'Opens the task on the board.' : '';
  const reportText=typeof report?.text==='string'?report.text:'';
  const detail=report ? messageSummary(reportText) : row.detail;
  const reportAt=report && Number.isFinite(report.at) ? new Date(report.at!*1000).toISOString() : null;
  const body = <><span className={`owner-tag tone-${RANK_TONE[rank]}`}><Glyph size={11} strokeWidth={2.4} aria-hidden="true" />{rank === 'soon' ? formatShort(row.dueAt) : OWNER_RANK[rank]}</span><span className="owner-text"><strong>{row.title==='Agent waiting'?'Decision needed (title unknown)':displayTitle(row.title,58)}</strong><small>{detail ? displayTitle(detail,80) : `Assigned to: ${target?.kanban?.assignee || "Not recorded"}`}</small>{report && <small>Reported: {reportAt ? <time dateTime={reportAt}>{new Date(reportAt).toLocaleString('en-GB')}</time>:'Time unknown'} (Current activity unverified)</small>}</span></>;
  const hand = () => { if (row.boardTask) actions.runTask(row.boardTask); else if (row.noteTask) actions.runVault(row.noteTask); };
  return <li className={`rank-${rank} ${target ? `run-${run}` : ''}`}>
    {row.boardTask ? <button type="button" aria-describedby={noteId} onClick={() => actions.openTask(row.boardTask!.id)}>{body}</button>
      : row.href ? <a href={row.href} aria-describedby={noteId} title="Open in Obsidian">{body}</a>
        : <div>{body}</div>}
    {target && !completed && <RunButton task={target} onRun={hand} />}
    {row.noteTask && <button type="button" className="owner-done" title={completed?'Reopen in Obsidian':'Mark done in Obsidian'} aria-label={completed?`Reopen ${row.title}`:`Mark ${row.title} done`} onClick={() => actions.toggle(row.noteTask!)}><Check size={14} strokeWidth={2} /></button>}
    {/* A sibling of the row, not inside it, so `aria-describedby` reads it as a description instead of
        folding it into the row's name (the same shape MemberFrame uses in TeamRail.tsx). */}
    <span className="sr-only" id={noteId}>Original title: {row.title}. {detail}. {report?"This is a report; current execution is unverified.":""}Priority: {OWNER_RANK[rank]}. Open Details for the source.{leads ? ` ${leads}` : ''}</span>
    <details className="owner-source"><summary>Details</summary><p>{row.title}</p>{row.detail && <p>{row.detail}</p>}{report && <><p className="source-text">Original: {reportText}</p><p>Reported from: {typeof report.boardName==='string'?report.boardName:'Not recorded'} · {reportAt ? <time dateTime={reportAt}>{new Date(reportAt).toLocaleString('en-GB')}</time>:'Report time unknown'} · Current execution is unverified.</p></>}<small>Source: {row.kind === "note" ? "Obsidian checklist" : row.kind === "ask" ? "Agent request" : "Task board"} · Assigned to: {target?.kanban?.assignee || "Not recorded"}</small></details>
  </li>;
}

export function ControlCenter({ work, entry, actions, notes = 0, loading = false, problem = false, sectionRef, rowsOverride }: {
  work: ControlWork;
  entry: Entry;
  actions: Actions;
  notes?: number;
  loading?: boolean;
  // Something failed to load, so an empty list is not the same as "nothing to do".
  problem?: boolean;
  sectionRef?: React.Ref<HTMLElement>;
  rowsOverride?: NextWorkRow[];
}) {
  const [all, setAll] = useState(false);
  const [search, setSearch] = useState('');
  const rows = rowsOverride ?? nextWorkList({ ...work, now: Date.now() });
  const counts = nextWorkCounts(rows);
  const filtered = rows.filter(row => `${row.title} ${row.detail}`.toLowerCase().includes(search.toLowerCase()));
  const shown = all || search ? filtered : filtered.slice(0, PREVIEW);
  // One line, built from the same counts the badge uses, so the headline and the list cannot disagree.
  const parts = [
    counts.needYou ? `Needs you ${counts.needYou}` : '',
    counts.ready ? `Queued ${counts.ready}` : '',
    counts.running ? `Working ${counts.running}` : '',
  ].filter(Boolean);
  const summary = rowsOverride ? `Showing ${rows.length} records in this category` : loading ? 'Loading notes…' : rows.length === 0 && problem ? 'Work unavailable' : rows.length === 0 ? 'Nothing needs your decision' : parts.join(' · ') || 'Next work in priority order';
  return (
    <section className="control-center card-shell" ref={sectionRef} aria-labelledby="control-center-heading">
      <header className="control-center-head">
        <h3 id="control-center-heading"><Radio size={16} strokeWidth={1.8} /> Next work {!rowsOverride && counts.needYou > 0 && <b>{counts.needYou}<span className="sr-only"> need you</span></b>}</h3>
        <small>{summary}</small>
        <button className={`control-center-add ${entry.open ? 'is-open' : ''}`} type="button" aria-expanded={entry.open} onClick={entry.onToggle}>
          {entry.open ? <X size={14} strokeWidth={1.6} /> : <Plus size={14} strokeWidth={1.7} />}{entry.open ? 'Close' : 'New request'}
        </button>
      </header>

      {entry.open && <CaptureSorter onClose={entry.onToggle} onSaved={entry.onSaved} />}

      <label className="console-search control-search"><span className="sr-only">Search next work</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search work"/></label>
      {rows.length === 0
        ? <p className="owner-now-empty">{loading ? 'Loading notes…' : problem ? 'Work unavailable. Please reload.' : 'No work items. Add one with New request.'}</p>
        : <ol className="owner-now-list next-work-list" aria-label="Next work">
          {shown.map((row, index) => {
            // A heading where the group changes, so what needs the owner reads apart from the backlog.
            // Groups come from the rank order next-work.mjs already decided; nothing is re-ranked here.
            const group: NextWorkGroup = RANK_GROUP[rankName(row.rank)];
            const heading = index === 0 || group !== RANK_GROUP[rankName(shown[index - 1].rank)];
            return <Fragment key={row.key}>
              {heading && <li role="presentation" className={`owner-group group-${group}`}><span>{{you:'Needs you',due:'Due work',next:'Next work'}[group]}</span></li>}
              <NextWorkRow row={row} index={index} actions={actions} report={work.asks.find(ask=>ask.taskId===(row.boardTask?.kanban?.id || row.noteTask?.kanban?.id || (row.kind==='ask'?row.key.slice(4):'')))} />
            </Fragment>;
          })}
        </ol>}
      {rows.length > PREVIEW && <button type="button" className="owner-now-more" aria-expanded={all} onClick={() => setAll((value) => !value)}>{all ? 'Show less' : `Show all (${rows.length})`}</button>}

      <details className="control-center-foot"><summary>List sources</summary>
        <ListChecks size={13} strokeWidth={1.6} />
        <span>Board tasks, Obsidian checklists and agent requests, in priority order.</span>
        {notes > 0 && <small>{notes} notes read<span className="sr-only"> from your Obsidian vault</span></small>}
      </details>
    </section>
  );
}