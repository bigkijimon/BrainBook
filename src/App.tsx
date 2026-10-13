import {useModalFocus} from './useModalFocus';
import {NavigationHints} from './NavigationHints';
import { TermsHelp } from './TermsHelp';
import {ActivityPanel} from './ActivityPanel';
import {ManagedApps,useManagedApps} from './ManagedApps';
import {ProductsOverview} from './ProductsOverview';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive, House, ListTodo, Menu, SlidersHorizontal, Bot,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronDown,
  Circle,
  CircleDot,
  Clock3,
  Command,
  Flag,
  Inbox,
  ListFilter,
  MoreHorizontal,
  PanelRight,
  Plus,
  Save,
  Search,
  Smartphone,
  Brain,
  ExternalLink,
  PanelLeftClose,
  PanelLeftOpen,
  GitBranch,
  Link2,
  Wallet,
  GraduationCap,
  HeartPulse,
  Briefcase,
  Gamepad2,
  LayoutGrid,
  Sparkles,
  History,
  SquareTerminal,
  Lightbulb,
  LayoutList,
  Trash2,
  X,
  FileText, Folder, FolderOpen, Play,
  TriangleAlert,
  Workflow,
  Target,
} from 'lucide-react';
import { SetupDialog, type SetupState } from './SetupDialog';
import { liveWork, elapsedLabel } from './live-work.mjs';
import { displayTitle, statusLabel } from './owner-console.mjs';
import { AgentFlow, agentTone, isHiddenAgent, useAgentFlow } from './AgentFlow';
import { ControlCenter, RunButton } from './ControlCenter';
import { GoalsPanel } from './GoalsPanel';
import { AgentChatPanel } from './AgentChatPanel';
import { SessionActivity } from './SessionActivity';
import { OfficeView } from './OfficeView';
import { personaOf } from './agentRoster';
import { AgentFeed, type AgentMessage } from './AgentFeed';
import { IdeaDump, type DumpItem } from './IdeaDump';
import { IdeaTree, STAGE_LABEL } from './IdeaTree';
import { AREA_COLOR, BrainScene, type BrainData, type BrainNode } from './BrainScene';
import PhoneDialog from './PhoneDialog';
import { TeamRail, useTeams } from './TeamRail';
import { LIFE_AREAS, STATUSES, isTaskStatus, statusMeta, type LifeArea, type Priority, type Task, type TaskDomain, type TaskStatus, type VaultNote, type VaultTask } from './types';
import { matchesFocus, scheduledTasks as listScheduledTasks } from './task-focus.mjs';
import { runState, runSummary } from './next-work.mjs';
import { purchaseLink, purchaseNotice, release } from '../release/release-info.mjs';

const API = '/api';
type Stream = { id: string; label: string; color: string };
let STREAM_LIST: Stream[] = [];
const streamColor = (id?: string) => STREAM_LIST.find((stream) => stream.id === id)?.color || '#b69bc4';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try { response = await fetch(url, { headers: { 'content-type': 'application/json' }, ...options }); }
  catch { throw new Error('BrainBook cannot reach its server. Check that the app is still running.'); }
  // A failing server may answer with plain text or an empty body; that must not surface as a JSON parse error.
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || `The server answered ${response.status}. Try again in a moment.`);
  if (body === null) throw new Error('The server sent a reply BrainBook could not read.');
  return body as T;
}

function formatDate(value: string | null) {
  if (!value) return 'No due date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', { month: 'short', day: 'numeric' }).format(date);
}

function relativeTime(value: string) {
  const delta = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(delta) || delta < 60_000) return 'just now';
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
  return `${Math.floor(delta / 86_400_000)}d ago`;
}

function normalizeTask(input: Partial<Task>): Task {
  const now = new Date().toISOString();
  return {
    id: typeof input.id === 'string' ? input.id : `task-${Date.now()}`,
    title: typeof input.title === 'string' ? input.title : 'Untitled task',
    description: typeof input.description === 'string' ? input.description : '',
    status: isTaskStatus(input.status) ? input.status : 'inbox',
    source: typeof input.source === 'string' ? input.source : 'personal',
    priority: input.priority === 'low' || input.priority === 'high' ? input.priority : 'normal',
    routing: input.routing || { domain: 'private', domainLabel: 'Private / personal', priority: 'normal', priorityReason: 'Awaiting classification', worker: 'hermes', routeSource: 'deterministic', routeStatus: 'ready', confidence: 0.76, keywords: [] },
    plan: input.plan || null,
    planStatus: input.planStatus || (input.plan ? 'ready' : 'idle'),
    planError: input.planError || null,
    dueAt: typeof input.dueAt === 'string' && input.dueAt ? input.dueAt : null,
    notes: Array.isArray(input.notes) ? input.notes : [],
    area: input.area ?? null,
    lifeArea: input.lifeArea || 'work',
    isArchived: Boolean(input.isArchived),
    kanban: input.kanban ?? null,
    createdAt: typeof input.createdAt === 'string' ? input.createdAt : now,
    updatedAt: now,
  };
}

