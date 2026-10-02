export const STATUSES = ['inbox', 'scheduled', 'working', 'needs_attention', 'done'] as const;
export type TaskStatus = (typeof STATUSES)[number];
export type Priority = 'low' | 'normal' | 'high';
// Stream ids come from the user's streams.json (or the default set); 'private' is the fallback.
export type TaskDomain = string;

export type RoutingMeta = {
  domain: TaskDomain;
  domainLabel: string;
  priority: Priority;
  priorityReason: string;
  worker: string;
  routeSource: string;
  routeStatus: string;
  confidence: number;
  keywords: string[];
  prioritySource?: 'manual' | 'deterministic' | 'jev' | 'local-model';
  priorityConfidence?: number;
};

export type TaskPlanPhase = {
  name: string;
  intent: string;
  steps: string[];
  owner: string;
  exitCriteria: string;
};

export type TaskPlan = {
  summary: string;
  phases: TaskPlanPhase[];
  risks: string[];
  nextAction: string;
  source: 'opencode' | 'fallback';
  model: string;
  generatedAt: string;
};

export type LifeArea = 'finance' | 'learning' | 'mental-health' | 'work' | 'play';
export const LIFE_AREAS: { id: LifeArea; label: string }[] = [
  { id: 'finance', label: 'Finance' },
  { id: 'learning', label: 'Learning' },
  { id: 'mental-health', label: 'Mental health' },
  { id: 'work', label: 'Work' },
  { id: 'play', label: 'Play' },
];

export type Task = {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  source: string;
  priority: Priority;
  routing: RoutingMeta;
  plan: TaskPlan | null;
  planStatus: 'idle' | 'analyzing' | 'ready' | 'error';
  planError: string | null;
  dueAt: string | null;
  notes: string[];
  isArchived: boolean;
  // Set once the task is handed to the Hermes Kanban dispatcher (Run).
  kanban?: { board: string; id: string; status: string; assignee: string | null; team?: string | null; queuedAt: string | null; gpu: boolean } | null;
  area?: LifeArea | null;
  lifeArea?: LifeArea;
  createdAt: string;
  updatedAt: string;
};

export const statusMeta: Record<TaskStatus, { label: string; short: string; tone: string; description: string }> = {
  inbox: { label: 'Inbox', short: 'IN', tone: 'lime', description: 'Capture and clarify' },
  scheduled: { label: 'Scheduled', short: 'SC', tone: 'blue', description: 'Time-boxed next' },
  working: { label: 'Working', short: 'WK', tone: 'amber', description: 'In motion now' },
  needs_attention: { label: 'Needs attention', short: 'NA', tone: 'coral', description: 'Unblock a human' },
  done: { label: 'Done', short: 'DN', tone: 'mint', description: 'Closed loop' },
};

export type VaultNote = {
  path: string;
  title: string;
  summary: string;
  kind: 'project' | 'idea';
  // Idea notes only: 'task' = the note already names concrete work (a fix, a check), not an open idea.
  noteKind?: 'idea' | 'task';
  noteKindSource?: 'auto' | 'manual';
  domain?: string | null;
  domainLabel?: string | null;
  updatedAt?: string;
  lifeArea?: LifeArea;
  areaSource?: 'manual' | 'auto';
  status: string;
  taskCount: number;
  openCount: number;
  url: string;
};

export type VaultTask = {
  id: string;
  path: string;
  line: number;
  text: string;
  done: boolean;
  dueAt: string | null;
  reminder: boolean;
  lifeArea?: LifeArea;
  title: string;
  section?: string;
  url: string;
  kanban?: Task['kanban'];
};

export const isTaskStatus = (value: unknown): value is TaskStatus =>
  typeof value === 'string' && (STATUSES as readonly string[]).includes(value);
