// Agent × data map (owner 2026-10-28): the Office roster and "Who used which data" were two views of the same agents,
// so they are one card. Every cell is a count from DBAgent's usage audit (`data_matrix`, sessions that read that data),
// joined to the roster through each agent's Hermes profile ids. An agent with no profile, or whose profile had no
// session inside the window, is listed as UNKNOWN: absence of a session is not evidence of "read nothing".
import { useMemo, useState, type CSSProperties } from 'react';
import { Network } from 'lucide-react';
import { Chip, StateNote } from './ui';
import { memberTone } from './TeamRail';
import { personaOf } from './agentRoster';
import type { ProjectedAgent } from './office-projection.mjs';

export type UsageSession = { session: string; profile: string; model: string; live: boolean; started: string; data_used: Record<string, string> };
export type UsageForMap = { generated_at: string; sessions: UsageSession[]; data_matrix: Record<string, Record<string, number>> };

type Row = { key: string; name: string; sub: string; tone: string; live: boolean; profiles: string[]; sessions: number; reads: Record<string, number>; total: number; unknown: string | null };

const clock = (iso?: string | null) => { const t = iso ? new Date(iso) : null; return t && !Number.isNaN(t.getTime()) ? t.toLocaleTimeString('en-GB') : '—'; };

export function buildRows(agents: ProjectedAgent[], usage: UsageForMap, hours: number): { rows: Row[]; labels: string[] } {
  const labels = Object.keys(usage.data_matrix);
  const sessionsOf = (profile: string) => usage.sessions.filter((s) => s.profile === profile).length;
  const claimed = new Set<string>();
  const rows: Row[] = agents.map((agent) => {
    agent.profiles.forEach((p) => claimed.add(p));
    const reads: Record<string, number> = {};
    labels.forEach((label) => { const n = agent.profiles.reduce((sum, p) => sum + (usage.data_matrix[label]?.[p] || 0), 0); if (n) reads[label] = n; });
    const sessions = agent.profiles.reduce((sum, p) => sum + sessionsOf(p), 0);
    const unknown = !agent.profiles.length ? 'No Hermes profile is recorded for this member, so its data use cannot be read.'
      : sessions === 0 ? `Profile ${agent.profiles.join(', ')} had no session in the last ${hours} h.` : null;
    return { key: agent.name, name: personaOf(agent.name), sub: agent.room, tone: memberTone(agent.name), live: agent.active === true, profiles: agent.profiles, sessions, reads, total: Object.values(reads).reduce((a, b) => a + b, 0), unknown };
  });
  // Usage that no roster member claims is still real data; it is shown under its profile id, never dropped.
  const orphan = [...new Set(usage.sessions.map((s) => s.profile))].filter((p) => !claimed.has(p));
  orphan.forEach((profile) => {
    const reads: Record<string, number> = {};
    labels.forEach((label) => { const n = usage.data_matrix[label]?.[profile] || 0; if (n) reads[label] = n; });
    rows.push({ key: `profile:${profile}`, name: profile, sub: 'profile not on the roster', tone: memberTone(profile), live: usage.sessions.some((s) => s.profile === profile && s.live), profiles: [profile], sessions: sessionsOf(profile), reads, total: Object.values(reads).reduce((a, b) => a + b, 0), unknown: null });
  });
  return { rows, labels };
}

