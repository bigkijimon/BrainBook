import { Check } from 'lucide-react';
import { Chip } from './ui';

export type RoadmapStage = { stage: string; actions: string[] };
export type IdeaScore = {
  score: number | null;
  criteria: Record<string, { score: number; why: string }> | null;
  reason: string;
  roadmap: RoadmapStage[];
};

const CRITERIA_LABEL: Record<string, string> = { originality: 'Originality', demand: 'Demand', feasibility: 'Feasibility', monetization: 'Monetization', fit: 'Fit' };

export function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <Chip tone="unknown">Not scored</Chip>;
  const tone = score >= 70 ? 'ok' : score >= 40 ? 'warn' : 'bad';
  return <Chip tone={tone}>{score}/100</Chip>;
}

export function IdeaRoadmap({ analysis, doneActions = [], onToggle }: { analysis: IdeaScore; doneActions?: string[]; onToggle?: (stage: string, action: string) => void }) {
  return <div className="idea-roadmap">
    <div className="idea-roadmap-head"><ScoreBadge score={analysis.score} /><p className="idea-roadmap-reason">AIによる推定スコア — {analysis.reason}</p></div>
    {analysis.criteria && <div className="idea-criteria">
      {Object.entries(analysis.criteria).map(([key, value]) => <div className="idea-criterion" key={key}>
        <div className="idea-criterion-head"><span>{CRITERIA_LABEL[key] || key}</span><b>{value.score}/20</b></div>
        <div className="score-bar"><span style={{ width: `${(value.score / 20) * 100}%` }} /></div>
        <small>{value.why}</small>
      </div>)}
    </div>}
    <ol className="roadmap-stages">
      {analysis.roadmap.map((stage, index) => {
        const total = stage.actions.length;
        const done = stage.actions.filter((action) => doneActions.includes(`${stage.stage}:${action}`)).length;
        const active = done < total && (index === 0 || analysis.roadmap[index - 1].actions.every((a) => doneActions.includes(`${stage.stage}:${a}`)));
        return <li className={`roadmap-stage ${active ? 'active' : ''} ${done === total ? 'done' : ''}`} key={stage.stage}>
          <div className="roadmap-stage-head"><strong>{stage.stage}</strong><span>{done}/{total}</span></div>
          <ul>{stage.actions.map((action) => {
            const key = `${stage.stage}:${action}`;
            const isDone = doneActions.includes(key);
            return <li key={key}><button type="button" className={`roadmap-action ${isDone ? 'done' : ''}`} onClick={() => onToggle?.(stage.stage, action)}><span className="roadmap-check">{isDone && <Check size={12} strokeWidth={2} />}</span>{action}</button></li>;
          })}</ul>
        </li>;
      })}
    </ol>
  </div>;
}
