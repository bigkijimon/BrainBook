import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { IdeaRoadmap, IdeaScore } from './IdeaRoadmap';
import type { LifeArea } from './types';

export function IdeaComposer({ area, onSaved }: { area: LifeArea | 'all'; onSaved: () => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [analysis, setAnalysis] = useState<IdeaScore | null>(null);
  const [saved, setSaved] = useState(false);

  const analyze = async () => {
    if (!text.trim() || busy) return;
    setBusy(true); setSaved(false);
    try {
      const response = await fetch('/api/ideas/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
      setAnalysis(await response.json());
    } finally { setBusy(false); }
  };

  const save = async () => {
    if (!analysis || busy) return;
    setBusy(true);
    try {
      const response = await fetch('/api/ideas/compose', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, area: area === 'all' ? null : area, analysis }) });
      if (response.ok) { setSaved(true); setText(''); setAnalysis(null); onSaved(); }
    } finally { setBusy(false); }
  };

  return <section className="idea-composer" aria-label="New idea">
    <label className="idea-composer-box">
      <textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="Type an idea… (Japanese or English)" rows={3} aria-label="New idea text" />
      <button type="button" className="submit-button" disabled={!text.trim() || busy} onClick={analyze}><Sparkles size={15} strokeWidth={1.8} />{busy ? 'Scoring…' : 'Score this idea'}</button>
    </label>
    {analysis && <>
      <IdeaRoadmap analysis={analysis} />
      {analysis.score !== null && <button type="button" className="submit-button idea-save" disabled={busy} onClick={save}>Save as tracked idea</button>}
    </>}
    {saved && <p className="idea-empty">Saved — see it under "My ideas".</p>}
  </section>;
}
