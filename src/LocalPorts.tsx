// Local services (owner 2026-10-28): the PortMenuBar menu-bar app, moved into BrainBook. /api/local-ports runs the same
// `lsof` listener scan and shows only services the owner can open. Read-only: Open is a link, nothing is started here.
import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { ExternalLink, RefreshCw, Server } from 'lucide-react';
import { Chip, StateNote } from './ui';
import { badgeColor, initialsOf } from './ManagedApps';

type Service = { port: number; label: string; url: string; command: string; pid: number; address: string };
type Payload = { source: string; readAt: string; services: Service[]; error: string | null };

export function LocalPorts() {
  const [data, setData] = useState<Payload | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/local-ports', { cache: 'no-store' });
      if (!response.ok) throw new Error(String(response.status));
      setData(await response.json() as Payload); setFailed(false);
    } catch { setFailed(true); }
  }, []);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 10000);
    return () => window.clearInterval(timer);
  }, [load]);
  const time = data ? new Date(data.readAt).toLocaleTimeString('en-GB') : '';
  return <section className="dp-card card-shell" aria-labelledby="lp-h">
    <header className="dp-head">
      <h3 id="lp-h"><Server size={16} strokeWidth={1.8} /> Local services {data && <Chip tone={data.services.length ? 'ok' : 'unknown'}>{data.services.length} listening</Chip>}</h3>
      <button type="button" className="ghost-button" aria-label="Refresh local services" onClick={() => void load()}><RefreshCw size={14} strokeWidth={1.8} aria-hidden="true" /> Refresh</button>
    </header>
    {!data && !failed && <StateNote kind="loading">Scanning listening ports…</StateNote>}
    {failed && <StateNote kind="error">{data ? 'Update failed. Showing the last scan.' : 'The port scan did not answer, so which services are running is UNKNOWN.'}</StateNote>}
    {data?.error && <StateNote kind="error">{data.error}</StateNote>}
    {data && !data.error && data.services.length === 0 && <StateNote kind="empty">No known local service is listening right now.</StateNote>}
    {data && data.services.length > 0 && <ul className="lp-list">{data.services.map((service) => <li key={`${service.pid}-${service.address}`}>
      <span className="managed-app-badge" style={{ '--badge-color': badgeColor(service.label) } as CSSProperties} aria-hidden="true">{initialsOf(service.label)}</span>
      <span className="lp-name"><b>{service.label}</b><small>:{service.port} · {service.command} · pid {service.pid}</small></span>
      <a className="ghost-button managed-app-open" href={service.url} target="_blank" rel="noreferrer" aria-label={`Open ${service.label}, port ${service.port}`}><ExternalLink size={14} aria-hidden="true" /> Open</a>
    </li>)}</ul>}
    <small className="dp-note">Source: {data?.source || 'lsof -nP -iTCP -sTCP:LISTEN'}{time ? ` · read ${time}` : ''} · refreshes every 10 s while visible. Only known, openable services are listed.</small>
  </section>;
}