function App() {
  // Owner 2026-10-13 ("メニューを下から戻して、Managed AppsバッジはこのSidebarに入れて"): Managed Apps
  // used to render inside AreaRail (the icon rail); it now renders inside the left <aside> nav
  // instead, so the hook that feeds it moves up to where both can read it from one source.
  const {inventory:managedAppsInventory,error:managedAppsError}=useManagedApps();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<'all' | Priority>('all');
  const [viewFilter, setViewFilter] = useState<'all' | 'open' | 'high'>('all');
  const [domainFilter, setDomainFilter] = useState<'all' | TaskDomain>('all');
  // Streams are per user (streams.json in their data folder); the UI never hard-codes them.
  const [streams, setStreams] = useState<Stream[]>([]);
  useEffect(() => { request<{ streams: Stream[] }>(`${API}/streams`).then((data) => { STREAM_LIST = data.streams; setStreams(data.streams); }).catch(() => {}); }, []);
  const domainFilters = useMemo(() => streams.map((stream) => ({ value: stream.id, label: stream.label, color: stream.color })), [streams]);
  const [viewMode, setViewMode] = useState<'board' | 'timeline'>('board');
  const [helpOpen, setHelpOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [workOpen,setWorkOpen]=useState(false);
  // Every task entry point in the app lands on this one card (owner 2026-10-02), so anything that
  // opens the composer scrolls the Control Center into view with it.
  const controlRef = useRef<HTMLElement | null>(null);
  const openControl = useCallback((compose = true) => {
    setPage('home'); location.hash = 'home'; setComposerOpen(compose); setWorkOpen(true);
    // `behavior` is an argument here, not CSS, so the stylesheet's reduced-motion rules cannot reach
    // it: every entry point that lands on this card would glide the page under someone who asked for
    // no motion. Ask the same media query the animations ask, and jump instead.
    const smooth = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.requestAnimationFrame(() => controlRef.current?.scrollIntoView({ block: 'nearest', behavior: smooth ? 'smooth' : 'auto' }));
  }, []);
  const [goalsKey, setGoalsKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [planningId, setPlanningId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  // What could not be loaded, kept apart from the 3s toast so an empty list never reads as "all clear".
  const [taskProblem, setTaskProblem] = useState('');
  const [vaultProblem, setVaultProblem] = useState('');
  const [vaultNotes, setVaultNotes] = useState<VaultNote[]>([]);
  const taskLikePaths = useMemo(() => new Set(vaultNotes.filter((note) => note.noteKind === 'task').map((note) => note.path)), [vaultNotes]);
  const [vaultTasks, setVaultTasks] = useState<VaultTask[]>([]);
  const [teamOpen, setTeamOpen] = useState(false);
  // Agents waiting on the owner (latest event per card is "blocked"), refreshed every minute.
  const [agentAsks, setAgentAsks] = useState<AgentAsk[]>([]);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const response = await fetch(`/api/agents/feed?since=${Math.floor(Date.now() / 1000) - 7 * 86400}`, { cache: 'no-store' });
        if (!response.ok) return;
        const items = ((await response.json()).items || []) as AgentAsk[];
        const latest = new Map<string, AgentAsk>();
        items.forEach((item) => { const current = latest.get(item.taskId); if (!current || item.at > current.at) latest.set(item.taskId, item); });
        if (alive) setAgentAsks([...latest.values()].filter((item) => item.kind === 'blocked').sort((a, b) => b.at - a.at));
      } catch { /* feed is optional */ }
    };
    void load();
    const timer = window.setInterval(load, 60000);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);
  const [vaultOpen, setVaultOpen] = useState(0);
  const [vaultLoading, setVaultLoading] = useState(true);
  const [session, setSession] = useState<Session>({ local: true, device: null });
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [routineOpen, setRoutineOpen] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const PAGE_ROUTES = ['ideas', 'tasks', 'goals', 'office', 'chat'] as const;
  type Page = 'home' | typeof PAGE_ROUTES[number];
  const [page, setPage] = useState<Page>(() => (PAGE_ROUTES as readonly string[]).includes(location.hash.slice(1)) ? location.hash.slice(1) as Page : 'home');
  const navigate = useCallback((next: Page) => { setPage(next); if(next!=='home')setSelectedTeam(null); setBrainOpen(false); setSelectedId(null); if(location.hash !== `#${next}`) location.hash = next; }, []);
  useEffect(() => {
    const hash = () => { const route=((PAGE_ROUTES as readonly string[]).includes(location.hash.slice(1)) ? location.hash.slice(1) as Page : 'home'); setPage(route); if(route!=='home')setSelectedTeam(null); };
    const native = (event: Event) => { const route = (event as CustomEvent<string>).detail; navigate((PAGE_ROUTES as readonly string[]).includes(route) ? route as Page : 'home'); if(route==='agents') window.requestAnimationFrame(()=>document.getElementById('agent-status')?.scrollIntoView({behavior:'auto'})); };
    window.addEventListener('hashchange', hash); window.addEventListener('brainbook:navigate', native);
    return () => {window.removeEventListener('hashchange',hash);window.removeEventListener('brainbook:navigate',native);};
  }, [navigate]);
  // Filters sidebar starts collapsed; the choice is remembered.
  const [sidebarOpen, setSidebarOpen] = useState(() => localStorage.getItem('brainbook.sidebar') === 'open');
  const teams = useTeams();
  useEffect(() => { localStorage.setItem('brainbook.sidebar', sidebarOpen ? 'open' : 'closed'); }, [sidebarOpen]);
  const [localFeed, setLocalFeed] = useState<AgentMessage[]>([]);
  // Personal companion character (name + picture), set per user in the profile menu.
  const [character, setCharacter] = useState<Character>({ name: 'Assistant', image: '/character-default.svg', custom: false });
  useEffect(() => { request<Character>(`${API}/character`).then(setCharacter).catch(() => {}); }, []);
  const saveCharacter = async (patch: { name?: string; image?: string | null }) => {
    try { setCharacter(await request<Character>(`${API}/character`, { method: 'POST', body: JSON.stringify(patch) })); notify('Character saved.'); }
    catch (error) { notify(error instanceof Error ? error.message : 'Could not save the character.'); }
  };
  const [xp, setXp] = useState<Progress | null>(null);
  const [xpBurst, setXpBurst] = useState<{ gained: number; level: number | null; at: number } | null>(null);
  const [stepDraft, setStepDraft] = useState<{ did: string; next: string } | null>(null);
  const loadXp = () => request<Progress>(`${API}/progress`).then(setXp).catch(() => {});
  useEffect(() => { void loadXp(); }, []);
  const [brain, setBrain] = useState<BrainData | null>(null);
  const [brainOpen, setBrainOpen] = useState(false);
  const [brainHover, setBrainHover] = useState<{ node: BrainNode; x: number; y: number } | null>(null);
  const [brainPick, setBrainPick] = useState<BrainNode | null>(null);
  const [pulse, setPulse] = useState<{ id: string; at: number } | null>(null);
  const [dump, setDump] = useState<{ parent: { id: string; title: string } | null } | null>(null);
  // Real events only (owner 2026-09-30): a signal leaves a note when its file changed on disk or
  // when the agent run attached to one of its checklist lines changed state. Nothing is simulated.
  const pulseMany = useCallback((ids: string[]) => { ids.slice(0, 12).forEach((id, index) => window.setTimeout(() => setPulse({ id, at: Date.now() + index }), 400 + index * 220)); }, []);
  const seenModified = useRef<Map<string, string> | null>(null);
  useEffect(() => {
    if (!brain) return;
    const now = new Map(brain.nodes.map((node) => [node.id, node.modifiedAt || '']));
    const before = seenModified.current;
    seenModified.current = now;
    // Ignore the first map and any refresh that returns without file times (nothing to compare).
    if (before && before.size && [...now.values()].some(Boolean)) pulseMany([...now].filter(([id, at]) => before.has(id) && before.get(id) !== at).map(([id]) => id));
  }, [brain, pulseMany]);
  const brainSignature = useRef('');
  const seenRuns = useRef<Map<string, string> | null>(null);
  useEffect(() => {
    if (!vaultTasks.length) return; // baseline starts at the first real vault read, not the empty initial state
    const now = new Map(vaultTasks.filter((task) => task.kanban).map((task) => [task.id, `${task.path}|${task.kanban!.status}`]));
    const before = seenRuns.current;
    seenRuns.current = now;
    if (before) pulseMany([...new Set([...now].filter(([id, value]) => before.get(id) !== value).map(([, value]) => value.split('|')[0]))]);
  }, [vaultTasks, pulseMany]);
  useEffect(() => {
    if (!brain) return;
    brainSignature.current = `${brain.links.length}|${brain.nodes.map((node) => `${node.id}@${node.modifiedAt || ''}`).join(',')}`;
  }, [brain]);
  useEffect(() => {
    // Watch the vault every 30 s; the map is rebuilt only when a note or link really changed.
    const timer = window.setInterval(async () => {
      try {
        const next = await request<BrainData>(`${API}/brain`);
        const signature = `${next.links.length}|${next.nodes.map((node) => `${node.id}@${node.modifiedAt || ''}`).join(',')}`;
        if (signature !== brainSignature.current) setBrain(next);
      } catch { /* keep the last map */ }
    }, 30000);
    return () => window.clearInterval(timer);
  }, []);
  const [linking, setLinking] = useState<BrainNode | null>(null);
  const onBrainHover = useCallback((node: BrainNode | null, x: number, y: number) => setBrainHover(node ? { node, x, y } : null), []);
  const linkingRef = useRef<BrainNode | null>(null);
  useEffect(() => { linkingRef.current = linking; }, [linking]);
  const onBrainSelect = useCallback((node: BrainNode | null) => {
    const from = linkingRef.current;
    if (from && node && node.id !== from.id) { void connectIdeas(from, node); return; }
    setBrainPick(node);
  }, []);
  const [area, setArea] = useState<'all' | LifeArea>(() => ((localStorage.getItem('brainbook.area') || localStorage.getItem('aster.area')) as 'all' | LifeArea) || 'all');
  useEffect(() => { localStorage.setItem('brainbook.area', area); }, [area]);
  useEffect(() => { fetch(`${API}/session`).then((response) => response.json()).then(setSession).catch(() => {}); }, []);
  const remote = !session.local;
  const sendToHermes = async (idea: VaultNote) => {
    setPulse({ id: idea.path, at: Date.now() });
    try {
      const data = await request<{ prompt: string }>(`${API}/hermes/idea`, { method: 'POST', body: JSON.stringify({ path: idea.path, target: 'copy' }) });
      await navigator.clipboard.writeText(data.prompt);
      notify('Request copied. Paste it into your external Hermes input.');
    } catch { notify('Could not copy the request. Open the original in Obsidian.'); }
  };

  const loadTasks = async () => {
    setLoading(true);
    try {
      const data = await request<{ tasks: Task[] }>(`${API}/tasks`);
      setTasks((data.tasks ?? []).map(normalizeTask));
      setTaskProblem('');
    } catch (error) {
      setTaskProblem(error instanceof Error ? error.message : 'Could not load tasks.');
    } finally {
      setLoading(false);
    }
  };

  const loadVault = async () => {
    setVaultLoading(true);
    try {
      const data = await request<{ notes: VaultNote[]; tasks: VaultTask[]; totals: { open: number } }>(`${API}/vault`);
      setVaultNotes(data.notes ?? []);
      setVaultTasks(data.tasks ?? []);
      setVaultOpen(data.totals?.open ?? 0);
      setVaultProblem('');
      request<BrainData>(`${API}/brain`).then(setBrain).catch(() => setBrain(null));
    } catch (error) {
      setVaultProblem(error instanceof Error ? error.message : 'Could not reach the Obsidian vault.');
    } finally {
      setVaultLoading(false);
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if(document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]'))return;
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT';
      if (event.key === '?' && !typing) { event.preventDefault(); setHelpOpen(true); }
      if (event.key.toLowerCase() === 'n' && !typing) { event.preventDefault(); openControl(true); }
      if (event.key.toLowerCase() === 'd' && !typing && !event.metaKey && !event.ctrlKey) { event.preventDefault(); setDump({ parent: null }); }
      if (event.key.toLowerCase() === 'b' && !typing && !event.metaKey && !event.ctrlKey) { event.preventDefault(); setBrainOpen((value) => !value); setBrainPick(null); }
      if (event.key === 'Escape') { setHelpOpen(false); setProfileOpen(false); setComposerOpen(false); setLinking((current) => { if (!current) { setBrainOpen(false); setBrainPick(null); } return null; }); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [openControl]);

  useEffect(() => { void loadTasks(); void loadVault(); }, []);
  // First run / Settings: owner name and vault folder (per user, stored in their data folder).
  const [setup, setSetup] = useState<SetupState | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => { request<SetupState>(`${API}/setup`).then(setSetup).catch(() => {}); }, []);
  const ownerName = setup?.ownerName || '';
  // What the account menu says about the offer. Both words come from release/release-info.mjs, and
  // `checkout` stays null until the whole offer is declared there, so this shows a sentence now and a
  // working checkout the day the owner sets the price — with no screen edited.
  const checkout = purchaseLink();
  const saveSetup = async (patch: { ownerName: string; vaultPath: string; create: boolean }) => {
    try {
      const next = await request<SetupState>(`${API}/setup`, { method: 'POST', body: JSON.stringify(patch) });
      setSetup(next); setSettingsOpen(false);
      await Promise.all([loadVault(), refreshBrain().catch(() => {}), loadXp()]);
      return null;
    } catch (error) { return error instanceof Error ? error.message : 'Could not save.'; }
  };
  // Boot screen (index.html): fade out once the vault and brain have loaded, or after 10s at most.
  useEffect(() => {
    const boot = document.getElementById('bb-boot');
    if (!boot) return;
    const message = document.getElementById('bb-msg');
    if (message && !vaultLoading) message.textContent = brain ? 'Brain online' : 'Linking the brain';
    const done = () => { boot.classList.add('bb-done'); window.setTimeout(() => boot.remove(), 700); };
    if (!vaultLoading && brain) { const timer = window.setTimeout(done, 450); return () => window.clearTimeout(timer); }
    // The brain graph is optional (a failed or slow /api/brain leaves it null), so once the vault has
    // answered the splash waits 3s for it, not 10s: it used to sit on "Linking the brain" for ten seconds.
    const fallback = window.setTimeout(done, vaultLoading ? 10000 : 3000);
    return () => window.clearTimeout(fallback);
  }, [vaultLoading, brain]);

  const visibleTasks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return tasks.filter((task) => {
      const matchesQuery = !normalizedQuery || `${task.title} ${task.description}`.toLowerCase().includes(normalizedQuery);
      const matchesPriority = priorityFilter === 'all' || task.priority === priorityFilter;
      const matchesView = (viewFilter === 'all' && task.status !== 'done') || (viewFilter === 'open' && task.status !== 'done') || (viewFilter === 'high' && task.priority === 'high' && task.status !== 'done');
      const matchesDomain = domainFilter === 'all' || task.routing?.domain === domainFilter;
      const matchesArea = area === 'all' || task.lifeArea === area;
      return !task.isArchived && matchesQuery && matchesPriority && matchesView && matchesDomain && matchesArea;
    });
  }, [area, domainFilter, priorityFilter, query, tasks, viewFilter]);
  const routines = useMemo(() => listScheduledTasks(tasks), [tasks]);
  const areaNotes = useMemo(() => (area === 'all' ? vaultNotes : vaultNotes.filter((note) => note.lifeArea === area)), [area, vaultNotes]);
  const areaReminders = useMemo(() => (area === 'all' ? vaultTasks : vaultTasks.filter((task) => task.lifeArea === area)), [area, vaultTasks]);
  const areaCounts = useMemo(() => {
    const counts: Record<string, number> = { all: 0 };
    const add = (key?: string) => { counts.all += 1; if (key) counts[key] = (counts[key] || 0) + 1; };
    vaultNotes.forEach((note) => add(note.lifeArea));
    vaultTasks.forEach((task) => { if (!task.done) add(task.lifeArea); });
    tasks.forEach((task) => { if (!task.isArchived && task.status !== 'done') add(task.lifeArea); });
    return counts;
  }, [tasks, vaultNotes, vaultTasks]);
  const refreshBrain = async () => {
    const data = await request<{ notes: VaultNote[]; tasks: VaultTask[]; totals: { open: number } }>(`${API}/vault`);
    setVaultNotes(data.notes ?? []); setVaultTasks(data.tasks ?? []); setVaultOpen(data.totals?.open ?? 0);
    const next = await request<BrainData>(`${API}/brain`);
    setBrain(next);
    return next;
  };
  // Step 1 → 2: dumped lines become notes, then the map opens with the new ideas lit up.
  const saveDump = async (items: DumpItem[], chosenArea: LifeArea | null) => {
    const { created } = await request<{ created: { path: string; title: string }[] }>(`${API}/ideas`, { method: 'POST', body: JSON.stringify({ items: items.map((item) => ({ text: item.text, parentIndex: item.parentIndex })), parent: dump?.parent?.id || null, area: chosenArea }) });
    const next = await refreshBrain();
    setDump(null);
    setBrainOpen(true);
    const focus = next.nodes.find((node) => node.id === (dump?.parent?.id || created[0]?.path)) || null;
    setBrainPick(focus);
    created.forEach((entry, index) => window.setTimeout(() => setPulse({ id: entry.path, at: Date.now() + index }), 500 + index * 180));
    notify(`${created.length} idea${created.length === 1 ? '' : 's'} added to the brain.`);
  };
  // Finish an idea: writes status: done into the note, then XP and level are recomputed from the vault.
  const completeIdea = async (node: BrainNode, done = true) => {
    try {
      const result = await request<{ gained: number; levelUp: boolean; after: Progress }>(`${API}/ideas/complete`, { method: 'POST', body: JSON.stringify({ path: node.id, done }) });
      setXp(result.after);
      const next = await refreshBrain();
      setBrainPick(next.nodes.find((entry) => entry.id === node.id) || null);
      if (done) {
        setPulse({ id: node.id, at: Date.now() });
        setXpBurst({ gained: result.gained, level: result.levelUp ? result.after.level : null, at: Date.now() });
        window.setTimeout(() => setXpBurst(null), result.levelUp ? 4200 : 2600);
        const now = Date.now() / 1000;
        setLocalFeed([
          { id: `xp:${node.id}:${now}`, kind: 'xp', author: 'BrainBook', title: node.title, text: `+${result.gained} XP. ${result.after.need - result.after.into} XP to level ${result.after.level + 1}.`, at: now },
          ...(result.levelUp ? [{ id: `lv:${result.after.level}:${now}`, kind: 'level' as const, author: 'BrainBook', title: `Level ${result.after.level} — ${result.after.title}`, text: `${result.after.completed} ${result.after.completed === 1 ? 'idea' : 'ideas'} finished so far.`, at: now + 0.001 }] : []),
        ]);
      } else notify('Idea reopened.');
    } catch (error) { notify(error instanceof Error ? error.message : 'Could not update the idea.'); }
  };
  // Save where work stopped so the owner or any agent can resume from the note alone.
  const saveStep = async (node: BrainNode) => {
    if (!stepDraft || (!stepDraft.did.trim() && !stepDraft.next.trim())) return;
    try {
      await request(`${API}/ideas/step`, { method: 'POST', body: JSON.stringify({ path: node.id, ...stepDraft }) });
      setStepDraft(null);
      const next = await refreshBrain();
      setBrainPick(next.nodes.find((entry) => entry.id === node.id) || null);
      notify('Saved to the note. Anyone can pick up from here.');
    } catch (error) { notify(error instanceof Error ? error.message : 'Could not save.'); }
  };
  const connectIdeas = async (from: BrainNode, to: BrainNode) => {
    try {
      await request(`${API}/ideas/link`, { method: 'POST', body: JSON.stringify({ from: from.id, to: to.id }) });
      const next = await refreshBrain();
      setLinking(null);
      setBrainPick(next.nodes.find((node) => node.id === to.id) || to);
      setPulse({ id: from.id, at: Date.now() });
      notify(`Linked “${from.title}” → “${to.title}”.`);
    } catch (error) {
      setLinking(null);
      notify(error instanceof Error ? error.message : 'Could not link.');
    }
  };
  const setNoteKind = async (note: VaultNote, kind: 'idea' | 'task') => {
    setVaultNotes((current) => current.map((entry) => entry.path === note.path ? { ...entry, noteKind: kind, noteKindSource: 'manual' } : entry));
    try {
      const response = await fetch('/api/note-kind', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: note.path, kind }) });
      if (!response.ok) throw new Error();
      notify(kind === 'task' ? `Moved “${note.title}” to Already tasks.` : `Moved “${note.title}” back to Ideas.`);
    } catch { notify('Could not save that change.'); }
  };
  const moveNoteToArea = async (note: VaultNote, next: LifeArea) => {
    setVaultNotes((current) => current.map((entry) => entry.path === note.path ? { ...entry, lifeArea: next, areaSource: 'manual' } : entry));
    try {
      await request(`${API}/areas`, { method: 'POST', body: JSON.stringify({ path: note.path, area: next }) });
      notify(`Moved to ${LIFE_AREAS.find((entry) => entry.id === next)?.label}.`);
    } catch (error) {
      setVaultNotes((current) => current.map((entry) => entry.path === note.path ? note : entry));
      notify(error instanceof Error ? error.message : 'Could not save the area.');
    }
  };

  const selectedTask = tasks.find((task) => task.id === selectedId) ?? null;
  const counts = useMemo(() => Object.fromEntries(STATUSES.map((status) => [status, visibleTasks.filter((task) => task.status === status).length])) as Record<TaskStatus, number>, [visibleTasks]);
  const domainCounts = useMemo(() => Object.fromEntries(domainFilters.map((domain) => [domain.value, tasks.filter((task) => !task.isArchived && task.routing?.domain === domain.value).length])) as Record<TaskDomain, number>, [tasks]);
  const activeCount = tasks.filter((task) => !task.isArchived && task.status !== 'done').length;
  const liveCount = tasks.filter((task) => !task.isArchived && (task.status === 'working' || task.planStatus === 'analyzing')).length;
  const attentionCount = tasks.filter((task) => !task.isArchived && task.status === 'needs_attention').length;

  const notify = (text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage(''), 3200);
  };

  const chooseView = (view: 'all' | 'open' | 'high') => {
    navigate('tasks');
    setViewFilter(view);
    setPriorityFilter(view === 'high' ? 'high' : 'all');
    setDomainFilter('all');
    setQuery('');
  };

  const chooseDomain = (domain: TaskDomain) => {
    navigate('tasks');
    setViewFilter('all');
    setPriorityFilter('all');
    setDomainFilter(domain);
    setQuery('');
  };

  const resetView = () => {
    setSelectedTeam(null);
    setViewFilter('all');
    setPriorityFilter('all');
    setDomainFilter('all');
    setQuery('');
    navigate('home');
    setArea('all');
    setRoutineOpen(false);
  };

  const openScheduledTask = (task: Task) => {
    navigate('tasks');
    setViewFilter('all');
    setPriorityFilter('all');
    setDomainFilter('all');
    setQuery('');
    setSelectedId(task.id);
  };

  // A Next Work row opens its card, and the card detail panel only exists on the Tasks tab of the
  // paired phone (styles.css hides the inspector on the Ideas tab), so the tap has to move the tab
  // too - otherwise the Control Center row is a dead tap on the phone.
  const openBoardTask = (id: string) => {
    navigate('tasks'); setSelectedId(id);
  };

  const updateTask = async (taskId: string, patch: Partial<Task>, successMessage = 'Changes saved.') => {
    setSaving(true);
    try {
      const result = await request<{ task: Task }>(`${API}/tasks/${encodeURIComponent(taskId)}`, { method: 'PUT', body: JSON.stringify(patch) });
      const next = normalizeTask(result.task);
      setTasks((current) => current.map((task) => task.id === taskId ? next : task));
      notify(successMessage);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const archiveTask = async (taskId: string) => {
    if (!window.confirm('Archive this task?')) return;
    try {
      await request(`${API}/tasks/${encodeURIComponent(taskId)}`, { method: 'DELETE' });
      setTasks((current) => current.filter((task) => task.id !== taskId));
      if (selectedId === taskId) setSelectedId(null);
      notify('Archived.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not archive.');
    }
  };

  const moveTask = (taskId: string, status: TaskStatus) => {
    if (status === 'done') { const task = tasks.find((entry) => entry.id === taskId); if (task && task.status !== 'done') setLocalFeed([{ id: `local:${taskId}:${Date.now()}`, kind: 'done', author: 'BrainBook', title: task.title, text: 'Marked as done.', at: Date.now() / 1000 }]); }
    if (selectedTask?.id === taskId && selectedTask.status === status) return;
    void updateTask(taskId, { status }, `Moved to ${statusMeta[status].label}.`);
  };

  const runVaultTask = async (item: VaultTask) => {
    setVaultTasks((current) => current.map((entry) => entry.id === item.id ? { ...entry, kanban: { board: 'owner', id: 'pending', status: 'ready', assignee: 'default', queuedAt: new Date().toISOString(), gpu: false } } : entry));
    try {
      const result = await request<{ task: VaultTask }>(`${API}/vault/run`, { method: 'POST', body: JSON.stringify({ id: item.id }) });
      setVaultTasks((current) => current.map((entry) => entry.id === item.id ? { ...entry, kanban: result.task.kanban } : entry));
      notify(result.task.kanban?.status === 'scheduled' ? 'Needs the GPU — queued for the night window (01:00–06:00).' : 'Handed to Bigkiji. It starts within about a minute.');
    } catch (error) {
      setVaultTasks((current) => current.map((entry) => entry.id === item.id ? { ...entry, kanban: item.kanban ?? null } : entry));
      notify(error instanceof Error ? error.message : 'Could not start that item.');
    }
  };
  const runTask = async (task: Task) => {
    setTasks((current) => current.map((entry) => entry.id === task.id ? { ...entry, kanban: { board: 'owner', id: 'pending', status: 'ready', assignee: 'default', queuedAt: new Date().toISOString(), gpu: false } } : entry));
    try {
      const result = await request<{ task: Task }>(`${API}/tasks/${encodeURIComponent(task.id)}/run`, { method: 'POST', body: '{}' });
      const next = normalizeTask(result.task);
      setTasks((current) => current.map((entry) => entry.id === task.id ? next : entry));
      notify(next.kanban?.status === 'scheduled' ? 'Needs the GPU — queued for the night window (01:00–06:00).' : 'Handed to Bigkiji. It starts within about a minute.');
    } catch (error) {
      setTasks((current) => current.map((entry) => entry.id === task.id ? { ...entry, kanban: task.kanban ?? null } : entry));
      notify(error instanceof Error ? error.message : 'Could not start the task.');
    }
  };
  // While anything is queued or running, refresh every 20s so the card animation follows the real state.
  const hasActiveRun = [...tasks, ...vaultTasks].some((task) => task.kanban && !['done', 'archived'].includes(task.kanban.status));
  useEffect(() => {
    if (!hasActiveRun) return;
    const timer = window.setInterval(async () => {
      try { const data = await request<{ tasks: Task[] }>(`${API}/tasks`); setTasks(data.tasks.map(normalizeTask)); } catch { /* keep last state */ }
      try { const vault = await request<{ tasks: VaultTask[] }>(`${API}/vault`); setVaultTasks(vault.tasks); } catch { /* keep last state */ }
    }, 20000);
    return () => window.clearInterval(timer);
  }, [hasActiveRun]);

  const analyzePlan = async (task: Task) => {
    if (planningId) return;
    setPlanningId(task.id);
    setTasks((current) => current.map((entry) => entry.id === task.id ? { ...entry, planStatus: 'analyzing' } : entry));
    try {
      const result = await request<{ task: Task }>(`${API}/tasks/${encodeURIComponent(task.id)}/plan`, { method: 'POST', body: '{}' });
      const next = normalizeTask(result.task);
      setTasks((current) => current.map((entry) => entry.id === task.id ? next : entry));
      notify(next.plan?.source === 'router' ? 'Router created a phased plan.' : next.plan?.source === 'opencode' ? 'OpenCode created a phased plan.' : 'Local plan template created.');
    } catch (error) {
      setTasks((current) => current.map((entry) => entry.id === task.id ? { ...entry, planStatus: 'error', planError: error instanceof Error ? error.message : 'Planning failed.' } : entry));
      notify(error instanceof Error ? error.message : 'Router planning failed.');
    } finally {
      setPlanningId(null);
    }
  };

  const toggleVaultTask = async (task: VaultTask) => {
    const nextDone = !task.done;
    setVaultTasks((current) => current.map((entry) => entry.id === task.id ? { ...entry, done: nextDone } : entry));
    setVaultOpen((current) => Math.max(0, current + (nextDone ? -1 : 1)));
    try {
      await request(`${API}/vault/toggle`, { method: 'POST', body: JSON.stringify({ id: task.id, text: task.text, done: nextDone }) });
      notify(nextDone ? 'Checked off in Obsidian.' : 'Reopened in Obsidian.');
    } catch (error) {
      setVaultTasks((current) => current.map((entry) => entry.id === task.id ? task : entry));
      setVaultOpen((current) => Math.max(0, current + (nextDone ? 1 : -1)));
      notify(error instanceof Error ? error.message : 'Could not save to Obsidian.');
    }
  };

  return (
    <div className={`app-shell ${remote ? 'is-remote' : ''} page-${page} ${brainOpen ? 'brain-open' : ''}`}>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <NavigationHints/><div className="synthwave-backdrop" aria-hidden="true"/>
      <BrainScene data={brain} area={area} focus={brainOpen} selected={brainPick?.id || null} pulse={pulse} onHover={onBrainHover} onSelect={onBrainSelect} />
      <div className="vice-sky" aria-hidden="true"><span className="vice-sun" /><span className="vice-grid" /></div>
      <div className="grain" aria-hidden="true" />
      <header className="topbar">
        <div className="brand-lockup">
          <img className="brand-character" src={character.image} alt="" aria-hidden="true" />
          <div>
            <p className="brand-name">BrainBook</p>
            <p className="brand-subtitle">IDEAS · FOR · HERMES</p>
          </div>
        </div>
        <div className="topbar-actions">
          <nav className="console-nav" aria-label="Pages"><button type="button" aria-label="Home" data-nav-label="Home" aria-current={page==='home'?'page':undefined} onClick={()=>navigate('home')}><House size={23} aria-hidden="true"/></button><button type="button" aria-label="Tasks" data-nav-label="Tasks" aria-current={page==='tasks'?'page':undefined} onClick={()=>navigate('tasks')}><ListTodo size={23} aria-hidden="true"/></button><button type="button" aria-label="Ideas" data-nav-label="Ideas" aria-current={page==='ideas'?'page':undefined} onClick={()=>navigate('ideas')}><Lightbulb size={23} aria-hidden="true"/></button></nav>
          <details className="topbar-more" onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              event.currentTarget.open = false;
              event.currentTarget.querySelector('summary')?.focus();
              setRoutineOpen(false); setProfileOpen(false);
            }
          }}>
            <summary aria-label="More actions"><MoreHorizontal size={20} aria-hidden="true" /></summary>
            <div className="topbar-secondary">
          <div className="routine-menu">
            <button className={`routine-toggle ${routineOpen ? 'active' : ''}`} type="button" aria-expanded={routineOpen} aria-label={`Scheduled tasks, ${routines.length}`} onClick={() => setRoutineOpen((value) => !value)}>
              <CalendarDays size={15} strokeWidth={1.6} /><b>{routines.length}</b>
            </button>
            {routineOpen && <div className="routine-popover" role="menu" aria-label="Scheduled tasks">
              <span className="eyebrow">SCHEDULED · {routines.length}</span>
              {routines.length ? routines.map((task) => <button className="routine-item" type="button" role="menuitem" key={task.id} onClick={() => openScheduledTask(task)}>
                <span className={`routine-dot tone-${statusMeta[task.status].tone}`} />
                <span className="routine-copy"><strong>{task.title}</strong><small>{task.dueAt ? formatDate(task.dueAt) : 'No date'} · {matchesFocus(task, 'work') ? 'Work' : 'Personal'}</small></span>
                <ArrowUpRight size={13} />
              </button>) : <p className="routine-empty">No scheduled tasks yet.</p>}
            </div>}
          </div>
          <TermsHelp />
          <AgentFeed local={localFeed} character={character} />
          <RunShortcut tasks={tasks} vaultTasks={areaReminders} onOpen={() => openControl(false)} />
          <button className="dump-toggle" type="button" title="Get ideas out of your head (D)" onClick={() => setDump({ parent: null })}><Sparkles size={16} strokeWidth={1.5} /><span>Dump</span></button>
          <button className={`brain-toggle ${brainOpen ? 'active' : ''}`} type="button" aria-pressed={brainOpen} aria-label={brainOpen ? 'Close map' : 'Open map'} title="See how your ideas connect (B)" onClick={() => { setBrainOpen((value) => !value); setBrainPick(null); }}><Brain size={16} strokeWidth={1.5} /><span>{brainOpen ? 'Close map' : 'Map'}</span></button>
          <button className="avatar-button" type="button" aria-label="Account menu" onClick={() => { setProfileOpen((value) => !value); setHelpOpen(false); }}>{(ownerName || character.name || '?').slice(0, 1).toUpperCase()}</button>
          {profileOpen && <div className="profile-popover"><span className="eyebrow">LOCAL PROFILE</span><strong>{ownerName || 'You'} / BrainBook</strong>{xp && <div className="profile-level" title={`${xp.xp} XP total · ${xp.completed} ideas finished`}><b>Level {xp.level}</b> <span>{xp.title}</span><div className="xp-bar"><i style={{ width: `${Math.round((xp.into / xp.need) * 100)}%` }} /></div><small>{xp.into}/{xp.need} XP to level {xp.level + 1}</small></div>}<div className="profile-links">{!remote && <button type="button" className="ghost-button" onClick={() => { setPhoneOpen(true); setProfileOpen(false); }}><Smartphone size={14} strokeWidth={1.5} /> Phone access</button>}<button type="button" className="ghost-button" onClick={() => { setHelpOpen(true); setProfileOpen(false); }}><Command size={14} strokeWidth={1.5} /> Help & shortcuts</button>{checkout && <a className="ghost-button" href={checkout} target="_blank" rel="noreferrer">Buy {release.name}<ExternalLink size={14} strokeWidth={1.5} aria-hidden="true" /></a>}</div><p>Everything is saved on this Mac.{setup && <><br /><small className="profile-vault">Vault: {setup.vaultPath.replace(/^\/Users\/[^/]+/, '~')}</small></>}</p><p className="profile-terms"><b>{release.licence} licence</b><br />{purchaseNotice()}</p>{!remote && <button type="button" className="ghost-button profile-settings" onClick={() => { setSettingsOpen(true); setProfileOpen(false); }}>Settings…</button>}{!remote && <div className="character-editor">
            <span className="eyebrow">YOUR CHARACTER</span>
            <div className="character-row">
              <label className="character-pick" title="Choose a picture">
                <img src={character.image} alt="" />
                <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 4 * 1024 * 1024) { notify('Image is larger than 4 MB.'); return; } const reader = new FileReader(); reader.onload = () => void saveCharacter({ image: String(reader.result) }); reader.readAsDataURL(file); event.target.value = ''; }} />
              </label>
              <input key={character.name} defaultValue={character.name} maxLength={40} aria-label="Character name" onBlur={(event) => { const value = event.target.value.trim(); if (value && value !== character.name) void saveCharacter({ name: value }); }} onKeyDown={(event) => { if (event.key === 'Enter') (event.target as HTMLInputElement).blur(); }} />
            </div>
            <small>Shown on agent updates and the idea tree. {character.custom && <button type="button" className="link-button" onClick={() => void saveCharacter({ image: null })}>Remove picture</button>}</small>
          </div>}<button type="button" onClick={() => { resetView(); setProfileOpen(false); notify('Filters reset.'); }}>Reset filters <X size={13} strokeWidth={1.5} /></button></div>}
            </div>
          </details>
        </div>
      </header>

      {brainOpen && <div className="brain-hud" aria-live="polite">
        <div className="brain-legend">
          <span className="eyebrow">BRAIN · {brain?.nodes.length || 0} NOTES · {brain?.links.length || 0} LINKS</span>
          <ol className="flow-steps"><li><b>1</b> Dump</li><li className="on"><b>2</b> Map</li><li><b>3</b> Build</li></ol>
          <p>Drag to turn · scroll to zoom · click an idea</p>
          <ul>{(['finance', 'learning', 'mental-health', 'work', 'play'] as const).map((key) => <li key={key} className={area !== 'all' && area !== key ? 'dim' : ''}><i style={{ background: `#${AREA_COLOR[key].toString(16).padStart(6, '0')}` }} />{LIFE_AREAS.find((entry) => entry.id === key)?.label}</li>)}</ul>
          <p className="brain-sources">
            <b>Obsidian</b> {brain?.sources.obsidian.notes ?? 0} notes · {brain?.sources.counts.wikilink || 0} wikilinks<br />
            <b>Graphify</b> {brain?.sources.graphify.available ? `${brain.sources.graphify.notesCovered} notes mapped · ${brain.sources.graphify.noteLinks} links · built ${new Date(brain.sources.graphify.builtAt || '').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'not found (run graphify in the vault)'}<br />
            <b>Shared subjects</b> {brain?.sources.counts.related || 0} links
          </p>
          <p className="brain-signal-note">A moving dot = something really happened: that note changed, or its agent run moved on. The map is otherwise still.</p>
        </div>
        {linking && <div className="link-banner" role="status"><Link2 size={15} strokeWidth={1.6} />Click another idea to link it to <b>{linking.title}</b><button type="button" onClick={() => setLinking(null)}>Cancel</button></div>}
        {brainPick && <article className={`brain-card area-${brainPick.lifeArea}`}>
          <span className="eyebrow">{brainPick.kind === 'project' ? 'PROJECT' : 'IDEA'} · {LIFE_AREAS.find((entry) => entry.id === brainPick.lifeArea)?.label}</span>
          <h3>{brainPick.title}</h3>
          {brainPick.kind === 'idea' && (() => {
            const stage = brainPick.stage || 'seed';
            const progress = brainPick.progress;
            return <div className={`idea-status stage-${stage}`}>
              <p className="idea-stage"><i />{STAGE_LABEL[stage]}{progress && progress.total > 0 && <span> · {progress.done}/{progress.total} steps</span>}{progress?.lastAt && <span> · {progress.lastAt}</span>}</p>
              {progress?.lastDid && <p className="idea-last"><span>LAST</span>{progress.lastDid}</p>}
              {progress?.next ? <p className="idea-next"><span>NEXT</span>{progress.next}</p> : stage !== 'done' && <p className="idea-next empty"><span>NEXT</span>Not set yet — write it below or let Hermes propose one.</p>}
              {stage !== 'done' && (stepDraft ? <div className="step-form">
                <input autoFocus value={stepDraft.did} onChange={(event) => setStepDraft({ ...stepDraft, did: event.target.value })} placeholder="What got done" aria-label="What got done" />
                <input value={stepDraft.next} onChange={(event) => setStepDraft({ ...stepDraft, next: event.target.value })} onKeyDown={(event) => { if (event.key === 'Enter') void saveStep(brainPick); }} placeholder="Next step" aria-label="Next step" />
                <div className="step-form-actions"><button type="button" className="step-cancel" onClick={() => setStepDraft(null)}>Cancel</button><button type="button" className="step-save" onClick={() => void saveStep(brainPick)}>Save</button></div>
              </div> : <button type="button" className="step-open" onClick={() => setStepDraft({ did: '', next: progress?.next || '' })}>✎ Save where I stopped</button>)}
            </div>;
          })()}
          {brainPick.conceptLabels.length > 0 && <p className="brain-concepts">{brainPick.conceptLabels.slice(0, 4).map((label) => <span key={label}>{label}</span>)}</p>}
          {(() => {
            const byId = new Map((brain?.nodes || []).map((node) => [node.id, node]));
            const connected = (brain?.links || []).filter((link) => link.source === brainPick.id || link.target === brainPick.id).map((link) => ({ link, node: byId.get(link.source === brainPick.id ? link.target : link.source) })).filter((entry) => entry.node).sort((a, b) => ({ branch: 0, wikilink: 1, graphify: 2, related: 3 }[a.link.kind] - { branch: 0, wikilink: 1, graphify: 2, related: 3 }[b.link.kind])).slice(0, 6);
            return connected.length > 0 && <ul className="brain-neighbours">{connected.map(({ link, node }) => <li key={node!.id}><button type="button" onClick={() => setBrainPick(node!)}><i className={`link-kind kind-${link.kind}`}>{link.kind === 'branch' ? (link.source === brainPick.id ? 'branch' : 'parent') : link.kind === 'wikilink' ? 'linked' : link.kind === 'graphify' ? 'graphify' : 'similar'}</i>{node!.title}</button></li>)}</ul>;
          })()}
          <p className="brain-meta">{brainPick.concepts ? `${brainPick.concepts} Graphify concepts · ` : ''}{brain?.links.filter((link) => link.source === brainPick.id || link.target === brainPick.id).length || 0} links{brainPick.openCount ? ` · ${brainPick.openCount} open` : ''}</p>
          <div className="brain-actions">
            <button type="button" className="primary-button start-button" onClick={() => { const note = vaultNotes.find((entry) => entry.path === brainPick.id); if (note) sendToHermes(note); }}>Copy request</button>
            {brainPick.kind === 'idea' && (brainPick.stage === 'done'
              ? <button type="button" className="ghost-button" onClick={() => void completeIdea(brainPick, false)}>Reopen</button>
              : <button type="button" className="ghost-button complete-button" onClick={() => void completeIdea(brainPick)}>★ Complete</button>)}
            <button type="button" className="ghost-button" onClick={() => setDump({ parent: { id: brainPick.id, title: brainPick.title } })}><GitBranch size={14} strokeWidth={1.5} />Branch</button>
            <button type="button" className={`ghost-button ${linking ? 'active' : ''}`} onClick={() => setLinking(linking ? null : brainPick)}><Link2 size={14} strokeWidth={1.5} />{linking ? 'Cancel' : 'Link'}</button>
            <a className="ghost-button" href={brainPick.url} target="_blank" rel="noreferrer" title="Open in Obsidian"><ExternalLink size={14} strokeWidth={1.5} /></a>
            <button type="button" className="icon-button" aria-label="Close" onClick={() => { setBrainPick(null); setLinking(null); }}><X size={14} strokeWidth={1.5} /></button>
          </div>
        </article>}
      </div>}
      {xpBurst && <div key={xpBurst.at} className={`xp-burst ${xpBurst.level ? 'is-level' : ''}`} role="status"><b>+{xpBurst.gained} XP</b>{xpBurst.level && <strong>LEVEL {xpBurst.level}</strong>}</div>}
      {brainOpen && brainHover && !brainPick && <div className="brain-tip" style={{ left: brainHover.x + 14, top: brainHover.y + 14 }}><b>{brainHover.node.title}</b><small>{LIFE_AREAS.find((entry) => entry.id === brainHover.node.lifeArea)?.label}</small></div>}

      <div className={`workspace ${sidebarOpen ? '' : 'sidebar-collapsed'} ${selectedTask ? 'has-selection' : ''}`}>
        <AreaRail page={page} area={area} counts={areaCounts} selectedTeam={selectedTeam} onSelectTeam={(id)=>{setSelectedTeam(id);setArea('all');navigate('home');window.requestAnimationFrame(()=>document.getElementById('agent-status')?.scrollIntoView({behavior:'auto'}));}} onAll={()=>{setSelectedTeam(null);setArea('all');navigate('home');}} onChoose={(next)=>{setSelectedTeam(null);setArea(next);}} sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen((value) => !value)} teams={teams} />
        <aside className="sidebar" aria-label="Main navigation" hidden={!sidebarOpen}>
          <div className="sidebar-intro">
            <p className="eyebrow">YOUR OPERATING FIELD</p>
            <h1>Focus, with<br /><em>less noise.</em></h1>
            <p className="sidebar-copy">Tasks, ideas and live work from your Obsidian vault, in one place.</p>
          </div>
          <nav className="nav-list">
            <button className={`nav-item ${page === 'tasks' && viewFilter === 'open' ? 'active' : ''}`} type="button" onClick={() => chooseView('open')}><Inbox size={16} strokeWidth={1.5} /><span>Today</span><b>{activeCount}</b></button>
            <button className={`nav-item ${page === 'tasks' && viewFilter === 'all' ? 'active' : ''}`} type="button" onClick={() => chooseView('all')}><CircleDot size={16} strokeWidth={1.5} /><span>All tasks</span><b>{tasks.filter((task) => !task.isArchived && task.status !== 'done').length}</b></button>
            <button className={`nav-item ${page === 'tasks' && viewFilter === 'high' ? 'active' : ''}`} type="button" onClick={() => chooseView('high')}><Flag size={16} strokeWidth={1.5} /><span>High signal</span><b>{tasks.filter((task) => !task.isArchived && task.priority === 'high').length}</b></button>
            <button className={`nav-item ${page === 'goals' ? 'active' : ''}`} type="button" onClick={() => navigate('goals')}><Target size={16} strokeWidth={1.5} /><span>Goals</span></button>
            <button className={`nav-item ${page === 'office' ? 'active' : ''}`} type="button" onClick={() => navigate('office')}><LayoutGrid size={16} strokeWidth={1.5} /><span>Office</span></button>
            <button className={`nav-item ${page === 'chat' ? 'active' : ''}`} type="button" onClick={() => navigate('chat')}><Bot size={16} strokeWidth={1.5} /><span>Chat</span></button>
            <button className={`nav-item ${historyOpen ? 'active' : ''}`} type="button" aria-haspopup="dialog" onClick={() => setHistoryOpen(true)}><History size={16} strokeWidth={1.5} /><span>履歴</span><b>{tasks.filter((task) => task.status === 'done').length}</b></button>
            <button className={`nav-item ${teamOpen ? 'active' : ''}`} type="button" aria-haspopup="dialog" aria-label="Open orchestration graph" onClick={() => setTeamOpen(true)}><Workflow size={16} strokeWidth={1.5} /><span>Orchestration</span></button>
          </nav>
          <div className="stream-heading"><span>STREAMS</span><small>{domainFilter === 'all' ? 'DOMAIN FILTERS' : domainFilters.find((domain) => domain.value === domainFilter)?.label}</small></div>
          <nav className="stream-list" aria-label="Tasks by stream">
            {domainFilters.map((domain) => <button className={`stream-item ${page === 'tasks' && domainFilter === domain.value ? 'active' : ''}`} style={{ '--stream': domain.color } as React.CSSProperties} type="button" key={domain.value} onClick={() => chooseDomain(domain.value)}><i /><span>{domain.label}</span><b>{domainCounts[domain.value] || 0}</b></button>)}
          </nav>
          <ManagedApps inventory={managedAppsInventory} error={managedAppsError} />
          <div className="sidebar-footer">
            <div className="mini-orbit" aria-hidden="true"><span /><span /><span /></div>
            <p>Clear space.<br />Keep the signal.</p>
            <span className="version-label">BRAINBOOK / {release.version}</span>
          </div>
        </aside>

        <main id="main-content" className="main-content">
          <div className="content-header">
            <div>
              <p className="eyebrow">{new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date()).toUpperCase().replace(/,/g, ' ·')}</p>
              <h2>{page==='home'?'Company now':page==='ideas'?'Ideas':page==='tasks'?'Tasks':page==='goals'?'Goals':page==='office'?'Office':'Chat'}<span className="title-dot">.</span></h2>
              <p className="content-lede">{page==='home'?'Who is working, and what needs your decision.':page==='ideas'?'Find and organize your Obsidian ideas.':page==='tasks'?'View work on the board or timeline.':page==='goals'?'Your tracked goals, live from the vault.':page==='office'?'The 3D office: every team, every room.':'Talk directly with an agent.'}</p>
            </div>
            <button className="primary-button" type="button" title="Add a task in the Control Center" onClick={() => openControl(!composerOpen)}>
              <span>New request</span><span className="button-icon"><Plus size={16} strokeWidth={1.7} /></span>
            </button>
          </div>

          {setup && setup.configured && !setup.vaultReady && !remote && <div className="vault-missing" role="alert">Your vault folder can’t be reached: <code>{setup.vaultPath.replace(/^\/Users\/[^/]+/, '~')}</code>. If it’s in iCloud, wait for it to download, or <button type="button" className="link-button" onClick={() => setSettingsOpen(true)}>choose another folder</button>.</div>}
          <AgentFlow open={teamOpen} onClose={() => setTeamOpen(false)} />

          {/* The one task entry point (owner 2026-10-02): capture plus the Next Work List live here,
              and the rest of the app reaches work through this card instead of its own list. */}
          {(taskProblem || vaultProblem) && <div className="load-problem" role="alert">
            <TriangleAlert size={16} strokeWidth={2} aria-hidden="true" />
            <span><strong>{taskProblem ? 'Tasks could not be loaded.' : 'Your vault could not be read.'}</strong> {taskProblem || vaultProblem}</span>
            <button type="button" onClick={() => { void loadTasks(); void loadVault(); }}>Retry</button>
          </div>}
          {page === 'home' && <ProductsOverview products={[
            { productName: 'StudyAbroadOS', apiUrl: '/api/product-metrics/studyabroados' },
            { productName: 'EikenPrep', apiUrl: '/api/product-metrics/eikenprep' },
            { productName: '予約SaaS', apiUrl: '/api/product-metrics/reservation-saas' },
          ]} refreshIntervalMs={30000} />}
          {page === 'home' && <ActivityPanel
            teams={teams} workOpen={workOpen} onCloseWork={()=>{setWorkOpen(false);setComposerOpen(false);}} onOpenWork={openControl}
            problem={Boolean(taskProblem || vaultProblem)}
            sectionRef={controlRef}
            work={{ tasks, vaultTasks: areaReminders, asks: agentAsks, focus: 'all' }}
            entry={{
              open: composerOpen,
              onToggle: () => openControl(!composerOpen),
              onSaved: (saved) => {
                setComposerOpen(false);
                notify(`Saved as ${saved.kind}${saved.links ? ` · ${saved.links} connection${saved.links > 1 ? 's' : ''}` : ''}${saved.steps ? ` · ${saved.steps} step${saved.steps > 1 ? 's' : ''}` : ''}.`);
                void loadTasks(); void loadVault(); setGoalsKey((key) => key + 1);
              },
            }}
            actions={{ openTask: openBoardTask, runTask, runVault: runVaultTask, toggle: toggleVaultTask }}
            notes={areaNotes.length}
            loading={vaultLoading}
          />}
          <div className="company-panels">{page === 'home' && <>
            <SessionActivity />
          </>}{page === 'goals' && <GoalsPanel refreshKey={goalsKey} notify={notify} onToggle={toggleVaultTask} onRun={runVaultTask} />}
          {page === 'office' && <OfficeView remote={remote} teams={teams} selectedTeam={selectedTeam} onAll={()=>{setSelectedTeam(null);setArea('all');}} />}
          {page === 'chat' && <AgentChatPanel remote={remote} />}</div>

          {page === 'tasks' && <><div className="board-toolbar">
            <div className="toolbar-tabs"><button className={`toolbar-tab ${viewMode === 'board' ? 'active' : ''}`} type="button" onClick={() => setViewMode('board')}>Board</button><button className={`toolbar-tab ${viewMode === 'timeline' ? 'active' : ''}`} type="button" onClick={() => setViewMode('timeline')}>Timeline</button>{domainFilter !== 'all' && <button className="active-stream-filter" type="button" onClick={() => setDomainFilter('all')}>{domainFilters.find((domain) => domain.value === domainFilter)?.label} <X size={12} strokeWidth={1.5} /></button>}</div>
            <div className="toolbar-controls">
              <label className="search-box"><Search size={15} strokeWidth={1.5} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" aria-label="Search tasks" /></label>
              <label className="filter-box"><ListFilter size={14} strokeWidth={1.5} /><select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as 'all' | Priority)} aria-label="Filter by priority"><option value="all">All priorities</option><option value="high">High only</option><option value="normal">Normal</option><option value="low">Low</option></select><ChevronDown size={13} strokeWidth={1.5} /></label>
              {liveCount > 0 && <span className="live-toolbar"><i /> {liveCount} LIVE</span>}
            </div>
          </div>

          {message && <div className="toast" role="status"><Check size={15} strokeWidth={1.6} />{message}</div>}

          {!loading && visibleTasks.length===0 && <div className="board-empty-hint"><p>No tasks match these filters.</p><button type="button" className="ghost-button" onClick={()=>openControl(true)}>New request</button></div>}
          {loading ? <div className="loading-state"><span className="loading-orbit" />Loading tasks…</div> : visibleTasks.length === 0 ? null : viewMode === 'board' ? (
            <div className="board" aria-label="Task board">
              {STATUSES.map((status) => (
                <TaskColumn key={status} status={status} tasks={visibleTasks.filter((task) => task.status === status)} selectedId={selectedId} onSelect={setSelectedId} onMove={moveTask} onDropTask={moveTask} onOpenComposer={() => openControl(true)} onRun={runTask} />
              ))}
            </div>
          ) : <TimelineView tasks={visibleTasks} selectedId={selectedId} onSelect={setSelectedId} />}

          </>}
          {page === 'ideas' && <><IdeaShelf streams={streams} notes={areaNotes} loading={vaultLoading} onSend={sendToHermes} onArea={moveNoteToArea} onKind={setNoteKind} />
          <details className="tree-fold"><summary>Idea progress</summary>
            <IdeaTree taskPaths={taskLikePaths} character={character} brain={brain} area={area} selected={brainPick?.id || null} onSelect={(node) => { setBrainPick(node); setBrainOpen(true); }} onStart={(node) => { const note = vaultNotes.find((entry) => entry.path === node.id); if (note) sendToHermes(note); }} onBranch={(node) => setDump({ parent: { id: node.id, title: node.title } })} />
          </details></>}

          <p className="page-foot"><span className="status-pip" />Saved on this Mac{attentionCount > 0 ? ` · ${attentionCount} waiting for you` : ""}</p>
        </main>

        {selectedTask && <TaskInspector task={selectedTask} saving={saving} planning={planningId === selectedTask?.id} onClose={() => setSelectedId(null)} onUpdate={updateTask} onArchive={archiveTask} onPlan={analyzePlan} />}
      </div>
      {helpOpen && <HelpDialog onClose={() => setHelpOpen(false)} />}
      {historyOpen && <HistoryDialog tasks={tasks} onClose={() => setHistoryOpen(false)} onOpenTask={openBoardTask} />}
      {dump && <IdeaDump parent={dump.parent} area={area} onClose={() => setDump(null)} onSubmit={saveDump} />}
      {phoneOpen && <PhoneDialog onClose={() => setPhoneOpen(false)} />}
      {setup && !remote && (settingsOpen || !setup.configured) && <SetupDialog state={setup} firstRun={!setup.configured} onSave={saveSetup} onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

type AgentAsk = { taskId: string; taskTitle: string; boardName: string; kind: string; text: string; at: number };

type Character = { name: string; image: string; custom: boolean };
type Progress = { xp: number; level: number; into: number; need: number; title: string; completed: number; ideas: number };

function ideaDate(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(date);
}

type Session = { local: boolean; device: { id: string; name: string } | null; terminal?: 'hermes' | 'missing'; dashboard?: boolean };
// Inside the macOS app the terminal pane is native; the app opens it and pastes the idea there.


const AREA_ICON: Record<'all' | LifeArea, typeof Wallet> = { all: LayoutGrid, finance: Wallet, learning: GraduationCap, 'mental-health': HeartPulse, work: Briefcase, play: Gamepad2 };

// Left menu: the five life areas. Everything on the page (ideas, reminders, tasks) follows the choice.
function AreaRail({ page, area, counts, onChoose, sidebarOpen, onToggleSidebar, teams, selectedTeam, onSelectTeam, onAll }: { page:string; selectedTeam:string|null; onSelectTeam:(id:string)=>void;onAll:()=>void; area: 'all' | LifeArea; counts: Record<string, number>; onChoose: (area: 'all' | LifeArea) => void; sidebarOpen: boolean; onToggleSidebar: () => void; teams: Parameters<typeof TeamRail>[0]['teams'] }) {
  const [mobileOpen,setMobileOpen]=useState(false);
  const trigger=useRef<HTMLButtonElement>(null);
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&mobileOpen&&!document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')){setMobileOpen(false);trigger.current?.focus({preventScroll:true});}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[mobileOpen]);
  return <><button type="button" ref={trigger} className="rail-mobile-trigger ghost-button" aria-label={mobileOpen?'Close menu':'Menu'} data-nav-label={mobileOpen?'Close menu':'Menu'} aria-expanded={mobileOpen} aria-controls="left-navigation" onClick={()=>setMobileOpen(v=>!v)}><Menu size={24} aria-hidden="true"/></button>
  <nav id="left-navigation" className={`area-rail ${mobileOpen?'mobile-open':''}`} aria-label="Hermes Agents">
    <h3 className="rail-section-label" title="Hermes departments"><Bot size={18} aria-hidden="true"/><span className="sr-only">Hermes Agents {teams.length}</span></h3>
    <TeamRail teams={teams} allCount={counts.all || 0} selectedTeam={selectedTeam} onSelect={id=>{onSelectTeam(id);setMobileOpen(false);}} allActive={area === 'all' && selectedTeam===null} onAll={()=>{onAll();setMobileOpen(false);}} />
    {page!=='home'&&<details className="rail-life-filters"><summary aria-label="Personal filters" data-nav-label="Personal filters"><SlidersHorizontal size={24} aria-hidden="true"/><span className="sr-only">Personal filters</span></summary><div className="rail-areas" role="group" aria-label="Life areas">{LIFE_AREAS.map(item=>{const Icon=AREA_ICON[item.id];return <button type="button" key={item.id} className="rail-area" aria-label={item.label} data-nav-label={item.label} aria-pressed={area===item.id} onClick={()=>onChoose(area===item.id?'all':item.id)}><Icon size={24} aria-hidden="true"/><span className="sr-only">{item.label}</span></button>;})}</div></details>}
    <button type="button" className={`area-item rail-toggle ${sidebarOpen ? 'active' : ''}`} aria-label="Toggle filters" data-nav-label="Toggle filters" aria-expanded={sidebarOpen} onClick={onToggleSidebar}>{sidebarOpen?<PanelLeftClose size={19}/>:<PanelLeftOpen size={19}/>}<span className="sr-only">Filters</span></button>
  </nav></>;
}

function IdeaShelf({ streams, notes, loading, onSend, onArea, onKind, feed }: { streams: Stream[]; notes: VaultNote[]; loading: boolean; onSend: (idea: VaultNote) => void; onArea: (idea: VaultNote, area: LifeArea) => void; onKind: (idea: VaultNote, kind: 'idea' | 'task') => void; feed?: React.ReactNode }) {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<string>('all');
  const [shelf, setShelf] = useState<'idea' | 'task'>('idea');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const IDEA_GROUP_ORDER = useMemo(() => streams.map((stream) => stream.id), [streams]);
  const IDEA_GROUP_LABEL = useMemo(() => Object.fromEntries(streams.map((stream) => [stream.id, stream.label])) as Record<string, string>, [streams]);
  const IDEA_GROUP_COLOR = useMemo(() => Object.fromEntries(streams.map((stream) => [stream.id, stream.color])) as Record<string, string>, [streams]);
  const allIdeaNotes = useMemo(() => notes.filter((note) => note.kind === 'idea'), [notes]);
  const taskLikeCount = allIdeaNotes.filter((note) => note.noteKind === 'task').length;
  const ideas = useMemo(() => allIdeaNotes.filter((note) => (note.noteKind || 'idea') === shelf).map((note) => ({ ...note, domain: note.domain && IDEA_GROUP_LABEL[note.domain] ? note.domain : 'private' })).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')), [allIdeaNotes, shelf, IDEA_GROUP_LABEL]);
  const counts = useMemo(() => ideas.reduce<Record<string, number>>((acc, idea) => { acc[idea.domain] = (acc[idea.domain] || 0) + 1; return acc; }, {}), [ideas]);
  const q = query.trim().toLowerCase();
  const filtered = ideas.filter((idea) => (group === 'all' || idea.domain === group) && (!q || `${idea.title} ${idea.summary}`.toLowerCase().includes(q)));
  const groups = IDEA_GROUP_ORDER.map((key) => ({ key, items: filtered.filter((idea) => idea.domain === key) })).filter((entry) => entry.items.length > 0);
  const PREVIEW = 4;
  return <section className="idea-shelf" aria-label="Obsidian idea collection">
    <div className="idea-shelf-head">
      <div><span className="eyebrow">OBSIDIAN / IDEAS</span><div className="shelf-switch" role="tablist" aria-label="Ideas or task-like notes">
        <button type="button" role="tab" aria-selected={shelf === 'idea'} className={shelf === 'idea' ? 'on' : ''} onClick={() => setShelf('idea')}>💡 Ideas <b>{loading ? '…' : allIdeaNotes.length - taskLikeCount}</b></button>
        <button type="button" role="tab" aria-selected={shelf === 'task'} className={shelf === 'task' ? 'on' : ''} onClick={() => setShelf('task')} title="Notes that already describe concrete work (a fix, a check, a setting)">✅ Already tasks <b>{taskLikeCount}</b></button>
      </div></div>
      <label className="idea-search"><Search size={13} strokeWidth={1.5} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" aria-label="Search ideas" /></label>
    </div>
    <div className="idea-chips" role="tablist">
      <button type="button" className={group === 'all' ? 'active' : ''} onClick={() => setGroup('all')}>All <b>{ideas.length}</b></button>
      {IDEA_GROUP_ORDER.filter((key) => counts[key]).map((key) => <button type="button" key={key} className={group === key ? 'active' : ''} onClick={() => setGroup(key)}>{IDEA_GROUP_LABEL[key]} <b>{counts[key]}</b></button>)}
    </div>
    {groups.length === 0 ? <p className="idea-empty">{loading ? 'Loading…' : 'No matching ideas.'}</p> : <ul className="dir-tree idea-dir" role="tree">
      {groups.map(({ key, items }) => {
        // Folders start open when filtered/searched; otherwise only the first shows its full list.
        const folderOpen = open[`f:${key}`] ?? (group !== 'all' || q.length > 0 || key === groups[0].key);
        const expanded = open[key] || group !== 'all' || q.length > 0;
        const shown = expanded ? items : items.slice(0, PREVIEW);
        return <li className="dir-node dir-group" key={key}>
          <div className="dir-line">
            <button type="button" className="dir-toggle dir-group-toggle" aria-expanded={folderOpen} onClick={() => setOpen((value) => ({ ...value, [`f:${key}`]: !folderOpen }))}>
              {folderOpen ? <FolderOpen size={18} strokeWidth={1.6} style={{ color: IDEA_GROUP_COLOR[key] }} /> : <Folder size={18} strokeWidth={1.6} style={{ color: IDEA_GROUP_COLOR[key] }} />}
              <h4>{IDEA_GROUP_LABEL[key]}</h4><span className="dir-count">{items.length}</span>
            </button>
          </div>
          {folderOpen && <ul className="dir-children">
            {shown.map((idea) => <li className="dir-node" key={idea.path}><div className="dir-line idea-file">
              <span className="dir-leaf" aria-hidden="true"><FileText size={15} strokeWidth={1.6} /></span>
              <a className="idea-file-open" href={idea.url} target="_blank" rel="noreferrer" title={`${idea.title} — open in Obsidian`}>
                <span className="idea-row-main"><strong>{idea.title}</strong>{idea.summary && <small>{idea.summary}</small>}</span>
                <time>{ideaDate(idea.updatedAt)}</time>
              </a>
              <select className={`idea-area area-${idea.lifeArea || 'work'}`} value={idea.lifeArea || 'work'} aria-label={`Life area of ${idea.title}`} title="Life area" onChange={(event) => onArea(idea, event.target.value as LifeArea)}>{LIFE_AREAS.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select>
              <button type="button" className="kind-flip" title={shelf === 'idea' ? 'This is already a task — move it to Already tasks' : 'This is still an idea — move it back to Ideas'} aria-label={`Mark ${idea.title} as ${shelf === 'idea' ? 'a task' : 'an idea'}`} onClick={() => onKind(idea, shelf === 'idea' ? 'task' : 'idea')}>{shelf === 'idea' ? '✅' : '💡'}</button><button type="button" className="idea-to-hermes" title="Copy request" aria-label={`${idea.title} copy request`} onClick={() => onSend(idea)}><SquareTerminal size={14} strokeWidth={1.8} /></button>
            </div></li>)}
            {!expanded && items.length > PREVIEW && <li className="dir-node"><div className="dir-line"><button type="button" className="idea-more" onClick={() => setOpen((value) => ({ ...value, [key]: true }))}>{items.length - PREVIEW} more <ChevronDown size={12} strokeWidth={1.5} /></button></div></li>}
          </ul>}
        </li>;
      })}
    </ul>}
  </section>;
}

function TimelineView({ tasks, selectedId, onSelect }: { tasks: Task[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const ordered = [...tasks].sort((left, right) => new Date(left.dueAt || left.updatedAt).getTime() - new Date(right.dueAt || right.updatedAt).getTime());
  return <section className="timeline-view" aria-label="Timeline view">{ordered.length === 0 ? <div className="empty-timeline">No tasks match this view.</div> : ordered.map((task) => <article className={`timeline-row ${task.id === selectedId ? 'selected' : ''}`} key={task.id} onClick={() => onSelect(task.id)}><span className="timeline-time">{task.dueAt ? formatDate(task.dueAt) : relativeTime(task.updatedAt)}</span><span className={`timeline-status tone-${statusMeta[task.status].tone}`} /><div className="timeline-copy"><strong>{task.title}</strong><p>{task.description || 'No description'}</p></div><span className="timeline-priority">{task.priority.toUpperCase()}</span><span className="timeline-state">{statusMeta[task.status].label}</span></article>)}</section>;
}

function HelpDialog({ onClose }: { onClose: () => void }) {
  const panel=useRef<HTMLElement>(null);useModalFocus(panel,onClose);
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section ref={panel} tabIndex={-1} className="help-dialog" role="dialog" aria-modal="true" aria-labelledby="help-title"><div className="help-head"><div><span className="eyebrow">ASTER / QUICK GUIDE</span><h2 id="help-title">How BrainBook works</h2></div><button className="icon-button" type="button" aria-label="Close help" onClick={onClose}><X size={17} strokeWidth={1.5} /></button></div><div className="help-grid"><div><strong>01 / Capture</strong><p>Everything enters in Active Agents at the top: <b>New task</b>, the <b>N</b> key and “Capture another” all open the same box. The top-bar <b>Run</b> button goes there too, but only to show other work — a task is handed over from a row in it.</p></div><div><strong>02 / Next</strong><p>Show inside Active Agents is the one ranked answer to what happens next — board tasks, your Obsidian checklist lines and anything an agent is waiting on.</p></div><div><strong>03 / Move</strong><p>Drag a card, or use the menu at its bottom right, to change its status. Run hands it to Bigkiji.</p></div><div><strong>04 / Vault</strong><p>Obsidian notes and reminders appear under the list. Checking one updates the original line in the note.</p></div></div><div className="help-foot"><span>LOCAL-FIRST · NO CLOUD REQUIRED</span><button className="submit-button" type="button" onClick={onClose}>Close <Check size={14} strokeWidth={1.5} /></button></div></section></div>;
}

// 履歴 (History) — the done tasks used to live inline in the main board/timeline (the "Completed"
// filter just swapped the same page to viewFilter==='done'). The owner asked for them out of the
// main dashboard entirely and into their own popup, reached from the sidebar menu, so the board the
// owner scans every day never mixes finished work back into it.
function HistoryDialog({ tasks, onClose, onOpenTask }: { tasks: Task[]; onClose: () => void; onOpenTask: (id: string) => void }) {
  const panel = useRef<HTMLElement>(null); useModalFocus(panel, onClose);
  const done = useMemo(() => tasks.filter((task) => !task.isArchived && task.status === 'done')
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()), [tasks]);
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={panel} tabIndex={-1} className="help-dialog history-dialog" role="dialog" aria-modal="true" aria-labelledby="history-title">
      <div className="help-head"><div><span className="eyebrow">BRAINBOOK / HISTORY</span><h2 id="history-title">Completed ({done.length})</h2></div><button className="icon-button" type="button" aria-label="Close history" onClick={onClose}><X size={17} strokeWidth={1.5} /></button></div>
      {done.length === 0 ? <p className="history-empty">No completed tasks yet.</p> : <ul className="history-list">
        {done.map((task) => <li key={task.id}>
          <button type="button" className="routine-item" onClick={() => { onOpenTask(task.id); onClose(); }}>
            <span className={`routine-dot tone-${statusMeta[task.status].tone}`} />
            <span className="routine-copy"><strong>{task.title}</strong><small>{relativeTime(task.updatedAt)} · {formatDate(task.updatedAt)}</small></span>
            <ArrowUpRight size={13} />
          </button>
        </li>)}
      </ul>}
      <div className="help-foot"><span>DONE WORK, KEPT OUT OF THE BOARD</span><button className="submit-button" type="button" onClick={onClose}>Close <Check size={14} strokeWidth={1.5} /></button></div>
    </section>
  </div>;
}

function TaskColumn({ status, tasks, selectedId, onSelect, onMove, onDropTask, onOpenComposer, onRun }: {
  onRun: (task: Task) => void;
  status: TaskStatus;
  tasks: Task[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMove: (id: string, status: TaskStatus) => void;
  onDropTask: (id: string, status: TaskStatus) => void;
  onOpenComposer: () => void;
}) {
  const meta = statusMeta[status];
  const [isOver, setIsOver] = useState(false);
  return (
    <section className={`column tone-${meta.tone} ${isOver ? 'drag-over' : ''}`} onDragOver={(event) => { event.preventDefault(); setIsOver(true); }} onDragLeave={() => setIsOver(false)} onDrop={(event) => { event.preventDefault(); setIsOver(false); const id = event.dataTransfer.getData('text/task-id'); if (id) onDropTask(id, status); }} aria-labelledby={`${status}-heading`}>
      <div className="column-header"><div className="column-title"><span className="column-marker" /><div><h3 id={`${status}-heading`}>{meta.label}</h3><p>{meta.description}</p></div></div><div className="column-header-end">{status === 'working' && <span className="column-live"><i /> LIVE</span>}<span className="column-count">{tasks.length}</span></div></div>
      <div className="column-list">
        {tasks.length === 0 ? <div className="empty-column"><span>—</span><p>Nothing here yet</p></div> : tasks.map((task) => <TaskCard key={task.id} task={task} selected={task.id === selectedId} onSelect={() => onSelect(task.id)} onMove={onMove} onRun={onRun} />)}
      </div>
      {status === 'inbox' && <button className="add-inline" type="button" onClick={onOpenComposer}><Plus size={14} strokeWidth={1.5} /> Capture another</button>}
    </section>
  );
}

// Top-bar Run (owner 2026-10-02): a shortcut into the Control Center, not a second queue. It keeps
// the live count — that is the one thing that belongs in the top bar — and opens the Next Work List,
// which is where a task is actually handed to Bigkiji.
function RunShortcut({ tasks, vaultTasks, onOpen }: { tasks: Task[]; vaultTasks: VaultTask[]; onOpen: () => void }) {
  const { active, running } = runSummary({ tasks, vaultTasks });
  const label = running ? `Running ${running}` : active ? `Queued ${active}` : 'Run';
  // The phone layout hides this label (`.topbar .run-top span:not(.run-spinner)` is `display: none` in
  // styles.css), which leaves the button as an icon with no name at all. So the name lives in
  // `aria-label`, where hiding the text cannot take it away, and it starts with the visible word so the
  // name still contains the label. It carries where the button leads too: a `title` is a mouse-only
  // channel, and this is the one control whose whole job is to send the owner to that list.
  return (
    <div className="run-menu">
      <button type="button" className={`run-top ${running ? 'is-running' : active ? 'is-queued' : ''}`} title="Open the Control Center to hand work to Bigkiji" aria-label={`${label}. Opens the Control Center, the one place to hand work to Bigkiji.`} onClick={onOpen}>
        {running ? <span className="run-spinner" aria-hidden="true" /> : <Play size={13} strokeWidth={2.4} />}
        <span>{label}</span>
      </button>
    </div>
  );
}


function TaskCard({ task, selected, onSelect, onMove, onRun }: { task: Task; selected: boolean; onSelect: () => void; onMove: (id: string, status: TaskStatus) => void; onRun: (task: Task) => void }) {
  const meta = statusMeta[task.status];
  const run = runState(task);
  const live = run === 'running' || task.status === 'working' || task.planStatus === 'analyzing';
  return (
    <article className={`task-card ${selected ? 'selected' : ''} ${live ? 'is-live' : ''} run-${run} priority-${task.priority}`} draggable onDragStart={(event) => { event.dataTransfer.setData('text/task-id', task.id); event.dataTransfer.effectAllowed = 'move'; }} onClick={onSelect}>
      <div className="task-card-top"><span className="task-index">{live && <span className="live-badge"><i /> LIVE</span>} {meta.short} / {task.id.slice(-4).toUpperCase()}</span><button className="card-more" type="button" aria-label={`Open details for ${task.title}`} onClick={(event) => { event.stopPropagation(); onSelect(); }}><MoreHorizontal size={15} strokeWidth={1.5} /></button></div>
      <h4>{task.title}</h4>
      {task.description && <p className="task-description">{task.description}</p>}
      <RunButton task={task} onRun={onRun} />
      <div className="task-card-bottom"><span className="task-time"><Clock3 size={12} strokeWidth={1.5} />{relativeTime(task.updatedAt)}</span><span className="domain-tag" style={{ '--stream': streamColor(task.routing?.domain) } as React.CSSProperties}><i />{task.routing?.domainLabel || 'Other'}</span><span className="priority-mark" aria-label={`Priority ${task.priority}`}><i /><i /><i className={task.priority !== 'low' ? 'on' : ''} /><i className={task.priority === 'high' ? 'on' : ''} /></span></div>
      <label className="status-select" onClick={(event) => event.stopPropagation()}><select value={task.status} onChange={(event) => onMove(task.id, event.target.value as TaskStatus)} aria-label={`Status of ${task.title}`}>{STATUSES.map((value) => <option key={value} value={value}>{statusMeta[value].label}</option>)}</select><ChevronDown size={12} strokeWidth={1.5} /></label>
    </article>
  );
}

function PlanView({ plan }: { plan: NonNullable<Task['plan']> }) {
  return <div className="plan-view"><p className="plan-summary">{plan.summary}</p>{plan.phases.map((phase, index) => <div className="phase-row" key={`${phase.name}-${index}`}><span className="phase-index">{String(index + 1).padStart(2, '0')}</span><div className="phase-copy"><strong>{phase.name.replace(/^\d+\s*\/\s*/, '')}</strong><p>{phase.intent}</p><ul>{phase.steps.map((step, stepIndex) => <li key={`${step}-${stepIndex}`}>{step}</li>)}</ul><small>Owner: {phase.owner} · Exit: {phase.exitCriteria}</small></div></div>)}{plan.risks.length > 0 && <div className="plan-risks"><span>RISKS</span>{plan.risks.map((risk) => <p key={risk}>⚠ {risk}</p>)}</div>}<div className="next-action"><span>NEXT ACTION</span><p>{plan.nextAction}</p></div></div>;
}

function TaskInspector({ task, saving, planning, onClose, onUpdate, onArchive, onPlan }: { task: Task | null; saving: boolean; planning: boolean; onClose: () => void; onUpdate: (id: string, patch: Partial<Task>, message?: string) => Promise<void>; onArchive: (id: string) => void; onPlan: (task: Task) => void }) {
  const [draft, setDraft] = useState<Partial<Task>>({});
  useEffect(() => { setDraft(task || {}); }, [task]);
  if (!task) return <aside className="inspector empty-inspector" aria-label="Task details"><div className="inspector-empty-art"><PanelRight size={24} strokeWidth={1.1} /></div><p>Select a task<br />to see its details here.</p><span>Everything stays in your local field.</span></aside>;
  const value = <T extends keyof Task>(key: T) => (draft[key] as Task[T] | undefined) ?? task[key];
  const save = () => void onUpdate(task.id, { title: value('title'), description: value('description'), priority: value('priority'), routing: value('routing'), dueAt: value('dueAt') || null, status: value('status') }, 'Details saved.');
  const prioritySourceLabel = task.routing?.prioritySource === 'jev' ? 'JEV PRIORITY' : task.routing?.prioritySource === 'local-model' ? 'LOCAL MODEL' : task.routing?.prioritySource === 'manual' ? 'MANUAL PRIORITY' : task.routing?.routeSource === 'jev' ? 'JEV ROUTING' : 'LOCAL RULES';
  const priorityConfidence = task.routing?.priorityConfidence;
  const priorityConfidenceLabel = Number.isFinite(priorityConfidence) ? ` · confidence ${Math.round((priorityConfidence || 0) * 100)}%` : '';
  return (
    <aside className="inspector" aria-label="Task details">
      <div className="inspector-head"><div><span className="eyebrow">TASK DETAIL / {task.id.slice(-6).toUpperCase()}</span><h2>{task.status === 'working' || task.planStatus === 'analyzing' ? <span className="live-title"><i /> Live</span> : 'Edit'}</h2></div><button className="icon-button" type="button" aria-label="Close details" onClick={onClose}><X size={17} strokeWidth={1.5} /></button></div>
      <div className="inspector-scroll">
        <label className="field-label">Title<input value={value('title')} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
        <label className="field-label">Notes<textarea rows={5} value={value('description')} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Notes for this task" /></label>
        <div className="field-grid"><label className="field-label">Status<select value={value('status')} onChange={(event) => setDraft({ ...draft, status: event.target.value as TaskStatus })}>{STATUSES.map((status) => <option key={status} value={status}>{statusMeta[status].label}</option>)}</select></label><label className="field-label">Priority<select value={value('priority')} onChange={(event) => { const current = value('routing') || task.routing; setDraft({ ...draft, priority: event.target.value as Priority, routing: { ...current, priorityReason: 'manual priority override', prioritySource: 'manual' } }); }}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option></select></label></div>
        <label className="field-label">Stream<select value={value('routing')?.domain || 'private'} onChange={(event) => { const next = event.target.value as TaskDomain; const selected = STREAM_LIST.find((stream) => stream.id === next); const current = value('routing') || task.routing; setDraft({ ...draft, routing: { ...current, domain: next, domainLabel: selected?.label || current.domainLabel, priorityReason: 'manual domain override' } }); }} aria-label="Task stream">{STREAM_LIST.map((stream) => <option key={stream.id} value={stream.id}>{stream.label}</option>)}</select></label><label className="field-label">Area<select value={(value('area') as LifeArea | null | undefined) || task.lifeArea || 'work'} onChange={(event) => setDraft({ ...draft, area: event.target.value as LifeArea })} aria-label="Life area">{LIFE_AREAS.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select></label>
        <div className="routing-panel"><div className="routing-panel-head"><span>AUTO ROUTING</span><strong>{prioritySourceLabel}</strong></div><div className="routing-domain"><span className="routing-pulse" /><strong>{task.routing?.domainLabel || 'Private / personal'}</strong><span>→ {task.routing?.worker || 'hermes'}</span></div><p>{task.routing?.priorityReason || 'Classification is ready.'}{priorityConfidenceLabel}</p></div>
        <div className="plan-panel"><div className="plan-panel-head"><span>EXECUTION PLAN</span><strong>{task.plan ? (task.plan.source === 'router' ? 'ROUTER' : task.plan.source === 'opencode' ? 'OPENCODE' : 'LOCAL TEMPLATE') : planning ? 'ANALYZING' : 'NOT GENERATED'}</strong>{task.plan && <button className="plan-refresh" type="button" onClick={() => onPlan(task)} disabled={planning}>{planning ? '...' : 'Re-analyze'}</button>}</div>{task.plan ? <PlanView plan={task.plan} /> : <div className="plan-empty"><p>Let the Router break this task into phases.</p><button className="plan-button" type="button" onClick={() => onPlan(task)} disabled={planning}>{planning ? 'Analyzing…' : 'Analyze with Router'}<Sparkles size={14} strokeWidth={1.5} /></button>{task.planError && <small>{task.planError}</small>}</div>}</div>
        <label className="field-label">Due<input type="date" value={value('dueAt')?.slice(0, 10) || ''} onChange={(event) => setDraft({ ...draft, dueAt: event.target.value ? new Date(`${event.target.value}T12:00:00`).toISOString() : null })} /></label>
        <div className="inspector-note"><CalendarDays size={15} strokeWidth={1.5} /><div><span>Updated</span><strong>{relativeTime(task.updatedAt)} · {formatDate(task.updatedAt)}</strong></div></div>
        <div className="history-block"><div className="history-title"><span>FIELD NOTES</span><span>{task.notes.length}</span></div>{task.notes.length === 0 ? <p>No notes yet.</p> : task.notes.map((note, index) => <div className="note-row" key={`${note}-${index}`}><span>{String(index + 1).padStart(2, '0')}</span><p>{note}</p></div>)}</div>
      </div>
      <div className="inspector-actions"><button className="save-button" type="button" onClick={save} disabled={saving}><Save size={15} strokeWidth={1.5} />{saving ? 'Saving…' : 'Save changes'}</button><button className="archive-button" type="button" onClick={() => onArchive(task.id)}><Archive size={15} strokeWidth={1.5} />Archive</button></div>
    </aside>
  );
}

export default App;
