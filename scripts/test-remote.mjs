// Security + behavior checks for BrainBook's Hermes terminal and phone access.
// Run: node scripts/test-remote.mjs   (starts a throwaway server with a fake Hermes)
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { cleanPasteText } from '../terminal.mjs';
import { findTailscaleAddress, isTailscaleAddress } from '../remote.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = 4390 + Math.floor(Math.random() * 200);
const home = await fs.mkdtemp(path.join(os.tmpdir(), 'brainbook-test-'));
const vault = path.join(home, 'vault');
await fs.mkdir(path.join(vault, 'ideas'), { recursive: true });
await fs.writeFile(path.join(vault, 'ideas', 'test-idea.md'), '# Test idea\n\nA summary line.\n');
// Fake Hermes: echoes what it receives so we can prove what reached the terminal.
const fakeHermes = path.join(home, 'hermes');
await fs.writeFile(fakeHermes, '#!/usr/bin/python3\nimport os,sys\nsys.stdout.write("FAKE-HERMES-READY\\n"); sys.stdout.flush()\nos.system("stty raw -echo")\nwhile True:\n    b=os.read(0,4096)\n    if not b: break\n    sys.stdout.write("GOT:"+repr(b)+"\\n"); sys.stdout.flush()\n');
await fs.chmod(fakeHermes, 0o755);

