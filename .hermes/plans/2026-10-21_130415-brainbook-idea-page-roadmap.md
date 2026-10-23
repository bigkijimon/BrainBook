# BrainBook: Idea page — AI scoring, roadmap UI, and a Trend Radar growth feature

## Goal
Turn BrainBook's "Ideas" page into a phone-first tool where Yuma types an idea into a chat box, gets it scored 0–100 with a visual roadmap of next actions, and periodically receives AI-researched trend-based idea suggestions — while keeping Agent Status and Deployed WebApps (already shipped) untouched.

## Current context / assumptions
- Repo: `/Users/yuma/Documents/Personal/task-system` (Electron app "BrainBook"; installed copy `/Applications/BrainBook.app`). Confirmed via `git log`/`git status` at plan time — working tree currently has unrelated uncommitted changes (`agent-feed.py`, `macos/ship.sh`, `server.mjs`, `src/TeamRail.tsx`, `src/VoiceInput.tsx`, `evidence/*`). **Before starting implementation, stash or commit those separately** (`brainbook-ops` skill, "preserve unrelated work") so this feature's diff stays clean.
- Server: `server.mjs` (Node, plain `http`, no framework), static frontend built with Vite + React 19 + TypeScript, from `src/*.tsx`. Backend "AI" calls go through `worker-router.mjs`'s `submitWorkerText()` → Router's free worker (same mechanism `capture.mjs` already uses for goal/task/idea classification — no new AI plumbing needed).
- Ideas today are plain Obsidian notes under `Vault/ideas/*.md`, created/edited via `ideas.mjs`'s `createIdeaStore()`. The "Ideas" page (`src/App.tsx` `IdeaShelf` function, ~line 886) is a **read-only browse/triage list** of existing vault notes — there is no chat-box capture, no score, no roadmap today. This plan adds those without removing the existing browse list (owner uses it daily for triage).
- `capture.mjs`'s `sortCapture()` is the existing, proven pattern for "send free-text to the Router, get back structured JSON, fall back to a keyword rule on failure" — the new scoring feature reuses this exact pattern (same `submitWorkerText` call shape, same JSON-fence-stripping, same try/catch fallback), not a new AI integration.
- Build/release is `./macos/ship.sh` only (not plain `npm run build`) — it builds, installs to `/Applications`, hash-verifies, restarts the launchd-managed backend (`com.bigkiji.brainbookserver`) and the GUI, and health-checks `:4183`. A source edit has zero effect on the real app until shipped.
- Test commands that exist today: `npx tsc --noEmit`, `npm run test:criteria` (`node --test tests/jev-decisions.test.mjs tests/worker-router.test.mjs tests/next-work.test.mjs tests/live-work.test.mjs`), `npm run build`. New `.mjs` test files are run the same way (`node --test tests/<name>.test.mjs`).
- Cron jobs in Hermes (`cronjob_manage`) run a fresh agent session with real tool access (web_search, web_extract, terminal) on a schedule — this is the mechanism for "research trends periodically", not a new scheduler inside BrainBook (owner rule: no duplicate schedulers).
- Assumption (stated, not confirmed with the owner — flagged again in Open questions): the "特徴で沢山DLを獲得する" request is about BrainBook's own differentiation/stickiness for Yuma's personal daily use, not a public app-store release. The plan implements a genuinely distinctive feature (AI Trend Radar proposing new, scored, sourced ideas on its own) but does not include app-store packaging, since BrainBook's current purpose and ownership docs describe it as the owner's personal tool.

## Architecture / proposed approach
Add one new backend module (`idea-score.mjs`, mirrors `capture.mjs`) that asks the Router's free worker to score free text 0–100 against five named criteria and produce a staged roadmap; extend `ideas.mjs` with one new writer (`createAnalyzed`) that persists the score + roadmap into the existing Markdown/frontmatter note format (so Obsidian, the existing XP/progress counter, and Dataview all keep working unmodified). On the frontend, add three small, focused components (`IdeaComposer`, `IdeaRoadmap`, `TrendRadar`) wired into the existing `ideas` page as tabs next to the current browse list, reusing existing CSS primitives (`shelf-switch` tabs, `dir-tree` rows, the conic-gradient "flowing light" active-state border, the `live-pulse-bar` meter) rather than inventing new visual language. The Trend Radar is powered by a new weekly Hermes cron job that does real web research and POSTs results into a new, clearly-separated vault subfolder (`ideas/trend-radar/`) through a new `/api/ideas/suggest` endpoint, kept visually and structurally distinct from the owner's own notes per the existing "only the owner's own ideas show raw" rule.

---

## Step-by-step tasks

### Phase 0 — Clean baseline and a short operating note (10–15 min)

