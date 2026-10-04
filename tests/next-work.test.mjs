// Next Work List contract (owner 2026-10-02: "consolidate the task entry points into the Control
// Center / Next Work List"). The ranking used to be built twice in the UI — once as "Do now" rows
// and once in the top-bar Run menu — and the two disagreed about the same work. These tests pin the
// single rule set in src/next-work.mjs, including the two facts the caller must not re-derive: a row
// carries the task it came from, and an undated checklist line is work only when the owner curated
// it into their own list.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NEXT_WORK_RANKS, nextWorkCounts, nextWorkList, runState, runSummary } from '../src/next-work.mjs';

// A fixed clock, and every due date derived from it in local time, so "today" and "this week" mean
// the same thing on the machine that runs the test.
const now = new Date('2026-10-02T10:00:00').getTime();
const due = (dayOffset, hour = 10) => {
  const date = new Date(now);
  date.setDate(date.getDate() + dayOffset);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
};
const board = (patch) => ({
  id: `t-${patch.title}`, title: patch.title, description: '', status: 'inbox', source: 'work',
  priority: 'normal', routing: { domain: 'appdev', domainLabel: 'App Dev', priority: 'normal', priorityReason: '', worker: 'hermes', routeSource: 'deterministic', routeStatus: 'ready', confidence: 1, keywords: [] },
  plan: null, planStatus: 'idle', planError: null, dueAt: null, notes: [], isArchived: false, kanban: null,
  area: null, lifeArea: 'work', createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(), ...patch,
});
const line = (patch) => ({
  id: `Projects/Next-Work-List.md:${patch.text}`, path: 'Projects/Next-Work-List.md', line: 3, text: patch.text,
  done: false, dueAt: null, reminder: false, title: 'Next Work List', section: '', url: 'obsidian://note', ...patch,
});

test('work is ranked: agent waiting, needs you, overdue, today, high, then the tail', () => {
  const rows = nextWorkList({
    now,
    tasks: [
      board({ title: 'Tail task', status: 'working' }),
      board({ title: 'High task', priority: 'high' }),
      board({ title: 'Today task', dueAt: due(0) }),
      board({ title: 'Overdue task', dueAt: due(-2) }),
      board({ title: 'Blocked task', status: 'needs_attention' }),
    ],
    asks: [{ taskId: 't-ask', taskTitle: 'Waiting task', boardName: 'owner', text: 'Blocked: QA said no. Later notes follow.' }],
  });
  assert.deepEqual(rows.map((row) => row.rank), [
    NEXT_WORK_RANKS.ask, NEXT_WORK_RANKS.attention, NEXT_WORK_RANKS.overdue, NEXT_WORK_RANKS.today, NEXT_WORK_RANKS.high, NEXT_WORK_RANKS.next,
  ]);
  assert.deepEqual(rows.map((row) => row.title), ['Waiting task', 'Blocked task', 'Overdue task', 'Today task', 'High task', 'Tail task']);
});

test('high priority outranks a date past this week, and a real deadline outranks priority', () => {
  const rows = nextWorkList({ now, tasks: [board({ title: 'High but late', priority: 'high', dueAt: due(9) })] });
  assert.equal(rows[0].rank, NEXT_WORK_RANKS.high, 'a date past this week is not a deadline, so the priority decides');
  const urgent = nextWorkList({ now, tasks: [board({ title: 'High and today', priority: 'high', dueAt: due(0) })] });
  assert.equal(urgent[0].rank, NEXT_WORK_RANKS.today);
});

test('done and archived board work is not next work', () => {
  const rows = nextWorkList({ now, tasks: [board({ title: 'Finished', status: 'done' }), board({ title: 'Filed', isArchived: true }), board({ title: 'Real' })] });
  assert.deepEqual(rows.map((row) => row.title), ['Real']);
});

test('the Work/Personal switch filters board tasks and leaves the vault lines alone', () => {
  const tasks = [board({ title: 'App work' }), board({ title: 'Home work', lifeArea: 'play' })];
  assert.deepEqual(nextWorkList({ now, tasks, focus: 'work' }).map((row) => row.title), ['App work']);
  assert.deepEqual(nextWorkList({ now, tasks, focus: 'personal' }).map((row) => row.title), ['Home work']);
  const lines = [line({ id: 'Projects/Shop.md:2', path: 'Projects/Shop.md', text: 'Buy milk', title: 'Shop', url: 'obsidian://shop', dueAt: due(0) })];
  assert.deepEqual(nextWorkList({ now, tasks: [], vaultTasks: lines, focus: 'personal' }).map((row) => row.title), ['Buy milk'], 'a dated reminder has a deadline, so the focus switch cannot hide it');
});

