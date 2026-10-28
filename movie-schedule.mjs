import fs from 'node:fs/promises';

// MoviePro / SHIFT-01 status for BrainBook (owner 2026-10-28). Strictly read-only and source-labelled:
// the project's own EXECUTION-STATE.md and the shared `gpu-job queue list`. Nothing here estimates
// progress or an ETA; anything it cannot read is reported as unknown with the reason.
export const MOVIE_STATE_FILE = '/Users/yuma/Documents/Commercial/Movie/AI-Character-Revenue/EXECUTION-STATE.md';
export const GPU_JOB_BIN = '/Users/yuma/.local/bin/gpu-job';
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

export const readMovieSchedule = async ({ stateFile = MOVIE_STATE_FILE, run }) => {
  const out = { source: { state: stateFile, queue: 'gpu-job queue list' }, readAt: new Date().toISOString(), state: null, queue: null, unknown: [] };
  try {
    const stat = await fs.stat(stateFile);
    out.state = { ...parseExecutionState(await fs.readFile(stateFile, 'utf8')), modifiedAt: stat.mtime.toISOString() };
    if (!out.state.latest) out.unknown.push('EXECUTION-STATE.md has no dated entries');
  } catch (error) { out.unknown.push(`EXECUTION-STATE.md unreadable: ${String(error.message || error).slice(0, 120)}`); }
  try {
    out.queue = summarizeQueue(JSON.parse(await run()));
  } catch (error) { out.unknown.push(`gpu-job queue unreadable: ${String(error.message || error).slice(0, 120)}`); }
  return out;
};
