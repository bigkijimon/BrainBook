// Agent team popup: who is working, and who handed which task to whom (Hermes Kanban + AI Router).
// Redesigned 2026-09-30 (owner: "this animation's quality is far too low"). The old stage put
// every agent on one ellipse, so labels collided, lines crossed through the middle and the
// Film Group had no place at all. The stage is now a structured flow, read left to right:
//   Bigkiji (hub)  →  team lead (Router, Steve)  →  members, grouped in team panels.
// Each live member shows what it is doing; a live hand-off carries a glowing packet along its
// path. Data comes from /api/agents/flow (read-only, refreshed every 8 s).
import { useEffect, useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Bot, BookOpen, Clapperboard, Cpu, Eye, GraduationCap, Hammer, MemoryStick, Music, PenTool, Rabbit, Route, Scale, ScanEye, SearchCheck, Sparkles, Wrench, X } from 'lucide-react';
import { AgentInfo, memberTone } from './TeamRail';
import { personaOf } from './agentRoster';

type Step = { to: string; state: string };
export type Handoff = { id: string; source: 'kanban' | 'router'; board: string; boardName: string; from: string; to: string; title: string; state: string; active: boolean; at: number | null; note: string; outcome?: string | null; steps?: Step[]; team?: string };
type Agent = { name: string; active: boolean; count: number };

const HUB = 'Bigkiji';
// The fixed roster (owner 2026-09-29), now grouped the way work actually flows.
// Anything else seen in a hand-off (old Hermes profiles, Codex, OpenCode) lands in OTHER.
const GROUPS: { id: string; label: string; lead: string | null; members: string[]; tone: string }[] = [
  // Owner 2026-09-30: every team shows its whole chain. Film Group gained its two
  // departments; BlogPro (Sora's team) was missing; Support reports straight to Bigkiji.
  { id: 'eng', label: 'ENGINEERING', lead: 'Router', members: ['MiMo', 'Space Bunny', 'Claude Code', 'Tora', 'Hana', 'Qwen (local)', 'Vision'], tone: '#2be8d9' },
  { id: 'movie', label: 'MOVIEPRO · FILM GROUP', lead: 'Steve', members: ['HideoKojima', 'RyūichiSakamoto', 'Shimajiro', 'Ame', 'Maru', 'ComfyUI', 'Auto QA', 'Kuro'], tone: '#ffa726' },
  { id: 'blog', label: 'BLOGPRO · CONTENT', lead: 'Sora', members: ['Coco', 'Blog QA', 'Tech Blog QA'], tone: '#ff8fd1' },
  { id: 'support', label: 'SUPPORT · REPORTS TO BIGKIJI', lead: null, members: ['Pi', 'Jev'], tone: '#ffc44d' },
];
// Who reports to whom inside a group (owner 2026-09-30: "show which agent sits under which").
// Same chain as agent-feed.py TEAM_PARENT / MOVIE_PARENT. A member not listed here reports to
// its group lead (or straight to Bigkiji in Support). Members are listed parent-first in GROUPS.
const SUB_PARENT: Record<string, string> = { Tora: 'Claude Code', Hana: 'Claude Code', Ame: 'Shimajiro', ComfyUI: 'Maru' };
const depthOf = (name: string): number => (SUB_PARENT[name] ? 1 + depthOf(SUB_PARENT[name]) : 0);
const INDENT = 18;
const ICON: Record<string, LucideIcon> = {
  Router: Route, MiMo: Hammer, 'Space Bunny': Rabbit, 'Claude Code': Wrench, 'Qwen (local)': Cpu, Vision: Eye,
  Steve: Clapperboard, ComfyUI: Sparkles, 'Auto QA': SearchCheck, Kuro: ScanEye, Ame: BookOpen, Shimajiro: GraduationCap,
  Maru: MemoryStick, HideoKojima: PenTool, 'RyūichiSakamoto': Music, Pi: Bot, Jev: Scale,
};
// Server-side (agent-feed.py who()) already relabels every owner/pseudo identity to
// Bigkiji before it's emitted; this is only a safety net for stale/cached data, so it
// must stay case-insensitive and match the server's list rather than filter the stage alone.
const HIDDEN_AGENTS = new Set(['yuma', 'team', 'e2e', 'probe', 'user', 'owner', 'brainbook', 'terminal', 'human_review']);
export const isHiddenAgent = (name: string) => HIDDEN_AGENTS.has((name || '').trim().toLowerCase());
export const agentTone = (name: string) => (name === HUB ? '#ff4fa3' : memberTone(name));
const STATE_TONE: Record<string, string> = { working: '#ff4fa3', done: '#48f0c8', failed: '#ff5a6e', 'needs you': '#ffb347', queued: '#2be8d9', waiting: '#c3a8d1', scheduled: '#8f7bff', 'left over': '#8a7896' };
const ago = (at: number | null) => {
  if (!at) return '';
  const minutes = Math.max(0, Math.round((Date.now() / 1000 - at) / 60));
  return minutes < 1 ? 'just now' : minutes < 60 ? `${minutes} min ago` : minutes < 1440 ? `${Math.floor(minutes / 60)} h ago` : `${Math.floor(minutes / 1440)} d ago`;
};
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

