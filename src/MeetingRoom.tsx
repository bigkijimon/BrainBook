// Meeting room (owner 2026-09-30): Bigkiji hosts a brainstorm with the group-top agents and every
// line shown is that agent's real reply (see meeting.mjs). The owner writes a topic, picks who
// joins, and watches the conversation arrive turn by turn. Absent agents show the measured reason.
// Merge (owner 2026-10-02): embed renders this content inside AgentChatPanel's shared card shell,
// and onLiveChange reports the running meeting up so the panel can switch its own header/body.
// This poll stays the single source of "is a meeting running" — the panel deliberately does not
// fetch /api/meetings itself.
import { themePalette } from './theme-palette.mjs';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, Loader2, Play, Users } from 'lucide-react';
import { memberTone } from './TeamRail';
import { messageSummary, resultLinks, displayTitle } from './owner-console.mjs';

type Line = { kind: 'say' | 'absent'; who: string; text: string; at: number; seconds?: number };
type Summary = { theme: string; decision: string; actions: string; ideas: string; raw: string | null; rawFallback: boolean; isError: boolean };
type Meeting = { id: string; topic: string; members: string[]; status: 'running' | 'done' | 'failed'; startedAt: number; endedAt: number | null; speaking: string | null; lines: Line[]; error?: string; summary?: Summary };
type Attendee = { persona: string; group: string; member: boolean };

// A long decision clamps to ~4 lines; "Full text" reveals the rest. ~110 chars is roughly 4 lines
// at the summary card's width, so shorter text never shows a toggle with nothing to expand.
const CLAMP_THRESHOLD = 110;

function SummaryCard({ summary }: { summary: Summary }) {
  const [expanded, setExpanded] = useState(false);
  const resultLabel = summary.isError ? 'Result (error)' : summary.rawFallback ? 'Result (original replies)' : 'Result (original report)';
  const canExpand = summary.decision.length > CLAMP_THRESHOLD;
  return <dl className="meeting-summary">
    <div className="meeting-summary-row">
      <dt>{resultLabel}</dt>
      <dd>
        <p className={`meeting-summary-decision ${expanded ? 'is-expanded' : ''} ${summary.isError ? 'is-error' : ''}`}>{summary.isError ? messageSummary(summary.decision) : summary.decision}</p>
        {canExpand && <button type="button" className="meeting-summary-more" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>{expanded ? 'Close' : 'Full text'}</button>}
      </dd>
    </div>
    {!summary.isError && !summary.rawFallback && summary.actions && <div className="meeting-summary-row">
      <dt>Next actions (original report)</dt>
      <dd><p className="meeting-summary-actions">{summary.actions}</p></dd>
    </div>}
  </dl>;
}

const when = (seconds: number) => new Intl.DateTimeFormat('en-GB', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(seconds * 1000));
const HOST_TONE = themePalette.pink;

