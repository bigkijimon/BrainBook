// Merged chat/meeting panel regression check (AgentChatPanel, merge 2026-10-02). The round that
// merged AgentChat + MeetingRoom had no seam for the merge itself: scripts/test-meeting-render.mjs
// covers MeetingRoom standalone, and nothing covered the switch, which is the whole point of the
// card ("Meetingが始まったらChatBoxを切り替えてMeetingにする").
//
// This drives the real dev server and asserts the DOM, not the code: one card shell holds both
// bodies, the chat threads show by default, a running meeting takes over that same shell without a
// reload, and the chat comes back when the meeting ends. /api/meetings is routed to a controllable
// payload so both transitions are deterministic and no real meeting is spawned (starting one would
// run real agents and write real meeting records; the endpoint's shape is untouched by this card, so
// intercepting it exercises the identical seam the component reads).
//
// Usage: node scripts/check-merged-panel.mjs [url]      default http://127.0.0.1:4199/
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchTestBrowser } from './browser.mjs';

const url = process.argv[2] || 'http://127.0.0.1:4199/';
const root = fileURLToPath(new URL('..', import.meta.url));
const shots = path.join(root, 'evidence');
const ATTENDEES = {
  Bigkiji: { persona: 'Bigkiji', group: 'Host · chief orchestrator', member: false },
  MiMo: { persona: 'Linus Torvalds', group: 'AppPro (app building)', member: true },
  'Space Bunny': { persona: 'Grace Hopper', group: 'Engineering QA', member: true },
};
const TOPIC = 'BrainBook 最初の10社に売るにはどうすればいいか、営業導線とオンボーディングと価格の3点から各チームの考えを聞かせてほしい。';
const now = () => Math.floor(Date.now() / 1000);
const RUNNING = {
  id: 'm_check1', topic: TOPIC, members: ['MiMo', 'Space Bunny'], status: 'running',
  startedAt: now() - 120, endedAt: null, speaking: 'Space Bunny',
  lines: [
    { kind: 'say', who: 'Bigkiji', text: 'Opening remarks. Two rounds, then I will sum up.', at: 1, seconds: 12 },
    { kind: 'say', who: 'MiMo', text: 'My idea: fix the first-run screen before touching pricing.', at: 2, seconds: 30 },
    { kind: 'absent', who: 'Space Bunny', text: 'session_id: 20261001_185133_a1b2c3d4e5f6', at: 3 },
  ],
};
const DONE = {
  id: 'm_check1', topic: TOPIC, members: ['MiMo'], status: 'done',
  startedAt: now() - 300, endedAt: now() - 60, speaking: null,
  lines: RUNNING.lines.slice(0, 2),
  summary: { theme: 'BrainBook最初の10社販売', decision: 'Decision A.', actions: 'MiMo starts now.', ideas: '', raw: null, rawFallback: false, isError: false },
};