// Model per member, read live from the configs by agent-feed.py (owner 2026-09-30).
function useModels() {
  const [models, setModels] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const response = await fetch('/api/agents/teams', { cache: 'no-store' });
        if (response.ok && alive) setModels((await response.json()).models || {});
      } catch { /* optional */ }
    };
    void load();
    const timer = window.setInterval(load, 60000);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);
  return models;
}

export function useAgentFlow(open: boolean) {
  const [data, setData] = useState<{ handoffs: Handoff[]; agents: Agent[] }>({ handoffs: [], agents: [] });
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const response = await fetch(`/api/agents/flow?since=${Math.floor(Date.now() / 1000) - 86400}`, { cache: 'no-store' });
        if (response.ok && alive) setData(await response.json());
      } catch { /* optional */ }
    };
    void load();
    const timer = window.setInterval(load, open ? 8000 : 30000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [open]);
  return data;
}

// ── Stage geometry (SVG user units; the stage scales to its column) ──
const W = 452;
const HUB_X = 46;
const LEAD = { x: 112, w: 102, h: 40 };
const CHIP = { x: 226, w: 222, row: 32, liveRow: 44, gap: 5 };
type Box = { name: string; kind: 'hub' | 'lead' | 'member'; x: number; y: number; w: number; h: number; cy: number; group: string };
type Panel = { id: string; label: string; tone: string; y: number; h: number };

function layout(names: Set<string>, live: Set<string>) {
  const boxes = new Map<string, Box>();
  const panels: Panel[] = [];
  const known = new Set(GROUPS.flatMap((group) => [group.lead, ...group.members]).filter(Boolean) as string[]);
  // 'You' is the owner sending work from a Hermes session; it is a sender, not a member box.
  const other = [...names].filter((name) => name !== HUB && name !== 'You' && !known.has(name) && !isHiddenAgent(name)).slice(0, 6);
  const groups = [...GROUPS, ...(other.length ? [{ id: 'other', label: 'OTHER', lead: null, members: other, tone: '#8a7896' }] : [])];
  let y = 10;
  for (const group of groups) {
    const top = y;
    y += 18;
    const first = y;
    for (const name of group.members) {
      const h = live.has(name) ? CHIP.liveRow : CHIP.row;
      const indent = depthOf(name) * INDENT;
      boxes.set(name, { name, kind: 'member', x: CHIP.x + indent, y, w: CHIP.w - indent, h, cy: y + CHIP.row / 2, group: group.id });
      y += h + CHIP.gap;
    }
    const last = y - CHIP.gap;
    if (group.lead) {
      const cy = (first + last) / 2;
      boxes.set(group.lead, { name: group.lead, kind: 'lead', x: LEAD.x, y: cy - LEAD.h / 2, w: LEAD.w, h: LEAD.h, cy, group: group.id });
    }
    y = last + 8;
    panels.push({ id: group.id, label: group.label, tone: group.tone, y: top, h: y - top });
    y += 10;
  }
  const height = Math.max(y, 200);
  boxes.set(HUB, { name: HUB, kind: 'hub', x: HUB_X - 25, y: height / 2 - 25, w: 50, h: 50, cy: height / 2, group: 'hub' });
  // Static reporting lines: hub → each lead (and Support members), lead → its direct members,
  // parent → sub-member as a tree elbow. Drawn faintly under the live hand-off edges.
  const tree: { key: string; d: string; tone: string }[] = [];
  const hubBox = boxes.get(HUB)!;
  for (const group of groups) {
    const lead = group.lead ? boxes.get(group.lead) : null;
    if (lead) tree.push({ key: `h-${group.id}`, tone: group.tone, d: `M${HUB_X + 25},${hubBox.cy} C${HUB_X + 55},${hubBox.cy} ${lead.x - 30},${lead.cy} ${lead.x},${lead.cy}` });
    const spineX = lead ? lead.x + lead.w + 6 : CHIP.x - 8;
    const direct = group.members.filter((name) => !SUB_PARENT[name]).map((name) => boxes.get(name)!).filter(Boolean);
    if (direct.length) {
      const top = Math.min(lead?.cy ?? Infinity, direct[0].cy);
      const bottom = Math.max(lead?.cy ?? -Infinity, direct[direct.length - 1].cy);
      if (lead) tree.push({ key: `l-${group.id}`, tone: group.tone, d: `M${lead.x + lead.w},${lead.cy} H${spineX}` });
      tree.push({ key: `s-${group.id}`, tone: group.tone, d: `M${spineX},${top} V${bottom}` });
      for (const box of direct) tree.push({ key: `m-${box.name}`, tone: group.tone, d: `M${spineX},${box.cy} H${box.x}` });
      if (!lead) tree.push({ key: `hs-${group.id}`, tone: group.tone, d: `M${HUB_X + 25},${hubBox.cy} C${HUB_X + 90},${hubBox.cy} ${spineX - 60},${(top + bottom) / 2} ${spineX},${(top + bottom) / 2}` });
    }
    for (const name of group.members.filter((member) => SUB_PARENT[member])) {
      const box = boxes.get(name); const parent = boxes.get(SUB_PARENT[name]);
      if (!box || !parent) continue;
      const x = parent.x + 8;
      tree.push({ key: `c-${name}`, tone: group.tone, d: `M${x},${parent.y + parent.h} V${box.cy} H${box.x}` });
    }
  }
  return { boxes, panels, height, tree };
}

