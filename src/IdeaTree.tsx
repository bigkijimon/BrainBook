// Idea tree, styled after a game skill tree: every idea is a round medallion on a winding path.
// Light tells you where it stands at a glance, for the owner and for agents:
//   gold, solid   = done            magenta, pulsing ring = in progress (with "next step")
//   cyan outline  = shaped (has requirements / TODO)      dim = seed (just an idea)
// Branches come from the tree (parent → child); ideas with no parent sit in their shelf's ring.
import React, { useMemo, useState } from 'react';
import { CheckCircle2, CircleDashed, FileText, Folder, FolderOpen, GitBranch, LayoutList, Network, Play, Sparkles } from 'lucide-react';
import type { BrainData, BrainNode, IdeaStage } from './BrainScene';

export const STAGE_LABEL: Record<IdeaStage, string> = { done: 'Done', active: 'In progress', shaped: 'Shaped', seed: 'Seed', parked: 'Parked', project: 'Project' };
const STAGE_ORDER: IdeaStage[] = ['active', 'shaped', 'seed', 'done', 'parked'];

type Placed = { node: BrainNode; x: number; y: number; r: number; parent: string | null; depth: number };

// Radial layout: shelves (AI / Agents, Study…) are sectors around the centre; within a sector,
// roots sit on the inner rings and their branches grow outward.
const layoutTree = (nodes: BrainNode[], branches: { source: string; target: string }[]) => {
  const ideaIds = new Set(nodes.map((node) => node.id));
  const parentOf = new Map<string, string>();
  for (const link of branches) if (ideaIds.has(link.source) && ideaIds.has(link.target) && !parentOf.has(link.target)) parentOf.set(link.target, link.source);
  const children = new Map<string, string[]>();
  parentOf.forEach((parent, child) => children.set(parent, [...(children.get(parent) || []), child]));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const groups = new Map<string, BrainNode[]>();
  for (const node of nodes) {
    if (parentOf.has(node.id)) continue;
    const key = node.group || 'Other';
    groups.set(key, [...(groups.get(key) || []), node]);
  }
  const rank = (node: BrainNode) => STAGE_ORDER.indexOf(node.stage || 'seed');
  const sectors = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  const total = nodes.length || 1;
  const placed: Placed[] = [];
  const labels: { text: string; x: number; y: number; angle: number }[] = [];
  let angle = -Math.PI / 2;
  const R0 = 118; const RING = 62;
  for (const [name, roots] of sectors) {
    const count = roots.reduce((sum, root) => sum + 1 + (children.get(root.id)?.length || 0), 0);
    const span = Math.max(0.28, (Math.PI * 2 * count) / total);
    labels.push({ text: name, x: Math.cos(angle + span / 2) * 96, y: Math.sin(angle + span / 2) * 96, angle: angle + span / 2 });
    const ordered = [...roots].sort((a, b) => rank(a) - rank(b));
    const perRing = Math.max(1, Math.floor((span * R0) / 50));
    ordered.forEach((root, index) => {
      const ring = Math.floor(index / perRing);
      const slot = index % perRing;
      const inRing = Math.min(perRing, ordered.length - ring * perRing);
      const a = angle + (span * (slot + 0.5)) / inRing + (ring % 2 ? span / (inRing * 4) : 0);
      const r = R0 + ring * RING;
      placed.push({ node: root, x: Math.cos(a) * r, y: Math.sin(a) * r, r: 22, parent: null, depth: 0 });
      const walk = (id: string, pa: number, pr: number, depth: number) => {
        const kids = children.get(id) || [];
        kids.forEach((kid, k) => {
          const node = byId.get(kid); if (!node) return;
          const ka = pa + (k - (kids.length - 1) / 2) * (0.5 / (pr / 100));
          const kr = pr + RING;
          placed.push({ node, x: Math.cos(ka) * kr, y: Math.sin(ka) * kr, r: 17, parent: id, depth });
          walk(kid, ka, kr, depth + 1);
        });
      };
      walk(root.id, a, r, 1);
    });
    angle += span;
  }
  // Gently push overlapping medallions apart.
  for (let pass = 0; pass < 40; pass += 1) for (let i = 0; i < placed.length; i += 1) for (let j = i + 1; j < placed.length; j += 1) {
    const a = placed[i]; const b = placed[j];
    const dx = b.x - a.x; const dy = b.y - a.y; const d = Math.hypot(dx, dy) || 0.01; const min = a.r + b.r + 12;
    if (d < min) { const push = (min - d) / 2; a.x -= (dx / d) * push; a.y -= (dy / d) * push; b.x += (dx / d) * push; b.y += (dy / d) * push; }
  }
  return { placed, labels };
};

