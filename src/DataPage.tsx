// Data page (owner 2026-10-21): what the Hermes agents know and which data they actually read. Everything here comes
// from /api/dbagent, which serves DBAgent's registry / selfcheck and a fresh usage audit. Nothing is inferred: a value
// the audit could not determine is shown as "unknown", never as pass or fail.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Database } from 'lucide-react';
import { Chip, StateNote, type Tone } from './ui';
import { DirectoryTree, type DirRow } from './DirectoryTree';

type Verdict = 'OK' | 'OTHER_SKILL' | 'NO_SKILL' | 'UNMAPPED' | 'PRELOAD_UNKNOWN';
type Tool = { tool: string; first_use: string; uses: number; verdict: Verdict; skills_before?: string[] };
type Session = {
  session: string; profile: string; model: string; live: boolean; started: string; last_activity: string; calls: number; changes: number;
  first_read: 'SOURCE_FIRST' | 'SOURCE_LATE' | 'NO_SOURCE' | 'NO_CHANGES'; skills: string[]; data_used: Record<string, string>; tools: Tool[];
};
type ToolSkill = { profile: string; tool: string; sessions: number } & Record<Verdict, number>;
type Usage = { generated_at: string; window_hours: number; method: string; sessions: Session[]; data_matrix: Record<string, Record<string, number>>; tool_skill: ToolSkill[]; summary?: Record<string, unknown> };
type Check = { name: string; ok: boolean; detail: string };
type Selfcheck = { generated_at: string; ok: boolean; checks: Check[] };
type WebRoute = { hostname: string; path: string | null; local_port: number; listening: boolean; process: string | null; local_http: number | string | null; note?: string };
type Service = { label: string; pid: number | null; last_exit: number | null; running: boolean };
type Profile = { profile: string; role: string; provider: string; model: string; last_session: string | null; sessions_7d: number };
type Cron = { profile: string; name: string; enabled: boolean; state: string; last_status: string | null; failure_streak: number; last_run_at: string | null };
type Registry = { generated_at?: string; error?: string; web_routes?: WebRoute[]; launchd?: Service[]; profiles?: Profile[]; cron_jobs?: Cron[]; directories?: DirRow[] };
type Payload = { registry: Registry; usage: Usage | null; usage_error?: string; selfcheck: Selfcheck | null; served_at: string };

const HOURS = [1, 6, 24] as const;
const STALE_MS = { registry: 20 * 60_000, usage: 60_000, selfcheck: 40 * 60_000 };
const FIRST_READ: Record<Session['first_read'], { label: string; tone: Tone }> = {
  SOURCE_FIRST: { label: 'Read source first', tone: 'ok' },
  SOURCE_LATE: { label: 'Read source late', tone: 'warn' },
  NO_SOURCE: { label: 'No source read', tone: 'bad' },
  NO_CHANGES: { label: 'Made no changes', tone: 'unknown' },
};
const VERDICT: Record<Verdict, { label: string; tone: Tone }> = {
  OK: { label: 'OK', tone: 'ok' },
  OTHER_SKILL: { label: 'Other skill', tone: 'warn' },
  NO_SKILL: { label: 'No skill', tone: 'bad' },
  UNMAPPED: { label: 'unknown · no mapping', tone: 'unknown' },
  PRELOAD_UNKNOWN: { label: 'unknown · preloaded skills not visible', tone: 'unknown' },
};
const VERDICTS = Object.keys(VERDICT) as Verdict[];

const clock = (iso?: string | null) => { const t = iso ? new Date(iso) : null; return t && !Number.isNaN(t.getTime()) ? t.toLocaleTimeString('en-GB') : '—'; };
const ageOf = (iso?: string | null, now = Date.now()) => { const t = iso ? Date.parse(iso) : NaN; return Number.isFinite(t) ? Math.max(0, now - t) : null; };
const ageText = (ms: number | null) => ms === null ? 'unknown' : ms < 90_000 ? `${Math.round(ms / 1000)} s ago` : ms < 5_400_000 ? `${Math.round(ms / 60_000)} min ago` : `${(ms / 3_600_000).toFixed(1)} h ago`;

