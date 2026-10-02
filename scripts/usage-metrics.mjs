// Usage measurement for the published web app (goal "役に立つWebアプリを1つ公開して、使われ方を測る").
// Two functions are the whole interface; the future receiver (Worker + D1) calls the same code:
//   acceptEvent(raw)            -> { ok: true, event } | { ok: false, reason }
//     Enforces the note's collection limit: only { id, day, version, screen }. Any other key (IP, answers,
//     free text, name, email) rejects the whole event instead of being stripped, so a leaking client is visible.
//   usageReport(events, today)  -> { users, active: { d1, d7, d30 }, retention: { d1, d7, d30 } }
//     retention.dN = devices seen again exactly N days after their first day / devices whose first day is
//     at least N days before `today`. rate is null when nobody is eligible yet.
// Runtime-neutral (no imports, no `process`) so a Worker can load it. CLI and file adapters: scripts/usage-local.mjs.

const FIELDS = {
  id: /^[A-Za-z0-9-]{16,64}$/, // random per-device id kept in localStorage
  day: /^\d{4}-\d{2}-\d{2}$/,
  version: /^[0-9A-Za-z.-]{1,20}$/,
  screen: /^[a-z][a-z0-9-]{0,31}$/,
};
const DAY_MS = 86_400_000;
const dayNumber = (day) => Date.parse(`${day}T00:00:00Z`) / DAY_MS;

export function acceptEvent(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: 'not an object' };
  const extra = Object.keys(raw).filter((k) => !(k in FIELDS));
  if (extra.length) return { ok: false, reason: `field not allowed: ${extra.join(', ')}` };
  for (const [key, re] of Object.entries(FIELDS)) {
    if (typeof raw[key] !== 'string' || !re.test(raw[key])) return { ok: false, reason: `bad ${key}` };
  }
  if (Number.isNaN(dayNumber(raw.day)) || new Date(dayNumber(raw.day) * DAY_MS).toISOString().slice(0, 10) !== raw.day) {
    return { ok: false, reason: 'bad day' };
  }
  return { ok: true, event: { id: raw.id, day: raw.day, version: raw.version, screen: raw.screen } };
}

export function usageReport(events, today) {
  const now = dayNumber(today);
  const days = new Map(); // id -> Set of day numbers
  for (const e of events) {
    const d = dayNumber(e.day);
    if (d > now) continue; // clock skew from a device; never count the future
    if (!days.has(e.id)) days.set(e.id, new Set());
    days.get(e.id).add(d);
  }
  const activeWithin = (n) => [...days.values()].filter((s) => [...s].some((d) => d > now - n)).length;
  const retained = (n) => {
    let eligible = 0, returned = 0;
    for (const s of days.values()) {
      const first = Math.min(...s);
      if (first > now - n) continue;
      eligible++;
      if (s.has(first + n)) returned++;
    }
    return { eligible, returned, rate: eligible ? returned / eligible : null };
  };
  return {
    users: days.size,
    active: { d1: activeWithin(1), d7: activeWithin(7), d30: activeWithin(30) },
    retention: { d1: retained(1), d7: retained(7), d30: retained(30) },
  };
}
