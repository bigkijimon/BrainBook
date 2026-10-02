// End-to-end check of Dump → Map → Build against a throwaway vault.
// Run: node scripts/test-ideas.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = 4600 + Math.floor(Math.random() * 200);
const home = await fs.mkdtemp(path.join(os.tmpdir(), 'brainbook-ideas-'));
const vault = path.join(home, 'vault');
await fs.mkdir(path.join(vault, 'ideas'), { recursive: true });
await fs.mkdir(path.join(vault, 'Projects', 'demo'), { recursive: true });
await fs.writeFile(path.join(vault, 'Projects', 'demo', 'Status.md'), '# Demo project\n\nA project note.\n');
const fakeHermes = path.join(home, 'hermes');
await fs.writeFile(fakeHermes, '#!/usr/bin/python3\nimport os,sys\nsys.stdout.write("READY\\n"); sys.stdout.flush()\nos.system("stty raw -echo")\nwhile True:\n    b=os.read(0,65536)\n    if not b: break\n    sys.stdout.write("GOT:"+b.decode("utf8","replace")+"\\n"); sys.stdout.flush()\n');
await fs.chmod(fakeHermes, 0o755);

const server = spawn(process.execPath, ['server.mjs'], { cwd: root, env: { ...process.env, PORT: String(port), BRAINBOOK_HOME: home, OBSIDIAN_VAULT_PATH: vault, ASTER_HERMES_BIN: fakeHermes, ASTER_HERMES_CWD: home, HERMES_HOME: path.join(home, 'no-hermes') }, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
server.stdout.on('data', (d) => { log += d; });
server.stderr.on('data', (d) => { log += d; });
const base = `http://127.0.0.1:${port}`;
for (let i = 0; i < 80; i += 1) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 100)); }
const post = (url, body) => fetch(`${base}${url}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const results = [];
const check = async (name, fn) => { try { await fn(); results.push(`PASS ${name}`); } catch (error) { results.push(`FAIL ${name}: ${error.message}`); } };

let created = [];
await check('dump creates one note per line with tree parents', async () => {
  const response = await post('/api/ideas', { items: [{ text: 'School booking app' }, { text: 'Online payment', parentIndex: 0 }, { text: 'Teacher calendar sync', parentIndex: 0 }, { text: 'Stripe or PayPay?', parentIndex: 1 }, { text: 'Sleep earlier' }], area: 'work' });
  assert.equal(response.status, 201);
  created = (await response.json()).created;
  assert.equal(created.length, 5);
  const child = await fs.readFile(path.join(vault, created[3].path), 'utf8');
  assert.match(child, /^parent: "\[\[idea-/m);
  assert.match(child, /## Links\n\n- \[\[/);
  assert.match(child, /^# Stripe or PayPay\?$/m);
});
await check('brain shows the tree as branch links (parent → child)', async () => {
  const brain = await (await fetch(`${base}/api/brain`)).json();
  const branches = brain.links.filter((link) => link.kind === 'branch');
  assert.equal(branches.length, 3);
  assert.ok(branches.some((link) => link.source === created[0].path && link.target === created[1].path));
  assert.ok(branches.some((link) => link.source === created[1].path && link.target === created[3].path));
  assert.equal(brain.nodes.find((node) => node.id === created[4].path).lifeArea, 'work');
});
await check('branching from an existing idea', async () => {
  const response = await post('/api/ideas', { items: [{ text: 'Weekday bedtime alarm' }], parent: created[4].path });
  const [entry] = (await response.json()).created;
  const brain = await (await fetch(`${base}/api/brain`)).json();
  assert.ok(brain.links.some((link) => link.kind === 'branch' && link.source === created[4].path && link.target === entry.path));
});
await check('linking two ideas writes a [[wikilink]] once', async () => {
  const first = await post('/api/ideas/link', { from: created[2].path, to: created[4].path });
  assert.equal(first.status, 200);
  assert.equal((await first.json()).added, true);
  const again = await (await post('/api/ideas/link', { from: created[2].path, to: created[4].path })).json();
  assert.equal(again.added, false);
  const text = await fs.readFile(path.join(vault, created[2].path), 'utf8');
  assert.equal(text.split(`[[${path.basename(created[4].path, '.md')}]]`).length - 1, 1);
  const brain = await (await fetch(`${base}/api/brain`)).json();
  assert.ok(brain.links.some((link) => link.kind === 'wikilink' && [link.source, link.target].sort().join() === [created[2].path, created[4].path].sort().join()));
});
await check('idea → project link is written into the idea, project untouched', async () => {
  const before = await fs.readFile(path.join(vault, 'Projects/demo/Status.md'), 'utf8');
  const result = await (await post('/api/ideas/link', { from: 'Projects/demo/Status.md', to: created[0].path })).json();
  assert.equal(result.from, created[0].path);
  assert.equal(await fs.readFile(path.join(vault, 'Projects/demo/Status.md'), 'utf8'), before);
});
await check('writes outside ideas/ and Projects/ are refused', async () => {
  assert.equal((await post('/api/ideas', { items: [{ text: 'x' }], parent: '../../etc/passwd.md' })).status, 400);
  assert.equal((await post('/api/ideas/link', { from: created[0].path, to: '../outside.md' })).status, 400);
  assert.equal((await post('/api/ideas/link', { from: created[0].path, to: created[0].path })).status, 400);
  assert.equal((await post('/api/ideas', { items: [] })).status, 400);
});
await check('Start in Hermes pastes the idea + its connected ideas, no Enter', async () => {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/api/terminal/socket`);
  const frames = [];
  ws.on('message', (d) => frames.push(Buffer.from(d).toString()));
  await new Promise((resolve, reject) => { ws.on('open', resolve); ws.on('error', reject); });
  const end = Date.now() + 5000;
  while (!frames.join('').includes('READY') && Date.now() < end) await new Promise((r) => setTimeout(r, 50));
  const response = await post('/api/hermes/idea', { path: created[1].path });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).related, 2);
  const until = Date.now() + 5000;
  while (!frames.join('').includes('Stripe or PayPay') && Date.now() < until) await new Promise((r) => setTimeout(r, 50));
  const got = frames.join('');
  assert.ok(got.includes('Online payment'));
  assert.ok(got.includes('School booking app'), 'parent included');
  assert.ok(got.includes('Stripe or PayPay'), 'child included');
  assert.ok(!/GOT:[^\n]*\r/.test(got), 'no Enter');
  ws.close();
});
await check('native dashboard handoff returns paste text without calling the separate CLI terminal', async () => {
  const response = await post('/api/hermes/idea', { path: created[1].path, target: 'dashboard' });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.related, 2);
  assert.equal(typeof result.prompt, 'string');
  assert.ok(result.prompt.includes('start the idea'));
  assert.ok(result.prompt.includes('Online payment'));
});
await check('unknown Hermes handoff targets are rejected', async () => {
  assert.equal((await post('/api/hermes/idea', { path: created[1].path, target: 'other' })).status, 400);
});

