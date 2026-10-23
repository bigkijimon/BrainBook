import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

// GET /api/dbagent against the real server.mjs, with the DBAgent state dir and audit script pointed at fixtures.
// The audit "script" is a node file (the interpreter is overridden to node), the same stand-in idea as worker-router.test.mjs.
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let dir; let child; let base; let stateDir; let calls;

const freePort = () => new Promise((resolve) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); }); });

const boot = async (auditPath) => {
  await stop();
  const port = await freePort();
  child = spawn(process.execPath, ['server.mjs'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), BRAINBOOK_NO_AUTOPILOT: '1', BRAINBOOK_HOME: path.join(dir, 'home'), BRAINBOOK_DBAGENT_DIR: stateDir, BRAINBOOK_DBAGENT_AUDIT: auditPath, BRAINBOOK_DBAGENT_PYTHON: process.execPath },
    stdio: 'ignore',
  });
  base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i += 1) {
    if (await fetch(`${base}/api/health`).then((r) => r.ok, () => false)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server did not start');
};
const stop = async () => { const old = child; child = null; if (old && old.exitCode === null) { old.kill('SIGKILL'); await new Promise((r) => old.once('exit', r)); } };
const get = (query = '') => fetch(`${base}/api/dbagent${query}`).then((r) => r.json());

before(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'brainbook-dbagent-'));
  stateDir = path.join(dir, 'state');
  calls = path.join(dir, 'calls.log');
  await fs.mkdir(path.join(dir, 'home'), { recursive: true });
  await fs.mkdir(stateDir, { recursive: true });
  await fs.writeFile(path.join(dir, 'home', 'config.json'), JSON.stringify({ vaultPath: path.join(dir, 'vault') }));
  await fs.mkdir(path.join(dir, 'vault'), { recursive: true });
  await fs.writeFile(path.join(stateDir, 'registry.json'), JSON.stringify({ generated_at: 'reg-time', web_routes: [] }));
  await fs.writeFile(path.join(stateDir, 'usage.json'), JSON.stringify({ generated_at: 'cached-usage', sessions: [] }));
});
after(async () => { await stop(); await fs.rm(dir, { recursive: true, force: true }); });

const stubAudit = async () => {
  const file = path.join(dir, 'audit.mjs');
  await fs.writeFile(file, `import fs from 'node:fs';
const a = process.argv; const out = a[a.indexOf('--out') + 1]; const hours = a[a.indexOf('--hours') + 1];
fs.appendFileSync(${JSON.stringify(calls)}, hours + '\\n');
fs.writeFileSync(out, JSON.stringify({ generated_at: 'fresh-' + hours, window_hours: Number(hours), sessions: [] }));
`);
  return file;
};

test('a fresh run returns registry, usage and selfcheck (selfcheck null when the file is not there yet)', async () => {
  await boot(await stubAudit());
  const body = await get();
  assert.equal(body.registry.generated_at, 'reg-time');
  assert.equal(body.usage.generated_at, 'fresh-6', 'usage comes from the audit run, not the cached file; default window is 6 h');
  assert.equal(body.usage_error, undefined);
  assert.equal(body.selfcheck, null);
  assert.ok(Number.isFinite(Date.parse(body.served_at)));
  assert.equal((await fs.readFile(calls, 'utf8')).trim().split('\n').length, 1);
  await fs.writeFile(path.join(stateDir, 'selfcheck.json'), JSON.stringify({ generated_at: 'sc', ok: true, checks: [] }));
  assert.equal((await get()).selfcheck.generated_at, 'sc');
});

test('a second request within 15 s reuses the cached usage and does not spawn the audit again', async () => {
  const before = (await fs.readFile(calls, 'utf8')).trim().split('\n').length;
  const [one, two] = await Promise.all([get(), get()]);
  assert.equal(one.usage.generated_at, 'fresh-6');
  assert.equal(two.usage.generated_at, 'fresh-6');
  assert.equal((await fs.readFile(calls, 'utf8')).trim().split('\n').length, before, 'no new child process');
  const other = await get('?hours=24');
  assert.equal(other.usage.generated_at, 'fresh-24', 'a different window is a different measurement');
  assert.equal((await get('?hours=9999')).usage.generated_at, 'fresh-72', 'hours is clamped to 72');
  assert.equal((await get('?hours=-5')).usage.generated_at, 'fresh-1', 'hours is clamped to 1');
  await stop();
});

test('an unreachable audit script falls back to the cached usage.json with an explicit usage_error', async () => {
  await boot('/nonexistent/binary');
  const body = await get();
  assert.equal(body.usage.generated_at, 'cached-usage');
  assert.match(body.usage_error, /audit failed/);
  assert.match(body.usage_error, /cached usage\.json/);
  assert.equal(body.registry.generated_at, 'reg-time');
  await stop();
});

test('with no cached usage either, usage is null and the error says so (nothing is invented)', async () => {
  await fs.rm(path.join(stateDir, 'usage.json'));
  await boot('/nonexistent/binary');
  const body = await get();
  assert.equal(body.usage, null);
  assert.match(body.usage_error, /no cached usage\.json/);
});
