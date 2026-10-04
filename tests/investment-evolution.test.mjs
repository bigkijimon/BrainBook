// InvestPro Evolution Arena endpoint contract (read-only snapshot, sanitized, honest states).
//
// The valid snapshot comes from the real VIT engine (`python -m vit.evolution fixture`), so this
// also pins the engine -> BrainBook schema boundary. It is synthetic fixture data, labelled
// `fixture` end to end, and written under os.tmpdir(). No broker, model, network or scheduler.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { handleEvolutionRequest, readEvolutionSnapshot, sanitizeSnapshot } from '../investment-evolution.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const VIT = process.env.VIT_ENGINE || '/Users/yuma/Documents/SystemAPPS/Stock/VirtualInvestmentTrusts/engine';
const python = path.join(VIT, '.venv/bin/python');
const haveEngine = existsSync(python);

const build = (generations = 3) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'brainbook-evolution-'));
  execFileSync(python, ['-m', 'vit.evolution', 'fixture', '--store', dir, '--generations', String(generations)],
    { env: { PATH: process.env.PATH, PYTHONPATH: path.join(VIT, 'src'), PYTHONDONTWRITEBYTECODE: '1' } });
  return { dir, file: path.join(dir, 'snapshot.json'), raw: JSON.parse(readFileSync(path.join(dir, 'snapshot.json'), 'utf8')) };
};
const write = (raw) => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'brainbook-evolution-')), 'snapshot.json');
  writeFileSync(file, typeof raw === 'string' ? raw : JSON.stringify(raw));
  return file;
};
const asOf = (raw) => Date.parse(raw.run.as_of);
const fakeRes = () => ({ headers: {}, setHeader(k, v) { this.headers[k] = v; } });
const respond = (res, body, status = 200) => { res.status = status; res.body = body; };

test('absent snapshot is "absent", not an empty successful run', async () => {
  const result = await readEvolutionSnapshot({ snapshotPath: path.join(tmpdir(), 'brainbook-evolution-nope', 'snapshot.json') });
  assert.equal(result.state, 'absent');
  assert.equal(result.snapshot, undefined);
});

test('corrupt, wrong-kind, unsupported and non-file snapshots are named, and carry no data', async () => {
  const cases = [
    [write('{not json'), 'corrupt'],
    [write({ kind: 'something-else', schema_version: 1 }), 'corrupt'],
    [write({ kind: 'vit-evolution-snapshot', schema_version: 99 }), 'unsupported'],
    [write({ kind: 'vit-evolution-snapshot', schema_version: 1, run: { status: 'active' }, candidates: 'x', lineage: {}, counts: {} }), 'corrupt'],
    [path.dirname(write('{}')), 'corrupt'],
  ];
  for (const [snapshotPath, state] of cases) {
    const result = await readEvolutionSnapshot({ snapshotPath });
    assert.equal(result.state, state, snapshotPath);
    assert.equal(result.snapshot, undefined);
    assert.ok(result.reason);
  }
  const link = path.join(mkdtempSync(path.join(tmpdir(), 'brainbook-evolution-')), 'link.json');
  symlinkSync(write('{}'), link);
  assert.equal((await readEvolutionSnapshot({ snapshotPath: link })).state, 'corrupt');
});

test('a snapshot with no run is ok and says no_run', { skip: !haveEngine }, async () => {
  const empty = JSON.parse(execFileSync(python, ['-c', 'import json,sys;from vit.evolution.snapshot import build_snapshot;from vit.evolution.store import State;print(json.dumps(build_snapshot(State())))'],
    { env: { PATH: process.env.PATH, PYTHONPATH: path.join(VIT, 'src') } }));
  const result = await readEvolutionSnapshot({ snapshotPath: write(empty), now: Date.now() });
  assert.equal(result.state, 'ok');
  assert.equal(result.snapshot.run.status, 'no_run');
  assert.deepEqual(result.snapshot.candidates, []);
});

test('a real VIT fixture snapshot validates and keeps its fixture label and derived counts', { skip: !haveEngine }, async () => {
  const { file, raw } = build();
  const result = await readEvolutionSnapshot({ snapshotPath: file, now: asOf(raw) + 1000 });
  assert.equal(result.state, 'ok');
  const { snapshot } = result;
  assert.equal(snapshot.data_source, 'fixture');
  assert.equal(snapshot.run.manifest.data_source, 'fixture');
  assert.equal(snapshot.counts.candidates_total, raw.candidates.length);
  assert.equal(snapshot.candidates.length, raw.candidates.length);
  assert.ok(snapshot.counts.mutations > 0 && snapshot.archive.length > 0 && snapshot.lineage.edges.length > 0);
  const twoParents = snapshot.candidates.find((c) => c.parent_ids.length === 2);
  assert.ok(twoParents, 'a crossover child with two parents exists');
  assert.equal(snapshot.candidates.find((c) => c.candidate_id === twoParents.parent_ids[0]).birth_generation < twoParents.birth_generation, true);
  assert.notEqual(snapshot.counts.generation, snapshot.candidates[0].birth_generation + 99);
});