// Soft S-curve between two medallions, like a hand-drawn trail.
const trail = (x1: number, y1: number, x2: number, y2: number) => {
  const mx = (x1 + x2) / 2; const my = (y1 + y2) / 2;
  const nx = -(y2 - y1) * 0.18; const ny = (x2 - x1) * 0.18;
  return `M${x1},${y1} Q${mx + nx},${my + ny} ${x2},${y2}`;
};

export function IdeaTree({ character, brain, area, selected, onSelect, onStart, onBranch, taskPaths }: {
  taskPaths?: Set<string>;
  character: { image: string };
  brain: BrainData | null;
  area: string;
  selected: string | null;
  onSelect: (node: BrainNode) => void;
  onStart: (node: BrainNode) => void;
  onBranch: (node: BrainNode) => void;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState<IdeaStage | 'all'>('all');
  // List (default) shows every idea by name; Tree shows the skill-tree map.
  const [view, setView] = useState<'list' | 'tree'>(() => (localStorage.getItem('brainbook.treeView') === 'tree' ? 'tree' : 'list'));
  const chooseView = (next: 'list' | 'tree') => { setView(next); localStorage.setItem('brainbook.treeView', next); };
  const ideas = useMemo(() => (brain?.nodes || []).filter((node) => node.kind === 'idea' && !taskPaths?.has((node as { path?: string }).path || node.id) && (area === 'all' || node.lifeArea === area)), [brain, area, taskPaths]);
  const branches = useMemo(() => (brain?.links || []).filter((link) => link.kind === 'branch'), [brain]);
  const wikilinks = useMemo(() => (brain?.links || []).filter((link) => link.kind === 'wikilink'), [brain]);
  const { placed, labels } = useMemo(() => layoutTree(ideas, branches), [ideas, branches]);
  const at = useMemo(() => new Map(placed.map((entry) => [entry.node.id, entry])), [placed]);
  const counts = useMemo(() => ideas.reduce<Record<string, number>>((acc, node) => { const key = node.stage || 'seed'; acc[key] = (acc[key] || 0) + 1; return acc; }, {}), [ideas]);
  const resume = useMemo(() => ideas.filter((node) => node.stage === 'active').sort((a, b) => String(b.progress?.lastAt || b.updatedAt).localeCompare(String(a.progress?.lastAt || a.updatedAt))).slice(0, 3), [ideas]);
  const extent = placed.reduce((max, entry) => Math.max(max, Math.abs(entry.x) + 46, Math.abs(entry.y) + 46), 200);
  const lit = (node: BrainNode) => stageFilter === 'all' || (node.stage || 'seed') === stageFilter;
  const focus = hover || selected;
  const near = useMemo(() => {
    if (!focus) return null;
    const set = new Set([focus]);
    for (const link of [...branches, ...wikilinks]) { if (link.source === focus) set.add(link.target); if (link.target === focus) set.add(link.source); }
    return set;
  }, [focus, branches, wikilinks]);

  return <section className="idea-tree" aria-label="Idea tree">
    <header className="tree-head">
      <div><span className="eyebrow">IDEA TREE</span><h3>Where every idea stands</h3></div>
      <div className="tree-view-switch" role="tablist" aria-label="Layout">
        <button type="button" role="tab" aria-selected={view === 'list'} className={view === 'list' ? 'on' : ''} onClick={() => chooseView('list')}><LayoutList size={14} strokeWidth={1.6} />List</button>
        <button type="button" role="tab" aria-selected={view === 'tree'} className={view === 'tree' ? 'on' : ''} onClick={() => chooseView('tree')}><Network size={14} strokeWidth={1.6} />Tree</button>
      </div>
      <div className="tree-legend" role="radiogroup" aria-label="Filter by stage">
        <button type="button" role="radio" aria-checked={stageFilter === 'all'} className={stageFilter === 'all' ? 'on' : ''} onClick={() => setStageFilter('all')}>All <b>{ideas.length}</b></button>
        {(['active', 'shaped', 'seed', 'done'] as IdeaStage[]).map((stage) => <button key={stage} type="button" role="radio" aria-checked={stageFilter === stage} className={`stage-${stage} ${stageFilter === stage ? 'on' : ''}`} onClick={() => setStageFilter(stageFilter === stage ? 'all' : stage)}><i />{STAGE_LABEL[stage]} <b>{counts[stage] || 0}</b></button>)}
      </div>
    </header>

    <div className="tree-body">
    {resume.length > 0 && <div className="resume-strip" aria-label="Pick up where you left off">
      <span className="eyebrow"><Play size={11} strokeWidth={2} /> PICK UP WHERE YOU LEFT OFF</span>
      {resume.map((node) => <article key={node.id} className="resume-card">
        <button type="button" className="resume-title" onClick={() => onSelect(node)}>{node.title}</button>
        {node.progress?.lastDid && <p><span>Last</span>{node.progress.lastDid}</p>}
        {node.progress?.next && <p className="resume-next"><span>Next</span>{node.progress.next}</p>}
        <button type="button" className="resume-go" onClick={() => onStart(node)}>▶ Continue in Hermes</button>
      </article>)}
    </div>}

    {view === 'list' ? <IdeaColumns ideas={ideas.filter(lit)} branches={branches} selected={selected} onSelect={onSelect} onStart={onStart} /> :
    <div className="tree-stage">
      {ideas.length === 0 ? <p className="tree-empty">No ideas here yet. Press <b>Dump</b> (D) to get them out of your head.</p> :
      <svg viewBox={`${-extent} ${-extent} ${extent * 2} ${extent * 2}`} role="img" aria-label={`${ideas.length} ideas`}>
        <defs>
          <radialGradient id="tree-done" cx="50%" cy="40%" r="60%"><stop offset="0" stopColor="#fff6dc" /><stop offset="1" stopColor="#ffc44d" /></radialGradient>
          <filter id="tree-glow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="5" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        {[118, 180, 242, 304, 366].map((r) => <circle key={r} r={r} className="tree-ring" />)}
        <circle r={48} className="tree-core" />
        <image href={character.image} x={-38} y={-38} width={76} height={76} className="tree-core-img" />
        {labels.map((label) => { const r = extent - 16; const x = Math.cos(label.angle) * r; const y = Math.sin(label.angle) * r; return <text key={label.text} x={x} y={y} className="tree-sector" textAnchor={x > 40 ? 'end' : x < -40 ? 'start' : 'middle'} dominantBaseline="central">{label.text.toUpperCase()}</text>; })}
        {placed.filter((entry) => !entry.parent).map((entry) => { const lx = Math.cos(Math.atan2(entry.y, entry.x)) * 50; const ly = Math.sin(Math.atan2(entry.y, entry.x)) * 50; return <path key={`core-${entry.node.id}`} d={trail(lx, ly, entry.x, entry.y)} className={`tree-trail root ${entry.node.stage === 'done' ? 'lit' : ''} ${near && !near.has(entry.node.id) ? 'faded' : ''}`} />; })}
        {placed.filter((entry) => entry.parent).map((entry) => { const p = at.get(entry.parent!); if (!p) return null; return <path key={`b-${entry.node.id}`} d={trail(p.x, p.y, entry.x, entry.y)} className={`tree-trail branch ${p.node.stage === 'done' ? 'lit' : ''} ${near && !(near.has(entry.node.id) && near.has(p.node.id)) ? 'faded' : ''}`} />; })}
        {wikilinks.map((link) => { const a = at.get(link.source); const b = at.get(link.target); if (!a || !b) return null; return <path key={`w-${link.source}-${link.target}`} d={trail(a.x, a.y, b.x, b.y)} className={`tree-trail wiki ${near && !(near.has(a.node.id) && near.has(b.node.id)) ? 'faded' : ''}`} />; })}
        {placed.map((entry) => {
          const stage = entry.node.stage || 'seed';
          const progress = entry.node.progress;
          const frac = progress && progress.total ? progress.done / progress.total : stage === 'done' ? 1 : 0;
          const C = 2 * Math.PI * (entry.r + 5);
          const dim = !lit(entry.node) || (near && !near.has(entry.node.id));
          return <g key={entry.node.id} transform={`translate(${entry.x} ${entry.y})`} className={`tree-node stage-${stage} ${selected === entry.node.id ? 'is-selected' : ''} ${dim ? 'is-dim' : ''}`}
            role="button" tabIndex={0} aria-label={`${entry.node.title} — ${STAGE_LABEL[stage]}${progress?.next ? `. Next: ${progress.next}` : ''}`}
            onClick={() => onSelect(entry.node)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(entry.node); } }}
            onMouseEnter={() => setHover(entry.node.id)} onMouseLeave={() => setHover(null)}>
            {stage === 'active' && <circle r={entry.r + 10} className="tree-pulse" />}
            <circle r={entry.r} className="tree-medal" filter={stage === 'done' || stage === 'active' ? 'url(#tree-glow)' : undefined} />
            {frac > 0 && stage !== 'done' && <circle r={entry.r + 5} className="tree-progress" strokeDasharray={`${C * frac} ${C}`} transform="rotate(-90)" />}
            <text className="tree-glyph" textAnchor="middle" dominantBaseline="central">{stage === 'done' ? '★' : stage === 'active' ? '▶' : stage === 'shaped' ? '◆' : '·'}</text>
            {(hover === entry.node.id || selected === entry.node.id || stage === 'active') && <text className="tree-title" y={entry.r + 16} textAnchor="middle">{entry.node.title.length > 26 ? `${entry.node.title.slice(0, 25)}…` : entry.node.title}</text>}
          </g>;
        })}
      </svg>}
    </div>}
    </div>
    <p className="tree-help"><CheckCircle2 size={12} /> gold = done · <Sparkles size={12} /> pulsing = in progress · <CircleDashed size={12} /> outline = shaped · dim = seed · <GitBranch size={12} /> trails = branches</p>
  </section>;
}

