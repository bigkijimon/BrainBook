import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import vm from 'node:vm';

const source = await fs.readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const from = source.indexOf('const TEAMS_FILE = ');
const to = source.indexOf('const queueTaskRun =', from);
const code = source.slice(from, to);

const makeCtx = (teamsFileContent, kanbanCalls) => vm.createContext({
  os, path, fs,
  now: () => 'fixture',
  execFileAsync: async () => { throw new Error('teamFor must not be exercised by this suite'); },
  runHermesKanban: async (args) => { kanbanCalls.push(args); return 'ok'; },
  __teamsFileContent: teamsFileContent,
});

test('topProfileFor resolves the profile whose description says "department Top"', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'teams-'));
  const file = path.join(dir, 'teams.yaml');
  await fs.writeFile(file, JSON.stringify({ teams: {
    'app-dev': { profiles: { tora: 'debug diagnostician', apppro: 'department Top (AppPro lead; supervisory receiver for owner direct instructions)' } },
    'no-top-team': { profiles: { someone: 'not a department top' } },
  } }));
  const ctx = makeCtx(null, []);
  vm.runInContext(code.replace("path.join(os.homedir(), 'Documents/AI/router/config/teams.yaml')", `${JSON.stringify(file)}`) + '\nthis.topProfileFor=topProfileFor;this.notifyDepartmentTops=notifyDepartmentTops;', ctx);
  assert.equal(await ctx.topProfileFor('app-dev'), 'apppro');
  assert.equal(await ctx.topProfileFor('no-top-team'), null);
  assert.equal(await ctx.topProfileFor('team-that-does-not-exist'), null);
  assert.equal(await ctx.topProfileFor(null), null);
  await fs.rm(dir, { recursive: true, force: true });
});

test('notifyDepartmentTops sends one comment per unique department and records an unresolved one honestly', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'teams-'));
  const file = path.join(dir, 'teams.yaml');
  await fs.writeFile(file, JSON.stringify({ teams: {
    'app-dev': { profiles: { apppro: 'department Top (AppPro lead; supervisory receiver for owner direct instructions)' } },
  } }));
  const calls = [];
  const ctx = makeCtx(null, calls);
  vm.runInContext(code.replace("path.join(os.homedir(), 'Documents/AI/router/config/teams.yaml')", `${JSON.stringify(file)}`) + '\nthis.notifyDepartmentTops=notifyDepartmentTops;', ctx);
  const task = { plan: { assignments: [
    { department: 'app-dev', actor: 'synthetic-actor' },
    { department: 'app-dev', actor: 'another-actor' }, // same department twice -> one comment, not two
    { department: 'unknown-dept', actor: 'someone' },
  ] } };
  const results = await ctx.notifyDepartmentTops(task, 'card-123');
  assert.equal(calls.length, 1); // deduped by department
  assert.equal(calls[0][0], 'comment');
  assert.equal(calls[0][1], 'card-123');
  assert.match(calls[0][2], /Supervisory copy for apppro/);
  assert.deepEqual(JSON.parse(JSON.stringify(results.map((r) => r.department))).sort(), ['app-dev', 'unknown-dept']);
  const appDev = results.find((r) => r.department === 'app-dev');
  assert.equal(appDev.ok, true); assert.equal(appDev.profile, 'apppro');
  const unknown = results.find((r) => r.department === 'unknown-dept');
  assert.equal(unknown.ok, false); assert.equal(unknown.profile, null);
  assert.match(unknown.error, /No department Top profile/);
  await fs.rm(dir, { recursive: true, force: true });
});

test('a failed kanban comment call is recorded, not thrown', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'teams-'));
  const file = path.join(dir, 'teams.yaml');
  await fs.writeFile(file, JSON.stringify({ teams: { 'app-dev': { profiles: { apppro: 'department Top' } } } }));
  const ctx = vm.createContext({
    os, path, fs, now: () => 'fixture',
    execFileAsync: async () => { throw new Error('unused'); },
    runHermesKanban: async () => { throw new Error('kanban unreachable'); },
  });
  vm.runInContext(code.replace("path.join(os.homedir(), 'Documents/AI/router/config/teams.yaml')", `${JSON.stringify(file)}`) + '\nthis.notifyDepartmentTops=notifyDepartmentTops;', ctx);
  const results = await ctx.notifyDepartmentTops({ plan: { assignments: [{ department: 'app-dev', actor: 'x' }] } }, 'card-1');
  assert.equal(results.length, 1);
  assert.equal(results[0].ok, false);
  assert.match(results[0].error, /kanban unreachable/);
  await fs.rm(dir, { recursive: true, force: true });
});
