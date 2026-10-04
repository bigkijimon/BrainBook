// InvestPro > EVOLUTION tab (owner 2026-10-04). Read-only view of VIT's Evolution Arena:
// strategy genomes evolve beneath the existing operating team; they are not new crew members.
// Data: GET /api/investment/evolution (investment-evolution.mjs). Nothing here is a sample:
// an absent, corrupt, stale or unsupported snapshot says so, and a fixture snapshot is
// labelled as synthetic. Missing metrics render as "—", never as 0.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, CircleSlash, Clock, GitBranch, Minus, Trophy, X } from 'lucide-react';
import './investpro-evolution.css';

type Gate = { name: string; status: string; detail: string };
type Windowed = { name: string; role: string; start: string; end: string; n_bars: number };
type ProfitFactor = { state: 'finite' | 'unbounded' | 'undefined'; value: number | null } | null;
type Candidate = {
  candidate_id: string; genome_id: string; birth_generation: number; parent_ids: string[];
  reproduction_kind: 'founder' | 'clone' | 'mutation' | 'crossover';
  status: 'qualified' | 'unqualified' | 'pending' | 'not_evaluated'; stage: string; eligibility: 'eligible' | 'retired';
  survivor: boolean; retired: boolean; fitness: number | null; fitness_components: Record<string, number | null> | null;
  metrics: { net_return: number | null; max_drawdown: number | null; sharpe: number | null; profit_factor: ProfitFactor; n_trades: number | null };
  evidence_complete: boolean; selection_reason: string | null; gates: Gate[]; windows: Windowed[]; niches: string[];
  mutation_diff: Record<string, unknown> | null; model_used: string | null; requested_capability: string;
  genome: {
    family_weights: Record<string, number | null>; reasoning_weights: Record<string, number | null>; timeframe: string; pairs: string[]; features: string[];
    memory_windows: number[]; risk_per_trade: number; position_limit: number; atr_stop: number; atr_target: number; prompt_version: string;
    memory_policy_version: string; requested_capability: string; content_hash: string; seed: number | null; generator_version: string | null; schema_version: number;
  };
};
type ArchiveEntry = {
  niche: string; candidate_id: string; genome_hash: string;
  origin: { run_id: string; generation: number; manifest_digest: string; stage: string; fitness: number; data_source: string };
  last_reeval: { status: string; fitness: number | null; manifest_digest: string | null; generation: number | null };
};
type Snapshot = {
  data_source: 'fixture' | 'historical' | 'mixed' | null; generated_at: string | null;
  run: { status: 'no_run' | 'idle' | 'active' | 'halted'; run_id: string | null; as_of: string | null; stage: string | null; seed: number | null; policy_version: string | null;
    halted_reason: string | null; model_receipt: { actual_provider_model: string | null; paid_inference: boolean } | null;
    champion: { candidate_id: string; fitness: number; stage: string } | null;
    manifest: { dataset_digest: string; bar_frequency: string; timezone: string; information_cutoff: string; benchmark: string; simulation_version: string; regimes: string[]; data_source: string; windows: Windowed[] } | null };
  counts: Record<string, number | null>;
  candidates: Candidate[]; archive: ArchiveEntry[];
  lineage: { nodes: { id: string; generation: number; kind: string; status: string; retired: boolean }[]; edges: { from: string; to: string }[] };
  trial_ledger: { independent_trials: number; total_evaluations: number };
  holdout: { key: string; reads: number; reused: boolean }[];
};
type Response = { state: 'ok' | 'stale' | 'absent' | 'corrupt' | 'unsupported'; reason?: string; ageSeconds?: number; checkedAt: string; snapshot?: Snapshot };
type Load = { kind: 'loading' } | { kind: 'failed'; message: string } | { kind: 'done'; response: Response };

const REGIME_NICHES = ['trend', 'range', 'high_vol', 'low_vol'];
const REFRESH_MS = 30_000;
const dash = '—';
const pct = (v: number | null | undefined, digits = 2) => (v == null ? dash : `${(v * 100).toFixed(digits)}%`);
const fix = (v: number | null | undefined, digits = 3) => (v == null ? dash : v.toFixed(digits));
const when = (iso: string | null | undefined) => { if (!iso) return dash; const d = new Date(iso); return Number.isNaN(d.getTime()) ? dash : d.toLocaleString(); };
const age = (seconds: number | undefined) => {
  if (seconds == null) return dash;
  if (seconds < 90) return `${seconds}s`;
  if (seconds < 5400) return `${Math.round(seconds / 60)} min`;
  if (seconds < 172800) return `${Math.round(seconds / 3600)} h`;
  return `${Math.round(seconds / 86400)} days`;
};
const profit = (pf: ProfitFactor) => (!pf ? dash : pf.state === 'finite' ? fix(pf.value, 2) : pf.state === 'unbounded' ? '∞ (no losses)' : 'n/a');
const label = (text: string) => text.replace(/_/g, ' ');