const server = spawn(process.execPath, ['server.mjs'], { cwd: root, env: { ...process.env, PORT: String(port), BRAINBOOK_HOME: home, OBSIDIAN_VAULT_PATH: vault, ASTER_HERMES_BIN: fakeHermes, ASTER_HERMES_CWD: home }, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
server.stdout.on('data', (d) => { log += d; });
server.stderr.on('data', (d) => { log += d; });
const base = `http://127.0.0.1:${port}`;
for (let i = 0; i < 80; i += 1) {
  try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* starting */ }
  await new Promise((r) => setTimeout(r, 100));
}

const results = [];
const check = async (name, fn) => {
  try { await fn(); results.push(`PASS ${name}`); } catch (error) { results.push(`FAIL ${name}: ${error.message}`); }
};
const openTerminal = (headers = {}) => new Promise((resolve, reject) => {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/api/terminal/socket`, { headers });
  const frames = [];
  ws.on('message', (data, binary) => frames.push(binary ? Buffer.from(data).toString() : String(data)));
  ws.on('open', () => resolve({ ws, frames, text: () => frames.join('') }));
  ws.on('unexpected-response', (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)));
  ws.on('error', reject);
});
const until = async (fn, ms = 5000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (fn()) return; await new Promise((r) => setTimeout(r, 50)); }
  throw new Error('timed out');
};

await check('local API works from BrainBook itself', async () => {
  const response = await fetch(`${base}/api/session`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).local, true);
});
await check('other websites cannot call the local API (Origin check)', async () => {
  const response = await fetch(`${base}/api/tasks`, { headers: { origin: 'https://evil.example' } });
  assert.equal(response.status, 403);
});
await check('DNS-rebinding host is rejected', async () => {
  // fetch() may drop a custom Host header, so use a raw request.
  const http = await import('node:http');
  const status = await new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: '/api/tasks', headers: { host: `evil.example:${port}` } }, (res) => { res.resume(); resolve(res.statusCode); }).on('error', reject);
  });
  assert.equal(status, 403);
});
await check('other websites cannot open the terminal socket', async () => {
  await assert.rejects(openTerminal({ origin: 'https://evil.example' }), /HTTP 403/);
});
await check('terminal runs Hermes (not a shell) and shares one session', async () => {
  const a = await openTerminal();
  await until(() => a.text().includes('FAKE-HERMES-READY'));
  const b = await openTerminal();
  await until(() => b.text().includes('FAKE-HERMES-READY')); // second screen gets the scrollback
  a.ws.send(Buffer.from('hi'));
  await until(() => b.text().includes("GOT:b'hi'"));
  a.ws.close(); b.ws.close();
});
await check('clients cannot choose the command (restart/unknown messages ignored)', async () => {
  const a = await openTerminal();
  a.ws.send(JSON.stringify({ type: 'spawn', argv: ['/bin/sh'] }));
  a.ws.send(JSON.stringify({ type: 'restart', command: '/bin/sh' }));
  await new Promise((r) => setTimeout(r, 300));
  assert.ok(!/started pid=\d+ bin=\/bin\/sh/.test(log));
  a.ws.close();
});
await check('idea paste lands on the input line without Enter', async () => {
  const a = await openTerminal();
  const response = await fetch(`${base}/api/hermes/idea`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: 'ideas/test-idea.md' }) });
  assert.equal(response.status, 200);
  await until(() => a.text().includes('Test idea'));
  const got = a.text();
  assert.ok(got.includes('\\x1b[200~'), 'bracketed paste start');
  assert.ok(!/GOT:b'[^']*\\r/.test(got), 'no Enter was sent');
  a.ws.close();
});
await check('idea paste refuses paths outside ideas/', async () => {
  const response = await fetch(`${base}/api/hermes/idea`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: '../../etc/passwd' }) });
  assert.equal(response.status, 400);
});
await check('pasted text cannot contain Enter or escape codes', async () => {
  assert.equal(cleanPasteText('a\rb\n\u001b[201~rm -rf ~\r'), 'a b [201~rm -rf ~');
});
await check('phone access is off by default and pairing needs it on', async () => {
  const status = await (await fetch(`${base}/api/remote`)).json();
  assert.equal(status.enabled, false);
  const response = await fetch(`${base}/api/remote/pair`, { method: 'POST' });
  assert.equal(response.status, 409);
});
await check('Tailscale address detection', async () => {
  assert.equal(isTailscaleAddress('100.101.102.103'), true);
  assert.equal(isTailscaleAddress('192.168.1.7'), false);
  assert.equal(isTailscaleAddress('100.12.0.1'), false);
});

// Phone path: only when this machine is on Tailscale.
const address = findTailscaleAddress();
if (address) {
  const remoteBase = `http://${address}:${port}`;
  await fetch(`${base}/api/remote`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled: true }) });
  await check('phone listener is on the Tailscale address only', async () => {
    await until(() => log.includes(`phone access on http://${address}:${port}/`));
    const lan = Object.values(os.networkInterfaces()).flat().find((entry) => entry.family === 'IPv4' && !entry.internal && !isTailscaleAddress(entry.address));
    if (lan) await assert.rejects(fetch(`http://${lan.address}:${port}/api/health`, { signal: AbortSignal.timeout(1500) }));
  });
  await check('unpaired phone is blocked from data and the terminal', async () => {
    assert.equal((await fetch(`${remoteBase}/api/tasks`)).status, 401);
    assert.equal((await fetch(`${remoteBase}/`, { redirect: 'manual' })).headers.get('location'), '/pair');
    assert.equal((await fetch(`${remoteBase}/pair`)).status, 200);
    await assert.rejects(new Promise((resolve, reject) => { const ws = new WebSocket(`ws://${address}:${port}/api/terminal/socket`); ws.on('open', resolve); ws.on('unexpected-response', (_q, r) => reject(new Error(`HTTP ${r.statusCode}`))); ws.on('error', reject); }), /HTTP 403/);
  });
  let cookie = '';
  await check('QR pairing works once, then the code is dead', async () => {
    const pairing = await (await fetch(`${base}/api/remote/pair`, { method: 'POST' })).json();
    assert.ok(pairing.qrSvg.startsWith('<svg'));
    const code = new URL(pairing.url).searchParams.get('code');
    const claim = await fetch(`${remoteBase}/api/pair/claim`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, name: 'Test phone' }) });
    assert.equal(claim.status, 200);
    cookie = claim.headers.get('set-cookie').split(';')[0];
    assert.match(claim.headers.get('set-cookie'), /HttpOnly/);
    const again = await fetch(`${remoteBase}/api/pair/claim`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, name: 'Thief' }) });
    assert.equal(again.status, 410);
  });
  await check('paired phone can read tasks and use the Hermes terminal', async () => {
    const tasks = await fetch(`${remoteBase}/api/tasks`, { headers: { cookie } });
    assert.equal(tasks.status, 200);
    const session = await (await fetch(`${remoteBase}/api/session`, { headers: { cookie } })).json();
    assert.equal(session.local, false);
    assert.equal(session.dashboard, false, 'the loopback Hermes Dashboard is never advertised to the phone');
    const ws = new WebSocket(`ws://${address}:${port}/api/terminal/socket`, { headers: { cookie } });
    const frames = [];
    ws.on('message', (d, b) => frames.push(b ? Buffer.from(d).toString() : String(d)));
    await new Promise((resolve, reject) => { ws.on('open', resolve); ws.on('error', reject); });
    await until(() => frames.join('').includes('FAKE-HERMES-READY'));
    ws.close();
  });
  await check('paired phone cannot hand an idea into the Mac-only Hermes Dashboard', async () => {
    const response = await fetch(`${remoteBase}/api/hermes/idea`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ path: 'ideas/test-idea.md', target: 'dashboard' }) });
    assert.equal(response.status, 403);
  });
  await check('paired phone cannot change phone settings', async () => {
    assert.equal((await fetch(`${remoteBase}/api/remote`, { headers: { cookie } })).status, 403);
    assert.equal((await fetch(`${remoteBase}/api/remote/pair`, { method: 'POST', headers: { cookie } })).status, 403);
  });
  await check('removing a phone locks it out immediately', async () => {
    const status = await (await fetch(`${base}/api/remote`)).json();
    await fetch(`${base}/api/remote/devices/${status.devices[0].id}`, { method: 'DELETE' });
    assert.equal((await fetch(`${remoteBase}/api/tasks`, { headers: { cookie } })).status, 401);
  });
  await check('device key is stored hashed, never in plain text', async () => {
    const saved = await fs.readFile(path.join(home, 'remote.json'), 'utf8');
    assert.ok(!saved.includes(cookie.split('=')[1]));
    assert.equal((await fs.stat(path.join(home, 'remote.json'))).mode & 0o777, 0o600);
  });
  await check('turning phone access off closes the phone listener', async () => {
    await fetch(`${base}/api/remote`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled: false }) });
    await assert.rejects(fetch(`${remoteBase}/api/health`, { signal: AbortSignal.timeout(1500) }));
  });
} else {
  results.push('SKIP phone checks: this machine is not on Tailscale');
}

server.kill('SIGTERM');
await fs.rm(home, { recursive: true, force: true });
console.log(results.join('\n'));
const failed = results.filter((line) => line.startsWith('FAIL'));
if (failed.length) { console.log(`\n--- server log ---\n${log}`); process.exit(1); }
console.log(`\n${results.filter((line) => line.startsWith('PASS')).length} passed`);