**0.1** Snapshot unrelated WIP so it isn't swept into this feature's commits.
```bash
cd /Users/yuma/Documents/Personal/task-system
git status --short   # confirm the same 6 files as at plan time
git stash push -m "pre-idea-roadmap-wip" -- agent-feed.py macos/ship.sh server.mjs src/TeamRail.tsx src/VoiceInput.tsx
git status --short   # should now be clean except evidence/* (regenerated by smoke tests, leave it)
```
Verify: `git stash list` shows `pre-idea-roadmap-wip` at the top. Pop it back (`git stash pop`) only after this feature is committed, resolving any conflict in `server.mjs` by hand (both touch it).

**0.2** Write a short, current "how BrainBook works" note so the owner (and the next session) has one place describing the phone workflow, instead of re-deriving it from code. Create `~/Documents/ObsidianVault/Vault/Projects/BrainBook-operating-guide.md`:
```markdown
---
title: BrainBook operating guide
updated_at: "2026-10-21"
---
# BrainBook — how it works today

## On your phone
1. Open BrainBook's phone URL (paired via Settings → Phone). Bottom bar = departments/agents; the ☰ menu = page switch (Home / Ideas / Tasks / Goals / Office / Chat).
2. **Agents** (home page, "Active Agents"): live status of every agent/team, what they're working on, and a direct "Give … an instruction" button on any member that accepts direct instructions.
3. **Deployed apps**: the Managed Apps panel/rail shows every shipped product with its real public URL and icon.
4. **Ideas** (this update): three tabs —
   - **My ideas**: your own Obsidian notes, browsable/searchable, grouped by domain.
   - **New idea**: type a thought in the chat box → get a 0–100 score, the reasoning, and a staged roadmap of next actions → Save to keep it as a tracked idea note.
   - **Trend picks**: AI-researched suggestions from a weekly scan of real-world trends (clearly labeled, not your own notes) — Adopt turns one into a tracked idea of your own.

## Giving instructions
Any card/member with "Give an instruction" sends your text as a direct Hermes session to that agent/Top — same mechanism whether on the Mac or the phone.
```
Verify: `test -f ~/Documents/ObsidianVault/Vault/Projects/BrainBook-operating-guide.md && echo OK`.

**0.3** Confirm the Ideas page is actually reachable from the phone-width nav today (don't assume).
```bash
grep -n "PAGE_ROUTES" src/App.tsx
```
Expect `const PAGE_ROUTES = ['ideas', 'tasks', 'goals', 'office', 'chat'] as const;` — `ideas` is already a route. Load the installed app on a paired phone (or a 390×844 browser per the `brainbook-ops` skill's phone-pairing procedure) and tap into Ideas; screenshot it. If the rail/menu doesn't expose an "Ideas" entry, that is itself a bounded pre-existing nav bug — fix it first (one-line label/entry) before adding new tabs under it.

---

### Phase 1 — Backend: score + roadmap generation and storage

**1.1** Create `/Users/yuma/Documents/Personal/task-system/idea-score.mjs`:
```javascript
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
```
Note: on failure this returns `score: null` (never a guessed number) — the frontend must render "not scored yet, retry" rather than a fake 0.

**1.2** Add a TypeScript type declaration isn't needed (`idea-score.mjs` is imported only from `server.mjs`, another plain `.mjs`, so no `.d.mts` sibling is required — confirm by checking `tsconfig.json`'s `include`; if it includes `*.mjs` server files under `allowJs:false`, server.mjs itself must already be excluded from tsc's scope the same way `capture.mjs` is, so this follows the existing pattern with zero extra type work).

**1.3** Extend `/Users/yuma/Documents/Personal/task-system/ideas.mjs` — add a new exported writer next to `create` (same function, new sibling, does not touch `create`/`link`/`setDone`/`logStep`):
```javascript
  // Save a chat-box idea with its AI score + roadmap baked into the note (owner 2026-10-21).
  // origin: 'owner' (typed by the owner) or 'trend' (from the weekly Trend Radar scan — kept in a
  // separate folder, never mixed into the owner's own raw idea list).
  const createAnalyzed = async ({ text, area, analysis, origin = 'owner', sources = [] }) => {
    const clean = String(text || '').trim().slice(0, MAX_TEXT);
    if (!clean) throw Object.assign(new Error('Nothing to save'), { status: 400 });
    const dir = origin === 'trend' ? path.join(ideasPath, 'trend-radar') : ideasPath;
    await fs.mkdir(dir, { recursive: true });
    const id = newId();
    const relative = path.relative(vaultPath, path.join(dir, `${id}.md`));
    const stamp = new Date().toISOString();
    const title = titleOf(clean);
    const rest = clean.split(/\r?\n/).slice(1).join('\n').trim();
    const score = Number.isFinite(analysis?.score) ? analysis.score : null;
    const roadmapLines = (analysis?.roadmap || []).flatMap((stage) => [
      '', `### ${stage.stage}`, '',
      ...stage.actions.map((action) => `- [ ] ${action}`),
    ]);
    const criteriaLines = analysis?.criteria
      ? Object.entries(analysis.criteria).map(([key, value]) => `- **${key}** (${value.score}/20): ${value.why}`)
      : [];
    const lines = [
      '---', `id: ${yamlString(id)}`, 'status: "seed"', 'source: "brainbook"', 'privacy: local-draft',
      `origin: ${yamlString(origin)}`,
      ...(score !== null ? [`score: ${score}`, `score_source: ${yamlString(analysis.source)}`] : []),
      ...(area ? [`area: ${yamlString(area)}`] : []),
      `created_at: ${yamlString(stamp)}`, `updated_at: ${yamlString(stamp)}`, '---', '',
      `# ${title}`, '', '## Summary', '', rest || title, '',
      ...(analysis?.reason ? ['## Why this score', '', analysis.reason, '', ...criteriaLines, ''] : []),
      ...(roadmapLines.length ? ['## Roadmap', ...roadmapLines, ''] : []),
      ...(sources.length ? ['## Sources', '', ...sources.map((s) => `- [${s.title || s.url}](${s.url})`), ''] : []),
    ];
    await fs.writeFile(path.join(vaultPath, relative), lines.join('\n'), { encoding: 'utf8', flag: 'wx' });
    const created = { path: relative, title, score, origin };
    for (const linked of analysis?.links || []) { if (linked.path) { try { await link({ from: relative, to: linked.path }); } catch { /* keep the idea even if one link fails */ } } }
    return created;
  };