test('unknown and sensitive fields never pass through the whitelist', { skip: !haveEngine }, async () => {
  const { raw } = build(2);
  raw.api_key = 'sk-secret';
  raw.run.account_id = 'ACCT-1';
  raw.candidates[0].system_prompt = 'You are a trader';
  raw.candidates[0].genome.broker_token = 'abc';
  raw.candidates[0].traceback = 'File "x"';
  const result = await readEvolutionSnapshot({ snapshotPath: write(raw), now: asOf(raw) });
  const text = JSON.stringify(result).toLowerCase();
  for (const needle of ['sk-secret', 'acct-1', 'you are a trader', 'broker_token', 'traceback', 'api_key', 'account_id']) assert.equal(text.includes(needle), false, needle);
});

test('stale snapshots stay visible but are marked stale', { skip: !haveEngine }, async () => {
  const { file, raw } = build(2);
  const fresh = await readEvolutionSnapshot({ snapshotPath: file, now: asOf(raw) + 3600_000 });
  const stale = await readEvolutionSnapshot({ snapshotPath: file, now: asOf(raw) + 100 * 3600_000 });
  assert.equal(fresh.state, 'ok');
  assert.equal(stale.state, 'stale');
  assert.ok(stale.snapshot.candidates.length > 0 && stale.ageSeconds > 48 * 3600);
});

test('structural lies are rejected: orphan edges, duplicate ids, non-finite numbers, unknown stages', { skip: !haveEngine }, async () => {
  const { raw } = build(2);
  const mutate = (fn) => { const copy = structuredClone(raw); fn(copy); return copy; };
  const bads = [
    mutate((r) => r.lineage.edges.push({ from: 'c_ghost', to: r.candidates[0].candidate_id })),
    mutate((r) => { r.candidates[1].candidate_id = r.candidates[0].candidate_id; }),
    mutate((r) => { r.candidates[0].fitness = 'NaN'; }),
    mutate((r) => { r.candidates[0].stage = 'live-ish'; }),
    mutate((r) => { r.candidates[0].metrics.max_drawdown = null; r.candidates[0].genome.risk_per_trade = 'high'; }),
    mutate((r) => { r.run.status = 'winning'; }),
    mutate((r) => { r.counts.survivors = -3; }),
    mutate((r) => { delete r.archive[0].origin; }),
  ];
  for (const body of bads) assert.throws(() => sanitizeSnapshot(body));
  for (const body of bads) assert.equal((await readEvolutionSnapshot({ snapshotPath: write(body), now: asOf(raw) })).state, 'corrupt');
});

test('missing metrics stay null, never zero', { skip: !haveEngine }, async () => {
  const { raw } = build(3);
  const pending = raw.candidates.find((c) => c.status === 'not_evaluated');
  assert.ok(pending, 'next-generation children are awaiting evaluation');
  const clean = sanitizeSnapshot(raw).candidates.find((c) => c.candidate_id === pending.candidate_id);
  assert.equal(clean.fitness, null);
  assert.equal(clean.metrics.net_return, null);
  assert.equal(clean.metrics.n_trades, null);
});

test('the route is GET-only, ignores caller input, and leaves other paths alone', async () => {
  const file = write('{not json');
  const get = async (method, url) => {
    const res = fakeRes();
    const handled = await handleEvolutionRequest({ method }, res, new URL(url, 'http://x'), { json: respond, snapshotPath: file });
    return { handled, res };
  };
  assert.equal((await get('GET', '/api/tasks')).handled, false);
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const { handled, res } = await get(method, '/api/investment/evolution');
    assert.equal(handled, true);
    assert.equal(res.status, 405);
    assert.equal(res.headers.allow, 'GET');
  }
  const { res } = await get('GET', '/api/investment/evolution?path=/etc/passwd&cmd=rm%20-rf');
  assert.equal(res.status, 200);
  assert.equal(res.body.state, 'corrupt');                       // read the configured file, not the query
  assert.equal(res.headers['cache-control'], 'no-store');
});

test('server.mjs registers the route and does not widen the surface', () => {
  const server = readFileSync(path.join(root, 'server.mjs'), 'utf8');
  assert.match(server, /import \{ handleEvolutionRequest \} from '\.\/investment-evolution\.mjs'/);
  assert.match(server, /await handleEvolutionRequest\(req, res, url, \{ json \}\)/);
  const module = readFileSync(path.join(root, 'investment-evolution.mjs'), 'utf8');
  for (const forbidden of ['child_process', 'spawn', 'exec(', 'writeFile', 'fetch(', 'http.request']) assert.equal(module.includes(forbidden), false, forbidden);
});
