// Streams = the shelves ideas and tasks are sorted into (e.g. "Work", "Side project").
// Everyone gets a small general set; a user can replace it with their own in
// <data folder>/streams.json, so personal business names never ship inside the app.
//
// streams.json: { "streams": [ { "id": "shop", "label": "My shop", "color": "#ff7a45",
//   "patterns": ["shop", "inventory"], "ideaPatterns": ["pop-up"], "worker": "hermes",
//   "planStep": "Check the shop's stock sheet first." } ] }
// patterns/ideaPatterns are case-insensitive regular expressions (strings).
import fs from 'node:fs/promises';
import path from 'node:path';

export const DEFAULT_STREAMS = [
  { id: 'ai-systems', label: 'AI / Agents', color: '#2be8d9', patterns: ['hermes', '\\bai\\b', 'agent', 'エージェント', 'automation', 'llm', 'prompt', 'mcp', 'codex', 'claude'] },
  { id: 'code', label: 'Code / Apps', color: '#7b9bff', patterns: ['\\bapp\\b', 'website', '\\bsite\\b', 'code', 'bug', 'api', 'github', 'deploy', 'readme', 'アプリ'] },
  { id: 'game', label: 'Game / 3D', color: '#6fc7f0', patterns: ['game', 'ゲーム', 'three\\.js', '\\b3d\\b', 'unity', 'godot', 'blender'] },
  { id: 'content', label: 'Content', color: '#ff7a45', patterns: ['blog', 'ブログ', 'video', '動画', 'youtube', 'podcast', 'article', '記事', 'instagram', 'tiktok', 'newsletter'] },
  { id: 'business', label: 'Business', color: '#ffc44d', patterns: ['client', 'customer', 'sales', 'marketing', 'invoice', 'pricing', 'business', 'startup', '顧客', '売上'] },
  { id: 'study', label: 'Study', color: '#48f0c8', patterns: ['learn', 'study', 'course', 'english', 'spanish', 'language', 'exam', '勉強', '英語'] },
];
const FALLBACK = { id: 'private', label: 'Other', color: '#b69bc4' };

const compile = (list) => (Array.isArray(list) ? list : []).flatMap((source) => {
  try { return [new RegExp(String(source), 'i')]; } catch { return []; }
});

export const loadStreams = async (appHome) => {
  const file = path.join(appHome, 'streams.json');
  const custom = await fs.readFile(file, 'utf8').then(JSON.parse).catch(() => null);
  const raw = Array.isArray(custom?.streams) && custom.streams.length ? custom.streams : DEFAULT_STREAMS;
  const streams = raw
    .filter((entry) => entry && typeof entry.id === 'string' && entry.id !== FALLBACK.id)
    .map((entry) => ({
      id: entry.id.slice(0, 40),
      label: String(entry.label || entry.id).slice(0, 40),
      color: /^#[0-9a-f]{6}$/i.test(entry.color || '') ? entry.color : '#ff4fa3',
      worker: typeof entry.worker === 'string' ? entry.worker : 'hermes',
      planStep: typeof entry.planStep === 'string' ? entry.planStep : '',
      priority: entry.priority === 'high' ? 'high' : null,
      patterns: compile(entry.patterns),
      ideaPatterns: compile(entry.ideaPatterns),
    }));
  return { streams, fallback: FALLBACK, custom: Boolean(custom?.streams?.length) };
};

// Public shape for the UI (no regular expressions).
export const describeStreams = ({ streams, fallback }) => [...streams, fallback].map(({ id, label, color }) => ({ id, label, color }));
