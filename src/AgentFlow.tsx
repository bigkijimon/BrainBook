// Agent team popup: who is working, and who handed which task to whom (Hermes Kanban + AI Router).
// Redesigned 2026-09-30 (owner: "this animation's quality is far too low"). The old stage put
// every agent on one ellipse, so labels collided, lines crossed through the middle and the
// MoviePro panel had no place at all. The stage is now a structured flow, read left to right:
//   Bigkiji (hub)  →  team lead (Router, Steve)  →  members, grouped in team panels.
// Each live member shows what it is doing; a live hand-off carries a glowing packet along its
// path. Data comes from /api/agents/flow (read-only, refreshed every 8 s).
import { themePalette } from './theme-palette.mjs';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Bot, BookOpen, Clapperboard, Cpu, Eye, GraduationCap, Hammer, MemoryStick, Music, PenTool, Rabbit, Route, Scale, ScanEye, SearchCheck, Sparkles, Wrench, X } from 'lucide-react';
import { AgentInfo, memberTone } from './TeamRail';
import { personaOf } from './agentRoster';

type Step = { to: string; state: string };
export type Handoff = { id: string; source: 'kanban' | 'router' | 'session'; board: string; boardName: string; from: string; to: string; title: string; state: string; active: boolean; at: number | null; note: string; outcome?: string | null; steps?: Step[]; team?: string; recipientKind?: string; activityKind?: string; cardIdentity?: {board:string;id:string}; fromDepartment?: string; toDepartment?: string; senderBasis?: string; stage?: string; progress?: {percent?:number;completed?:number;total?:number;unit?:string;at?:number;basis?:string}; eta?: {finishAt?:number;at?:number;basis?:string} };
type Agent = { name: string; active: boolean; count: number };

const HUB = 'Bigkiji';
// The fixed roster (owner 2026-09-29), now grouped the way work actually flows.
// Anything else seen in a hand-off (old Hermes profiles, Codex, OpenCode) lands in OTHER.
const GROUPS: { id: string; label: string; lead: string | null; members: string[]; tone: string }[] = [
  // Owner 2026-09-30: every team shows its whole chain. MoviePro gained its two
  // departments; the content team (then BlogPro) was missing; Support reports straight to Bigkiji.
  // Owner 2026-10-02 ("まとめて"): MoviePro is one team, so its panel is named MoviePro alone.
  // One box per agent (see `layout`) keeps MiMo and Space Bunny — the script lane MoviePro now
  // carries — in the ENGINEER panel they were already drawn in, instead of duplicating them here.
  { id: 'eng', label: 'ENGINEER', lead: 'Router', members: ['MiMo', 'Space Bunny', 'Claude Code', 'Tora', 'Hana', 'Qwen (local)', 'Vision'], tone: themePalette.lavender },
  { id: 'accountpro', label: 'ACCOUNTPRO', lead: null, members: ['Router', 'MiMo', 'Space Bunny', 'Claude Code', 'Qwen (local)', 'Vision'], tone: themePalette.peach },
  { id: 'investpro', label: 'INVESTPRO', lead: null, members: ['Router', 'MiMo', 'Space Bunny', 'Claude Code', 'Qwen (local)', 'Vision'], tone: themePalette.lavender },
  { id: 'rentpro', label: 'RENTPRO', lead: null, members: ['Router', 'MiMo', 'Space Bunny', 'Claude Code', 'Qwen (local)', 'Vision'], tone: themePalette.coral },
  { id: 'marketpro', label: 'CREATIVEPRO · MARKETING', lead: null, members: ['Router', 'MiMo', 'Space Bunny', 'Claude Code', 'Qwen (local)', 'Vision'], tone: themePalette.lilac },
  { id: 'movie', label: 'MOVIEPRO', lead: 'Steve', members: ['HideoKojima', 'RyūichiSakamoto', 'Shimajiro', 'Ame', 'Maru', 'ComfyUI', 'Auto QA', 'Kuro'], tone: themePalette.coral },
  { id: 'blog', label: 'CREATIVEPRO · CONTENT', lead: 'CreativeProTop-Momo', members: ['Coco', 'Blog QA', 'Tech Blog QA'], tone: themePalette.pink },
  { id: 'support', label: 'SUPPORT · REPORTS TO BIGKIJI', lead: null, members: ['Pi', 'Jev'], tone: themePalette.coral },
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
export const agentTone = (name: string) => (name === HUB ? themePalette.pink : memberTone(name));
const STATE_TONE: Record<string, string> = { working: themePalette.pink, done: themePalette.peach, failed: '#ff5a6e', 'needs you': themePalette.coral, queued: themePalette.lavender, waiting: themePalette.secondary, scheduled: themePalette.lilac, 'left over': '#8a7896' };
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
  // False after a failed refresh: "no agent is working" must not be shown when the truth is "unknown".
  const [available, setAvailable] = useState(false);
  const [readAt, setReadAt] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const response = await fetch(`/api/agents/flow?since=${Math.floor(Date.now() / 1000) - 86400}`, { cache: 'no-store' });
        if (!response.ok) throw new Error(String(response.status));
        const next = await response.json();
        if (alive) { setData({ handoffs: Array.isArray(next.handoffs) ? next.handoffs : [], agents: Array.isArray(next.agents) ? next.agents : [] }); setAvailable(true); setReadAt(Date.now() / 1000); }
      } catch { if (alive) setAvailable(false); /* optional feed: the app works without it */ }
    };
    void load();
    const timer = window.setInterval(load, open ? 8000 : 30000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [open]);
  return { ...data, available, readAt };
}