test('an undated checklist line is next work only inside the owner-curated list, and never on hold', () => {
  const curated = line({ id: 'list:1', text: 'Write the onboarding checklist' });
  const onHold = line({ id: 'list:2', text: 'Renovate the kitchen', section: 'On hold until spring' });
  const note = line({ id: 'note:1', path: 'ideas/Coffee.md', title: 'Coffee stand', section: 'Steps', text: 'Ask the landlord', url: 'obsidian://coffee' });
  const rows = nextWorkList({ now, vaultTasks: [curated, onHold, note] });
  assert.deepEqual(rows.map((row) => row.title), ['Write the onboarding checklist']);
  assert.equal(rows[0].kind, 'note');
  assert.equal(rows[0].href, 'obsidian://note', 'a note row keeps its Obsidian link');
});

test('a dated line from any note qualifies, and its date is stripped from the row title', () => {
  const rows = nextWorkList({ now, vaultTasks: [line({ id: 'idea:7', path: 'ideas/Coffee.md', title: 'Coffee stand', section: 'Steps', text: '📅 2026-10-01 Ask the landlord', dueAt: due(-1), url: 'obsidian://coffee' })] });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, 'Ask the landlord');
  assert.equal(rows[0].rank, NEXT_WORK_RANKS.overdue);
  assert.equal(rows[0].detail, 'Steps');
});

test('a finished line leaves the list', () => {
  assert.deepEqual(nextWorkList({ now, vaultTasks: [line({ id: 'list:9', text: 'Ship it', done: true })] }), []);
});

test('every row carries the work it came from, so the caller never re-finds it', () => {
  const task = board({ title: 'Open the Control Center' });
  const item = line({ id: 'list:3', text: 'Tidy the repo' });
  const rows = nextWorkList({ now, tasks: [task], vaultTasks: [item] });
  const boardRow = rows.find((row) => row.kind === 'task');
  const noteRow = rows.find((row) => row.kind === 'note');
  assert.equal(boardRow.boardTask, task);
  assert.equal(boardRow.noteTask, null);
  assert.equal(noteRow.noteTask, item);
  assert.equal(noteRow.boardTask, null);
});

test('a blocked agent message is reduced to one plain reason', () => {
  const [row] = nextWorkList({ now, asks: [{ taskId: 't1', taskTitle: 'Marketing page', boardName: 'owner', text: '⛔ STOPPED FOR YUMA: not approved after the review. Second sentence dropped.' }] });
  assert.equal(row.detail, 'owner · QA did not pass. Needs your decision.');
});

test('a card the agent is waiting on is one row, not two, and it is counted once', () => {
  // The board already shows this card as "needs attention", so an extra ask row for the same card
  // would list the same work twice and say "2 need you" on the card headline.
  const task = board({ title: 'Marketing page', status: 'needs_attention', kanban: { board: 'owner', id: 't_abc', status: 'blocked', assignee: 'default', queuedAt: null, gpu: false } });
  const rows = nextWorkList({
    now,
    tasks: [task],
    asks: [{ taskId: 't_abc', taskTitle: 'Marketing page', boardName: 'owner', text: '⛔ STOPPED FOR YUMA: not approved after the review.' }],
  });
  assert.equal(rows.length, 1, 'the ask belongs to the row that already owns the card');
  assert.equal(rows[0].kind, 'task', 'and it is a task row, so it can be opened and run');
  assert.equal(rows[0].rank, NEXT_WORK_RANKS.ask, 'work an agent is waiting on leads the list');
  assert.equal(rows[0].boardTask, task, 'the row still carries the card to open');
  assert.equal(rows[0].detail, 'App Dev · QA did not pass. Needs your decision.');
  assert.deepEqual(nextWorkCounts(rows), { total: 1, needYou: 1, ready: 0, running: 0 });
});

