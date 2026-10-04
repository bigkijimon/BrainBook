import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseRouterResult, resolveRouterSubmit, routeTaskLane, submitWorkerText, workerEnvironment } from '../worker-router.mjs';
import { sortCapture } from '../capture.mjs';

const fixture = async (body) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'brainbook-router-'));
  const executable = path.join(dir, 'submit');
  await fs.writeFile(executable, `#!${process.execPath}\n${body}\n`);
  await fs.chmod(executable, 0o700);
  return { dir, executable };
};

// A stand-in for the owner's Router: the real one is a Python CLI, so the interpreter is the
// node binary here and the body prints whatever decision the case needs on stdout.
const routerFixture = async (body) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'brainbook-lane-'));
  const routerPath = path.join(dir, 'route');
  await fs.writeFile(routerPath, `#!${process.execPath}\n${body}\n`);
  await fs.chmod(routerPath, 0o700);
  return { dir, routerPath };
};

const askLane = async (body, text = 'fix the login bug') => {
  const { dir, routerPath } = await routerFixture(body);
  const sentBack = [];
  try {
    const route = await routeTaskLane({ routerPath, text, pythonBin: process.execPath, onSendBack: (verdict) => sentBack.push(verdict) });
    return { route, sentBack };
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
};

const answering = (decision) => `console.log(JSON.stringify(${decision}));`;

test('submit path resolves only from explicit submit or a configured bin/route sibling', () => {
  assert.equal(resolveRouterSubmit({ routerPath: '/router/bin/route' }), '/router/bin/submit');
  assert.equal(resolveRouterSubmit({ routerPath: '/router/route' }), null);
  assert.equal(resolveRouterSubmit({ routerPath: '/router/bin/other' }), null);
  assert.equal(resolveRouterSubmit({ submitPath: '/configured/submit' }), '/configured/submit');
  assert.equal(resolveRouterSubmit({ submitPath: 'relative/submit' }), null);
});

test('a Jev-sourced lane is accepted, asked for over the documented Router wire', async () => {
  const { route, sentBack } = await askLane(answering("{source:'jev',status:'ready',worker:'mimo',jev:{confidence:0.86},reason:JSON.stringify(process.argv.slice(2))}"));
  assert.deepEqual(sentBack, []);
  assert.equal(route.worker, 'mimo');
  assert.equal(route.routeSource, 'jev');
  assert.equal(route.routeStatus, 'ready');
  assert.equal(route.confidence, 0.86);
  assert.deepEqual(JSON.parse(route.reason), ['--json', '--check', '--origin', 'hermes', 'fix the login bug'],
    'the Router is asked read-only, with the task text as its argument');
});

test('a budget ledger beside a valid answer is metadata, not a claim over authority', async () => {
  const { route, sentBack } = await askLane(answering("{source:'jev',status:'ready',worker:'mimo',budget:{used_usd:0.12,cap_usd:1},cost_policy:'free_only',jev:{confidence:0.86}}"));
  assert.deepEqual(sentBack, [], 'a Router that reports its own ceiling must not send the lane back');
  assert.equal(route.worker, 'mimo');
});

test('an answer Jev was not allowed to give keeps the deterministic lane and says why', async () => {
  for (const [decision, code] of [
    ["{source:'jev',status:'ready',worker:'mimo'}", 'unusable_confidence'],
    ["{source:'jev',status:'ready',worker:'mimo',jev:{confidence:0.4}}", 'low_confidence'],
    ["{source:'jev',status:'ready',worker:'mimo',jev:{confidence:1.4}}", 'unusable_confidence'],
    ["{source:'jev',status:'ready',worker:'claude-code',jev:{confidence:0.95}}", 'over_authority'],
    ["{source:'jev',status:'ready',worker:'mimo',approved:true,jev:{confidence:0.95}}", 'over_authority'],
    ["{source:'jev',status:'ready',worker:'a lane with spaces',jev:{confidence:0.9}}", 'out_of_range'],
    ["{source:'jev',status:'budget_exhausted',worker:null,jev:{confidence:0.9}}", 'provider_refused'],
    // The Router's own deterministic decision used to skip the criteria entirely, so it could name a
    // paid lane. Free-only execution is an invariant of the app, not of one branch of an answer.
    ["{source:'deterministic',worker:'claudecode',status:'ready'}", 'over_authority'],
    ["{source:'deterministic',worker:'a lane with spaces',status:'ready'}", 'out_of_range'],
  ]) {
    const { route, sentBack } = await askLane(answering(decision));
    assert.equal(route, null, `${code} must leave the deterministic lane in place`);
    assert.equal(sentBack.length, 1, `${code} must be logged once`);
    assert.equal(sentBack[0].point, 'worker-lane');
    assert.equal(sentBack[0].code, code);
    assert.ok(sentBack[0].fallback.length > 0);
  }
});

test("the Router's own deterministic decision is used as is, and unusable output is not", async () => {
  const decided = await askLane(answering("{source:'deterministic',worker:'hermes',status:'ready',reason:'stream rule'}"));
  assert.deepEqual(decided.sentBack, [], 'a Router decision is not Jev advice and is never judged');
  assert.equal(decided.route.worker, 'hermes');
  assert.equal(decided.route.routeSource, 'deterministic');

  const unnamed = await askLane(answering("{source:'deterministic',status:'ready',reason:'stream rule'}"));
  assert.deepEqual(unnamed.sentBack, [], 'naming no lane is not a send-back');
  assert.equal(unnamed.route.worker, 'hermes', 'a decision that names no usable lane falls back to the Router default lane');

  for (const noise of ["console.log('not json at all');", answering('[]'), answering('"jev"'), answering('null'), answering('')]) {
    const { route, sentBack } = await askLane(noise);
    assert.equal(route, null, `${noise} must keep the deterministic lane in place`);
    assert.deepEqual(sentBack, []);
  }
  assert.equal(await routeTaskLane({ text: 'fix the login bug' }), null, 'no configured Router means no call');
});

test('a Router that floods or never answers is bounded and leaves the deterministic lane in place', async () => {
  const flooding = await askLane(`setInterval(()=>console.log('x'.repeat(4096)),10);`, 'fix the login bug');
  assert.equal(flooding.route, null);
  assert.deepEqual(flooding.sentBack, []);

  const silent = await routerFixture(`setInterval(()=>{},1000);`);
  try {
    const sentBack = [];
    const route = await routeTaskLane({ routerPath: silent.routerPath, text: 'fix the login bug',
      pythonBin: process.execPath, timeoutMs: 1000, maxBytes: 8192, onSendBack: (verdict) => sentBack.push(verdict) });
    assert.equal(route, null, 'the subprocess deadline must end the call');
    assert.deepEqual(sentBack, [], 'a Router that never answers cannot be a Jev answer');
  } finally { await fs.rm(silent.dir, { recursive: true, force: true }); }
});

test('worker subprocess receives a read-only packet and no inherited credentials', async () => {
  const { dir, executable } = await fixture(`let input='';process.stdin.on('data',c=>input+=c);process.stdin.on('end',()=>{const p=JSON.parse(input);console.log(JSON.stringify({status:'completed',summary:JSON.stringify({packet:p,secret:process.env.TEST_PROVIDER_SECRET||null}),task_id:p.task_id,worker:'free-worker',model:'free-model',worker_cost_policy:{mode:'free_only',paid_worker_execution:false}}));});`);
  const prior = process.env.TEST_PROVIDER_SECRET;
  process.env.TEST_PROVIDER_SECRET = 'must-not-leak';
  try {
    const result = await submitWorkerText({ prompt: 'Draft a brief answer.', purpose: 'test', cwd: dir, executable });
    const { packet, secret } = JSON.parse(result.text);
    assert.equal(secret, null);
    assert.deepEqual(packet.scope.write, []);
    assert.equal(packet.cost_policy, 'free_only');
    assert.equal(packet.task_id, result.taskId);
    assert.equal(result.worker, 'free-worker');
    assert.equal(result.model, 'free-model');
  } finally {
    if (prior === undefined) delete process.env.TEST_PROVIDER_SECRET; else process.env.TEST_PROVIDER_SECRET = prior;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('rejects blocked, paid, missing evidence and wrong-task results', () => {
  const policy = { mode: 'free_only', paid_worker_execution: false };
  const good = { status: 'completed', summary: 'answer', task_id: 'expected', worker: 'free-worker', model: 'free-model', worker_cost_policy: policy };
  assert.equal(parseRouterResult(JSON.stringify(good), 0, 'expected').text, 'answer');
  for (const bad of [
    { ...good, status: 'blocked' },
    { ...good, worker_cost_policy: { mode: 'paid', paid_worker_execution: true } },
    { ...good, model: null },
    { ...good, task_id: 'other' },
  ]) assert.throws(() => parseRouterResult(JSON.stringify(bad), 0, 'expected'));
  assert.throws(() => parseRouterResult(JSON.stringify(good), 1, 'expected'));
  assert.equal(workerEnvironment({ PATH: '/unsafe', TEST_PROVIDER_SECRET: 'secret' }).TEST_PROVIDER_SECRET, undefined);
});

test('capture uses Router evidence and falls back to a labeled keyword rule on refusal', async () => {
  const { dir, executable } = await fixture(`let input='';process.stdin.on('data',c=>input+=c);process.stdin.on('end',()=>{const p=JSON.parse(input);console.log(JSON.stringify({status:'completed',summary:JSON.stringify({kind:'task',title:'Send update',reason:'A concrete action',links:[],steps:[{text:'Send it'}]}),task_id:p.task_id,worker:'free-worker',model:'free-model',worker_cost_policy:{mode:'free_only',paid_worker_execution:false}}));});`);
  try {
    const routed = await sortCapture({ text: 'send update', candidates: [], cwd: dir, routerSubmitPath: executable });
    assert.equal(routed.source, 'model');
    assert.equal(routed.worker, 'free-worker');
    assert.equal(routed.model, 'free-model');
    assert.match(routed.routerTaskId, /^brainbook-/);
    const fallback = await sortCapture({ text: 'send update', candidates: [], cwd: dir });
    assert.equal(fallback.source, 'rule');
    assert.equal(fallback.model, null);
    assert.match(fallback.reason, /keyword rule/);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('a non-responding Router is bounded by the subprocess deadline', async () => {
  const { dir, executable } = await fixture(`process.stdin.resume();setInterval(()=>{},1000);`);
  try {
    await assert.rejects(submitWorkerText({ prompt: 'Draft a brief answer.', purpose: 'test', cwd: dir,
      executable, timeoutMs: 1000 }), /timed out/);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
