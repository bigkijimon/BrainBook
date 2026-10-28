import { useEffect, useState, type CSSProperties } from 'react';
import { Clapperboard } from 'lucide-react';
import { Chip, StateNote } from './ui';

// MoviePro / SHIFT-01 status (owner 2026-10-28). Read-only projection of /api/movie-schedule: the project's
// EXECUTION-STATE.md and the shared gpu-job queue. It starts, approves and cancels nothing.
// Visual rebuild (owner 2026-10-28, "ダラダラ説明するんじゃなく…"): a six-step pipeline graphic, a status donut and two
// explicit "not tracked" tiles replace the paragraphs. The data is unchanged and still source-labelled.
type Job = { id: string; status: string; stage?: string; updatedAt?: string };
type Pipeline = { steps: string[]; current: null | { step: string; jobId: string; basis: string }; next: null | { step: string; basis: string } };
type Schedule = {
  source: { state: string; queue: string };
  readAt: string;
  state: null | { modifiedAt: string; latest: { heading: string; nextStep: string | null }; rule: null | { heading: string; text: string | null }; recent: string[] };
  queue: null | { active: Job[]; otherActive: Job[]; shift01Counts: Record<string, number> };
  pipeline?: Pipeline;
  outlook?: Outlook;
  unknown: string[];
};
type Unknown = { unknown: string };
type Outlook = {
  sources: { state: string; registry: string; queue: string };
  next: Unknown | { title: string; heading: string; notStarted: boolean; gate: string | null };
  paused: Unknown | { label: string; retry: string | null; cancelledJobs: string[]; cancelledAt: string | null; otherStates: number };
  storyAriake: (Unknown & { queue?: AriakeQueue }) | { classification: string | null; gpuRoute: null | { status: string; since: string | null }; queue: AriakeQueue };
};
type AriakeQueue = { generating: number; queued: number; total: number; passed: number; cancelled: number; lastActivity: string | null };

const POLL_MS = 30000;
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
// Fixed order, one token per status. "Other" catches any status the queue adds later so the donut total stays true.
const STATUSES: { key: string; label: string; color: string }[] = [
  { key: 'PASSED', label: 'Passed', color: 'var(--theme-mintGlow)' },
  { key: 'GENERATING', label: 'Generating', color: 'var(--theme-cyanGlow)' },
  { key: 'FAILED_RETRYABLE', label: 'Failed, retryable', color: 'var(--theme-sunGlow)' },
  { key: 'FAILED_FINAL', label: 'Failed, final', color: 'var(--theme-danger)' },
  { key: 'CANCELLED', label: 'Cancelled', color: 'var(--theme-lavender)' },
];
const R = 38; const C = 2 * Math.PI * R; const GAP = 2.4;

function Donut({ counts }: { counts: Record<string, number> }) {
  const known = STATUSES.map((s) => ({ ...s, n: counts[s.key] || 0 }));
  const other = Object.entries(counts).filter(([k]) => !STATUSES.some((s) => s.key === k)).reduce((sum, [, n]) => sum + n, 0);
  const parts = other ? [...known, { key: 'OTHER', label: 'Other', color: 'var(--theme-muted)', n: other }] : known;
  const total = parts.reduce((sum, p) => sum + p.n, 0);
  let offset = 0;
  const summary = parts.filter((p) => p.n).map((p) => `${p.label} ${p.n}`).join(', ');
  return <div className="ms-donut">
    <svg viewBox="0 0 100 100" role="img" aria-label={`SHIFT-01 jobs by status. Total ${total}. ${summary || 'none'}`}>
      <circle cx="50" cy="50" r={R} className="ms-donut-track" />
      {total > 0 && parts.filter((p) => p.n).map((p) => {
        const len = Math.max(0, (p.n / total) * C - (parts.filter((q) => q.n).length > 1 ? GAP : 0));
        const el = <circle key={p.key} cx="50" cy="50" r={R} className="ms-donut-seg" stroke={p.color} strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset} />;
        offset += (p.n / total) * C;
        return el;
      })}
      <text x="50" y="50" className="ms-donut-n" textAnchor="middle" dominantBaseline="central">{total}</text>
      <text x="50" y="65" className="ms-donut-l" textAnchor="middle">jobs</text>
    </svg>
    <ul className="ms-legend">{parts.map((p) => <li key={p.key} className={p.n ? '' : 'is-zero'} style={{ '--c': p.color } as CSSProperties}><i aria-hidden="true" /><span>{p.label}</span><b>{p.n}</b></li>)}</ul>
  </div>;
}

