import test from 'node:test';
import assert from 'node:assert/strict';
import { readGatedNext, readPaused, readStoryAriake } from '../movie-schedule.mjs';

const NOTE = `## 2026-10-28 10:46 JST -- QUEUED NEXT standing task: 3D-printer timelapse (MovieAgent) -- NOT STARTED
- Owner words verbatim: x
- START GATE (all must hold): run_all.sh not running AND build_ep02.log shows DONE
  AND final qapro PASS.
## 2026-10-28 13:50 JST -- correction
- Also cleared from the shared queue so nothing second can be picked up: whatif-ep01-shot01..06-still-001 (WHATIF-EP01-SUN,
  a separate video) -> CANCELLED. Undo: \`gpu-job queue retry whatif-ep01-shot0N-still-001\`.
`;
const REG = '| **storyAriake** (added 2026-10-21) | Film (classified: narrative/celebration showcase; no grading) | 3D-first **GPU execution route: ADMITTED 2026-10-21** — x |';

test('gated next project is read from the QUEUED NEXT entry, verbatim gate', () => {
  const next = readGatedNext(NOTE);
  assert.equal(next.title, '3D-printer timelapse');
  assert.equal(next.notStarted, true);
  assert.equal(next.gate, '(all must hold): run_all.sh not running AND build_ep02.log shows DONE AND final qapro PASS.');
  assert.match(readGatedNext('## nothing').unknown, /QUEUED NEXT/);
});

test('paused project: cancelled rows come from the queue, undo command from the note', () => {
  const rows = [1, 2].map((n) => ({ job_id: `whatif-ep01-shot0${n}-still-001`, status: 'CANCELLED', updated_at: '2026-10-28T13:50:57' }));
  const paused = readPaused(NOTE, rows);
  assert.equal(paused.label, 'WHATIF-EP01-SUN');
  assert.equal(paused.cancelledJobs.length, 2);
  assert.equal(paused.retry, 'gpu-job queue retry whatif-ep01-shot0N-still-001');
  assert.match(readPaused('## x\n- y', rows).unknown, /cleared/);
});

test('storyAriake: registry classification plus real queue counts; no live jobs means idle, not guessed', () => {
  const idle = readStoryAriake(REG, [{ job_id: 'storyariake.film.c01', status: 'PASSED', updated_at: '2026-10-24T13:49:46' }, { job_id: 'storyariake.film.c02', status: 'CANCELLED' }, { job_id: 'other', status: 'GENERATING' }]);
  assert.deepEqual(idle.queue, { generating: 0, queued: 0, total: 2, passed: 1, cancelled: 1, lastActivity: '2026-10-24T13:49:46' });
  assert.deepEqual(idle.gpuRoute, { status: 'ADMITTED', since: '2026-10-21' });
  assert.match(idle.classification, /^Film · narrative\/celebration showcase/);
  assert.match(readStoryAriake('| other |', []).unknown, /storyAriake/);
});