function Status({ c }: { c: Candidate }) {
  // Words and shapes carry the meaning; colour only reinforces it.
  const [Icon, text] = c.retired ? [X, 'Retired'] : c.survivor ? [Check, 'Survivor'] : c.status === 'pending' ? [Clock, 'Pending evidence']
    : c.status === 'unqualified' ? [CircleSlash, 'Failed gate'] : c.status === 'not_evaluated' ? [Minus, 'Awaiting evaluation'] : [Check, 'Qualified'];
  return <span className={`evo-status evo-status--${c.retired ? 'retired' : c.survivor ? 'survivor' : c.status}`}><Icon size={12} strokeWidth={2.2} aria-hidden />{text}</span>;
}

export default function InvestProEvolution() {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [selected, setSelected] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  const refresh = useCallback(async () => {
    controller.current?.abort();                                 // a newer request replaces a stale one
    const mine = new AbortController();
    controller.current = mine;
    try {
      const response = await fetch('/api/investment/evolution', { cache: 'no-store', signal: mine.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = (await response.json()) as Response;
      if (!mine.signal.aborted) setLoad({ kind: 'done', response: body });
    } catch (error) {
      if (mine.signal.aborted) return;
      setLoad((before) => (before.kind === 'done' ? before : { kind: 'failed', message: error instanceof Error ? error.message : String(error) }));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, REFRESH_MS);
    return () => { window.clearInterval(timer); controller.current?.abort(); };
  }, [refresh]);

  const response = load.kind === 'done' ? load.response : null;
  const snapshot = response?.snapshot;
  const byId = useMemo(() => new Map((snapshot?.candidates ?? []).map((c) => [c.candidate_id, c])), [snapshot]);
  const chosen = selected ? byId.get(selected) ?? null : null;     // selection survives refresh while the id still exists
  const select = (id: string, from?: HTMLElement | null) => { if (from) returnFocus.current = from; setSelected(id); };
  const closeDetail = () => { setSelected(null); window.setTimeout(() => returnFocus.current?.focus(), 0); };

  return <div className="evo" aria-live="polite" aria-busy={load.kind === 'loading'}>
    {load.kind === 'loading' && <p className="evo-note" role="status">Loading the arena…</p>}
    {load.kind === 'failed' && <div className="evo-alert evo-alert--error" role="alert"><AlertTriangle size={16} aria-hidden /><div><strong>Cannot reach BrainBook's evolution endpoint.</strong><span>{load.message}. Nothing is shown rather than something invented.</span></div><button type="button" onClick={() => void refresh()}>Retry</button></div>}
    {response && !snapshot && <Unavailable response={response} onRetry={() => void refresh()} />}
    {response && snapshot && <>
      <RunHeader response={response} snapshot={snapshot} />
      {snapshot.run.status === 'no_run'
        ? <EmptyRun />
        : <>
          <Totals snapshot={snapshot} onChampion={(id) => select(id)} />
          <Leaderboard candidates={snapshot.candidates} selected={selected} onSelect={select} showAll={showAll} onShowAll={setShowAll} />
          {chosen && <Detail key={chosen.candidate_id} c={chosen} byId={byId} onSelect={select} onClose={closeDetail} />}
          <HallOfFame archive={snapshot.archive} onSelect={select} byId={byId} />
          <Lineage snapshot={snapshot} selected={selected} onSelect={select} />
        </>}
    </>}
  </div>;
}

function Unavailable({ response, onRetry }: { response: Response; onRetry: () => void }) {
  const copy = {
    absent: ['No evolution run yet', 'The engine has not written a snapshot. Nothing here is a result; no profit is shown.'],
    corrupt: ['The snapshot cannot be trusted', response.reason || 'It failed validation.'],
    unsupported: ['This snapshot is from a newer engine', response.reason || 'BrainBook does not know its schema.'],
    ok: ['', ''], stale: ['', ''],
  }[response.state];
  const isError = response.state !== 'absent';
  return <div className={`evo-alert ${isError ? 'evo-alert--error' : 'evo-alert--empty'}`} role={isError ? 'alert' : 'status'}>
    {isError ? <AlertTriangle size={16} aria-hidden /> : <GitBranch size={16} aria-hidden />}
    <div><strong>{copy[0]}</strong><span>{copy[1]}</span></div><button type="button" onClick={onRetry}>Check again</button>
  </div>;
}

function RunHeader({ response, snapshot }: { response: Response; snapshot: Snapshot }) {
  const { run } = snapshot;
  const stale = response.state === 'stale';
  return <div className="evo-head">
    {snapshot.data_source === 'fixture' && <div className="evo-alert evo-alert--fixture" role="note"><AlertTriangle size={16} aria-hidden /><div><strong>FIXTURE DATA</strong><span>Synthetic returns made to test this screen. Not market performance, not paper results, not live evidence.</span></div></div>}
    {snapshot.data_source === 'mixed' && <div className="evo-alert evo-alert--fixture" role="note"><AlertTriangle size={16} aria-hidden /><div><strong>MIXED DATA</strong><span>Some evaluations come from fixtures; check each candidate's window before reading a score.</span></div></div>}
    {stale && <div className="evo-alert evo-alert--stale" role="status"><Clock size={16} aria-hidden /><div><strong>Stale snapshot</strong><span>Last updated {age(response.ageSeconds)} ago. The values below may no longer match the engine.</span></div></div>}
    <dl className="evo-run">
      <div><dt>Stage</dt><dd>{run.stage ? label(run.stage) : dash}</dd></div>
      <div><dt>Run</dt><dd data-state={run.status}>{run.status === 'halted' ? 'Halted' : run.status === 'active' ? 'Active' : run.status === 'idle' ? 'Started, no generation yet' : 'No run'}</dd></div>
      <div><dt>As of</dt><dd>{when(run.as_of)}</dd></div>
      <div><dt>Freshness</dt><dd>{response.state === 'stale' ? `Stale · ${age(response.ageSeconds)} old` : `Fresh · ${age(response.ageSeconds)} old`}</dd></div>
      <div><dt>Market data</dt><dd>{run.manifest ? `${run.manifest.bar_frequency} bars · ${run.manifest.data_source}` : dash}</dd></div>
      <div><dt>Model used</dt><dd>{run.model_receipt?.actual_provider_model || 'None recorded · no model call'}</dd></div>
    </dl>
    {run.halted_reason && <div className="evo-alert evo-alert--error" role="alert"><AlertTriangle size={16} aria-hidden /><div><strong>Generation halted</strong><span>{run.halted_reason}</span></div></div>}
  </div>;
}

function EmptyRun() {
  return <div className="evo-alert evo-alert--empty" role="status"><GitBranch size={16} aria-hidden /><div><strong>The arena exists, but no run has started</strong><span>Zero candidates and zero generations. Run creation belongs to the engine's bounded command; this view only reads.</span></div></div>;
}

function Totals({ snapshot, onChampion }: { snapshot: Snapshot; onChampion: (id: string) => void }) {
  const c = snapshot.counts;
  const cells: [string, string | number, string?][] = [
    ['Generation', c.generation == null ? dash : c.generation, 'arena\'s current'],
    ['Evaluated', c.evaluated ?? 0, `of ${c.population_size ?? 0}`], ['Qualified', c.qualified ?? 0], ['Failed gates', c.unqualified ?? 0], ['Pending evidence', c.pending_evidence ?? 0],
    ['Next gen waiting', c.pending_population ?? 0], ['Survivors', c.survivors ?? 0], ['Retired', c.retired ?? 0],
    ['Mutations', c.mutations ?? 0], ['Crossovers', c.crossovers ?? 0], ['Clones', c.clones ?? 0],
    ['Independent trials', snapshot.trial_ledger.independent_trials, `${snapshot.trial_ledger.total_evaluations} evaluations`],
  ];
  const champ = snapshot.run.champion;
  return <section className="evo-section" aria-label="Population totals">
    <ul className="evo-totals">{cells.map(([name, value, note]) => <li key={name}><b>{value}</b><span>{name}</span>{note && <small>{note}</small>}</li>)}</ul>
    <p className="evo-champ">{champ
      ? <><Trophy size={14} aria-hidden /> Eligible champion: <button type="button" className="evo-link" onClick={() => onChampion(champ.candidate_id)}>{champ.candidate_id}</button> · fitness {fix(champ.fitness)} · stage {label(champ.stage)}. <em>Research ranking only; not a trading signal.</em></>
      : <><Trophy size={14} aria-hidden /> No eligible champion: nothing has passed every gate yet.</>}</p>
  </section>;
}

function Leaderboard({ candidates, selected, onSelect, showAll, onShowAll }: { candidates: Candidate[]; selected: string | null; onSelect: (id: string, from?: HTMLElement | null) => void; showAll: boolean; onShowAll: (v: boolean) => void }) {
  const rank = (c: Candidate) => (c.status === 'qualified' ? 0 : c.status === 'pending' ? 1 : c.status === 'unqualified' ? 2 : 3);
  const rows = useMemo(() => [...candidates].filter((c) => c.status !== 'not_evaluated').sort((a, b) => rank(a) - rank(b) || (b.fitness ?? -1) - (a.fitness ?? -1) || a.candidate_id.localeCompare(b.candidate_id)), [candidates]);
  const shown = showAll ? rows : rows.slice(0, 20);
  return <section className="evo-section" aria-labelledby="evo-lb">
    <h4 id="evo-lb">Leaderboard <small>{rows.length} evaluated · fitness is shown only after every gate passes</small></h4>
    {rows.length === 0 ? <p className="evo-note">No evaluated candidates yet.</p> : <div className="evo-scroll" tabIndex={0} role="region" aria-label="Leaderboard, scrolls sideways">
      <table className="evo-table">
        <thead><tr><th>#</th><th>Candidate</th><th>Fitness</th><th>Net return</th><th>Max DD</th><th>Sharpe</th><th>Profit factor</th><th>Trades</th><th>Stage</th><th>Evidence</th><th>Selection</th></tr></thead>
        <tbody>{shown.map((c, i) => <tr key={c.candidate_id} className={selected === c.candidate_id ? 'is-selected' : ''}>
          <td>{i + 1}</td>
          <th scope="row"><button type="button" className="evo-id" aria-pressed={selected === c.candidate_id} onClick={(event) => onSelect(c.candidate_id, event.currentTarget)}>{c.candidate_id}</button><Status c={c} /></th>
          <td className="num">{fix(c.fitness)}</td><td className="num">{pct(c.metrics.net_return)}</td><td className="num">{pct(c.metrics.max_drawdown)}</td>
          <td className="num">{fix(c.metrics.sharpe, 2)}</td><td className="num">{profit(c.metrics.profit_factor)}</td><td className="num">{c.metrics.n_trades ?? dash}</td>
          <td>{label(c.stage)}</td><td>{c.evidence_complete ? 'Complete' : 'Incomplete'}</td><td className="reason">{c.selection_reason || dash}</td>
        </tr>)}</tbody>
      </table>
    </div>}
    {rows.length > 20 && <button type="button" className="evo-more" onClick={() => onShowAll(!showAll)}>{showAll ? 'Show top 20' : `Show all ${rows.length}`}</button>}
  </section>;
}

function Detail({ c, byId, onSelect, onClose }: { c: Candidate; byId: Map<string, Candidate>; onSelect: (id: string, from?: HTMLElement | null) => void; onClose: () => void }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { ref.current?.focus({ preventScroll: false }); }, []);
  const g = c.genome;
  const diff = c.mutation_diff ? Object.entries(c.mutation_diff) : [];
  const show = (v: unknown) => (typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v));
  const children = [...byId.values()].filter((x) => x.parent_ids.includes(c.candidate_id));
  return <section className="evo-section evo-detail" aria-labelledby="evo-detail-h" tabIndex={-1} ref={ref} onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }}>
    <h4 id="evo-detail-h">{c.candidate_id} <Status c={c} /><button type="button" className="evo-close" aria-label="Close candidate detail" onClick={onClose}><X size={14} /></button></h4>
    <p className="evo-sub">Genome <code>{c.genome_id}</code> · born generation {c.birth_generation} · {label(c.reproduction_kind)} · immutable (hash <code>{g.content_hash.slice(0, 10)}</code>)</p>
    <div className="evo-cols">
      <div>
        <h5>Genome</h5>
        <dl className="evo-kv">
          <dt>Timeframe</dt><dd>{g.timeframe}</dd><dt>Pairs</dt><dd>{g.pairs.join(', ')}</dd><dt>Features</dt><dd>{g.features.join(', ')}</dd>
          <dt>Strategy mix</dt><dd>{Object.entries(g.family_weights).map(([k, v]) => `${label(k)} ${pct(v, 0)}`).join(' · ')}</dd>
          <dt>Reasoning</dt><dd>{Object.entries(g.reasoning_weights).map(([k, v]) => `${k} ${pct(v, 0)}`).join(' · ')}</dd>
          <dt>Memory windows</dt><dd>{g.memory_windows.join(', ')} bars</dd><dt>Risk / trade</dt><dd>{pct(g.risk_per_trade)}</dd>
          <dt>Position limit</dt><dd>{g.position_limit}</dd><dt>ATR stop / target</dt><dd>{g.atr_stop} / {g.atr_target}</dd>
          <dt>Prompt · memory</dt><dd>{g.prompt_version} · {g.memory_policy_version}</dd>
          <dt>Model</dt><dd>{c.model_used || `Not recorded · requested ${c.requested_capability}`}</dd>
        </dl>
      </div>
      <div>
        <h5>Lineage</h5>
        <dl className="evo-kv">
          <dt>Parents</dt><dd>{c.parent_ids.length ? c.parent_ids.map((p) => <button type="button" key={p} className="evo-link" onClick={(event) => onSelect(p, event.currentTarget)}>{p}</button>) : 'None (founder)'}</dd>
          <dt>Children</dt><dd>{children.length ? children.map((x) => <button type="button" key={x.candidate_id} className="evo-link" onClick={(event) => onSelect(x.candidate_id, event.currentTarget)}>{x.candidate_id}</button>) : 'None yet'}</dd>
        </dl>
        <h5>Mutation diff</h5>
        {diff.length ? <ul className="evo-diff">{diff.map(([k, v]) => <li key={k}>{k === 'from' && Array.isArray(v)
          ? <span>Crossover of <code>{v.map(show).join(' + ')}</code></span>
          : <><code>{k}</code>{Array.isArray(v) && v.length === 2 ? <span><del>{show(v[0])}</del> → <ins>{show(v[1])}</ins></span> : <span>{show(v)}</span>}</>}</li>)}</ul> : <p className="evo-note">{c.reproduction_kind === 'clone' ? 'Clone: identical content, new identity.' : 'No diff recorded.'}</p>}
        <h5>Fitness components</h5>
        {c.fitness_components ? <ul className="evo-bars">{Object.entries(c.fitness_components).map(([k, v]) => <li key={k}><span>{label(k)}</span>{v == null ? <em>excluded, not zero</em> : <><i style={{ width: `${Math.round(v * 100)}%` }} /><b>{fix(v)}</b></>}</li>)}</ul> : <p className="evo-note">No fitness: it is computed only after every gate passes.</p>}
      </div>
      <div>
        <h5>Gates</h5>
        <ul className="evo-gates">{c.gates.length ? c.gates.map((x) => <li key={x.name} data-status={x.status}><b>{x.status === 'pass' ? <Check size={12} aria-hidden /> : x.status === 'fail' ? <X size={12} aria-hidden /> : <Minus size={12} aria-hidden />}{x.status === 'pass' ? 'Pass' : x.status === 'fail' ? 'Fail' : 'Unknown'}</b> {label(x.name)}{x.detail && <small>{x.detail}</small>}</li>) : <li>Not evaluated yet.</li>}</ul>
        <h5>Evaluation windows</h5>
        <ul className="evo-windows">{c.windows.length ? c.windows.map((w) => <li key={w.name}><b>{w.name}</b> {w.role} · {w.n_bars} bars<small>{w.start.slice(0, 10)} → {w.end.slice(0, 10)}</small></li>) : <li>None.</li>}<li className="evo-sealed">Sealed holdout is not part of selection.</li></ul>
      </div>
    </div>
  </section>;
}

