import fs from 'node:fs/promises';

// MoviePro / SHIFT-01 status for BrainBook (owner 2026-10-28). Strictly read-only and source-labelled:
// the project's own EXECUTION-STATE.md and the shared `gpu-job queue list`. Nothing here estimates
// progress or an ETA; anything it cannot read is reported as unknown with the reason.
export const MOVIE_STATE_FILE = '/Users/yuma/Documents/Commercial/Movie/AI-Character-Revenue/EXECUTION-STATE.md';
export const GPU_JOB_BIN = '/Users/yuma/.local/bin/gpu-job';
export const REGISTRY_FILE = '/Users/yuma/Documents/Movie-pro/MovieProduction/PROJECT-BOUNDARIES-REGISTRY.md';
const TERMINAL = new Set(['PASSED', 'CANCELLED', 'FAILED_FINAL']);

// "- Label ..." bullet plus its indented continuation lines, verbatim.
const bulletStarting = (body, label) => {
  const start = body.findIndex((line) => line.startsWith(`- ${label}`));
  if (start < 0) return null;
  const out = [body[start]];
  for (let i = start + 1; i < body.length && /^\s+\S/.test(body[i]); i += 1) out.push(body[i].trim());
  return out.join(' ').replace(/^- /, '').replace(/\s+/g, ' ').trim();
};

export const parseExecutionState = (text) => {
  const entries = [];
  for (const line of String(text).split('\n')) {
    if (line.startsWith('## ')) entries.push({ heading: line.slice(3).trim(), body: [] });
    else if (entries.length) entries.at(-1).body.push(line);
  }
  if (!entries.length) return null;
  const latest = entries.at(-1);
  const ruleEntry = [...entries].reverse().find((entry) => /one video at a time/i.test(entry.heading));
  return {
    latest: { heading: latest.heading, nextStep: bulletStarting(latest.body, 'NEXT STEP') },
    rule: ruleEntry ? { heading: ruleEntry.heading, text: bulletStarting(ruleEntry.body, 'Standing rule') } : null,
    recent: entries.slice(-5).reverse().map((entry) => entry.heading),
  };
};

export const summarizeQueue = (rows, prefix = 'shift01') => {
  const mine = rows.filter((row) => String(row.job_id || '').toLowerCase().startsWith(prefix));
  const live = (list) => list.filter((row) => !TERMINAL.has(row.status) && row.status !== 'FAILED_RETRYABLE');
  const pick = (row) => ({ id: row.job_id, status: row.status, stage: row.stage, updatedAt: row.updated_at });
  return {
    active: live(mine).map(pick),
    otherActive: live(rows.filter((row) => !mine.includes(row))).map(pick),
    shift01Counts: mine.reduce((counts, row) => ({ ...counts, [row.status]: (counts[row.status] || 0) + 1 }), {}),
  };
};

// The six steps the owner named for one SHIFT-01 video. Neither source records per-step completion, so the only
// facts drawn from them are: (current) a running job whose stage or id names a step, and (next) the first step
// named in the note's NEXT STEP line. Everything else about the steps stays unknown.
export const PIPELINE_STEPS = ['t1', 't7', 'ti', 't8', 'assembly', 'final'];
const tokenAt = (step, text) => String(text || '').search(new RegExp(`(^|[^a-z0-9])${step}(?![a-z0-9])`, 'i'));
export const locatePipeline = ({ generating = [], nextStep = null }) => {
  let current = null;
  for (const job of generating) {
    const step = PIPELINE_STEPS.find((candidate) => tokenAt(candidate, `${job.stage || ''} ${job.id || ''}`) >= 0);
    if (step) { current = { step, jobId: job.id, basis: `running job ${job.id}` }; break; }
  }
  const hits = PIPELINE_STEPS.map((step) => ({ step, at: tokenAt(step, nextStep) })).filter((hit) => hit.at >= 0).sort((a, b) => a.at - b.at);
  const next = hits.length ? { step: hits[0].step, basis: 'first tracked step named in the note NEXT STEP line' } : null;
  return { steps: PIPELINE_STEPS, current, next };
};

// "What is coming after this video" (owner 2026-10-28). Three coarse queue-level items, each read from its own
// source at request time; a reader that cannot parse its source returns { unknown: reason } instead of a guess.
const splitEntries = (text) => {
  const entries = [];
  for (const line of String(text).split('\n')) {
    if (line.startsWith('## ')) entries.push({ heading: line.slice(3).trim(), body: [] });
    else if (entries.length) entries.at(-1).body.push(line);
  }
  return entries;
};
const newest = (rows) => rows.map((row) => row.updated_at).filter(Boolean).sort().at(-1) || null;

