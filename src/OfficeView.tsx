// Office (Hermes3D goal, step 2): the AI company as rooms, drawn from the real Hermes Kanban
// boards and profiles (/api/office → office.mjs). Rooms follow docs/hermes3d-office-design.md.
// Step 3 adds voice: "Tell Bigkiji" (VoiceInput.tsx) turns speech into an instruction the owner checks and sends.
// Step 4: rooms follow Bigkiji's team routing (teams.yaml, read per request); the panel re-reads
// every 20 s, when the window comes back, and right after an instruction is sent (OFFICE_REFRESH).
// Step 5: "3D / VR" opens /vr (OfficeVR.tsx), the same rooms in three.js and WebXR headsets.
// Step 6 (owner 2026-10-02, "とても醜い表示…もっとコンパクトに、詳細がわかるように"): the per-room
// 3-column mini board squeezed every title into a narrow tile and hid the rest behind "+1 more".
// A room is now one full-width row — name, count pills, and the card worth reading now — and one
// click opens the same detail as before: the seated agents, every working/stopped/waiting card with
// its full title and stop reason, and the shelf. Same data, same refresh, same routing; layout only.
// Step 6b (repair round, same brief): the first cut put the stopped card *and* its reason back on
// every room row while the desk above already enumerates every stopped card — so the same text
// appeared twice, both times cut off (real reasons run 300+ characters). Now each fact has one home:
// the desk owns "what is stopped and why" in full, a room row owns "what is running here, by whom",
// and a room with no board at all shrinks to one line instead of a card of zeroes.
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
const DESK_SHOWN = 5; // Beyond this the desk becomes a wall; the rest stay one click away, counted.
// Past this a stop reason gets a "more" toggle. Real reasons run to 300+ characters (office.mjs
// reads them whole from the card body), so a two-line clamp is the readable default and a toggle is
// the cue that says there is more — never a silent cut.
const LONG_REASON = 170;
const ago = (seconds: number | null) => {
  if (!seconds) return '';
  const minutes = Math.max(0, Math.round((Date.now() / 1000 - seconds) / 60));
  return minutes < 60 ? `${minutes}m` : minutes < 2880 ? `${Math.round(minutes / 60)}h` : `${Math.round(minutes / 1440)}d`;
};
const cardKey = (card: Card) => `${card.board}:${card.id}`;
const cardTip = (card: Card) => [card.title, `${card.board} · ${card.id} · ${card.status}${card.who ? ` · ${card.who}` : ''}`, `room: ${card.why}`, card.reason].filter(Boolean).join('\n');
const metaOf = (card: Card) => [card.who, card.board, ago(card.at)].filter(Boolean).join(' · ');
// `who` arrives as "app-dev team · Claude Code". The lane is already on the row, so a row shows the
// person; a plain name is left exactly as it is.
const whoShort = (who: string | null) => {
  const parts = String(who ?? '').split('·').map((part) => part.trim()).filter(Boolean);
  return parts.length > 1 && parts[parts.length - 1].length <= 28 ? parts[parts.length - 1] : who ?? undefined;
};

// What one room row says before it is opened: progress, not blockage. Every stopped card already
// appears in full in the desk directly above this list, so repeating one here only produced two
// truncated copies of the same text. The row's own job is "what is running here, by whom".
type Now = { tone: 'working' | 'idle' | 'stopped'; title: string; who?: string };
const nowLine = (room: Room): Now => {
  const run = room.board.working[0];
  if (run) return { tone: 'working', title: run.title, who: whoShort(run.who) };
  const next = room.board.waiting[0];
  if (next) return { tone: 'idle', title: next.title, who: whoShort(next.who) };
  // Only stopped cards on the board: saying "nothing on the board" next to a red "1 stopped" pill
  // contradicts the pill. Point at where the reason is written instead.
  const stuck = room.board.stopped.length;
  if (stuck) return { tone: 'stopped', title: `${stuck} stopped, nothing running — reason in Yuma’s desk above` };
  return { tone: 'idle', title: room.shelf.length ? `${room.delivered} delivered, on the shelf` : 'nothing on the board' };
};

