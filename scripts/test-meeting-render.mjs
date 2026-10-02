// Meeting Room result summary, rendering layer (owner 2026-10-01). meeting.mjs's summarize() is
// unit-tested in tests/meeting-summary.test.mjs, but a prior round shipped a summarize() that
// worked perfectly while src/MeetingRoom.tsx still printed the raw meeting.topic in the collapsed
// row heading — the owner's actual complaint (a long raw topic, not the computed theme, still
// showing) never had a regression seam. This script closes that gap: it renders the real
// MeetingRoom component in a real browser against a mocked /api/meetings response and asserts on
// the rendered DOM, not on summarize()'s return value. Needs Google Chrome; playwright-core is a
// devDependency. Run: node scripts/test-meeting-render.mjs
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { summarize } from '../meeting.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

// Not a Kanban-card topic, so extractTheme() falls back to "first sentence, clipped to 80
// chars" — a topic long enough that the clip actually bites, with a tail that only appears if
// the raw topic (not the theme) is what's rendered.
const LONG_TOPIC = 'Mr.INVを最初の10社に売るにはどうすればいいか、営業導線とオンボーディングと価格の3点から各チームの考えを聞かせてほしい。補足：既存の無料トライアル導線のCVRが低いという報告が先週あった、この数字も踏まえて議論してほしい。';
const CLOSING = '- ✅ 決定：方針Aで進めます。\n\n- 🛠️ 次の行動\n  - AppProが今すぐ着手します。';
const summary = summarize({ topic: LONG_TOPIC, status: 'done', lines: [{ kind: 'say', who: 'Bigkiji', text: CLOSING }] });
assert.ok(summary.theme.length < LONG_TOPIC.length, 'fixture must mirror real summarize() output: theme shorter than the raw topic');

const DONE_MEETING = {
  id: 'm_render1', topic: LONG_TOPIC, members: ['MiMo'], status: 'done',
  startedAt: Date.now() / 1000 - 600, endedAt: Date.now() / 1000, speaking: null,
  lines: [
    { kind: 'say', who: 'Bigkiji', text: 'Opening remarks.', at: 0 },
    { kind: 'say', who: 'MiMo', text: 'My idea.', at: 1 },
    { kind: 'say', who: 'Bigkiji', text: CLOSING, at: 2 },
  ],
  summary,
};
const ATTENDEES = { Bigkiji: { persona: 'Bigkiji', group: 'Host', member: false }, MiMo: { persona: 'Linus Torvalds', group: 'AppPro', member: true } };

const server = await createServer({ root, configFile: false, plugins: [react()], logLevel: 'error', server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}/scripts/meeting-harness/index.html`;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
let failed = false;
const check = async (name, fn) => {
  try { await fn(); console.log(`ok   ${name}`); } catch (error) { failed = true; console.log(`FAIL ${name}\n     ${error.message.split('\n').slice(0, 6).join(' | ')}`); }
};

try {
  const page = await browser.newPage();
  await page.route('**/api/meetings', async (route) => {
    await route.fulfill({ json: { meetings: [DONE_MEETING], attendees: ATTENDEES } });
  });
  await page.goto(base);
  await page.waitForSelector('.meeting-row');

  await check('finished meeting row heading shows the computed theme, not the raw topic', async () => {
    const heading = await page.locator('.meeting-main b').innerText();
    assert.equal(heading, summary.theme, 'heading must equal summary.theme');
    assert.notEqual(heading, LONG_TOPIC, 'heading must not be the raw topic');
    assert.doesNotMatch(heading, /補足：既存の無料トライアル導線/, 'the part of the topic past the first sentence must not leak into the heading');
  });

  await check('the single meeting is open by default, surfacing the full raw topic', async () => {
    await page.waitForSelector('.meeting-full-topic');
    const fullTopic = await page.locator('.meeting-full-topic').innerText();
    assert.match(fullTopic, /補足：既存の無料トライアル導線のCVRが低いという報告が先週あった/, 'the part of the topic past the theme must be reachable while expanded');
  });

  await check('collapsing the row hides the full-topic block again', async () => {
    await page.click('.meeting-row');
    await page.locator('.meeting-full-topic').waitFor({ state: 'detached' });
  });
} finally {
  await browser.close();
  await server.close();
}

if (failed) { console.log('\nFAILED'); process.exit(1); }
console.log('\nOK');