export function AgentDataMap({ agents, usage, hours, scopeLabel }: { agents: ProjectedAgent[]; usage: UsageForMap | null; hours: number; scopeLabel: string }) {
  const [cell, setCell] = useState<{ row: string; label: string } | null>(null);
  const built = useMemo(() => usage ? buildRows(agents, usage, hours) : null, [agents, usage, hours]);
  if (!usage || !built) return <section className="dp-card card-shell dm" aria-labelledby="dm-h"><header className="dp-head"><h3 id="dm-h"><Network size={16} strokeWidth={1.8} /> Which agent used which data</h3></header><StateNote kind="empty">Usage audit not available yet.</StateNote></section>;

  const { rows, labels } = built;
  const known = rows.filter((r) => !r.unknown).sort((a, b) => Number(b.live) - Number(a.live) || b.total - a.total || a.name.localeCompare(b.name));
  const unknown = rows.filter((r) => r.unknown);
  const peak = Math.max(1, ...known.flatMap((r) => Object.values(r.reads)));
  const pickedRow = cell ? rows.find((r) => r.key === cell.row) : null;
  const picked = pickedRow && cell ? usage.sessions.filter((s) => pickedRow.profiles.includes(s.profile) && cell.label in s.data_used) : [];
  const cols = { '--dm-cols': labels.length } as CSSProperties;

  return <section className="dp-card card-shell dm" aria-labelledby="dm-h">
    <header className="dp-head">
      <h3 id="dm-h"><Network size={16} strokeWidth={1.8} /> Which agent used which data</h3>
      <small>{scopeLabel} · last {hours} h · source: DBAgent usage audit</small>
    </header>
    <p className="dm-summary"><Chip tone="ok">{known.length} with a recorded session</Chip> <Chip tone="unknown">{unknown.length} UNKNOWN</Chip> <small>A dot is the number of sessions that read that data. Bigger dot, more sessions.</small></p>
    {labels.length === 0 ? <StateNote kind="empty">No agent read any tracked data in this window.</StateNote> : <div className="dm-scroll"><div className="dm-grid" style={cols} role="table" aria-label="Sessions per agent and data source">
      <div className="dm-row dm-head" role="row">
        <span role="columnheader">Agent</span>
        {labels.map((label) => <span role="columnheader" key={label} title={label}>{label}</span>)}
        <span role="columnheader" className="dm-sess">Sessions</span>
      </div>
      {known.map((row) => <div className={`dm-row ${row.live ? 'is-live' : ''}`} role="row" key={row.key} style={{ '--tone': row.tone } as CSSProperties}>
        <span role="rowheader" className="dm-who"><b>{row.name}</b><small>{row.sub}{row.live ? ' · active now' : ''}</small></span>
        {labels.map((label) => {
          const n = row.reads[label] || 0;
          const on = cell?.row === row.key && cell.label === label;
          const size = 20 + Math.round(16 * Math.sqrt(n / peak));
          return <span role="cell" className="dm-cell" key={label}>{n ? <button type="button" className={`dm-dot ${on ? 'active' : ''}`} style={{ '--d': `${size}px` } as CSSProperties} aria-pressed={on} aria-label={`${row.name} read ${label} in ${n} session${n === 1 ? '' : 's'}`} onClick={() => setCell(on ? null : { row: row.key, label })}>{n}</button> : <i className="dm-none" aria-label="none recorded">·</i>}</span>;
        })}
        <span role="cell" className="dm-sess">{row.sessions}</span>
      </div>)}
    </div></div>}
    {pickedRow && cell && <div className="dp-picked" aria-live="polite">
      <p className="eyebrow">{pickedRow.name} read “{cell.label}” in {picked.length} session{picked.length === 1 ? '' : 's'}</p>
      <ul className="dp-list">{picked.map((s) => <li key={s.session} className={s.live ? 'is-live-text' : ''}><time>{clock(s.data_used[cell.label])}</time><b>{s.model}</b><small>{s.session} · started {clock(s.started)}{s.live ? ' · LIVE' : ''}</small></li>)}</ul>
    </div>}
    {unknown.length > 0 && <details className="dm-unknown"><summary><Chip tone="unknown">UNKNOWN</Chip> {unknown.length} agents: data use cannot be stated</summary>
      <ul className="dp-list">{unknown.map((row) => <li key={row.key}><b>{row.name}</b><small>{row.sub} · {row.unknown}</small></li>)}</ul>
    </details>}
  </section>;
}
