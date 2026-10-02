import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = 4800 + Math.floor(Math.random() * 200);
const home = await fs.mkdtemp(path.join(os.tmpdir(), 'brainbook-priority-'));
const jevCapture = path.join(home, 'jev-inputs.jsonl');
const jevHelper = path.join(home, 'jev-stub.mjs');
const localConfigPath = path.join(home, 'local-ai.json');
const localRequests = [];
let servedModel = 'test-local-model';
let modelListCalls = 0;
let sleeping = false;
let propsCalls = 0;
let localAnswer = { priority: 'high', basis: 'impact' };
const localServer = http.createServer(async (req, res) => {
  res.setHeader('content-type', 'application/json');
  if (req.method === 'GET' && req.url === '/props') {
    propsCalls += 1;
    res.end(JSON.stringify({ is_sleeping: sleeping }));
    return;
  }
  if (req.method === 'GET' && req.url === '/v1/models') {
    modelListCalls += 1;
    res.end(JSON.stringify({ data: [{ id: servedModel }] }));
    return;
  }
  if (req.method === 'POST' && req.url === '/v1/chat/completions') {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    localRequests.push(JSON.parse(raw));
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(localAnswer) } }] }));
    return;
  }
  res.writeHead(404).end('{}');
});
await new Promise((resolve) => localServer.listen(0, '127.0.0.1', resolve));
const localPort = localServer.address().port;
const portProbe = http.createServer();
await new Promise((resolve) => portProbe.listen(0, '127.0.0.1', resolve));
const comfyPort = portProbe.address().port;
await new Promise((resolve) => portProbe.close(resolve));
let comfyServer = null;
const startComfy = async () => {
  comfyServer = http.createServer((req, res) => {
    if (req.url === '/system_stats') { res.writeHead(200).end('{}'); return; }
    res.writeHead(404).end('{}');
  });
  await new Promise((resolve) => comfyServer.listen(comfyPort, '127.0.0.1', resolve));
};
const stopComfy = async () => {
  if (!comfyServer) return;
  await new Promise((resolve) => comfyServer.close(resolve));
  comfyServer = null;
};
await fs.writeFile(localConfigPath, JSON.stringify({
  provider: { canonical_id: 'local-llamacpp', api: 'openai-compatible', base_url: `http://127.0.0.1:${localPort}/v1` },
  models: { main: { id: 'test-local-model', engine: 'llama-server', roles: ['classification'] } },
  ports: { [String(comfyPort)]: 'ComfyUI' },
  invariants: { main_provider: 'local-llamacpp', main_endpoint: `http://127.0.0.1:${localPort}/v1`, forbidden_endpoints: [] },
}));
await fs.writeFile(jevHelper, [
  "import fs from 'node:fs/promises';",
  "let raw = ''; for await (const chunk of process.stdin) raw += chunk;",
  "const request = JSON.parse(raw);",
  "await fs.appendFile(process.env.JEV_CAPTURE_PATH, `${JSON.stringify(request)}\\n`);",
  "const count = (await fs.readFile(process.env.JEV_CAPTURE_PATH, 'utf8')).trim().split('\\n').length;",
  "const result = count <= 2 ? { status: 'ok', priority: count === 1 ? 'high' : 'low', confidence: 0.93 } : { status: 'budget_exhausted', priority: null };",
  "process.stdout.write(JSON.stringify(result));",
].join('\n'));
const serverEnv = {
  ...process.env,
  NODE_ENV: 'test',
  PORT: String(port),
  BRAINBOOK_HOME: home,
  ASTER_HERMES_BIN: '/missing/hermes',
  ASTER_HERMES_CWD: home,
  HERMES_HOME: path.join(home, 'no-hermes'),
  AI_ROUTER_BIN: '',
  BRAINBOOK_JEV_PRIORITY_HELPER: jevHelper,
  BRAINBOOK_JEV_PYTHON: process.execPath,
  JEV_CAPTURE_PATH: jevCapture,
  BRAINBOOK_LOCAL_AI_CONFIG_PATH: localConfigPath,
};
if (process.env.BRAINBOOK_TEST_JEV_DISABLED === '1') {
  delete serverEnv.JEV_TASK_PRIORITY_ENABLED;
  delete serverEnv.JEV_CONTROL_ENABLED;
} else {
  serverEnv.JEV_TASK_PRIORITY_ENABLED = '1';
  serverEnv.JEV_CONTROL_ENABLED = '1';
}
const server = spawn(process.execPath, ['server.mjs'], {
  cwd: root,
  env: serverEnv,
  stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
server.stdout.on('data', (data) => { log += data; });
server.stderr.on('data', (data) => { log += data; });
const base = `http://127.0.0.1:${port}`;
try {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* waiting for server */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const create = async (input) => {
    const response = await fetch(`${base}/api/tasks`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
    assert.equal(response.status, 201);
    return (await response.json()).task;
  };
  const jevInputs = async () => (await fs.readFile(jevCapture, 'utf8').catch(() => '')).trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  if (process.env.BRAINBOOK_TEST_JEV_DISABLED === '1') {
    const localOnly = await create({ title: 'Organize review notes', description: 'Prepare a summary for the weekly planning.' });
    assert.equal(localOnly.priority, 'high');
    assert.equal(localOnly.routing.prioritySource, 'local-model');
    assert.equal((await jevInputs()).length, 0, 'Jev must stay off unless both opt-in flags are explicitly set');
    assert.equal(localRequests.length, 1);
    assert.doesNotMatch(log, /Organize review notes/);
    sleeping = true;
    const asleep = await create({ title: 'Collect review material', description: 'Gather the notes for the planning meeting.' });
    assert.equal(asleep.routing.prioritySource, 'deterministic');
    assert.equal(localRequests.length, 1, 'a sleeping model must never be woken for task triage');
    assert.equal(modelListCalls, 1, 'a sleeping model must not even be listed');
    assert.ok(propsCalls >= 2);
    sleeping = false;
    console.log('PASS Jev is opt-in; an unconfigured app uses the local classifier and never calls the paid provider');
    console.log('PASS a sleeping local model is never woken (GPU stays free for video/local tools)');
  } else {
  const first = await create({ title: 'Reorganize a folder', description: 'Prepare a plan for the next review.' });
  assert.equal(first.priority, 'high');
  assert.equal(first.routing.prioritySource, 'jev');
  assert.match(first.routing.priorityReason, /Jev/i);
  assert.equal((await jevInputs()).length, 1);
  const beforeRead = (await jevInputs()).length;
  const listResponse = await fetch(`${base}/api/tasks`);
  assert.equal(listResponse.status, 200);
  assert.equal((await jevInputs()).length, beforeRead, 'loading existing tasks must not send them to Jev');

  const edited = await fetch(`${base}/api/tasks/${encodeURIComponent(first.id)}`, {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Archive a folder', description: 'Review the new grouping rules.', priority: first.priority, routing: first.routing }),
  });
  assert.equal(edited.status, 200);
  const editedTask = (await edited.json()).task;
  assert.equal(editedTask.priority, 'low', 'an automatically assigned prior value is not a manual override');
  assert.equal(editedTask.routing.prioritySource, 'jev');
  let inputs = await jevInputs();
  assert.equal(inputs.length, 2);
  assert.equal(inputs[0].task_id, inputs[1].task_id, 'edits must reuse the stable opaque task identity');
  assert.equal(inputs[0].title, first.title);
  assert.equal(inputs[1].title, 'Archive a folder');
  assert.notEqual(inputs[0].task_id, first.id, 'raw task identity must not be transmitted');

  const fallback = await create({ title: 'Design a filing process', description: 'Draft the new folder organization.' });
  assert.equal(fallback.priority, 'high', 'Jev failure should use the already-running local classifier before deterministic fallback');
  assert.equal(fallback.routing.prioritySource, 'local-model');
  assert.match(fallback.routing.priorityReason, /local model/i);
  assert.equal(localRequests.length, 1);
  const localPayload = localRequests[0];
  assert.equal(localPayload.model, 'test-local-model');
  assert.equal(localPayload.temperature, 0);
  assert.ok(localPayload.max_tokens <= 32);
  assert.equal(localPayload.stream, false);
  assert.equal(localPayload.chat_template_kwargs.enable_thinking, false);
  assert.equal(localPayload.response_format.type, 'json_object');
  assert.equal(localPayload.response_format.schema.additionalProperties, false);
  const taskData = JSON.parse(localPayload.messages[1].content);
  assert.deepEqual(Object.keys(taskData).sort(), ['description', 'title']);
  assert.equal(taskData.title, 'Design a filing process');
  assert.doesNotMatch(JSON.stringify(localPayload.messages), /task-\w{8}/);
  assert.equal((await jevInputs()).length, 3);
  await startComfy();
  const blockedByComfy = await create({ title: 'Revisit the storage approach', description: 'Prepare options before the next team review.' });
  assert.equal(blockedByComfy.priority, 'normal');
  assert.equal(blockedByComfy.routing.prioritySource, 'deterministic');
  assert.equal(localRequests.length, 1, 'local inference must be skipped while ComfyUI owns the shared GPU');
  assert.equal(modelListCalls, 1, 'the local model endpoint must not even be probed while ComfyUI owns the shared GPU');
  await stopComfy();
  servedModel = 'unexpected-model';
  const wrongModel = await create({ title: 'Review the backlog arrangement', description: 'Compare the current structure with the planned option.' });
  assert.equal(wrongModel.priority, 'normal');
  assert.equal(wrongModel.routing.prioritySource, 'deterministic');
  assert.equal(localRequests.length, 1, 'a different served model must never receive a task classification request');
  assert.equal(modelListCalls, 2, 'the served model identity must be checked before each local classification');
  servedModel = 'test-local-model';
  const manualSamePriority = await fetch(`${base}/api/tasks/${encodeURIComponent(editedTask.id)}`, {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Archive the folder', description: 'Review grouping rules.', priority: editedTask.priority, routing: { ...editedTask.routing, prioritySource: 'manual', priorityReason: 'manual domain override' } }),
  });
  assert.equal(manualSamePriority.status, 200);
  const manualSameTask = (await manualSamePriority.json()).task;
  assert.equal(manualSameTask.priority, editedTask.priority, 'manual selection stays authoritative even if its value was unchanged');
  assert.equal(manualSameTask.routing.prioritySource, 'manual');
  assert.equal((await jevInputs()).length, 5, 'manual selection remains protected when stream metadata changes');
  const urgent = await create({ title: 'Verify urgent reservation today', description: 'Customer is blocked by the production issue.' });
  assert.equal(urgent.priority, 'high');
  assert.equal(urgent.routing.prioritySource, 'deterministic');
  assert.equal(urgent.routing.priorityReason, 'deadline / production / blocked signal detected');
  assert.equal(urgent.routing.routeSource, 'deterministic');
  const flexible = await create({ title: 'Explore an optional theme idea', description: 'Could tidy it up someday.' });
  assert.equal(flexible.priority, 'low');
  assert.equal((await jevInputs()).length, 5, 'clear local high/low decisions do not spend Jev budget');
  const manual = await create({ title: 'Urgent deadline today', description: 'Customer is blocked.', priority: 'low' });
  assert.equal(manual.priority, 'low');
  assert.equal(manual.routing.priorityReason, 'manual priority override');
  const manualEdit = await fetch(`${base}/api/tasks/${encodeURIComponent(manual.id)}`, {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Urgent deadline tomorrow', description: 'Still blocked.', priority: 'low', routing: manual.routing }),
  });
  assert.equal(manualEdit.status, 200);
  assert.equal((await manualEdit.json()).task.priority, 'low');
  assert.equal((await jevInputs()).length, 5, 'manual priority must prevent a Jev request');
  assert.doesNotMatch(log, /jev|typesafe/i);
  assert.doesNotMatch(log, /Reorganize a folder|Archive a folder|Customer is blocked/);
  console.log('PASS Jev is called only for new/text-edited ambiguous tasks, never for bulk GET or manual priority');
  console.log('PASS stable opaque Jev identity, title/description-only local input, and deterministic fallback on unsafe/unavailable local inference');
  console.log('PASS local JSON-schema request is bounded, model-verified, and skipped while ComfyUI owns the GPU');
  console.log('PASS manual priority overrides both classifiers');
  }
} catch (error) {
  console.error(error);
  if (log) console.error(log);
  process.exitCode = 1;
} finally {
  server.kill('SIGTERM');
  await stopComfy();
  await new Promise((resolve) => localServer.close(resolve));
  await fs.rm(home, { recursive: true, force: true });
}
