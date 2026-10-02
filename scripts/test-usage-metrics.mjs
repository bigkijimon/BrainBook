// Tests scripts/usage-metrics.mjs, usage-beacon.mjs, usage-receiver.mjs and usage-local.mjs through their interfaces.
// Run: node scripts/test-usage-metrics.mjs
import assert from 'node:assert/strict';
import { acceptEvent, usageReport } from './usage-metrics.mjs';
import { trackScreen } from './usage-beacon.mjs';
import { handleUsage } from './usage-receiver.mjs';
import { fileStore, reportFile, serveLocal } from './usage-local.mjs';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';

const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const B = 'bbbbbbbb-0000-4000-8000-000000000002';
const C = 'cccccccc-0000-4000-8000-000000000003';
const ev = (id, day, screen = 'cards') => ({ id, day, version: '1.0.0', screen });
let n = 0;
const test = async (name, fn) => { await fn(); n++; console.log(`ok - ${name}`); };

test('accepts exactly the allowed fields', () => {
  assert.deepEqual(acceptEvent(ev(A, '2026-10-01')), { ok: true, event: ev(A, '2026-10-01') });
});
test('rejects personal data instead of stripping it', () => {
  for (const key of ['ip', 'answer', 'text', 'name', 'email', 'ua']) {
    const r = acceptEvent({ ...ev(A, '2026-10-01'), [key]: 'x' });
    assert.equal(r.ok, false, key);
    assert.match(r.reason, new RegExp(key));
  }
});
test('rejects missing or malformed fields', () => {
  assert.equal(acceptEvent({ id: A, day: '2026-10-01', version: '1' }).ok, false);
  assert.equal(acceptEvent(ev('short', '2026-10-01')).ok, false);
  assert.equal(acceptEvent(ev(A, '2026-02-30')).ok, false);
  assert.equal(acceptEvent(ev(A, '2026-10-01', 'Free Text!')).ok, false);
  assert.equal(acceptEvent(null).ok, false);
  assert.equal(acceptEvent([]).ok, false);
});
test('counts users and active devices', () => {
  const r = usageReport([ev(A, '2026-09-01'), ev(A, '2026-10-01'), ev(B, '2026-09-28'), ev(C, '2026-09-10')], '2026-10-01');
  assert.equal(r.users, 3);
  assert.deepEqual(r.active, { d1: 1, d7: 2, d30: 3 });
});
test('retention is returned-on-day-N over eligible cohort', () => {
  // A: first 09-01, back 09-02 and 09-08 -> D1 and D7. B: first 09-01, back 09-03 only -> neither.
  // C: first 09-30 -> eligible for D1 only, back 10-01.
  const r = usageReport([
    ev(A, '2026-09-01'), ev(A, '2026-09-02'), ev(A, '2026-09-08'),
    ev(B, '2026-09-01'), ev(B, '2026-09-03'),
    ev(C, '2026-09-30'), ev(C, '2026-10-01'),
  ], '2026-10-01');
  assert.deepEqual(r.retention.d1, { eligible: 3, returned: 2, rate: 2 / 3 });
  assert.deepEqual(r.retention.d7, { eligible: 2, returned: 1, rate: 0.5 });
  assert.deepEqual(r.retention.d30, { eligible: 2, returned: 0, rate: 0 });
});
test('no eligible devices gives null rate, future days are ignored', () => {
  const r = usageReport([ev(A, '2026-10-01'), ev(B, '2026-10-05')], '2026-10-01');
  assert.equal(r.users, 1);
  assert.deepEqual(r.retention.d1, { eligible: 0, returned: 0, rate: null });
});

// Sender half (scripts/usage-beacon.mjs), checked against the receiver's acceptEvent.
const memoryStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
};
test('beacon events pass the receiver and keep one id per device', () => {
  const storage = memoryStorage();
  const sent = [];
  const deps = { version: '1.0.0', send: (e) => sent.push(e), storage };
  trackScreen('cards', { ...deps, today: '2026-10-01' });
  trackScreen('idioms', { ...deps, today: '2026-10-02' });
  assert.equal(sent.length, 2);
  for (const e of sent) assert.deepEqual(acceptEvent(e), { ok: true, event: e });
  assert.equal(sent[0].id, sent[1].id);
  assert.equal(usageReport(sent, '2026-10-02').retention.d1.returned, 1);
});
test('beacon sends once per day and screen', () => {
  const storage = memoryStorage();
  const sent = [];
  const deps = { version: '1.0.0', send: (e) => sent.push(e), storage };
  assert.ok(trackScreen('cards', { ...deps, today: '2026-10-01' }));
  assert.equal(trackScreen('cards', { ...deps, today: '2026-10-01' }), null);
  assert.ok(trackScreen('idioms', { ...deps, today: '2026-10-01' }));
  assert.ok(trackScreen('cards', { ...deps, today: '2026-10-02' }));
  assert.deepEqual(sent.map((e) => `${e.day}/${e.screen}`), ['2026-10-01/cards', '2026-10-01/idioms', '2026-10-02/cards']);
});
test('beacon never throws when storage or send fails', () => {
  const blocked = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => {} };
  assert.equal(trackScreen('cards', { version: '1', send: () => {}, storage: blocked, today: '2026-10-01' }), null);
  const storage = memoryStorage();
  const failing = () => { throw new Error('offline'); };
  assert.equal(trackScreen('cards', { version: '1', send: failing, storage, today: '2026-10-01' }), null);
  // a failed send is not marked as sent, so the next visit retries
  const sent = [];
  assert.equal(trackScreen('cards', { version: '1', send: () => false, storage, today: '2026-10-01' }), null);
  assert.ok(trackScreen('cards', { version: '1', send: (e) => sent.push(e), storage, today: '2026-10-01' }));
});

