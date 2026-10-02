// Capture sorting (owner 2026-09-30): "when I post something, decide by itself whether it is a
// goal, a task or an idea; if it connects to other things, explain the connection, and actually
// support me until it is achieved".
//
// One call per capture. A free model (OpenCode MiMo, the same one the planner uses) reads the
// text together with a short list of what already exists: goals, ideas, BrainBook tasks and open
// team cards. It returns the kind, one reason, the real connections (only ids from that list),
// and for a goal or task the first concrete steps. Without the model a keyword rule decides and
// the result says so; nothing is invented.
import { spawn } from 'node:child_process';

// opencode waits for stdin when it is a pipe; execFile leaves stdin open, so every call hung until
// its timeout (measured 2026-09-30: 45 s / 120 s timeouts vs 7.8 s with stdin ignored).
export const runOpencode = (args, { cwd, timeout }) => new Promise((resolve, reject) => {
  const child = spawn('opencode', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'] });
  let stdout = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; if (stdout.length > 4 * 1024 * 1024) child.kill(); });
  const timer = setTimeout(() => { child.kill(); reject(new Error(`opencode timed out after ${timeout} ms`)); }, timeout);
  child.on('error', (error) => { clearTimeout(timer); reject(error); });
  child.on('close', (code) => { clearTimeout(timer); code === 0 ? resolve({ stdout }) : reject(new Error(`opencode exited ${code}`)); });
});
const MODEL = process.env.BRAINBOOK_CAPTURE_MODEL || 'opencode/mimo-v2.6-flash-free';

const GOAL_WORDS = /(したい|なりたい|言いたい|なる[!！。]?$|目標|夢|達成|いつか|将来|\bgoal\b|\bi want to (be|become|have)\b|\bbecome\b|\bdream\b|月\s*\d+\s*万|年収|売上\s*\d)/i;
const TASK_WORDS = /(して(ください|下さい|ほしい|欲しい)|直して|修正|確認|送る|送って|作って|やる$|やって|予約|支払|払う|提出|返信|連絡|電話|買う|\bfix\b|\bsend\b|\bbook\b|\bcall\b|\bpay\b|\bsubmit\b|\bcheck\b|\bupdate\b|\bby (mon|tue|wed|thu|fri|sat|sun|tomorrow|today)\b|今日|明日|まで(に)?)/i;
export const ruleKind = (text) => (GOAL_WORDS.test(text) ? 'goal' : TASK_WORDS.test(text) ? 'task' : 'idea');

const clip = (value, max) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);

// candidates: [{ id, kind: 'goal'|'idea'|'task'|'card', title, summary? }]
export const sortCapture = async ({ text, candidates, cwd, timeoutMs = 45000 }) => {
  const list = candidates.slice(0, 80);
  const prompt = [
    'You sort one note that the owner just wrote into a personal task system. The owner writes Japanese or English.',
    'Return ONLY valid JSON, no markdown fences. Do not modify files or run commands.',
    'Decide the kind:',
    '- "goal": an outcome or state the owner wants to reach over weeks or months (for example "I want to sell an app and call myself an app engineer"). It needs several steps.',
    '- "task": one concrete action with a clear finish line that can be done in a day or less.',
    '- "idea": a possibility, a thought or a "what if", with no commitment yet.',
    'Then find real connections ONLY among the EXISTING ITEMS below: things that serve the same outcome, are a step toward it, or would be affected by it. Use only ids from the list. It is fine to return no connections. Never invent ids.',
    'For a goal: give 3 to 5 concrete steps toward it, in order. Each step is a short action a person can start today, and each step names an existing item when one already covers that step. For a task: 1 to 3 steps. For an idea: 0 to 2 small steps to test it.',
    'Write "title", "reason", every "why" and every step in the SAME language as the owner\'s note. Keep each one short and plain.',
    'Shape: {"kind":"goal|task|idea","title":"short title","reason":"one sentence: why this kind","links":[{"id":"...","why":"one sentence: how it connects"}],"steps":[{"text":"...","uses":"existing id or empty"}]}',
    '',
    `OWNER NOTE: ${clip(text, 1500)}`,
    '',
    'EXISTING ITEMS:',
    ...list.map((item) => `- id=${item.id} | ${item.kind} | ${clip(item.title, 110)}${item.summary ? ` | ${clip(item.summary, 140)}` : ''}`),
  ].join('\n');
  try {
    const { stdout } = await runOpencode(['run', '--format', 'json', '--model', MODEL, '--agent', 'plan', '--title', 'BrainBook capture', prompt], { cwd, timeout: timeoutMs });
    const texts = stdout.split('\n').map((line) => { try { return JSON.parse(line); } catch { return null; } })
      .filter((event) => event?.type === 'text' && typeof event.part?.text === 'string').map((event) => event.part.text);
    const raw = texts.join('').trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
    const parsed = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
    const ids = new Map(list.map((item) => [item.id, item]));
    const kind = ['goal', 'task', 'idea'].includes(parsed.kind) ? parsed.kind : ruleKind(text);
    const links = (Array.isArray(parsed.links) ? parsed.links : [])
      .filter((link) => ids.has(link?.id)).slice(0, 6)
      .map((link) => ({ ...ids.get(link.id), why: clip(link.why, 240) }));
    const steps = (Array.isArray(parsed.steps) ? parsed.steps : []).slice(0, 5)
      .map((step) => ({ text: clip(step?.text ?? step, 200), uses: ids.has(step?.uses) ? step.uses : null }))
      .filter((step) => step.text);
    return { kind, title: clip(parsed.title, 90) || clip(text.split(/\r?\n/)[0], 90), reason: clip(parsed.reason, 300), links, steps, source: 'model', model: MODEL };
  } catch {
    const kind = ruleKind(text);
    return { kind, title: clip(text.split(/\r?\n/)[0], 90), reason: 'Sorted by keyword rule (the model was not reachable).', links: [], steps: [], source: 'rule', model: null };
  }
};
