// Left menu: specialist teams (owner 2026-09-29). Each team opens into its
// hierarchy — Bigkiji routes, Pi supports, MiMo/Space Bunny build, Claude Code
// checks, Jev advises — and every member wears its own coloured frame. A member
// that is working right now pulses LIVE. Data: /api/agents/teams (read-only, 8 s).
import { themePalette } from './theme-palette.mjs';
import { TeamMark } from './TeamMark';
import { markFor } from './team-marks.mjs';
import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Boxes, CircleAlert, Calculator, Clapperboard, Car, Cpu, GraduationCap, LineChart, Megaphone, Send, Target, Users, X } from 'lucide-react';
import { ROSTER, personaOf } from './agentRoster';
import { VoiceRow } from './VoiceInput';
import { joinSpoken } from './voice';

// InvestPro only (owner 2026-10-04): the Evolution Arena view loads when its tab is first shown.
const InvestProEvolution = lazy(() => import('./InvestProEvolution'));

type Member = { name: string; role: string; live: boolean; parent?: string | null; model?: string | null; description?: string };
type WorkItem = { title: string; member?: string | null; state?: string };
type Team = { id: string; name: string; label: string; live: boolean; members: Member[]; specialists: string[]; work: WorkItem[]; direct?: string[]; workflow?: string; workflow_note?: string };


