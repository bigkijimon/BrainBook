// The "brain": every Obsidian idea/project note as a node, plus the real links between them.
//
// Link sources, strongest first (each link says where it came from; nothing is invented):
//   wikilink  — an Obsidian [[link]] from one note to another.
//   graphify  — Graphify's knowledge graph (graphify-out/graph.json) connects the two notes.
//   related   — the notes share distinctive words (computed here; weaker, shown fainter).
// Graphify also contributes, per note, how many concepts it extracted and their main labels.
import fs from 'node:fs/promises';
import path from 'node:path';

const WIKILINK = /\[\[([^\]|#^]+)(?:[#^][^\]|]*)?(?:\|[^\]]*)?\]\]/g;
const STOP = new Set('the a an and or of to in on for with from by at is are be this that it as into via use using make new app task tasks idea ideas note notes work about what which should will can how want please check confirm update fix file files readme summary local conversation'.split(' '));
const GENERIC_CONCEPTS = /^(summary|ideas?|open questions|requirements|todo|next steps?|notes?|overview|background|context|details|status|tasks?|decisions?|references?|links?|questions?)$/i;

// Words for similarity: Latin words (3+ letters), katakana words (3+), kanji words (2+).
// Common verbs/filler (修正, 追加, 確認 …) are dropped so only real subjects link notes.
const JA_STOP = new Set('修正 追加 確認 作成 対応 実装 表示 画面 問題 生成 既存 更新 変更 設定 準備 開始 相談 依頼 提案 分析 検討 整理 移行 構築 再構築 改善 調整 状況 作業 管理 情報 機能 必要 内容 方法 対象 現在 全体 今回 自動 手動 保存 考察 指示 実行 計画 完了 報告 仕上 提出 要請 提供 データ ファイル ツール システム アプリ ページ ボタン ロジック フォーマット'.split(' '));
const terms = (text) => {
  const out = new Set();
  const lower = text.toLowerCase();
  for (const word of lower.match(/[a-z][a-z0-9&+.-]{2,}/g) || []) if (!STOP.has(word)) out.add(word.replace(/[.-]+$/, ''));
  for (const word of text.match(/[\u30a0-\u30ffー]{3,}|[\u3400-\u9fff]{2,}/g) || []) if (!JA_STOP.has(word)) out.add(word);
  return out;
};

const readGraphify = async (vaultPath) => {
  const file = path.join(vaultPath, 'graphify-out', 'graph.json');
  try {
    const [raw, stat] = await Promise.all([fs.readFile(file, 'utf8'), fs.stat(file)]);
    const graph = JSON.parse(raw);
    return { graph, builtAt: stat.mtime.toISOString() };
  } catch {
    return null;
  }
};

let graphifyCache = { key: '', value: null };

export const buildBrain = async ({ vaultPath, notes, readText }) => {
  const byPath = new Map(notes.map((note) => [note.path, note]));
  const byName = new Map();
  for (const note of notes) {
    byName.set(path.basename(note.path, '.md').toLowerCase(), note.path);
    byName.set(note.path.replace(/\.md$/, '').toLowerCase(), note.path);
    byName.set(note.title.toLowerCase(), note.path);
  }
  const links = new Map();
  const addLink = (a, b, kind, weight) => {
    if (!a || !b || a === b) return;
    const key = a < b ? `${a}\n${b}` : `${b}\n${a}`;
    const existing = links.get(key);
    const rank = { branch: 4, wikilink: 3, graphify: 2, related: 1 };
    // Branches keep their direction (parent → child); other links are undirected.
    if (!existing || rank[kind] > rank[existing.kind]) links.set(key, kind === 'branch' ? { source: a, target: b, kind, weight } : { source: a < b ? a : b, target: a < b ? b : a, kind, weight });
  };

  // 1) Obsidian wikilinks
  const texts = new Map();
  for (const note of notes) {
    const text = await readText(note.path).catch(() => '');
    texts.set(note.path, text);
    // Tree branches: `parent: "[[…]]"` in frontmatter.
    const parent = text.match(/^---[\s\S]*?^parent:\s*["']?\[\[([^\]|#]+)/m);
    if (parent) addLink(byName.get(parent[1].trim().toLowerCase()), note.path, 'branch', 1);
    for (const match of text.matchAll(WIKILINK)) {
      const target = byName.get(match[1].trim().toLowerCase()) || byName.get(path.basename(match[1].trim()).toLowerCase());
      addLink(note.path, target, 'wikilink', 1);
    }
  }

  // 2) Graphify: per-note concepts + cross-note edges
  const graphifyInfo = await readGraphify(vaultPath);
  const concepts = new Map();
  let graphify = { available: false, builtAt: null, notesCovered: 0, noteLinks: 0 };
  if (graphifyInfo) {
    const { graph, builtAt } = graphifyInfo;
    const cacheKey = `${builtAt}:${notes.length}`;
    if (graphifyCache.key !== cacheKey) {
      const nodeFile = new Map();
      for (const node of graph.nodes || []) {
        const file = node.source_file || '';
        nodeFile.set(node.id, file);
        if (!byPath.has(file)) continue;
        const entry = concepts.get(file) || { count: 0, labels: [] };
        entry.count += 1;
        const label = String(node.label || '').replace(/^#+\s*/, '').trim();
        if (label && !GENERIC_CONCEPTS.test(label) && label.length <= 60 && entry.labels.length < 6 && !label.endsWith('.md')) entry.labels.push(label);
        concepts.set(file, entry);
      }
      const noteEdges = [];
      for (const link of graph.links || graph.edges || []) {
        const a = nodeFile.get(link.source);
        const b = nodeFile.get(link.target);
        if (a && b && a !== b && byPath.has(a) && byPath.has(b)) noteEdges.push([a, b, Number(link.weight) || 1]);
      }
      graphifyCache = { key: cacheKey, value: { concepts, noteEdges, builtAt } };
    }
    const cached = graphifyCache.value;
    for (const [a, b, weight] of cached.noteEdges) addLink(a, b, 'graphify', Math.min(1, weight));
    graphify = { available: true, builtAt: cached.builtAt, notesCovered: cached.concepts.size, noteLinks: cached.noteEdges.length };
    for (const [file, entry] of cached.concepts) concepts.set(file, entry);
  }

  // 3) Related: shared distinctive words (TF-IDF style overlap), top 2 per note above a floor.
  const termSets = new Map(notes.map((note) => [note.path, terms(`${note.title} ${note.title} ${note.summary || ''} ${(concepts.get(note.path)?.labels || []).join(' ')}`)]));
  const df = new Map();
  for (const set of termSets.values()) for (const term of set) df.set(term, (df.get(term) || 0) + 1);
  const idf = (term) => Math.log((notes.length + 1) / ((df.get(term) || 0) + 1));
  for (const note of notes) {
    const mine = termSets.get(note.path);
    const scored = [];
    for (const other of notes) {
      if (other.path === note.path) continue;
      let score = 0;
      const shared = [];
      for (const term of mine) if (termSets.get(other.path).has(term) && (df.get(term) || 0) <= Math.max(3, notes.length * 0.12)) { score += idf(term); shared.push(term); }
      if (score >= 4.5 && shared.length >= 2) scored.push({ path: other.path, score });
    }
    scored.sort((a, b) => b.score - a.score).slice(0, 2).forEach((entry) => addLink(note.path, entry.path, 'related', Math.min(1, entry.score / 14)));
  }

  return {
    nodes: notes.map((note) => ({
      id: note.path,
      title: note.title,
      kind: note.kind,
      lifeArea: note.lifeArea || 'work',
      openCount: note.openCount || 0,
      status: note.status || null,
      completedAt: note.completedAt || null,
      stage: note.stage || (note.kind === 'project' ? 'project' : 'seed'),
      progress: note.progress || null,
      summary: note.summary || '',
      // Branch in the idea tree: the idea's shelf (AI / Agents, Study…) or the project's folder.
      group: note.kind === 'project' ? note.path.split('/')[1] || 'Projects' : note.domainLabel || 'Other',
      updatedAt: note.updatedAt || null,
      modifiedAt: note.modifiedAt || null,
      url: note.url,
      concepts: concepts.get(note.path)?.count || 0,
      conceptLabels: concepts.get(note.path)?.labels || [],
    })),
    links: [...links.values()],
    sources: {
      obsidian: { notes: notes.length },
      graphify,
      counts: [...links.values()].reduce((acc, link) => ({ ...acc, [link.kind]: (acc[link.kind] || 0) + 1 }), {}),
    },
  };
};