// Receiver half (scripts/usage-receiver.mjs): Fetch Request in, Response out, store at the seam.
const memoryStore = () => { const events = []; return { events, append: (e) => { events.push(e); } }; };
const post = (body, headers = {}) => new Request('http://local/usage', { method: 'POST', body, headers });
await test('receiver stores a beacon event and ignores request headers', async () => {
  const store = memoryStore();
  const storage = memoryStorage();
  let body;
  trackScreen('cards', { version: '1.0.0', send: (e) => { body = JSON.stringify(e); }, storage, today: '2026-10-01' });
  const res = await handleUsage(post(body, { 'x-forwarded-for': '203.0.113.9', 'user-agent': 'Test/1' }), store);
  assert.equal(res.status, 204);
  assert.deepEqual(store.events, [JSON.parse(body)]);
  assert.doesNotMatch(JSON.stringify(store.events), /203\.0\.113|Test\/1/);
});
await test('receiver rejects without storing', async () => {
  const store = memoryStore();
  const cases = [
    [new Request('http://local/usage'), 405],
    [post('not json'), 400],
    [post(JSON.stringify({ ...ev(A, '2026-10-01'), answer: 'x' })), 400],
    [post(JSON.stringify({ ...ev(A, '2026-10-01'), screen: 'x'.repeat(1100) })), 413],
  ];
  for (const [req, status] of cases) assert.equal((await handleUsage(req, store)).status, status);
  assert.equal(store.events.length, 0);
  const res = await handleUsage(post(JSON.stringify({ ...ev(A, '2026-10-01'), email: 'a@b.c' })), store);
  assert.match(await res.text(), /email/);
});
await test('receiver answers 503 instead of throwing when the store fails', async () => {
  const broken = { append: async () => { throw new Error('disk full'); } };
  assert.equal((await handleUsage(post(JSON.stringify(ev(A, '2026-10-01'))), broken)).status, 503);
});
await test('fileStore output feeds usageReport', async () => {
  const path = join(mkdtempSync(join(tmpdir(), 'usage-')), 'events.jsonl');
  const store = fileStore(path);
  for (const e of [ev(A, '2026-09-30'), ev(A, '2026-10-01'), ev(B, '2026-10-01')]) {
    assert.equal((await handleUsage(post(JSON.stringify(e)), store)).status, 204);
  }
  const events = readFileSync(path, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const r = usageReport(events, '2026-10-01');
  assert.equal(r.users, 2);
  assert.deepEqual(r.retention.d1, { eligible: 1, returned: 1, rate: 1 });
});

// The neutral modules must load where a Worker or browser would run them: bundled for the browser
// (fails on any node:* import) and evaluated with only Web globals (fails on any `process` reference).
await test('sender and receiver run with Web globals only (no node:*, no process)', async () => {
  const entry = `export { trackScreen } from './usage-beacon.mjs'; export { handleUsage } from './usage-receiver.mjs';`;
  const out = await build({
    stdin: { contents: entry, resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'js' },
    bundle: true, platform: 'browser', format: 'iife', globalName: 'usage', write: false, logLevel: 'silent',
  });
  const web = { Request, Response, TextEncoder, crypto, JSON };
  const usage = runInNewContext(`${out.outputFiles[0].text}; usage`, web);
  const store = memoryStore();
  let body;
  usage.trackScreen('cards', { version: '1.0.0', send: (e) => { body = JSON.stringify(e); }, storage: memoryStorage(), today: '2026-10-01' });
  assert.equal((await usage.handleUsage(post(body), store)).status, 204);
  assert.equal(store.events.length, 1);
});
await test('reportFile counts rejected lines and reports the rest', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'usage-')), 'events.jsonl');
  writeFileSync(path, [JSON.stringify(ev(A, '2026-09-30')), 'not json', JSON.stringify({ ...ev(B, '2026-10-01'), ip: '1' }), JSON.stringify(ev(A, '2026-10-01'))].join('\n'));
  const r = reportFile(path, '2026-10-01');
  assert.equal(r.accepted, 2);
  assert.equal(r.rejected, 2);
  assert.deepEqual(r.retention.d1, { eligible: 1, returned: 1, rate: 1 });
});
await test('serveLocal takes a real HTTP beacon on loopback and writes the file', async () => {
  const path = join(mkdtempSync(join(tmpdir(), 'usage-')), 'events.jsonl');
  const server = serveLocal({ file: path, port: 0 });
  await new Promise((r) => server.once('listening', r));
  const { address, port } = server.address();
  try {
    assert.equal(address, '127.0.0.1');
    const url = `http://127.0.0.1:${port}/usage`;
    assert.equal((await fetch(url, { method: 'POST', body: JSON.stringify(ev(A, '2026-10-01')) })).status, 204);
    assert.equal((await fetch(url, { method: 'POST', body: JSON.stringify({ ...ev(B, '2026-10-01'), answer: 'x' }) })).status, 400);
    assert.equal((await fetch(url)).status, 405);
  } finally {
    server.close();
  }
  assert.equal(reportFile(path, '2026-10-01').accepted, 1);
});
console.log(`PASS ${n} tests`);