// Fixed member colours so a name always looks the same everywhere in BrainBook
// (team sheet, agent feed frames, AgentFlow). Any name outside this roster
// (old Hermes profiles) falls back to a stable hash-picked tone.
const MEMBER_TONE: Record<string, string> = {
  You: themePalette.text, Bigkiji: themePalette.pink, Pi: themePalette.coral, MiMo: themePalette.lavender, 'Space Bunny': themePalette.lilac, 'Claude Code': themePalette.coral,
  Jev: themePalette.peach, 'Qwen (local)': themePalette.lavender, Vision: themePalette.peach, Router: themePalette.lilac, ComfyUI: themePalette.lilac,
  // MoviePro
  Steve: themePalette.coral, HideoKojima: themePalette.lilac, 'RyūichiSakamoto': themePalette.peach, Kuro: themePalette.coral, Shimajiro: themePalette.peach,
  Ame: themePalette.lavender, Maru: '#ffb4a2', 'Auto QA': themePalette.lavender,
  // CreativePro (owner 2026-10-17: BlogPro renamed, MarketPro merged in as the Marketing team)
  'CreativeProTop-Momo': themePalette.pink, 'MarketProTop-Yui': themePalette.lilac, Sora: themePalette.pink,
};
// None of these may repeat a MEMBER_TONE value, or an outer-ring legacy profile
// could land on the exact colour of a real roster member (e.g. MiMo or Pi).
const FALLBACK_TONES = [themePalette.lilac, themePalette.peach, themePalette.peach, themePalette.lavender, themePalette.coral, themePalette.peach, themePalette.pink, themePalette.lilac];
const hashTone = (name: string) => FALLBACK_TONES[[...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % FALLBACK_TONES.length];
// One stable hue per department (team-marks.mjs owns it) so the rail reads as nine colours, not one.
export const teamTone = (id: string) => themePalette[markFor(id).tone as keyof typeof themePalette] || '#b69bc4';
export const memberTone = (name: string) => MEMBER_TONE[name] || hashTone(name);

// Everything a member card has to leave out to stay small enough for fifteen cards on one screen, in
// one sentence: who it reports to, the model it runs, and what it does. This is what the card's
// `aria-describedby` note carries, so the clamped lines are never recoverable only with a mouse hover
// (web-design-guidelines: truncated text stays reachable; better-typography: a clamp needs a way back).
const memberDetail = (member: Member, reportsTo?: string) => {
  const chain = reportsTo ? `${personaOf(member.name)} reports to ${personaOf(reportsTo)}. ` : '';
  return `${chain}${member.model ? `${member.model}. ` : ''}${member.role}`;
};

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

export function TeamRail({ teams, allCount, onAll, allActive, selectedTeam=null, onSelect }: { teams: Team[]; allCount: number; onAll: () => void; allActive: boolean; selectedTeam?:string|null; onSelect?:(id:string)=>void }) {
  const [open, setOpen] = useState<string | null>(null);
  const team = teams.find((entry) => entry.id === open) || null;
  return <>
    {/* Owner 2026-10-13 ("ごちゃごちゃ"/clutter pass): this used LayoutGrid, the exact same icon as
        the sidebar's unrelated "Office" page link (App.tsx), so the two looked like duplicate
        buttons pointing at the same place even though one filters the rail and the other opens the
        3D office page. Users (people) reads as "everyone" without colliding with Office's icon. */}
    <button type="button" className={`area-item area-all ${allActive ? 'active' : ''}`} aria-pressed={allActive} aria-label="All teams" data-nav-label={`All teams · ${allCount} records`} title="All teams" onClick={() => { setOpen(null); onAll(); }}>
      <Users size={26} strokeWidth={1.8} aria-hidden="true"/><span className="sr-only">All · {allCount}</span>
    </button>
    {teams.map((entry) => {

      const liveCount = entry.members.filter((member) => member.live).length;
      // "idle" only describes who is running. Work that stopped and waits on the owner is a separate
      // fact the rail used to hide (a team with nothing running read as fine while 5 cards waited).
      const needs = entry.work.filter((item) => item.state === 'needs you' || item.state === 'failed').length;
      return <button type="button" key={entry.id} className={`area-item team-item ${needs > 0 ? 'has-need' : ''} ${entry.live ? 'is-live' : ''} ${selectedTeam === entry.id ? 'active' : ''}`}
        style={{ '--tone': teamTone(entry.id) } as React.CSSProperties}
        // `data-team` is the id the server sent (agent-feed.py `teams()`), and it is the only handle that
        // ties a rail card to the team it came from. Without it, "every team is measured" can only be
        // checked against a hand-written list in the test, which is how four of the eight cards the
        // server emits went unmeasured while every viewport check still printed ok.
        data-team={entry.id} aria-label={entry.name} aria-describedby={`team-nav-meta-${entry.id}`} data-nav-label={`${entry.name} · ${entry.live?`${liveCount} active`:'idle'}${needs?` · ${needs} need attention`:''}`}
        aria-pressed={selectedTeam === entry.id} aria-haspopup="dialog" aria-expanded={open===entry.id} title={needs > 0 ? `${entry.label} - ${needs} need you` : entry.label} onClick={() => { if(onSelect)onSelect(entry.id); setOpen(entry.id); }}>
        <TeamMark id={entry.id}/><span className="sr-only">{entry.name}</span>
        <span className="team-status sr-only" id={`team-nav-meta-${entry.id}`}>
          {entry.live ? <b className="team-live"><i />LIVE{liveCount > 1 ? ` ${liveCount}` : ''}</b> : <b className="team-idle">idle</b>}
          {needs > 0 && <b className="team-need" role="img" aria-label={`${needs} ${needs === 1 ? 'task needs' : 'tasks need'} you`}><CircleAlert size={10} strokeWidth={2.6} aria-hidden="true" />{needs}</b>}
        </span>
      </button>;
    })}
    {team && createPortal(<TeamSheet team={team} onClose={() => setOpen(null)} />, document.body)}
  </>;
}

// The elements Tab can actually stop on inside either dialog this module opens. `tabindex="-1"` is a
// programmatic focus target and not a tab stop, so the dialog itself is left out here - and so are the
// two roving groups that carry one: the tab strip and the recipient chips each keep a single stop
// whether the dialog traps focus or not. Both dialogs read the same list, each scoped to its own
// element: `aria-modal="true"` is a claim about focus, and a trap that read the wrong element's stops
// would break the claim on the card that is actually open (see `AgentInfo`'s own handler).
const TAB_STOPS = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function TeamSheet({ team, onClose }: { team: Team; onClose: () => void }) {
  const direct = team.direct || [];
  const [to, setTo] = useState<string | null>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  // The dialog takes focus when it opens and hands it back when it closes, without scrolling the window
  // behind it either way (fixing-accessibility: initial focus inside a dialog, restore focus to the
  // trigger on close). It took focus on open but dropped it on close, which left a keyboard user at the
  // top of the document with the rail still on screen and no way back to the team they were reading.
  const sheet = useRef<HTMLElement>(null);
  const opener = useRef<Element | null>(null);
  useEffect(() => {
    opener.current = document.activeElement;
    sheet.current?.focus({ preventScroll: true });
    return () => { if (opener.current instanceof HTMLElement) opener.current.focus({ preventScroll: true }); };
  }, []);
  // A modal dialog keeps Tab inside itself (fixing-accessibility: modals must trap focus while open).
  // Without this the popup was a way into the app behind it: Tab walked past the last control and the
  // owner was reading the task list with a team sheet still open. Only the two edges are handled here -
  // Tab on the last stop, Shift+Tab on the first, each wrapping to the other end - because everything
  // between them is the browser's own order, which is what keeps the two roving groups (tab strip,
  // recipient chips) entering where they say they do. The listener is on the dialog and not on the
  // window so the "what does this agent do?" card above it, which is its own modal, keeps focus while
  // it is open. `preventScroll` on the wrap is the dialog's own: the crew grid is what scrolls, and
  // Tabbing to a member should bring it into that grid rather than move the window.
  const onTrapTab = (event: React.KeyboardEvent) => {
    const dialog = sheet.current;
    if (event.key !== 'Tab' || !dialog) return;
    const stops = [...dialog.querySelectorAll<HTMLElement>(TAB_STOPS)];
    const first = stops[0];
    const last = stops[stops.length - 1];
    if (!first || !last || first === last) return;
    const active = document.activeElement;
    // Focus outside the dialog (it was clicked away, or it was never inside): pull it back to the
    // first control rather than letting the next Tab continue from wherever it is.
    if (!(active instanceof HTMLElement) || !dialog.contains(active)) { event.preventDefault(); first.focus(); return; }
    if (event.shiftKey ? active === first : active === last) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus({ preventScroll: true });
    }
  };
  const [info, setInfo] = useState<Member | null>(null);
  // Real hierarchy (owner 2026-09-30): each member sits under the one it reports to
  // (agent-feed.py TEAM_PARENT / MOVIE_PARENT); a member whose parent is not in this
  // team is placed under the lead so nobody floats loose.
  const names = new Set(team.members.map((member) => member.name));
  const roots = team.members.filter((member) => !member.parent || !names.has(member.parent));
  const [lead] = roots;
  const parentOf = (member: Member) => (member.parent && names.has(member.parent) ? member.parent : member === lead ? null : lead?.name);
  // Ids the description note beside each card, from the team and the row: `useId` cannot be called in a
  // loop, and a member's name is not a usable id on its own ("QA / Debug" is not one id).
  const noteId = (index: number, member: Member) => `member-detail-${team.id}-${member.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${index}`;
  // The ring on a card is the composer, not a toggle: it marks the member the "tell a member directly"
  // box is aimed at, and it stays while that member's info card is open. That selection belongs to the
  // recipient radiogroup in the side column, which is where it is announced. The card itself opens a
  // dialog, so it is a disclosure trigger carrying `aria-haspopup` and nothing else - `aria-pressed`
  // on it read out a state the button never changes, and a state it cannot change is worse than saying
  // nothing at all (fixing-accessibility: a role has to behave like the role; web-design-guidelines:
  // expandable controls use aria-expanded/aria-controls, never aria-pressed).
  const frame = (member: Member, describedBy: string) => <MemberFrame member={member} describedBy={describedBy}
    picked={to === member.name || info?.name === member.name} onPick={() => setInfo(member)} />;
  // One screen, no scrolling (owner 2026-10-05): the chain is walked depth-first into a flat list
  // so the crew can sit in a four-column grid instead of one tall vertical tree (a nested list can
  // only ever be one card wide, which is what pushed MoviePro to roughly 2000px). Depth survives as an
  // indent, so "who reports to whom" still reads, and every member — the lead included — is one cell
  // of the same grid: the lead used to take a full-width row of its own, which cost the crew a row and
  // made a four-member team two rows tall (see `.team-cell` in styles.css).
  // The depth itself is not capped here, only the indent it draws: `--depth` is the true depth, so
  // `parentOf`, the description note and "Reports to" in the info card are all exact, while
  // styles.css caps the pixels at two levels so a longer chain cannot spend the card's text column.
  // `walked` stops a parent loop dead, and anyone the walk still misses (no root at all) is appended
  // rather than dropped: the owner decision is that every member stays visible whatever the roster says.
  const rows: { member: Member; depth: number; isLead: boolean }[] = [];
  const walked = new Set<string>();
  const walk = (member: Member, depth: number) => {
    rows.push({ member, depth, isLead: member === lead });
    walked.add(member.name);
    for (const kid of team.members) if (kid !== lead && !walked.has(kid.name) && parentOf(kid) === member.name) walk(kid, depth + 1);
  };
  if (lead) walk(lead, 0);
  for (const member of team.members) if (!walked.has(member.name)) rows.push({ member, depth: lead ? 1 : 0, isLead: !lead && rows.length === 0 });
  const hasEvolution = team.id === 'investment';
  const [tab, setTab] = useState<'team' | 'evolution'>('team');
  const tabs = useRef<Record<string, HTMLButtonElement | null>>({});
  const onTabKey = (event: React.KeyboardEvent) => {
    const order = ['team', 'evolution'] as const;
    const at = order.indexOf(tab);
    // Left steps backwards and Right forwards. The two directions used to share one expression,
    // which looked right only because there are exactly two tabs; a third tab would have made
    // ArrowLeft walk forwards (fixing-accessibility: a role has to behave like the role, so the
    // step is a signed index into `order` rather than a case that happens to agree).
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    const next = step ? order[(at + step + order.length) % order.length]
      : event.key === 'Home' ? order[0]
      : event.key === 'End' ? order[order.length - 1]
      : null;
    if (!next) return;
    event.preventDefault();
    setTab(next);
    tabs.current[next]?.focus();
  };
  const wide = hasEvolution && tab === 'evolution';
  return <div className="team-sheet-backdrop" onClick={onClose}>
    <section ref={sheet} tabIndex={-1} className={`team-sheet${wide ? ' team-sheet--wide' : ''}`} role="dialog" aria-modal="true" aria-label={`${team.name} team`} onKeyDown={onTrapTab} onClick={(event) => event.stopPropagation()}>
      <header>
        <div><p className="eyebrow">{team.label.toUpperCase()}</p><h3>{team.name}{team.live && <span className="team-live big"><i />LIVE</span>}</h3></div>
        <button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={16} /></button>
      </header>
      {hasEvolution && <div className="team-tabs" role="tablist" aria-label={`${team.name} views`} onKeyDown={onTabKey}>
        {(['team', 'evolution'] as const).map((id) => <button key={id} type="button" role="tab" id={`team-tab-${id}`} aria-selected={tab === id} aria-controls="team-tabpanel" tabIndex={tab === id ? 0 : -1}
          ref={(node) => { tabs.current[id] = node; }} onClick={() => setTab(id)}>{id === 'team' ? 'Team' : 'EVOLUTION'}</button>)}
      </div>}
      <div id="team-tabpanel" className="team-tabpanel" role={hasEvolution ? 'tabpanel' : undefined} aria-labelledby={hasEvolution ? `team-tab-${tab}` : undefined}>
      {wide ? <Suspense fallback={<p className="team-hint" role="status">Loading the arena…</p>}><InvestProEvolution /></Suspense> : <>
      {/* One screen, no scrolling (owner 2026-10-05). The arrow chain and the caveat that qualifies it
          are a fixed band above the pane rather than part of the crew list, so neither can ever scroll
          out of reach: everything that gives height back happens inside the pane below. */}
      {(team.workflow || team.workflow_note) && <div className="team-brief">
        {team.workflow && <p className="team-chain">{team.workflow}</p>}
        {team.workflow_note && <p className="team-hint">{team.workflow_note}</p>}
      </div>}
      <div className="team-pane">
      <div className="team-roster">
        {/* The count and the instruction both talk about the grid below, so they share one meta line
            rather than two rows separated by the whole crew: the label stays attached to what it
            counts, and the crew column gives the height back to the grid. */}
        <p className="team-pane-label"><span>Members</span><b>{team.members.length}</b><span className="team-pane-note">Select anyone to see what they do.</span></p>
        {/* `role="list"` is not decoration: `styles.css` removes this list's markers, and a list whose
            markers are removed loses its implicit list role in Safari and VoiceOver, so a screen reader
            would hear the crew as a dozen unrelated items instead of the list it is (fixing-accessibility:
            semantics first, and never trade them for a style). The aria-label keeps "in reporting order",
            which is what the depth-first walk above puts in the DOM. */}
        <ol className="team-tree team-grid" role="list" aria-label={`Members of ${team.name}, in reporting order`}>
          {/* The note is a sibling of the card, not inside it: `aria-describedby` then reads it as a
              description instead of folding it into the card's own name, and the crew grid keeps
              exactly one element per cell so nothing can be painted over anything else. */}
          {rows.map(({ member, depth, isLead }, index) => {
            const id = noteId(index, member);
            return <li key={member.name} className={`team-cell${isLead ? ' is-lead' : ''}${depth > 0 ? ' has-parent' : ''}`} style={{ '--depth': depth } as React.CSSProperties}>
              {frame(member, id)}
              <span className="sr-only" id={id}>{memberDetail(member, parentOf(member) || undefined)}</span>
            </li>;
          })}
        </ol>
        {/* Role files sit with the crew, not in the side column: they describe the same structure, and
            the crew column is the wide one, so the server's sixteen-chip ceiling (agent-feed.py `roles[:16]`)
            stays a two- or three-line strip instead of a tall column of pills. */}
        {team.specialists.length > 0 && <div className="team-roles"><span>Role files</span>{team.specialists.map((role, index) => <em key={`${role}-${index}`}>{role}</em>)}</div>}
      </div>
      <div className="team-side">
        {direct.length > 0 && <DirectBox team={team} direct={direct} to={to || direct[0]} onTo={setTo} />}
        {/* "Now" is the one list allowed to scroll: the message box above it is the control the owner
            must always be able to reach, so it is pinned and this list gives height back instead. */}
        <div className="team-work">
          <span>Now</span>
          {team.work.length ? team.work.map((item, index) => <p key={index}>{item.member && <b style={{ color: memberTone(item.member) }}>{item.member}</b>} {item.title}{item.state ? ` · ${item.state}` : ''}</p>)
            : <p className="muted">Nothing running for this team.</p>}
        </div>
      </div>
      {info && <AgentInfo name={info.name} model={info.model} description={info.description} role={info.role} reportsTo={parentOf(info) || undefined} live={info.live} onClose={() => setInfo(null)}
        onInstruct={direct.includes(info.name) ? () => { setTo(info.name); setInfo(null); } : undefined} />}
      </div>
      </>}
      </div>
    </section>
  </div>;
}

