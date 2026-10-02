// Office (Hermes3D goal, step 2): the AI company as rooms, drawn from the real Hermes Kanban
// boards and profiles (/api/office → office.mjs). Rooms follow docs/hermes3d-office-design.md.
// Step 3 adds voice: "Tell Bigkiji" (VoiceInput.tsx) turns speech into an instruction the owner checks and sends.
// Step 4: rooms follow Bigkiji's team routing (teams.yaml, read per request); the panel re-reads
// every 20 s, when the window comes back, and right after an instruction is sent (OFFICE_REFRESH).
// Step 5: "3D / VR" opens /vr (OfficeVR.tsx), the same rooms in three.js and WebXR headsets.
import { useEffect, useState } from 'react';
import { Building2, ChevronDown, Glasses } from 'lucide-react';
import { memberTone } from './TeamRail';
import { VoiceCommand } from './VoiceInput';

type Card = { id: string; board: string; title: string; status: string; who: string | null; room: string; why: string; reason: string | null; at: number | null; summary?: string; needsYuma?: boolean };
type Agent = { name: string; profiles: string[]; hermes: boolean; state: 'idle' | 'working' | 'stopped'; card: { id: string; title: string } | null };
type Room = { id: string; label: string; group: string | null; zone: string | null; shared: boolean; auto?: boolean; teams?: string[]; agents: Agent[]; board: { waiting: Card[]; working: Card[]; stopped: Card[] }; shelf: Card[]; delivered: number };
type Office = { rooms: Room[]; desk: Card[]; totals?: { waiting: number; working: number; stopped: number; delivered: number; agents: number; profiles: number }; boards?: string[]; days?: number; readAt?: number; error?: string;
  routing?: { source: string; teams: number; auto: string[]; error?: string | null } };
export const OFFICE_REFRESH = 'brainbook:office-refresh';

const COLUMNS = [['working', 'Working'], ['stopped', 'Stopped'], ['waiting', 'Waiting']] as const;
const ago = (seconds: number | null) => {
  if (!seconds) return '';
  const minutes = Math.max(0, Math.round((Date.now() / 1000 - seconds) / 60));
  return minutes < 60 ? `${minutes}m` : minutes < 2880 ? `${Math.round(minutes / 60)}h` : `${Math.round(minutes / 1440)}d`;
};
const cardTip = (card: Card) => [card.title, `${card.board} · ${card.id} · ${card.status}${card.who ? ` · ${card.who}` : ''}`, `room: ${card.why}`, card.reason].filter(Boolean).join('\n');

