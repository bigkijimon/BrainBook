// The Next Work List (owner 2026-10-02): "consolidate the task entry points into the Control
// Center / Next Work List". Before this, the ranking lived in two places that disagreed — the "Do
// now" panel and the top-bar Run menu each built their own list of what to work on, one per note
// section and the other per checklist line. This module is the single owner of that decision, so
// the Control Center list, the top-bar count and the Run button on a card cannot drift apart.
//
// Pure by construction: the caller passes the clock and the data, the rows come back ranked. No
// fetching and no locale formatting, so a test can read the rules without a browser or a vault.
// The rank WORDS the card prints live with the rank NUMBERS here rather than in the component,
// because they are the same decision: a rank number with no word can only be read as a colour, and
// a name assembled in the component out of a raw field is how "App Dev · [object Object]" reached
// this card in the first place.
//
// One piece of work, one row. An agent's "waiting on you" message names the Kanban card it stopped
// on, and that card is usually already a row here, so the message becomes that row's reason instead
// of a second row and a second count. An ask for a card this app does not own (another board, the
// Router) keeps its own row, because nothing on this page can open it.
import { matchesFocus } from './task-focus.mjs';

// Text or nothing, never a record. Every label a row renders goes through here, so the module's one
// promise is checkable instead of assumed: whatever the board, the vault or the agent feed sends, what
// reaches the card is a string. `String(record)` is "[object Object]", which is what the owner's Next
// Work List used to read next to "App Dev" and "Next Work List" (tests/next-work.test.mjs, "every label
// a row renders is text"). A non-string is dropped here rather than printed.
//
// It is declared FIRST, above every text helper and above every label join below, and it is EXPORTED
// for two reasons. Order: `plainReason` and `stripDate` used to open with `String(text || '')`, which
// is the one place a record from the feed gets stringified, so `ask.text` or `line.text` arriving as
// an object printed "[object Object]" again in a row the tests never built, because the tests only
// ever fed strings. Export: the card used to assemble two of its own labels - the Run button's
// accessible name and the row's note id - out of raw `task.title` and `row.key` with no guard in
// front of them, which is the same bug through a different door. A guard is only a promise if nothing
// downstream can bypass it.
export const asText = (value) => (typeof value === 'string' ? value.trim() : '');

// Rank vocabulary, lowest first. The caller labels a row from the name, so a rank added here shows
// up with its own tone instead of falling through to a default.
export const NEXT_WORK_RANKS = { ask: 0, attention: 1, overdue: 2, today: 3, high: 4, soon: 5, next: 6 };

// The words, with the numbers. These used to be four `Record<NextWorkRank, …>` tables in
// src/ControlCenter.tsx, which meant two of the three strings a row prints - the Run button's
// accessible NAME (`${RUN_LABEL[run]}: ${task.title}`) and its row's note id, built from `row.key` -
// were assembled in the component, out of `task.title` and `row.key`, with no guard in front of them.
// The bug this card was failed for was exactly that: a record reaching a label. Fixing `title` and
// `detail` in this module and leaving the component to concatenate its own strings out of raw fields
// closes the seam and leaves it open. So every word and every join now lives here, beside the numbers
// the rows are ranked by, and the card renders what it is handed.
//
// The label of every rank is a WORD, never a hue, and the hint behind it is a sentence rather than a
// `title`: a tooltip is a mouse-only channel, so touch has no hover to wait for and a screen reader
// never reads one. The component keeps the glyph and the tone - a colour and an icon are not text.
export const RANK_LABEL = {
  ask: 'Agent waiting', attention: 'Needs you', overdue: 'Overdue', today: 'Today',
  high: 'High', soon: 'This week', next: 'Next',
};
export const RANK_HINT = {
  ask: 'An agent stopped here and is waiting on you',
  attention: 'This needs a decision from you',
  overdue: 'The due date has already passed',
  today: 'Due today, and the day is not over yet',
  high: 'Marked high priority, with no date on it',
  soon: 'Due within the next seven days',
  next: 'Nothing is pressing on this one',
};
export const RANK_TONE = { ask: 'urgent', attention: 'urgent', overdue: 'due', today: 'due', high: 'high', soon: 'soon', next: 'soon' };
// Three bands: what is waiting on the owner, what is dated, and everything else.
export const RANK_GROUP = { ask: 'you', attention: 'you', overdue: 'due', today: 'due', high: 'next', soon: 'next', next: 'next' };
export const GROUP_LABEL = { you: 'Needs you', due: 'Due', next: 'Next up' };

