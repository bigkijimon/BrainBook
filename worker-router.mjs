// BrainBook's read-only inference boundary. Router alone selects the worker and model.
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { formatJevSendBack, judgeRouterLane } from './jev-decisions.mjs';

// Match the Router's canonical shared repair hold, not a browser-supplied path.
export const DEFAULT_WORKER_HOLD_PATH = '/Users/yuma/Documents/Hermes/.hermes/state/team-lane/repair-hold.json';

export const requireWorkerLaneOpen = async ({ executable, holdPath = DEFAULT_WORKER_HOLD_PATH }) => {
  if (!executable || !path.isAbsolute(executable)) {
    throw Object.assign(new Error('Worker Router submit is not configured.'), { status: 503 });
  }
  try {
    const stat = await fs.stat(executable);
    if (!stat.isFile()) throw new Error('not a file');
    await fs.access(executable, constants.X_OK);
  } catch {
    throw Object.assign(new Error('Worker Router submit is not executable.'), { status: 503 });
  }
  try {
    await fs.lstat(holdPath);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw Object.assign(new Error('Shared worker repair hold could not be checked.'), { status: 503 });
  }
  throw Object.assign(new Error('Shared worker repair hold is active.'), { status: 503 });
};

export const resolveRouterSubmit = ({ submitPath, routerPath } = {}) => {
  const explicit = submitPath?.trim();
  if (explicit) return path.isAbsolute(explicit) ? explicit : null;
  if (path.isAbsolute(routerPath || '') && path.basename(routerPath) === 'route'
      && path.basename(path.dirname(routerPath)) === 'bin') {
    return path.join(path.dirname(routerPath), 'submit');
  }
  return null;
};

export const workerEnvironment = (source = process.env) => {
  const env = { PATH: '/opt/homebrew/bin:/usr/bin:/bin' };
  for (const key of ['LANG', 'LC_ALL', 'TZ', 'TMPDIR', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_STATE_HOME', 'XDG_CACHE_HOME']) {
    if (typeof source[key] === 'string' && source[key]) env[key] = source[key];
  }
  return env;
};

// The Router's read-only lane, asked with `--json --check --origin hermes <text>`; the last line
// of stdout is the decision. This adapter judges nothing: judgeRouterLane (jev-decisions.mjs) decides
// whether the answer is Jev advice or the Router's own decision, whether the lane it names may be
// used at all, and what must be sent back. Anything sent back resolves to null, which the caller
// reads as "keep the deterministic lane", and the send-back is logged with no task text.
// The interpreter and the process spawn are accepted, not created, so the real Router binary and
// a fixture script are the two adapters on this one seam.
export const routeTaskLane = ({ routerPath, text, pythonBin = 'python3', spawnFn = spawn,
  timeoutMs = 6000, maxBytes = 64 * 1024, onSendBack = (verdict) => console.log(formatJevSendBack(verdict)) } = {}) => {
  const body = typeof text === 'string' ? text.trim() : '';
  if (!routerPath || !body) return Promise.resolve(null);
  return new Promise((resolve) => {
    let child;
    try {
      child = spawnFn(pythonBin, [routerPath, '--json', '--check', '--origin', 'hermes', body], { stdio: ['ignore', 'pipe', 'ignore'] });
    } catch { resolve(null); return; }
    let output = '';
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => { child.kill('SIGTERM'); finish(null); }, timeoutMs);
    child.stdout?.on('data', (chunk) => {
      if (settled) return;
      output += chunk.toString('utf8');
      if (Buffer.byteLength(output, 'utf8') > maxBytes) { child.kill('SIGTERM'); finish(null); }
    });
    child.on('error', () => finish(null));
    child.on('close', (code) => {
      if (settled) return;
      if (code !== 0) { finish(null); return; }
      let decision = null;
      try { decision = JSON.parse(output.trim().split('\n').filter(Boolean).at(-1)); } catch { finish(null); return; }
      if (!decision || typeof decision !== 'object' || Array.isArray(decision)) { finish(null); return; }
      const judged = judgeRouterLane(decision);
      if (judged.sendBack) { onSendBack(judged.sendBack); finish(null); return; }
      finish({ worker: judged.worker, routeSource: decision.source || 'deterministic',
        routeStatus: decision.status || 'ready', reason: decision.reason || null, confidence: judged.confidence });
    });
  });
};

