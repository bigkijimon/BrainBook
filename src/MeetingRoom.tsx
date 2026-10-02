// Meeting room (owner 2026-09-30): Bigkiji hosts a brainstorm with the group-top agents and every
// line shown is that agent's real reply (see meeting.mjs). The owner writes a topic, picks who
// joins, and watches the conversation arrive turn by turn. Absent agents show the measured reason.
import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, Loader2, Play, Users } from 'lucide-react';
import { memberTone } from './TeamRail';

type Line = { kind: 'say' | 'absent'; who: string; text: string; at: number; seconds?: number };
type Summary = { theme: string; decision: string; actions: string; ideas: string; raw: string | null; rawFallback: boolean; isError: boolean };
type Meeting = { id: string; topic: string; members: string[]; status: 'running' | 'done' | 'failed'; startedAt: number; endedAt: number | null; speaking: string | null; lines: Line[]; error?: string; summary?: Summary };
type Attendee = { persona: string; group: string; member: boolean };

// A long decision clamps to ~4 lines; "全文" reveals the rest. ~110 chars is roughly 4 lines
// at the summary card's width, so shorter text never shows a toggle with nothing to expand.
const CLAMP_THRESHOLD = 110;

function SummaryCard({ summary }: { summary: Summary }) {
  const [expanded, setExpanded] = useState(false);
  const resultLabel = summary.isError ? '結果（エラー）' : summary.rawFallback ? '結果（発言の全文）' : '結果';
  const canExpand = summary.decision.length > CLAMP_THRESHOLD;
  return <dl className="meeting-summary">
    <div className="meeting-summary-row">
      <dt>テーマ</dt>
      <dd>{summary.theme}</dd>
    </div>
    <div className="meeting-summary-row">
      <dt>{resultLabel}</dt>
      <dd>
        <p className={`meeting-summary-decision ${expanded ? 'is-expanded' : ''} ${summary.isError ? 'is-error' : ''}`}>{summary.decision}</p>
        {canExpand && <button type="button" className="meeting-summary-more" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>{expanded ? '閉じる' : '全文'}</button>}
      </dd>
    </div>
    {!summary.isError && !summary.rawFallback && summary.actions && <div className="meeting-summary-row">
      <dt>次のアクション</dt>
      <dd><p className="meeting-summary-actions">{summary.actions}</p></dd>
    </div>}
  </dl>;
}

const when = (seconds: number) => new Intl.DateTimeFormat('en-GB', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(seconds * 1000));
const HOST_TONE = '#ff4fa3';

export function MeetingRoom({ remote }: { remote: boolean }) {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [attendees, setAttendees] = useState<Record<string, Attendee>>({});
  const [topic, setTopic] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);

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
  const current = openId ?? meetings[0]?.id ?? null;
  const members = Object.entries(attendees).filter(([, who]) => who.member);

  return <section className="meeting card-shell" aria-labelledby="meeting-heading">
    <header className="meeting-head">
      <h3 id="meeting-heading"><Users size={16} strokeWidth={1.8} /> Meeting room</h3>
      <small>Bigkiji hosts. The group leads brainstorm on your topic. Every line is the agent’s real reply.</small>
    </header>

    {!remote && <form className="meeting-form" onSubmit={start}>
      <textarea rows={2} value={topic} maxLength={600} disabled={Boolean(live)} aria-label="Meeting topic"
        placeholder={live ? 'A meeting is in progress…' : 'Topic, e.g. “How do we sell Mr.INV to the first 10 car shops?”'} onChange={(event) => setTopic(event.target.value)} />
      <div className="meeting-invite" role="group" aria-label="Who joins">
        <span className="meeting-chip is-host" style={{ ['--agent' as string]: HOST_TONE }}>🎙️ Bigkiji <small>host</small></span>
        {members.map(([name, who]) => <label key={name} className={`meeting-chip ${picked.has(name) ? 'on' : ''}`} style={{ ['--agent' as string]: toneOf(name) }}>
          <input type="checkbox" checked={picked.has(name)} disabled={Boolean(live)} onChange={() => setPicked((set) => { const next = new Set(set); if (next.has(name)) next.delete(name); else next.add(name); return next; })} />
          {who.persona} <small>{who.group}</small>
        </label>)}
      </div>
      <div className="meeting-foot">
        <small>{live ? `Running since ${when(live.startedAt)}.` : 'Two rounds, then Bigkiji sums up. Nothing is started without you.'}</small>
        <button className="submit-button" type="submit" disabled={!topic.trim() || !picked.size || starting || Boolean(live)}>{starting ? <Loader2 size={14} className="spin" /> : <Play size={14} />}Start meeting</button>
      </div>
      {error && <p className="capture-error" role="alert">{error}</p>}
    </form>}

    <ol className="meeting-list">
      {meetings.map((meeting) => {
        const expanded = current === meeting.id;
        const said = meeting.lines.filter((line) => line.kind === 'say').length;
        return <li key={meeting.id} className={`meeting-item is-${meeting.status}`}>
          <button type="button" className="meeting-row" aria-expanded={expanded} onClick={() => setOpenId(expanded ? '' : meeting.id)}>
            <span className="meeting-main">
              <b>{meeting.status !== 'running' && meeting.summary ? meeting.summary.theme : meeting.topic}</b>
              <small>{meeting.status === 'running' ? <em className="chat-state is-moving">🟢 Live</em> : meeting.status === 'done' ? <em className="chat-state is-done">✅ Finished</em> : <em className="chat-state is-stopped">❌ Stopped</em>} {when(meeting.startedAt)} · {said} lines · {['Bigkiji', ...meeting.members].map(nameOf).join(', ')}</small>
            </span>
            <ChevronDown size={16} className="chat-chevron" />
          </button>
          {meeting.status !== 'running' && meeting.summary && <SummaryCard summary={meeting.summary} />}
          {expanded && <p className="meeting-full-topic"><b>トピック</b> {meeting.topic}</p>}
          {expanded && <ol className="chat-messages meeting-lines" ref={(node) => { if (node && meeting.status === 'running') node.scrollTop = node.scrollHeight; }}>
            {meeting.lines.map((line, index) => line.kind === 'absent'
              ? <li key={index} className="meeting-absent">🚪 {nameOf(line.who)} could not join: {line.text}</li>
              : <li key={index} className={`chat-message ${line.who === 'Bigkiji' ? 'is-host' : ''}`} style={{ ['--agent' as string]: toneOf(line.who) }}>
                <i className="chat-avatar" aria-hidden="true">{nameOf(line.who).slice(0, 1)}</i>
                <div className="chat-bubble">
                  <header><b>{nameOf(line.who)}</b><span>{line.who === 'Bigkiji' ? 'host' : attendees[line.who]?.group}</span>{line.seconds !== undefined && <time>{line.seconds}s</time>}</header>
                  <p className="meeting-text">{line.text}</p>
                </div>
              </li>)}
            {meeting.speaking && <li className="meeting-typing" style={{ ['--agent' as string]: toneOf(meeting.speaking) }}><Loader2 size={13} className="spin" /> {nameOf(meeting.speaking)} is thinking…</li>}
            {meeting.error && <li className="meeting-absent">❌ {meeting.error}</li>}
          </ol>}
        </li>;
      })}
    </ol>
  </section>;
}
