import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { analyzeIdea } from '../idea-score.mjs';

// Mirrors tests/worker-router.test.mjs's own fixture() helper exactly (that file defines it
// locally rather than exporting it from a shared module, so this file defines its own copy
// rather than importing a nonexistent shared fixture-helper.mjs).
const fixture = async (body) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'brainbook-idea-score-'));
  const executable = path.join(dir, 'submit');
  await fs.writeFile(executable, `#!${process.execPath}\n${body}\n`);
  await fs.chmod(executable, 0o700);
  return { dir, executable };
};

test('idea scoring returns a model-sourced score and roadmap on a well-formed Router reply', async () => {
  const { dir, executable } = await fixture(`let input='';process.stdin.on('data',c=>input+=c);process.stdin.on('end',()=>{const p=JSON.parse(input);console.log(JSON.stringify({status:'completed',summary:JSON.stringify({criteria:{originality:{score:15,why:'novel angle'},demand:{score:12,why:'seen on forums'},feasibility:{score:16,why:'solo buildable'},monetization:{score:10,why:'subscription'},fit:{score:14,why:'matches education background'}},reason:'Strong fit, moderate demand evidence',links:[],roadmap:[{stage:'Validate',actions:['Interview 5 target users']}]}),task_id:p.task_id,worker:'free-worker',model:'free-model',worker_cost_policy:{mode:'free_only',paid_worker_execution:false}}));});`);
  try {
    const result = await analyzeIdea({ text: 'a short-form AI coach for English learners', candidates: [], cwd: dir, routerSubmitPath: executable });
    assert.equal(result.source, 'model');
    assert.equal(result.score, 15 + 12 + 16 + 10 + 14);
    assert.equal(result.roadmap[0].stage, 'Validate');
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('idea scoring falls back to an explicit "unavailable" result, never a fabricated score, when the Router fails', async () => {
  const result = await analyzeIdea({ text: 'anything', candidates: [], cwd: process.cwd(), routerSubmitPath: '/nonexistent/binary' });
  assert.equal(result.score, null);
  assert.equal(result.source, 'unavailable');
});