test('the same rule joins an ask onto the Obsidian line that owns the card', () => {
  const checklist = line({ id: 'Projects/Next-Work-List.md:7', text: 'Write the onboarding checklist', kanban: { board: 'owner', id: 't_line', status: 'blocked', assignee: 'default', queuedAt: null, gpu: false } });
  const rows = nextWorkList({ now, vaultTasks: [checklist], asks: [{ taskId: 't_line', taskTitle: 'Write the onboarding checklist', boardName: 'owner', text: 'STOPPED FOR YUMA: unsupported format from the review tool.' }] });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, 'note');
  assert.equal(rows[0].noteTask, checklist);
  assert.equal(rows[0].rank, NEXT_WORK_RANKS.ask);
  assert.equal(rows[0].detail, 'Next Work List · The review tool failed. Needs a retry.');
  assert.deepEqual(nextWorkCounts(rows), { total: 1, needYou: 1, ready: 0, running: 0 });
});

test('an ask for a card this app does not own keeps its own row, and still leads', () => {
  // Another board, or the Router: nothing on this page can open that card, so it must not be
  // folded into somebody else's row - and it must not disappear either.
  const rows = nextWorkList({
    now,
    tasks: [board({ title: 'Ordinary task' })],
    asks: [{ taskId: 't_elsewhere', taskTitle: 'Router job', boardName: 'AI Router', text: 'STOPPED FOR YUMA: needs a decision on the plan.' }],
  });
  assert.deepEqual(rows.map((row) => row.kind), ['ask', 'task']);
  assert.equal(rows[0].rank, NEXT_WORK_RANKS.ask);
  assert.equal(rows[0].detail, 'AI Router · needs a decision on the plan.');
  assert.equal(rows[0].boardTask, null, 'nothing on this page can open it, so it offers no button');
});

test('a finished card takes its waiting row with it', () => {
  const rows = nextWorkList({
    now,
    tasks: [board({ title: 'Shipped', status: 'done', kanban: { board: 'owner', id: 't_done', status: 'blocked', assignee: 'default', queuedAt: null, gpu: false } })],
    asks: [{ taskId: 't_done', taskTitle: 'Shipped', boardName: 'owner', text: 'STOPPED FOR YUMA: old message.' }],
  });
  assert.deepEqual(rows, [], 'a stale blocked event on finished work is not next work');
});

test('runState reads the Kanban card, and nothing else', () => {
  assert.equal(runState(null), 'idle');
  assert.equal(runState({ title: 'x' }), 'idle');
  assert.equal(runState({ title: 'x', kanban: { status: 'ready' } }), 'queued');
  assert.equal(runState({ title: 'x', kanban: { status: 'scheduled', gpu: true } }), 'waiting-gpu');
  assert.equal(runState({ title: 'x', kanban: { status: 'scheduled', gpu: false } }), 'queued');
  assert.equal(runState({ title: 'x', kanban: { status: 'running' } }), 'running');
  assert.equal(runState({ title: 'x', kanban: { status: 'blocked' } }), 'blocked');
  assert.equal(runState({ title: 'x', kanban: { status: 'done' } }), 'done');
  assert.equal(runState({ title: 'x', kanban: { status: 'archived' } }), 'done');
});

test('runSummary counts live hand-offs for the top bar, finished cards excluded', () => {
  const { active, running } = runSummary({
    tasks: [board({ title: 'Running', kanban: { status: 'running' } }), board({ title: 'Queued', kanban: { status: 'ready' } }), board({ title: 'Finished', kanban: { status: 'done' } }), board({ title: 'Waiting for you', kanban: { status: 'blocked' } })],
    vaultTasks: [line({ id: 'list:4', text: 'In the night window', kanban: { status: 'scheduled', gpu: true } })],
  });
  assert.equal(active, 4);
  assert.equal(running, 1);
  assert.deepEqual(runSummary({}), { active: 0, running: 0 });
});

test('the card headline reports needs-you, ready and running from the same rows', () => {
  const rows = nextWorkList({
    now,
    tasks: [
      board({ title: 'Waiting on the owner', status: 'needs_attention' }),
      board({ title: 'Stopped for a decision', kanban: { status: 'blocked' } }),
      board({ title: 'Free to hand off' }),
      board({ title: 'Being worked on', kanban: { status: 'running' } }),
    ],
    asks: [{ taskId: 't1', taskTitle: 'Ask Yuma', boardName: 'owner', text: 'waiting' }],
  });
  assert.deepEqual(nextWorkCounts(rows), { total: 5, needYou: 3, ready: 1, running: 1 });
  assert.deepEqual(nextWorkCounts(), { total: 0, needYou: 0, ready: 0, running: 0 });
});

test('an empty field is an empty list, not an error', () => {
  assert.deepEqual(nextWorkList(), []);
  assert.deepEqual(nextWorkList({ now, tasks: [], vaultTasks: [], asks: [] }), []);
});