function Freshness({ name, at, limit, now }: { name: string; at?: string | null; limit: number; now: number }) {
  const age = ageOf(at, now);
  const stale = age === null || age > limit;
  return <li className={stale ? 'is-stale' : ''}><span>{name}</span><b>{clock(at)}</b><small>{ageText(age)}</small>{stale ? <Chip tone="bad">STALE</Chip> : <Chip tone="ok">fresh</Chip>}</li>;
}

function SessionRow({ session }: { session: Session }) {
  const first = FIRST_READ[session.first_read] || { label: session.first_read, tone: 'unknown' as Tone };
  const data = Object.entries(session.data_used || {}).sort((a, b) => a[1].localeCompare(b[1]));
  return <li className={`dp-session ${session.live ? 'is-live' : ''}`}>
    <div className="dp-session-head">
      <b>{session.profile}</b><span>{session.model}</span>
      {session.live && <Chip tone="live">LIVE</Chip>}
      <Chip tone={first.tone}>{first.label}</Chip>
      <small>{clock(session.started)} – {clock(session.last_activity)} · {session.calls} calls · {session.changes} changes</small>
    </div>
    <dl>
      <dt>Data read</dt>
      <dd>{data.length ? <ol className="dp-reads">{data.map(([label, at]) => <li key={label}><time>{clock(at)}</time> {label}</li>)}</ol> : <span className="dp-none">none</span>}</dd>
      <dt>Skills loaded</dt>
      <dd>{session.skills?.length ? session.skills.map((skill) => <code key={skill}>{skill}</code>) : <span className="dp-none">none</span>}</dd>
      <dt>External tools</dt>
      <dd>{session.tools?.length ? session.tools.map((tool) => <span key={tool.tool} className="dp-tool" title={tool.skills_before?.length ? `Skills loaded before: ${tool.skills_before.join(', ')}` : 'No skill loaded before this tool'}>
        {tool.tool} ×{tool.uses} <Chip tone={VERDICT[tool.verdict]?.tone || 'unknown'}>{VERDICT[tool.verdict]?.label || `unknown · ${tool.verdict}`}</Chip></span>) : <span className="dp-none">none</span>}</dd>
    </dl>
  </li>;
}