// ── Stage geometry (SVG user units; the stage scales to its pane) ──
// One place owns how the map is drawn, because everything here is a trade against everything
// else: the drawing is sized in user units and painted at min(pane width / viewBox width, cap /
// viewBox height), so widening the drawing narrows the scale — unless the width was idle, which
// is exactly what round 2 found.
//
// Round 1 (2026-09-30) drew one 452-unit column: hub at 46, a lead box at 112 and 222-unit chips
// at 226. At 1440×900 the stage box is the full width of its grid column (~749px) and the drawing
// is letterboxed inside it, so the pane held 335px of drawing and 27% dead band on each side.
// Nothing about that was visible in the numbers, only in the type: the 12.5-unit name painted at
// ~9.5px and the 7.5-unit model line at ~5.7px, and the measured ink boxes were ~7px and ~5px.
// The 2026-09-30 note that "width was never scarce" was true about height and wrong about the
// result: height was capped at ~668px, so the drawing was width-limited at 749/452 and every
// label paid for the bands.
//
// Round 2 (A2) spends the pane instead. Above the 1200px breakpoint the map is two columns —
// ENGINEER, SUPPORT, OTHER on the left and MOVIEPRO, BLOGPRO on the right — and the viewBox is the
// drawing's own width, so the pane is filled end to end and there is no band to letterbox into.
// Width is the binding term and height is not, which is the whole reason the two columns can hold
// the same 20 agents without the type shrinking: 10 boxes in the left stack (8 + 2, and up to 6
// more under OTHER) and 12 in the right (9 + 3). The extra width is spent twice, on scale and on
// the chips: a lead that stacks above its members gives every chip the whole column instead of
// 222 of 336 units, and a wider chip is what lets the model line — the unreadable one — be set at
// a real size and still fit inside its box. The type sizes live in the same table as the boxes and
// are handed to the stylesheet as custom properties, so a chip and the text in it cannot drift
// apart.
//
// Round 5 measured what the two columns cost, and it was not scale: 8 of the 21 boxes shared a
// rectangle with another box. Two columns put the lead card at the same y as the first member, so
// that member was painted under it (3 pairs at 1440×900), and the one-column drawing had lost the
// offset its lead box has always reserved, so the lead sat on top of members 3-4 of its own group
// (5 pairs at 390×844). One bug in two places: the column's own width rule reserved lead 102 + gap
// 12 + chip 222, but nothing spent it. It is now spent in columnsOf(), next to the rule that
// reserves it, and a stacked lead gets a row of its own — so no two boxes in this drawing can share
// a rectangle, which is the invariant scripts/check-agent-map.mjs asserts.
//
// The numbers below are chosen against the scale the drawing will actually paint at, so the type
// can be checked on paper instead of in a screenshot. At 1440×900 the pane is ~747px and the stage
// cap is 668px, so a 624 × 517 drawing is width-bound at 1.197: a 13.5-unit name paints at 16.2px
// and its 11.5-unit model line at 13.8px, i.e. ink boxes of ~11.8px and ~10.1px (cap height
// ≈ 0.73em). Both clear the 11px / 9px floors, and 240-unit chips are what leave a 28-character
// model id ("vLLM Semantic Router + rules") room: at 17-unit names the same string was clipped to
// "vLLM Semantic Router + …". The 517-unit height is what keeps the drawing width-bound — the cap
// term (668/517 = 1.29) has to stay above the width term — so about 35 units of height can be
// added, which is two live chips at 14 units each, before the type starts paying for it.
//
// The gutter is 112 units in both modes because it is Bigkiji's, and it is the only thing the hub
// label is allowed to use: the label block is 88 units wide, so it cannot reach the first panel's
// left edge at 104. That is also why the hub's model id is set on two lines rather than clipped —
// "Claud…" is not a label — with the full string kept in the hub's own <title>.
//
// Below the breakpoint nothing moves: STAGE.one reproduces the round-1 drawing unit for unit,
// including the lead box beside the members and the 452-unit viewBox width.
const HUB_X = 56;      // Bigkiji's centre, centred in the gutter. The left edge of every drawing.
const STAGE = {
  one: {
    columns: 1, colGap: 0, leadBeside: true,
    gutter: 112, leadW: 102, leadGap: 12, chipW: 222,
    row: 32, liveRow: 44, gap: 5, leadH: 40,
    // The three bands a panel spends before its first box: `head` clears the group label, `pad`
    // closes the panel under the last box, `panelGap` is the air between two panels.
    head: 18, pad: 8, panelGap: 10,
    // Name and model sit on the centre line of the top row; the live chip grows downward and the
    // task line goes under it, so a chip's text never shifts when it starts working.
    nameDy: { idle: 3.6, model: -1.5 }, modelDy: 9, taskY: 7.5,
    // Cap height ≈ 0.73em is what these are for: an ink box of f×0.73em, the smallest a line of
    // this text can measure. Leads and members share one name size — the difference between them is
    // weight and the box under them, not a second size, because the character budget below is
    // computed from this one and a bigger lead would overflow its own budget.
    type: { name: 12.5, model: 7.5, task: 9, panel: 10, hubName: 11.5, hubRole: 7.5, hubModel: 7.5 }, icon: 12,
    // The hub's label block, centred in the gutter: name, role, then the model id on one line here
    // and on two in two columns, where the gutter is the same width but the type is bigger.
    hubLabelW: 88, hubModelLines: 1, hubModelStep: 9,
    hubLabelY: [47, 57, 67],
  },
  two: {
    columns: 2, colGap: 24, leadBeside: false,
    gutter: 112, leadW: 102, leadGap: 12, chipW: 240,
    // A 32-unit row holds a 13.5-unit name over an 11.5-unit model line (the block of type is 27
    // units of ink) and still leaves 2 units under the cap and 3 under the descenders; a live chip is
    // 14 units taller, which is the task line. Round 1 could afford the same 32 because its type was
    // half this size: the row is what the height cap is spent on, so it can only shrink as far as
    // the type.
    row: 32, liveRow: 46, gap: 3, leadH: 36,
    head: 16, pad: 6, panelGap: 6,
    nameDy: { idle: 4.5, model: -4 }, modelDy: 9.5, taskY: 10,
    type: { name: 13.5, model: 11.5, task: 13, panel: 11, hubName: 13.5, hubRole: 9, hubModel: 9.5 }, icon: 14,
    hubLabelW: 88, hubModelLines: 2, hubModelStep: 11,
    hubLabelY: [46, 59, 71],
  },
} as const;
type StageSpec = (typeof STAGE)['one' | 'two'];
// Which teams take the right-hand column above the breakpoint. Anything not named here — every
// team added later, and OTHER — stays in the left column in GROUPS order, so a new team can never
// silently fall out of the drawing.
const RIGHT_COLUMNS = new Set(['movie', 'blog']);
type Box = { name: string; kind: 'hub' | 'lead' | 'member'; x: number; y: number; w: number; h: number; cy: number; group: string };
type Panel = { id: string; label: string; tone: string; x: number; w: number; y: number; h: number };
// A team the stage cannot draw: no lead box and no member box of its own. Named below the stage.
type Pool = { id: string; label: string; tone: string };
// One column of the drawing: where it starts, how wide it is, where its chips start inside it, where
// its hand-off spine runs, and the right edge its team panels are measured from.
type Column = { x: number; w: number; chipX: number; spineX: number; right: number };

