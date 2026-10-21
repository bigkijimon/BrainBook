// Idea scoring (BrainBook 2026-10-21): the owner types a free-text idea into the Ideas page chat
// box and gets back a 0-100 score against five named criteria, one-sentence reasoning per
// criterion, real connections to existing vault items, and a staged roadmap (3-5 stages, 1-4
// concrete actions each). Mirrors capture.mjs's sortCapture() exactly: one Router request, strict
// JSON, a labeled keyword-free fallback on any failure (never invents a score silently as "model").
import { submitWorkerText } from './worker-router.mjs';

const clip = (value, max) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
const CRITERIA = ['originality', 'demand', 'feasibility', 'monetization', 'fit'];

export const analyzeIdea = async ({ text, candidates = [], cwd, routerSubmitPath, timeoutMs = 45000 }) => {
  const list = candidates.slice(0, 80);
  const prompt = [
    'Score ONE idea the owner just typed into a personal task system, 0-100. The owner writes Japanese or English; answer in the SAME language.',
    'Return ONLY valid JSON, no markdown fences. Do not modify files or run commands.',
    'Score five named criteria 0-20 each (they must sum to the overall score): "originality" (how differentiated vs. what already exists), "demand" (real evidence of people wanting this), "feasibility" (buildable by one person with today\'s tools), "monetization" (a believable path to revenue), "fit" (fits the owner\'s existing skills/products: English education, small SaaS tools, solo operation).',
    'Give one short reason sentence per criterion.',
    'Then find real connections ONLY among the EXISTING ITEMS below (same rule as capture sorting): ids only, never invent one.',
    'Then write a roadmap: 3 to 5 stages in order (e.g. Validate, Build MVP, Launch, Grow), each with 1 to 4 concrete actions a solo operator can start now. Keep every action short and plain.',
    'Shape: {"criteria":{"originality":{"score":0,"why":"..."},"demand":{...},"feasibility":{...},"monetization":{...},"fit":{...}},"reason":"one sentence overall","links":[{"id":"...","why":"..."}],"roadmap":[{"stage":"Validate","actions":["..."]}]}',
    '',
    `OWNER IDEA: ${clip(text, 1500)}`,
    '',
    'EXISTING ITEMS:',
    ...list.map((item) => `- id=${item.id} | ${item.kind} | ${clip(item.title, 110)}${item.summary ? ` | ${clip(item.summary, 140)}` : ''}`),
  ].join('\n');
  try {
    const answer = await submitWorkerText({ prompt: `Draft a short idea score in JSON.\n${prompt}`, purpose: 'idea-score', cwd, executable: routerSubmitPath, timeoutMs });
    const raw = answer.text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
    const parsed = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
    const criteria = {};
    let score = 0;
    for (const key of CRITERIA) {
      const entry = parsed.criteria?.[key] || {};
      const value = Math.max(0, Math.min(20, Math.round(Number(entry.score) || 0)));
      criteria[key] = { score: value, why: clip(entry.why, 200) };
      score += value;
    }
    const ids = new Map(list.map((item) => [item.id, item]));
    const links = (Array.isArray(parsed.links) ? parsed.links : [])
      .filter((link) => ids.has(link?.id)).slice(0, 6)
      .map((link) => ({ ...ids.get(link.id), why: clip(link.why, 240) }));
    const roadmap = (Array.isArray(parsed.roadmap) ? parsed.roadmap : []).slice(0, 5)
      .map((stage) => ({ stage: clip(stage?.stage, 60) || 'Stage', actions: (Array.isArray(stage?.actions) ? stage.actions : []).slice(0, 4).map((a) => clip(a, 200)).filter(Boolean) }))
      .filter((stage) => stage.actions.length);
    return { score, criteria, reason: clip(parsed.reason, 300), links, roadmap, source: 'model', model: answer.model, worker: answer.worker, routerTaskId: answer.taskId };
  } catch {
    return {
      score: null, criteria: null, reason: 'Could not score this idea (the Router result was unavailable). Try again in a moment.',
      links: [], roadmap: [], source: 'unavailable', model: null, worker: null, routerTaskId: null,
    };
  }
};