```
And change the final `return` line of `createIdeaStore` to also export it:
```javascript
  return { create, createAnalyzed, link, resolveNote, setDone, logStep };
```
Verify roadmap checkboxes are picked up by the existing progress reader with no change needed: `readIdeaProgress` in `server.mjs` (~line 1030) already counts every `- [ ]`/`- [x]` line regardless of which heading it's under, so `## Roadmap` checkboxes automatically feed the existing XP/progress-ring math.

**1.4** Add three endpoints in `server.mjs`, right after the existing `/api/ideas/link` block (~line 1516), reusing `captureCandidates()` (already defined for `/api/capture/sort`) and `analyzeIdea` (new import):
```javascript
import { analyzeIdea } from './idea-score.mjs';
```
```javascript
  // Chat-box idea scoring (owner 2026-10-21): analyze only, no save, so the owner can see the
  // score/roadmap before deciding to keep it.
  if (url.pathname === '/api/ideas/analyze' && req.method === 'POST') {
    const { text } = await readBody(req);
    if (!String(text || '').trim()) return json(res, { error: 'Write an idea first' }, 400);
    return json(res, await analyzeIdea({ text: String(text), candidates: await captureCandidates(), cwd: root, routerSubmitPath }));
  }
  // Save an analyzed idea as a tracked note.
  if (url.pathname === '/api/ideas/compose' && req.method === 'POST') {
    const { text, area, analysis } = await readBody(req);
    try {
      const normalizedArea = AREA_IDS.has(area) ? area : null;
      const created = await ideaStore.createAnalyzed({ text: String(text || ''), area: normalizedArea, analysis, origin: 'owner' });
      if (normalizedArea) await areaOverrides.set(created.path, normalizedArea);
      return json(res, { created }, 201);
    } catch (error) { return json(res, { error: error.message }, error.status || 500); }
  }
  // Trend Radar intake: a Hermes cron job POSTs here after real web research. Kept in a separate
  // vault subfolder (ideas/trend-radar/) and never mixed into the owner's own raw idea list.
  if (url.pathname === '/api/ideas/suggest' && req.method === 'POST') {
    const { text, analysis, sources } = await readBody(req);
    if (!String(text || '').trim()) return json(res, { error: 'Nothing to suggest' }, 400);
    try {
      const created = await ideaStore.createAnalyzed({ text: String(text), area: null, analysis, origin: 'trend', sources: Array.isArray(sources) ? sources : [] });
      return json(res, { created }, 201);
    } catch (error) { return json(res, { error: error.message }, error.status || 500); }
  }
  // List Trend Radar picks separately from the owner's own ideas.
  if (url.pathname === '/api/ideas/trends' && req.method === 'GET') {
    const dir = path.join(ideasPath, 'trend-radar');
    let files = [];
    try { files = await walkMarkdown(dir); } catch { files = []; }
    const picks = [];
    for (const absolute of files) {
      const relative = path.relative(vaultPath, absolute);
      let lines; try { lines = (await fs.readFile(absolute, 'utf8')).split(/\r?\n/); } catch { continue; }
      picks.push({
        path: relative, title: readNoteTitle(lines, relative), summary: readNoteSummary(lines),
        score: Number(readFrontmatterValue(lines, 'score')) || null,
        createdAt: readFrontmatterValue(lines, 'created_at'),
        adopted: Boolean(readFrontmatterValue(lines, 'adopted_at')),
      });
    }
    return json(res, { picks: picks.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')) });
  }
```
Also add `'trend-radar'` to the existing archive-style exclusion in `readVaultSnapshot` (~line 1055) so trend picks never leak into the normal Ideas browse list:
```javascript
const [projectFiles, ideaFiles] = await Promise.all([
  walkMarkdown(projectsPath),
  walkMarkdown(ideasPath).then((files) => files.filter((file) => {
    const rel = path.relative(ideasPath, file);
    return !rel.startsWith(`archive${path.sep}`) && !rel.startsWith(`trend-radar${path.sep}`);
  })),
]);
```
Verify: `node --check idea-score.mjs ideas.mjs server.mjs` (syntax only, fast); full behavior verified in Phase 4.

