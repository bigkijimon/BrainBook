// Voice input (Hermes3D goal, step 3) in a real browser. Run: node scripts/test-voice.mjs
// (add BRAINBOOK_EVIDENCE_DIR=evidence to also save a screenshot).
// A fake SpeechRecognition stands in for the microphone, and /api/tasks is mocked, so no audio is
// recorded and no Kanban card is created. Covers both mics: the Office "Tell Bigkiji" box and the
// team sheet's "Tell a member directly" box. Uses Google Chrome, or Playwright's Chromium without it.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

const root = fileURLToPath(new URL('..', import.meta.url));

const FAKE = `
  window.__voice = { instances: [] };
  class FakeRecognition {
    constructor() { window.__voice.instances.push(this); this.started = false; }
    start() { this.started = true; }
    stop() { this.started = false; this.onend && this.onend(); }
    abort() { this.started = false; this.onend && this.onend(); }
  }
  if (window.__onDevice) {
    FakeRecognition.prototype.processLocally = false;
    // A real engine answers after a moment; window.__slow widens that gap so a double-tap lands inside it.
    FakeRecognition.available = async ({ processLocally }) => { await new Promise((r) => setTimeout(r, window.__slow || 0)); return processLocally ? 'available' : 'unavailable'; };
  }
  // Chrome ships a real (unprefixed) engine; replace both names so no audio is ever captured.
  window.SpeechRecognition = window.__noEngine ? undefined : FakeRecognition;
  window.webkitSpeechRecognition = window.__noEngine ? undefined : FakeRecognition;
  window.__say = (text, isFinal) => window.__voice.instances.at(-1).onresult({ resultIndex: 0, results: [{ isFinal, 0: { transcript: text } }] });
  window.__fail = (error) => { const r = window.__voice.instances.at(-1); r.onerror({ error }); r.onend(); };
`;

const server = await createServer({ root, configFile: false, plugins: [react()], logLevel: 'error', server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}/scripts/voice-harness/index.html`;
// Any Chromium works (speech is faked). BRAINBOOK_TEST_CHROMIUM=/path/to/chrome picks one; otherwise
// Google Chrome, then Playwright's own build (`npx playwright-core install chromium-headless-shell`).
const launch = async () => {
  const executablePath = process.env.BRAINBOOK_TEST_CHROMIUM;
  const tries = executablePath ? [{ executablePath }] : [{ channel: 'chrome' }, {}];
  const reasons = [];
  for (const option of tries) {
    try {
      const browser = await chromium.launch({ ...option, headless: true });
      console.log(`note browser: ${option.executablePath || option.channel || 'Playwright Chromium'} ${browser.version()}`);
      return browser;
    } catch (error) { reasons.push(error.message.split('\n')[0]); }
  }
  throw new Error(`No browser for the voice test (${reasons.join('; ')}). Install Google Chrome, run \`npx playwright-core install chromium-headless-shell\`, or set BRAINBOOK_TEST_CHROMIUM.`);
};
const browser = await launch();
let failed = false;
const check = async (name, fn) => {
  try { await fn(); console.log(`ok   ${name}`); } catch (error) { failed = true; console.log(`FAIL ${name}\n     ${error.message.split('\n').slice(0, 6).join(' | ')}`); }
};
const open = async (before = '', part = '', viewport = { width: 1440, height: 900 }) => {
  const page = await browser.newPage({ viewport });
  const posts = [];
  await page.route('**/api/agents/instruct', async (route) => {
    posts.push({ url: '/api/agents/instruct', body: route.request().postDataJSON() });
    await route.fulfill({ json: { id: 't_direct1', status: 'ready' } });
  });
  await page.route('**/api/tasks', async (route) => {
    posts.push({ url: '/api/tasks', body: route.request().postDataJSON() });
    await route.fulfill({ status: 201, json: { task: { id: 'task_voice', title: posts.at(-1).body.title, kanban: null } } });
  });
  await page.route('**/api/tasks/*/run', async (route) => {
    posts.push({ url: new URL(route.request().url()).pathname });
    await route.fulfill({ json: { task: { id: 'task_voice', kanban: { board: 'owner', id: 't_voice1', status: 'ready', assignee: 'default', queuedAt: null, gpu: false } } } });
  });
  await page.addInitScript(`${before};${FAKE}`);
  await page.goto(part ? `${base}?part=${part}` : base);
  if (part === 'team') await page.click('.team-item');
  await page.waitForSelector('.voice-mic');
  return { page, posts };
};
// React renders speech events on its next task; retry an assertion briefly instead of racing it.
const settle = async (fn, ms = 2000) => {
  const end = Date.now() + ms;
  for (;;) { try { return await fn(); } catch (error) { if (Date.now() > end) throw error; await new Promise((r) => setTimeout(r, 50)); } }
};
const status = (page) => page.locator('.voice-row small').innerText();
const box = (page) => page.locator('textarea');