await check('saving where work stopped writes a Progress log + next_step', async () => {
  const response = await post('/api/ideas/step', { path: created[1].path, did: 'Compared Stripe and PayPay fees', next: 'Ask a friend which one they use' });
  assert.equal(response.status, 200);
  const text = await fs.readFile(path.join(vault, created[1].path), 'utf8');
  assert.match(text, /^status: "active"$/m);
  assert.match(text, /^next_step: "Ask a friend which one they use"$/m);
  assert.match(text, /## Progress\n\n- \d{4}-\d{2}-\d{2} \d{2}:\d{2} — Compared Stripe and PayPay fees → next: Ask a friend which one they use/);
  const brain = await (await fetch(`${base}/api/brain`)).json();
  const node = brain.nodes.find((entry) => entry.id === created[1].path);
  assert.equal(node.stage, 'active');
  assert.equal(node.progress.lastDid, 'Compared Stripe and PayPay fees');
  assert.equal(node.progress.next, 'Ask a friend which one they use');
  assert.equal(brain.nodes.find((entry) => entry.id === created[4].path).stage, 'seed');
});
await check('a second step appends under the same heading', async () => {
  await post('/api/ideas/step', { path: created[1].path, did: 'A friend said PayPay', next: '' });
  const text = await fs.readFile(path.join(vault, created[1].path), 'utf8');
  assert.equal(text.split('## Progress').length - 1, 1);
  assert.equal((text.match(/^- \d{4}-/gm) || []).length, 2);
  const node = (await (await fetch(`${base}/api/brain`)).json()).nodes.find((entry) => entry.id === created[1].path);
  assert.equal(node.progress.lastDid, 'A friend said PayPay');
});
await check('Start in Hermes carries the resume point for an idea in progress', async () => {
  await post('/api/ideas/step', { path: created[1].path, did: 'Picked PayPay', next: 'Write the checkout flow' });
  const ws = new WebSocket(`ws://127.0.0.1:${port}/api/terminal/socket`);
  const frames = [];
  ws.on('message', (d) => frames.push(Buffer.from(d).toString()));
  await new Promise((resolve, reject) => { ws.on('open', resolve); ws.on('error', reject); });
  await new Promise((r) => setTimeout(r, 400));
  await post('/api/hermes/idea', { path: created[1].path });
  const until = Date.now() + 5000;
  while (!frames.join('').includes('Write the checkout flow') && Date.now() < until) await new Promise((r) => setTimeout(r, 50));
  const got = frames.join('');
  assert.ok(got.includes('continue the idea'), 'says continue');
  assert.ok(got.includes('last done: “Picked PayPay”'));
  assert.ok(got.includes('next step: “Write the checkout flow”'));
  assert.ok(got.includes('## Progress'), 'tells the agent how to log');
  ws.close();
});
await check('completing ideas awards XP from the vault and levels up', async () => {
  const start = await (await fetch(`${base}/api/progress`)).json();
  assert.equal(start.xp, 0); assert.equal(start.level, 1);
  // Leaf with 1 branch link: 100 + 20 = 120 → level 2 (needs 100), 20 into level 2.
  const first = await (await post('/api/ideas/complete', { path: created[3].path, done: true })).json();
  assert.equal(first.gained, 120);
  assert.equal(first.levelUp, true);
  assert.equal(first.after.level, 2);
  assert.match(await fs.readFile(path.join(vault, created[3].path), 'utf8'), /^status: "done"$/m);
  // Parent (branch to child + to root) with every child done → 100 + 40 + 50 branch bonus.
  const second = await (await post('/api/ideas/complete', { path: created[1].path, done: true })).json();
  assert.equal(second.gained, 190);
  // Completing the same idea twice gives nothing extra.
  const again = await (await post('/api/ideas/complete', { path: created[1].path, done: true })).json();
  assert.equal(again.gained, 0);
  // Reopening takes the XP back (XP always matches the vault).
  const reopened = await (await post('/api/ideas/complete', { path: created[1].path, done: false })).json();
  assert.equal(reopened.after.xp, 120);
  assert.doesNotMatch(await fs.readFile(path.join(vault, created[1].path), 'utf8'), /^completed_at:/m);
  // Projects cannot be "completed" from here.
  assert.equal((await post('/api/ideas/complete', { path: 'Projects/demo/Status.md', done: true })).status, 400);
});

server.kill('SIGTERM');
await fs.rm(home, { recursive: true, force: true });
console.log(results.join('\n'));
if (results.some((line) => line.startsWith('FAIL'))) { console.log(`--- server log ---\n${log}`); process.exit(1); }
console.log(`\n${results.length} passed`);
