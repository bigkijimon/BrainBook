// Left menu: specialist teams (owner 2026-09-29). Each team opens into its
// hierarchy — Bigkiji routes, Pi supports, MiMo/Space Bunny build, Claude Code
// checks, Jev advises — and every member wears its own coloured frame. A member
// that is working right now pulses LIVE. Data: /api/agents/teams (read-only, 8 s).
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Boxes, Calculator, Clapperboard, Car, Cpu, GraduationCap, LineChart, LayoutGrid, Megaphone, Send, Target, X } from 'lucide-react';
import { ROSTER, personaOf } from './agentRoster';
import { VoiceRow } from './VoiceInput';
import { joinSpoken } from './voice';

type Member = { name: string; role: string; live: boolean; parent?: string | null; model?: string | null };
type WorkItem = { title: string; member?: string | null; state?: string };
type Team = { id: string; name: string; label: string; live: boolean; members: Member[]; specialists: string[]; work: WorkItem[]; direct?: string[] };

const TEAM_ICON: Record<string, typeof Boxes> = {
  'app-dev': Boxes, accountpro: Calculator, 'hs-school-ops': GraduationCap,
  investment: LineChart, 'igataya-web': Car, marketing: Target, movie: Clapperboard, blog: Megaphone,
};
// Fixed member colours so a name always looks the same everywhere in BrainBook
// (team sheet, agent feed frames, AgentFlow). Any name outside this roster
// (old Hermes profiles) falls back to a stable hash-picked tone.
const MEMBER_TONE: Record<string, string> = {
  You: '#f3e6fb', Bigkiji: '#ff4fa3', Pi: '#ffc44d', MiMo: '#2be8d9', 'Space Bunny': '#8f7bff', 'Claude Code': '#ff7a45',
  Jev: '#b5e853', 'Qwen (local)': '#5ab0ff', Vision: '#6effa1', Router: '#c792ea', ComfyUI: '#e46bff',
  // Film Group (MoviePro)
  Steve: '#ffa726', HideoKojima: '#c9a0ff', 'RyūichiSakamoto': '#7cf5c4', Kuro: '#ffd27a', Shimajiro: '#9dffb0',
  Ame: '#a0c4ff', Maru: '#ffb4a2', 'Auto QA': '#5ae0ff', Sora: '#ff8fd1',
};
// None of these may repeat a MEMBER_TONE value, or an outer-ring legacy profile
// could land on the exact colour of a real roster member (e.g. MiMo or Pi).
const FALLBACK_TONES = ['#f2a7ff', '#e8f06a', '#66d9b8', '#8fb3ff', '#ff9e7a', '#d0ff8a', '#ffa3c7', '#b7a6ff'];
const hashTone = (name: string) => FALLBACK_TONES[[...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % FALLBACK_TONES.length];
export const memberTone = (name: string) => MEMBER_TONE[name] || hashTone(name);

export function useTeams() {
  const [teams, setTeams] = useState<Team[]>([]);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const response = await fetch('/api/agents/teams', { cache: 'no-store' });
        if (response.ok && alive) setTeams((await response.json()).teams || []);
      } catch { /* BrainBook works without the Router */ }
    };
    void load();
    const timer = window.setInterval(load, 8000);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);
  return teams;
}

