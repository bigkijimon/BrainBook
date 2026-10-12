// Test-only page for scripts/test-control-center.mjs: the real ControlCenter / Next Work List fed the
// work the board, the vault and agent-feed.py actually produce, so "the list shows text" and "the row
// controls are reachable with a finger" are measured on a rendered card instead of read off a diff.
//
// Every fixture below names the ranking rule it exercises. src/next-work.mjs owns the ranks; this page
// only supplies inputs, exactly as App.tsx does:
//
//   an ask joined onto a board card    the row that printed "App Dev · [object Object]"
//   an ask joined onto a vault line    the row that printed "Next Work List · [object Object]"
//   an ask for a card nobody here owns a plain-text row with no button, which must still be readable
//   needs_attention, overdue, today    the ranks that share and split the amber and red pills, so the
//                                      meaning is carried by a word and a glyph, not by hue alone
//   high, this week, next              the tail of the list, including the one pill that prints a date
//   running / waiting for the GPU / queued  every Run state a row can carry. "Waits for night GPU" is
//                                      the longest label there is, and it is on a row that also owns a
//                                      tick button, which is the phone layout's worst case.
//   a note title with one long unbroken word   wrapping, not a clipped or ellipsized line
//
// The dates are relative to the moment the page is served, so "today" and "this week" mean the same
// thing to the module and to the assertions that read the pills back. Nothing here is typed by hand
// twice: the fixtures build the same Task / VaultTask / ask shapes the server sends.
//
// No server, model, scheduler or network is used: the data is literal here and the page is served from
// disk by the test's own vite instance.
import { createRoot } from 'react-dom/client';
import { ControlCenter, type ControlWork } from '../../src/ControlCenter';
import '../../src/styles.css';
import type { RoutingMeta, Task, VaultTask } from '../../src/types';

const BASE = Date.now();

// Local time, like the reminder parser in server.mjs writes it, so "due today" means today here too.
const at = (days: number, hour: number) => {
  const date = new Date(BASE);
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
};
// 23:59 rather than a round hour: the "today" rank holds until the day ends, so this row cannot flip to
// "overdue" in the middle of a test run the way a 17:00 deadline could.
const lateToday = () => {
  const date = new Date(BASE);
  date.setHours(23, 59, 0, 0);
  return date.toISOString();
};

const routing = (domainLabel: string): RoutingMeta => ({
  domain: domainLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  domainLabel,
  priority: 'normal',
  priorityReason: '',
  worker: 'hermes',
  routeSource: 'deterministic',
  routeStatus: 'ready',
  confidence: 1,
  keywords: [],
});

const task = (id: string, title: string, patch: Partial<Task> = {}): Task => ({
  id,
  title,
  description: '',
  status: 'inbox',
  source: 'work',
  priority: 'normal',
  routing: routing('App Dev'),
  plan: null,
  planStatus: 'idle',
  planError: null,
  dueAt: null,
  notes: [],
  isArchived: false,
  kanban: null,
  lifeArea: 'work',
  createdAt: new Date(BASE).toISOString(),
  updatedAt: new Date(BASE).toISOString(),
  ...patch,
});

// A Hermes Kanban card. `gpu: true` is what turns a scheduled card into "Waits for night GPU".
const card = (id: string, status: string, gpu = false): NonNullable<Task['kanban']> =>
  ({ board: 'owner', id, status, assignee: 'default', queuedAt: null, gpu });

const line = (id: string, text: string, patch: Partial<VaultTask> = {}): VaultTask => ({
  id,
  path: 'Projects/Next-Work-List.md',
  line: 3,
  text,
  done: false,
  dueAt: null,
  reminder: false,
  title: 'Next Work List',
  section: '',
  url: 'obsidian://open?vault=Projects&file=Next-Work-List',
  ...patch,
});

