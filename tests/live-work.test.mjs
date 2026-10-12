// "N agents are working now" must agree with the lines under it. The strip used to count distinct
// agents but list individual hand-offs, so three identical "Working on Hermes" terminal sessions and
// two untitled router jobs read as "3 agents" over four near-identical rows. liveWork folds
// look-alike hand-offs into one row with a count and keeps the real facts on it (who, where, how long).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { liveWork, elapsedLabel } from '../src/live-work.mjs';

const now = 1_000_000;
const h = (patch) => ({ id: patch.id || String(Math.random()), source: 'router', board: 'router', boardName: 'AI Router', from: 'Bigkiji', to: 'MiMo', title: '', state: 'working', active: true, at: now - 120, note: '', ...patch });

test('look-alike hand-offs fold into one counted row', () => {
  const rows = liveWork([
    h({ id: 's1', source: 'session', boardName: 'Hermes terminal', from: 'You', to: 'Bigkiji', title: 'Working on Hermes', at: now - 60 }),
    h({ id: 's2', source: 'session', boardName: 'Hermes terminal', from: 'You', to: 'Bigkiji', title: 'Working on Hermes', at: now - 600 }),
    h({ id: 'r1' }), h({ id: 'r2', at: now - 3000 }),
  ], now);
  assert.equal(rows.length, 2);
  const terminal = rows.find((row) => row.where === 'Hermes terminal');
  assert.equal(terminal.count, 2);
  assert.equal(terminal.updatedAt, now - 60);
  const router = rows.find((row) => row.where === 'AI Router');
  assert.equal(router.count, 2);
  assert.equal(router.agent, 'MiMo');
  assert.equal(router.title, 'MiMo implementing');
});

test('a titled Kanban card keeps its own row, named first, with its team', () => {
  const rows = liveWork([
    h({ id: 's1', source: 'session', boardName: 'Hermes terminal', from: 'You', to: 'Bigkiji', title: 'Working on Hermes' }),
    h({ id: 'k1', source: 'kanban', board: 'owner', boardName: 'Owner', from: 'bigkiji-review', to: 'Pi', title: 'Prepvela audit', team: 'AppPro' }),
  ], now);
  assert.equal(rows[0].title, 'Prepvela audit');
  assert.equal(rows[0].where, 'AppPro');
  assert.equal(rows[0].count, 1);
});

test('inactive hand-offs are never shown as working', () => {
  assert.deepEqual(liveWork([h({ id: 'x', active: false })], now), []);
});

test('elapsedLabel is honest and short', () => {
  assert.equal(elapsedLabel(now - 20, now), 'just now');
  assert.equal(elapsedLabel(now - 18 * 60, now), '18m ago');
  assert.equal(elapsedLabel(now - 3 * 3600, now), '3h ago');
  assert.equal(elapsedLabel(null, now), '');
});


test('missing sender metadata is English and preserves unknown identity and original activity', () => {
  for (const from of ['指示元未記録', 'unknown', '', undefined, null]) {
    const input = h({ id: 'sender-fixture', from });
    const before = structuredClone(input);
    const [row] = liveWork([input], now);
    assert.equal(row.from, 'Sender not recorded');
    assert.equal(row.agent, 'MiMo');
    assert.equal(row.state, 'working');
    assert.equal(row.updatedAt, input.at);
    assert.deepEqual(input, before);
  }
  assert.equal(liveWork([h({ from: 'You' })], now)[0].from, 'You');
  assert.equal(liveWork([h({ from: 'Bigkiji' })], now)[0].from, 'Bigkiji');
});