// One dot for every state the panel draws, so all rows share a left edge. `is-yuma` is a ring, not
// a colour swap, so the two kinds of desk flag are told apart without relying on hue.
const Flag = ({ yuma = false }: { yuma?: boolean }) => <i className={`office-flag${yuma ? ' is-yuma' : ''}`} aria-hidden="true" />;

const PILL_TEXT = { working: 'working', stopped: 'stopped', waiting: 'waiting' } as const;
// A zero count is neutral. Tinting every row's "0 stopped" pink is what made pink stop meaning
// "stopped"; only a real count earns colour.
const pill = (kind: keyof Room['board'], count: number) => <span className={`office-pill is-${kind} ${count ? 'has-items' : 'is-zero'}`}>{count} {PILL_TEXT[kind]}</span>;

export function OfficeView({ remote = false }: { remote?: boolean }) {
  const [office, setOffice] = useState<Office | null>(null);
  const [open, setOpen] = useState(() => localStorage.getItem('brainbook.office') !== 'closed');
  const [rows, setRows] = useState<string[]>([]);
  const [reasons, setReasons] = useState<string[]>([]);
  const [deskAll, setDeskAll] = useState(false);
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
  const toggleRow = (id: string) => setRows((list) => (list.includes(id) ? list.filter((row) => row !== id) : [...list, id]));
  const toggleReason = (id: string) => setReasons((list) => (list.includes(id) ? list.filter((row) => row !== id) : [...list, id]));
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
        <p className="office-desk-note">Every stopped card, with the reason it stopped.</p>
        <ul>{office.desk.slice(0, deskAll ? office.desk.length : DESK_SHOWN).map((card) => {
          const key = cardKey(card);
          const isLong = (card.reason?.length ?? 0) > LONG_REASON;
          const isRead = reasons.includes(key);
          return <li key={key} className={card.needsYuma ? 'is-yuma' : ''}>
            <p className="desk-title"><Flag yuma={card.needsYuma} /><span>{card.title}</span></p>
            {card.reason && <p className="desk-reason" id={`desk-reason-${key.replace(/[^\w-]/g, '_')}`} data-read={isRead}>{card.reason}</p>}
            <small className="desk-meta">
              {card.needsYuma && <em className="desk-needs">needs you</em>}
              <span>{office.rooms.find((room) => room.id === card.room)?.label} · {card.board}</span>
            </small>
            {isLong && <button type="button" className="desk-reason-more" aria-expanded={isRead} aria-controls={`desk-reason-${key.replace(/[^\w-]/g, '_')}`} onClick={() => toggleReason(key)}>
              {isRead ? 'less' : 'more'}
            </button>}
          </li>;
        })}</ul>
        {office.desk.length > DESK_SHOWN && <button type="button" className="office-desk-more" aria-expanded={deskAll} onClick={() => setDeskAll((value) => !value)}>
          {deskAll ? 'Show fewer' : `Show all ${office.desk.length}`} <ChevronDown size={13} className="chat-chevron" aria-hidden="true" />
        </button>}
      </div>}
      <ul className="office-rows">
        {office.rooms.map((room) => {
          const { working, stopped, waiting } = room.board;
          const busy = working.length + stopped.length + waiting.length;
          if (room.shared && !room.agents.length && !busy && !room.shelf.length) return null;
          const isRowOpen = rows.includes(room.id);
          const detailId = `office-detail-${room.id}`;
          const now = nowLine(room);
          // A room with no board and nothing on its shelf has one fact to report — it is empty. Six
          // of them were spending a card's worth of height (3 zero pills + "nothing on the board")
          // on that fact, so they get one muted line and keep their chevron.
          const quiet = !busy && !room.shelf.length;
          // Meta stays one short line (the old header repeated the room name as the group and
          // spelled the auto-zone note out in full, which wrapped to a second line on phone).
          const meta = [
            room.shared ? 'shared' : room.group && room.group !== room.label ? room.group : null,
            ...(room.teams ?? []),
            room.auto ? 'no 3D zone yet' : room.zone,
          ].filter(Boolean).join(' · ');
          const lead = now.tone === 'working' ? working[0] : waiting[0];
          return <li key={room.id} className={`office-row ${stopped.length ? 'has-stopped' : ''} ${working.length ? 'is-live' : ''} ${room.shared ? 'is-shared' : ''} ${quiet ? 'is-quiet' : ''}`} data-zone={room.zone}>
            <button type="button" className="office-row-head" aria-expanded={isRowOpen} aria-controls={detailId} onClick={() => toggleRow(room.id)}>
              <span className="office-row-top">
                <b>{room.label}</b>
                <small className="office-row-meta" title={[room.teams?.length ? `Bigkiji routes team lane ${room.teams.join(', ')} here` : null, room.auto ? 'new team, no Hermes3D zone yet' : null].filter(Boolean).join(' · ') || undefined}>{meta}</small>
                {quiet
                  ? <span className="office-row-empty">{room.agents.length ? `${room.agents.length} seated` : 'empty'}</span>
                  : <span className="office-row-pills">
                      {pill('working', working.length)}{pill('stopped', stopped.length)}{pill('waiting', waiting.length)}
                    </span>}
                <ChevronDown size={15} className="chat-chevron" aria-hidden="true" />
              </span>
              {!quiet && <span className={`office-row-now is-${now.tone}`}>
                <Flag />
                <span className="now-title" title={lead ? cardTip(lead) : undefined}>{now.title}</span>
                {now.who && <span className="now-who">{now.who}</span>}
              </span>}
            </button>
            <div className="office-detail" id={detailId} hidden={!isRowOpen}>
              <ul className="office-agents">
                {room.agents.length ? room.agents.map((agent) => <li key={agent.name} className={`is-${agent.state}`} style={{ ['--agent' as string]: memberTone(agent.name) }}
                  title={`${agent.name}${agent.profiles.length ? ` · Hermes profile ${agent.profiles.join(', ')}` : ' · role (no Hermes profile)'}${agent.card ? `\n${agent.card.title}` : ''}`}>
                  <i aria-hidden="true">{agent.name.slice(0, 1)}</i>{agent.name}{agent.hermes && <em>H</em>}
                  {agent.card && <span className="office-bubble">{agent.card.title}</span>}
                </li>) : <li className="is-empty">No agents seated yet</li>}
              </ul>
              <div className="office-lanes">
                {COLUMNS.filter(([key]) => room.board[key].length > 0).map(([key, label]) => <section key={key} className={`office-lane is-${key}`}>
                  <h4>{label} <span>{room.board[key].length}</span></h4>
                  <ul>{room.board[key].map((card) => <li key={cardKey(card)}>
                    <p className="lane-title" title={cardTip(card)}>{card.title}</p>
                    {key === 'stopped' && card.reason && <p className="lane-reason"><Flag yuma={card.needsYuma} />{card.reason}</p>}
                    <small>{metaOf(card)}</small>
                  </li>)}</ul>
                </section>)}
                {room.shelf.length > 0 && <section className="office-lane is-shelf">
                  <h4>Shelf <span>· {room.delivered} delivered</span></h4>
                  <ul>{room.shelf.map((card) => <li key={cardKey(card)}>
                    <p className="lane-title" title={cardTip(card)}>{card.summary}<span className="lane-when"> {ago(card.at)}</span></p>
                  </li>)}</ul>
                </section>}
                {!busy && !room.shelf.length && <p className="lane-empty">Nothing on this room’s board or shelf.</p>}
              </div>
            </div>
          </li>;
        })}
      </ul>
    </>}
  </section>;
}
