// Next Work List contract (owner 2026-10-02: "consolidate the task entry points into the Control
// Center / Next Work List"). The ranking used to be built twice in the UI — once as "Do now" rows
// and once in the top-bar Run menu — and the two disagreed about the same work. These tests pin the
// single rule set in src/next-work.mjs, including the two facts the caller must not re-derive: a row
// carries the task it came from, and an undated checklist line is work only when the owner curated
// it into their own list.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  NEXT_WORK_RANKS, RANK_GROUP, RANK_HINT, RANK_LABEL, RANK_TONE, RUN_HINT, RUN_LABEL,
  asText, markDoneName, nextWorkCounts, nextWorkList, rankName, rowLabel, rowNoteId, runName, runState, runSummary,
} from '../src/next-work.mjs';

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

test('a non-string field from the feed can never print "[object Object]"', () => {
  // The unit tests above all feed strings, so they cannot see the one place a record still got
  // stringified: `plainReason` and `stripDate` both used to open with `String(text || '')`, and
  // `String(record)` is "[object Object]". agent-feed.py is the producer, and nothing in it guarantees
  // a JSON object arrives as a string — a message field that became a `{text: ...}` map one release ago
  // would put the owner's exact bug back on the card, in a row no test here had built.
  const rows = nextWorkList({
    now,
    tasks: [board({ title: 'Board card', status: 'needs_attention', kanban: { board: 'owner', id: 't_obj', status: 'blocked', assignee: 'default', queuedAt: null, gpu: false } })],
    vaultTasks: [line({ id: 'list:obj', text: { value: 'Vault line' }, kanban: { board: 'owner', id: 't_obj2', status: 'blocked', assignee: 'default', queuedAt: null, gpu: false } })],
    asks: [
      { taskId: 't_obj', taskTitle: 'Board card', boardName: 'owner', text: { text: 'not approved after the review' } },
      { taskId: 't_obj2', boardName: { board: 'owner' }, text: { text: 'unsupported format from the review tool' } },
    ],
  });
  for (const row of rows) {
    assert.ok(!row.title.includes('[object Object]'), `${row.kind} row title stringifies a record: "${row.title}"`);
    assert.ok(!row.detail.includes('[object Object]'), `${row.kind} row detail stringifies a record: "${row.detail}"`);
    assert.equal(typeof row.title, 'string');
    assert.equal(typeof row.detail, 'string');
  }
  // The row is not merely un-stringified, it is still usable. An unreadable reason drops out of the label
  // rather than joining it as a record, and a checklist line whose text cannot be read falls back to the
  // note it lives in — the same fallback an empty line already had. A work item disappearing is a worse
  // answer than a row that names its note.
  const [first] = rows;
  assert.equal(first.kind, 'task');
  assert.equal(first.title, 'Board card');
  assert.equal(first.detail, 'App Dev', 'an unreadable reason drops out of the label instead of being joined into it');
  assert.ok(rows.some((row) => row.kind === 'note' && row.title === 'Next Work List'), 'the vault line falls back to its note rather than printing the record or vanishing from the list');
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

test('every label a row renders is text, so no row can print "[object Object]"', () => {
  // This is the shape of the bug a screenshot cannot be trusted over: the module handed a wait record
  // to three label joins and every row read "App Dev · [object Object]". Asserted over all three row
  // kinds at once, because the failure is in what leaves `claim`, not in any one of the call sites.
  const rows = nextWorkList({
    now,
    tasks: [board({ title: 'Board card', status: 'needs_attention', kanban: { board: 'owner', id: 't_a', status: 'blocked', assignee: 'default', queuedAt: null, gpu: false } })],
    vaultTasks: [line({ id: 'list:n', text: 'Vault line', kanban: { board: 'owner', id: 't_b', status: 'blocked', assignee: 'default', queuedAt: null, gpu: false } })],
    asks: [
      { taskId: 't_a', taskTitle: 'Board card', boardName: 'owner', text: 'STOPPED FOR YUMA: not approved after the review.' },
      { taskId: 't_b', taskTitle: 'Vault line', boardName: 'owner', text: 'STOPPED FOR YUMA: unsupported format from the review tool.' },
      { taskId: 't_elsewhere', taskTitle: 'Router job', boardName: 'AI Router', text: 'STOPPED FOR YUMA: needs a decision on the plan.' },
    ],
  });
  assert.deepEqual(rows.map((row) => row.kind), ['task', 'ask', 'note'], 'all three row kinds are present, sorted by title within the ask rank');
  for (const row of rows) {
    assert.equal(typeof row.title, 'string', `${row.kind} row title is ${typeof row.title}, not text`);
    assert.equal(typeof row.detail, 'string', `${row.kind} row detail is ${typeof row.detail}, not text`);
    assert.ok(row.title.trim(), `${row.kind} row has an empty title`);
    assert.ok(!row.title.includes('[object Object]') && !row.detail.includes('[object Object]'), `${row.kind} row label stringifies an object: "${row.detail}"`);
  }
});

// The round this card was failed for: the FIRST attempt guarded `title` and `detail` inside
// src/next-work.mjs and left src/ControlCenter.tsx free to build two more labels of its own - the Run
// button's accessible name (`${RUN_LABEL[run]}: ${task.title}`) and the row's `aria-describedby` id
// (built from `row.key` with `.replace`) - out of raw feed fields with no guard in front of them. A
// unit test of `nextWorkList` cannot see either one, because neither is in the module's return value,
// which is why the contract passed while the card could still print `[object Object]`.
//
// So the words and the joins moved into the module and are pinned here instead. Every assertion below
// is about a string the card prints or puts in the DOM, and each is fed a record to prove the guard
// holds: the bug is not that the module mistyped a string, it is that a string was assembled from
// something the feed is free to send as an object.
test('every string the card prints is text, whatever shape the feed sends it in', () => {
  const rows = nextWorkList({
    now,
    tasks: [board({
      id: { slug: 't_obj' },
      title: { text: 'Board card' },
      status: 'needs_attention',
      dueAt: { at: 'sometime' },
      kanban: { board: 'owner', id: { slug: 't_obj' }, status: 'blocked', assignee: 'default', queuedAt: null, gpu: false },
    })],
    vaultTasks: [line({
      id: { path: 'Projects/Next-Work-List.md:3' },
      text: { value: 'Vault line' },
      title: 'Next Work List',
      section: { heading: 'Steps' },
      dueAt: { at: 'tomorrow' },
      url: { href: 'obsidian://note' },
      kanban: { board: 'owner', id: 't_line', status: 'blocked', assignee: 'default', queuedAt: null, gpu: false },
    })],
    asks: [{ taskId: 't_line', taskTitle: { text: 'Vault line' }, boardName: { board: 'owner' }, text: { text: 'unsupported format from the review tool' } }],
  });
  assert.ok(rows.length >= 2, `the fixture lost its rows (${rows.length})`);

  for (const row of rows) {
    // `key` is a React key and the seed of the row's description id, and `.replace` on a record throws.
    assert.equal(typeof row.key, 'string', `${row.kind} row key is a ${typeof row.key}`);
    assert.ok(row.dueAt === null || typeof row.dueAt === 'string', `${row.kind} row dueAt is a ${typeof row.dueAt}, and Intl.format throws on a record`);
    assert.ok(row.href === null || typeof row.href === 'string', `${row.kind} row href is a ${typeof row.href}, and it lands on an <a> verbatim`);
    for (const field of ['key', 'title', 'detail', 'dueAt', 'href']) {
      assert.ok(!String(row[field]).includes('[object Object]'), `${row.kind} row ${field} stringifies a record: "${row[field]}"`);
    }
  }

  // The three joins, each fed the record it used to print.
  assert.equal(runName('idle', { text: 'Board card' }), 'Run', 'an unreadable title drops out of the Run name rather than hanging a colon off the end of it');
  assert.equal(runName('running', 'Ship it'), 'Running: Ship it');
  assert.equal(runName('waiting-gpu', 'Render lesson 04'), 'Waits for night GPU: Render lesson 04');
  assert.equal(markDoneName({ text: 'Book the venue' }), 'Mark done');
  assert.equal(markDoneName('Book the venue'), 'Mark Book the venue done');
  // `rowNoteId` used to be `row.key.replace(...)` in the component: a record key is a TypeError there,
  // which takes the whole card down rather than printing a bad label.
  assert.equal(rowNoteId(3, { slug: 'x' }), 'next-work-3-');
  assert.equal(rowNoteId(3, 'Projects/Next-Work-List.md:12'), 'next-work-3-projects-next-work-list-md-12');
  assert.equal(rowLabel('App Dev', { reason: 'x' }), 'App Dev');
  assert.equal(rowLabel('App Dev', 'QA did not pass.'), 'App Dev · QA did not pass.');
  assert.equal(asText({ text: 'nope' }), '');
  assert.equal(asText('  yes  '), 'yes');
});

test('every rank and every Run state has a word and a sentence, so neither is a colour', () => {
  // refactoring-ui hard rule 7 and fixing-accessibility §7: meaning may not be carried by hue. The
  // pill's colour and glyph live in the component, so what this pins is the half that could regress
  // silently - the WORD and the SENTENCE, which are the only channels a greyscale print, a screen
  // reader and a colourblind reader get. A rank with an empty label or a missing sentence renders as
  // an unlabelled shape.
  for (const [name, rank] of Object.entries(NEXT_WORK_RANKS)) {
    assert.equal(typeof rank, 'number', `${name} is not a rank number`);
    assert.equal(rankName(rank), name, `rank ${rank} does not read back as "${name}"`);
    for (const [what, table] of [['label', RANK_LABEL], ['hint', RANK_HINT], ['tone', RANK_TONE], ['group', RANK_GROUP]]) {
      assert.ok(name in table, `rank "${name}" has no ${what}, so it renders as something else`);
      assert.ok(String(table[name]).trim(), `rank "${name}" has an empty ${what}`);
    }
    // The sentence is what the row points `aria-describedby` at, so it has to be a sentence: an empty
    // or one-word note describes nothing for anyone who cannot see the pill.
    assert.ok(RANK_HINT[name].length >= 20, `rank "${name}" has no sentence behind its label`);
  }
  // Two ranks deliberately share the red pill ("overdue", "today"). Colour cannot separate them, so
  // their WORDS must: this is the pair that would read identically if the labels were ever merged.
  assert.equal(RANK_TONE.overdue, RANK_TONE.today, 'the fixture lost the pair that shares a fill');
  assert.notEqual(RANK_LABEL.overdue, RANK_LABEL.today, '"Overdue" and "Today" read the same, and they share a colour');
  assert.notEqual(RANK_HINT.overdue, RANK_HINT.today, '"Overdue" and "Today" describe the same thing');

  for (const state of Object.keys(RUN_LABEL)) {
    assert.ok(String(RUN_LABEL[state]).trim(), `Run state "${state}" has no label`);
    assert.ok(state in RUN_HINT, `Run state "${state}" has no sentence behind its label`);
    assert.ok(RUN_HINT[state].length >= 20, `Run state "${state}" has no sentence behind its label`);
  }
  // Every word the Run button can print has to be reachable from a real Kanban status, or a label here
  // is dead weight. Read off `runState` rather than a hand-written list, so adding a state to one and
  // not the other fails here. `gpu` is varied because `scheduled` is the one status that splits into
  // two states - the same card is "Queued" on the CPU lane and "Waits for night GPU" on the other.
  const reachable = new Set([
    runState(null), runState({}),
    ...['running', 'scheduled', 'blocked', 'done', 'archived', 'ready'].flatMap((status) => [runState({ kanban: { status, gpu: true } }), runState({ kanban: { status, gpu: false } })]),
  ]);
  for (const state of Object.keys(RUN_LABEL)) {
    assert.ok(reachable.has(state), `Run label "${state}" is one runState can never produce`);
  }
  // `runName` is the button's accessible name; the longest label there is must survive the join whole.
  assert.equal(runName('waiting-gpu', 'Render lesson 04 keyframes on the GPU'), 'Waits for night GPU: Render lesson 04 keyframes on the GPU');
  // An unknown state must not render "undefined": a Run button named `undefined: …` names nothing.
  assert.ok(!runName('nonsense', 'Ship it').includes('undefined'), 'an unknown Run state printed "undefined" into an accessible name');
});