const NICHE_LABEL: Record<string, string> = { trend: 'Trend', range: 'Range', high_vol: 'High volatility', low_vol: 'Low volatility' };

function HallOfFame({ archive, onSelect, byId }: { archive: ArchiveEntry[]; onSelect: (id: string, from?: HTMLElement | null) => void; byId: Map<string, Candidate> }) {
  const map = new Map(archive.map((a) => [a.niche, a]));
  const pairs = archive.filter((a) => a.niche.startsWith('pair:')).map((a) => a.niche);
  const slots = [...REGIME_NICHES.map((r) => ({ key: `regime:${r}`, title: NICHE_LABEL[r] ?? r })), ...pairs.map((p) => ({ key: p, title: p.slice(5) }))];
  return <section className="evo-section" aria-labelledby="evo-hof">
    <h4 id="evo-hof"><Trophy size={14} aria-hidden /> Hall of Fame <small>champions per niche keep their original dataset, stage and score</small></h4>
    <ul className="evo-hof">
      {slots.map(({ key, title }) => {
        const a = map.get(key);
        return <li key={key} className={a ? 'has' : 'empty'}>
          <span className="evo-niche">{key.startsWith('pair:') ? 'Currency pair' : 'Regime'}</span><strong>{title}</strong>
          {a ? <>
            <button type="button" className="evo-link" onClick={(event) => onSelect(a.candidate_id, event.currentTarget)} disabled={!byId.has(a.candidate_id)}>{a.candidate_id}</button>
            <small>Original: gen {a.origin.generation} · {label(a.origin.stage)} · fitness {fix(a.origin.fitness)} · {a.origin.data_source} data</small>
            <small>Re-scored on the current data: {a.last_reeval.status === 'qualified' ? `fitness ${fix(a.last_reeval.fitness)}` : label(a.last_reeval.status)}</small>
          </> : <small>No qualified champion yet.</small>}
        </li>;
      })}
      <li className="empty unavailable"><span className="evo-niche">Event / news</span><strong>Not available</strong><small>Needs timestamped event data support before it can be judged.</small></li>
    </ul>
  </section>;
}

