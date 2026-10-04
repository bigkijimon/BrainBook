// InvestPro Evolution Arena: read-only snapshot endpoint (GET /api/investment/evolution).
//
// BrainBook never runs, mutates or schedules the arena. VIT's `vit.evolution` writes one
// snapshot file; this module validates it, rebuilds it from a whitelist (so unknown or
// sensitive fields can never pass through) and says honestly what state it is in:
//   absent      no snapshot file yet                      -> UI shows "no run yet"
//   corrupt     unreadable / fails the schema contract    -> UI shows an error, never data
//   unsupported readable but a schema version we don't know
//   stale       valid but older than the freshness window -> data shown with a stale warning
//   ok          valid and fresh (a run with zero candidates is still ok, not absent)
// The snapshot path is configuration only. Nothing in the request chooses a path, shell
// string or action, and every non-GET method is refused.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const SNAPSHOT_KIND = 'vit-evolution-snapshot';
export const SUPPORTED_SCHEMA = 1;
export const DEFAULT_SNAPSHOT = path.join(os.homedir(), 'Documents/SystemAPPS/Stock/VirtualInvestmentTrusts/data/evolution/snapshot.json');
const MAX_BYTES = 8 * 1024 * 1024;
const ID = /^[A-Za-z0-9_.:-]{1,80}$/;
const STATUS = new Set(['qualified', 'unqualified', 'pending', 'not_evaluated']);
const KINDS = new Set(['founder', 'clone', 'mutation', 'crossover']);
const RUN_STATUS = new Set(['no_run', 'idle', 'active', 'halted']);
const STAGES = new Set(['historical', 'walk_forward', 'paper', 'shadow_live', 'live']);

class Invalid extends Error {}
const bad = (why) => { throw new Invalid(why); };

const str = (value, label, max = 160) => {
  if (typeof value !== 'string') bad(`${label} must be a string`);
  return value.slice(0, max);
};
const optStr = (value, label, max = 400) => (value == null ? null : str(value, label, max));
const num = (value, label) => (Number.isFinite(value) ? value : bad(`${label} must be a finite number`));
const optNum = (value, label) => (value == null ? null : num(value, label));
const int = (value, label) => (Number.isInteger(value) && value >= 0 ? value : bad(`${label} must be a non-negative integer`));
const optInt = (value, label) => (value == null ? null : int(value, label));
const arr = (value, label, max) => (Array.isArray(value) && value.length <= max ? value : bad(`${label} must be an array of at most ${max}`));
const id = (value, label) => (typeof value === 'string' && ID.test(value) ? value : bad(`${label} is not a valid id`));

const numMap = (value, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) bad(`${label} must be an object`);
  return Object.fromEntries(Object.entries(value).slice(0, 12).map(([key, entry]) => [str(key, `${label} key`, 40), optNum(entry, `${label}.${key}`)]));
};

const profitFactor = (value) => {
  if (value == null) return null;
  const state = str(value.state, 'profit_factor.state', 12);
  if (!['finite', 'unbounded', 'undefined'].includes(state)) bad('profit_factor.state is unknown');
  return { state, value: optNum(value.value, 'profit_factor.value') };
};

const genomeView = (g) => {
  if (!g || typeof g !== 'object') bad('genome must be an object');
  return {
    family_weights: numMap(g.family_weights, 'family_weights'), reasoning_weights: numMap(g.reasoning_weights, 'reasoning_weights'),
    timeframe: str(g.timeframe, 'timeframe', 8), pairs: arr(g.pairs, 'pairs', 8).map((p) => str(p, 'pair', 12)),
    features: arr(g.features, 'features', 16).map((f) => str(f, 'feature', 24)),
    memory_windows: arr(g.memory_windows, 'memory_windows', 8).map((w) => int(w, 'memory window')),
    risk_per_trade: num(g.risk_per_trade, 'risk_per_trade'), position_limit: int(g.position_limit, 'position_limit'),
    atr_stop: num(g.atr_stop, 'atr_stop'), atr_target: num(g.atr_target, 'atr_target'),
    prompt_version: str(g.prompt_version, 'prompt_version', 40), memory_policy_version: str(g.memory_policy_version, 'memory_policy_version', 40),
    requested_capability: str(g.requested_capability, 'requested_capability', 40),
    content_hash: str(g.content_hash, 'content_hash', 64), seed: optInt(g.seed, 'seed'),
    generator_version: optStr(g.generator_version, 'generator_version', 40), schema_version: int(g.schema_version, 'genome schema_version'),
  };
};

