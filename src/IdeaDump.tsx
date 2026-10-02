// Dump: get every idea out of your head fast. One idea per line; indent a line to make it a
// branch of the line above. Each line becomes its own Obsidian note, wired into the brain.
import { useEffect, useMemo, useRef, useState } from 'react';
import { GitBranch, Sparkles, X } from 'lucide-react';
import { LIFE_AREAS, type LifeArea } from './types';

export type DumpItem = { text: string; depth: number; parentIndex: number | null };

// "- idea", "  - sub idea", tabs or 2 spaces per level. Blank lines are skipped.
export function parseDump(raw: string): DumpItem[] {
  const items: DumpItem[] = [];
  const stack: { depth: number; index: number }[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const indent = line.match(/^[\t ]*/)![0].replace(/\t/g, '  ').length;
    const depth = Math.min(6, Math.floor(indent / 2));
    const text = line.trim().replace(/^([-*•・]|\d+[.)])\s+/, '').trim();
    if (!text) continue;
    while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
    const parentIndex = stack.length ? stack[stack.length - 1].index : null;
    items.push({ text, depth: parentIndex === null ? 0 : stack[stack.length - 1].depth + 1, parentIndex });
    stack.push({ depth, index: items.length - 1 });
  }
  return items;
}

type Props = {
  parent: { id: string; title: string } | null;
  area: 'all' | LifeArea;
  onClose: () => void;
  onSubmit: (items: DumpItem[], area: LifeArea | null) => Promise<void>;
};

export function IdeaDump({ parent, area, onClose, onSubmit }: Props) {
  const [raw, setRaw] = useState('');
  const [chosen, setChosen] = useState<LifeArea | 'auto'>(area === 'all' ? 'auto' : area);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const box = useRef<HTMLTextAreaElement>(null);
  const items = useMemo(() => parseDump(raw), [raw]);
  useEffect(() => { box.current?.focus(); }, []);

  const submit = async () => {
    if (!items.length || busy) return;
    setBusy(true);
    setError('');
    try { await onSubmit(items, chosen === 'auto' ? null : chosen); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save.'); setBusy(false); }
  };
  // Tab indents (makes a branch) instead of leaving the box; ⌘/Ctrl+Enter sends.
  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); void submit(); return; }
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
    if (event.key !== 'Tab') return;
    event.preventDefault();
    const el = event.currentTarget;
    const start = el.value.lastIndexOf('\n', el.selectionStart - 1) + 1;
    const line = el.value.slice(start);
    const next = event.shiftKey
      ? el.value.slice(0, start) + line.replace(/^( {1,2}|\t)/, '')
      : `${el.value.slice(0, start)}  ${line}`;
    const shift = next.length - el.value.length;
    const caret = Math.max(start, el.selectionStart + shift);
    setRaw(next);
    requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = caret; });
  };

  return <div className="dialog-backdrop dump-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="dump" role="dialog" aria-modal="true" aria-labelledby="dump-title">
      <header className="dump-head">
        <div>
          <span className="eyebrow">STEP 1 · DUMP</span>
          <h2 id="dump-title">{parent ? <>Branch from <em>{parent.title}</em></> : 'Empty your head'}</h2>
        </div>
        <button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={16} strokeWidth={1.5} /></button>
      </header>
      <div className="dump-body">
        <textarea
          ref={box}
          value={raw}
          onChange={(event) => setRaw(event.target.value)}
          onKeyDown={onKeyDown}
          spellCheck={false}
          aria-label="Ideas, one per line"
          placeholder={'One idea per line. Tab = branch of the line above.\n\nSchool booking app\n  Online payment\n  Teacher calendar sync\nWeekend Thai cooking class\nSleep earlier on weekdays'}
        />
        <div className="dump-preview" aria-label="Preview">
          <span className="eyebrow">{items.length ? `${items.length} IDEA${items.length === 1 ? '' : 'S'}` : 'PREVIEW'}</span>
          {items.length === 0 ? <p className="dump-hint">Type anything. Don't sort, don't polish — just get it out. You'll connect things on the map.</p> : <ul>
            {parent && <li className="dump-root"><GitBranch size={12} strokeWidth={1.8} />{parent.title}</li>}
            {items.map((item, index) => <li key={index} style={{ paddingLeft: `${(item.depth + (parent ? 1 : 0)) * 16}px` }} className={item.depth || parent ? 'is-branch' : ''}>{item.text}</li>)}
          </ul>}
        </div>
      </div>
      <footer className="dump-foot">
        <div className="dump-areas" role="radiogroup" aria-label="Life area">
          {[{ id: 'auto' as const, label: 'Auto' }, ...LIFE_AREAS].map((entry) => <button key={entry.id} type="button" role="radio" aria-checked={chosen === entry.id} className={`dump-area area-${entry.id} ${chosen === entry.id ? 'active' : ''}`} onClick={() => setChosen(entry.id)}>{entry.label}</button>)}
        </div>
        {error && <p className="dump-error" role="alert">{error}</p>}
        <button type="button" className="primary-button" disabled={!items.length || busy} onClick={() => void submit()}>
          <Sparkles size={15} strokeWidth={1.6} />{busy ? 'Wiring…' : `Add ${items.length || ''} to the brain`}<kbd>⌘↵</kbd>
        </button>
      </footer>
    </section>
  </div>;
}
