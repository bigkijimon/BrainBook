// The Next Work List (owner 2026-10-02): "consolidate the task entry points into the Control
// Center / Next Work List". Before this, the ranking lived in two places that disagreed — the "Do
// now" panel and the top-bar Run menu each built their own list of what to work on, one per note
// section and the other per checklist line. This module is the single owner of that decision, so
// the Control Center list, the top-bar count and the Run button on a card cannot drift apart.
//
// Pure by construction: the caller passes the clock and the data, the rows come back ranked. No
// fetching, no locale formatting (labels are built by the caller from NEXT_WORK_RANKS), so a test
// can read the rules without a browser or a vault.
//
// One piece of work, one row. An agent's "waiting on you" message names the Kanban card it stopped
// on, and that card is usually already a row here, so the message becomes that row's reason instead
// of a second row and a second count. An ask for a card this app does not own (another board, the
// Router) keeps its own row, because nothing on this page can open it.
import { matchesFocus } from './task-focus.mjs';

// Rank vocabulary, lowest first. The caller labels a row from the name, so a rank added here shows
// up with its own tone instead of falling through to a default.
export const NEXT_WORK_RANKS = { ask: 0, attention: 1, overdue: 2, today: 3, high: 4, soon: 5, next: 6 };

// The owner's own curated list of what to work on (Projects/Next-Work-List.md and notes titled
// "Priority list"). An undated checkbox line in any other note is note content, not work, so it
// stays out of the list; a dated line always qualifies, deadline or not.
const CURATED_LIST = /next work list|priority list/i;
// A section the owner parked is not next work, even inside the curated list.
const ON_HOLD = /on hold/i;
const WEEK_MS = 7 * 86400000;

// Owner 2026-09-30: "no raw information". An agent's blocked message is reduced to one plain reason.
const plainReason = (text) => {
  const clean = String(text || '').replace(/[\u26d4\u26a0\ufe0f\u274c]/gu, '').replace(/^\s*stopped for yuma:\s*/i, '').trim();
  if (/not approved after/i.test(clean)) return 'QA did not pass. Needs your decision.';
  if (/unsupported format|vision .*fail/i.test(clean)) return 'The review tool failed. Needs a retry.';
  return clean.split(/(?<=[.!?。])\s/)[0].slice(0, 90);
};

// 📅 / ⏳ dates ride along in the checkbox text; the row shows the line itself and the due rank does
// the rest, so the date is stripped from the title to keep the row to one line.
const stripDate = (text) => String(text || '').replace(/[\u{1F4C5}\u23F3]\s*\d{4}-\d{2}-\d{2}/gu, '').trim();

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
const waitingOn = (asks) => {
  const byCard = new Map();
  (asks || []).forEach((ask) => {
    if (ask && ask.taskId && !byCard.has(ask.taskId)) byCard.set(ask.taskId, { title: ask.taskTitle || 'Agent waiting', boardName: ask.boardName, reason: plainReason(ask.text) });
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
  const claim = (cardId) => {
    if (!cardId || !waiting.has(cardId)) return null;
    const reason = waiting.get(cardId);
    waiting.delete(cardId);
    return reason;
  };

  (tasks || []).forEach((task) => {
    // Claimed before the filter: a card that is finished or out of focus takes its waiting row with
    // it, instead of leaving a "needs you" row for work nobody is waiting on any more.
    const reason = task ? claim(task.kanban?.id) : null;
    if (!task || task.isArchived || task.status === 'done' || !matchesFocus(task, focus)) return;
    const due = dueRank(task.dueAt, clock);
    const rank = reason ? NEXT_WORK_RANKS.ask
      : task.status === 'needs_attention' ? NEXT_WORK_RANKS.attention
        : due ? NEXT_WORK_RANKS[due]
          : task.priority === 'high' ? NEXT_WORK_RANKS.high
            : NEXT_WORK_RANKS.next;
    rows.push({
      key: task.id,
      kind: 'task',
      rank,
      title: task.title,
      detail: [task.routing?.domainLabel, reason].filter(Boolean).join(' · '),
      dueAt: task.dueAt || null,
      href: null,
      boardTask: task,
      noteTask: null,
    });
  });

  (vaultTasks || []).forEach((line) => {
    const reason = line ? claim(line.kanban?.id) : null;
    if (!line || line.done) return;
    const due = dueRank(line.dueAt, clock);
    const curated = CURATED_LIST.test(line.title || '') && !ON_HOLD.test(line.section || '');
    if (!due && !curated) return;
    const where = line.section || line.title || '';
    rows.push({
      key: `note:${line.id}`,
      kind: 'note',
      rank: reason ? NEXT_WORK_RANKS.ask : due ? NEXT_WORK_RANKS[due] : NEXT_WORK_RANKS.next,
      title: stripDate(line.text) || line.title || '',
      detail: reason ? [where, reason].filter(Boolean).join(' · ') : where,
      dueAt: line.dueAt || null,
      href: line.url || null,
      boardTask: null,
      noteTask: line,
    });
  });

  // Claims the board and the vault did not take: a card on someone else's board. It leads the list
  // because it is the only row nothing on this page can act on.
  waiting.forEach((ask, cardId) => rows.push({
    key: `ask:${cardId}`,
    kind: 'ask',
    rank: NEXT_WORK_RANKS.ask,
    title: ask.title,
    detail: [ask.boardName, ask.reason].filter(Boolean).join(' · '),
    dueAt: null,
    href: null,
    boardTask: null,
    noteTask: null,
  }));

  return rows.sort((left, right) => left.rank - right.rank || String(left.title).localeCompare(String(right.title)));
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