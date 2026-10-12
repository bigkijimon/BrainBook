import test from 'node:test';
import assert from 'node:assert/strict';
import { createScenarioRunner, selectValues } from '../scripts/neon-scenarios.mjs';

test('a failed open-modal scenario captures before cleanup, keeps its error, and isolates the next case', async () => {
  const events = [], results = []; let modal = false;
  const run = createScenarioRunner({
    prepare: async () => { assert.equal(modal, false); events.push('prepare'); },
    captureFailure: async () => { assert.equal(modal, true); events.push('capture'); return { path: 'fixture-only', modalOpen: true }; },
    cleanup: async () => { events.push('cleanup'); modal = false; },
    onResult: async result => results.push(result),
  });
  await run('Other work', async () => { modal = true; throw new Error('New request measured 158x42'); });
  await run('Next case', async () => { assert.equal(modal, false); events.push('next'); });
  assert.deepEqual(events, ['prepare', 'capture', 'cleanup', 'prepare', 'next', 'cleanup']);
  assert.equal(results[0].status, 'failed');
  assert.match(results[0].error, /158x42/);
  assert.equal(results[0].failureCapture.modalOpen, true);
  assert.equal(results[1].status, 'exercised');
});

test('capture/cleanup failures preserve the original assertion and block later scenarios', async () => {
  const results = []; let calls = 0;
  const run = createScenarioRunner({
    prepare: async () => {},
    captureFailure: async () => { throw new Error('screenshot unavailable'); },
    cleanup: async () => { throw new Error('page closed during isolation'); },
    onResult: async result => results.push(result),
  });
  await run('Original', async () => { throw new Error('44px assertion failed'); });
  await run('Later', async () => { calls++; });
  assert.equal(calls, 0);
  assert.equal(results[0].status, 'failed');
  assert.match(results[0].error, /44px assertion failed/);
  assert.match(results[0].captureError, /screenshot unavailable/);
  assert.match(results[0].cleanupError, /page closed during isolation/);
  assert.equal(results[1].status, 'blocked');
});

test('a successful assertion cannot pass if scenario cleanup fails', async () => {
  const results = [];
  const run = createScenarioRunner({ prepare: async () => {}, captureFailure: async () => {}, cleanup: async () => { throw new Error('isolation failed'); }, onResult: async r => results.push(r) });
  await run('Case', async () => {});
  assert.equal(results[0].status, 'failed');
  assert.match(results[0].cleanupError, /isolation failed/);
});

test('optional device/motion/scenario filters select clean cases and reject silent empty/unknown runs', () => {
  assert.deepEqual(selectValues(undefined, ['desktop', 'touch390'], 'device'), ['desktop', 'touch390']);
  assert.deepEqual(selectValues('touch390', ['desktop', 'touch390'], 'device'), ['touch390']);
  assert.deepEqual(selectValues('reduce,no-preference', ['no-preference', 'reduce'], 'motion'), ['reduce', 'no-preference']);
  assert.deepEqual(selectValues('home', ['home', 'other-work'], 'scenario'), ['home']);
  assert.throws(() => selectValues('typo', ['desktop'], 'device'), /Unknown device/);
  assert.throws(() => selectValues(' , ', ['home'], 'scenario'), /Empty scenario/);
});