// Horizontal-tangent cubic between two boxes. Same-column links bow out to the left,
// so no line ever runs through a chip or through the hub.
function edgePath(a: Box, b: Box, lead?: Box) {
  const right = (box: Box) => ({ x: box.kind === 'hub' ? HUB_X + 25 : box.x + box.w, y: box.cy });
  const left = (box: Box) => ({ x: box.kind === 'hub' ? HUB_X + 25 : box.x, y: box.cy });
  // Hub straight to a member (Bigkiji handing work to MiMo without the Router): the lead's
  // box sits in the way, so pass it just above or below instead of through it.
  if (a.kind === 'hub' && b.kind === 'member' && lead) {
    const p0 = right(a); const p3 = left(b);
    const above = b.cy <= lead.cy;
    const clear = Math.abs(b.cy - lead.cy) < lead.h / 2 + 8;
    const wy = clear ? (above ? lead.y - 7 : lead.y + lead.h + 7) : b.cy;
    const w = { x: lead.x + lead.w / 2, y: wy };
    const k1 = (w.x - p0.x) * 0.6; const k2 = (p3.x - w.x) * 0.6;
    const d = `M${p0.x},${p0.y} C${p0.x + k1},${p0.y} ${w.x - k1},${w.y} ${w.x},${w.y} C${w.x + k2},${w.y} ${p3.x - k2},${p3.y} ${p3.x},${p3.y}`;
    return { d, p0, p3, mid: w };
  }
  let p0; let p3; let c1; let c2;
  if (a.kind === b.kind && a.kind !== 'hub') {
    p0 = left(a); p3 = left(b);
    const bow = Math.min(64, 18 + Math.abs(p3.y - p0.y) * 0.22);
    c1 = { x: p0.x - bow, y: p0.y }; c2 = { x: p3.x - bow, y: p3.y };
  } else {
    const forward = a.kind === 'hub' || (a.kind === 'lead' && b.kind === 'member');
    p0 = forward ? right(a) : left(a); p3 = forward ? left(b) : right(b);
    const dx = (p3.x - p0.x) * 0.55;
    c1 = { x: p0.x + dx, y: p0.y }; c2 = { x: p3.x - dx, y: p3.y };
  }
  const mid = { x: (p0.x + 3 * c1.x + 3 * c2.x + p3.x) / 8, y: (p0.y + 3 * c1.y + 3 * c2.y + p3.y) / 8 };
  return { d: `M${p0.x},${p0.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${p3.x},${p3.y}`, p0, p3, mid };
}

