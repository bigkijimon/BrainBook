// Experience and levels. Nothing is stored separately: XP is recomputed from the vault every time,
// so it can never drift, double count, or be lost when the app is reinstalled.
//
//   Finishing an idea (status: done)       100 XP
//   + each connected idea (branch / link)  +20 XP, up to +100   → rewards thinking in trees
//   + finishing a whole branch (the idea and every child done)  +50 XP
//
// Level n → n+1 needs 100 + 50 × (n − 1) XP  (Lv1→2: 100, Lv2→3: 150, Lv3→4: 200 …)
export const DONE = new Set(['done', 'completed', 'shipped']);
export const isDone = (status) => DONE.has(String(status || '').toLowerCase());

export const TITLES = [
  [1, 'Daydreamer'], [3, 'Sketcher'], [5, 'Builder'], [8, 'Architect'], [12, 'Inventor'], [17, 'Visionary'], [25, 'Legend of Vice City'],
];
export const titleFor = (level) => TITLES.filter(([min]) => level >= min).pop()[1];
export const needFor = (level) => 100 + 50 * (level - 1);

export const levelFor = (xp) => {
  let level = 1;
  let rest = xp;
  while (rest >= needFor(level)) { rest -= needFor(level); level += 1; }
  return { level, into: rest, need: needFor(level), title: titleFor(level) };
};

export const computeProgress = (brain) => {
  const byId = new Map(brain.nodes.map((node) => [node.id, node]));
  const degree = new Map();
  const children = new Map();
  for (const link of brain.links) {
    if (link.kind !== 'branch' && link.kind !== 'wikilink') continue;
    degree.set(link.source, (degree.get(link.source) || 0) + 1);
    degree.set(link.target, (degree.get(link.target) || 0) + 1);
    if (link.kind === 'branch') children.set(link.source, [...(children.get(link.source) || []), link.target]);
  }
  const done = brain.nodes.filter((node) => node.kind === 'idea' && isDone(node.status));
  const awards = done.map((node) => {
    const connections = degree.get(node.id) || 0;
    const kids = children.get(node.id) || [];
    const branchBonus = kids.length > 0 && kids.every((kid) => isDone(byId.get(kid)?.status)) ? 50 : 0;
    return { id: node.id, title: node.title, completedAt: node.completedAt || node.updatedAt || null, xp: 100 + Math.min(100, connections * 20) + branchBonus, connections, branchBonus };
  });
  const xp = awards.reduce((sum, award) => sum + award.xp, 0);
  const ideas = brain.nodes.filter((node) => node.kind === 'idea').length;
  return { xp, ...levelFor(xp), completed: done.length, ideas, recent: awards.sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt))).slice(0, 5) };
};
