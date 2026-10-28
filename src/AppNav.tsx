import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ChevronDown, Database, History, House, Lightbulb, LayoutGrid, Menu, PanelLeftClose, PanelLeftOpen, Users, X, Wallet, GraduationCap, HeartPulse, Briefcase, Gamepad2 } from 'lucide-react';
import { TeamRail } from './TeamRail';
import { TeamMark } from './TeamMark';
import { ManagedApps, type AppInventory } from './ManagedApps';
import { LIFE_AREAS, type LifeArea } from './types';

type Page = 'home' | 'ideas' | 'data';
type TaskView = 'all' | 'open';
type Stream = { value: string; label: string; color: string };

const AREA_ICON: Record<'all' | LifeArea, typeof Wallet> = { all: LayoutGrid, finance: Wallet, learning: GraduationCap, 'mental-health': HeartPulse, work: Briefcase, play: Gamepad2 };

export type AppNavProps = {
  page: Page; viewFilter: TaskView; domainFilter: string;
  counts: { today: number; done: number };
  historyOpen: boolean;
  /* Tasks (the old Today page) and Goals are tabs inside Ideas; tasksActive marks when the Tasks tab is showing. */
  tasksActive: boolean;
  onPage: (page: Page) => void; onHistory: () => void;
  teams: Parameters<typeof TeamRail>[0]['teams']; selectedTeam: string | null; allTeamsCount: number;
  onSelectTeam: (id: string) => void; onAllTeams: () => void;
  area: 'all' | LifeArea; onChooseArea: (area: 'all' | LifeArea) => void;
  streams: Stream[]; streamCounts: Record<string, number>; onStream: (value: string) => void;
  inventory: AppInventory | null; inventoryError: string;
  compact: boolean; onToggleCompact: () => void; version: string;
};

/* The one navigation landmark. Desktop: a left column (Pages, Teams, Filters, Apps). Phone: the same
   element is a fixed bottom bar; the page row stays visible and the rest opens as a sheet above it.
   Layout switches in unified-nav.css only; there is never a second <nav>.
   Teams are ONE trigger (owner 2026-10-28): the list opens in a picker (flyout on desktop, inline in the
   sheet on phone) instead of standing as a column of separate tap targets. */