const diffView = (diff) => {
  if (diff == null) return null;
  if (typeof diff !== 'object' || Array.isArray(diff)) bad('mutation_diff must be an object');
  const text = JSON.stringify(diff, (key, value) => (typeof value === 'string' ? value.slice(0, 120) : value));
  return text.length > 4000 ? bad('mutation_diff is too large') : JSON.parse(text);
};

const candidateView = (c) => {
  if (!c || typeof c !== 'object') bad('candidate must be an object');
  if (!STATUS.has(c.status)) bad('candidate status is unknown');
  if (!KINDS.has(c.reproduction_kind)) bad('candidate reproduction_kind is unknown');
  if (!STAGES.has(c.stage)) bad('candidate stage is unknown');
  const m = c.metrics || {};
  return {
    candidate_id: id(c.candidate_id, 'candidate_id'), genome_id: id(c.genome_id, 'genome_id'),
    birth_generation: int(c.birth_generation, 'birth_generation'), parent_ids: arr(c.parent_ids, 'parent_ids', 2).map((p) => id(p, 'parent id')),
    reproduction_kind: c.reproduction_kind, status: c.status, stage: c.stage,
    eligibility: c.eligibility === 'retired' ? 'retired' : 'eligible', survivor: c.survivor === true, retired: c.retired === true,
    fitness: optNum(c.fitness, 'fitness'), fitness_components: c.fitness_components ? numMap(c.fitness_components, 'fitness_components') : null,
    metrics: { net_return: optNum(m.net_return, 'net_return'), max_drawdown: optNum(m.max_drawdown, 'max_drawdown'), sharpe: optNum(m.sharpe, 'sharpe'),
      profit_factor: profitFactor(m.profit_factor), n_trades: optInt(m.n_trades, 'n_trades') },
    evidence_complete: c.evidence_complete === true, selection_reason: optStr(c.selection_reason, 'selection_reason'),
    gates: arr(c.gates || [], 'gates', 16).map((g) => ({ name: str(g.name, 'gate name', 40), status: str(g.status, 'gate status', 10), detail: str(g.detail ?? '', 'gate detail', 200) })),
    windows: arr(c.windows || [], 'windows', 16).map((w) => ({ name: str(w.name, 'window name', 40), role: str(w.role, 'window role', 12), start: str(w.start, 'window start', 40), end: str(w.end, 'window end', 40), n_bars: int(w.n_bars, 'window n_bars') })),
    niches: arr(c.niches || [], 'niches', 8).map((n) => str(n, 'niche', 40)),
    mutation_diff: diffView(c.mutation_diff),
    model_used: optStr(c.model_used, 'model_used', 80), requested_capability: str(c.requested_capability, 'requested_capability', 40),
    genome: genomeView(c.genome),
  };
};