// Owner → one member, no Bigkiji in between (owner 2026-09-30). The server files one
// Kanban card on that member's profile; the existing dispatcher runs it.
function DirectBox({ team, direct, to, onTo }: { team: Team; direct: string[]; to: string; onTo: (name: string) => void }) {
  const [text, setText] = useState('');
  const [state, setState] = useState<{ kind: 'idle' | 'sending' | 'sent' | 'error'; message?: string }>({ kind: 'idle' });
  // `role="radiogroup"` (fixing-accessibility: a role has to behave like the role). Arrow keys move
  // the selection and wrap, Home/End jump to the ends, and Tab reaches the group once because the
  // roving tabindex keeps only the checked chip at tabIndex 0. Without this the chips were a set of
  // buttons that Tab walked through one at a time and no arrow key touched.
  const radios = useRef<Record<string, HTMLButtonElement | null>>({});
  const onRecipientKey = (event: React.KeyboardEvent) => {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    const from = Math.max(0, direct.indexOf(to));
    const next = step ? direct[(from + step + direct.length) % direct.length]
      : event.key === 'Home' ? direct[0]
      : event.key === 'End' ? direct[direct.length - 1]
      : null;
    if (!next) return;
    event.preventDefault();
    onTo(next);
    radios.current[next]?.focus();
  };
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
    <div className="direct-to" role="radiogroup" aria-label="Send to" onKeyDown={onRecipientKey}>
      {direct.map((name) => <button key={name} type="button" role="radio" aria-checked={to === name} tabIndex={to === name ? 0 : -1}
        ref={(node) => { radios.current[name] = node; }} data-member={name} className={to === name ? 'on' : ''}
        style={{ '--member': memberTone(name) } as React.CSSProperties} onClick={() => onTo(name)}>{personaOf(name)}</button>)}
    </div>
    <VoiceRow onText={(spoken, lang) => { setText((before) => joinSpoken(before, spoken, lang)); if (state.kind !== 'sending') setState({ kind: 'idle' }); }} />
    <textarea value={text} rows={3} maxLength={4000} placeholder={`What should ${personaOf(to)} do?`} aria-label={`Instruction for ${to}`}
      onChange={(event) => { setText(event.target.value); if (state.kind !== 'sending') setState({ kind: 'idle' }); }}
      onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void send(); } }} />
    <div className="direct-foot">
      <small className={`direct-state is-${state.kind}`} role="status">{state.message || (state.kind === 'sending' ? 'Sending…' : (team.workflow || team.workflow_note ? "Queued work starts after the execution gates pass. ⌘↵ sends." : `${personaOf(to)} gets it as a Kanban card and starts within a minute. ⌘↵ sends.`))}</small>
      <button type="button" className="direct-send" disabled={!text.trim() || state.kind === 'sending'} onClick={() => void send()}><Send size={14} strokeWidth={1.8} />Send</button>
    </div>
  </div>;
}