// The columns, left to right. The viewBox width is the last column's right edge, so the drawing is
// sized to its own content in either mode and the pane has no dead band to letterbox into.
function columnsOf(spec: StageSpec): Column[] {
  const columns: Column[] = [];
  let x = spec.gutter;
  for (let i = 0; i < spec.columns; i += 1) {
    // `leadBeside` is the only switch, and it decides all three numbers below from one place,
    // because deciding them separately is how round 5 found the bug: the width reserved room for
    // a lead beside the stack (lead 102 + gap 12 + chip 222) and nothing ever moved the chips into
    // it, so every lead sat on top of the middle of its own group. Beside, the column is lead +
    // gap + chip and the chips start after the lead — in the same 12-unit gap the spine runs in.
    // Stacked, the lead is a chip-wide card on a row of its own and the column is one chip wide;
    // its spine then has to run down the panel's own 8-unit left margin, since there is no gap
    // between the lead and the members to put it in.
    const beside = spec.leadW + spec.leadGap;
    const w = spec.leadBeside ? beside + spec.chipW : spec.chipW;
    columns.push({ x, w, chipX: x + (spec.leadBeside ? beside : 0), spineX: spec.leadBeside ? x + spec.leadW + spec.leadGap / 2 : x - 6, right: x + w + 4 });
    x = columns[columns.length - 1].right + spec.colGap;
  }
  return columns;
}