// Pure: validates an already-parsed snapshot and returns its sanitized form, or throws Invalid.
export const sanitizeSnapshot = (raw) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) bad('snapshot must be an object');
  if (raw.kind !== SNAPSHOT_KIND) bad('not a VIT evolution snapshot');
  if (raw.schema_version !== SUPPORTED_SCHEMA) { const error = new Invalid(`schema_version ${String(raw.schema_version)} is not supported`); error.unsupported = true; throw error; }
  const run = raw.run || bad('run is missing');
  if (!RUN_STATUS.has(run.status)) bad('run.status is unknown');
  const candidates = arr(raw.candidates, 'candidates', 500).map(candidateView);
  const ids = new Set(candidates.map((c) => c.candidate_id));
  if (ids.size !== candidates.length) bad('duplicate candidate ids');
  const lineage = raw.lineage || bad('lineage is missing');
  const nodes = arr(lineage.nodes, 'lineage.nodes', 500).map((n) => ({ id: id(n.id, 'node id'), generation: int(n.generation, 'node generation'), kind: str(n.kind, 'node kind', 12), status: str(n.status, 'node status', 14), retired: n.retired === true }));
  const edges = arr(lineage.edges, 'lineage.edges', 1000).map((e) => ({ from: id(e.from, 'edge from'), to: id(e.to, 'edge to') }));
  for (const e of edges) if (!ids.has(e.from) || !ids.has(e.to)) bad('lineage edge points outside the candidate list');
  const counts = raw.counts || bad('counts are missing');
  const keys = ['evaluated', 'qualified', 'unqualified', 'pending_evidence', 'pending_population', 'survivors', 'retired', 'mutations', 'crossovers', 'clones', 'bred_founders', 'candidates_total', 'population_size'];
  const manifest = run.manifest || null;
  return {
    schema_version: SUPPORTED_SCHEMA, kind: SNAPSHOT_KIND, generated_at: optStr(raw.generated_at, 'generated_at', 40),
    data_source: raw.data_source == null ? null : ['fixture', 'historical', 'mixed'].includes(raw.data_source) ? raw.data_source : bad('data_source is unknown'),
    run: {
      status: run.status, run_id: optStr(run.run_id, 'run_id', 40), as_of: optStr(run.as_of, 'as_of', 40), stage: STAGES.has(run.stage) ? run.stage : null,
      seed: optInt(run.seed, 'seed'), policy_version: optStr(run.policy_version, 'policy_version', 40), generator_version: optStr(run.generator_version, 'generator_version', 40),
      halted_reason: optStr(run.halted_reason, 'halted_reason'),
      model_receipt: run.model_receipt ? { actual_provider_model: optStr(run.model_receipt.actual_provider_model, 'actual_provider_model', 80), paid_inference: run.model_receipt.paid_inference === true } : null,
      champion: run.champion ? { candidate_id: id(run.champion.candidate_id, 'champion id'), fitness: num(run.champion.fitness, 'champion fitness'), stage: str(run.champion.stage, 'champion stage', 14) } : null,
      manifest: manifest ? {
        dataset_digest: str(manifest.dataset_digest, 'dataset_digest', 64), bar_frequency: str(manifest.bar_frequency, 'bar_frequency', 6), timezone: str(manifest.timezone, 'timezone', 40),
        information_cutoff: str(manifest.information_cutoff, 'information_cutoff', 40), benchmark: str(manifest.benchmark, 'benchmark', 80), simulation_version: str(manifest.simulation_version, 'simulation_version', 40),
        regimes: arr(manifest.regimes || [], 'regimes', 8).map((r) => str(r, 'regime', 20)), data_source: str(manifest.data_source, 'manifest data_source', 12),
        windows: arr(manifest.windows || [], 'manifest windows', 16).map((w) => ({ name: str(w.name, 'window name', 40), role: str(w.role, 'window role', 12), start: str(w.start, 'start', 40), end: str(w.end, 'end', 40), n_bars: int(w.n_bars, 'n_bars') })),
      } : null,
    },
    counts: { generation: optInt(counts.generation, 'counts.generation'), ...Object.fromEntries(keys.map((key) => [key, int(counts[key] ?? 0, `counts.${key}`)])) },
    candidates,
    archive: arr(raw.archive, 'archive', 64).map((a) => ({
      niche: str(a.niche, 'niche', 40), candidate_id: id(a.candidate_id, 'archive candidate'), genome_hash: str(a.genome_hash, 'genome_hash', 64),
      origin: { run_id: str(a.origin.run_id, 'origin run', 40), generation: int(a.origin.generation, 'origin generation'), manifest_digest: str(a.origin.manifest_digest, 'origin manifest', 64), stage: str(a.origin.stage, 'origin stage', 14), fitness: num(a.origin.fitness, 'origin fitness'), data_source: str(a.origin.data_source, 'origin data_source', 12) },
      last_reeval: { status: str(a.last_reeval.status, 'reeval status', 20), fitness: optNum(a.last_reeval.fitness, 'reeval fitness'), manifest_digest: optStr(a.last_reeval.manifest_digest, 'reeval manifest', 64), generation: optInt(a.last_reeval.generation, 'reeval generation') },
    })),
    lineage: { nodes, edges },
    trial_ledger: { independent_trials: int(raw.trial_ledger?.independent_trials ?? 0, 'independent_trials'), total_evaluations: int(raw.trial_ledger?.total_evaluations ?? 0, 'total_evaluations') },
    holdout: arr(raw.holdout || [], 'holdout', 32).map((h) => ({ key: str(h.key, 'holdout key', 40), reads: int(h.reads, 'holdout reads'), reused: h.reused === true })),
  };
};

