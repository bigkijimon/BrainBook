import { useEffect, useState } from 'react';
import { Chip, StateNote } from './ui';

// MoviePro / SHIFT-01 status (owner 2026-10-28). Read-only projection of /api/movie-schedule: the
// project's EXECUTION-STATE.md and the shared gpu-job queue. It starts, approves and cancels nothing.
type Job = { id: string; status: string; stage?: string; updatedAt?: string };
type Schedule = {
  source: { state: string; queue: string };
  readAt: string;
  state: null | { modifiedAt: string; latest: { heading: string; nextStep: string | null }; rule: null | { heading: string; text: string | null }; recent: string[] };
  queue: null | { active: Job[]; otherActive: Job[]; shift01Counts: Record<string, number> };
  unknown: string[];
};

const POLL_MS = 30000;
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

export function MovieSchedule() {
  const [data, setData] = useState<Schedule | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const response = await fetch('/api/movie-schedule', { cache: 'no-store' });
        if (!response.ok) throw new Error(String(response.status));
        const body = await response.json() as Schedule;
        if (alive) { setData(body); setFailed(false); }
      } catch { if (alive) setFailed(true); }
    };
    void load();
    const timer = window.setInterval(load, POLL_MS);
    document.addEventListener('visibilitychange', load);
    return () => { alive = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', load); };
  }, []);

  const generating = data?.queue?.active.filter((job) => job.status === 'GENERATING') || [];
  const counts = data?.queue?.shift01Counts || {};
  return <section className="movie-schedule card-shell" aria-labelledby="movie-schedule-heading">
    <header>
      <h3 id="movie-schedule-heading">MoviePro / SHIFT-01 schedule</h3>
      <small>Read-only · {data ? `read ${time(data.readAt)}` : 'loading'}{failed && ' · update failed, showing the last read'}</small>
    </header>
    {!data && !failed && <StateNote kind="loading">Reading MoviePro status…</StateNote>}
    {!data && failed && <StateNote kind="error">MoviePro status is UNKNOWN: the BrainBook server did not answer.</StateNote>}
    {data && <>
      <p className="movie-rule"><Chip tone="info">Rule</Chip>{' '}
        {data.state?.rule ? <>{data.state.rule.text || data.state.rule.heading}<small> — from the note: {data.state.rule.heading}</small></> : 'UNKNOWN: no “one video at a time” entry found in the note.'}
      </p>
      <p><Chip tone={generating.length ? 'live' : 'unknown'} dot={generating.length > 0}>{generating.length ? 'Generating' : 'No SHIFT-01 job generating'}</Chip>{' '}
        {generating.map((job) => <code key={job.id}>{job.id}{job.stage ? ` (${job.stage})` : ''}</code>)}
        {data.queue === null && ' UNKNOWN: the GPU queue could not be read.'}
      </p>
      {data.queue && data.queue.otherActive.length > 0 && <p><Chip tone="warn">Other GPU jobs</Chip> {data.queue.otherActive.map((job) => `${job.id} (${job.status})`).join(', ')}</p>}
      {data.state && <>
        <p><strong>Newest note entry:</strong> {data.state.latest.heading}</p>
        <p><strong>Next step (as written):</strong> {data.state.latest.nextStep || 'UNKNOWN: the newest entry has no NEXT STEP line.'}</p>
        <details><summary>Recent note entries</summary><ol>{data.state.recent.map((heading) => <li key={heading}>{heading}</li>)}</ol></details>
      </>}
      {data.queue && <p><small>SHIFT-01 jobs in queue: {Object.entries(counts).map(([status, n]) => `${status} ${n}`).join(' · ') || 'none'}</small></p>}
      {data.unknown.map((line) => <StateNote key={line} kind="error">UNKNOWN: {line}</StateNote>)}
      <small>Sources: {data.source.state}{data.state ? ` (modified ${time(data.state.modifiedAt)})` : ''} · {data.source.queue}. No progress percentage or ETA is shown because neither source records one.</small>
    </>}
  </section>;
}
