import { displayTitle } from './owner-console.mjs';
// One panel for both chat-style boxes (owner 2026-10-02): "AgentChatとAgentMeetingは一緒に表示して、
// 例えばMeetingが始まったらChatBoxを切り替えてMeetingにするとか。" One shared card shell, one header
// that reflects the active mode — agent threads by default, "Meeting: <topic>" while MeetingRoom
// reports a running meeting. The mode flag comes from MeetingRoom's existing /api/meetings poll
// through onLiveChange; this panel never fetches that endpoint itself, so there is one poll, not
// two. DOM order is chat then meeting: idle, the threads sit where the owner looks first (the old
// order stacked an idle meeting room above the chat); once live, the chat block hides and the
// meeting content moves up under the live header. Both children stay mounted either way, so their
// polls and open/collapse state survive the switch and the chat is back the moment the meeting ends.
import { useCallback, useState } from 'react';
import { MessagesSquare, Users } from 'lucide-react';
import { AgentChat } from './AgentChat';
import { MeetingRoom } from './MeetingRoom';

export function AgentChatPanel({ remote }: { remote: boolean }) {
  const [activeCount, setActiveCount] = useState(0);
  const [live, setLive] = useState<{ id: string; topic: string } | null>(null);
  // Kept after the meeting ends so the return-to-chat announcement can still name what ended.
  const [lastTopic, setLastTopic] = useState('');
  // Stable so MeetingRoom's report effect keys on the running meeting only. A fresh closure each
  // render re-ran that effect on every badge update; MeetingRoom dedupes what it reports, so that
  // was harmless but load-bearing on a dedupe that should not have to exist.
  const noteLive = useCallback((next: { id: string; topic: string } | null) => {
    setLive(next);
    if (next) setLastTopic(next.topic);
  }, []);

  return <section className="agent-chat card-shell" aria-labelledby="agent-panel-heading">
    <header className={`agent-chat-head ${live ? 'is-meeting' : ''}`}>
      {live ? <>
        <h3 id="agent-panel-heading"><Users size={16} strokeWidth={1.8} /> Meeting: <span className="panel-topic" title={`Original topic: ${live.topic}`}>{displayTitle(live.topic,60)}</span> <b>In progress</b></h3>
        <small>Bigkiji hosts. Replies shown here are recorded.</small>
      </> : <>
        <h3 id="agent-panel-heading"><MessagesSquare size={16} strokeWidth={1.8} /> Agent chat <b>{activeCount}</b></h3>
        <small>Reports by agent, from the last 3 days. Originals and sources stay available.</small>
      </>}
    </header>
    <div className="panel-chat" hidden={Boolean(live)}>
      <AgentChat onActiveChange={setActiveCount} />
    </div>
    <MeetingRoom embed remote={remote} onLiveChange={noteLive} />
    {/* The merge replaced content instead of adding it: before, a meeting appeared as its own
        card and the chat never vanished, so nothing was taken away mid-read. Now a poll can pull
        the threads out from under the owner, which no native semantic reports — the header text
        changes but the badge count re-renders every 10s, so the header itself cannot be the live
        region without spamming. This announces the switch and nothing else. */}
    <p className="sr-only" role="status">{live ? `Meeting started: ${displayTitle(live.topic)}` : lastTopic ? `Meeting ended: ${displayTitle(lastTopic)}. Agent chat is back.` : ''}</p>
  </section>;
}
