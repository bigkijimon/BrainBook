import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseExecutionState, summarizeQueue, readMovieSchedule } from '../movie-schedule.mjs';

const NOTE = `# state
## 2026-10-28 13:43 JST -- t4 running (MovieAgent)
- NEXT STEP: read the last run_all line
  then relaunch.
## 2026-10-28 13:50 JST -- OWNER PROCESS CORRECTION: one video at a time; side-track closed (MovieAgent)
- Standing rule (rule 12): ONE video end-to-end before any second video.
  Method tests run serially.
- NEXT STEP unchanged: clip review.
`;

test('rule text and next step are read from the note, not hardcoded', () => {
  const parsed = parseExecutionState(NOTE);
  assert.match(parsed.rule.text, /ONE video end-to-end before any second video\. Method tests run serially\./);
  assert.equal(parsed.latest.nextStep, 'NEXT STEP unchanged: clip review.');
  assert.match(parsed.latest.heading, /OWNER PROCESS CORRECTION/);
  assert.equal(parseExecutionState(NOTE.replace(/one video at a time/i, 'changed')).rule, null);
});

test('queue summary keeps only shift01 jobs, separates other live jobs, never invents progress', () => {
  const rows = [
    { job_id: 'shift01-build2-t4-m2-c1-r3', status: 'GENERATING', stage: 'video', updated_at: 'x' },
    { job_id: 'shift01-plate-001', status: 'PASSED' },
    { job_id: 'shift01-old', status: 'FAILED_RETRYABLE' },
    { job_id: 'whatif-ep01', status: 'QUEUED', stage: 'still' },
    { job_id: 'p1-smoke', status: 'PASSED' },
  ];
  const summary = summarizeQueue(rows);
  assert.deepEqual(summary.active.map((job) => job.id), ['shift01-build2-t4-m2-c1-r3']);
  assert.deepEqual(summary.otherActive.map((job) => job.id), ['whatif-ep01']);
  assert.equal(summary.shift01Counts.PASSED, 1);
});

test('unreadable sources are reported as unknown, not as empty success', async () => {
  const result = await readMovieSchedule({ stateFile: path.join(os.tmpdir(), 'no-such-state.md'), run: async () => { throw new Error('gpu-job missing'); } });
  assert.equal(result.state, null);
  assert.equal(result.queue, null);
  assert.equal(result.unknown.length, 2);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'movie-state-'));
  const file = path.join(dir, 's.md');
  await fs.writeFile(file, NOTE);
  const ok = await readMovieSchedule({ stateFile: file, run: async () => '[]' });
  assert.deepEqual(ok.unknown, []);
  assert.equal(ok.queue.active.length, 0);
});