export const parseRouterResult = (stdout, code, taskId) => {
  let result;
  try { result = JSON.parse(stdout.trim().split('\n').at(-1)); } catch {
    throw new Error('Worker Router returned no valid result.');
  }
  if (code !== 0 || result?.status !== 'completed') {
    throw new Error(`Worker Router stopped: ${String(result?.reason || result?.status || 'failed').slice(0, 120)}`);
  }
  if (result.worker_cost_policy?.mode !== 'free_only' || result.worker_cost_policy?.paid_worker_execution !== false) {
    throw new Error('Worker Router did not confirm free-only execution.');
  }
  if (result.task_id !== taskId || typeof result.worker !== 'string' || !result.worker.trim()
      || typeof result.model !== 'string' || !result.model.trim()
      || typeof result.summary !== 'string' || !result.summary.trim()) {
    throw new Error('Worker Router returned incomplete answer or dispatch evidence.');
  }
  return { text: result.summary, taskId, worker: result.worker, model: result.model };
};

export const submitWorkerText = ({ prompt, purpose, cwd, executable, timeoutMs = 120000, spawnFn = spawn }) => {
  if (!executable || !path.isAbsolute(executable)) return Promise.reject(new Error('Worker Router submit is not configured.'));
  if (!cwd || !path.isAbsolute(cwd) || !prompt?.trim() || prompt.length > 16000) {
    return Promise.reject(new Error('Worker Router needs a bounded prompt and working directory.'));
  }
  const taskId = `brainbook-${crypto.randomUUID()}`;
  const packet = {
    task_id: taskId, task: prompt, owner: `brainbook:${String(purpose || 'worker').slice(0, 80)}`,
    origin: 'hermes', hop_count: 0, working_directory: cwd,
    scope: { read: [cwd], write: [] }, auto_context: false,
    constraints: 'Read-only answer. No tools, file writes, publication, deployment, spending, credential access or production changes.',
    validation: ['Return a concise answer based only on supplied context; state missing evidence.'],
    stop_when: 'Return one answer or the exact blocker. No provider fallback outside Router.',
    cost_policy: 'free_only', report_to: 'BrainBook',
  };
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnFn(executable, [], { stdio: ['pipe', 'pipe', 'pipe'], shell: false, detached: true,
        env: workerEnvironment() });
    } catch { reject(new Error('Worker Router could not start.')); return; }
    let output = '';
    let settled = false;
    const stop = () => {
      if (Number.isInteger(child.pid) && child.pid > 1) {
        try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill?.('SIGKILL'); }
      } else child.kill?.('SIGKILL');
    };
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error); else resolve(value);
    };
    const timer = setTimeout(() => { stop(); finish(new Error('Worker Router timed out.')); }, Math.min(Math.max(timeoutMs, 1000), 320000));
    child.stdout.on('data', (chunk) => {
      if (settled) return;
      output += chunk.toString('utf8');
      if (Buffer.byteLength(output) > 1024 * 1024) { stop(); finish(new Error('Worker Router response exceeded its limit.')); }
    });
    child.stderr.resume();
    child.on('error', () => finish(new Error('Worker Router could not start.')));
    child.stdin.on('error', () => { stop(); finish(new Error('Worker Router did not accept the task.')); });
    child.on('close', (code) => {
      if (settled) return;
      try { finish(null, parseRouterResult(output, code, taskId)); } catch (error) { finish(error); }
    });
    child.stdin.end(JSON.stringify(packet));
  });
};
