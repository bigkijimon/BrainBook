// Run button contract: BrainBook hands a task to the Hermes Kanban dispatcher and never runs work itself.
// Uses a fake `hermes` CLI that records its arguments, so no real Kanban card is created.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = 5000 + Math.floor(Math.random() * 200);
const home = await fs.mkdtemp(path.join(os.tmpdir(), 'brainbook-run-'));
const calls = path.join(home, 'hermes-calls.jsonl');
const kanbanState = path.join(home, 'kanban-state.json');
const fakeHermes = path.join(home, 'hermes');
await fs.writeFile(kanbanState, '{}');
const vault = path.join(home, 'vault');
await fs.mkdir(path.join(vault, 'Projects'), { recursive: true });
await fs.writeFile(path.join(vault, 'Projects', 'Next-Work-List.md'), '# Next Work List\n\n- [ ] Write the onboarding checklist for new students\n');
await fs.writeFile(fakeHermes, `#!${process.execPath}
const fs = require('fs');
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(calls)}, JSON.stringify(args) + '\\n');
const state = JSON.parse(fs.readFileSync(${JSON.stringify(kanbanState)}, 'utf8'));
const sub = args[3];
if (sub === 'create') {
  const id = 't_' + String(Object.keys(state).length + 1).padStart(8, '0');
  state[id] = { id, status: 'ready', assignee: 'default' };
  fs.writeFileSync(${JSON.stringify(kanbanState)}, JSON.stringify(state));
  console.log(JSON.stringify({ id, status: 'ready', assignee: 'default' }));
} else if (sub === 'schedule') {
  state[args[4]].status = 'scheduled';
  fs.writeFileSync(${JSON.stringify(kanbanState)}, JSON.stringify(state));
  console.log('Scheduled ' + args[4]);
} else if (sub === 'list') {
  console.log(JSON.stringify(Object.values(state)));
} else if (args[0] === '--version' || args[0] === 'version') {
  console.log('Hermes Agent v0-test');
}
`);
await fs.chmod(fakeHermes, 0o755);

const server = spawn(process.execPath, ['server.mjs'], {
  cwd: root,
  env: { ...process.env, NODE_ENV: 'test', PORT: String(port), BRAINBOOK_HOME: home, ASTER_HERMES_BIN: fakeHermes, ASTER_HERMES_CWD: home, HERMES_HOME: path.join(home, 'no-hermes'), AI_ROUTER_BIN: '', OBSIDIAN_VAULT_PATH: vault, BRAINBOOK_LOCAL_AI_CONFIG_PATH: path.join(home, 'none.json') },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
server.stdout.on('data', (data) => { log += data; });
server.stderr.on('data', (data) => { log += data; });
const base = `http://127.0.0.1:${port}`;
const api = async (method, url, body) => {
  const response = await fetch(`${base}${url}`, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, body: await response.json() };
};
const hermesCalls = async () => (await fs.readFile(calls, 'utf8').catch(() => '')).trim().split('\n').filter(Boolean).map((line) => JSON.parse(line)).filter((args) => args[0] === 'kanban');
try {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* waiting */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  // 1. A normal task: Run creates one card on the owner board assigned to Bigkiji (default), no Codex.
  const created = await api('POST', '/api/tasks', { title: 'Tidy the README install steps', description: 'Short docs task', priority: 'normal', lifeArea: 'work' });
  assert.equal(created.status, 201);
  assert.equal(created.body.task.kanban, null, 'normal-priority tasks do not auto-run');
  const ran = await api('POST', `/api/tasks/${created.body.task.id}/run`);
  assert.equal(ran.status, 200, log);
  assert.equal(ran.body.task.kanban.status, 'ready');
  assert.equal(ran.body.task.status, 'working');
  let kanban = await hermesCalls();
  const create = kanban.find((args) => args[3] === 'create');
  assert.deepEqual(create.slice(0, 4), ['kanban', '--board', 'owner', 'create']);
  assert.equal(create[create.indexOf('--assignee') + 1], 'default');
  assert.ok(create.includes('--idempotency-key'));
  assert.match(create[create.indexOf('--body') + 1], /Do NOT use Codex/);
  assert.match(create[create.indexOf('--body') + 1], /Do not start or wake the GPU/);
  // 2. Run twice = still one card (idempotent in BrainBook too).
  await api('POST', `/api/tasks/${created.body.task.id}/run`);
  kanban = await hermesCalls();
  assert.equal(kanban.filter((args) => args[3] === 'create').length, 1);
  // 3. GPU work never starts in the day: it is parked in Scheduled for the night window.
  const video = await api('POST', '/api/tasks', { title: 'Render the lesson video keyframes', priority: 'normal', lifeArea: 'work' });
  const videoRun = await api('POST', `/api/tasks/${video.body.task.id}/run`);
  assert.equal(videoRun.body.task.kanban.status, 'scheduled');
  assert.equal(videoRun.body.task.kanban.gpu, true);
  assert.equal(videoRun.body.task.status, 'scheduled');
  // 4. High-priority new work starts on its own (24/7 without the owner).
  const urgent = await api('POST', '/api/tasks', { title: 'Fix the booking reminder email', priority: 'high', lifeArea: 'work' });
  assert.equal(urgent.body.task.kanban?.status, 'ready', JSON.stringify({ p: urgent.body.task.priority, s: urgent.body.task.status, a: urgent.body.task.lifeArea, r: urgent.body.task.routing, n: urgent.body.task.notes }));
  // 5. Status flows back: the dispatcher marks the card running, then done.
  const state = JSON.parse(await fs.readFile(kanbanState, 'utf8'));
  state[ran.body.task.kanban.id].status = 'running';
  await fs.writeFile(kanbanState, JSON.stringify(state));
  let list = await api('GET', '/api/tasks');
  assert.equal(list.body.tasks.find((task) => task.id === created.body.task.id).kanban.status, 'running');
  state[ran.body.task.kanban.id].status = 'done';
  await fs.writeFile(kanbanState, JSON.stringify(state));
  await new Promise((resolve) => setTimeout(resolve, 16000)); // list cache is 15s
  list = await api('GET', '/api/tasks');
  const finished = list.body.tasks.find((task) => task.id === created.body.task.id);
  assert.equal(finished.kanban.status, 'done');
  assert.equal(finished.status, 'done');
  // 6. Do now rows (Obsidian checklist items) can be Run too, once, without editing the note.
  const snapshot = await api('GET', '/api/vault');
  const item = snapshot.body.tasks.find((task) => /onboarding checklist/.test(task.text));
  assert.ok(item, JSON.stringify(snapshot.body.tasks));
  const vaultRun = await api('POST', '/api/vault/run', { id: item.id });
  assert.equal(vaultRun.status, 200, JSON.stringify(vaultRun.body));
  assert.equal(vaultRun.body.task.kanban.status, 'ready');
  await api('POST', '/api/vault/run', { id: item.id });
  const vaultCreates = (await hermesCalls()).filter((args) => args[3] === 'create' && /onboarding checklist/.test(args[4]));
  assert.equal(vaultCreates.length, 1, 'vault item is queued once');
  assert.equal((await api('GET', '/api/vault')).body.tasks.find((task) => task.id === item.id).kanban.status, 'ready');
  assert.match(await fs.readFile(path.join(vault, 'Projects', 'Next-Work-List.md'), 'utf8'), /- \[ \] Write the onboarding/, 'note is untouched');
  console.log('run tests passed');
} finally {
  server.kill();
  await fs.rm(home, { recursive: true, force: true });
}