// ---- lineage --------------------------------------------------------------------------------

const COL = 96;
const ROW = 28;
const PAD = 28;
const MAX_COLUMNS = 8;

function Lineage({ snapshot, selected, onSelect }: { snapshot: Snapshot; selected: string | null; onSelect: (id: string, from?: HTMLElement | null) => void }) {
  const [view, setView] = useState<'graph' | 'list'>(() => (typeof window !== 'undefined' && window.matchMedia?.('(max-width: 640px)').matches ? 'list' : 'graph'));
  const { nodes, edges } = snapshot.lineage;
  const generations = [...new Set(nodes.map((n) => n.generation))].sort((a, b) => a - b).slice(-MAX_COLUMNS);
  const visible = new Set(generations);
  const shown = nodes.filter((n) => visible.has(n.generation));
  const columns = new Map<number, typeof shown>();
  for (const n of shown) columns.set(n.generation, [...(columns.get(n.generation) ?? []), n]);
  const pos = new Map<string, { x: number; y: number }>();
  generations.forEach((g, ci) => (columns.get(g) ?? []).sort((a, b) => a.id.localeCompare(b.id)).forEach((n, ri) => pos.set(n.id, { x: PAD + ci * COL, y: PAD + ri * ROW })));
  const rows = Math.max(1, ...[...columns.values()].map((c) => c.length));
  const related = useMemo(() => {
    if (!selected) return null;
    const out = new Set([selected]);
    for (const dir of ['up', 'down'] as const) {
      const queue = [selected];
      while (queue.length) {
        const cur = queue.pop() as string;
        for (const e of edges) { const next = dir === 'up' ? (e.to === cur ? e.from : null) : (e.from === cur ? e.to : null); if (next && !out.has(next)) { out.add(next); queue.push(next); } }
      }
    }
    return out;
  }, [selected, edges]);
  const hidden = nodes.length - shown.length;
  const byId = new Map(snapshot.candidates.map((c) => [c.candidate_id, c]));
  const sel = selected ? byId.get(selected) : null;
  return <section className="evo-section" aria-labelledby="evo-lin">
    <h4 id="evo-lin"><GitBranch size={14} aria-hidden /> Lineage <small>{nodes.length} candidates · {edges.length} parent links</small>
      <span className="evo-toggle" role="group" aria-label="Lineage view"><button type="button" aria-pressed={view === 'graph'} onClick={() => setView('graph')}>Graph</button><button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>List</button></span></h4>
    {hidden > 0 && view === 'graph' && <p className="evo-note">Showing the latest {generations.length} birth generations; {hidden} older candidates are in the list view.</p>}
    {view === 'graph' ? <div className="evo-scroll evo-dag" tabIndex={0} role="region" aria-label="Lineage graph, scrolls sideways">
      <svg width={PAD * 2 + Math.max(0, generations.length - 1) * COL} height={PAD * 2 + (rows - 1) * ROW} role="group" aria-label="Candidate lineage by birth generation">
        {generations.map((g, ci) => <text key={g} x={PAD + ci * COL} y={12} className="evo-gen" textAnchor="middle">gen {g}</text>)}
        {edges.map((e) => { const a = pos.get(e.from); const b = pos.get(e.to); if (!a || !b) return null; const mid = (a.x + b.x) / 2; const on = !related || (related.has(e.from) && related.has(e.to));
          return <path key={`${e.from}>${e.to}`} d={`M${a.x},${a.y} C${mid},${a.y} ${mid},${b.y} ${b.x},${b.y}`} className={`evo-edge ${on ? 'on' : 'dim'}`} fill="none" />; })}
        {shown.map((n) => { const p = pos.get(n.id); if (!p) return null; const on = !related || related.has(n.id); const isSel = selected === n.id;
          const name = `${n.id}, born generation ${n.generation}, ${n.kind}, ${n.retired ? 'retired' : n.status}`;
          return <g key={n.id} transform={`translate(${p.x},${p.y})`} className={`evo-node evo-node--${n.kind} ${n.retired ? 'retired' : n.status} ${on ? 'on' : 'dim'} ${isSel ? 'sel' : ''}`}
            role="button" tabIndex={0} aria-label={name} aria-pressed={isSel} onClick={(event) => onSelect(n.id, event.currentTarget as unknown as HTMLElement)}
            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(n.id, event.currentTarget as unknown as HTMLElement); } }}>
            <title>{name}</title>
            {n.kind === 'crossover' ? <rect x={-7} y={-7} width={14} height={14} transform="rotate(45)" /> : n.kind === 'clone' ? <rect x={-6} y={-6} width={12} height={12} /> : <circle r={7} />}
            {n.retired && <path d="M-4,-4 L4,4 M4,-4 L-4,4" className="evo-x" />}
          </g>; })}
      </svg>
    </div> : <LineageList nodes={nodes} edges={edges} byId={byId} selected={sel ?? null} onSelect={onSelect} />}
    <p className="evo-legend" aria-hidden="true">● founder / mutation · ■ clone · ◆ crossover · ✕ retired (dashed) · solid ring = survivor · hollow = pending</p>
  </section>;
}