export function AgentFlow({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { handoffs, agents } = useAgentFlow(open);
  const [pick, setPick] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const models = useModels();
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Safety net for the log: filter out any handoff still naming a hidden agent even
  // though the server should already have relabelled it (see HIDDEN_AGENTS above).
  const visibleHandoffs = useMemo(() => handoffs.filter((handoff) => !isHiddenAgent(handoff.from) && !isHiddenAgent(handoff.to) && !handoff.steps?.some((step) => isHiddenAgent(step.to))), [handoffs]);

  // What each live member is doing right now (newest active hand-off wins).
  const doing = useMemo(() => {
    const map = new Map<string, string>();
    visibleHandoffs.filter((handoff) => handoff.active).forEach((handoff) => { if (!map.has(handoff.to)) map.set(handoff.to, handoff.title); });
    return map;
  }, [visibleHandoffs]);
  const live = useMemo(() => new Set(agents.filter((agent) => agent.active && !isHiddenAgent(agent.name)).map((agent) => agent.name)), [agents]);

  const stage = useMemo(() => layout(new Set(agents.map((agent) => agent.name)), live), [agents, live]);
  const pathOf = (from: string, to: string) => {
    const b = stage.boxes.get(to)!;
    const lead = GROUPS.find((group) => group.id === b.group)?.lead;
    return edgePath(stage.boxes.get(from)!, b, lead ? stage.boxes.get(lead) : undefined);
  };

  // One edge per pair of agents (not per hand-off): 24 hand-offs between the same two
  // agents used to draw 24 overlapping curves. Live beats failed beats anything else.
  const edges = useMemo(() => {
    const byPair = new Map<string, { from: string; to: string; state: string; active: boolean; count: number }>();
    const rank = (edge: { active: boolean; state: string }) => (edge.active ? 3 : edge.state === 'failed' ? 2 : 1);
    visibleHandoffs.slice(0, 40).forEach((handoff) => {
      const hops = handoff.steps?.length ? handoff.steps : [{ to: handoff.to, state: handoff.state }];
      let from = handoff.from;
      hops.forEach((hop, i) => {
        if (from !== hop.to && stage.boxes.has(from) && stage.boxes.has(hop.to)) {
          const key = `${from}→${hop.to}`;
          const next = { from, to: hop.to, state: hop.state, active: handoff.active && i === hops.length - 1, count: 1 };
          const seen = byPair.get(key);
          if (!seen) byPair.set(key, next);
          else byPair.set(key, { ...(rank(next) > rank(seen) ? next : seen), count: seen.count + 1 });
        }
        from = hop.to;
      });
    });
    // Draw quiet edges first so live ones sit on top.
    return [...byPair.entries()].map(([key, edge]) => ({ key, ...edge })).sort((a, b) => rank(a) - rank(b));
  }, [visibleHandoffs, stage]);

  if (!open) return null;
  const working = [...live];
  const shown = pick ? visibleHandoffs.filter((handoff) => handoff.from === pick || handoff.to === pick || handoff.steps?.some((step) => step.to === pick)) : visibleHandoffs;
  // Click = show only that agent's hand-offs AND open its "what it does" card.
  const toggle = (name: string) => { setPick((value) => (value === name ? null : name)); setInfo(name); };
  const hubBox = stage.boxes.get(HUB)!;
  const hubLive = live.has(HUB) || edges.some((edge) => edge.active && edge.from === HUB);
  return (
    <div className="flow-backdrop" onClick={onClose}>
      <section className="flow-dialog" role="dialog" aria-modal="true" aria-label="Agent team" onClick={(event) => event.stopPropagation()}>
        <header className="flow-head">
          <div>
            <span className="eyebrow">ORCHESTRATION / LAST 24 H</span>
            <h3>{working.length ? <>{working.length} working now <span className="flow-head-names">{working.map(personaOf).join(' · ')}</span></> : 'No agent is working right now'}</h3>
            <p>Bigkiji receives your tasks and hands them to a team lead; the lead hands them to its members. Tap anyone to see only their hand-offs.</p>
          </div>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={16} strokeWidth={1.6} /></button>
        </header>
        <div className="flow-body">
          <svg className="flow-stage" viewBox={`0 0 ${W} ${stage.height}`} role="img" aria-label="Agents and hand-offs">
            <defs>
              <pattern id="flow-dots" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".7" fill="rgba(255,241,255,.07)" /></pattern>
              <radialGradient id="flow-hub" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#ff4fa3" stopOpacity=".5" /><stop offset="100%" stopColor="#ff4fa3" stopOpacity="0" /></radialGradient>
              <filter id="flow-glow" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="2.4" /></filter>
              {edges.filter((edge) => edge.active).map((edge) => {
                const { p0, p3 } = pathOf(edge.from, edge.to);
                return <linearGradient key={edge.key} id={`fe-${edge.key.replace(/[^A-Za-z0-9]/g, '')}`} gradientUnits="userSpaceOnUse" x1={p0.x} y1={p0.y} x2={p3.x} y2={p3.y}>
                  <stop offset="0%" stopColor={agentTone(edge.from)} /><stop offset="100%" stopColor={agentTone(edge.to)} />
                </linearGradient>;
              })}
            </defs>
            <rect width={W} height={stage.height} fill="url(#flow-dots)" />

            {stage.panels.map((panel) => <g key={panel.id} className="flow-panel">
              <rect x={LEAD.x - 8} y={panel.y} width={W - LEAD.x + 4} height={panel.h} rx="12" fill={panel.tone} fillOpacity=".045" stroke={panel.tone} strokeOpacity=".2" />
              <text x={LEAD.x} y={panel.y + 12} className="flow-panel-label" fill={panel.tone}>{panel.label}</text>
            </g>)}
            <g className="flow-tree" aria-hidden="true">{stage.tree.map((line) => <path key={line.key} d={line.d} fill="none" stroke={line.tone} strokeOpacity=".55" strokeWidth="1" strokeDasharray="2 3" />)}</g>

            {edges.map((edge) => {
              const { d, mid } = pathOf(edge.from, edge.to);
              const dim = pick && edge.from !== pick && edge.to !== pick;
              const failed = edge.state === 'failed';
              const tone = failed ? STATE_TONE.failed : edge.active ? `url(#fe-${edge.key.replace(/[^A-Za-z0-9]/g, '')})` : agentTone(edge.to);
              return <g key={edge.key} className={`flow-edge ${edge.active ? 'is-active' : ''}`} opacity={dim ? 0.08 : edge.active ? 1 : failed ? 0.75 : 0.26}>
                {edge.active && <path d={d} stroke={tone} strokeWidth="6" fill="none" opacity=".18" filter="url(#flow-glow)" />}
                <path d={d} stroke={tone} strokeWidth={edge.active ? 2 : Math.min(2, 0.9 + Math.log2(edge.count) * 0.35)} fill="none" strokeLinecap="round" strokeDasharray={failed ? '3 4' : undefined} className="flow-edge-line" />
                {edge.active && !reduceMotion && [0, 0.9].map((begin) => <g key={begin}>
                  <circle r="4.5" fill={agentTone(edge.to)} filter="url(#flow-glow)"><animateMotion dur="1.8s" begin={`${begin}s`} repeatCount="indefinite" path={d} calcMode="spline" keyPoints="0;1" keyTimes="0;1" keySplines=".45 0 .25 1" /></circle>
                  <circle r="1.9" fill="#fff"><animateMotion dur="1.8s" begin={`${begin}s`} repeatCount="indefinite" path={d} calcMode="spline" keyPoints="0;1" keyTimes="0;1" keySplines=".45 0 .25 1" /></circle>
                </g>)}
                {failed && <g transform={`translate(${mid.x},${mid.y})`}><circle r="6" fill="#170828" stroke={STATE_TONE.failed} strokeWidth="1.2" /><path d="M-2.2,-2.2 L2.2,2.2 M2.2,-2.2 L-2.2,2.2" stroke={STATE_TONE.failed} strokeWidth="1.4" strokeLinecap="round" /></g>}
              </g>;
            })}

            <g className={`flow-hub ${hubLive ? 'is-active' : ''} ${pick === HUB ? 'is-picked' : ''}`} transform={`translate(${HUB_X},${hubBox.cy})`} role="button" tabIndex={0}
              aria-label={`${HUB}${hubLive ? ', routing now' : ''}`} onClick={() => toggle(HUB)} onKeyDown={(event) => { if (event.key === 'Enter') toggle(HUB); }}>
              <circle r="42" fill="url(#flow-hub)" className="flow-hub-glow" />
              <circle r="32" fill="none" stroke="#ff4fa3" strokeOpacity=".45" strokeDasharray="2 5" className="flow-hub-orbit" />
              <circle r="25" fill="#241034" stroke="#ff4fa3" strokeWidth="2" />
              <text className="flow-hub-face" dy="7">🐱</text>
              <text className="flow-hub-name" y="47">{HUB}</text>
              <text className="flow-hub-role" y="57">orchestrator</text>
              {models[HUB] && <text className="flow-chip-model" textAnchor="middle" y="67">{models[HUB]}</text>}
            </g>

            {[...stage.boxes.values()].filter((box) => box.kind !== 'hub').map((box) => {
              const tone = agentTone(box.name);
              const Icon = ICON[box.name] || Bot;
              const isLive = live.has(box.name);
              const task = doing.get(box.name);
              const lead = box.kind === 'lead';
              const rowH = lead ? LEAD.h : CHIP.row;
              return <g key={box.name} className={`flow-chip ${isLive ? 'is-live' : 'is-idle'} ${lead ? 'is-lead' : ''} ${pick === box.name ? 'is-picked' : ''}`} transform={`translate(${box.x},${box.y})`}
                style={{ '--tone': tone } as React.CSSProperties} role="button" tabIndex={0} aria-label={`${box.name}${isLive ? `, working now${task ? `: ${task}` : ''}` : ', idle'}`}
                onClick={() => toggle(box.name)} onKeyDown={(event) => { if (event.key === 'Enter') toggle(box.name); }}>
                <title>{`${personaOf(box.name)}${models[box.name] ? ` · ${models[box.name]}` : ''}${task ? ` — ${task}` : ''}`}</title>
                <rect className="flow-chip-bg" width={box.w} height={box.h} rx="9" />
                <rect x="4" y="5" width="2.6" height={box.h - 10} rx="1.3" fill={tone} opacity={isLive ? 1 : 0.45} />
                <Icon x={12} y={(rowH - 12) / 2} width={12} height={12} color={tone} strokeWidth={2} />
                <text className="flow-chip-name" x="29" y={rowH / 2 + (models[box.name] ? -1.5 : 3.6)}>{clip(personaOf(box.name), lead ? 12 : 24)}</text>
                {models[box.name] && <text className="flow-chip-model" x="29" y={rowH / 2 + 9}>{clip(models[box.name], lead ? 14 : 40)}</text>}
                {isLive
                  ? <g transform={`translate(${box.w - 11},${rowH / 2})`}><circle r="6" fill="none" stroke={tone} className="flow-chip-ping" /><circle r="3" fill={tone} /></g>
                  : <circle cx={box.w - 11} cy={rowH / 2} r="2.4" fill="none" stroke="rgba(255,241,255,.28)" />}
                {isLive && task && !lead && <text className="flow-chip-task" x="29" y={CHIP.row + 7.5}>{clip(task, 36)}</text>}
              </g>;
            })}
          </svg>
          <ol className="flow-log" aria-label="Hand-offs">
            {pick && <li className="flow-filter">Showing {pick} · <button type="button" onClick={() => setPick(null)}>show everyone</button></li>}
            {shown.length === 0 && <li className="flow-empty">No hand-offs in the last 24 hours.</li>}
            {shown.slice(0, 30).map((handoff) => {
              const hops = handoff.steps?.length ? handoff.steps : [{ to: handoff.to, state: handoff.state }];
              return <li key={handoff.id} className={handoff.active ? 'is-active' : ''}>
                <div className="flow-route">
                  <b style={{ color: agentTone(handoff.from) }}>{personaOf(handoff.from)}</b>
                  {hops.map((hop, i) => <span key={i} className="flow-hop"><i className="flow-arrow" aria-hidden="true">→</i><b style={{ color: agentTone(hop.to) }}>{personaOf(hop.to)}</b><em style={{ color: STATE_TONE[hop.state] || '#c3a8d1' }}>{hop.state}</em></span>)}
                  <time>{ago(handoff.at)}</time>
                </div>
                <strong>{handoff.title}</strong>
                <small>{handoff.team || handoff.boardName}{handoff.note ? ` · ${handoff.note}` : ''}</small>
              </li>;
            })}
          </ol>
        </div>
        {info && <AgentInfo name={info} model={models[info]} live={live.has(info)} onClose={() => setInfo(null)} />}
      </section>
    </div>
  );
}