export function MemberFrame({ member, picked = false, describedBy, onPick }: { member: Member; canTalk?: boolean; picked?: boolean; describedBy?: string; onPick?: () => void }) {
  const tone = memberTone(member.name);
  const persona = personaOf(member.name);
  // The crew is a grid now, so the indent on the cell is the only thing that says who reports to whom,
  // and the card itself carries no chain at all. Fifteen members have to fit one screen, so the model
  // line and the role line are capped here. What is cut used to ride a `title`, which is a mouse-only
  // channel: touch has no hover to wait for and a screen reader never reads it. The caller therefore
  // points `describedBy` at a note beside the card that carries the whole sentence — reporting line,
  // model, role (see `memberDetail`) — so the words arrive on focus with no hover and no tap, and the
  // same words are in the "what does this agent do?" card this card opens (web-design-guidelines:
  // truncated text stays reachable; better-typography: a clamp needs a way back).
  const body = <>
    <span className="member-badge">{persona.slice(0, 1)}</span>
    <div>
      {/* The persona is an element of its own because a persona is one unbreakable word
          ("RyūichiSakamoto", "APPTeamTop", "Shimajiro"). As bare text inside this flex row it became an
          *anonymous* flex item, which no rule can give `min-width: 0` or `overflow-wrap`, so its
          min-content width was the whole name: on the 150px phone track it painted over the card edge
          and under its neighbour, and the `title` this card used to lean on is gone. A real element may
          shrink and break instead (better-typography: `overflow-wrap` where a long word could escape its
          container; web-design-guidelines: nothing spills out of the control it belongs to). */}
      <strong><span className="member-name">{persona}</span>{persona.replace(/\s/g, '') !== member.name && <em className="member-id">{member.name}</em>}</strong>
      {/* Name, then role, then model — and that is the whole of the card's reading order changed by this
          round. The model line used to sit between them, so the type went 13px name, 10.5px model, 11.5px
          role: a scale that descended and then climbed again, and the one line that answers the question
          the popup exists to answer ("what does this member do?") was the last thing in the card and
          smaller than the id it followed. This card is a roster, not a spec sheet, and the model is the
          line a reader falls back to *after* the name and the job (the review's own question: the name is
          the first line, and everything else can move). Both lines are still here, in the same three rows
          and the same card height, so the fifteen-member fit is untouched — only the order is. */}
      <small>{member.role}</small>
      {member.model && <span className="member-model"><Cpu size={10} strokeWidth={2} /><span className="member-model-text">{member.model}</span></span>}
    </div>
    {member.live && <span className="team-live"><i />LIVE</span>}
  </>;
  if (onPick) return <button type="button" className={`member-frame can-talk ${member.live ? 'live' : ''} ${picked ? 'picked' : ''}`} style={{ '--member': tone } as React.CSSProperties}
    aria-haspopup="dialog" aria-describedby={describedBy} onClick={onPick}>{body}</button>;
  return <div className={`member-frame ${member.live ? 'live' : ''}`} style={{ '--member': tone } as React.CSSProperties}>{body}</div>;
}