function Steps({ pipeline, running }: { pipeline: Pipeline; running: boolean }) {
  return <ol className={`ms-steps ${running ? 'is-running' : ''}`} aria-label="SHIFT-01 video pipeline">
    {pipeline.steps.map((step, i) => {
      const current = pipeline.current?.step === step;
      const next = !current && pipeline.next?.step === step;
      return <li key={step} className={`ms-node ${current ? 'is-current' : ''} ${next ? 'is-next' : ''}`} aria-current={current ? 'step' : undefined}>
        <span className="ms-dot" aria-hidden="true">{i + 1}</span>
        <b>{step}</b>
        <small>{current ? 'running' : next ? 'next in note' : ' '}</small>
      </li>;
    })}
  </ol>;
}

const day = (iso: string | null) => (iso ? iso.replace('T', ' ').slice(0, 16) : 'unknown');

// Coarse queue-level view (not another stepper): what follows the video in the stepper. Every row names its source.
function Queue({ outlook, generating }: { outlook: Outlook; generating: Job[] }) {
  const { next, paused, storyAriake: ariake } = outlook;
  return <section className="ms-queue" aria-labelledby="ms-queue-heading">
    <h4 id="ms-queue-heading">Queue <small>what comes after this video</small></h4>
    <ol className="ms-queue-list">
      <li className="ms-q">
        <Chip tone={generating.length ? 'live' : 'unknown'} dot={generating.length > 0}>{generating.length ? 'Now' : 'Idle'}</Chip>
        <div><b>SHIFT-01 current build</b><small>{generating.length ? generating.map((job) => job.id).join(', ') : 'No SHIFT-01 job is generating'} · source: gpu-job queue</small></div>
      </li>
      <li className="ms-q">
        <Chip tone="info">Next</Chip>
        {'unknown' in next
          ? <div><b>UNKNOWN</b><small>{next.unknown}</small></div>
          : <div><b>{next.title}</b><small>Next (waiting for current build to finish){next.notStarted ? ' · not started' : ''} · source: EXECUTION-STATE.md</small>
            {next.gate && <details><summary>Start gate</summary><p>{next.gate}</p></details>}</div>}
      </li>
      <li className="ms-q">
        <Chip tone="warn">Paused</Chip>
        {'unknown' in paused
          ? <div><b>UNKNOWN</b><small>{paused.unknown}</small></div>
          : <div><b>{paused.label}</b><small>Paused: {paused.cancelledJobs.length} still jobs cancelled {day(paused.cancelledAt)} to keep one video at a time. Not rejected; can be resumed. · sources: EXECUTION-STATE.md, gpu-job queue</small>
            <details><summary>How to resume</summary>{paused.retry && <p>Once the current build is delivered: <code>{paused.retry}</code></p>}<p>{paused.cancelledJobs.join(', ')}</p></details></div>}
      </li>
      <li className="ms-q is-separate">
        <Chip tone="unknown">Separate</Chip>
        {'unknown' in ariake
          ? <div><b>storyAriake: UNKNOWN</b><small>{ariake.unknown}{ariake.queue ? ` · the queue holds ${ariake.queue.total} storyAriake jobs` : ''}</small></div>
          : <div><b>storyAriake · {ariake.queue.generating ? `generating ${ariake.queue.generating}` : ariake.queue.queued ? `queued ${ariake.queue.queued}` : 'idle'}</b>
            <small>{ariake.queue.generating} generating · {ariake.queue.queued} queued · {ariake.queue.passed} passed · {ariake.queue.cancelled} cancelled · last job update {day(ariake.queue.lastActivity)}</small>
            <small>{ariake.classification || 'Registry classification UNKNOWN'}{ariake.gpuRoute ? ` · GPU route ${ariake.gpuRoute.status.toLowerCase()}${ariake.gpuRoute.since ? ` ${ariake.gpuRoute.since}` : ''}` : ''}. Own account, not part of the SHIFT-01 queue. · sources: project registry, gpu-job queue</small></div>}
      </li>
    </ol>
  </section>;
}

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
  const running = generating.length > 0;
  const pipeline = data?.pipeline;
  return <section className={`movie-schedule card-shell ${running ? 'is-running' : ''}`} aria-labelledby="movie-schedule-heading">
    <header className="ms-head">
      <svg className="ms-reel" viewBox="0 0 64 40" aria-hidden="true"><rect x="1" y="1" width="62" height="38" rx="7" className="ms-reel-body" /><g className="ms-reel-frames">{[0, 1, 2, 3].map((i) => <rect key={i} x={5 + i * 14} y="11" width="11" height="18" rx="2" />)}</g><g className="ms-reel-holes">{[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <circle key={i} cx={4 + i * 8} cy="5.5" r="1.4" />)}{[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <circle key={i} cx={4 + i * 8} cy="34.5" r="1.4" />)}</g></svg>
      <div><h3 id="movie-schedule-heading"><Clapperboard size={16} strokeWidth={1.8} aria-hidden="true" /> MoviePro / SHIFT-01</h3>
        <small>Read-only · {data ? `read ${time(data.readAt)}` : 'loading'}{failed && ' · update failed, showing the last read'}</small></div>
      {data && <Chip tone={running ? 'live' : 'unknown'} dot={running}>{running ? 'Generating' : 'Idle'}</Chip>}
    </header>
    {!data && !failed && <StateNote kind="loading">Reading MoviePro status…</StateNote>}
    {!data && failed && <StateNote kind="error">MoviePro status is UNKNOWN: the BrainBook server did not answer.</StateNote>}
    {data && <>
      {pipeline && <Steps pipeline={pipeline} running={running} />}
      {running
        ? <p className="ms-now" role="status"><span>Generating now</span>{generating.map((job) => <code key={job.id}>{job.id}{job.stage ? ` · ${job.stage}` : ''}</code>)}{pipeline && !pipeline.current && <small>This job is outside the six tracked steps.</small>}</p>
        : <p className="ms-now is-idle"><span>No SHIFT-01 job is generating</span>{data.queue === null && <small>UNKNOWN: the GPU queue could not be read.</small>}</p>}
      {data.outlook && <Queue outlook={data.outlook} generating={generating} />}
      <div className="ms-grid">
        {data.queue ? <Donut counts={data.queue.shift01Counts} /> : <StateNote kind="error">UNKNOWN: the GPU queue could not be read.</StateNote>}
        <div className="ms-side">
          <dl className="ms-tiles">
            <div className="is-unknown"><dt>Progress</dt><dd>not recorded</dd></div>
            <div className="is-unknown"><dt>ETA</dt><dd>not tracked</dd></div>
            <div className={data.queue?.otherActive.length ? 'is-warn' : ''}><dt>Other GPU jobs</dt><dd>{data.queue ? data.queue.otherActive.length : 'unknown'}</dd></div>
          </dl>
          <p className="ms-rule" title={data.state?.rule?.text || undefined}><Chip tone="info">Rule</Chip> {data.state?.rule ? <span>One video end-to-end before the next</span> : <span>UNKNOWN: no “one video at a time” entry in the note.</span>}</p>
        </div>
      </div>
      {data.queue && data.queue.otherActive.length > 0 && <p className="ms-other"><Chip tone="warn">Other GPU jobs</Chip> {data.queue.otherActive.map((job) => `${job.id} (${job.status})`).join(', ')}</p>}
      {data.unknown.map((line) => <StateNote key={line} kind="error">UNKNOWN: {line}</StateNote>)}
      {data.state && <details className="ms-note"><summary>From the project note</summary>
        <p><strong>Newest entry</strong> {data.state.latest.heading}</p>
        <p><strong>Next step</strong> {data.state.latest.nextStep || 'UNKNOWN: the newest entry has no NEXT STEP line.'}</p>
        {data.state.rule?.text && <p><strong>Rule</strong> {data.state.rule.text}</p>}
        <ol>{data.state.recent.map((heading) => <li key={heading}>{heading}</li>)}</ol>
      </details>}
      <small className="ms-source">Sources: {data.source.state}{data.state ? ` (modified ${time(data.state.modifiedAt)})` : ''} · {data.source.queue}. Step completion, progress and ETA are not recorded by either source, so none is shown.</small>
    </>}
  </section>;
}
