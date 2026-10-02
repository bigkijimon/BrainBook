// Recomputes every figure in the "公開するアプリと安全なデータ範囲" section of the web-app goal note from the
// EikenPrep data files, and fails if the note disagrees or misses a file that links to eiken.or.jp.
// Read-only: it never writes to the note or the app. Run: node scripts/check-app-data-scope.mjs [note] [appDir]
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const NOTE = process.argv[2] || '/Users/yuma/Documents/ObsidianVault/Vault/Projects/Goals/2026-09-30-役に立つwebアプリを1つ公開して-使われ方を測る.md';
const APP = process.argv[3] || '/Users/yuma/Documents/SystemAPPS/EikenPrep';
const SECTION = '### 2026-10-01 公開するアプリと安全なデータ範囲';
const RUNTIME = ['index.html', 'js', 'css', 'data']; // what the browser loads; docs, tools, build output are not shipped

const full = readFileSync(NOTE, 'utf8');
const start = full.indexOf(SECTION);
assert.ok(start >= 0, `section not found: ${SECTION}`);
const next = full.indexOf('\n### ', start + SECTION.length);
const note = full.slice(start, next < 0 ? undefined : next);

const json = (p) => JSON.parse(readFileSync(join(APP, p), 'utf8'));
const files = (p) => statSync(join(APP, p)).isDirectory() ? readdirSync(join(APP, p)).flatMap((f) => files(join(p, f))) : [p];
const occurrences = (p, re) => (readFileSync(join(APP, p), 'utf8').match(re) || []).length;

// Figures from the data.
const { words, idioms, counts } = json('data/vocab.json');
const idiomList = json('data/idioms.json').idioms;
const { vocab: audio, voices } = json('data/audio.json');
const firstIdiomBase = Math.min(...idioms.map((i) => Number(i.base.slice(0, 3))));
const clips = Object.keys(audio).map((k) => {
  const m = k.match(/^(\d{3})-.+-([wmx])$/);
  assert.ok(m, `unexpected audio key: ${k}`);
  return { base: Number(m[1]), kind: m[2], word: Number(m[1]) < firstIdiomBase };
});
const clipCount = (word, kinds) => clips.filter((c) => c.word === word && kinds.includes(c.kind)).length;
const wordWM = clipCount(true, 'wm');
const idiomWMX = clipCount(false, 'wmx');
const wordX = clipCount(true, 'x');
const EIKEN = /eiken\.or\.jp/g;
const linked = RUNTIME.flatMap(files).filter((p) => occurrences(p, EIKEN) > 0);
const examJson = files('data/exams').filter((p) => p.endsWith('.json'));

let checks = 0;
// Every capture group of `re` in the note must equal the matching value in `expected`.
const claim = (re, ...expected) => {
  const m = note.match(re);
  assert.ok(m, `note sentence not found: ${re}`);
  assert.deepEqual(m.slice(1).map(Number), expected, `note figure ${re}`);
  checks++;
};

assert.equal(counts.words, words.length, 'vocab.json counts.words');
assert.equal(counts.idioms, idioms.length, 'vocab.json counts.idioms');
claim(/`idioms\.json` の熟語 (\d+)件/, idiomList.length);
assert.deepEqual([...new Set(idiomList.flatMap(Object.keys))].sort(), ['eg', 'egJa', 'ja', 'level', 'note', 'pos', 'w'], 'idioms.json fields');
assert.ok(note.includes('全フィールド `w` `ja` `note` `eg` `egJa` `pos` `level`'), 'note lists the idioms.json fields');
claim(/`vocab\.json` の `words` (\d+)件/, words.length);
claim(/`vocab\.json` の `idioms` (\d+)件/, idioms.length);
claim(/(\d+)件すべてで `w` が一致/, idioms.filter((x, i) => x.w === idiomList[i]?.w).length);
claim(/`ex`＝`eg` が (\d+)\/(\d+)/, idioms.filter((x, i) => x.ex === idiomList[i]?.eg).length, idiomList.length);
claim(/`src` は (\d+)件とも空/, idioms.filter((x) => (x.src ?? '').length === 0).length);
claim(/音声 `assets\/audio\/vocab\/` (\d+)件のうち (\d+)件/, files('assets/audio/vocab').length, wordWM + idiomWMX);
assert.equal(clips.length, files('assets/audio/vocab').length, 'audio.json lists every audio file');
claim(/単語（base 000–(\d+)）の `-w` (\d+)・`-m` (\d+)/, firstIdiomBase - 1, clipCount(true, 'w'), clipCount(true, 'm'));
claim(/熟語（base (\d+)–(\d+)）の `-w` (\d+)・`-m` (\d+)・`-x` (\d+)/,
  firstIdiomBase, Math.max(...clips.map((c) => c.base)), clipCount(false, 'w'), clipCount(false, 'm'), clipCount(false, 'x'));
claim(/`ex` は過去問 Part 1 の問題文そのもの（(\d+)件すべてに入っている）/, words.filter((w) => (w.ex ?? '').trim()).length);
claim(/単語（base 000–(\d+)）の `-x` 音声 (\d+)件/, firstIdiomBase - 1, wordX);
claim(/合計 (\d+)件＝単語 `-w`\/`-m` (\d+)＋熟語 `-w`\/`-m`\/`-x` (\d+)/, wordWM + idiomWMX, wordWM, idiomWMX);
for (const v of [voices.en, voices.enEngine, voices.jaEngine.split(' ')[0], voices.ja.split(' ')[0]]) {
  assert.ok(note.includes(v), `note names the voice/engine ${v}`);
  checks++;
}
claim(/`sample-\*\.png` (\d+)件/, files('assets/speaking').length);
claim(/`exams\.js` に(\d+)件、`exams\/\*\.json` に計(\d+)件/,
  occurrences('data/exams.js', EIKEN), examJson.reduce((n, p) => n + occurrences(p, EIKEN), 0));
// Every runtime file that mentions eiken.or.jp must be named in the note's excluded-links row, so none can
// ship unnoticed. Only that row counts: index.html and js/ files are also named in the allow list.
const linkRow = note.split('\n').find((l) => l.startsWith('| `media.eiken.or.jp`'));
assert.ok(linkRow, 'note has no excluded-links row starting with | `media.eiken.or.jp`');
for (const p of linked) {
  const name = p.startsWith('data/exams/') ? 'exams/*.json' : p.split('/').pop();
  assert.ok(linkRow.includes(name), `runtime file links to eiken.or.jp but the excluded-links row does not name it: ${p}`);
  checks++;
}
console.log(`PASS ${checks} figure checks in ${NOTE} against ${APP} (audio allowed ${wordWM + idiomWMX} / excluded ${wordX} / total ${clips.length}; eiken.or.jp in ${linked.length} runtime files)`);