// What a Run button says, and the sentence that unpacks it. Same rule as the rank hint: "Waits for
// night GPU" means nothing to a finger or a screen reader without the sentence under it.
export const RUN_LABEL = {
  idle: 'Run', queued: 'Queued', 'waiting-gpu': 'Waits for night GPU',
  running: 'Running', blocked: 'Needs you', done: 'Done',
};
export const RUN_HINT = {
  idle: 'Hand this task to Bigkiji. It starts within about a minute, even when you are away.',
  queued: 'Waiting for the Hermes dispatcher to pick it up (checks every minute).',
  'waiting-gpu': 'Needs the GPU, so it starts in the night window (01:00–06:00) when the GPU is free.',
  running: 'Bigkiji is working on this now.',
  blocked: 'Bigkiji stopped and needs a decision from you. See the agent updates.',
  done: 'Finished. See the agent updates for the summary.',
};

// The name of a rank, from the number the rows are sorted by. A number this module did not hand out
// falls back to the quietest rank rather than to `undefined`: `NEXT_WORK_RANKS[7]` would otherwise
// make every lookup below miss at once and take the whole card down with it.
export const rankName = (rank) => {
  for (const name of Object.keys(NEXT_WORK_RANKS)) if (NEXT_WORK_RANKS[name] === rank) return name;
  return 'next';
};

// ── the three joins a row is made of ────────────────────────────────────────────────────────────────
// Every string the card prints for a row comes out of one of these. They are exported rather than
// kept private so the card cannot build a fourth one of its own: a label is a join of parts the feed
// sent, and an unjoined part is a record.

