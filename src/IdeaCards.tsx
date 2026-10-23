import { useCallback, useEffect, useState } from 'react';
import { Chip, StateNote, type Tone } from './ui';

// Idea Card (owner 2026-10-23): the same shape as the company Idea Mining framework — niche, demand
// evidence (a real number + a small chart, each with its source), a pain-point quote with its source,
// the idea + pitch, and a decision. It is stored as sections of the idea note itself (idea-card.mjs).
export type IdeaCardData = {
  niche: string;
  volume: { value: number | null; unit: string; source: string };
  trend: { pct: number | null; window: string; source: string };
  series: { label: string; value: number }[]; seriesUnit: string; seriesSource: string;
  quote: { text: string; source: string };
  pitch: { name: string; line: string };
  decision: 'pending' | 'selected' | 'rejected'; decisionReason: string;
};
type Item = { path: string; title: string; card: IdeaCardData | null; gaps: string[] };

const EMPTY: IdeaCardData = {
  niche: '', volume: { value: null, unit: 'per month', source: '' }, trend: { pct: null, window: '12 months', source: '' },
  series: [], seriesUnit: '', seriesSource: '', quote: { text: '', source: '' }, pitch: { name: '', line: '' }, decision: 'pending', decisionReason: '',
};
const DECISION_TONE: Record<IdeaCardData['decision'], Tone> = { pending: 'unknown', selected: 'ok', rejected: 'bad' };
const post = (url: string, body: unknown) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

export function DemandChart({ series, unit, source }: { series: { label: string; value: number }[]; unit: string; source: string }) {
  if (series.length < 2) return <p className="card-missing">Chart: add 2 or more data points with a source.</p>;
  const max = Math.max(...series.map((p) => p.value), 0) || 1;
  return <figure className="demand-chart">
    <ul>{series.map((p) => <li key={p.label}>
      <span className="demand-chart-label">{p.label}</span>
      <span className="demand-chart-track"><span style={{ width: `${Math.max(2, (p.value / max) * 100)}%` }} /></span>
      <b>{fmt(p.value)}</b>
    </li>)}</ul>
    <figcaption>{unit && `${unit} · `}{source || 'no source'}</figcaption>
  </figure>;
}

export function IdeaCardView({ title, card, gaps }: { title: string; card: IdeaCardData; gaps: string[] }) {
  return <article className="idea-card card-shell" aria-label={`Idea Card: ${title}`}>
    <header className="idea-card-head">
      <div><p className="eyebrow">{card.niche || 'Niche not set'}</p><h3>{card.pitch.name || title}</h3>{card.pitch.line && <p className="idea-card-pitch">{card.pitch.line}</p>}</div>
      <Chip tone={DECISION_TONE[card.decision]}>{card.decision}</Chip>
    </header>
    <section className="idea-card-evidence" aria-label="Demand evidence">
      <div className="idea-card-stat">
        <small>Search volume</small>
        <b>{card.volume.value === null ? '—' : fmt(card.volume.value)}</b>
        <span>{card.volume.value === null ? 'No number yet' : `${card.volume.unit} · ${card.volume.source || 'no source'}`}</span>
      </div>
      <div className="idea-card-stat">
        <small>Trend</small>
        <b>{card.trend.pct === null ? '—' : `${card.trend.pct > 0 ? '+' : ''}${fmt(card.trend.pct)}%`}</b>
        <span>{card.trend.pct === null ? 'No number yet' : `over ${card.trend.window} · ${card.trend.source || 'no source'}`}</span>
      </div>
      <DemandChart series={card.series} unit={card.seriesUnit} source={card.seriesSource} />
    </section>
    {card.quote.text
      ? <blockquote className="idea-card-quote"><p>{card.quote.text}</p><cite>{card.quote.source || 'no source'}</cite></blockquote>
      : <p className="card-missing">Pain point: add a real quote with its source.</p>}
    {card.decisionReason && <p className="idea-card-reason"><b>Why {card.decision}:</b> {card.decisionReason}</p>}
    {gaps.length > 0 && <p className="card-missing" role="status">Still missing: {gaps.join(', ')}</p>}
  </article>;
}

const seriesToText = (series: IdeaCardData['series']) => series.map((p) => `${p.label}=${p.value}`).join('\n');
const textToSeries = (text: string) => text.split(/[\n;]+/).map((line) => line.trim().split('=')).filter((p) => p.length === 2 && p[0].trim() && Number.isFinite(Number(p[1].replace(/,/g, '')))).map(([label, value]) => ({ label: label.trim(), value: Number(value.replace(/,/g, '')) }));

