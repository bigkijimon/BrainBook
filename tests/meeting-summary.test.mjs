// Meeting Room result summary (owner 2026-10-01): "話し合いが終わったら、なんのテーマでどんな
// 結果が出たかをまとめ表示して". summarize() turns Bigkiji's closing line (✅ 決定 / 🛠️ next
// actions / 💡 ideas, written by meeting.mjs's run()) into {theme, decision, actions, ideas}
// without inventing text. Fixtures below are copied verbatim from real stored meetings
// (mmup4thj3.json, mmupbku01.json) so the parser is checked against real model output, not
// a hand-written stand-in.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { summarize } from '../meeting.mjs';

// Real closing line from mmup4thj3.json: has all three sections.
const WELL_FORMED_TOPIC = 'Kanban t_5e5cb546 「Mr.INV: rebrand 見積君 and rebuild the UI for sale」 failed review twice. Decide how the team finishes it today without Yuma (owner rule: only money/publishing/credentials/production data need Yuma).';
const WELL_FORMED_CLOSING = `- ✅ 決定：今日は Linus 案で進めます。\`check_text.py\` に言語に関係なく使える検査関数を1つだけ足します。
  - 検査対象は、壊れたUTF-8（strict デコードの失敗）、U+FFFD、制御文字（タブ・改行・CR は除く）の3種類です。
  - 実行順は「破損検出 → 日本語フィルタ」に固定します。

- 🛠️ 次の行動（今すぐ開始）
  - 担当は AppPro（Linus）の1名です。t_5e5cb546 内の team-run 1回で終えます。
  - やることは3つです。①git 履歴から壊れる前の文字列を復元し、差分をカードに貼る。②関数を追加する。③回帰テストを1本足す。

- 💡 案の出どころ
  - 根本原因の特定は Linus。strict デコード、制御文字の検出は Grace。履歴からの復元は Steve。

- 欠席者はいません。Yuma に回す論点はありません。`;

test('a real well-formed closing line yields theme, decision and actions', () => {
  const meeting = {
    topic: WELL_FORMED_TOPIC,
    status: 'done',
    lines: [
      { kind: 'say', who: 'Bigkiji', text: 'Opening remarks, not the closing summary.' },
      { kind: 'say', who: 'MiMo', text: 'My idea.' },
      { kind: 'say', who: 'Bigkiji', text: WELL_FORMED_CLOSING },
    ],
  };
  const summary = summarize(meeting);
  assert.equal(summary.theme, 't_5e5cb546 「Mr.INV: rebrand 見積君 and rebuild the UI for sale」');
  assert.match(summary.decision, /Linus 案で進めます/);
  assert.doesNotMatch(summary.decision, /次の行動/, 'decision must stop before the 🛠️ header');
  assert.ok(!summary.decision.startsWith('✅'), 'the ✅ marker is structural, not content, and must not leak into the displayed text');
  assert.match(summary.actions, /AppPro（Linus）の1名/);
  assert.doesNotMatch(summary.actions, /案の出どころ/, 'actions must stop before the 💡 header');
  assert.ok(!summary.actions.startsWith('🛠️'), 'the 🛠️ marker is structural, not content, and must not leak into the displayed text');
  assert.equal(summary.rawFallback, false);
  assert.equal(summary.isError, false);
});

test('a closing line with no ✅/🛠️/💡 markers falls back to the raw line', () => {
  const malformedClosing = 'では以上です。今日の会議はこれで終わりにします。ありがとうございました。';
  const meeting = {
    topic: '雑談ミーティング',
    status: 'done',
    lines: [
      { kind: 'say', who: 'Bigkiji', text: 'Opening remarks.' },
      { kind: 'say', who: 'MiMo', text: 'My idea.' },
      { kind: 'say', who: 'Bigkiji', text: malformedClosing },
    ],
  };
  const summary = summarize(meeting);
  assert.equal(summary.rawFallback, true, 'no section markers means the whole line is the fallback');
  assert.equal(summary.decision, malformedClosing, 'must show the raw line verbatim, never invented text');
  assert.equal(summary.actions, '');
});

// Real shape from mmupbku01.json: status is "done" but Bigkiji's closing turn itself came back
// absent (its own agent failed), so the last Bigkiji *say* line is actually the opening, not a
// closing summary. The fix must not mistake the opening line for the closing one.
test('a meeting whose closing turn failed (absent) does not use the opening line as the decision', () => {
  const meeting = {
    topic: 'チームの定例ブレスト',
    status: 'done',
    lines: [
      { kind: 'say', who: 'Bigkiji', text: 'Open the meeting. Today we discuss X. ✅ this text has a checkmark too, to prove it is not mistaken for a real decision.' },
      { kind: 'absent', who: 'Steve', text: 'no answer in 150 s' },
      { kind: 'say', who: 'MiMo', text: 'My idea.' },
      { kind: 'absent', who: 'Bigkiji', text: 'no answer in 150 s' },
    ],
  };
  const summary = summarize(meeting);
  assert.equal(summary.rawFallback, true);
  assert.equal(summary.decision, 'no answer in 150 s');
  assert.doesNotMatch(summary.decision, /Open the meeting/, 'must not fall back to the opening say line');
});

test('a failed meeting shows its error as the result, not a decision', () => {
  const meeting = {
    topic: '失敗したミーティング',
    status: 'failed',
    error: 'A meeting is already running',
    lines: [{ kind: 'say', who: 'Bigkiji', text: 'Open the meeting.' }],
  };
  const summary = summarize(meeting);
  assert.equal(summary.isError, true);
  assert.equal(summary.decision, 'A meeting is already running');
});

test('theme falls back to the first sentence, capped at ~80 chars, when the topic is not a Kanban card', () => {
  const longTopic = 'Mr.INV（車の整備工場向け 見積・請求アプリ、25,000円買い切り）を最初の10社に売るには、各チームで何ができるか？ 補足の長い説明がここに続く。';
  const meeting = { topic: longTopic, status: 'done', lines: [{ kind: 'say', who: 'Bigkiji', text: '✅ 決定：やる。\n\n🛠️ 次の行動\n  - 今すぐやる。' }] };
  const summary = summarize(meeting);
  assert.ok(summary.theme.length <= 81, `theme should be capped around 80 chars, got ${summary.theme.length}`);
  assert.match(summary.theme, /^Mr\.INV/);
});