export function DataPage() {
  const [hours, setHours] = useState<number>(6);
  const [data, setData] = useState<Payload | null>(null);
  const [problem, setProblem] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [cell, setCell] = useState<{ label: string; profile: string } | null>(null);
  const [allSessions, setAllSessions] = useState(false);
  const seq = useRef(0);
  const load = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const response = await fetch(`/api/dbagent?hours=${hours}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('dbagent unavailable');
      const body = await response.json() as Payload;
      if (mine !== seq.current) return;
      setData(body); setProblem(false); setNow(Date.now());
    } catch { if (mine === seq.current) { setProblem(true); setNow(Date.now()); /* keep the last snapshot, labelled */ } }
  }, [hours]);
  useEffect(() => {
    setCell(null);
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 10000);
    const visible = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', visible);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [load]);

  const usage = data?.usage || null;
  const registry = data?.registry;
  const selfcheck = data?.selfcheck || null;
  const checks = useMemo(() => [...(selfcheck?.checks || [])].sort((a, b) => Number(a.ok) - Number(b.ok)), [selfcheck]);
  const routes = useMemo(() => [...(registry?.web_routes || [])].sort((a, b) => Number(a.listening) - Number(b.listening)), [registry]);
  const services = useMemo(() => [...(registry?.launchd || [])].sort((a, b) => Number(a.running) - Number(b.running)), [registry]);
  const crons = registry?.cron_jobs || [];
  const failing = crons.filter((job) => job.enabled && (job.failure_streak > 0 || job.last_status === 'error'));
  const pausedWithErrors = crons.filter((job) => !job.enabled && (job.failure_streak > 0 || job.last_status === 'error')).length;
  const labels = Object.keys(usage?.data_matrix || {});
  const columns = useMemo(() => [...new Set(Object.values(usage?.data_matrix || {}).flatMap((row) => Object.keys(row)))].sort(), [usage]);
  const picked = cell && usage ? usage.sessions.filter((s) => s.profile === cell.profile && s.data_used && cell.label in s.data_used) : [];
  const toolSkill = useMemo(() => [...(usage?.tool_skill || [])].sort((a, b) => b.NO_SKILL - a.NO_SKILL || b.sessions - a.sessions), [usage]);
  const shown = usage ? (allSessions ? usage.sessions : usage.sessions.slice(0, 25)) : [];

  if (!data) return <section className="dp card-shell" aria-live="polite"><StateNote kind={problem ? 'error' : 'loading'}>{problem ? 'Data unavailable.' : 'Loading data…'}</StateNote></section>;

  return <div className="dp">
    <section className="dp-card card-shell" aria-labelledby="dp-fresh">
      <header className="dp-head">
        <h3 id="dp-fresh"><Database size={16} strokeWidth={1.8} /> Data sources</h3>
        <div className="toolbar-tabs" role="group" aria-label="Usage window">
          {HOURS.map((h) => <button key={h} type="button" className={`toolbar-tab ${hours === h ? 'active' : ''}`} aria-pressed={hours === h} onClick={() => setHours(h)}>{h}h</button>)}
        </div>
      </header>
      <ul className="dp-fresh">
        <Freshness name="Registry" at={registry?.generated_at} limit={STALE_MS.registry} now={now} />
        <Freshness name={`Usage (${hours}h window)`} at={usage?.generated_at} limit={STALE_MS.usage} now={now} />
        <Freshness name="Self-check" at={selfcheck?.generated_at} limit={STALE_MS.selfcheck} now={now} />
      </ul>
      <small className="dp-note">{problem ? 'Update failed. Showing the last report.' : `Read ${clock(data.served_at)} · refreshes every 10 s while this page is visible`}</small>
      {data.usage_error && <StateNote kind="error">Usage audit did not run: {data.usage_error}</StateNote>}
      {registry?.error && <StateNote kind="error">{registry.error}</StateNote>}
    </section>

    <DirectoryTree rows={registry?.directories || []} />

    <section className="dp-card card-shell" aria-labelledby="dp-self">
      <header className="dp-head"><h3 id="dp-self">Self-check {selfcheck && <Chip tone={selfcheck.ok ? 'ok' : 'bad'}>{selfcheck.ok ? 'PASS' : 'FAIL'}</Chip>}</h3></header>
      {!selfcheck ? <StateNote kind="empty">Not available yet.</StateNote> : <ul className="dp-checks">
        {checks.map((check) => <li key={check.name} className={check.ok ? '' : 'is-fail'}><Chip tone={check.ok ? 'ok' : 'bad'}>{check.ok ? 'PASS' : 'FAIL'}</Chip><b>{check.name}</b><small>{check.detail}</small></li>)}
      </ul>}
    </section>

    <section className="dp-card card-shell" aria-labelledby="dp-live">
      <header className="dp-head"><h3 id="dp-live">Live system state</h3></header>
      <div className="dp-cols">
        <div>
          <p className="eyebrow">Public routes ({routes.filter((r) => !r.listening).length} down)</p>
          <ul className="dp-list">{routes.map((route) => <li key={`${route.hostname}${route.path}`} className={route.listening ? '' : 'is-fail'}>
            <Chip tone={route.listening ? 'ok' : 'bad'}>{route.listening ? 'UP' : 'DOWN'}</Chip><b>{route.hostname}{route.path || ''}</b><small>:{route.local_port} · {route.listening ? `${route.process || 'unknown process'} · HTTP ${route.local_http ?? '—'}` : 'not listening'}</small></li>)}</ul>
        </div>
        <div>
          <p className="eyebrow">Launchd services ({services.filter((s) => s.running).length}/{services.length} running)</p>
          <ul className="dp-list">{services.map((service) => <li key={service.label} className={service.running ? '' : 'is-fail'}>
            <Chip tone={service.running ? 'ok' : 'warn'}>{service.running ? 'RUNNING' : 'STOPPED'}</Chip><b>{service.label}</b><small>{service.running ? `pid ${service.pid}` : `last exit ${service.last_exit ?? '—'}`}</small></li>)}</ul>
        </div>
        <div>
          <p className="eyebrow">Profiles ({registry?.profiles?.length || 0})</p>
          <ul className="dp-list">{(registry?.profiles || []).map((p) => <li key={p.profile}><b>{p.profile}</b><small>{p.provider} · {p.model} · {p.sessions_7d} sessions / 7d</small></li>)}</ul>
        </div>
        <div>
          <p className="eyebrow">Cron job failures ({failing.length})</p>
          {failing.length ? <ul className="dp-list">{failing.map((job) => <li key={`${job.profile}${job.name}`} className="is-fail"><Chip tone="bad">FAILING</Chip><b>{job.name}</b><small>{job.profile} · streak {job.failure_streak} · last {job.last_status || '—'} {clock(job.last_run_at)}</small></li>)}</ul> : <StateNote kind="empty">No enabled job is failing.</StateNote>}
          {pausedWithErrors > 0 && <small className="dp-note">{pausedWithErrors} paused or finished jobs also ended with an error earlier.</small>}
        </div>
      </div>
    </section>

    <section className="dp-card card-shell" aria-labelledby="dp-who">
      <header className="dp-head"><h3 id="dp-who">Who used which data</h3><small>sessions per agent · click a count</small></header>
      {!usage ? <StateNote kind="empty">Usage not available.</StateNote> : labels.length === 0 ? <StateNote kind="empty">No data reads in this window.</StateNote> : <div className="dp-scroll"><table className="dp-table">
        <thead><tr><th scope="col">Data</th>{columns.map((c) => <th scope="col" key={c}>{c}</th>)}</tr></thead>
        <tbody>{labels.map((label) => <tr key={label}><th scope="row">{label}</th>{columns.map((c) => {
          const n = usage.data_matrix[label]?.[c] || 0;
          const on = cell?.label === label && cell.profile === c;
          return <td key={c}>{n ? <button type="button" className={`dp-cell ${on ? 'active' : ''}`} aria-pressed={on} onClick={() => setCell(on ? null : { label, profile: c })}>{n}</button> : <span className="dp-none">·</span>}</td>;
        })}</tr>)}</tbody>
      </table></div>}
      {cell && <div className="dp-picked" aria-live="polite">
        <p className="eyebrow">{cell.profile} read “{cell.label}” in {picked.length} session{picked.length === 1 ? '' : 's'}</p>
        <ul className="dp-list">{picked.map((s) => <li key={s.session} className={s.live ? 'is-live-text' : ''}><time>{clock(s.data_used[cell.label])}</time><b>{s.model}</b><small>{s.session} · started {clock(s.started)}{s.live ? ' · LIVE' : ''}</small></li>)}</ul>
      </div>}
    </section>

    <section id="sessions" className="dp-card card-shell" aria-labelledby="dp-think">
      <header className="dp-head"><h3 id="dp-think">Sessions</h3><small>{usage ? `${usage.sessions.length} sessions · ${usage.sessions.filter((s) => s.live).length} live · newest first` : ''}</small></header>
      {!usage ? <StateNote kind="empty">Usage not available.</StateNote> : <>
        <ol className="dp-sessions">{shown.map((session) => <SessionRow key={session.session} session={session} />)}</ol>
        {usage.sessions.length > 25 && <button type="button" className="console-more" aria-expanded={allSessions} onClick={() => setAllSessions((v) => !v)}>{allSessions ? 'Show fewer' : `All sessions (${usage.sessions.length})`}</button>}
      </>}
    </section>

    <section className="dp-card card-shell" aria-labelledby="dp-skill">
      <header className="dp-head"><h3 id="dp-skill">Skill before tool</h3><small>sessions per verdict · “No skill” first</small></header>
      {!usage ? <StateNote kind="empty">Usage not available.</StateNote> : <div className="dp-scroll"><table className="dp-table">
        <thead><tr><th scope="col">Agent</th><th scope="col">Tool</th><th scope="col">Sessions</th>{VERDICTS.map((v) => <th scope="col" key={v}><Chip tone={VERDICT[v].tone}>{VERDICT[v].label}</Chip></th>)}</tr></thead>
        <tbody>{toolSkill.map((row) => <tr key={`${row.profile}/${row.tool}`} className={row.NO_SKILL > 0 ? 'is-fail' : ''}><th scope="row">{row.profile}</th><td>{row.tool}</td><td>{row.sessions}</td>{VERDICTS.map((v) => <td key={v}>{row[v] || <span className="dp-none">·</span>}</td>)}</tr>)}</tbody>
      </table></div>}
    </section>

    <details className="dp-card card-shell dp-method">
      <summary>How this is measured</summary>
      <p>{usage?.method || 'Method not available.'}</p>
      <p>Limits: where the audit cannot see something (an unmapped tool, skills preloaded into a cron session) the result stays “unknown”. It is never guessed and never counted as pass or fail.</p>
    </details>
  </div>;
}