// Reads the configured file and classifies it. Never throws; every failure is a named state.
export const readEvolutionSnapshot = async ({ snapshotPath = process.env.BRAINBOOK_EVOLUTION_SNAPSHOT || DEFAULT_SNAPSHOT, now = Date.now(), staleMs = Number(process.env.BRAINBOOK_EVOLUTION_STALE_HOURS || 48) * 3600_000 } = {}) => {
  const base = { checkedAt: new Date(now).toISOString() };
  let stat;
  try { stat = await fs.lstat(snapshotPath); } catch (error) {
    return error.code === 'ENOENT' ? { ...base, state: 'absent', reason: 'No evolution run has written a snapshot yet.' } : { ...base, state: 'corrupt', reason: 'The snapshot location cannot be read.' };
  }
  if (!stat.isFile()) return { ...base, state: 'corrupt', reason: 'The snapshot path is not a regular file.' };
  if (stat.size > MAX_BYTES) return { ...base, state: 'corrupt', reason: 'The snapshot is larger than the allowed size.' };
  let raw;
  try { raw = JSON.parse(await fs.readFile(snapshotPath, 'utf8')); } catch { return { ...base, state: 'corrupt', reason: 'The snapshot is not valid JSON.' }; }
  let snapshot;
  try { snapshot = sanitizeSnapshot(raw); } catch (error) {
    // A TypeError from a malformed shape is the same verdict as a named violation: corrupt.
    return { ...base, state: error.unsupported ? 'unsupported' : 'corrupt', reason: error instanceof Invalid ? error.message : 'The snapshot does not match the schema.' };
  }
  const stamp = Date.parse(snapshot.run.as_of || snapshot.generated_at || '');
  if (!Number.isFinite(stamp)) return { ...base, state: 'corrupt', reason: 'The snapshot has no usable timestamp.' };
  const ageSeconds = Math.max(0, Math.round((now - stamp) / 1000));
  return { ...base, state: ageSeconds * 1000 > staleMs ? 'stale' : 'ok', ageSeconds, staleAfterSeconds: Math.round(staleMs / 1000), snapshot };
};

// Returns true when it handled the request. `json(res, body, status)` is server.mjs's responder.
export const handleEvolutionRequest = async (req, res, url, { json, snapshotPath, now } = {}) => {
  if (url.pathname !== '/api/investment/evolution') return false;
  if (req.method !== 'GET') {
    res.setHeader('allow', 'GET');
    json(res, { error: 'The evolution view is read-only.' }, 405);
    return true;
  }
  res.setHeader('cache-control', 'no-store');
  json(res, await readEvolutionSnapshot({ snapshotPath, now }));
  return true;
};