export function MeetingRoom({ remote, embed = false, onLiveChange }: { remote: boolean; embed?: boolean; onLiveChange?: (live: { id: string; topic: string } | null) => void }) {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [attendees, setAttendees] = useState<Record<string, Attendee>>({});
  const [topic, setTopic] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const [all, setAll] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/meetings', { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json() as { meetings: Meeting[]; attendees: Record<string, Attendee> };
      setMeetings(data.meetings);
      setAttendees((current) => {
        if (!Object.keys(current).length) setPicked(new Set(Object.entries(data.attendees).filter(([, who]) => who.member).map(([name]) => name)));
        return data.attendees;
      });
    } catch { /* keep last */ }
  }, []);
  const live = meetings.find((meeting) => meeting.status === 'running');
  useEffect(() => { void load(); const timer = window.setInterval(load, live ? 3000 : 20000); return () => window.clearInterval(timer); }, [load, Boolean(live)]);
  // Tell AgentChatPanel which mode to show. Dedupe by value before reporting: a fresh {id, topic}
  // object into the panel's setState re-renders it, and if the callback were also unstable that
  // would loop. AgentChatPanel now passes a useCallback, so the deps below only change when the
  // running meeting itself does - this ref is the backstop that keeps that true.
  const reportedLive = useRef<string | undefined>(undefined);
  useEffect(() => {
    const key = live ? `${live.id} ${live.topic}` : '';
    if (reportedLive.current === key) return;
    reportedLive.current = key;
    onLiveChange?.(live ? { id: live.id, topic: live.topic } : null);
  }, [live?.id, live?.topic, onLiveChange]);

  const start = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!topic.trim() || starting) return;
    setStarting(true); setError('');
    try {
      const response = await fetch('/api/meetings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic, members: [...picked] }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      setTopic(''); setOpenId(data.meeting.id); void load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setStarting(false); }
  };

  const nameOf = (who: string) => attendees[who]?.persona || who;
  const toneOf = (who: string) => (who === 'Bigkiji' ? HOST_TONE : memberTone(who));
  const current = openId ?? live?.id ?? null;
  const members = Object.entries(attendees).filter(([, who]) => who.member);

  // embed + running: AgentChatPanel's own header already reads "Meeting: <topic>", so this
  // section label and the now fully-disabled start form would only repeat it — both drop out
  // there. Idle embed and standalone rendering keep them exactly as before.
  const showIntro = !embed || !live;
  const content = <>
    {showIntro && <header className="meeting-head">
      <h3 id="meeting-heading"><Users size={16} strokeWidth={1.8} /> Meeting</h3>
      <small>Bigkiji hosts. Check recorded replies and results.</small>
    </header>}

    {!remote && showIntro && <details className="compose-fold"><summary>Start a meeting</summary><form className="meeting-form" onSubmit={start}>
      <textarea rows={2} value={topic} maxLength={600} disabled={Boolean(live)} aria-label="Meeting topic"
        placeholder={live ? 'A meeting is in progress…' : 'Enter a topic'} onChange={(event) => setTopic(event.target.value)} />
      <div className="meeting-invite" role="group" aria-label="Who joins">
        <span className="meeting-chip is-host" style={{ ['--agent' as string]: HOST_TONE }}>🎙️ Bigkiji <small>host</small></span>
        {members.map(([name, who]) => <label key={name} className={`meeting-chip ${picked.has(name) ? 'on' : ''}`} style={{ ['--agent' as string]: toneOf(name) }}>
          <input type="checkbox" checked={picked.has(name)} disabled={Boolean(live)} onChange={() => setPicked((set) => { const next = new Set(set); if (next.has(name)) next.delete(name); else next.add(name); return next; })} />
          {who.persona} <small>{who.group}</small>
        </label>)}
      </div>
      <div className="meeting-foot">
        <small>{live ? `Running since ${when(live.startedAt)}.` : 'Bigkiji sums up after two rounds.'}</small>
        <button className="submit-button" type="submit" disabled={!topic.trim() || !picked.size || starting || Boolean(live)}>{starting ? <Loader2 size={14} className="spin" /> : <Play size={14} />}Start meeting</button>
      </div>
      {error && <p className="capture-error" role="alert">{error}</p>}
    </form></details>}

    <details className="meeting-history" open={Boolean(live) || undefined}><summary>Meeting history ({meetings.length})</summary><ol className="meeting-list">
      {meetings.slice(0,all?undefined:3).map((meeting) => {
        const expanded = current === meeting.id;
        const said = meeting.lines.filter((line) => line.kind === 'say').length;
        return <li key={meeting.id} className={`meeting-item is-${meeting.status}`}>
          <button type="button" className="meeting-row" aria-expanded={expanded} onClick={() => setOpenId(expanded ? '' : meeting.id)}>
            <span className="meeting-main">
              <b>{displayTitle(meeting.status !== 'running' && meeting.summary ? meeting.summary.theme : meeting.topic,60)}</b>
              <small>{meeting.status === 'running' ? <em className="chat-state is-moving">In progress</em> : meeting.status === 'done' ? <em className="chat-state is-done">Done</em> : <em className="chat-state is-stopped">Stopped</em>} {when(meeting.startedAt)} · {said} replies · {['Bigkiji', ...meeting.members].map(nameOf).join(', ')}</small>
            </span>
            <ChevronDown size={16} className="chat-chevron" />
          </button>
          {expanded && meeting.status !== 'running' && meeting.summary && <><SummaryCard summary={meeting.summary} />{resultLinks(meeting.summary.decision).map(url=><a key={url} href={url} target="_blank" rel="noreferrer">Open result</a>)}<details><summary>Original result and source</summary><p className="source-text">{meeting.summary.raw || meeting.summary.decision}</p><small>{meeting.id}</small></details></>}
          {expanded && <details><summary>Original topic</summary><p className="meeting-full-topic">{meeting.topic}</p></details>}
          {expanded && <ol className="chat-messages meeting-lines" ref={(node) => { if (node && meeting.status === 'running') node.scrollTop = node.scrollHeight; }}>
            {meeting.lines.map((line, index) => line.kind === 'absent'
              ? <li key={index} className="meeting-absent">🚪 {nameOf(line.who)} could not join: {messageSummary(line.text)}<details><summary>Original</summary><p>{line.text}</p></details></li>
              : <li key={index} className={`chat-message ${line.who === 'Bigkiji' ? 'is-host' : ''}`} style={{ ['--agent' as string]: toneOf(line.who) }}>
                <i className="chat-avatar" aria-hidden="true">{nameOf(line.who).slice(0, 1)}</i>
                <div className="chat-bubble">
                  <header><b>{nameOf(line.who)}</b><span>{line.who === 'Bigkiji' ? 'host' : attendees[line.who]?.group}</span>{line.seconds !== undefined && <time>{line.seconds}s</time>}</header>
                  <p className="meeting-text">Original reply: {line.text}</p><time>{when(line.at)}</time>
                </div>
              </li>)}
            {meeting.speaking && <li className="meeting-typing" style={{ ['--agent' as string]: toneOf(meeting.speaking) }}><Loader2 size={13} className="spin" /> {nameOf(meeting.speaking)} is thinking…</li>}
            {meeting.error && <li className="meeting-absent">❌ {meeting.error}</li>}
          </ol>}
        </li>;
      })}
    </ol>{meetings.length>3 && <button className="console-more" type="button" aria-expanded={all} onClick={()=>setAll(v=>!v)}>{all?'Show less':'Show all meetings'}</button>}</details>
  </>;

  if (embed) return <div className="meeting-embed">{content}</div>;
  return <section className="meeting card-shell" aria-labelledby="meeting-heading">{content}</section>;
}
