import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Bot, CircleDot, Database, Flag, History, House, Inbox, Lightbulb, LayoutGrid, Menu, PanelLeftClose, PanelLeftOpen, Target, Workflow, X, Wallet, GraduationCap, HeartPulse, Briefcase, Gamepad2 } from 'lucide-react';
import { TeamRail } from './TeamRail';
import { ManagedApps, type AppInventory } from './ManagedApps';
import { LIFE_AREAS, type LifeArea } from './types';

type Page = 'home' | 'tasks' | 'ideas' | 'goals' | 'office' | 'data' | 'chat';
type TaskView = 'all' | 'open' | 'high';
type Stream = { value: string; label: string; color: string };

const AREA_ICON: Record<'all' | LifeArea, typeof Wallet> = { all: LayoutGrid, finance: Wallet, learning: GraduationCap, 'mental-health': HeartPulse, work: Briefcase, play: Gamepad2 };

export type AppNavProps = {
  page: Page; viewFilter: TaskView; domainFilter: string;
  counts: { today: number; open: number; high: number; done: number };
  historyOpen: boolean; orchestrationOpen: boolean;
  onPage: (page: Page) => void; onView: (view: TaskView) => void; onHistory: () => void; onOrchestration: () => void;
  teams: Parameters<typeof TeamRail>[0]['teams']; selectedTeam: string | null; allTeamsCount: number;
  onSelectTeam: (id: string) => void; onAllTeams: () => void;
  area: 'all' | LifeArea; onChooseArea: (area: 'all' | LifeArea) => void;
  streams: Stream[]; streamCounts: Record<string, number>; onStream: (value: string) => void;
  inventory: AppInventory | null; inventoryError: string;
  compact: boolean; onToggleCompact: () => void; version: string;
};

/* The one navigation landmark. Desktop: a left column (Pages, Teams, Filters, Apps). Phone: the same
   element is a fixed bottom bar; the page row stays visible and the rest opens as a sheet above it.
   Layout switches in unified-nav.css only; there is never a second <nav>. */
export function AppNav(p: AppNavProps) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')) { setOpen(false); trigger.current?.focus({ preventScroll: true }); } };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open]);
  const close = () => setOpen(false);
  const pageBtn = (key: string, label: string, Icon: typeof House, active: boolean, onClick: () => void, extra?: { count?: number; dialog?: boolean; aria?: string }) =>
    <button key={key} type="button" className={`nav-item ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined} aria-haspopup={extra?.dialog ? 'dialog' : undefined} aria-label={extra?.aria} data-nav-label={label} onClick={() => { onClick(); close(); }}>
      <Icon size={18} strokeWidth={1.6} aria-hidden="true" /><span>{label}</span>{extra?.count !== undefined && <b>{extra.count}</b>}
    </button>;
  const onTasks = p.page === 'tasks';
  return <nav id="left-navigation" className={`app-nav ${open ? 'is-open' : ''} ${p.compact ? 'is-compact' : ''}`} aria-label="Main navigation">
    <button type="button" ref={trigger} className="nav-menu-btn" aria-label={open ? 'Close menu' : 'Menu'} data-nav-label={open ? 'Close menu' : 'Menu'} aria-expanded={open} aria-controls="app-nav-panel" onClick={() => setOpen((v) => !v)}>{open ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}<span>{open ? 'Close' : 'Menu'}</span></button>
    <button type="button" className="nav-compact-btn" aria-label="Collapse navigation" aria-pressed={p.compact} data-nav-label={p.compact ? 'Expand navigation' : 'Collapse navigation'} onClick={p.onToggleCompact}>{p.compact ? <PanelLeftOpen size={18} aria-hidden="true" /> : <PanelLeftClose size={18} aria-hidden="true" />}<span>Navigation</span></button>
    <div className="nav-pages" role="group" aria-label="Pages">
      {pageBtn('home', 'Home', House, p.page === 'home', () => p.onPage('home'))}
      {pageBtn('today', 'Today', Inbox, onTasks && p.viewFilter === 'open', () => p.onView('open'), { count: p.counts.today })}
      {pageBtn('ideas', 'Ideas', Lightbulb, p.page === 'ideas', () => p.onPage('ideas'))}
      {pageBtn('all', 'All tasks', CircleDot, onTasks && p.viewFilter === 'all', () => p.onView('all'), { count: p.counts.open })}
      {pageBtn('high', 'High signal', Flag, onTasks && p.viewFilter === 'high', () => p.onView('high'), { count: p.counts.high })}
      {pageBtn('goals', 'Goals', Target, p.page === 'goals', () => p.onPage('goals'))}
      {pageBtn('office', 'Office', LayoutGrid, p.page === 'office', () => p.onPage('office'))}
      {pageBtn('data', 'Data', Database, p.page === 'data', () => p.onPage('data'))}
      {pageBtn('chat', 'Chat', Bot, p.page === 'chat', () => p.onPage('chat'))}
      {pageBtn('history', '履歴', History, p.historyOpen, p.onHistory, { count: p.counts.done, dialog: true })}
      {pageBtn('orchestration', 'Orchestration', Workflow, p.orchestrationOpen, p.onOrchestration, { dialog: true, aria: 'Open orchestration graph' })}
    </div>
    <div className="nav-panel" id="app-nav-panel">
      <section className="nav-group" aria-label="Hermes teams">
        <h3 className="nav-heading"><span>TEAMS</span><small>{p.teams.length}</small></h3>
        <div className="nav-team-list">
          <TeamRail itemClass="nav-item" teams={p.teams} allCount={p.allTeamsCount} selectedTeam={p.selectedTeam} allActive={p.area === 'all' && p.selectedTeam === null} onSelect={(id) => { p.onSelectTeam(id); close(); }} onAll={() => { p.onAllTeams(); close(); }} />
        </div>
      </section>
      <section className="nav-group" aria-label="Filters">
        {p.page !== 'home' && <>
          <h3 className="nav-heading"><span>LIFE AREAS</span><small>{p.area === 'all' ? 'ALL' : LIFE_AREAS.find((a) => a.id === p.area)?.label}</small></h3>
          <div className="nav-areas" role="group" aria-label="Life areas">
            {LIFE_AREAS.map((item) => { const Icon = AREA_ICON[item.id]; return <button type="button" key={item.id} className={`nav-item nav-area ${p.area === item.id ? 'active' : ''}`} aria-pressed={p.area === item.id} data-nav-label={item.label} onClick={() => p.onChooseArea(p.area === item.id ? 'all' : item.id)}><Icon size={16} strokeWidth={1.6} aria-hidden="true" /><span>{item.label}</span></button>; })}
          </div>
        </>}
        <h3 className="nav-heading"><span>STREAMS</span><small>{p.domainFilter === 'all' ? 'DOMAIN FILTERS' : p.streams.find((s) => s.value === p.domainFilter)?.label}</small></h3>
        <div className="nav-streams" role="group" aria-label="Tasks by stream">
          {p.streams.map((s) => <button type="button" key={s.value} className={`nav-stream ${onTasks && p.domainFilter === s.value ? 'active' : ''}`} style={{ '--stream': s.color } as CSSProperties} aria-pressed={onTasks && p.domainFilter === s.value} onClick={() => { p.onStream(s.value); close(); }}><i /><span>{s.label}</span><b>{p.streamCounts[s.value] || 0}</b></button>)}
        </div>
      </section>
      <ManagedApps inventory={p.inventory} error={p.inventoryError} />
      <p className="nav-foot"><span className="version-label">BRAINBOOK / {p.version}</span></p>
    </div>
  </nav>;
}
