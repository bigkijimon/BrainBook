import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createAutopilotGate, ATTEMPT_COOLDOWN_MS } from '../autopilot-gate.mjs';

const HOUR = 3_600_000;
const tmpFile = async () => path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'brainbook-gate-')), 'attempts.json');

test('cooldown is longer than one real run (kanban max-runtime 2h) and the 10 min tick', () => {
  assert.ok(ATTEMPT_COOLDOWN_MS > 2 * HOUR);
});

test('a step is not retried by the next tick after an attempt, even when the attempt failed to produce a card', async () => {
  const gate = createAutopilotGate({ file: await tmpFile() });
  const t0 = 1_000_000;
  assert.equal((await gate.check('step-a', t0)).ok, true);
  await gate.record('step-a', { ok: false }, t0);
  assert.equal((await gate.check('step-a', t0 + 10 * 60_000)).ok, false);
  assert.equal((await gate.check('step-a', t0 + 2 * HOUR)).ok, false);
});

test('a dead/hung attempt recovers to eligible after the cooldown, and repeated failures back off', async () => {
  const gate = createAutopilotGate({ file: await tmpFile() });
  const t0 = 1_000_000;
  await gate.record('s', { ok: false }, t0);
  assert.equal((await gate.check('s', t0 + ATTEMPT_COOLDOWN_MS + 1)).ok, true);
  await gate.record('s', { ok: false }, t0 + ATTEMPT_COOLDOWN_MS + 1);
  assert.equal((await gate.check('s', t0 + 2 * ATTEMPT_COOLDOWN_MS + 2)).ok, false);
});

test('acquire records the attempt BEFORE the run starts: a restart mid-run cannot re-plan the step', async () => {
  const file = await tmpFile();
  const a = createAutopilotGate({ file });
  assert.equal((await a.acquire('s', { at: 1000 })).ok, true);
  // server killed here (ship.sh kickstart / crash): record() never runs
  const b = createAutopilotGate({ file });
  assert.equal((await b.acquire('s', { at: 1000 + 10 * 60_000 })).ok, false);
  assert.equal((await b.acquire('s', { at: 1000 + ATTEMPT_COOLDOWN_MS + 1 })).ok, true);
});

test('two concurrent acquires for one step grant exactly one', async () => {
  const gate = createAutopilotGate({ file: await tmpFile() });
  const results = await Promise.all([gate.acquire('s'), gate.acquire('s'), gate.acquire('s')]);
  assert.equal(results.filter((r) => r.ok).length, 1);
});

test('a manual Run ignores the cooldown but never overlaps a run in flight', async () => {
  const gate = createAutopilotGate({ file: await tmpFile() });
  await gate.record('s', { ok: false }, 1000);
  const first = await gate.acquire('s', { at: 2000, cooldown: false });
  assert.equal(first.ok, true);
  assert.equal((await gate.acquire('s', { at: 2001, cooldown: false })).ok, false);
  await gate.record('s', { ok: true }, 2002);
  assert.equal((await gate.acquire('s', { at: 2003, cooldown: false })).ok, true);
});

test('an in-flight step is blocked and the gate survives a restart (persisted)', async () => {
  const file = await tmpFile();
  const a = createAutopilotGate({ file });
  assert.equal(a.begin('s', 5), true);
  assert.equal(a.begin('s', 6), false);
  await a.record('s', { ok: true }, 5);
  const b = createAutopilotGate({ file });
  assert.equal((await b.check('s', 6)).ok, false);
});
