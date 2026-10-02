// Capture sorter UI (owner 2026-09-30). The owner writes one line; BrainBook decides whether it is
// a goal, a task or an idea, shows why, shows what it really connects to, and proposes the first
// steps. The owner can switch the kind before saving. A goal becomes a Projects/Goals note whose
// steps are checkboxes: they appear in "things need you" and each can be handed to an agent (Run).
import { useState } from 'react';
import { ArrowUpRight, Flag, Lightbulb, Link2, ListChecks, Loader2, Target, X } from 'lucide-react';

type Link = { id: string; kind: string; title: string; why: string };
type Step = { text: string; uses: string | null };
export type Sorted = { kind: 'goal' | 'task' | 'idea'; title: string; reason: string; links: Link[]; steps: Step[]; source: 'model' | 'rule'; model: string | null };
type Saved = { kind: string; title: string; path?: string; url?: string; links: number; steps: number };

const KIND = {
  goal: { label: 'Goal', icon: Target, hint: 'An outcome you want to reach. Saved as a goal note with steps you can hand to agents.' },
  task: { label: 'Task', icon: ListChecks, hint: 'One concrete action. Goes to the Inbox.' },
  idea: { label: 'Idea', icon: Lightbulb, hint: 'A possibility to keep. Goes to Ideas.' },
} as const;
const KIND_LABEL: Record<string, string> = { goal: 'Goal', idea: 'Idea', task: 'Task', project: 'Project', card: 'Agent card' };

async function post<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data as T;
}

export function CaptureSorter({ onClose, onSaved }: { onClose: () => void; onSaved: (saved: Saved) => void }) {
  const [text, setText] = useState('');
  const [sorted, setSorted] = useState<Sorted | null>(null);
  const [kind, setKind] = useState<Sorted['kind']>('task');
  const [keep, setKeep] = useState<Set<string>>(new Set());
  const [steps, setSteps] = useState<Step[]>([]);
  const [state, setState] = useState<'idle' | 'sorting' | 'saving'>('idle');
  const [error, setError] = useState('');

  const sort = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!text.trim() || state !== 'idle') return;
    setState('sorting'); setError('');
    try {
      const result = await post<Sorted>('/api/capture/sort', { text });
      setSorted(result); setKind(result.kind); setKeep(new Set(result.links.map((link) => link.id))); setSteps(result.steps);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setState('idle'); }
  };
  const save = async () => {
    if (!sorted || state !== 'idle') return;
    setState('saving'); setError('');
    try {
      const saved = await post<Saved>('/api/capture/save', { text, kind, title: sorted.title, reason: sorted.reason,
        links: sorted.links.filter((link) => keep.has(link.id)), steps: steps.filter((step) => step.text.trim()) });
      onSaved(saved);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); setState('idle'); }
  };

  return <div className="composer card-shell capture">
    <div className="composer-topline"><span className="composer-label">CAPTURE / SORT</span><button className="icon-button" type="button" aria-label="Close" onClick={onClose}><X size={16} strokeWidth={1.5} /></button></div>
    <form onSubmit={sort}>
      <textarea autoFocus rows={2} value={text} maxLength={4000} placeholder="Write anything: a goal, a task or an idea. BrainBook sorts it." aria-label="What is on your mind"
        onChange={(event) => { setText(event.target.value); if (sorted) setSorted(null); }}
        onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); if (sorted) void save(); else void sort(); } }} />
      {!sorted && <div className="capture-foot">
        <small>{state === 'sorting' ? 'Reading it and checking what it connects to…' : '⌘↵ sorts it.'}</small>
        <button className="submit-button" type="submit" disabled={!text.trim() || state !== 'idle'}>{state === 'sorting' ? <Loader2 size={14} className="spin" /> : <Flag size={14} strokeWidth={1.5} />}Sort it</button>
      </div>}
    </form>
    {sorted && <div className="capture-result">
      <div className="capture-kinds" role="radiogroup" aria-label="Kind">
        {(Object.keys(KIND) as Sorted['kind'][]).map((key) => {
          const Icon = KIND[key].icon;
          return <button key={key} type="button" role="radio" aria-checked={kind === key} className={`capture-kind is-${key} ${kind === key ? 'on' : ''}`} onClick={() => setKind(key)}>
            <Icon size={14} strokeWidth={1.8} />{KIND[key].label}{sorted.kind === key && <em>suggested</em>}
          </button>;
        })}
      </div>
      <p className="capture-reason"><b>{sorted.title}</b>{sorted.reason && <> — {sorted.reason}</>}<br /><small>{KIND[kind].hint}{sorted.source === 'rule' && ' (Sorted by keyword rule: the model did not answer.)'}</small></p>

      <section className="capture-block">
        <h4><Link2 size={13} /> Connects to</h4>
        {sorted.links.length === 0 ? <p className="muted">Nothing you already have is connected. It starts fresh.</p>
          : <ul className="capture-links">{sorted.links.map((link) => <li key={link.id}>
            <label><input type="checkbox" checked={keep.has(link.id)} onChange={() => setKeep((current) => { const next = new Set(current); if (next.has(link.id)) next.delete(link.id); else next.add(link.id); return next; })} />
              <span><em className={`capture-tag is-${link.kind}`}>{KIND_LABEL[link.kind] || link.kind}</em> <b>{link.title}</b><small>{link.why}</small></span></label>
          </li>)}</ul>}
      </section>

      {kind !== 'idea' || steps.length > 0 ? <section className="capture-block">
        <h4><ListChecks size={13} /> {kind === 'goal' ? 'Steps to reach it' : 'Steps'}</h4>
        <ol className="capture-steps">{steps.map((step, index) => <li key={index}>
          <input value={step.text} aria-label={`Step ${index + 1}`} onChange={(event) => setSteps((current) => current.map((entry, at) => at === index ? { ...entry, text: event.target.value } : entry))} />
          <button type="button" className="icon-button" aria-label={`Remove step ${index + 1}`} onClick={() => setSteps((current) => current.filter((_, at) => at !== index))}><X size={12} /></button>
        </li>)}</ol>
        {steps.length < 8 && <button type="button" className="capture-btn capture-add" onClick={() => setSteps((current) => [...current, { text: '', uses: null }])}>+ Add a step</button>}
        {kind === 'goal' && <small className="capture-note">Each step becomes a checkbox in the goal note. It shows up in “things need you”, and Run hands it to an agent.</small>}
      </section> : null}

      <div className="capture-foot">
        <button type="button" className="capture-btn" onClick={() => setSorted(null)}>Edit text</button>
        <button type="button" className="submit-button" disabled={state !== 'idle'} onClick={() => void save()}>{state === 'saving' ? <Loader2 size={14} className="spin" /> : <ArrowUpRight size={14} strokeWidth={1.6} />}Save as {KIND[kind].label.toLowerCase()}</button>
      </div>
    </div>}
    {error && <p className="capture-error" role="alert">{error}</p>}
  </div>;
}