---

### Phase 2 — Frontend: chat-box composer + roadmap UI

**2.1** Create `/Users/yuma/Documents/Personal/task-system/src/IdeaRoadmap.tsx` (shared by the composer preview and the saved-idea popup):
```tsx
import { Check } from 'lucide-react';

export type RoadmapStage = { stage: string; actions: string[] };
export type IdeaScore = {
  score: number | null;
  criteria: Record<string, { score: number; why: string }> | null;
  reason: string;
  roadmap: RoadmapStage[];
};

const CRITERIA_LABEL: Record<string, string> = { originality: 'Originality', demand: 'Demand', feasibility: 'Feasibility', monetization: 'Monetization', fit: 'Fit' };

export function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="score-badge score-unknown">Not scored</span>;
  const tone = score >= 70 ? 'good' : score >= 40 ? 'mid' : 'low';
  return <span className={`score-badge tone-${tone}`}>{score}<small>/100</small></span>;
}

export function IdeaRoadmap({ analysis, doneActions = [], onToggle }: { analysis: IdeaScore; doneActions?: string[]; onToggle?: (stage: string, action: string) => void }) {
  return <div className="idea-roadmap">
    <div className="idea-roadmap-head"><ScoreBadge score={analysis.score} /><p className="idea-roadmap-reason">{analysis.reason}</p></div>
    {analysis.criteria && <div className="idea-criteria">
      {Object.entries(analysis.criteria).map(([key, value]) => <div className="idea-criterion" key={key}>
        <div className="idea-criterion-head"><span>{CRITERIA_LABEL[key] || key}</span><b>{value.score}/20</b></div>
        <div className="score-bar"><span style={{ width: `${(value.score / 20) * 100}%` }} /></div>
        <small>{value.why}</small>
      </div>)}
    </div>}
    <ol className="roadmap-stages">
      {analysis.roadmap.map((stage, index) => {
        const total = stage.actions.length;
        const done = stage.actions.filter((action) => doneActions.includes(`${stage.stage}:${action}`)).length;
        const active = done < total && (index === 0 || analysis.roadmap[index - 1].actions.every((a) => doneActions.includes(`${stage.stage}:${a}`)));
        return <li className={`roadmap-stage ${active ? 'active' : ''} ${done === total ? 'done' : ''}`} key={stage.stage}>
          <div className="roadmap-stage-head"><strong>{stage.stage}</strong><span>{done}/{total}</span></div>
          <ul>{stage.actions.map((action) => {
            const key = `${stage.stage}:${action}`;
            const isDone = doneActions.includes(key);
            return <li key={key}><button type="button" className={`roadmap-action ${isDone ? 'done' : ''}`} onClick={() => onToggle?.(stage.stage, action)}><span className="roadmap-check">{isDone && <Check size={12} strokeWidth={2} />}</span>{action}</button></li>;
          })}</ul>
        </li>;
      })}
    </ol>
  </div>;
}
```

