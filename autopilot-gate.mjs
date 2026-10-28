import fs from 'node:fs/promises';

// Retry gate for every path that starts a run for a vault/goal step (autopilot tick AND owner Run).
// A step that was handed to an agent (or whose planning failed) is not handed out again until a
// cooldown has passed. The cooldown must outlast one real run (Kanban cards are created with
// --max-runtime 2h) and the 10 min tick, otherwise every tick re-plans the same step
// (2026-10-28: 14 simultaneous planner processes for one goal step).
//
// acquire() is the only entry point a caller needs, and it is atomic in two ways:
//   1. the in-memory claim is made synchronously, before any await, so concurrent callers cannot interleave;
//   2. the attempt is written to disk BEFORE the run starts, so a restart (ship.sh kickstart, crash)
//      while the planner subprocess is still alive cannot make the next boot plan the same step again.
export const ATTEMPT_COOLDOWN_MS = 3 * 3_600_000;
const MAX_COOLDOWN_MS = 24 * 3_600_000;

export const createAutopilotGate = ({ file }) => {
  let attempts = null;
  const inflight = new Set();
  const load = async () => {
    if (attempts) return attempts;
    try { attempts = JSON.parse(await fs.readFile(file, 'utf8')); } catch { attempts = {}; }
    return attempts;
  };
  const persist = async (map) => {
    const temp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(temp, `${JSON.stringify(map, null, 2)}\n`);
    await fs.rename(temp, file);
  };
  const cooldownFor = (entry) => Math.min(MAX_COOLDOWN_MS, ATTEMPT_COOLDOWN_MS * 2 ** Math.max(0, (entry.failures || 1) - 1));
  return {
    // Synchronous claim so overlapping callers cannot both start the same step.
    begin(id) { if (inflight.has(id)) return false; inflight.add(id); return true; },
    async check(id, at = Date.now()) {
      if (inflight.has(id)) return { ok: false, why: 'attempt in flight' };
      const entry = (await load())[id];
      if (entry && at - entry.at < cooldownFor(entry)) return { ok: false, why: `attempted ${new Date(entry.at).toISOString()}, cooling down` };
      return { ok: true };
    },
    // cooldown:false is for the owner's own Run click: it may retry a cooled-down step, never overlap a live run.
    async acquire(id, { at = Date.now(), cooldown = true } = {}) {
      if (!this.begin(id)) return { ok: false, why: 'attempt in flight' };
      try {
        const map = await load();
        const entry = map[id];
        if (cooldown && entry && at - entry.at < cooldownFor(entry)) {
          inflight.delete(id);
          return { ok: false, why: `attempted ${new Date(entry.at).toISOString()}, cooling down` };
        }
        // Pessimistic: counted as a failure until record() says the run produced a card.
        map[id] = { at, failures: (entry?.failures || 0) + 1, pending: true };
        await persist(map);
        return { ok: true };
      } catch (error) { inflight.delete(id); throw error; }
    },
    async record(id, { ok }, at = Date.now()) {
      inflight.delete(id);
      const map = await load();
      const entry = map[id];
      map[id] = { at, failures: ok ? 0 : entry?.pending ? entry.failures : (entry?.failures || 0) + 1 };
      await persist(map);
    },
  };
};