const STAGE_RANK: Record<string, number> = { active: 0, shaped: 1, seed: 2, done: 3, parked: 4 };

// Readable list: one column per shelf (AI / Agents, Study…). Each idea is a row with its status
// light, full name, and the next step (or last step) so anyone can see what to do next.
function IdeaColumns({ ideas, branches, selected, onSelect, onStart }: {
  ideas: BrainNode[];
  branches: { source: string; target: string }[];
  selected: string | null;
  onSelect: (node: BrainNode) => void;
  onStart: (node: BrainNode) => void;
}) {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const parentOf = useMemo(() => new Map(branches.map((link) => [link.target, link.source])), [branches]);
  const groups = useMemo(() => {
    const map = new Map<string, BrainNode[]>();
    for (const node of ideas) map.set(node.group || 'Other', [...(map.get(node.group || 'Other') || []), node]);
    return [...map.entries()]
      .map(([name, items]) => [name, items.sort((a, b) => (STAGE_RANK[a.stage || 'seed'] - STAGE_RANK[b.stage || 'seed']) || String(b.updatedAt).localeCompare(String(a.updatedAt)))] as const)
      .sort((a, b) => b[1].length - a[1].length);
  }, [ideas]);
  if (ideas.length === 0) return <p className="tree-empty">No ideas match. Press <b>Dump</b> (D) to add some.</p>;
  // Directory view: each shelf is a folder; ideas with branches are sub-folders.
  // Shelves start open; a click on a folder row collapses/expands it.
  const isOpen = (key: string) => openGroups[key] !== false;
  const toggle = (key: string) => setOpenGroups((value) => ({ ...value, [key]: !isOpen(key) }));
  const row = (node: BrainNode, ids: Set<string>, depth: number): React.ReactElement => {
    const stage = node.stage || 'seed';
    const kids = ideas.filter((child) => parentOf.get(child.id) === node.id && ids.has(child.id));
    const hint = node.progress?.next ? { label: 'Next', text: node.progress.next } : node.progress?.lastDid ? { label: 'Last', text: node.progress.lastDid } : null;
    const open = isOpen(node.id);
    return <li key={node.id} className={`dir-node idea-row stage-${stage} ${selected === node.id ? 'is-selected' : ''}`}>
      <div className="dir-line">
        {kids.length > 0
          ? <button type="button" className="dir-toggle" aria-expanded={open} aria-label={`${open ? 'Collapse' : 'Expand'} ${node.title}`} onClick={() => toggle(node.id)}>{open ? <FolderOpen size={16} strokeWidth={1.6} /> : <Folder size={16} strokeWidth={1.6} />}</button>
          : <span className="dir-leaf" aria-hidden="true"><FileText size={15} strokeWidth={1.6} /></span>}
        <button type="button" className="tree-row-open" onClick={() => onSelect(node)} title={node.summary || node.title}>
          <i className="idea-light" aria-label={STAGE_LABEL[stage]} />
          <span className="idea-row-text">
            <strong>{node.title}</strong>
            {hint ? <small><b>{hint.label}</b> {hint.text}</small> : node.summary && node.summary !== node.title && <small>{node.summary}</small>}
          </span>
          {node.progress && node.progress.total > 0 && <em className="idea-row-count">{node.progress.done}/{node.progress.total}</em>}
        </button>
        {stage !== 'done' && <button type="button" className="idea-row-go" title={stage === 'active' ? 'Continue in Hermes' : 'Start in Hermes'} aria-label={`${stage === 'active' ? 'Continue' : 'Start'} ${node.title} in Hermes`} onClick={() => onStart(node)}>▶</button>}
      </div>
      {kids.length > 0 && open && <ul className="dir-children">{kids.map((child) => row(child, ids, depth + 1))}</ul>}
    </li>;
  };
  return <ul className="dir-tree" role="tree">
    {groups.map(([name, items]) => {
      const ids = new Set(items.map((node) => node.id));
      const roots = items.filter((node) => !ids.has(parentOf.get(node.id) || ''));
      const done = items.filter((node) => node.stage === 'done').length;
      const key = `group:${name}`;
      const open = isOpen(key);
      return <li key={name} className="dir-node dir-group">
        <div className="dir-line">
          <button type="button" className="dir-toggle dir-group-toggle" aria-expanded={open} onClick={() => toggle(key)}>
            {open ? <FolderOpen size={18} strokeWidth={1.6} /> : <Folder size={18} strokeWidth={1.6} />}
            <h4>{name}</h4>
            <span className="dir-count">{done > 0 ? `${done}/${items.length} done` : items.length}</span>
          </button>
        </div>
        {open && <ul className="dir-children">{roots.map((node) => row(node, ids, 1))}</ul>}
      </li>;
    })}
  </ul>;
}