// MeetingRoom polls every 20s while idle and every 3s once a meeting is running, so the first
// transition can take up to one idle interval. Budget one poll plus slack, and say so on failure
// rather than letting the check look like a product bug.
const IDLE_POLL_MS = 20000;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const browser = await launchTestBrowser({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let payload = { meetings: [], attendees: ATTENDEES };
const setPayload = (next) => { payload = next; };
let failed = false;
const check = async (name, fn) => {
  try { await fn(); console.log(`ok   ${name}`); } catch (error) { failed = true; console.log(`FAIL ${name}\n     ${String(error.message).split('\n').slice(0, 6).join(' | ')}`); }
};

// One shell = one card. Asserted by identity: the same element must go from carrying the chat
// threads to carrying the live meeting, which is what "one switching panel" actually means.
const panel = (page) => page.locator('section.agent-chat.card-shell');

// Screenshot the panel itself, never fullPage. BrainBook runs two live 1280x900 WebGL canvases
// (the office scene), and fullPage resizes the viewport to the whole ~4400px document, which forces
// both to re-render at that height under this headless software GL — measured past Playwright's
// 30s screenshot budget. An element shot of the panel is both faster (10s vs a timeout) and truer
// evidence: it frames the merged panel instead of burying it under the whole dashboard.
const SHOT_TIMEOUT = 90000;
const snap = (page, name) => panel(page).screenshot({ path: path.join(shots, `${name}.png`), timeout: SHOT_TIMEOUT });

try {
  for (const [label, viewport] of [['1280', { width: 1280, height: 900 }], ['390', { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport });
    await page.route('**/api/meetings', async (route) => { await route.fulfill({ json: payload }); });
    await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    await page.waitForSelector('.agent-chat.card-shell', { timeout: 15000 });
    await page.waitForTimeout(1500); // first paint + /api/agents/feed

    await check(`${label}px idle: exactly one card shell holds both bodies`, async () => {
      assert.equal(await page.locator('section.agent-chat.card-shell').count(), 1, 'there must be a single chat/meeting card, not the old two stacked cards');
      assert.equal(await page.locator('section.meeting.card-shell').count(), 0, 'MeetingRoom must not also render its own standalone card shell');
    });

    await check(`${label}px idle: agent chat threads show as before`, async () => {
      assert.match(await panel(page).locator('.agent-chat-head h3').innerText(), /Agent chat/, 'header must be the chat one while idle');
      await panel(page).locator('.panel-chat').waitFor({ state: 'visible', timeout: 5000 });
      assert.ok(await panel(page).locator('.chat-thread').count() > 0, 'the real /api/agents/feed must still render chat threads');
    });

    await check(`${label}px idle: starting a meeting stays reachable in the same panel`, async () => {
      const topicBox = panel(page).locator('.meeting-embed .meeting-form textarea');
      await topicBox.waitFor({ state: 'visible', timeout: 5000 });
      assert.equal(await topicBox.isDisabled(), false, 'the topic box must be writable while idle');
      assert.ok(await panel(page).locator('.meeting-invite .meeting-chip input:checked').count() > 0, 'the member picker must default to the group members');
      // The button is disabled until a topic is typed (pre-existing behaviour, unchanged here), so
      // typing one is what proves the start path survived the merge rather than just rendering.
      assert.equal(await panel(page).locator('.meeting-form button[type="submit"]').isDisabled(), true, 'empty topic must leave Start disabled');
      await topicBox.fill(TOPIC);
      await wait(150);
      assert.equal(await panel(page).locator('.meeting-form button[type="submit"]').isDisabled(), false, 'typing a topic must enable Start meeting');
    });

    await check(`${label}px idle: the start control's label stays on one line`, async () => {
      // min-height:36px with no nowrap wrapped "Start meeting" into 2 line-boxes (3 at 390px)
      // inside a fixed-height pill, so the label read as a crushed stub. Measured on the label's
      // own text node: a Range over the whole button also returns a rect for the <Play/> svg, and
      // that rect is not a wrapped label. Not the button's height either - the box never grew.
      const lines = await panel(page).locator('.meeting-form button[type="submit"]').evaluate((node) => {
        const text = [...node.childNodes].find((child) => child.nodeType === 3 && child.textContent.trim());
        const range = document.createRange(); range.selectNode(text); return range.getClientRects().length;
      });
      assert.ok(lines <= 1, `"Start meeting" wrapped onto ${lines} line-boxes inside the button`);
    });

    await check(`${label}px idle: the panel is labelled by a heading that exists`, async () => {
      const labelledBy = await panel(page).getAttribute('aria-labelledby');
      assert.ok(labelledBy, 'the merged section must stay labelled for screen readers');
      assert.equal(await page.locator(`#${labelledBy}`).count(), 1, `aria-labelledby="${labelledBy}" must resolve to exactly one element`);
    });

    await snap(page, `panel-idle-${label}`);

    // The switch. No reload: same page, same DOM node, new content.
    setPayload({ meetings: [RUNNING], attendees: ATTENDEES });
    await check(`${label}px live: the same panel switches to the running meeting without a reload`, async () => {
      await page.waitForFunction(() => document.querySelector('.agent-chat-head h3')?.textContent?.includes('Meeting:'), null, { timeout: IDLE_POLL_MS + 10000 })
        .catch(() => { throw new Error(`panel did not switch within ${IDLE_POLL_MS + 10000}ms (one idle poll interval plus slack) - check MeetingRoom's /api/meetings poll`); });
      const heading = await panel(page).locator('.agent-chat-head h3').innerText();
      assert.match(heading, /Meeting:/, 'header must name the meeting');
      assert.match(heading, /BrainBook/, 'header must carry the topic');
      assert.match(heading, /Live/, 'header must mark it live');
      assert.equal(await panel(page).locator('.panel-chat').isHidden(), true, 'the chat threads must hide while a meeting is running');
    });

    await check(`${label}px live: the header wears the meeting's colour, not the chat's`, async () => {
      // In live mode the panel header *is* the meeting's heading (.meeting-head is not drawn), so
      // it must not keep the agent-chat teal above an entirely pink body. Read the computed colour
      // and compare against both real values, so this fails on a regression rather than on a hex
      // rename somewhere else in the file.
      const tint = await panel(page).locator('.agent-chat-head h3').evaluate((node) => getComputedStyle(node).color);
      const same = (a, b) => a.split(' ').slice(0, 3).join(' ') === b.split(' ').slice(0, 3).join(' ');
      assert.ok(same(tint, 'rgb(255, 156, 204)'), `live meeting header must be the meeting pink #ff9ccc, got ${tint}`);
      assert.ok(!same(tint, 'rgb(127, 243, 232)'), `live meeting header kept the agent-chat teal: ${tint}`);
    });

    await check(`${label}px live: lines, members and absent reasons are all present`, async () => {
      await panel(page).locator('.meeting-embed .meeting-item.is-running').waitFor({ state: 'visible', timeout: 10000 });
      assert.equal(await panel(page).locator('.meeting-lines .chat-message').count(), RUNNING.lines.filter((l) => l.kind === 'say').length, 'every spoken line must be rendered');
      assert.equal(await panel(page).locator('.meeting-absent').count(), 1, 'the absent reason must survive the merge');
      assert.match(await panel(page).locator('.meeting-absent').innerText(), /could not join/, 'absent line must explain why');
      assert.match(await panel(page).locator('.meeting-row').innerText(), /Linus Torvalds, Grace Hopper/, 'member names must be shown');
    });

    await check(`${label}px live: the switch is announced, since the merge replaces content`, async () => {
      // The merge took content away mid-read (a meeting used to be a separate card, so the chat
      // never vanished). A silent swap is invisible to a screen reader, so the panel must expose a
      // live region. Asserted after the switch, since a live region only speaks on change.
      const status = panel(page).locator('[role="status"].sr-only');
      await status.waitFor({ state: 'attached', timeout: 5000 });
      const text = (await status.innerText()).trim();
      assert.match(text, /Meeting started/, `the live region must name the switch, got: ${JSON.stringify(text)}`);
      assert.match(text, /BrainBook/, 'the announcement must carry the topic');
      // Not isHidden(): a clipped 1x1px box still has a non-empty bounding box, so Playwright
      // reports it visible. The property that matters is that it takes no space on screen.
      const box = await status.boundingBox();
      assert.ok(box && box.width <= 1.5 && box.height <= 1.5,
        `the live region must be announced, never shown (got ${box ? `${box.width}x${box.height}` : 'no box'})`);
    });

    await check(`${label}px live: the start form is withdrawn, so nothing looks startable mid-meeting`, async () => {
      assert.equal(await panel(page).locator('.meeting-form').count(), 0, 'the disabled start form would only repeat the live header');
    });

    await snap(page, `panel-live-${label}`);

    setPayload({ meetings: [DONE], attendees: ATTENDEES });
    await check(`${label}px after: the panel returns to chat threads on its own`, async () => {
      await page.waitForFunction(() => document.querySelector('.agent-chat-head h3')?.textContent?.includes('Agent chat'), null, { timeout: 15000 });
      await panel(page).locator('.panel-chat').waitFor({ state: 'visible', timeout: 5000 });
      assert.ok(await panel(page).locator('.chat-thread').count() > 0, 'chat threads must be back');
      assert.equal(await panel(page).locator('.meeting-form textarea').count(), 1, 'the start form must come back with the chat');
      const text = (await panel(page).locator('[role="status"].sr-only').innerText()).trim();
      assert.match(text, /Meeting ended/, `returning to chat must be announced too, got: ${JSON.stringify(text)}`);
      assert.match(text, /Agent chat is back/, 'the announcement must say what the panel is showing now');
    });

    await check(`${label}px after: the finished meeting keeps its summary and expand/collapse`, async () => {
      assert.equal(await panel(page).locator('.meeting-summary').count(), 1, 'the summary card must survive the merge');
      assert.match(await panel(page).locator('.meeting-row').innerText(), /Finished/, 'the row must report the finished state');
      const before = await panel(page).locator('.meeting-full-topic').count();
      await panel(page).locator('.meeting-row').click();
      await wait(200);
      assert.notEqual(await panel(page).locator('.meeting-full-topic').count(), before, 'the row must still expand and collapse');
    });

    await snap(page, `panel-after-${label}`);
    await page.close();
  }
} finally {
  await browser.close();
}

if (failed) { console.log('\nFAILED'); process.exit(1); }
console.log('\nOK');