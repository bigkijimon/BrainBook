import { useEffect, useState } from 'react';
import { ScoreBadge } from './IdeaRoadmap';
import { Chip, StateNote } from './ui';

type Pick = { path: string; title: string; summary: string; score: number | null; createdAt: string; adopted: boolean };

export function TrendRadar() {
  const [picks, setPicks] = useState<Pick[]>([]);
  const [loading, setLoading] = useState(true);
  const load = () => fetch('/api/ideas/trends').then((r) => r.json()).then((data) => setPicks(data.picks || [])).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);
  if (loading) return <StateNote kind="loading">Loading trend picks…</StateNote>;
  if (!picks.length) return <StateNote kind="empty">No trend picks yet — the weekly scan runs every Monday.</StateNote>;
  return <ul className="dir-tree idea-dir trend-radar-list">
    {picks.map((pick) => <li className="dir-node" key={pick.path}>
      <div className="dir-line idea-file">
        <Chip tone="info">AI PICK</Chip>
        <span className="idea-row-main"><strong>{pick.title}</strong><small>{pick.summary}</small></span>
        <ScoreBadge score={pick.score} />
      </div>
    </li>)}
  </ul>;
}
