import type { Task, VaultTask } from './types';

export type RunState = 'idle' | 'queued' | 'waiting-gpu' | 'running' | 'blocked' | 'done';
export type NextWorkRank = 'ask' | 'attention' | 'overdue' | 'today' | 'high' | 'soon' | 'next';
export type NextWorkGroup = 'you' | 'due' | 'next';
export type Runnable = { title: string; status?: string; kanban?: Task['kanban'] };

// The one guard every string a row prints goes through, exported so the card cannot keep its own copy.
export function asText(value: unknown): string;

export const NEXT_WORK_RANKS: Record<NextWorkRank, number>;
export const RANK_LABEL: Record<NextWorkRank, string>;
export const RANK_HINT: Record<NextWorkRank, string>;
export const RANK_TONE: Record<NextWorkRank, string>;
export const RANK_GROUP: Record<NextWorkRank, NextWorkGroup>;
export const GROUP_LABEL: Record<NextWorkGroup, string>;
export const RUN_LABEL: Record<RunState, string>;
export const RUN_HINT: Record<RunState, string>;

export function rankName(rank: number): NextWorkRank;
export function rowLabel(...parts: unknown[]): string;
export function runName(state: RunState | string, title: unknown): string;
export function markDoneName(title: unknown): string;
export function rowNoteId(index: number, key: unknown): string;

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
  focus?: 'work' | 'personal' | 'all';
};

export const NEXT_WORK_RANKS: Record<NextWorkRank, number>;

export function runState(thing: Runnable | Task | VaultTask | null | undefined): RunState;
export function runSummary(input?: { tasks?: Task[]; vaultTasks?: VaultTask[] }): { active: number; running: number };
export function nextWorkList(input?: NextWorkInput): NextWorkRow[];
export function nextWorkCounts(rows?: NextWorkRow[]): { total: number; needYou: number; ready: number; running: number };