export function OfficeView({ remote = false }: { remote?: boolean }) {
  const [office, setOffice] = useState<Office | null>(null);
  const [open, setOpen] = useState(() => localStorage.getItem('brainbook.office') !== 'closed');
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const response = await fetch('/api/office', { cache: 'no-store' });
        const data = await response.json() as Office;
        // A server older than this panel answers 404; never render a half-shaped answer.
        const error = response.status === 404 ? 'Restart BrainBook to load the Office view.' : data.error || `HTTP ${response.status}`;
        if (alive) setOffice(Array.isArray(data.rooms) && !data.error ? data : { rooms: [], desk: [], error });
      } catch { /* keep last */ }
    };
    void load();
    const timer = window.setInterval(load, 20000);
    const onVisible = () => { if (document.visibilityState === 'visible') void load(); };
    window.addEventListener(OFFICE_REFRESH, load);
    document.addEventListener('visibilitychange', onVisible);
    return () => { alive = false; window.clearInterval(timer); window.removeEventListener(OFFICE_REFRESH, load); document.removeEventListener('visibilitychange', onVisible); };
  }, []);
  const toggle = () => setOpen((value) => { localStorage.setItem('brainbook.office', value ? 'closed' : 'open'); return !value; });
  const totals = office?.totals;

  return <section className="office card-shell" aria-labelledby="office-heading">
    <button type="button" className="office-head" aria-expanded={open} onClick={toggle}>
      <h3 id="office-heading"><Building2 size={16} strokeWidth={1.8} /> Office</h3>
      <small>{office?.error ? office.error : totals ? `${totals.working} working · ${totals.stopped} stopped · ${totals.waiting} waiting · ${totals.delivered} delivered in ${office?.days}d · ${totals.profiles} Hermes profiles · boards: ${office?.boards?.join(', ')}${office?.routing ? ` · routing: ${office.routing.source}${office.routing.error ? ` (${office.routing.error})` : ''}` : ''}` : 'Reading Hermes…'}</small>
      <ChevronDown size={16} className="chat-chevron" />
    </button>
    {open && <a className="office-vr-link" href="/vr" target="_blank" rel="noreferrer" title="Walk through the office in 3D, or in a VR headset (OfficeVR.tsx)"><Glasses size={14} strokeWidth={1.8} /> 3D / VR</a>}
    {open && <VoiceCommand tone={memberTone('Bigkiji')} remote={remote} />}
    {open && office && !office.error && <>
      {office.desk.length > 0 && <div className="office-desk" aria-label="Yuma's desk">
        <b>Yuma’s desk · {office.desk.length} stopped</b>
        <ul>{office.desk.map((card) => <li key={`${card.board}:${card.id}`} title={cardTip(card)} className={card.needsYuma ? 'is-yuma' : ''}>
          <span>{card.needsYuma ? '⛔' : '🟥'} {card.title}</span><small>{office.rooms.find((room) => room.id === card.room)?.label} · {card.board}</small>
        </li>)}</ul>
      </div>}
      <div className="office-grid">
        {office.rooms.map((room) => {
          const busy = room.board.working.length + room.board.stopped.length + room.board.waiting.length;
          if (room.shared && !room.agents.length && !busy && !room.shelf.length) return null;
          return <article key={room.id} className={`office-room ${room.board.working.length ? 'is-live' : ''} ${room.shared ? 'is-shared' : ''}`} data-zone={room.zone}>
            <header><b>{room.label}</b><small title={room.teams?.length ? `Bigkiji routes team lane ${room.teams.join(', ')} here` : undefined}>{room.shared ? 'shared' : room.group}{room.teams?.length ? ` · ${room.teams.join(', ')}` : ''} · {room.auto ? 'new team, no Hermes3D zone yet' : room.zone}</small></header>
            <ul className="office-agents">
              {room.agents.length ? room.agents.map((agent) => <li key={agent.name} className={`is-${agent.state}`} style={{ ['--agent' as string]: memberTone(agent.name) }}
                title={`${agent.name}${agent.profiles.length ? ` · Hermes profile ${agent.profiles.join(', ')}` : ' · role (no Hermes profile)'}${agent.card ? `\n${agent.card.title}` : ''}`}>
                <i aria-hidden="true">{agent.name.slice(0, 1)}</i>{agent.name}{agent.hermes && <em>H</em>}
                {agent.card && <span className="office-bubble">{agent.card.title}</span>}
              </li>) : <li className="is-empty">No agents seated yet</li>}
            </ul>
            <div className="office-board">
              {COLUMNS.map(([key, label]) => <div key={key} className={`office-col is-${key}`}>
                <small>{label} {room.board[key].length}</small>
                {room.board[key].slice(0, 3).map((card) => <p key={`${card.board}:${card.id}`} title={cardTip(card)}>{card.title}<span>{card.who ? ` · ${card.who}` : ''} {ago(card.at)}</span></p>)}
                {room.board[key].length > 3 && <p className="muted">+{room.board[key].length - 3} more</p>}
              </div>)}
            </div>
            {room.shelf.length > 0 && <div className="office-shelf">
              <small>Shelf · {room.delivered} delivered</small>
              {room.shelf.map((card) => <p key={`${card.board}:${card.id}`} title={cardTip(card)}>📦 {card.summary}<span> {ago(card.at)}</span></p>)}
            </div>}
          </article>;
        })}
      </div>
    </>}
  </section>;
}
