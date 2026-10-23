// Shared page primitives: the one status badge, the one empty/loading/error note, the one page header.
// Every page uses these so status, empty states and headers read the same everywhere.
import type { ReactNode } from 'react';

export type Tone = 'ok' | 'warn' | 'bad' | 'unknown' | 'live' | 'info';

/** The only status badge. Tone carries meaning; the text always says it too (never colour alone). */
export function Chip({ tone = 'unknown', dot = false, className = '', title, children }: { tone?: Tone; dot?: boolean; className?: string; title?: string; children: ReactNode }) {
  return <em className={`dp-chip ${tone}${className ? ` ${className}` : ''}`} title={title}>{dot && <i aria-hidden="true" />}{children}</em>;
}

/** The only empty / loading / error line inside a card. Errors are announced, the rest are polite. */
export function StateNote({ kind, children, action }: { kind: 'empty' | 'loading' | 'error'; children: ReactNode; action?: ReactNode }) {
  return <div className={`state-note state-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
    {kind === 'loading' && <span className="loading-orbit" aria-hidden="true" />}
    <p>{children}</p>{action}
  </div>;
}

/** The only page header: eyebrow (date), title, one-line purpose, one primary action. */
export function PageHeader({ eyebrow, title, purpose, action }: { eyebrow: string; title: string; purpose: string; action: ReactNode }) {
  return <header className="content-header page-header">
    <div><p className="eyebrow">{eyebrow}</p><h2>{title}<span className="title-dot">.</span></h2><p className="content-lede">{purpose}</p></div>
    {action}
  </header>;
}