// "What does this agent do?" card (owner 2026-09-30). Text from agentRoster.ts; model live
// from the configs. Shared by the team sheet and the orchestration diagram.
export function AgentInfo({ name, model, description, role, reportsTo, live, onClose, onInstruct }: { name: string; model?: string | null; description?: string; role?: string; reportsTo?: string; live?: boolean; onClose: () => void; onInstruct?: () => void }) {
  const entry = ROSTER[name];
  const tone = memberTone(name);
  // The crew card clamps its role line to two lines, so the sentence it cuts has to be recoverable
  // somewhere a finger can reach, and `role` - the exact line the server sent for this member - is not
  // what the header or "What it does" print: those are the roster's `field` and `does`. So the line is
  // put in full here whenever it adds a sentence the card does not already show. That is the half of
  // "truncated text stays reachable" that the screen-reader description alone cannot carry: this is
  // the tap path (web-design-guidelines: truncated text stays reachable; better-typography: a clamp
  // needs a way back). Nothing here invents text: it is the same string the card clamps.
  const printed: string[] = [entry?.field, entry?.does, entry?.gives, entry?.instruct, description]
    .filter((word): word is string => typeof word === 'string' && word.length > 0);
  const teamRole = role && !printed.includes(role) ? role : undefined;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  // This card is the reachable path to a member's full text, and it is portalled to the end of
  // <body>: without focus handling a keyboard user who opens it has to Tab through the whole app
  // before reaching it, and closing it drops them nowhere. So it takes focus on open and hands it
  // back to whatever opened it (fixing-accessibility: initial focus inside a dialog, restore focus
  // to the trigger). `preventScroll` keeps the crew grid exactly where the owner left it.
  const panel = useRef<HTMLElement>(null);
  const opener = useRef<Element | null>(null);
  useEffect(() => {
    opener.current = document.activeElement;
    panel.current?.focus({ preventScroll: true });
    return () => { if (opener.current instanceof HTMLElement) opener.current.focus({ preventScroll: true }); };
  }, []);
  // `aria-modal="true"` on this card is a claim about focus, and it used to be false twice over.
  //
  // The card itself had no containment at all: Tab from its last control walked out into the app
  // behind it with the card still open, which is exactly how a modal stops being one
  // (fixing-accessibility: modals must trap focus while open). And it could not simply inherit the
  // crew's trap, because the two are in different trees in two different senses: React routes a
  // portal's events through the React tree, not the DOM tree, so a Tab pressed here still reached
  // `TeamSheet`'s onKeyDown, while that trap reads its stop list out of the DOM with
  // `sheet.querySelectorAll` — where this portalled card is not a descendant. The trap therefore saw
  // an active element it did not contain, took that as focus having escaped, and pulled focus back
  // into the crew: Tab inside this card moved the owner *out* of the card they were reading.
  //
  // So containment lives here, on the card that is open, and the key is stopped on the way up so the
  // crew's trap cannot answer for a dialog that is no longer the one being read. The two edges are the
  // same as the crew's: Tab on the last stop and Shift+Tab on the first wrap to the other end.
  const onTrapTab = (event: React.KeyboardEvent) => {
    if (event.key !== 'Tab') return;
    event.stopPropagation();
    const dialog = panel.current;
    if (!dialog) return;
    const stops = [...dialog.querySelectorAll<HTMLElement>(TAB_STOPS)];
    const first = stops[0];
    const last = stops[stops.length - 1];
    if (!first || !last || first === last) return;
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !dialog.contains(active)) { event.preventDefault(); first.focus(); return; }
    if (event.shiftKey ? active === first : active === last) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus({ preventScroll: true });
    }
  };
  return createPortal(<div className="agent-info-backdrop" onClick={onClose}>
    <section ref={panel} tabIndex={-1} className="agent-info" role="dialog" aria-modal="true" aria-label={`About ${entry?.persona || name}`} style={{ '--member': tone } as React.CSSProperties} onClick={(event) => event.stopPropagation()} onKeyDown={onTrapTab}>
      <header>
        <span className="member-badge">{(entry?.persona || name).slice(0, 1)}</span>
        <div>
          <h4>{entry?.persona || name}{live && <span className="team-live"><i />LIVE</span>}</h4>
          <p>{entry && entry.persona !== name ? `${name} · ` : ''}{entry?.field || role}</p>
        </div>
        <button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={15} /></button>
      </header>
      <dl>
        <dt>Set model (AI engine)</dt><dd>{model || 'Not recorded'}</dd>
        {/* The reporting line the crew card only shows as an indent. It used to live in the card's
            `title` and nowhere else, so it is here now: this card is the tap path to everything the
            grid has to cut. */}
        {reportsTo && <><dt>Reports to</dt><dd>{personaOf(reportsTo)}</dd></>}
        {/* Between the reporting line and "What it does", because that is the order the crew card reads
            in: name, model, who it reports to, its job here, then the roster's longer description. */}
        {teamRole && <><dt>In this team</dt><dd>{teamRole}</dd></>}
        <dt>What it does</dt><dd>{description || entry?.does || role || 'No description yet.'}</dd>
        {entry?.gives && <><dt>What you get</dt><dd>{entry.gives}</dd></>}
        {entry?.instruct && <><dt>How to reach it</dt><dd>{entry.instruct}</dd></>}
      </dl>
      {onInstruct && <button type="button" className="direct-send agent-info-go" onClick={onInstruct}><Send size={14} strokeWidth={1.8} />Give {entry?.persona || name} an instruction</button>}
    </section>
  </div>, document.body);
}