export function AppNav(p: AppNavProps) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')) { setOpen(false); trigger.current?.focus({ preventScroll: true }); } };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open]);
  // Phone: the page row scrolls sideways, so bring the current page's button into view. Moves only the
  // row's own scrollLeft, never the document.
  const pages = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = pages.current; const active = row?.querySelector<HTMLElement>('.nav-item.active');
    if (!row || !active || row.scrollWidth <= row.clientWidth) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    row.scrollTo({ left: active.offsetLeft - (row.clientWidth - active.offsetWidth) / 2, behavior: reduce ? 'auto' : 'smooth' });
  }, [p.page, p.viewFilter]);

  const [picker, setPicker] = useState(false);
  const [pickerTop, setPickerTop] = useState(0);
  const pickerBtn = useRef<HTMLButtonElement>(null);
  const togglePicker = () => { setPickerTop(pickerBtn.current?.getBoundingClientRect().top ?? 0); setPicker((v) => !v); };
  useEffect(() => {
    if (!picker) return;
    // Capture phase + stopPropagation: Escape closes the picker first, not the phone sheet beneath it.
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')) { e.stopPropagation(); setPicker(false); pickerBtn.current?.focus({ preventScroll: true }); } };
    const away = (e: PointerEvent) => { const t = e.target as Element | null; if (t && !t.closest('.team-picker, .team-picker-btn, [role="dialog"]')) setPicker(false); };
    window.addEventListener('keydown', key, true); document.addEventListener('pointerdown', away);
    return () => { window.removeEventListener('keydown', key, true); document.removeEventListener('pointerdown', away); };
  }, [picker]);
  const close = () => { setOpen(false); setPicker(false); };
  const chosen = p.teams.find((team) => team.id === p.selectedTeam) || null;

  const pageBtn = (key: string, label: string, Icon: typeof House, active: boolean, onClick: () => void, extra?: { count?: number; dialog?: boolean; aria?: string }) =>
    <button key={key} type="button" className={`nav-item ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined} aria-haspopup={extra?.dialog ? 'dialog' : undefined} aria-label={extra?.aria ?? label} data-nav-label={label} onClick={() => { onClick(); close(); }}>
      <Icon size={18} strokeWidth={1.6} aria-hidden="true" /><span>{label}</span>{extra?.count !== undefined && <b>{extra.count}</b>}
    </button>;
  const onTasks = p.tasksActive;
  return <nav id="left-navigation" className={`app-nav ${open ? 'is-open' : ''} ${p.compact ? 'is-compact' : ''}`} aria-label="Main navigation">
    <button type="button" ref={trigger} className="nav-menu-btn" aria-label={open ? 'Close menu' : 'Menu'} data-nav-label={open ? 'Close menu' : 'Menu'} aria-expanded={open} aria-controls="app-nav-panel" onClick={() => setOpen((v) => !v)}>{open ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}<span>{open ? 'Close' : 'Menu'}</span></button>
    <button type="button" className="nav-compact-btn" aria-label={p.compact ? 'Expand navigation' : 'Collapse navigation'} data-nav-label={p.compact ? 'Expand navigation' : 'Collapse navigation'} onClick={p.onToggleCompact}>{p.compact ? <PanelLeftOpen size={18} aria-hidden="true" /> : <PanelLeftClose size={18} aria-hidden="true" />}<span>Navigation</span></button>
    <div className="nav-pages" ref={pages} role="group" aria-label="Pages">
      {pageBtn('home', 'Home', House, p.page === 'home', () => p.onPage('home'))}
      {pageBtn('ideas', 'Ideas', Lightbulb, p.page === 'ideas', () => p.onPage('ideas'))}
      {pageBtn('data', 'Data', Database, p.page === 'data', () => p.onPage('data'))}
      {pageBtn('history', '履歴', History, p.historyOpen, p.onHistory, { count: p.counts.done, dialog: true, aria: `History, ${p.counts.done} done` })}
    </div>
    <div className="nav-panel" id="app-nav-panel">
      <section className="nav-group" aria-label="Hermes teams">
        <h3 className="nav-heading"><span>TEAMS</span><small>{p.teams.length}</small></h3>
        <button type="button" ref={pickerBtn} className={`nav-item team-picker-btn ${chosen ? 'has-team' : ''}`} aria-expanded={picker} aria-controls="team-picker" aria-label={`Teams: ${chosen ? chosen.name : 'all teams'}. ${picker ? 'Close the list' : 'Choose a team'}`} data-nav-label={chosen ? `Team · ${chosen.name}` : `Teams · ${p.teams.length}`} onClick={togglePicker}>
          {chosen ? <TeamMark id={chosen.id} /> : <Users size={18} strokeWidth={1.6} aria-hidden="true" />}
          <span>{chosen ? chosen.name : 'All teams'}</span><ChevronDown size={14} strokeWidth={1.8} className="team-picker-caret" aria-hidden="true" />
        </button>
        {/* Hidden, not unmounted: TeamRail owns the members dialog, which must outlive the picker closing after a pick. */}
        <div id="team-picker" className="team-picker nav-team-list" hidden={!picker} role="group" aria-label="Choose a team" style={{ '--picker-top': `${pickerTop}px` } as CSSProperties}>
          <TeamRail itemClass="nav-item" teams={p.teams} allCount={p.allTeamsCount} selectedTeam={p.selectedTeam} allActive={p.area === 'all' && p.selectedTeam === null} onSelect={(id) => { p.onSelectTeam(id); close(); }} onAll={() => { p.onAllTeams(); close(); }} />
        </div>
      </section>
      <section className="nav-group" aria-label="Filters">
        {p.page !== 'home' && <>
          <h3 className="nav-heading"><span>LIFE AREAS</span><small>{p.area === 'all' ? 'ALL' : LIFE_AREAS.find((a) => a.id === p.area)?.label}</small></h3>
          <div className="nav-areas" role="group" aria-label="Life areas">
            {LIFE_AREAS.map((item) => { const Icon = AREA_ICON[item.id]; return <button type="button" key={item.id} className={`nav-item nav-area ${p.area === item.id ? 'active' : ''}`} aria-pressed={p.area === item.id} aria-label={item.label} data-nav-label={item.label} onClick={() => p.onChooseArea(p.area === item.id ? 'all' : item.id)}><Icon size={16} strokeWidth={1.6} aria-hidden="true" /><span>{item.label}</span></button>; })}
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