try {
  const { page, posts } = await open();
  await check('mic starts a ja-JP continuous recognition with live words', async () => {
    await page.click('.voice-mic');
    const rec = await page.evaluate(() => { const r = window.__voice.instances.at(-1); return { lang: r.lang, continuous: r.continuous, interim: r.interimResults, started: r.started }; });
    assert.deepEqual(rec, { lang: 'ja-JP', continuous: true, interim: true, started: true });
    await settle(async () => assert.equal(await page.getAttribute('.voice-mic', 'aria-pressed'), 'true'));
    await settle(async () => assert.match(await status(page), /Listening… via the browser’s speech service/));
  });
  await check('interim words show in the status line, not in the box', async () => {
    await page.evaluate(() => window.__say('ブログの下書きを', false));
    await settle(async () => assert.equal(await status(page), 'ブログの下書きを'));
    assert.equal(await box(page).inputValue(), '');
  });
  await check('final words land in the box; Japanese chunks join without a space', async () => {
    await page.evaluate(() => window.__say('ブログの下書きを作って', true));
    await page.evaluate(() => window.__say('明日までに', true));
    await settle(async () => assert.equal(await box(page).inputValue(), 'ブログの下書きを作って明日までに'));
  });
  await check('speech alone sends nothing', async () => assert.equal(posts.length, 0));
  await check('mic again stops listening', async () => {
    await page.click('.voice-mic');
    await settle(async () => assert.equal(await page.getAttribute('.voice-mic', 'aria-pressed'), 'false'));
  });
  await check('owner edits, then Send files a task and hands it to Hermes', async () => {
    await box(page).press('End');
    await box(page).type('お願い');
    // A plain run writes nothing into the repo; BRAINBOOK_EVIDENCE_DIR=evidence saves the screenshot.
    if (process.env.BRAINBOOK_EVIDENCE_DIR) {
      const dir = path.resolve(root, process.env.BRAINBOOK_EVIDENCE_DIR);
      mkdirSync(dir, { recursive: true });
      await page.screenshot({ path: path.join(dir, 'voice-input-2026-10-01.png') });
    }
    await page.click('.direct-send');
    await page.waitForSelector('.direct-state.is-sent');
    assert.equal(posts[0].body.title, 'ブログの下書きを作って明日までにお願い');
    assert.match(posts[0].body.description, /by voice in the BrainBook Office/);
    assert.equal(posts[1].url, '/api/tasks/task_voice/run');
    assert.match(await page.locator('.direct-state').innerText(), /Sent · card t_voice1 \(ready, Bigkiji\)/);
    assert.equal(await box(page).inputValue(), '');
  });
  await check('a refused microphone explains what to allow', async () => {
    await page.click('.voice-mic');
    await page.evaluate(() => window.__fail('not-allowed'));
    await settle(async () => assert.match(await status(page), /System Settings › Privacy & Security/));
    await settle(async () => assert.equal(await page.getAttribute('.voice-mic', 'aria-pressed'), 'false'));
  });
  await check('EN switch recognises en-US and joins with spaces', async () => {
    await page.click('.voice-lang button:has-text("EN")');
    await page.click('.voice-mic');
    assert.equal(await page.evaluate(() => window.__voice.instances.at(-1).lang), 'en-US');
    await page.evaluate(() => { window.__say('check the', true); window.__say('office', true); });
    await settle(async () => assert.equal(await box(page).inputValue(), 'check the office'));
    await page.click('.voice-mic');
  });
  await page.close();

  const local = await open('window.__onDevice = true');
  await check('on-device recognition is used when the engine offers it', async () => {
    await local.page.click('.voice-mic');
    await local.page.waitForFunction(() => window.__voice.instances.at(-1)?.started);
    assert.equal(await local.page.evaluate(() => window.__voice.instances.at(-1).processLocally), true);
    await settle(async () => assert.match(await status(local.page), /on this Mac/));
  });
  await local.page.close();

  const native = await open("document.addEventListener('DOMContentLoaded', () => document.documentElement.classList.add('native-app'))");
  await check('an app build without microphone permission never opens the mic', async () => {
    await native.page.click('.voice-mic');
    await settle(async () => assert.match(await status(native.page), /no microphone permission yet/));
    assert.equal(await native.page.evaluate(() => window.__voice.instances.length), 0);
  });
  await native.page.close();

  const none = await open('window.__noEngine = true');
  await check('a browser without speech recognition points to macOS dictation', async () => {
    await none.page.click('.voice-mic');
    await settle(async () => assert.match(await status(none.page), /no speech recognition.*Fn twice/));
  });
  await none.page.close();

  const twice = await open('window.__onDevice = true; window.__slow = 300');
  await check('a double-tap on the mic never leaves a recognition running', async () => {
    await twice.page.click('.voice-mic');
    await twice.page.click('.voice-mic');
    await twice.page.waitForTimeout(600);
    const live = await twice.page.evaluate(() => window.__voice.instances.filter((r) => r.started).length);
    assert.equal(live, 0, `${live} recognition(s) still capturing after start+stop`);
    assert.equal(await twice.page.getAttribute('.voice-mic', 'aria-pressed'), 'false');
  });
  await check('a single tap after that still starts exactly one recognition', async () => {
    await twice.page.click('.voice-mic');
    await twice.page.waitForFunction(() => window.__voice.instances.some((r) => r.started));
    assert.equal(await twice.page.evaluate(() => window.__voice.instances.filter((r) => r.started).length), 1);
    await settle(async () => assert.equal(await twice.page.getAttribute('.voice-mic', 'aria-pressed'), 'true'));
  });
  await twice.page.close();

  const phone = { width: 390, height: 844 };
  for (const part of ['', 'team']) {
    const narrow = await open('window.__noEngine = true', part, phone);
    await check(`390px ${part || 'office'}: every voice status line is shown in full, not cut with an ellipsis`, async () => {
      const cut = async () => narrow.page.evaluate(() => [...document.querySelectorAll('.voice-row small')]
        .filter((el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1).map((el) => el.textContent));
      assert.deepEqual(await cut(), [], 'idle hint');
      await narrow.page.locator('.voice-mic').first().click();
      await settle(async () => assert.match(await narrow.page.locator('.voice-row small').first().innerText(), /no speech recognition/));
      assert.deepEqual(await cut(), [], 'error message');
      const wide = await narrow.page.evaluate(() => document.documentElement.scrollWidth);
      assert.ok(wide <= 390, `page is ${wide}px wide`);
    });
    await narrow.page.close();
  }

  const mobile = await open('window.__remote = true', '', phone);
  await check('paired phone: Send files the task without the Mac-only Run, and says where to run it', async () => {
    assert.match(await mobile.page.locator('.direct-state').innerText(), /Run it on the Mac/);
    await box(mobile.page).fill('ブログを書いて');
    await mobile.page.click('.direct-send');
    await mobile.page.waitForSelector('.direct-state.is-sent');
    assert.deepEqual(mobile.posts.map((post) => post.url), ['/api/tasks']);
    assert.match(await mobile.page.locator('.direct-state').innerText(), /Saved to Tasks.*Run it on the Mac/);
  });
  await mobile.page.close();

  const long = await open();
  await check('a long instruction keeps every word and says the card title was shortened', async () => {
    const spoken = `${'あ'.repeat(150)}をして`;
    await box(long.page).fill(spoken);
    await long.page.click('.direct-send');
    await long.page.waitForSelector('.direct-state.is-sent');
    const { title, description } = long.posts[0].body;
    assert.equal(title, `${'あ'.repeat(119)}…`);
    assert.ok(description.startsWith(spoken), 'full instruction is in the description');
    assert.match(await long.page.locator('.direct-state').innerText(), /title shortened/);
  });
  await long.page.close();

  const team = await open('', 'team');
  await check('team sheet: the direct-member mic fills that box, and Send instructs the picked member', async () => {
    const sheet = team.page.locator('.team-sheet');
    await sheet.locator('.direct-to button:has-text("Linus Torvalds")').click();
    await sheet.locator('.voice-mic').click();
    assert.equal(await team.page.evaluate(() => window.__voice.instances.at(-1).lang), 'ja-JP');
    await team.page.evaluate(() => { window.__say('テストを', true); window.__say('直して', true); });
    await settle(async () => assert.equal(await sheet.locator('textarea').inputValue(), 'テストを直して'));
    assert.equal(team.posts.length, 0);
    await sheet.locator('.voice-mic').click();
    await settle(async () => assert.equal(await sheet.locator('.voice-mic').getAttribute('aria-pressed'), 'false'));
    await sheet.locator('.direct-send').click();
    await team.page.waitForSelector('.team-sheet .direct-state.is-sent');
    assert.deepEqual(team.posts, [{ url: '/api/agents/instruct', body: { team: 'app-dev', member: 'MiMo', text: 'テストを直して' } }]);
    assert.match(await sheet.locator('.direct-state').innerText(), /card t_direct1 \(ready\)/);
    assert.equal(await sheet.locator('textarea').inputValue(), '');
  });
  await team.page.close();
} finally {
  await browser.close();
  await server.close();
}
console.log(failed ? 'VOICE_FAIL' : 'VOICE_OK');
process.exit(failed ? 1 : 0);