// `<rank label> · <team> · <reason>` on the row body.
export const rowLabel = (...parts) => parts.map(asText).filter(Boolean).join(' · ');
// `Run: <task title>` on the Run button's accessible name. `task.title` is the RAW field off the
// board task, so this join is where "Run: [object Object]" would have come from. A title that cannot
// be read drops out of the name rather than hanging a colon off the end of it - a button announced as
// "Run:" names nothing, and the visible label beside it already says Run.
export const runName = (state, title) => {
  const label = asText(RUN_LABEL[state]) || RUN_LABEL.idle;
  const what = asText(title);
  return what ? `${label}: ${what}` : label;
};
// `Mark <title> done` on the Obsidian tick. Its own join rather than `rowLabel`: the middot separator is
// right for a visible row body, which is read as two pieces of metadata, and wrong here, because this
// string is a button's accessible NAME - "Mark · Book the venue done" is read out as "Mark, dot, Book the
// venue done", and it is also the joined-with-middle-dots tell frontend-design warns about. An
// unreadable title drops out and leaves the bare verb, as in `runName`.
export const markDoneName = (title) => {
  const what = asText(title);
  return what ? `Mark ${what} done` : 'Mark done';
};
// A DOM id from a row key. `row.key` is built here out of `task.id` / `line.id`, which the feed
// controls, so it goes through the same guard: `.replace` on a record is a TypeError, which is the
// loudest possible version of this bug.
export const rowNoteId = (index, key) => `next-work-${index}-${asText(key).replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;

// The owner's own curated list of what to work on (Projects/Next-Work-List.md and notes titled
// "Priority list"). An undated checkbox line in any other note is note content, not work, so it
// stays out of the list; a dated line always qualifies, deadline or not.
const CURATED_LIST = /next work list|priority list/i;
// A section the owner parked is not next work, even inside the curated list.
const ON_HOLD = /on hold/i;
const WEEK_MS = 7 * 86400000;

// Owner 2026-09-30: "no raw information". An agent's blocked message is reduced to one plain reason.
// Reads through `asText` above rather than opening with `String(text || '')`, which is the one place
// a record from the feed gets stringified.
const plainReason = (text) => {
  const clean = asText(text).replace(/[\u26d4\u26a0\ufe0f\u274c]/gu, '').replace(/^\s*stopped for yuma:\s*/i, '').trim();
  if (/not approved after/i.test(clean)) return 'QA did not pass. Needs your decision.';
  if (/unsupported format|vision .*fail/i.test(clean)) return 'The review tool failed. Needs a retry.';
  return clean.split(/(?<=[.!?。])\s/)[0].slice(0, 90);
};

// 📅 / ⏳ dates ride along in the checkbox text; the row shows the line itself and the due rank does
// the rest, so the date is stripped from the title to keep the row to one line.
const stripDate = (text) => asText(text).replace(/[\u{1F4C5}\u23F3]\s*\d{4}-\d{2}-\d{2}/gu, '').trim();

// Where a piece of work stands with the Hermes dispatcher. One mapping for the whole app: the card,
// the Control Center row and the top-bar count all read it, so "Run" never means two things.
export function runState(thing) {
  const status = thing?.kanban?.status;
  if (!status) return 'idle';
  if (status === 'running') return 'running';
  if (status === 'scheduled') return thing.kanban?.gpu ? 'waiting-gpu' : 'queued';
  if (status === 'blocked') return 'blocked';
  if (status === 'done' || status === 'archived') return 'done';
  return 'queued';
}

// Live hand-offs, for the top-bar Run control: what is queued or running right now.
export function runSummary({ tasks = [], vaultTasks = [] } = {}) {
  const live = [...(tasks || []), ...(vaultTasks || [])]
    .filter((item) => item.kanban && !['done', 'archived'].includes(item.kanban.status));
  return { active: live.length, running: live.filter((item) => item.kanban.status === 'running').length };
}

// An agent ask names a Hermes Kanban card, and the card it names is usually a board task or a vault
// line that is already in this list. The same work must not be listed twice and counted twice, so the
// ask is joined onto the row that owns the card — which is also what gives that row a reason and an
// owner who can open it. `claim` hands each ask out once, so what is left at the end is exactly the
// cards this app does not own (another board, the Router): still the owner's decision, still first in
// the list, but with nothing here to open.

// The value is a record, not a string: the reason is the text a row shows, `title`/`boardName` are
// what a row with no card of its own is labelled from. The record never leaves this module - `claim`
// below hands out `.reason`, a string, and every label join below goes through `rowLabel`, so the one
// thing a row can put in its label can never be the record itself. An earlier version handed the whole
// record to three call sites and every row label read "[object Object]".
const waitingOn = (asks) => {
  const byCard = new Map();
  (asks || []).forEach((ask) => {
    if (ask && ask.taskId && !byCard.has(ask.taskId)) byCard.set(ask.taskId, { title: asText(ask.taskTitle) || 'Agent waiting', boardName: asText(ask.boardName), reason: plainReason(ask.text) });
  });
  return byCard;
};

const dueRank = (dueAt, now) => {
  const due = Date.parse(dueAt || '');
  if (!Number.isFinite(due)) return null;
  if (due < now) return 'overdue';
  if (due <= endOfDay(now)) return 'today';
  if (due <= now + WEEK_MS) return 'soon';
  return null;
};

const endOfDay = (now) => {
  const date = new Date(now);
  date.setHours(23, 59, 59, 999);
  return date.getTime();
};

/**
 * Everything that could be worked on next, ranked. The caller renders rows; it never re-ranks.
 *
 * @param {Object} input
 * @param {import('./types').Task[]} [input.tasks]         board tasks
 * @param {import('./types').VaultTask[]} [input.vaultTasks] Obsidian checklist lines
 * @param {{ taskId: string; taskTitle: string; boardName: string; text: string }[]} [input.asks] agents blocked on the owner, joined onto the row that owns `taskId`
 * @param {number} [input.now]   clock in ms (injected so a test can fix "today")
 * @param {'work'|'personal'} [input.focus]  Work/Personal switch; only board tasks are filtered by it
 * @returns {{ key: string; kind: 'ask'|'task'|'note'; rank: number; title: string; detail: string; dueAt: string|null; href: string|null; boardTask: object|null; noteTask: object|null }[]}
 */
export function nextWorkList({ tasks = [], vaultTasks = [], asks = [], now = Date.now(), focus = 'work' } = {}) {
  const clock = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  const rows = [];
  const waiting = waitingOn(asks);
  // Hands out the reason for one card, once, as the string a row shows. The record stays inside this
  // module: a caller only ever receives text, so no row label can print "[object Object]", and the
  // leftover loop at the bottom still gets the record it needs to label an unowned card.
  const claim = (cardId) => {
    if (!cardId || !waiting.has(cardId)) return null;
    const reason = waiting.get(cardId).reason;
    waiting.delete(cardId);
    return reason;
  };

  (tasks || []).forEach((task) => {
    // Claimed before the filter: a card that is finished or out of focus takes its waiting row with
    // it, instead of leaving a "needs you" row for work nobody is waiting on any more.
    const reason = task ? claim(task.kanban?.id) : null;
    if (!task || task.isArchived || task.status === 'done' || (focus !== 'all' && !matchesFocus(task, focus))) return;
    const due = dueRank(task.dueAt, clock);
    const rank = reason ? NEXT_WORK_RANKS.ask
      : task.status === 'needs_attention' ? NEXT_WORK_RANKS.attention
        : due ? NEXT_WORK_RANKS[due]
          : task.priority === 'high' ? NEXT_WORK_RANKS.high
            : NEXT_WORK_RANKS.next;
    rows.push({
      // `key` is a string the feed does not get to type. It is a React key and the seed of the row's
      // `aria-describedby` id, so a record here is either a duplicate-key warning or a `.replace`
      // TypeError in the card - the same bug as a record in a label, one call earlier.
      key: asText(task.id),
      kind: 'task',
      rank,
      title: asText(task.title),
      detail: rowLabel(task.routing?.domainLabel, reason),
      // `dueAt` is read back by the card (`formatShort`) and by every reminder view, and `new Date(…)`
      // on a record is an Invalid Date that throws in `Intl.format`. A date is a string or nothing.
      dueAt: asText(task.dueAt) || null,
      href: null,
      boardTask: task,
      noteTask: null,
    });
  });

  (vaultTasks || []).forEach((line) => {
    const reason = line ? claim(line.kanban?.id) : null;
    if (!line || line.done) return;
    // Read through `asText` before the pattern, not `line.title || ''`: a regex coerces its argument,
    // so a record title was tested as the literal string "[object Object]" - which matches nothing,
    // which silently dropped the owner's own curated line out of the list instead of naming it.
    const note = asText(line.title);
    const section = asText(line.section);
    const due = dueRank(line.dueAt, clock);
    const curated = CURATED_LIST.test(note) && !ON_HOLD.test(section);
    if (!due && !curated) return;
    const where = section || note;
    rows.push({
      key: `note:${asText(line.id)}`,
      kind: 'note',
      rank: reason ? NEXT_WORK_RANKS.ask : due ? NEXT_WORK_RANKS[due] : NEXT_WORK_RANKS.next,
      title: stripDate(line.text) || note,
      detail: reason ? rowLabel(where, reason) : asText(where),
      dueAt: asText(line.dueAt) || null,
      // An `href` goes straight onto an `<a>`, so it is the one field that reaches the DOM verbatim.
      href: asText(line.url) || null,
      boardTask: null,
      noteTask: line,
    });
  });

  // Claims the board and the vault did not take: a card on someone else's board. It leads the list
  // because it is the only row nothing on this page can act on.
  waiting.forEach((ask, cardId) => rows.push({
    key: `ask:${asText(cardId)}`,
    kind: 'ask',
    rank: NEXT_WORK_RANKS.ask,
    title: ask.title,
    detail: rowLabel(ask.boardName, ask.reason),
    dueAt: null,
    href: null,
    boardTask: null,
    noteTask: null,
  }));

  // Rank first, then alphabetical within a rank: "App Dev" before "Next Work List", so two rows an
  // agent is waiting on never swap places between a render and the next one.
  return rows.sort((left, right) => left.rank - right.rank || left.title.localeCompare(right.title));
}

// The headline numbers on the card: what needs the owner, what is free to hand off, what is running.
export function nextWorkCounts(rows = []) {
  const counts = { total: (rows || []).length, needYou: 0, ready: 0, running: 0 };
  (rows || []).forEach((row) => {
    const target = row.boardTask || row.noteTask;
    const state = runState(target);
    // Work the owner must decide on is never also "ready": handing it to an agent would just repeat
    // the question an agent already stopped on.
    if (row.rank <= NEXT_WORK_RANKS.attention || state === 'blocked') counts.needYou += 1;
    else if (target && state === 'idle') counts.ready += 1;
    if (state === 'running') counts.running += 1;
  });
  return counts;
}