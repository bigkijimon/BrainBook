// What the "agents working now" strip lists. The headline counts agents, so the rows below it must
// not repeat the same agent doing the same kind of thing: look-alike hand-offs fold into one row with
// a count, and a titled Kanban card keeps its own row because it is the only kind that says what the
// work is. Only fields the flow feed already carries are used - nothing is invented.

// Seconds, like the feed's `at`. Honest wording: for a session `at` is its last activity, so this says
// "ago", never "started".
export function elapsedLabel(at, now = Date.now() / 1000) {
  if (!Number.isFinite(at)) return '';
  const seconds = Math.max(0, now - at);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// Backend missing-data markers describe absence, not a quoted sender or inferred identity.
const senderLabel = value => typeof value === 'string' && value.trim() && !/^(?:unknown|指示元未記録)$/.test(value.trim()) ? value : 'Sender not recorded';

export function liveWork(handoffs, now = Date.now() / 1000) {
  const groups = new Map();
  for (const handoff of handoffs || []) {
    if (!handoff.active) continue;
    const titled = handoff.source === 'kanban' && Boolean(handoff.title);
    const where = handoff.team || handoff.boardName || handoff.board || '';
    const key = titled ? `card:${handoff.id}:${handoff.from || "unknown"}>${handoff.to}` : `${handoff.source}:${handoff.from}>${handoff.to}:${where}:${handoff.title}`;
    const at = Number.isFinite(handoff.at) ? handoff.at : null;
    const group = groups.get(key);
    if (group) {
      group.count += 1;
      if (at !== null && (group.updatedAt === null || at > group.updatedAt)) group.updatedAt = at;
      continue;
    }
    groups.set(key, {
      key, kind: titled ? 'card' : handoff.source === 'router' ? 'router' : 'session', from: senderLabel(handoff.from), agent: handoff.to,
      title: handoff.title || (handoff.source === 'router' ? `${handoff.to} implementing` : handoff.boardName || 'Working'),
      where, state: handoff.state, count: 1, updatedAt: at,
    });
  }
  const order = { card: 0, router: 1, session: 2 };
  return [...groups.values()].sort((a, b) => order[a.kind] - order[b.kind] || (b.updatedAt || 0) - (a.updatedAt || 0));
}