const work: ControlWork = {
  focus: 'work',
  tasks: [
    // The row that printed "App Dev · [object Object]": the board already owns this card and the agent
    // is blocked on it, so the ask joins the card's own row instead of adding a second one.
    task('t_review', 'Fix the sign-in redirect that drops the return path', {
      status: 'needs_attention',
      routing: routing('App Dev'),
      kanban: card('t_review', 'blocked'),
    }),
    task('t_voice', 'Answer the phone hands-free while driving to the office', {
      status: 'needs_attention',
      routing: routing('Personal'),
    }),
    task('t_invoice', 'Send the September invoice to the client', { status: 'working', dueAt: at(-3, 9) }),
    task('t_release', 'Cut build 205 and publish the release note in Obsidian', { dueAt: lateToday() }),
    task('t_plan', 'Draft the Q4 hiring plan for the app team', { priority: 'high', routing: routing('People Ops') }),
    task('t_gpu', 'Render lesson 04 keyframes on the GPU', { status: 'working', routing: routing('Movie'), kanban: card('t_gpu', 'scheduled', true) }),
    task('t_running', 'Repair the phone layout on the Control Center card', { status: 'working', kanban: card('t_running', 'running') }),
    task('t_queued', 'Write the weekly note to the running log', { kanban: card('t_queued', 'ready'), dueAt: at(4, 9) }),
    task('t_backlog', 'Tidy the retired drafts out of the vault', { status: 'inbox', routing: routing('Movie') }),
    // One unbreakable word, the shape that used to ellipsize a title to "Deploy…".
    task('t_long', `Ship the ${'deploymentnotes'.repeat(9)} checklist`, { routing: routing('Ops') }),
  ],
  vaultTasks: [
    // The row that printed "Next Work List · [object Object]": the vault line owns this card. No section
    // on purpose - the row is labelled from the note it lives in, which is the string the owner was shown.
    line('Projects/Next-Work-List.md:12', 'Book the venue for the autumn meetup', {
      kanban: card('t_line', 'blocked'),
    }),
    // A dated line with a long section name: the reason is `section || title`, so this is where a long
    // place name has to wrap rather than push the row past the card.
    line('Projects/Next-Work-List.md:18', 'Renew the domain before it lapses', {
      dueAt: at(2, 8),
      section: 'Autumn meetup and the winter maintenance window',
    }),
    line('Projects/Groceries.md:4', 'Buy coffee for the office', { title: 'Groceries', path: 'Projects/Groceries.md', url: 'obsidian://open?vault=Projects&file=Groceries' }),
  ],
  asks: [
    { taskId: 't_review', taskTitle: 'Fix the sign-in redirect that drops the return path', boardName: 'owner', text: '⛔ STOPPED FOR YUMA: not approved after the review. A second sentence that must be dropped.' },
    { taskId: 't_line', taskTitle: 'Book the venue for the autumn meetup', boardName: 'owner', text: 'STOPPED FOR YUMA: unsupported format from the review tool.' },
    // Nobody on this page can open this one: another board, or the Router. It keeps its own row.
    { taskId: 't_router', taskTitle: 'Router job: rebuild the worker registry', boardName: 'AI Router', text: 'STOPPED FOR YUMA: needs a decision on the plan.' },
  ],
};

// Every callback is a no-op: this page exists to measure what the card renders, and the harness is not
// served an API, so a click must not fetch or throw.
const actions = { openTask: () => {}, runTask: () => {}, runVault: () => {}, toggle: () => {} };
const entry = { open: false, onToggle: () => {}, onSaved: () => {} };

// The real shell and the real four-column workspace around it, so the card sits on the same backdrop
// and in the same column it does in the app: at 1440 that column is ~724px, which is the width the
// wrapping rules on a row were written for, and the page gradient behind the card is what every
// contrast pair on it is measured against. The three empty boxes are the rail, the sidebar and the
// inspector: layout only, carrying nothing.
createRoot(document.getElementById('root')!).render(
  <div className="app-shell">
    <div className="workspace">
      <div />
      <div />
      <div className="main-content">
        <ControlCenter work={work} entry={entry} actions={actions} notes={214} />
      </div>
      <div />
    </div>
  </div>,
);