// Newest "QUEUED NEXT ... : <title> (...) -- NOT STARTED" entry, with its START GATE bullet verbatim.
export const readGatedNext = (text) => {
  const entry = [...splitEntries(text)].reverse().find((candidate) => /QUEUED NEXT/i.test(candidate.heading));
  if (!entry) return { unknown: 'no “QUEUED NEXT” entry in EXECUTION-STATE.md' };
  const title = /QUEUED NEXT[^:]*:\s*(.+?)\s*(?:\(|--|$)/i.exec(entry.heading)?.[1];
  if (!title) return { unknown: `could not read a project name from “${entry.heading.slice(0, 100)}”` };
  const gate = bulletStarting(entry.body, 'START GATE');
  return { title, heading: entry.heading, notStarted: /NOT STARTED/i.test(entry.heading), gate: gate ? gate.replace(/^START GATE\s*/, '') : null };
};

// The project cleared from the shared queue to keep one video at a time, cross-checked against real CANCELLED rows.
export const readPaused = (text, rows) => {
  const entry = [...splitEntries(text)].reverse().find((candidate) => bulletStarting(candidate.body, 'Also cleared from the shared queue'));
  if (!entry) return { unknown: 'no “cleared from the shared queue” bullet in EXECUTION-STATE.md' };
  const bullet = bulletStarting(entry.body, 'Also cleared from the shared queue');
  const prefix = /\b([a-z][a-z0-9]*-[a-z0-9]+)-[a-z]+\d+\.\.\d+/.exec(bullet)?.[1];
  if (!prefix) return { unknown: 'could not read the cancelled job-id prefix from the bullet' };
  const label = /\(([A-Z][A-Z0-9-]+),/.exec(bullet)?.[1];
  const retry = /(gpu-job queue retry [^\s`]+)/.exec(bullet)?.[1];
  const mine = rows.filter((row) => String(row.job_id).startsWith(prefix));
  const cancelled = mine.filter((row) => row.status === 'CANCELLED');
  return { label: label || prefix, prefix, retry: retry || null, cancelledJobs: cancelled.map((row) => row.job_id).sort(), cancelledAt: newest(cancelled), otherStates: mine.length - cancelled.length, noteHeading: entry.heading };
};

// storyAriake: registry row classification plus what the queue actually holds for it right now.
export const readStoryAriake = (registryText, rows) => {
  const row = String(registryText).split('\n').find((line) => /^\|\s*\*\*storyAriake\*\*/.test(line));
  const mine = rows.filter((job) => String(job.job_id).toLowerCase().startsWith('storyariake'));
  const count = (status) => mine.filter((job) => job.status === status).length;
  const queue = { generating: count('GENERATING'), queued: count('QUEUED'), total: mine.length, passed: count('PASSED'), cancelled: count('CANCELLED'), lastActivity: newest(mine) };
  if (!row) return { unknown: 'no storyAriake row in PROJECT-BOUNDARIES-REGISTRY.md', queue };
  const classification = /\|\s*Film \(classified:\s*([^;.)]+)/.exec(row)?.[1]?.trim() || null;
  const route = /GPU execution route:\s*\**\s*([A-Z]+)\s*(\d{4}-\d{2}-\d{2})?/.exec(row);
  return { classification: classification ? `Film · ${classification}` : null, gpuRoute: route ? { status: route[1], since: route[2] || null } : null, queue };
};

export const readMovieSchedule = async ({ stateFile = MOVIE_STATE_FILE, registryFile = REGISTRY_FILE, run }) => {
  const out = { source: { state: stateFile, queue: 'gpu-job queue list' }, readAt: new Date().toISOString(), state: null, queue: null, unknown: [] };
  let stateText = null; let rows = null; let registryText = null;
  try {
    const stat = await fs.stat(stateFile);
    stateText = await fs.readFile(stateFile, 'utf8');
    out.state = { ...parseExecutionState(stateText), modifiedAt: stat.mtime.toISOString() };
    if (!out.state.latest) out.unknown.push('EXECUTION-STATE.md has no dated entries');
  } catch (error) { out.unknown.push(`EXECUTION-STATE.md unreadable: ${String(error.message || error).slice(0, 120)}`); }
  try {
    rows = JSON.parse(await run());
    out.queue = summarizeQueue(rows);
  } catch (error) { out.unknown.push(`gpu-job queue unreadable: ${String(error.message || error).slice(0, 120)}`); }
  try { registryText = await fs.readFile(registryFile, 'utf8'); } catch (error) { out.unknown.push(`PROJECT-BOUNDARIES-REGISTRY.md unreadable: ${String(error.message || error).slice(0, 120)}`); }
  const generating = (out.queue?.active || []).filter((job) => job.status === 'GENERATING');
  out.pipeline = locatePipeline({ generating, nextStep: out.state?.latest?.nextStep });
  const missing = (what) => ({ unknown: `${what} was not readable` });
  out.outlook = {
    sources: { state: stateFile, registry: registryFile, queue: 'gpu-job queue list' },
    next: stateText ? readGatedNext(stateText) : missing('EXECUTION-STATE.md'),
    paused: !stateText ? missing('EXECUTION-STATE.md') : rows ? readPaused(stateText, rows) : missing('the GPU queue'),
    storyAriake: !registryText ? missing('the project registry') : rows ? readStoryAriake(registryText, rows) : missing('the GPU queue'),
  };
  return out;
};
