export type LiveWorkRow = { key: string; kind: 'card' | 'router' | 'session'; from: string; agent: string; title: string; where: string; state: string; count: number; updatedAt: number | null };
export function liveWork(handoffs: { id: string; source: string; board: string; boardName: string; from: string; to: string; title: string; state: string; active: boolean; at: number | null; team?: string }[], now?: number): LiveWorkRow[];
export function elapsedLabel(at: number | null | undefined, now?: number): string;
