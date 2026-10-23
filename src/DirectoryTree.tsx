// Real folders under ~/Documents, from DBAgent's registry.json `directories` (served unfiltered by /api/dbagent).
// The flat rows are folded into a tree by `rel`. Nothing is inferred: aliases, in-use flags, services, ports and
// canonical captions are exactly what the registry says.
import { useMemo, useState } from 'react';
import { Chip, StateNote } from './ui';
import { ArrowRight, Folder, FolderOpen, Link2 } from 'lucide-react';

export type DirRow = { path: string; rel: string; depth: number; alias_of: string | null; entries: number; modified: string; services: string[]; ports: string[]; routes: string[]; canonical: string[]; in_use: boolean };
type Node = { rel: string; name: string; row: DirRow | null; children: Node[] };

const DOCS = /^\/Users\/[^/]+\/Documents\//;
const short = (target: string) => target.replace(DOCS, '');

function build(rows: DirRow[]): Node[] {
  const byRel = new Map<string, Node>();
  const roots: Node[] = [];
  const ensure = (rel: string): Node => {
    const hit = byRel.get(rel);
    if (hit) return hit;
    const node: Node = { rel, name: rel.slice(rel.lastIndexOf('/') + 1), row: null, children: [] };
    byRel.set(rel, node);
    const cut = rel.lastIndexOf('/');
    (cut < 0 ? roots : ensure(rel.slice(0, cut)).children).push(node);
    return node;
  };
  for (const row of rows) ensure(row.rel).row = row;
  const sort = (list: Node[]) => { list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })); list.forEach((n) => sort(n.children)); };
  sort(roots);
  return roots;
}

function Row({ node, forceOpen, open, onToggle, keep }: { node: Node; forceOpen: boolean; open: Record<string, boolean>; onToggle: (rel: string, value: boolean) => void; keep: Set<string> }) {
  const row = node.row;
  const kids = node.children.filter((child) => keep.has(child.rel));
  const alias = row?.alias_of ?? null;
  const head = <>
    {alias ? <Link2 size={15} strokeWidth={1.8} aria-hidden="true" /> : kids.length > 0 ? <FolderOpen size={15} strokeWidth={1.8} aria-hidden="true" /> : <Folder size={15} strokeWidth={1.8} aria-hidden="true" />}
    <span className="dp-tree-name">{node.name}</span>
    {alias && <span className="dp-tree-alias" title={alias}><Chip tone="unknown">alias</Chip><ArrowRight size={13} aria-hidden="true" /><span>{short(alias)}</span></span>}
    {row?.in_use && <Chip tone="ok">IN USE</Chip>}
    {row?.services.map((s) => <Chip key={`s${s}`} tone="live" title="launchd service">{s}</Chip>)}
    {row?.ports.map((p) => <Chip key={`p${p}`} tone="warn" title="port">{p}</Chip>)}
    {row?.routes.map((r) => <Chip key={`r${r}`} tone="unknown" title="public route">{r}</Chip>)}
    {row && !alias && <small className="dp-tree-count">{row.entries}</small>}
  </>;
  const caption = row && row.canonical.length > 0 ? <small className="dp-tree-canon">{row.canonical.join(' · ')}</small> : null;
  const cls = `dp-tree-row${row?.in_use ? ' is-used' : ''}${alias ? ' is-alias' : ''}`;
  if (kids.length === 0) return <li className="dp-tree-node"><div className={cls}><div className="dp-tree-line">{head}</div>{caption}</div></li>;
  const isOpen = forceOpen || (open[node.rel] ?? (row?.depth ?? node.rel.split('/').length) === 1);
  return <li className="dp-tree-node">
    <details open={isOpen} onToggle={(event) => { const value = event.currentTarget.open; if (value !== isOpen) onToggle(node.rel, value); }}>
      <summary className={cls}><div className="dp-tree-line">{head}<small className="dp-tree-kids">{kids.length}</small></div>{caption}</summary>
      <ul className="dp-tree-list">{kids.map((child) => <Row key={child.rel} node={child} forceOpen={forceOpen} open={open} onToggle={onToggle} keep={keep} />)}</ul>
    </details>
  </li>;
}

export function DirectoryTree({ rows }: { rows: DirRow[] }) {
  const [inUseOnly, setInUseOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const roots = useMemo(() => build(rows), [rows]);
  const q = query.trim().toLowerCase();
  const filtering = inUseOnly || q.length > 0;
  // A row is kept if it matches, or if it is an ancestor of a match, so the chain to every hit stays navigable.
  const keep = useMemo(() => {
    const out = new Set<string>();
    for (const row of rows) {
      const hit = (!inUseOnly || row.in_use) && (!q || row.rel.toLowerCase().includes(q) || row.canonical.some((c) => c.toLowerCase().includes(q)));
      if (!hit) continue;
      for (let rel = row.rel; rel; rel = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '') out.add(rel);
    }
    return out;
  }, [rows, inUseOnly, q]);
  const shown = rows.filter((row) => keep.has(row.rel) && (!filtering || ((!inUseOnly || row.in_use) && (!q || row.rel.toLowerCase().includes(q) || row.canonical.some((c) => c.toLowerCase().includes(q)))))).length;
  const used = rows.filter((row) => row.in_use).length;
  const aliases = rows.filter((row) => row.alias_of).length;
  return <section className="dp-card card-shell" aria-labelledby="dp-tree">
    <header className="dp-head"><h3 id="dp-tree"><Folder size={16} strokeWidth={1.8} /> Real folders</h3><small>~/Documents · {rows.length} folders · {used} in use · {aliases} aliases</small></header>
    <div className="dp-tree-tools">
      <label className="dp-tree-search"><span className="sr-only">Search folders</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search path or canonical name" aria-label="Search folders" /></label>
      <label className="dp-tree-toggle"><input type="checkbox" checked={inUseOnly} onChange={(event) => setInUseOnly(event.target.checked)} /> In use only</label>
      <small className="dp-note" role="status">{filtering ? `${shown} matching` : `${rows.length} shown`}</small>
    </div>
    {roots.some((node) => keep.has(node.rel)) ? <ul className="dp-tree-list dp-tree-root" aria-label="Folders under Documents">
      {roots.filter((node) => keep.has(node.rel)).map((node) => <Row key={node.rel} node={node} forceOpen={filtering} open={open} onToggle={(rel, value) => setOpen((current) => ({ ...current, [rel]: value }))} keep={keep} />)}
    </ul> : <StateNote kind="empty">{rows.length ? 'No folder matches.' : 'The registry has no directory list yet.'}</StateNote>}
  </section>;
}
