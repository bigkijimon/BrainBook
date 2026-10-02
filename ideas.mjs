// Idea tree storage: every idea is a plain Obsidian note in Vault/ideas, and every connection is a
// [[wikilink]] under "## Links", so the tree also shows up in Obsidian's own graph view.
// A branch (child) records its parent in frontmatter (`parent: "[[idea-…]]"`) and links back to it.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const MAX_ITEMS = 60;
const MAX_TEXT = 2000;

const newId = () => `idea-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
const yamlString = (value) => JSON.stringify(String(value));
const firstLine = (text) => text.split(/\r?\n/)[0].trim();
const titleOf = (text) => {
  const line = firstLine(text).replace(/^#+\s*/, '');
  return line.length > 90 ? `${line.slice(0, 88).trimEnd()}…` : line;
};

export const createIdeaStore = ({ vaultPath, ideasPath, projectsPath }) => {
  const inside = (directory, absolute) => absolute.startsWith(`${path.resolve(directory)}${path.sep}`);
  const resolveNote = (relative) => {
    const absolute = path.resolve(vaultPath, String(relative || ''));
    if (!absolute.endsWith('.md')) return null;
    if (inside(ideasPath, absolute)) return { absolute, relative: path.relative(vaultPath, absolute), kind: 'idea' };
    if (inside(projectsPath, absolute)) return { absolute, relative: path.relative(vaultPath, absolute), kind: 'project' };
    return null;
  };
  const linkName = (relative) => path.basename(relative, '.md');

  const addLinkLine = async (absolute, targetRelative) => {
    const text = await fs.readFile(absolute, 'utf8');
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const link = `[[${linkName(targetRelative)}]]`;
    if (text.includes(link)) return false;
    const lines = text.split(/\r?\n/);
    const heading = lines.findIndex((line) => /^##\s+links\s*$/i.test(line.trim()));
    if (heading === -1) {
      const body = text.replace(/\s+$/, '');
      await fs.writeFile(absolute, `${body}${eol}${eol}## Links${eol}${eol}- ${link}${eol}`, 'utf8');
      return true;
    }
    let insertAt = heading + 1;
    while (insertAt < lines.length && !/^#{1,6}\s/.test(lines[insertAt])) insertAt += 1;
    while (insertAt > heading + 1 && !lines[insertAt - 1].trim()) insertAt -= 1;
    lines.splice(insertAt, 0, `- ${link}`);
    if (insertAt === heading + 1) lines.splice(insertAt, 0, '');
    await fs.writeFile(absolute, lines.join(eol), 'utf8');
    return true;
  };

  // items: [{ text, parentIndex? }] — parentIndex points at an earlier item in the same dump.
  // parent: optional vault path every top-level item branches from.
  const create = async ({ items, parent, area }) => {
    if (!Array.isArray(items) || items.length === 0) throw Object.assign(new Error('Nothing to add'), { status: 400 });
    if (items.length > MAX_ITEMS) throw Object.assign(new Error(`At most ${MAX_ITEMS} ideas at once`), { status: 400 });
    const parentNote = parent ? resolveNote(parent) : null;
    if (parent && !parentNote) throw Object.assign(new Error('Parent is not a vault note'), { status: 400 });
    await fs.mkdir(ideasPath, { recursive: true });
    const created = [];
    for (const [index, item] of items.entries()) {
      const text = String(item?.text || '').trim().slice(0, MAX_TEXT);
      if (!text) { created.push(null); continue; }
      const parentIndex = Number.isInteger(item.parentIndex) && item.parentIndex >= 0 && item.parentIndex < index ? item.parentIndex : null;
      const parentRelative = parentIndex !== null ? created[parentIndex]?.path : parentNote?.relative;
      const id = newId();
      const relative = path.relative(vaultPath, path.join(ideasPath, `${id}.md`));
      const stamp = new Date().toISOString();
      const title = titleOf(text);
      const rest = text.split(/\r?\n/).slice(1).join('\n').trim();
      const lines = [
        '---',
        `id: ${yamlString(id)}`,
        'status: "seed"',
        'source: "brainbook"',
        'privacy: local-draft',
        ...(area ? [`area: ${yamlString(area)}`] : []),
        ...(parentRelative ? [`parent: ${yamlString(`[[${linkName(parentRelative)}]]`)}`] : []),
        `created_at: ${yamlString(stamp)}`,
        `updated_at: ${yamlString(stamp)}`,
        '---',
        '',
        `# ${title}`,
        '',
        '## Summary',
        '',
        rest || (title !== firstLine(text) ? firstLine(text) : title),
        '',
        ...(parentRelative ? ['## Links', '', `- [[${linkName(parentRelative)}]]`, ''] : []),
      ];
      await fs.writeFile(path.join(vaultPath, relative), lines.join('\n'), { encoding: 'utf8', flag: 'wx' });
      created.push({ path: relative, title, parent: parentRelative || null });
    }
    return created.filter(Boolean);
  };

  // Connect two notes. The link is written into an idea note (project notes are never edited here).
  const link = async ({ from, to }) => {
    const a = resolveNote(from);
    const b = resolveNote(to);
    if (!a || !b) throw Object.assign(new Error('Both ends must be vault notes'), { status: 400 });
    if (a.relative === b.relative) throw Object.assign(new Error('Cannot link a note to itself'), { status: 400 });
    const [writer, target] = a.kind === 'idea' ? [a, b] : b.kind === 'idea' ? [b, a] : [null, null];
    if (!writer) throw Object.assign(new Error('Link two projects in Obsidian itself'), { status: 400 });
    await fs.access(target.absolute);
    const added = await addLinkLine(writer.absolute, target.relative);
    return { from: writer.relative, to: target.relative, added };
  };

  // Mark an idea finished (or reopen it). Only idea notes are edited; the status lives in frontmatter
  // so Obsidian, Dataview and BrainBook all agree, and XP can always be recomputed from the vault.
  const setDone = async ({ path: notePath, done }) => {
    const note = resolveNote(notePath);
    if (!note || note.kind !== 'idea') throw Object.assign(new Error('Only idea notes can be completed here'), { status: 400 });
    const text = await fs.readFile(note.absolute, 'utf8');
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    let lines = text.split(/\r?\n/);
    if (lines[0] !== '---') lines = ['---', '---', ...lines];
    let end = lines.indexOf('---', 1);
    const setKey = (key, value) => {
      const at = lines.slice(1, end).findIndex((line) => new RegExp(`^${key}:`).test(line));
      if (value === null) { if (at >= 0) { lines.splice(at + 1, 1); end -= 1; } return; }
      if (at >= 0) lines[at + 1] = `${key}: ${value}`; else { lines.splice(end, 0, `${key}: ${value}`); end += 1; }
    };
    const stamp = new Date().toISOString();
    setKey('status', done ? '"done"' : '"active"');
    setKey('completed_at', done ? yamlString(stamp) : null);
    setKey('updated_at', yamlString(stamp));
    await fs.writeFile(note.absolute, lines.join(eol), 'utf8');
    return { path: note.relative, done: Boolean(done), completedAt: done ? stamp : null };
  };

  // Save where work stopped: appends "- <time> — <did> → next: <next>" under "## Progress",
  // sets status active (unless done) and next_step, so anyone can resume from the note alone.
  const logStep = async ({ path: notePath, did, next }) => {
    const note = resolveNote(notePath);
    if (!note || note.kind !== 'idea') throw Object.assign(new Error('Only idea notes can log progress here'), { status: 400 });
    const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 400);
    const didText = clean(did); const nextText = clean(next);
    if (!didText && !nextText) throw Object.assign(new Error('Write what was done or what comes next'), { status: 400 });
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const entry = `- ${stamp} — ${didText || 'Planned'}${nextText ? ` → next: ${nextText}` : ''}`;
    const text = await fs.readFile(note.absolute, 'utf8');
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    let lines = text.split(/\r?\n/);
    if (lines[0] !== '---') lines = ['---', '---', ...lines];
    let end = lines.indexOf('---', 1);
    const setKey = (key, value) => {
      const at = lines.slice(1, end).findIndex((line) => new RegExp(`^${key}:`).test(line));
      if (at >= 0) lines[at + 1] = `${key}: ${value}`; else { lines.splice(end, 0, `${key}: ${value}`); end += 1; }
    };
    const status = lines.slice(1, end).find((line) => /^status:/.test(line)) || '';
    if (!/done|completed|shipped/i.test(status)) setKey('status', '"active"');
    setKey('next_step', nextText ? yamlString(nextText) : '""');
    setKey('updated_at', yamlString(now.toISOString()));
    const heading = lines.findIndex((line) => /^##\s+progress\s*$/i.test(line.trim()));
    if (heading === -1) {
      while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
      lines.push('', '## Progress', '', entry, '');
    } else {
      let at = heading + 1;
      while (at < lines.length && !/^#{1,6}\s/.test(lines[at])) at += 1;
      while (at > heading + 1 && !lines[at - 1].trim()) at -= 1;
      lines.splice(at, 0, ...(at === heading + 1 ? ['', entry] : [entry]));
    }
    await fs.writeFile(note.absolute, lines.join(eol), 'utf8');
    return { path: note.relative, entry: entry.slice(2), next: nextText || null };
  };

  return { create, link, resolveNote, setDone, logStep };
};