function CardForm({ card, busy, onSave }: { card: IdeaCardData; busy: boolean; onSave: (next: IdeaCardData) => void }) {
  const [draft, setDraft] = useState(card);
  const [chart, setChart] = useState(seriesToText(card.series));
  useEffect(() => { setDraft(card); setChart(seriesToText(card.series)); }, [card]);
  const set = <K extends keyof IdeaCardData>(key: K, value: IdeaCardData[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const numberOrNull = (text: string) => (text.trim() === '' || !Number.isFinite(Number(text.replace(/,/g, ''))) ? null : Number(text.replace(/,/g, '')));
  return <form className="idea-card-form" onSubmit={(event) => { event.preventDefault(); onSave({ ...draft, series: textToSeries(chart) }); }}>
    <label>Niche / market<input value={draft.niche} onChange={(e) => set('niche', e.target.value)} placeholder="e.g. Wealth — freelancer budgeting" /></label>
    <fieldset><legend>Demand evidence (real numbers + source)</legend>
      <div className="idea-card-row">
        <label>Search volume<input inputMode="decimal" value={draft.volume.value ?? ''} onChange={(e) => set('volume', { ...draft.volume, value: numberOrNull(e.target.value) })} placeholder="840000" /></label>
        <label>Unit<input value={draft.volume.unit} onChange={(e) => set('volume', { ...draft.volume, unit: e.target.value })} /></label>
      </div>
      <label>Volume source<input value={draft.volume.source} onChange={(e) => set('volume', { ...draft.volume, source: e.target.value })} placeholder="Tool or report name + date" /></label>
      <div className="idea-card-row">
        <label>Trend %<input inputMode="decimal" value={draft.trend.pct ?? ''} onChange={(e) => set('trend', { ...draft.trend, pct: numberOrNull(e.target.value) })} placeholder="212" /></label>
        <label>Over<input value={draft.trend.window} onChange={(e) => set('trend', { ...draft.trend, window: e.target.value })} /></label>
      </div>
      <label>Trend source<input value={draft.trend.source} onChange={(e) => set('trend', { ...draft.trend, source: e.target.value })} placeholder="Google Trends / report + date" /></label>
      <label>Chart data (one <code>label=value</code> per line)<textarea rows={3} value={chart} onChange={(e) => setChart(e.target.value)} placeholder={'2025=0.26\n2035=2.0'} /></label>
      <div className="idea-card-row">
        <label>Chart unit<input value={draft.seriesUnit} onChange={(e) => set('seriesUnit', e.target.value)} placeholder="USD B" /></label>
        <label>Chart source<input value={draft.seriesSource} onChange={(e) => set('seriesSource', e.target.value)} /></label>
      </div>
    </fieldset>
    <fieldset><legend>Pain point</legend>
      <label>Quote<textarea rows={2} value={draft.quote.text} onChange={(e) => set('quote', { ...draft.quote, text: e.target.value })} /></label>
      <label>Where it was said<input value={draft.quote.source} onChange={(e) => set('quote', { ...draft.quote, source: e.target.value })} placeholder="r/Freelancers + thread URL" /></label>
    </fieldset>
    <fieldset><legend>Idea + pitch</legend>
      <label>Name<input value={draft.pitch.name} onChange={(e) => set('pitch', { ...draft.pitch, name: e.target.value })} /></label>
      <label>One-line pitch<input value={draft.pitch.line} onChange={(e) => set('pitch', { ...draft.pitch, line: e.target.value })} /></label>
    </fieldset>
    <fieldset><legend>Decision</legend>
      <div className="idea-card-decisions" role="radiogroup" aria-label="Decision">
        {(['pending', 'selected', 'rejected'] as const).map((value) => <button type="button" key={value} role="radio" aria-checked={draft.decision === value} className={draft.decision === value ? 'on' : ''} onClick={() => set('decision', value)}>{value}</button>)}
      </div>
      <label>Reason (compare with the runner-up)<input value={draft.decisionReason} onChange={(e) => set('decisionReason', e.target.value)} /></label>
    </fieldset>
    <button type="submit" className="submit-button" disabled={busy}>{busy ? 'Saving…' : 'Save card'}</button>
  </form>;
}

export function IdeaCards() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => fetch('/api/ideas/cards').then((r) => r.json()).then((data) => setItems(data.items || [])).catch(() => setError('Could not load ideas.')), []);
  useEffect(() => { void load(); }, [load]);
  const save = async (path: string, card: IdeaCardData) => {
    setBusy(true); setError('');
    try {
      const response = await post('/api/ideas/card', { path, card });
      if (!response.ok) throw new Error((await response.json()).error || 'Could not save.');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save.'); } finally { setBusy(false); }
  };
  if (error && !items) return <StateNote kind="error">{error}</StateNote>;
  if (!items) return <StateNote kind="loading">Loading idea cards…</StateNote>;
  if (!items.length) return <StateNote kind="empty">No ideas yet — add one under "New idea", then build its card here.</StateNote>;
  const sorted = [...items].sort((a, b) => Number(Boolean(b.card)) - Number(Boolean(a.card)));
  return <section className="idea-cards" aria-label="Idea cards">
    {error && <StateNote kind="error">{error}</StateNote>}
    <ul className="idea-card-list">
      {sorted.map((item) => {
        const isOpen = open === item.path;
        return <li key={item.path} className={isOpen ? 'open' : ''}>
          <button type="button" className="idea-card-row-btn" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : item.path)}>
            <strong>{item.title}</strong>
            {item.card ? <Chip tone={DECISION_TONE[item.card.decision]}>{item.card.decision}</Chip> : <Chip tone="unknown">No card</Chip>}
            {item.card && item.gaps.length > 0 && <small>{item.gaps.length} to fill</small>}
          </button>
          {isOpen && <div className="idea-card-detail">
            {item.card && <IdeaCardView title={item.title} card={item.card} gaps={item.gaps} />}
            <details open={!item.card}><summary>{item.card ? 'Edit card' : 'Start a card'}</summary>
              <CardForm card={item.card || EMPTY} busy={busy} onSave={(next) => save(item.path, next)} />
            </details>
          </div>}
        </li>;
      })}
    </ul>
  </section>;
}
