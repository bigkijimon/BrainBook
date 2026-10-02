// Agent chat (owner 2026-09-30): "where is the chat box between agents?". An always-visible home
// section: one thread per Kanban card, showing what each agent said on that card, in order,
// like a chat. Threads that are still moving come first; finished ones sink. Source is the same
// read-only feed as the bell (/api/agents/feed), and forOwner() keeps raw ids and paths out.
import { useEffect, useMemo, useState } from 'react';
// Raw 'Details:' tails and status prefixes are for the logs, not the chat.
const tidy = (text: string) => text.split(/\n\s*Details:|\s+Details:\s*$/)[0].replace(/^(?:BLOCKED|DONE|FAILED|COMMENT):\s*/i, '').trim();
import { ChevronDown, MessagesSquare } from 'lucide-react';
import { forOwner } from './AgentFeed';
import { memberTone } from './TeamRail';
import { personaOf } from './agentRoster';

type Item = { id: string; taskId?: string; taskTitle: string; kind: string; author: string; text: string; at: number; boardName: string };
type Thread = { key: string; title: string; board: string; items: Item[]; last: Item; state: 'needs' | 'moving' | 'done' | 'stopped' };

const WINDOW_S = 3 * 86400;
const STATE_LABEL = { needs: '⛔ Needs you', moving: '🟢 In progress', stopped: '❌ Stopped', done: '🎉 Finished' } as const;
const ORDER = { needs: 0, moving: 1, stopped: 2, done: 3 } as const;
const since = (seconds: number) => {
  const diff = Math.max(0, Date.now() / 1000 - seconds);
  return diff < 60 ? 'just now' : diff < 3600 ? `${Math.floor(diff / 60)} min` : diff < 86400 ? `${Math.floor(diff / 3600)} h` : `${Math.floor(diff / 86400)} d`;
};
const stateOf = (last: Item): Thread['state'] => (last.kind === 'blocked' ? 'needs' : last.kind === 'done' ? 'done' : last.kind === 'failed' ? 'stopped' : 'moving');

export function AgentChat() {
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const response = await fetch(`/api/agents/feed?since=${Math.floor(Date.now() / 1000) - WINDOW_S}`, { cache: 'no-store' });
        const data = await response.json() as { items: Item[] };
        if (alive && Array.isArray(data.items)) setItems(data.items);
      } catch { /* keep last */ }
    };
    void load();
    const timer = window.setInterval(load, 10000);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);

  const threads = useMemo(() => {
    const byCard = new Map<string, Item[]>();
    for (const item of items) {
      const key = item.taskId || item.taskTitle;
      byCard.set(key, [...(byCard.get(key) || []), item]);
    }
    return [...byCard.entries()].map(([key, list]): Thread => {
      const sorted = [...list].sort((a, b) => a.at - b.at);
      const last = sorted[sorted.length - 1];
      return { key, title: last.taskTitle, board: last.boardName, items: sorted, last, state: stateOf(last) };
    }).sort((a, b) => ORDER[a.state] - ORDER[b.state] || b.last.at - a.last.at);
  }, [items]);

  const active = threads.filter((thread) => thread.state !== 'done');
  const done = threads.filter((thread) => thread.state === 'done');
  const shown = showDone ? threads : active;
  // Open the most urgent thread by default so the conversation is visible without a click.
  const current = open ?? shown[0]?.key ?? null;

  return <section className="agent-chat card-shell" aria-labelledby="agent-chat-heading">
    <header className="agent-chat-head">
      <h3 id="agent-chat-heading"><MessagesSquare size={16} strokeWidth={1.8} /> Agent chat <b>{active.length}</b></h3>
      <small>What the agents say to each other on each job. Last 3 days.</small>
    </header>
    {threads.length === 0 && <p className="agent-chat-empty">No agent conversation in the last 3 days.</p>}
    <ol className="agent-chat-list">
      {shown.map((thread) => {
        const expanded = current === thread.key;
        const people = [...new Set(thread.items.map((item) => item.author))];
        return <li key={thread.key} className={`chat-thread is-${thread.state}`}>
          <button type="button" className="chat-thread-row" aria-expanded={expanded} onClick={() => setOpen(expanded ? '' : thread.key)}>
            <span className="chat-faces" aria-hidden="true">{people.slice(0, 4).map((name) => <i key={name} style={{ background: memberTone(name) }}>{personaOf(name).slice(0, 1)}</i>)}</span>
            <span className="chat-thread-main">
              <b>{thread.title}</b>
              <small><em className={`chat-state is-${thread.state}`}>{STATE_LABEL[thread.state]}</em> {people.map(personaOf).join(' · ')} · {thread.items.length} messages · {since(thread.last.at)} ago</small>
            </span>
            <ChevronDown size={16} className="chat-chevron" />
          </button>
          {expanded && <ol className="chat-messages" ref={(node) => { if (node) node.scrollTop = node.scrollHeight; }}>
            {thread.items.map((item) => {
              const plain = forOwner(tidy(item.text));
              if (!plain.text && !plain.action) return null;
              return <li key={item.id} className="chat-message" style={{ ['--agent' as string]: memberTone(item.author) }}>
                <i className="chat-avatar" aria-hidden="true">{personaOf(item.author).slice(0, 1)}</i>
                <div className="chat-bubble">
                  <header><b>{personaOf(item.author)}</b>{personaOf(item.author) !== item.author && <span>{item.author}</span>}<time>{since(item.at)}</time></header>
                  {plain.text && <p>{plain.text}</p>}
                  {plain.action && <p className="chat-action">👉 {plain.action}</p>}
                </div>
              </li>;
            })}
          </ol>}
        </li>;
      })}
    </ol>
    {done.length > 0 && <button type="button" className="capture-btn agent-chat-more" onClick={() => setShowDone((value) => !value)}>{showDone ? 'Hide finished' : `Show ${done.length} finished`}</button>}
  </section>;
}
