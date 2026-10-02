// Why did the server stop? Every exit path has to name its reason, and a restart has to keep
// the previous run's lines. This exercises the log the macOS app writes (macos/main.swift opens
// ~/Library/Logs/BrainBook/server.log with O_APPEND and hands that fd to the child).
// Run: node scripts/test-server-log.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Inside macos/build (git-ignored) so the evidence and the server home stay in the repository.
const work = path.join(root, 'macos', 'build', 'log-test');
await fsp.rm(work, { recursive: true, force: true });
await fsp.mkdir(work, { recursive: true });
const appHome = path.join(work, 'Application Support', 'BrainBook');
const logPath = path.join(work, 'server.log');
const port = 4950 + Math.floor(Math.random() * 150);

const env = {
  ...process.env,
  PORT: String(port),
  BRAINBOOK_HOME: appHome,
  ASTER_HERMES_BIN: path.join(work, 'no-hermes'),
};
delete env.OBSIDIAN_VAULT_PATH;
delete env.MORNING_VAULT;
delete env.NODE_OPTIONS;

const base = `http://127.0.0.1:${port}`;
const ready = async () => {
  for (let i = 0; i < 100; i += 1) {
    try { if ((await fetch(`${base}/api/health`)).ok) return; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server did not start');
};
const exited = (child) => new Promise((r) => child.once('exit', (code, signal) => r({ code, signal })));
const readLog = () => fsp.readFile(logPath, 'utf8').catch(() => '');
// The same append-only fd the app hands to the child, so two runs share one file.
const logFd = fs.openSync(logPath, 'a');
const start = (extra = {}) => spawn(process.execPath, ['server.mjs'], {
  cwd: root,
  env: { ...env, ...extra },
  stdio: ['ignore', logFd, logFd],
});
const log = (label, run) => console.log(`--- ${label} (pid ${run.pid}) ---\n${run.log.trim().split('\n').slice(-4).join('\n')}`);

const results = [];
const check = async (name, fn) => { try { await fn(); results.push(`PASS ${name}`); } catch (error) { results.push(`FAIL ${name}: ${error.message}`); } };

let first;
await check('SIGTERM is recorded as a stop reason', async () => {
  const child = start();
  await ready();
  child.kill('SIGTERM');
  const { code } = await exited(child);
  assert.equal(code, 0, `expected a clean exit, got ${code}`);
  const text = await readLog();
  assert.match(text, /stopped: signal SIGTERM/, 'no stop reason in the log');
  first = (text.match(/stopped: signal SIGTERM/g) || []).length;
  log('run 1', { pid: child.pid, log: text });
});

await check('a restart appends instead of emptying the log', async () => {
  const before = await readLog();
  const child = start();
  await ready();
  child.kill('SIGTERM');
  await exited(child);
  const after = await readLog();
  assert.ok(after.length > before.length, 'the log did not grow');
  assert.ok(after.startsWith(before), 'the previous run was truncated, not kept');
  assert.equal((after.match(/BrainBook task system running/g) || []).length, 2, 'only one run left a start line');
  assert.equal((after.match(/stopped: signal SIGTERM/g) || []).length, first + 1, 'the second stop reason is missing');
  log('run 2', { pid: child.pid, log: after });
});

await check('an orphaned server records that its parent is gone', async () => {
  const parent = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' });
  const parentPid = parent.pid;
  await exited(parent);
  const child = start({ BRAINBOOK_PARENT_PID: String(parentPid) });
  await ready();
  const { code } = await exited(child);
  assert.equal(code, 0, `expected a clean exit, got ${code}`);
  const text = await readLog();
  assert.match(text, new RegExp(`stopped: parent gone \\(pid ${parentPid}\\)`), 'no parent-gone reason in the log');
  log('orphan', { pid: child.pid, log: text });
});

await check('an uncaught exception is recorded with its stack and exit code 1', async () => {
  // Fault injection through NODE_OPTIONS: the real handlers in server.mjs must catch this.
  const fault = path.join(work, 'fault.cjs');
  await fsp.writeFile(fault, `setTimeout(() => { throw new Error('injected fault for the log test'); }, 2500);\n`);
  const child = start({ NODE_OPTIONS: `--require ${fault}` });
  await ready();
  const { code } = await exited(child);
  assert.equal(code, 1, `expected exit 1, got ${code}`);
  const text = await readLog();
  assert.match(text, /stopped: uncaught exception/, 'no uncaught-exception reason in the log');
  assert.match(text, /injected fault for the log test/, 'the stack is not in the log');
  log('crash', { pid: child.pid, log: text });
});

await check('no exit path in server.mjs can stay silent', async () => {
  const source = await fsp.readFile(path.join(root, 'server.mjs'), 'utf8');
  const exits = [...source.matchAll(/^\s*(?:const \w+ = )?.*\bprocess\.exit\(/gm)].map((m) => source.slice(0, m.index).split('\n').length);
  // Two only: inside stopWith and stopFatal, the two helpers that always log first.
  assert.deepEqual(exits, [31, 36], `unexpected process.exit calls on lines ${exits}`);
});

fs.closeSync(logFd);
console.log(results.join('\n'));
console.log(`\nlog kept at ${path.relative(root, logPath)} (${(await fsp.stat(logPath)).size} bytes)`);
if (results.some((line) => line.startsWith('FAIL'))) process.exit(1);
console.log(`\n${results.length} passed`);