// How many characters of `em`-sized text fit on one line of a chip `w` units wide. Text starts at
// x=29 (past the tone bar and the icon) and has to stop short of the status dot at x=w−11, so the
// line is w−44 units; Manrope sets about 0.58em a character and JetBrains Mono exactly 0.6em. The
// budget is arithmetic rather than a hand-tuned number, which is what lets the two-column chips be
// 240 units wide without their text being re-clipped by eye. Whatever is cut stays in the chip's
// <title> and in the AgentInfo card.
const chars = (em: number, perChar: number, w: number) => Math.max(6, Math.floor((w - 44) / (em * perChar)));

// Bigkiji's label is centred in the gutter rather than padded like a chip, so it gets its own
// budget: every one of its lines has to fit `hubLabelW`, which is what keeps the whole block clear
// of the first panel's left edge.
const hubChars = (spec: StageSpec) => Math.max(6, Math.floor(spec.hubLabelW / (spec.type.hubModel * 0.6)));

// A model id broken into at most `lines` lines of `per` characters, so the hub's own line can be
// read instead of clipped to "Claud…". Words are kept whole where there is a space to break at; what
// still will not fit is marked with an ellipsis rather than dropped, and the full string stays in
// the hub's <title>.
function wrapLabel(text: string, per: number, lines: number): string[] {
  const out: string[] = [];
  let rest = text.trim();
  while (rest && out.length < lines) {
    if (rest.length <= per) { out.push(rest); rest = ''; break; }
    const space = rest.lastIndexOf(' ', per);
    const cut = space > 0 ? space : per;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out[out.length - 1] = clip(`${out[out.length - 1]} ${rest}`, per);
  return out;
}

function layout(names: Set<string>, live: Set<string>, twoColumn: boolean) {
  const boxes = new Map<string, Box>();
  const panels: Panel[] = [];
  const known = new Set(GROUPS.flatMap((group) => [group.lead, ...group.members]).filter(Boolean) as string[]);
  // 'You' is the owner sending work from a Hermes session; it is a sender, not a member box.
  const other = [...names].filter((name) => name !== HUB && name !== 'You' && !known.has(name) && !isHiddenAgent(name)).slice(0, 6);
  const groups = [...GROUPS, ...(other.length ? [{ id: 'other', label: 'OTHER', lead: null, members: other, tone: '#8a7896' }] : [])];
  // One box per agent (owner 2026-10-04). ACCOUNTPRO / INVESTPRO / RENTPRO / MARKETPRO are the
  // same six engineers as ENGINEER, and boxes is keyed by agent name, so the last team to write
  // an agent used to win: three panels were labelled but held nothing, all six boxes ended up
  // inside MARKETPRO, the viewBox grew from 874 to 1886 units (the stage is height-capped, so
  // every chip and its name scaled down with it) and the connectors below were built five deep.
  // The first team that lists an agent now owns its box. A team that owns neither a box nor
  // a lead must not be shipped as a panel claiming agents it does not have, and it must not be
  // dropped either (that is what made the four pool-only teams invisible), so it leaves the
  // drawing altogether and comes back in `pools` for the panel to list under the stage.
  // Height was the scarce resource: the stage is height-capped, so every extra user unit divides
  // into the scale that paints all of the stage's type. Four one-line bands still cost 128 units
  // (874 → 1002, −6.6% scale) to say what one line of text says. Spending none of it here leaves
  // the four box-owning panels at 874 units, which is what the drawing had before those teams
  // existed and what the stage still fits at its own type size.
  const owned = new Set<string>();
  const pools: Pool[] = [];
  // The columns this drawing has, and one y cursor per column: ownership is still claimed in
  // GROUPS order whatever column a team lands in, so a shared agent ends up in exactly the team
  // that owns it today (ENGINEER takes the six engineers before MARKETPRO is even offered them).
  const spec = twoColumn ? STAGE.two : STAGE.one;
  const columns = columnsOf(spec);
  const columnAt = (id: string) => (twoColumn && RIGHT_COLUMNS.has(id) ? 1 : 0);
  const cursors = columns.map(() => 10);
  for (const group of groups) {
    const at = columnAt(group.id);
    const column = columns[at];
    const leadName = group.lead && !owned.has(group.lead) ? group.lead : null;
    const mine = group.members.filter((name) => !owned.has(name) && name !== leadName);
    if (!leadName && mine.length === 0) {
      pools.push({ id: group.id, label: group.label, tone: group.tone });
      continue;
    }
    let y = cursors[at];
    const top = y;
    y += spec.head;
    // A stacked lead takes a row of its own, above its members, before the member loop starts.
    // Rounds 3-4 placed it at `top + 18` — the same y the first member was placed at — so the first
    // member was drawn exactly under it and two boxes shared one rectangle: three such pairs at
    // 1440x900 ("Implement" under "APPTeamTop") and five more once the chips had their own column
    // back. Placing it here is what makes `first` mean one thing for both branches below.
    if (leadName && !spec.leadBeside) {
      owned.add(leadName);
      boxes.set(leadName, { name: leadName, kind: 'lead', x: column.x, y, w: column.w, h: spec.leadH, cy: y + spec.leadH / 2, group: group.id });
      y += spec.leadH + spec.gap;
    }
    const first = y;
    // Where a chip's text starts inside its own box, and how far it may run: text begins 29 units
    // in (past the tone bar and the icon) and stops short of the status dot at w−11. One budget
    // drives both columns, so a chip can get wider without its text being re-tuned by hand.
    for (const name of mine) {
      owned.add(name);
      const h = live.has(name) ? spec.liveRow : spec.row;
      const indent = depthOf(name) * INDENT;
      boxes.set(name, { name, kind: 'member', x: column.chipX + indent, y, w: spec.chipW - indent, h, cy: y + spec.row / 2, group: group.id });
      y += h + spec.gap;
    }
    const last = mine.length ? y - spec.gap : first;
    if (leadName && spec.leadBeside) {
      owned.add(leadName);
      // One column: the lead sits beside its members, on the vertical centre of the stack, in the
      // leadW + leadGap the column reserved for it (columnsOf above) and clear of every chip in x.
      const cy = (first + last) / 2;
      boxes.set(leadName, { name: leadName, kind: 'lead', x: column.x, y: cy - spec.leadH / 2, w: spec.leadW, h: spec.leadH, cy, group: group.id });
    }
    // `last` is already below a stacked lead (the members start under it) and a lead beside the
    // stack adds no height, so one line closes every panel under its own last box.
    y = last + spec.pad;
    // A team panel wraps its own column only, 8 units of air to the left of its stack and 4 past
    // its chips, so two columns read as two panels side by side rather than two bands across both.
    panels.push({ id: group.id, label: group.label, tone: group.tone, x: column.x - 8, w: column.right - column.x + 4, y: top, h: y - top });
    y += spec.panelGap;
    cursors[at] = y;
  }
  const height = Math.max(...cursors, 200);
  const width = columns[columns.length - 1].right;
  boxes.set(HUB, { name: HUB, kind: 'hub', x: HUB_X - 25, y: height / 2 - 25, w: 50, h: 50, cy: height / 2, group: 'hub' });
  // Static reporting lines: hub → each lead (and Support members), lead → its direct members,
  // parent → sub-member as a tree elbow. Drawn faintly under the live hand-off edges.
  const tree: { key: string; d: string; tone: string }[] = [];
  const hubBox = boxes.get(HUB)!;
  for (const group of groups) {
    // A connector may only leave this team's own boxes. Reading boxes.get(name) blindly let a
    // shared agent's box be used as another panel's lead, which put its spine past the viewBox,
    // and repeated one `m-<name>` key per team that listed the agent.
    const mine = (name: string): Box | null => { const box = boxes.get(name); return box && box.group === group.id ? box : null; };
    const lead = group.lead ? mine(group.lead) : null;
    const direct = group.members.filter((name) => !SUB_PARENT[name] && mine(name)).map((name) => mine(name)!);
    // The hub always reaches every team's lead, in whichever column that lead is drawn — that is
    // the two-column hand-off the owner asked for, and it costs nothing here because the curve
    // only has to travel further.
    if (lead) tree.push({ key: `h-${group.id}`, tone: group.tone, d: `M${HUB_X + 25},${hubBox.cy} C${HUB_X + 55},${hubBox.cy} ${lead.x - 30},${lead.cy} ${lead.x},${lead.cy}` });
    // A team with no lead box has no spine of its own, so its members hang off the one gutter to
    // the left of the chips — the same run Support has always used, and clear of every chip. With a
    // lead that stacks above its members the spine runs down the panel's left margin instead,
    // which is the same run without a horizontal hop. Either way it is the column's own spineX,
    // which is the one place that knows where a column's margin is.
    const column = columns[columnAt(group.id)];
    const spineX = column.spineX;
    if (direct.length) {
      const top = Math.min(lead?.cy ?? Infinity, direct[0].cy);
      const bottom = Math.max(lead?.cy ?? -Infinity, direct[direct.length - 1].cy);
      if (lead && spec.leadBeside) tree.push({ key: `l-${group.id}`, tone: group.tone, d: `M${lead.x + lead.w},${lead.cy} H${spineX}` });
      tree.push({ key: `s-${group.id}`, tone: group.tone, d: `M${spineX},${top} V${bottom}` });
      for (const box of direct) tree.push({ key: `m-${group.id}-${box.name}`, tone: group.tone, d: `M${spineX},${box.cy} H${box.x}` });
      if (!lead) tree.push({ key: `hs-${group.id}`, tone: group.tone, d: `M${HUB_X + 25},${hubBox.cy} C${HUB_X + 90},${hubBox.cy} ${spineX - 60},${(top + bottom) / 2} ${spineX},${(top + bottom) / 2}` });
    }
    for (const name of group.members.filter((member) => SUB_PARENT[member] && mine(member))) {
      const box = mine(name); const parent = mine(SUB_PARENT[name]);
      if (!box || !parent) continue;
      const x = parent.x + 8;
      tree.push({ key: `c-${group.id}-${name}`, tone: group.tone, d: `M${x},${parent.y + parent.h} V${box.cy} H${box.x}` });
    }
  }
  return { boxes, panels, pools, height, width, tree, spec };
}

// Horizontal-tangent cubic between two boxes. Links between two chips of one column bow out to the
// left, so no line ever runs through a chip or through the hub. A hand-off that crosses into the
// next column leaves to the right instead: the target's left side is its only free side there, and
// the first column's chips are painted after the edges, so the run across them reads as passing
// behind the cards rather than through them.
function edgePath(a: Box, b: Box, lead?: Box) {
  const right = (box: Box) => ({ x: box.kind === 'hub' ? HUB_X + 25 : box.x + box.w, y: box.cy });
  const left = (box: Box) => ({ x: box.kind === 'hub' ? HUB_X + 25 : box.x, y: box.cy });
  // Hub straight to a member (Bigkiji handing work to MiMo without the Router): the lead's
  // box sits in the way, so pass it just above or below instead of through it. Round 2 stacks the
  // lead above its own column and indents the members under it, so the two boxes are one x apart
  // only by accident; leave the detour to the case where the lead really is between them.
  if (a.kind === 'hub' && b.kind === 'member' && lead && b.x > lead.x && b.x < lead.x + lead.w) {
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
  // A target that starts to the right of the source's right edge is in a later column, so it can
  // never be reached by bowing left: the bow would have to travel back across the source chip and
  // the whole gutter first. Those pairs take the plain forward route, which the first column's
  // chips paint over.
  const later = b.x > a.x + a.w;
  if (a.kind === b.kind && a.kind !== 'hub' && !later) {
    p0 = left(a); p3 = left(b);
    const bow = Math.min(64, 18 + Math.abs(p3.y - p0.y) * 0.22);
    c1 = { x: p0.x - bow, y: p0.y }; c2 = { x: p3.x - bow, y: p3.y };
  } else {
    const forward = a.kind === 'hub' || (a.kind === 'lead' && b.kind === 'member') || later;
    p0 = forward ? right(a) : left(a); p3 = forward ? left(b) : right(b);
    const dx = (p3.x - p0.x) * 0.55;
    c1 = { x: p0.x + dx, y: p0.y }; c2 = { x: p3.x - dx, y: p3.y };
  }
  const mid = { x: (p0.x + 3 * c1.x + 3 * c2.x + p3.x) / 8, y: (p0.y + 3 * c1.y + 3 * c2.y + p3.y) / 8 };
  return { d: `M${p0.x},${p0.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${p3.x},${p3.y}`, p0, p3, mid };
}

// The map's two-column breakpoint is written once, in styles.css: one `@media (min-width: 1200px)`
// block — the same one that widens the dialog — publishes `--flow-cols` on :root, and this reads it
// back. CSS owns the number because a media query cannot read a custom property back out, and the
// dialog width and the drawing must never disagree about it; there is deliberately no 1200 in this
// file to fall out of step with it. Read on resize, not once at mount: the dialog can be resized
// across the breakpoint while it is open.
function useTwoColumns() {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener('resize', onChange);
      return () => window.removeEventListener('resize', onChange);
    },
    () => (typeof document === 'undefined' ? false : getComputedStyle(document.documentElement).getPropertyValue('--flow-cols').trim() === '2'),
    () => false,
  );
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
  const twoColumn = useTwoColumns();

  const stage = useMemo(() => layout(new Set(agents.map((agent) => agent.name)), live, twoColumn), [agents, live, twoColumn]);
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
  // The one table of type sizes. `spec.type` sets the baselines and the character budgets above;
  // publishing the same numbers as custom properties is what sets the font-size the stylesheet
  // paints. Round 2 had a second copy of these values in a media query in styles.css, and the two
  // disagreed (16 units against 14px), which is how a chip grew taller while its text stayed small.
  // Leads and members share one name size, so the lead needs no size of its own here.
  const typeStyle = {
    '--flow-name-size': `${stage.spec.type.name}px`,
    '--flow-model-size': `${stage.spec.type.model}px`,
    '--flow-task-size': `${stage.spec.type.task}px`,
    '--flow-panel-size': `${stage.spec.type.panel}px`,
    '--flow-hub-name-size': `${stage.spec.type.hubName}px`,
    '--flow-hub-role-size': `${stage.spec.type.hubRole}px`,
    '--flow-hub-model-size': `${stage.spec.type.hubModel}px`,
  } as React.CSSProperties;
  return (
    <div className="flow-backdrop" onClick={onClose}>
      <section className="flow-dialog" role="dialog" aria-modal="true" aria-label="Agent team" onClick={(event) => event.stopPropagation()}>
        <header className="flow-head">
          <div>
            <span className="eyebrow">ORCHESTRATION / LAST 24 H</span>
            <h3>{working.length ? <>{working.length} working now <span className="flow-head-names">{working.map(personaOf).join(' · ')}</span></> : 'No agent is working right now'}</h3>
            <p>Bigkiji receives your tasks and hands them to a team lead; the lead hands them to its members. Select anyone to see only their hand-offs.</p>
          </div>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={16} strokeWidth={1.6} /></button>
        </header>
        <div className="flow-body">
          {/* The viewBox is the drawing's own size (stage.width × stage.height), not a fixed 452,
              so the map fills the pane at whatever scale that leaves no letterbox band. The dots
              tile follows it, so the background covers the same width as the drawing. The type
              sizes ride in as custom properties (typeStyle above) rather than a second table in the
              stylesheet, so the labels below cannot drift away from the boxes they sit in. */}
          <svg className="flow-stage" viewBox={`0 0 ${stage.width} ${stage.height}`} style={typeStyle} role="img" aria-label="Agents and hand-offs">
            <desc>Bigkiji hands work to a team lead, and each lead hands it to its members. Support reports straight to Bigkiji.</desc>
            <defs>
              <pattern id="flow-dots" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".7" fill="rgba(255,241,255,.07)" /></pattern>
              <radialGradient id="flow-hub" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor={themePalette.pink} stopOpacity=".5" /><stop offset="100%" stopColor={themePalette.pink} stopOpacity="0" /></radialGradient>
              <filter id="flow-glow" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="2.4" /></filter>
              {edges.filter((edge) => edge.active).map((edge) => {
                const { p0, p3 } = pathOf(edge.from, edge.to);
                return <linearGradient key={edge.key} id={`fe-${edge.key.replace(/[^A-Za-z0-9]/g, '')}`} gradientUnits="userSpaceOnUse" x1={p0.x} y1={p0.y} x2={p3.x} y2={p3.y}>
                  <stop offset="0%" stopColor={agentTone(edge.from)} /><stop offset="100%" stopColor={agentTone(edge.to)} />
                </linearGradient>;
              })}
            </defs>
            <rect width={stage.width} height={stage.height} fill="url(#flow-dots)" />

            {stage.panels.map((panel) => <g key={panel.id} className="flow-panel">
              <rect x={panel.x} y={panel.y} width={panel.w} height={panel.h} rx="12" fill={panel.tone} fillOpacity=".045" stroke={panel.tone} strokeOpacity=".2" />
              <text x={panel.x + 8} y={panel.y + 12} className="flow-panel-label" fill={panel.tone}>{panel.label}</text>
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
              aria-label={`${HUB}${hubLive ? ', routing now' : ''}${models[HUB] ? `, ${models[HUB]}` : ''}`} onClick={() => toggle(HUB)} onKeyDown={(event) => { if (event.key === 'Enter') toggle(HUB); }}>
              {/* The full model id, because the label below can wrap it but cannot always fit it, and
                  the group is also a button whose accessible name has to carry it. */}
              <title>{`${HUB} · coordinator${models[HUB] ? ` · ${models[HUB]}` : ''}`}</title>
              <circle r="42" fill="url(#flow-hub)" className="flow-hub-glow" />
              <circle r="32" fill="none" stroke={themePalette.pink} strokeOpacity=".45" strokeDasharray="2 5" className="flow-hub-orbit" />
              <circle r="25" fill="#241034" stroke={themePalette.pink} strokeWidth="2" />
              <text className="flow-hub-face" dy="7">🐱</text>
              <text className="flow-hub-name" y={stage.spec.hubLabelY[0]}>{HUB}</text>
              <text className="flow-hub-role" y={stage.spec.hubLabelY[1]}>coordinator</text>
              {/* Centred under the cat, so this line may run neither side of x=0 however long the
                  model name is, and wrapped rather than clipped: at one line the budget in the
                  gutter was 6 characters, which is the "Claud…" round 5 measured. Every line fits
                  hubLabelW, which is what keeps the whole block left of the first panel's edge. */}
              {models[HUB] && wrapLabel(models[HUB], hubChars(stage.spec), stage.spec.hubModelLines).map((line, i) => (
                <text key={line} className="flow-chip-model flow-hub-model" textAnchor="middle" y={stage.spec.hubLabelY[2] + i * stage.spec.hubModelStep}>{line}</text>
              ))}
            </g>

            {[...stage.boxes.values()].filter((box) => box.kind !== 'hub').map((box) => {
              const tone = agentTone(box.name);
              const Icon = ICON[box.name] || Bot;
              const isLive = live.has(box.name);
              const task = doing.get(box.name);
              const lead = box.kind === 'lead';
              const rowH = lead ? stage.spec.leadH : stage.spec.row;
              return <g key={box.name} className={`flow-chip ${isLive ? 'is-live' : 'is-idle'} ${lead ? 'is-lead' : ''} ${pick === box.name ? 'is-picked' : ''}`} transform={`translate(${box.x},${box.y})`}
                style={{ '--tone': tone } as React.CSSProperties} role="button" tabIndex={0} aria-label={`${box.name}${isLive ? `, working now${task ? `: ${task}` : ''}` : ', idle'}`}
                onClick={() => toggle(box.name)} onKeyDown={(event) => { if (event.key === 'Enter') toggle(box.name); }}>
                <title>{`${personaOf(box.name)}${models[box.name] ? ` · ${models[box.name]}` : ''}${task ? ` — ${task}` : ''}`}</title>
                <rect className="flow-chip-bg" width={box.w} height={box.h} rx="9" />
                <rect x="4" y="5" width="2.6" height={box.h - 10} rx="1.3" fill={tone} opacity={isLive ? 1 : 0.45} />
                <Icon x={12} y={(rowH - stage.spec.icon) / 2} width={stage.spec.icon} height={stage.spec.icon} color={tone} strokeWidth={2} />
                {/* Text starts at x=29 in every chip and stops short of the status dot at x=w−11.
                    The character budget is per column count (chars above) because that is what the
                    chip width is, and it is what keeps a name or a model string off its own box.
                    Nothing is lost by clipping: the full text is in this chip's <title> below. */}
                <text className="flow-chip-name" x="29" y={rowH / 2 + (models[box.name] ? stage.spec.nameDy.model : stage.spec.nameDy.idle)}>{clip(personaOf(box.name), chars(stage.spec.type.name, 0.58, box.w))}</text>
                {models[box.name] && <text className="flow-chip-model" x="29" y={rowH / 2 + stage.spec.modelDy}>{clip(models[box.name], chars(stage.spec.type.model, 0.6, box.w))}</text>}
                {isLive
                  ? <g transform={`translate(${box.w - 11},${rowH / 2})`}><circle r="6" fill="none" stroke={tone} className="flow-chip-ping" /><circle r="3" fill={tone} /></g>
                  : <circle cx={box.w - 11} cy={rowH / 2} r="2.4" fill="none" stroke="rgba(255,241,255,.28)" />}
                {isLive && task && !lead && <text className="flow-chip-task" x="29" y={stage.spec.row + stage.spec.taskY}>{clip(task, chars(stage.spec.type.task, 0.55, box.w))}</text>}
              </g>;
            })}
          </svg>
          {/* The teams the stage cannot draw, as text rather than as 22-unit SVG bands: the same
              four names, a readable font, and no user units out of the drawing's height. Grid
              placement puts this in row 2 of the stage column, directly under the map it explains,
              with the hand-off feed untouched in row 1 beside it. */}
          {stage.pools.length > 0 && (
            <ul className="flow-pools" aria-label="Teams that share the ENGINEER roster">
              {stage.pools.map((pool) => <li key={pool.id} className="flow-pool" style={{ '--tone': pool.tone } as React.CSSProperties}>
                <b>{pool.label}</b>
                <span>Shared ENGINEER roster</span>
              </li>)}
            </ul>
          )}
          <ol className="flow-log" aria-label="Hand-offs">
            {pick && <li className="flow-filter">Showing {pick} · <button type="button" onClick={() => setPick(null)}>show everyone</button></li>}
            {shown.length === 0 && <li className="flow-empty">No hand-offs in the last 24 hours.</li>}
            {shown.slice(0, 30).map((handoff) => {
              const hops = handoff.steps?.length ? handoff.steps : [{ to: handoff.to, state: handoff.state }];
              return <li key={handoff.id} className={handoff.active ? 'is-active' : ''}>
                <div className="flow-route">
                  <b style={{ color: agentTone(handoff.from) }}>{personaOf(handoff.from)}</b>
                  {hops.map((hop, i) => <span key={i} className="flow-hop"><i className="flow-arrow" aria-hidden="true">→</i><b style={{ color: agentTone(hop.to) }}>{personaOf(hop.to)}</b><em style={{ color: STATE_TONE[hop.state] || themePalette.secondary }}>{hop.state}</em></span>)}
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