function LineageList({ nodes, edges, byId, selected, onSelect }: { nodes: Snapshot['lineage']['nodes']; edges: Snapshot['lineage']['edges']; byId: Map<string, Candidate>; selected: Candidate | null; onSelect: (id: string, from?: HTMLElement | null) => void }) {
  const pick = selected ?? [...byId.values()].filter((c) => c.survivor)[0] ?? null;
  if (!pick) return <p className="evo-note">Select a candidate to read its parents and descendants.</p>;
  const parents = edges.filter((e) => e.to === pick.candidate_id).map((e) => byId.get(e.from)).filter((x): x is Candidate => Boolean(x));
  const kids = edges.filter((e) => e.from === pick.candidate_id).map((e) => byId.get(e.to)).filter((x): x is Candidate => Boolean(x));
  const row = (c: Candidate) => <li key={c.candidate_id}><button type="button" className="evo-link" onClick={(event) => onSelect(c.candidate_id, event.currentTarget)}>{c.candidate_id}</button> <small>gen {c.birth_generation} · {label(c.reproduction_kind)} · {c.retired ? 'retired' : label(c.status)}</small></li>;
  return <div className="evo-list">
    <p className="evo-sub">{selected ? 'Selected' : 'Showing a survivor'}: <strong>{pick.candidate_id}</strong> · gen {pick.birth_generation} · {label(pick.reproduction_kind)} · {nodes.length} candidates in total</p>
    <h5>Parents ({parents.length})</h5>{parents.length ? <ul>{parents.map(row)}</ul> : <p className="evo-note">None: a founder.</p>}
    <h5>Descendants ({kids.length})</h5>{kids.length ? <ul>{kids.map(row)}</ul> : <p className="evo-note">None yet.</p>}
  </div>;
}
