import type { Task } from './types';

export function matchesFocus(task: Pick<Task, 'lifeArea' | 'area'>, focus: 'work' | 'personal'): boolean;
export function scheduledTasks(tasks: Task[]): Task[];