**2.2** Create `/Users/yuma/Documents/Personal/task-system/src/IdeaComposer.tsx`:
```tsx
import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { IdeaRoadmap, IdeaScore } from './IdeaRoadmap';
import type { LifeArea } from './types';

export function IdeaComposer({ area, onSaved }: { area: LifeArea | 'all'; onSaved: () => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [analysis, setAnalysis] = useState<IdeaScore | null>(null);
  const [saved, setSaved] = useState(false);

  const analyze = async () => {
    if (!text.trim() || busy) return;
    setBusy(true); setSaved(false);
    try {
      const response = await fetch('/api/ideas/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
      setAnalysis(await response.json());
    } finally { setBusy(false); }
  };

  const save = async () => {
    if (!analysis || busy) return;
    setBusy(true);
    try {
      const response = await fetch('/api/ideas/compose', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, area: area === 'all' ? null : area, analysis }) });
      if (response.ok) { setSaved(true); setText(''); setAnalysis(null); onSaved(); }
    } finally { setBusy(false); }
  };

  return <section className="idea-composer" aria-label="New idea">
    <label className="idea-composer-box">
      <textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="Type an idea… (Japanese or English)" rows={3} aria-label="New idea text" />
      <button type="button" className="submit-button" disabled={!text.trim() || busy} onClick={analyze}><Sparkles size={15} strokeWidth={1.8} />{busy ? 'Scoring…' : 'Score this idea'}</button>
    </label>
    {analysis && <>
      <IdeaRoadmap analysis={analysis} />
      {analysis.score !== null && <button type="button" className="submit-button idea-save" disabled={busy} onClick={save}>Save as tracked idea</button>}
    </>}
    {saved && <p className="idea-empty">Saved — see it under "My ideas".</p>}
  </section>;
}
```
(`LifeArea` type already exists in `src/types.ts`; confirm the exact export name with `grep -n "LifeArea" src/types.ts` before importing.)

**2.3** Create `/Users/yuma/Documents/Personal/task-system/src/TrendRadar.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { ScoreBadge } from './IdeaRoadmap';

type Pick = { path: string; title: string; summary: string; score: number | null; createdAt: string; adopted: boolean };

export function TrendRadar() {
  const [picks, setPicks] = useState<Pick[]>([]);
  const [loading, setLoading] = useState(true);
  const load = () => fetch('/api/ideas/trends').then((r) => r.json()).then((data) => setPicks(data.picks || [])).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);
  if (loading) return <p className="idea-empty">Loading…</p>;
  if (!picks.length) return <p className="idea-empty">No trend picks yet — the weekly scan runs every Monday.</p>;
  return <ul className="dir-tree idea-dir trend-radar-list">
    {picks.map((pick) => <li className="dir-node" key={pick.path}>
      <div className="dir-line idea-file">
        <span className="trend-tag">AI PICK</span>
        <span className="idea-row-main"><strong>{pick.title}</strong><small>{pick.summary}</small></span>
        <ScoreBadge score={pick.score} />
      </div>
    </li>)}
  </ul>;
}
```
(V1 keeps Trend Radar read-only — "Adopt" is a fast-follow once the list itself is verified live; note this in the delivered report as a named, deliberate scope cut, not a silent omission.)

**2.4** Wire tabs into `src/App.tsx`'s existing `page === 'ideas'` block (~line 835). Replace:
```tsx
          {page === 'ideas' && <><IdeaShelf streams={streams} notes={areaNotes} loading={vaultLoading} onSend={sendToHermes} onArea={moveNoteToArea} onKind={setNoteKind} />
```
with:
```tsx
          {page === 'ideas' && <><div className="idea-chips shelf-switch" role="tablist" aria-label="Ideas views">
            <button type="button" role="tab" aria-selected={ideaTab === 'mine'} className={ideaTab === 'mine' ? 'on' : ''} onClick={() => setIdeaTab('mine')}>My ideas</button>
            <button type="button" role="tab" aria-selected={ideaTab === 'new'} className={ideaTab === 'new' ? 'on' : ''} onClick={() => setIdeaTab('new')}>New idea</button>
            <button type="button" role="tab" aria-selected={ideaTab === 'trends'} className={ideaTab === 'trends' ? 'on' : ''} onClick={() => setIdeaTab('trends')}>Trend picks</button>
          </div>
          {ideaTab === 'mine' && <IdeaShelf streams={streams} notes={areaNotes} loading={vaultLoading} onSend={sendToHermes} onArea={moveNoteToArea} onKind={setNoteKind} />}
          {ideaTab === 'new' && <IdeaComposer area={area} onSaved={() => { setIdeaTab('mine'); refreshVault(); }} />}
          {ideaTab === 'trends' && <TrendRadar />}
```
Add state near the other `useState` declarations (~line 198, beside `page`): `const [ideaTab, setIdeaTab] = useState<'mine' | 'new' | 'trends'>('mine');` and the two new imports at the top of the file: `import { IdeaComposer } from './IdeaComposer'; import { TrendRadar } from './TrendRadar';`. Confirm the exact name of the existing vault-refresh function (likely `refreshVault` or similar — `grep -n "vaultNotes" src/App.tsx | head` to find the real setter/loader before wiring `onSaved`) and use that real name instead of guessing.

