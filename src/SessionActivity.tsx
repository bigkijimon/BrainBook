// Owner 2026-10-11: "ホーム画面にAgentたちのやり取りをセッションごとにまとめたもの...作業中の
// タスクも表示してくれるとどんなものを作っていて進行状況はどうなのかをみせてくれる" -- same feed
// as AgentChat, grouped by SESSION (task/card) instead of by author, so Home answers "what is
// being built, by whom, how far along" at a glance. Reuses AgentChat's chat-thread/-message markup
// 1:1 (same CSS, no new styling surface) so this reads as one family, not a bolted-on panel.
import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ListTodo } from 'lucide-react';
import { memberTone } from './TeamRail';
import { personaOf } from './agentRoster';
import { sessionGroups, messageSummary, resultLinks, displayTitle } from './owner-console.mjs';

type Item = { id: string; taskId?: string; taskTitle: string; kind: string; author: string; text: string; at: number; boardName: string; board?: string; from?: string; to?: string | null; taskRecipient?: string | null };
const KIND: Record<string, string> = { blocked: 'Needs you', done: 'Completion reported', failed: 'Stop reported', progress: 'Start reported', new: 'Added', comment: 'Report' };
const when = (at: number) => new Date(at * 1000).toLocaleString('en-GB', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export function SessionActivity() {
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const response = await fetch(`/api/agents/feed?since=${Math.floor(Date.now() / 1000) - 3 * 86400}`, { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok || data.error || !Array.isArray(data.items)) throw new Error();
        if (alive) { setItems(data.items); setError(''); }
      } catch { if (alive) setError('Session update failed. Showing the last report.'); }
    };
    void load();
    const timer = window.setInterval(load, 10000);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);

  const groups = useMemo(() => sessionGroups(items), [items]);
  const working = groups.filter((group) => group.state === 'working').length;

  return <section className="agent-chat card-shell" aria-labelledby="session-activity-heading">
    <header className="agent-chat-head">
      <h3 id="session-activity-heading"><ListTodo size={16} strokeWidth={1.8} /> Sessions <b>{working}</b></h3>
      <small>What's being built, grouped per task. Last 3 days.</small>
    </header>
    {error && <p role="status">{error}</p>}
    {!groups.length && !error && <p className="agent-chat-empty">No session activity recorded in the last 3 days.</p>}
    <ol className="agent-chat-list">{groups.slice(0, all ? undefined : 5).map((group) => {
      const expanded = open === group.key;
      const latest = group.last;
      return <li className="chat-thread" key={group.key}>
        <button className="chat-thread-row" type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : group.key)}>
          <i className={`chat-avatar session-state session-state-${group.state}`} aria-hidden="true">{group.participants.length || '·'}</i>
          <span className="chat-thread-main">
            <b>{displayTitle(group.taskTitle, 60)} <small className={`session-badge session-badge-${group.state}`}>{group.stateLabel}</small></b>
            <small>{group.participants.map((name: string) => personaOf(name)).join(', ') || 'Participant unknown'} · {group.items.length} reports · {when(latest.at)}</small>
            <span className="chat-preview">Summary: {messageSummary(latest.text)}</span>
          </span>
          <ChevronDown size={14} />
        </button>
        {resultLinks(latest.text).map((url: string) => <a key={url} className="chat-result-link" href={url} target="_blank" rel="noreferrer">Open result</a>)}
        {expanded && <ol className="chat-messages">{group.items.map((item: Item) => <li className="chat-message" key={item.id} style={{ ['--agent' as string]: memberTone(item.author) }}>
          <div className="chat-bubble">
            <header><b>{personaOf(item.author)}</b><time dateTime={new Date(item.at * 1000).toISOString()}>{when(item.at)}</time></header>
            <p>{KIND[item.kind] || 'State unknown'}</p>
            <p className="chat-context">Request: {item.from || 'Sender unknown'} → {item.taskRecipient || 'Worker unknown'}<br />Reported: {item.author} → {item.to || 'Recipient unknown'}</p>
            <p>Summary: {messageSummary(item.text)}</p>
            {resultLinks(item.text).map((url: string) => <a key={url} className="chat-result-link" href={url} target="_blank" rel="noreferrer">Open result</a>)}
            <details className="chat-source"><summary>Original and source</summary><p className="source-text">{item.text || 'Text not recorded'}</p><small>{item.boardName} · {item.taskId || 'Card ID unknown'} · {item.id}</small></details>
          </div>
        </li>)}</ol>}
      </li>;
    })}</ol>
    {groups.length > 5 && <button className="console-more" type="button" aria-expanded={all} onClick={() => setAll((v) => !v)}>{all ? 'Show less' : `All sessions (${groups.length})`}</button>}
  </section>;
}