export function TeamRail({ teams, allCount, onAll, allActive }: { teams: Team[]; allCount: number; onAll: () => void; allActive: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const team = teams.find((entry) => entry.id === open) || null;
  return <>
    <button type="button" className={`area-item area-all ${allActive ? 'active' : ''}`} aria-pressed={allActive} title="All tasks" onClick={onAll}>
      <LayoutGrid size={19} strokeWidth={1.5} /><span>All</span><b>{allCount}</b>
    </button>
    {teams.map((entry) => {
      const Icon = TEAM_ICON[entry.id] || Boxes;
      const liveCount = entry.members.filter((member) => member.live).length;
      return <button type="button" key={entry.id} className={`area-item team-item ${entry.live ? 'is-live' : ''} ${open === entry.id ? 'active' : ''}`}
        style={{ '--tone': entry.live ? '#ff4fa3' : '#b69bc4' } as React.CSSProperties}
        aria-haspopup="dialog" aria-expanded={open === entry.id} title={entry.label} onClick={() => setOpen(entry.id)}>
        <Icon size={19} strokeWidth={1.5} /><span>{entry.name}</span>
        {entry.live ? <b className="team-live"><i />LIVE{liveCount > 1 ? ` ${liveCount}` : ''}</b> : <b className="team-idle">idle</b>}
      </button>;
    })}
    {team && createPortal(<TeamSheet team={team} onClose={() => setOpen(null)} />, document.body)}
  </>;
}

function TeamSheet({ team, onClose }: { team: Team; onClose: () => void }) {
  const direct = team.direct || [];
  const [to, setTo] = useState<string | null>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const [info, setInfo] = useState<Member | null>(null);
  const frame = (member: Member) => <MemberFrame member={member} picked={to === member.name || info?.name === member.name} onPick={() => setInfo(member)} />;
  // Real hierarchy (owner 2026-09-30): each member sits under the one it reports to
  // (agent-feed.py TEAM_PARENT / MOVIE_PARENT); a member whose parent is not in this
  // team is placed under the lead so nobody floats loose.
  const names = new Set(team.members.map((member) => member.name));
  const roots = team.members.filter((member) => !member.parent || !names.has(member.parent));
  const [lead] = roots;
  const parentOf = (member: Member) => (member.parent && names.has(member.parent) ? member.parent : member === lead ? null : lead?.name);
  const branch = (name: string): React.ReactNode => {
    const kids = team.members.filter((member) => member !== lead && parentOf(member) === name);
    return kids.length ? <ol>{kids.map((member) => <li key={member.name}>{frame(member)}{branch(member.name)}</li>)}</ol> : null;
  };
  return <div className="team-sheet-backdrop" onClick={onClose}>
    <section className="team-sheet" role="dialog" aria-modal="true" aria-label={`${team.name} team`} onClick={(event) => event.stopPropagation()}>
      <header>
        <div><p className="eyebrow">{team.label.toUpperCase()}</p><h3>{team.name}{team.live && <span className="team-live big"><i />LIVE</span>}</h3></div>
        <button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={16} /></button>
      </header>
      {direct.length > 0 && <DirectBox team={team} direct={direct} to={to || direct[0]} onTo={setTo} />}
      <ol className="team-tree">
        {lead && <li className="tree-lead">{frame(lead)}</li>}
        {lead && <li className="tree-crew">{branch(lead.name)}</li>}
      </ol>
      <p className="team-hint">Tap anyone to see what they do.</p>
      {info && <AgentInfo name={info.name} model={info.model} role={info.role} live={info.live} onClose={() => setInfo(null)}
        onInstruct={direct.includes(info.name) ? () => { setTo(info.name); setInfo(null); } : undefined} />}
      {team.specialists.length > 0 && <div className="team-roles"><span>Role files</span>{team.specialists.map((role, index) => <em key={`${role}-${index}`}>{role}</em>)}</div>}
      <div className="team-work">
        <span>Now</span>
        {team.work.length ? team.work.map((item, index) => <p key={index}>{item.member && <b style={{ color: memberTone(item.member) }}>{item.member}</b>} {item.title}{item.state ? ` · ${item.state}` : ''}</p>)
          : <p className="muted">Nothing running for this team.</p>}
      </div>
    </section>
  </div>;
}

// Owner → one member, no Bigkiji in between (owner 2026-09-30). The server files one
// Kanban card on that member's profile; the existing dispatcher runs it.
function DirectBox({ team, direct, to, onTo }: { team: Team; direct: string[]; to: string; onTo: (name: string) => void }) {
  const [text, setText] = useState('');
  const [state, setState] = useState<{ kind: 'idle' | 'sending' | 'sent' | 'error'; message?: string }>({ kind: 'idle' });
  const send = async () => {
    if (!text.trim() || state.kind === 'sending') return;
    setState({ kind: 'sending' });
    try {
      const response = await fetch('/api/agents/instruct', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ team: team.id, member: to, text }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
      setText('');
      setState({ kind: 'sent', message: `Sent to ${personaOf(to)} · card ${body.id} (${body.status})` });
    } catch (error) {
      setState({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  };
  return <div className="direct-box" style={{ '--member': memberTone(to) } as React.CSSProperties}>
    <span className="direct-label">Tell a member directly</span>
    <div className="direct-to" role="radiogroup" aria-label="Send to">
      {direct.map((name) => <button key={name} type="button" role="radio" aria-checked={to === name} className={to === name ? 'on' : ''}
        style={{ '--member': memberTone(name) } as React.CSSProperties} onClick={() => onTo(name)}>{personaOf(name)}</button>)}
    </div>
    <VoiceRow onText={(spoken, lang) => { setText((before) => joinSpoken(before, spoken, lang)); if (state.kind !== 'sending') setState({ kind: 'idle' }); }} />
    <textarea value={text} rows={3} maxLength={4000} placeholder={`What should ${personaOf(to)} do?`} aria-label={`Instruction for ${to}`}
      onChange={(event) => { setText(event.target.value); if (state.kind !== 'sending') setState({ kind: 'idle' }); }}
      onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void send(); } }} />
    <div className="direct-foot">
      <small className={`direct-state is-${state.kind}`} role="status">{state.message || (state.kind === 'sending' ? 'Sending…' : `${personaOf(to)} gets it as a Kanban card and starts within a minute. ⌘↵ sends.`)}</small>
      <button type="button" className="direct-send" disabled={!text.trim() || state.kind === 'sending'} onClick={() => void send()}><Send size={14} strokeWidth={1.8} />Send</button>
    </div>
  </div>;
}

export function MemberFrame({ member, picked = false, onPick }: { member: Member; canTalk?: boolean; picked?: boolean; onPick?: () => void }) {
  const tone = memberTone(member.name);
  const persona = personaOf(member.name);
  const body = <>
    <span className="member-badge">{persona.slice(0, 1)}</span>
    <div>
      <strong>{persona}{persona.replace(/\s/g, '') !== member.name && <em className="member-id">{member.name}</em>}</strong>
      {member.model && <span className="member-model"><Cpu size={10} strokeWidth={2} />{member.model}</span>}
      <small>{member.role}</small>
    </div>
    {member.live && <span className="team-live"><i />LIVE</span>}
  </>;
  if (onPick) return <button type="button" className={`member-frame can-talk ${member.live ? 'live' : ''} ${picked ? 'picked' : ''}`} style={{ '--member': tone } as React.CSSProperties} aria-pressed={picked} title={`What does ${persona} do?`} onClick={onPick}>{body}</button>;
  return <div className={`member-frame ${member.live ? 'live' : ''}`} style={{ '--member': tone } as React.CSSProperties}>{body}</div>;
}

// "What does this agent do?" card (owner 2026-09-30). Text from agentRoster.ts; model live
// from the configs. Shared by the team sheet and the orchestration diagram.
export function AgentInfo({ name, model, role, live, onClose, onInstruct }: { name: string; model?: string | null; role?: string; live?: boolean; onClose: () => void; onInstruct?: () => void }) {
  const entry = ROSTER[name];
  const tone = memberTone(name);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return createPortal(<div className="agent-info-backdrop" onClick={onClose}>
    <section className="agent-info" role="dialog" aria-modal="true" aria-label={`About ${entry?.persona || name}`} style={{ '--member': tone } as React.CSSProperties} onClick={(event) => event.stopPropagation()}>
      <header>
        <span className="member-badge">{(entry?.persona || name).slice(0, 1)}</span>
        <div>
          <h4>{entry?.persona || name}{live && <span className="team-live"><i />LIVE</span>}</h4>
          <p>{entry && entry.persona !== name ? `${name} · ` : ''}{entry?.field || role}</p>
        </div>
        <button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={15} /></button>
      </header>
      <dl>
        <dt>Model</dt><dd>{model || 'Not measured'}</dd>
        <dt>What it does</dt><dd>{entry?.does || role || 'No description yet.'}</dd>
        {entry?.gives && <><dt>What you get</dt><dd>{entry.gives}</dd></>}
        {entry?.instruct && <><dt>How to reach it</dt><dd>{entry.instruct}</dd></>}
      </dl>
      {onInstruct && <button type="button" className="direct-send agent-info-go" onClick={onInstruct}><Send size={14} strokeWidth={1.8} />Give {entry?.persona || name} an instruction</button>}
    </section>
  </div>, document.body);
}
