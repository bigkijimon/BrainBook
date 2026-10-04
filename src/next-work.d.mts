import type { Task, VaultTask } from './types';

export type RunState = 'idle' | 'queued' | 'waiting-gpu' | 'running' | 'blocked' | 'done';
export type Runnable = { title: string; status?: string; kanban?: Task['kanban'] };
export type NextWorkRank = 'ask' | 'attention' | 'overdue' | 'today' | 'high' | 'soon' | 'next';

export type NextWorkRow = {
  key: string;
  kind: 'ask' | 'task' | 'note';
  rank: number;
  title: string;
  detail: string;
  dueAt: string | null;
  href: string | null;
  boardTask: Task | null;
  noteTask: VaultTask | null;
};

export type NextWorkInput = {
  tasks?: Task[];
  vaultTasks?: VaultTask[];
  asks?: { taskId: string; taskTitle: string; boardName: string; text: string }[];
  now?: number;
  focus?: 'work' | 'personal';
};

export const NEXT_WORK_RANKS: Record<NextWorkRank, number>;

export function runState(thing: Runnable | Task | VaultTask | null | undefined): RunState;
export function runSummary(input?: { tasks?: Task[]; vaultTasks?: VaultTask[] }): { active: number; running: number };
export function nextWorkList(input?: NextWorkInput): NextWorkRow[];
export function nextWorkCounts(rows?: NextWorkRow[]): { total: number; needYou: number; ready: number; running: number };