**2.5** CSS — add to `src/neon-navigation.css` (later-cascade file; per the `brainbook-ops` skill, new decorative/interactive rules belong here, not `styles.css`), reusing the existing conic-gradient flowing border (`run-rotate`) for the active roadmap stage and the existing `live-pulse-bar` meter shape for score bars:
```css
.idea-composer-box{display:flex;flex-direction:column;gap:10px}
.idea-composer-box textarea{width:100%;resize:vertical;min-height:72px;background:var(--panel-bg,#1a0f22);color:inherit;border:1px solid var(--theme-lilac);border-radius:10px;padding:10px 12px;font:inherit}
.score-badge{display:inline-flex;align-items:baseline;gap:2px;font-weight:700;padding:4px 10px;border-radius:999px;background:var(--theme-lavender)}
.score-badge.tone-good{background:#2fae6a}
.score-badge.tone-mid{background:#d9a23b}
.score-badge.tone-low{background:#c0485a}
.score-badge.score-unknown{background:transparent;border:1px dashed var(--theme-lilac);color:var(--theme-lilac)}
.score-bar{height:6px;border-radius:999px;background:rgba(255,255,255,.12);overflow:hidden}
.score-bar span{display:block;height:100%;background:linear-gradient(90deg,var(--theme-pink),var(--theme-coral))}
.roadmap-stages{display:flex;flex-direction:column;gap:12px;list-style:none;margin:0;padding:0}
.roadmap-stage{border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:10px 12px;position:relative}
.roadmap-stage.active{position:relative;border-color:transparent}
.roadmap-stage.active::before{content:"";position:absolute;inset:-1px;padding:1.5px;border-radius:12px;background:conic-gradient(from var(--run-angle,0deg),var(--theme-pink),var(--theme-lavender),var(--theme-lilac),var(--theme-coral),var(--theme-pink));-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;animation:run-rotate 3s linear infinite}
.roadmap-stage.done{opacity:.55}
.roadmap-action{display:flex;align-items:center;gap:8px;background:none;border:none;color:inherit;text-align:left;padding:4px 0;width:100%}
.roadmap-check{width:16px;height:16px;border-radius:4px;border:1px solid var(--theme-lilac);display:flex;align-items:center;justify-content:center}
.roadmap-action.done .roadmap-check{background:var(--theme-pink);border-color:var(--theme-pink)}
.trend-tag{font-size:.65rem;font-weight:700;letter-spacing:.04em;padding:2px 6px;border-radius:6px;background:var(--theme-lavender);margin-right:6px}
@media (prefers-reduced-motion: reduce){.roadmap-stage.active::before{animation:none}}
```
Verify the referenced custom properties (`--theme-pink`, `--theme-lavender`, `--theme-lilac`, `--theme-coral`, `--run-angle`, `@keyframes run-rotate`) already exist: `grep -n "run-rotate\|--theme-pink" src/*.css` — they are the documented existing shared pattern, so this must find hits; if any name differs, use the real token name instead of guessing.

---

### Phase 3 — Trend Radar: weekly research cron job

