// Life areas: Finance, Learning, Mental health, Work, Play.
// Every idea, project note, reminder and task gets exactly one area.
// Order of precedence: manual override (saved by BrainBook) > `area:` in the note's frontmatter >
// keyword rules on the title > keyword rules on the summary > the item's work domain > Work.
import fs from 'node:fs/promises';
import path from 'node:path';

export const AREAS = [
  { id: 'finance', label: 'Finance' },
  { id: 'learning', label: 'Learning' },
  { id: 'mental-health', label: 'Mental health' },
  { id: 'work', label: 'Work' },
  { id: 'play', label: 'Play' },
];
export const AREA_IDS = new Set(AREAS.map((area) => area.id));

const ALIASES = {
  finance: 'finance', financial: 'finance', money: 'finance', 'ファイナンシャル': 'finance', 'お金': 'finance', '金融': 'finance',
  learning: 'learning', study: 'learning', '学習': 'learning', '勉強': 'learning',
  'mental-health': 'mental-health', mental: 'mental-health', 'mental health': 'mental-health', health: 'mental-health', wellbeing: 'mental-health', 'メンタルヘルス': 'mental-health', 'メンタル': 'mental-health',
  work: 'work', job: 'work', '仕事': 'work',
  play: 'play', fun: 'play', hobby: 'play', '遊び': 'play', '趣味': 'play',
};
export const normalizeArea = (value) => ALIASES[String(value || '').trim().toLowerCase()] || null;

// Checked in this order; the first area with a matching keyword wins.
// Business study material (textbooks for students) stays Work; Learning is the owner's own study.
const RULES = [
  { area: 'finance', pattern: /accounting|invoice|\bbudget|\bfinanc|\btax(es)?\b|revenue|expenses?\b|salary|\binvest(ment|ing|or)?s?\b|savings|経理|会計|請求書|税金|確定申告|収支|家計|予算|投資|貯金|お金|資金|給与/i },
  { area: 'mental-health', pattern: /mental health|wellbeing|well-being|\bstress|anxiety|meditat|mindful|\bsleep\b|\brest\b|burn ?out|therapy|journaling|\bmood\b|exercise|workout|メンタル|ストレス|睡眠|休息|休養|瞑想|気分|健康|運動|散歩|日記|不安|リラックス/i },
  { area: 'play', pattern: /\bgames?\b|gaming|shooter|three\.js|\bvr\b|playable|hobby|\bcamping\b|garden|fireplace|\bdiy\b|pok[eé]mon|orchestra|ゲーム|游戏|遊び|趣味|旅行|キャンプ|庭|暖炉|釣り/i },
  { area: 'learning', pattern: /\beiken\b|\bstudy\b|self-study|\blearn(ing)?\b|understanding|\bcourse\b|tutorial|\bexam\b|英検|勉強|学習|独学|資格|試験対策|読書/i },
];
const DOMAIN_AREA = { accounting: 'finance', game: 'play' };

export const classifyArea = ({ title = '', summary = '', domain = null }) => {
  for (const text of [title, summary]) {
    const rule = text && RULES.find((entry) => entry.pattern.test(text));
    if (rule) return rule.area;
  }
  return DOMAIN_AREA[domain] || 'work';
};

// Manual choices are stored in BrainBook's own data folder, never written into Obsidian notes.
export const createAreaOverrides = async ({ stateDir }) => {
  const file = path.join(stateDir, 'areas.json');
  let overrides = {};
  try { overrides = JSON.parse(await fs.readFile(file, 'utf8')); } catch { /* none yet */ }
  return {
    get: (key) => (AREA_IDS.has(overrides[key]) ? overrides[key] : null),
    async set(key, area) {
      if (area === null) delete overrides[key];
      else if (AREA_IDS.has(area)) overrides[key] = area;
      else throw new Error('Unknown area');
      await fs.mkdir(stateDir, { recursive: true });
      const temp = `${file}.${process.pid}.tmp`;
      await fs.writeFile(temp, `${JSON.stringify(overrides, null, 2)}\n`);
      await fs.rename(temp, file);
    },
  };
};

// Idea vs task. An idea note is open-ended ("what if…"); a task-like note already names concrete
// work (a fix, a check, a setting). Owner overrides always win and live next to areas.json.
const TASK_WORDS = /(hotfix|\bfix(es|ed)?\b|\bbug\b|repair|debug|\breset\b|\bupdate\b|initiation|\bsetup\b|\bconfigure\b|修正|バグ|不具合|監視|追記|設定|確認|依頼|更新|対応|復旧|調査|開始|実装|追加タスク|タスク|失敗|障害)/i;
export const classifyNoteKind = (title = '') => (TASK_WORDS.test(title) ? 'task' : 'idea');
export const createKindOverrides = async ({ stateDir }) => {
  const file = path.join(stateDir, 'note-kinds.json');
  let overrides = {};
  try { overrides = JSON.parse(await fs.readFile(file, 'utf8')); } catch { /* none yet */ }
  return {
    get: (key) => (overrides[key] === 'idea' || overrides[key] === 'task' ? overrides[key] : null),
    async set(key, kind) {
      if (kind === null) delete overrides[key];
      else if (kind === 'idea' || kind === 'task') overrides[key] = kind;
      else throw new Error('Unknown kind');
      await fs.mkdir(stateDir, { recursive: true });
      const temp = `${file}.${process.pid}.tmp`;
      await fs.writeFile(temp, `${JSON.stringify(overrides, null, 2)}\n`);
      await fs.rename(temp, file);
    },
  };
};
