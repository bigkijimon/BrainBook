// A friend's first launch: no config, no vault, no Hermes, a home folder of their own.
// Run: node scripts/test-first-run.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = 4800 + Math.floor(Math.random() * 150);
const home = await fs.mkdtemp(path.join(os.tmpdir(), 'brainbook-friend-'));
const appHome = path.join(home, 'Library', 'Application Support', 'BrainBook');
const env = { ...process.env, HOME: home, PORT: String(port), BRAINBOOK_HOME: appHome, ASTER_HERMES_BIN: path.join(home, 'no-hermes'), HERMES_HOME: path.join(home, '.hermes') };
delete env.OBSIDIAN_VAULT_PATH; delete env.MORNING_VAULT;

const start = () => {
  const child = spawn(process.execPath, ['server.mjs'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.log = '';
  child.stdout.on('data', (d) => { child.log += d; });
  child.stderr.on('data', (d) => { child.log += d; });
  return child;
};
const base = `http://127.0.0.1:${port}`;
const ready = async () => { for (let i = 0; i < 100; i += 1) { try { if ((await fetch(`${base}/api/health`)).ok) return; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 100)); } throw new Error('server did not start'); };
const get = async (url) => (await fetch(`${base}${url}`)).json();
const post = (url, body) => fetch(`${base}${url}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const results = [];
const check = async (name, fn) => { try { await fn(); results.push(`PASS ${name}`); } catch (error) { results.push(`FAIL ${name}: ${error.message}`); } };

let server = start();
await ready();

await check('fresh install asks for setup and has no personal defaults', async () => {
  const setup = await get('/api/setup');
  assert.equal(setup.configured, false);
  assert.equal(setup.vaultReady, false);
  assert.equal(setup.ownerName, '');
  assert.equal(setup.hermes, false);
  assert.ok(setup.suggestedVault.startsWith(home));
  const character = await get('/api/character');
  assert.equal(character.custom, false);
  assert.equal(character.image, '/character-default.svg');
  const streams = (await get('/api/streams')).streams.map((stream) => stream.label);
  assert.ok(streams.includes('Study') && streams.includes('Other'));
  for (const personal of ['UPCLASS', 'H&S', 'Hirano Housing', 'Movie-pro', 'BlogOS']) assert.ok(!streams.includes(personal), personal);
});
await check('everything answers without a vault (no crashes, empty data)', async () => {
  assert.equal((await get('/api/brain')).nodes.length, 0);
  assert.equal((await get('/api/vault')).notes.length, 0);
  assert.equal((await get('/api/progress')).xp, 0);
  assert.deepEqual((await get('/api/tasks')).tasks, []);
  assert.equal((await get('/api/session')).terminal, 'missing');
});
await check('setup refuses the whole home folder and a missing folder without “create”', async () => {
  assert.equal((await post('/api/setup', { vaultPath: home })).status, 400);
  assert.equal((await post('/api/setup', { vaultPath: path.join(home, 'nope') })).status, 400);
});
const vault = path.join(home, 'Documents', 'BrainBook Vault');
await check('“Start a new vault” creates it and the first dump lands there', async () => {
  const response = await post('/api/setup', { ownerName: 'Ken', vaultPath: vault, create: true });
  assert.equal(response.status, 200);
  const setup = await response.json();
  assert.equal(setup.configured, true);
  assert.equal(setup.vaultReady, true);
  assert.equal(setup.ownerName, 'Ken');
  const created = await post('/api/ideas', { items: [{ text: 'Learn Spanish for travel' }, { text: 'Weekend hiking club' }] });
  assert.equal(created.status, 201);
  assert.equal((await fs.readdir(path.join(vault, 'ideas'))).filter((name) => name.endsWith('.md')).length, 2);
  const brain = await get('/api/brain');
  assert.equal(brain.nodes.filter((node) => node.kind === 'idea').length, 2);
  assert.equal(brain.nodes.find((node) => node.title === 'Learn Spanish for travel').group, 'Study');
});
await check('settings survive a restart', async () => {
  server.kill('SIGTERM');
  await new Promise((r) => server.once('exit', r));
  server = start();
  await ready();
  const setup = await get('/api/setup');
  assert.equal(setup.configured, true);
  assert.equal(setup.vaultPath, vault);
  assert.equal(setup.ownerName, 'Ken');
  assert.equal((await get('/api/brain')).nodes.length, 2);
});
await check('a personal streams.json replaces the default topics', async () => {
  await fs.writeFile(path.join(appHome, 'streams.json'), JSON.stringify({ streams: [{ id: 'trips', label: 'Trips', color: '#ff7a45', patterns: ['travel', 'hiking'] }] }));
  server.kill('SIGTERM');
  await new Promise((r) => server.once('exit', r));
  server = start();
  await ready();
  const labels = (await get('/api/streams')).streams.map((stream) => stream.label);
  assert.deepEqual(labels, ['Trips', 'Other']);
  const groups = (await get('/api/brain')).nodes.map((node) => node.group);
  assert.deepEqual(groups.sort(), ['Trips', 'Trips']);
});

server.kill('SIGTERM');
await fs.rm(home, { recursive: true, force: true });
console.log(results.join('\n'));
if (results.some((line) => line.startsWith('FAIL'))) { console.log(`--- server log ---\n${server.log}`); process.exit(1); }
console.log(`\n${results.length} passed`);