**3.1** Create the cron job via `cronjob_manage` (action=`create`). Concrete call shape (fill in after confirming BrainBook's actual LAN/Tailscale-safe loopback address is `127.0.0.1:4183` per `000_WHERE.md`):
- `name`: `"BrainBook Trend Radar"`
- `schedule`: `"every monday 9am"`
- `enabled_toolsets`: `["web", "terminal"]`
- `continuity`: `true` (so each run knows which domains/ideas it already proposed and does not repeat them)
- `deliver`: `"telegram"` (short ping to the owner when new picks land, per the standing "anything to show the owner must reach Telegram" rule)
- `prompt`:
```
You are BrainBook's weekly Trend Radar. Research real, current trends across a BROAD set of
genres (rotate across runs using what you proposed before, from continuity context — e.g. one run
covers consumer apps/AI tools, another covers education/edtech, another covers content/creator
economy, another covers small-SaaS/indie-hacker niches). Use web_search and web_extract to find
real, dated sources (not your own prior knowledge) — cite at least one real URL per idea.

Then propose 2 to 3 CONCRETE, REALISTIC product/content ideas that fit a solo operator who already
runs an online English-conversation school (UPCLASS) and a personal AI-agent tooling stack
(BrainBook). Favor ideas buildable by one person with AI-assisted development in weeks, not ideas
needing a team, large capital, or a regulated license.

For each idea, score it 0-100 using five criteria (0-20 each): originality, demand (cite the
source showing real demand), feasibility for a solo operator, monetization path, fit to the
owner's existing skills. Write a 3-5 stage roadmap (Validate, Build MVP, Launch, Grow — or similar),
each stage with 1-4 concrete actions.

For each idea, POST it to BrainBook with:
curl -s -X POST -H 'Host: 127.0.0.1:4183' -H 'Content-Type: application/json' \
  --data '{"text":"<idea title and one-paragraph pitch>","analysis":{"score":<int>,"criteria":{"originality":{"score":<int>,"why":"<...>"},"demand":{...},"feasibility":{...},"monetization":{...},"fit":{...}},"reason":"<one sentence>","roadmap":[{"stage":"Validate","actions":["..."]}]},"sources":[{"title":"<source title>","url":"<real url>"}]}' \
  http://127.0.0.1:4183/api/ideas/suggest

Before posting, check http://127.0.0.1:4183/api/ideas/trends with curl — if BrainBook's server is
not reachable (connection refused), stop and report that as the one blocker; do not fabricate a
result or invent a URL. Your final response: how many ideas you posted, their titles and scores,
and the real source URLs you cited.
```
Verify after creation: `cronjob_manage(action='list')` shows the job; `cronjob_manage(action='run', job_id=<id>)` to fire it once immediately and confirm (after it completes) `curl -s -H 'Host: 127.0.0.1:4183' http://127.0.0.1:4183/api/ideas/trends | python3 -m json.tool` shows real new entries with non-null scores and real source URLs (open at least one URL to confirm it is real, not hallucinated).

**3.2** Note in the delivered report that this job spends tokens on the owner's configured main model weekly — acceptable per the owner's stated preference for a Router free-first worker is NOT available here (cron jobs run on the main agent model, not through Router's free-worker lane) — flag this explicitly rather than silently incurring a different cost path than the rest of the app.

---

### Phase 4 — Verify, ship, and report

**4.1** Isolated dev-server pass before touching the installed app (per `brainbook-ops`):
```bash
cd /Users/yuma/Documents/Personal/task-system
npx tsc --noEmit
```
Expected: no new errors versus the pre-change baseline (run `npx tsc --noEmit` once BEFORE Phase 1-2 edits too, and diff the error count/lines — a pre-existing unrelated error must not be blamed on this change).

```bash
BRAINBOOK_NO_AUTOPILOT=1 BRAINBOOK_HOME=/tmp/brainbook-idea-test BRAINBOOK_DATA_FILE=/tmp/brainbook-idea-test/tasks.json PORT=4199 node server.mjs &
sleep 2
curl -s -X POST -H 'Content-Type: application/json' --data '{"text":"週末だけ運営できる、英語学習者向けの短尺AIパーソナルコーチアプリ"}' http://127.0.0.1:4199/api/ideas/analyze | python3 -m json.tool
```
Expected: JSON with `score` (0–100 or `null` with `source:"unavailable"` if no Router is configured in this throwaway env — both are valid, acceptable outcomes to confirm the endpoint and fallback path work), `criteria`, `roadmap`. Then:
```bash
curl -s -X POST -H 'Content-Type: application/json' --data '{"text":"test idea","area":null,"analysis":{"score":55,"criteria":{"originality":{"score":10,"why":"x"}},"reason":"x","roadmap":[{"stage":"Validate","actions":["talk to 5 users"]}]}}' http://127.0.0.1:4199/api/ideas/compose
ls /tmp/brainbook-idea-test/ideas/   # confirm a new .md file exists with score/roadmap frontmatter
kill %1
```

**4.2** `npm run test:criteria` — confirm it still passes (it exercises `worker-router.mjs`/`sortCapture`, which this change does not touch, so it must pass identically to before).

**4.3** Add `tests/idea-score.test.mjs` (mirrors `tests/worker-router.test.mjs`'s existing `fixture()` helper — reuse it, do not redefine it; import it the same way that file does, or import the shared fixture utility it uses if factored out — check `tests/worker-router.test.mjs`'s top imports first):
```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeIdea } from '../idea-score.mjs';
import { fixture } from './fixture-helper.mjs'; // use whatever the real shared helper import path is — grep tests/*.test.mjs for "fixture(" first

test('idea scoring returns a model-sourced score and roadmap on a well-formed Router reply', async () => {
  const { dir, executable } = await fixture(`let input='';process.stdin.on('data',c=>input+=c);process.stdin.on('end',()=>{const p=JSON.parse(input);console.log(JSON.stringify({status:'completed',summary:JSON.stringify({criteria:{originality:{score:15,why:'novel angle'},demand:{score:12,why:'seen on forums'},feasibility:{score:16,why:'solo buildable'},monetization:{score:10,why:'subscription'},fit:{score:14,why:'matches education background'}},reason:'Strong fit, moderate demand evidence',links:[],roadmap:[{stage:'Validate',actions:['Interview 5 target users']}]}),task_id:p.task_id,worker:'free-worker',model:'free-model',worker_cost_policy:{mode:'free_only',paid_worker_execution:false}}));});`);
  try {
    const result = await analyzeIdea({ text: 'a short-form AI coach for English learners', candidates: [], cwd: dir, routerSubmitPath: executable });
    assert.equal(result.source, 'model');
    assert.equal(result.score, 15 + 12 + 16 + 10 + 14);
    assert.equal(result.roadmap[0].stage, 'Validate');
  } finally { await (await import('node:fs/promises')).rm(dir, { recursive: true, force: true }); }
});

test('idea scoring falls back to an explicit "unavailable" result, never a fabricated score, when the Router fails', async () => {
  const result = await analyzeIdea({ text: 'anything', candidates: [], cwd: process.cwd(), routerSubmitPath: '/nonexistent/binary' });
  assert.equal(result.score, null);
  assert.equal(result.source, 'unavailable');
});
```
Run: `node --test tests/idea-score.test.mjs` — expect 2 passing.

**4.4** Browser smoke test (per `brainbook-ops`'s "Browser smoke testing" reference) against the isolated dev server from 4.1: load `/#ideas`, screenshot the three tabs, type a test idea in "New idea", click "Score this idea", screenshot the resulting score/roadmap render, confirm no console errors.

**4.5** Ship: `./macos/ship.sh`. Then the mandatory post-ship check from `brainbook-ops` (stale-process check is NOT optional):
```bash
lsof -nP -iTCP:4183 -sTCP:LISTEN
ps -p <pid-from-above> -o lstart=,command=
```
Confirm the bound PID's start time is AFTER the `ship.sh` run, not before. If stale, `kill -9 <pid>` and relaunch (`open -a /Applications/BrainBook.app`), then recheck.

**4.6** Real-device verification: pair a throwaway phone device per `brainbook-ops`'s remote-pairing procedure (`POST /api/remote/pair`, claim via Tailscale, drive at 390×844, then `DELETE /api/remote/devices/<id>` when done — never touch the owner's real paired phone for a test). Screenshot the Ideas page's three tabs rendering on that viewport, and one roundtrip of typing → scoring → saving.

**4.7** Fire the Trend Radar cron job once (`cronjob_manage(action='run', ...)`), wait for its background completion, then verify `/api/ideas/trends` as described in 3.1. Screenshot the "Trend picks" tab showing the real result.

**4.8** Commit (small, reviewable commits — do not squash the whole feature into one commit): e.g. `idea-score.mjs` + its test; `ideas.mjs createAnalyzed`; `server.mjs` endpoints; frontend components; CSS; cron job creation note. Then `git stash pop` the Phase-0 stash and resolve the `server.mjs` conflict by hand (keep both sets of changes).

**4.9** Deliver one Telegram report (per standing format): what changed (Idea page now has 3 tabs: browse / score+roadmap / trend picks), what was verified (isolated dev-server roundtrip, `test:criteria` pass, new `idea-score.test.mjs` pass, real installed-app screenshot on a paired phone viewport, one live Trend Radar run with real cited sources), the cron job id and its weekly schedule, and the one open business question from below.

---

## Risks, tradeoffs, and open questions

- **Scoring is an LLM opinion, not a market fact.** The UI must say so in copy ("AIによる推定スコア", not "あなたのアイデアは73点です" as if authoritative) to avoid the owner (or future readers) over-trusting an unverified number — consistent with the owner's standing dislike of unverified claims presented as fact.
- **Trend Radar runs on the main (potentially paid) agent model weekly**, not the Router's free lane — flagged above (3.2); if the owner wants it free-first too, that needs a follow-up to route the cron job's reasoning through Router instead of the default cron executor, which is a separate, larger change (cron jobs don't currently support "run through Router" as a first-class option) — out of scope for this plan unless requested.
- **Open business question (owner decision, not blocking this plan):** "a special feature to earn a lot of downloads" reads as if BrainBook might become a distributed/public product rather than staying Yuma's personal tool. This plan's recommended default is to treat the Trend Radar as BrainBook's standout *personal* feature (distinctive daily value, not a public acquisition funnel) because every canonical doc describes BrainBook as the owner's own tool. If the owner actually means public distribution, that changes scope substantially (app-store packaging, multi-tenant data separation, pricing) and should be raised once, with this default, rather than guessed into the implementation.
- **Roadmap "active stage" logic** (`IdeaRoadmap.tsx`'s `active` calc) assumes stages are strictly sequential; if the model ever returns overlapping/parallel stages this under- or over-highlights — acceptable for v1, revisit only if observed in real use.
- **Trend Radar "Adopt" button is deliberately deferred** (2.3) to keep this plan's scope bounded and verifiable in one pass; implement it as a fast-follow (reuses `createAnalyzed` with `origin:'owner'` and the trend note's existing `analysis` fields) once the read-only list is proven live.
- A `git stash` is used instead of committing the pre-existing unrelated WIP, per the `brainbook-ops` skill's explicit guidance to preserve unrelated work without attributing it to this feature's commits; the stash pop in 4.8 is a manual, watched step, not automated, because it may conflict.
