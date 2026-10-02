// Agent updates as pop-ups, written for the owner. They slide in from the left like chat messages,
// stay a few seconds, then leave. The bell keeps the recent history for anything missed.
// Sources: Hermes Kanban (read-only) + BrainBook's own events (idea finished, level up…).
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, X } from 'lucide-react';
import { memberTone } from './TeamRail';

export type AgentMessage = { id: string; kind: 'done' | 'comment' | 'blocked' | 'failed' | 'progress' | 'new' | 'xp' | 'level'; author: string; title: string; text: string; at: number; board?: string; action?: string; self?: boolean };

const POLL_MS = 8000;
// Phone shows one compact pop-up at a time (see styles.css); give it less time in front
// of the content it's covering than the multi-toast desktop stack gets.
const SHOW_MS = typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches ? 5000 : 9000;
const MAX_TOASTS = 3;
const SEEN_KEY = 'brainbook.feed.seenAt';
// Hermes profile ids → the names the owner knows.
const AUTHOR: Record<string, string> = { worker: 'Worker', 'auto-decomposer': 'Planner', claudecode: 'Claude Code', claude: 'Claude Code', opencode: 'OpenCode', mimo: 'MiMo', pi: 'Pi', jev: 'Jev', 'team-run': 'Bigkiji' };
// Only the orchestrator wears the owner's chosen character; every other agent
// gets its own initial and stable colour so voices are distinguishable at a glance.
const TONES = ['#2be8d9', '#ffc44d', '#8f7bff', '#48f0c8', '#ff7a45', '#5ab0ff', '#e46bff', '#b5e853'];
// Same fixed colours as the team rail, so Pi is always amber, MiMo cyan, Claude Code orange.
const toneFor = (name: string) => memberTone(name) || TONES[[...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % TONES.length];
// Owner 2026-09-29: "show it plainly, with emoji and symbols". Agent updates
// lead with short emoji lines; anything after a "Details:" line (raw QA text)
// stays folded until opened, so the feed reads at a glance.
function AgentText({ text }: { text: string }) {
  const cut = text.search(/\n\s*Details:\s*\n/);
  const head = (cut >= 0 ? text.slice(0, cut) : text).trim();
  const rest = cut >= 0 ? text.slice(cut).replace(/^\s*Details:\s*/, '').trim() : '';
  const lines = head.split('\n').map((line) => line.trim()).filter(Boolean);
  return <div className="agent-text">
    {lines.map((line, index) => <p key={index} className={index === 0 ? 'agent-line lead' : 'agent-line'}>{line}</p>)}
    {rest && <details className="agent-details"><summary>📄 Details</summary><p>{rest}</p></details>}
  </div>;
}

const HEADLINE: Record<AgentMessage['kind'], string> = {
  done: '🎉 Finished', comment: '💬 Update', blocked: '⛔ Waiting on you', failed: '❌ Stopped', progress: '▶️ Started', new: '🆕 New task', xp: 'Idea complete', level: 'Level up',
};

// Turn a raw agent note into short plain sentences for the owner:
// drop sync prefixes, task ids, file paths and job names; keep what happened and what is needed.
export function forOwner(raw: string) {
  const text = String(raw || '')
    .replace(/^board sync\b.*?\([^)]*\):\s*/i, '')
    .replace(/^board sync\b[^:]*(?::\d\d[^:]*)?:\s*/i, '')
    .replace(/\b(\d{4})-(\d{2})-(\d{2})(?:\s+\d{1,2}:\d{2}(?:\s*JST)?)?/g, (_m, _y, mo, d) => `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(mo) - 1]} ${Number(d)}`)
    .replace(/\s*\([^()]*(?:operator-hold|\.video-|R&D)[^()]*\)/gi, '')
    .replace(/\((?:[^()]*\b(?:t_[0-9a-f]{6,}|gpu-job|\.py|\/)[^()]*)\)/gi, '')
    .replace(/^(?:hermes|assistant|worker|planner|claude code|opencode)(?:\s+\w+)?\s*(?:\([^)]*\))?\s*:\s*/i, '')
    // Short code words stay readable without backticks; long shell lines are not for the owner.
    .replace(/`([^`]*)`/g, (_m, code: string) => (code.length <= 28 ? code : 'a long command'))
    .replace(/\bPID \d+\b/g, 'a process')
    .replace(/\s*\([^()]*\b(?:exit \d|grep|stdout|stderr|pid|http \d{3}|returned|lines?)\b[^()]*\)/gi, '')
    .replace(/\bt_[0-9a-f]{6,}\b/gi, 'a task')
    .replace(/(?:~|\.{0,2})?\/?(?:[\w.-]+\/)+[\w.-]+\.\w+/g, 'a file')
    .replace(/\b[\w-]+\.(?:py|mjs|json|ya?ml|db)\b/g, 'a script')
    .replace(/\bS\d+\s+\w+\s+first frame a file\b/gi, 'The first frame image')
    .replace(/\s+([.,;])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
  const needs = /(needs an owner|owner (?:decision|go-ahead|approval)|waiting on (?:you|the owner)|needs your)/i.test(text);
  const decision = text.match(/needs an owner decision:?\s*([^.]+)/i)?.[1]?.trim();
  const sentences = text.split(/(?<=[.!?])\s+/).filter((sentence) => !/needs an owner|owner go-ahead/i.test(sentence));
  const body = sentences.slice(0, 2).join(' ');
  return {
    text: body.length > 220 ? `${body.slice(0, 218).trimEnd()}…` : body,
    action: needs ? (decision ? `Your call: ${decision}.` : 'Needs your go-ahead.') : undefined,
  };
}

const since = (seconds: number) => {
  const diff = Math.max(0, Date.now() / 1000 - seconds);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  return `${Math.floor(diff / 86400)} d ago`;
};

export function AgentFeed({ local, character }: { local: AgentMessage[]; character: { name: string; image: string } }) {
  const [history, setHistory] = useState<AgentMessage[]>([]);
  const [toasts, setToasts] = useState<AgentMessage[]>([]);
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [who2, setWho2] = useState('');
  const seen = useRef(new Set<string>());
  const who = useRef(character.name);
  who.current = character.name;
  // Only pop up what arrived since the owner last opened the bell; older items wait there quietly.
  const lastSeen = useRef(Number(localStorage.getItem(SEEN_KEY)) || Math.floor(Date.now() / 1000) - 3600);
  const cursor = useRef(Math.floor(Date.now() / 1000) - 3 * 86400);

  const add = (incoming: AgentMessage[]) => {
    const fresh = incoming.filter((message) => !seen.current.has(message.id));
    if (!fresh.length) return;
    fresh.forEach((message) => seen.current.add(message.id));
    setHistory((current) => [...fresh, ...current].sort((a, b) => b.at - a.at).slice(0, 50));
    const pop = fresh.filter((message) => message.at >= lastSeen.current).sort((a, b) => a.at - b.at);
    if (!pop.length) return;
    setUnread((count) => count + pop.length);
    // One sync touching many cards says the same thing: collapse it into one pop-up.
    // Several updates from one agent arriving together also become one pop-up.
    const grouped = new Map<string, AgentMessage[]>();
    for (const message of pop) { const key = message.author; grouped.set(key, [...(grouped.get(key) || []), message]); }
    const cards = [...grouped.values()].map((group) => {
      if (group.length === 1) return group[0];
      const latest = group[group.length - 1];
      const lastDone = group.map((message) => message.kind).lastIndexOf('done');
      const needs = group.slice(lastDone + 1).find((message) => message.action);
      return { ...latest, kind: needs?.kind || latest.kind, action: needs?.action, title: `${group.length} updates · ${latest.title}` };
    });
    cards.forEach((card, index) => window.setTimeout(() => {
      setToasts((current) => [card, ...current.filter((entry) => entry.id !== card.id)].slice(0, MAX_TOASTS));
      window.setTimeout(() => setToasts((current) => current.filter((entry) => entry.id !== card.id)), SHOW_MS + (card.action ? 6000 : 0));
    }, index * 450));
  };

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const response = await fetch(`/api/agents/feed?since=${cursor.current}`, { cache: 'no-store' });
        const data = await response.json() as { items: Array<{ id: string; kind: AgentMessage['kind']; author: string; taskTitle: string; text: string; at: number; boardName: string }> };
        if (!alive || !Array.isArray(data.items)) return;
        if (data.items.length) cursor.current = Math.max(cursor.current, ...data.items.map((item) => item.at));
        add(data.items.map((item) => {
          const plain = forOwner(item.text);
          return { id: item.id, kind: item.kind, self: item.author === 'default', author: item.author === 'default' ? who.current : AUTHOR[item.author] || item.author, title: item.taskTitle, text: plain.text, action: plain.action || (item.kind === 'blocked' ? 'Needs your go-ahead.' : undefined), at: item.at, board: item.boardName };
        }));
      } catch { /* offline: try again next tick */ }
    };
    void poll();
    const timer = window.setInterval(poll, POLL_MS);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => { add(local); }, [local]);
  // Esc closes the updates panel, like every other popover.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const openBell = () => {
    setOpen((value) => !value);
    setUnread(0);
    lastSeen.current = Math.floor(Date.now() / 1000);
    localStorage.setItem(SEEN_KEY, String(lastSeen.current));
  };
  const authors = Object.entries(history.reduce<Record<string, number>>((acc, message) => ({ ...acc, [message.author]: (acc[message.author] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1]);
  // Consecutive messages from one agent share a single card, like a chat thread.
  const threads = (list: AgentMessage[]) => list.reduce<AgentMessage[][]>((groups, message) => {
    const last = groups[groups.length - 1];
    if (last && last[0].author === message.author) last.push(message); else groups.push([message]);
    return groups;
  }, []);
  const avatar = (message: AgentMessage) => (message.self !== false
    ? <img className="agent-avatar" src={character.image} alt="" aria-hidden="true" />
    : <span className="agent-avatar agent-initial" style={{ background: toneFor(message.author) }} aria-hidden="true">{message.author.slice(0, 1).toUpperCase()}</span>);
  const thread = (group: AgentMessage[]) => {
    const head = group[0];
    const tone = head.kind === 'done' ? head.kind : group.find((message) => message.action)?.kind || head.kind;
    return <li key={head.id} className={`agent-msg agent-thread kind-${tone} ${head.self === false ? 'agent-framed' : ''}`} style={head.self === false ? { '--agent': toneFor(head.author) } as React.CSSProperties : undefined}>
      {avatar(head)}
      <div className="agent-bubble">
        <header><b style={head.self === false ? { color: toneFor(head.author) } : undefined}>{head.author}</b>{group.length > 1 && <span className="thread-count">{group.length} updates</span>}<time>{since(head.at)}</time></header>
        <ol className="thread-items">{group.map((message, index) => <li key={message.id}>
          <div className="thread-meta"><span className={`agent-kind kind-${message.kind}`}>{HEADLINE[message.kind]}</span>{index > 0 && <time>{since(message.at)}</time>}</div>
          {(index === 0 || message.title !== group[index - 1].title) && <p className="agent-title">{message.title}</p>}
          {message.text && <AgentText text={message.text} />}
          {message.action && <p className="agent-action">👉 {message.action}</p>}
        </li>)}</ol>
      </div>
    </li>;
  };
  const card = (message: AgentMessage, toast: boolean) => <li key={message.id} className={`agent-msg kind-${message.kind} ${toast ? 'is-toast' : ''} ${message.self === false ? 'agent-framed' : ''}`} style={message.self === false ? { '--agent': toneFor(message.author) } as React.CSSProperties : undefined}>
    {avatar(message)}
    <div className="agent-bubble">
      <header><b style={message.self === false ? { color: toneFor(message.author) } : undefined}>{message.author}</b><span className="agent-kind">{HEADLINE[message.kind]}</span><time>{since(message.at)}</time></header>
      <p className="agent-title">{message.title}</p>
      {message.text && <AgentText text={message.text} />}
      {message.action && <p className="agent-action">👉 {message.action}</p>}
    </div>
    {toast && <button type="button" className="agent-dismiss" aria-label="Dismiss" onClick={() => setToasts((current) => current.filter((entry) => entry.id !== message.id))}><X size={12} strokeWidth={1.8} /></button>}
  </li>;

  return <>
    <button type="button" className={`icon-button bell-button ${unread ? 'has-unread' : ''}`} aria-label={`Agent updates${unread ? `, ${unread} new` : ''}`} aria-expanded={open} onClick={openBell}>
      <Bell size={16} strokeWidth={1.5} />{unread > 0 && <b>{unread > 9 ? '9+' : unread}</b>}
    </button>
    {open && <div className="feed-panel" role="dialog" aria-label="Agent updates">
      <header><span className="eyebrow">AGENT UPDATES</span><button type="button" className="icon-button" aria-label="Close" onClick={() => setOpen(false)}><X size={14} strokeWidth={1.5} /></button></header>
      {authors.length > 1 && <div className="feed-filter" role="group" aria-label="Filter by agent">
        <button type="button" className={who2 === '' ? 'on' : ''} onClick={() => setWho2('')}>All</button>
        {authors.map(([name, count]) => <button type="button" key={name} className={who2 === name ? 'on' : ''} onClick={() => setWho2(name)}>{name} <b>{count}</b></button>)}
      </div>}
      {history.length === 0 ? <p className="feed-empty">Nothing from the agents in the last 3 days.</p> : <ol className="agent-feed">{threads(history.filter((message) => !who2 || message.author === who2).slice(0, 40)).map(thread)}</ol>}
    </div>}
    {/* The top bar uses backdrop-filter, which traps position:fixed children; render pop-ups on <body>. */}
    {createPortal(<ol className="toast-stack" aria-live="polite" aria-label="New agent updates">{toasts.map((message) => card(message, true))}</ol>, document.body)}
  </>;
}
