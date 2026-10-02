// Office in 3D / VR (Hermes3D goal, step 5) in a real browser. Run: node scripts/test-office-vr.mjs
// Opens /vr with /api/office mocked and navigator.xr replaced by a fake, so no headset, GPU job
// or Hermes write is involved. WebGL runs on Chrome's software renderer (SwiftShader).
// With --real, also serves the live Hermes boards (read-only, as /api/office builds them) and saves
// screenshots to evidence/. Needs Google Chrome; playwright-core is a devDependency.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { buildOffice } from '../office.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const card = (id, fields) => ({ id, board: 'owner', title: `Card ${id}`, status: 'todo', who: null, room: 'hq', why: 'test', reason: null, at: 2_000_000_000, ...fields });
const room = (id, label, fields) => ({ id, label, group: label, zone: 'z', shared: false, teams: [], agents: [], board: { waiting: [], working: [], stopped: [] }, shelf: [], delivered: 0, ...fields });
const OFFICE = {
  days: 7, boards: ['owner'], readAt: 2_000_000_000,
  totals: { waiting: 1, working: 1, stopped: 1, delivered: 1, agents: 2, profiles: 2 },
  rooms: [
    room('hq', 'HQ', { agents: [{ name: 'Bigkiji', profiles: ['default'], hermes: true, state: 'working', card: { id: 't1', title: 'Plan the week' } }],
      board: { working: [card('t1', { title: 'Plan the week', who: 'Bigkiji' })], waiting: [card('t3', { title: 'Next thing' })], stopped: [] } }),
    room('apppro', 'AppPro', { teams: ['app-dev'], agents: [{ name: 'Pi', profiles: [], hermes: false, state: 'stopped', card: { id: 't2', title: 'Fix the build' } }],
      board: { working: [], waiting: [], stopped: [card('t2', { title: 'Fix the build', room: 'apppro', reason: 'needs Yuma' })] },
      shelf: [card('t4', { status: 'done', summary: 'Shipped the VR view' })], delivered: 1 }),
    room('qa', 'QA', { shared: true }), // empty shared room: not drawn, like the 2D panel
  ],
  desk: [card('t2', { title: 'Fix the build', room: 'apppro', needsYuma: true })],
};
// Real-scale office (as on 2026-10-01: 18 stopped, 12 waiting, 9 rooms): the desk sheet is full
// (8 lines + "more", about 1.6 m tall) and three rooms sit in the front row behind it.
const BIG_ROOMS = ['hq', 'apppro', 'moviepro', 'classpro', 'accountpro', 'investpro', 'rentpro', 'musicedit', 'gpu'];
const stoppedIn = (roomId, n) => Array.from({ length: n }, (_, i) => card(`${roomId}-s${i}`, { title: `アプリを公開して利用者数・継続率の計測を入れる ${roomId} ${i}`, room: roomId, status: 'blocked', who: 'Bigkiji', reason: 'Stopped for Yuma: not approved after 2 rounds', needsYuma: true }));
const BIG = {
  days: 7, boards: ['owner', 'default'], readAt: 2_000_000_000,
  totals: { waiting: 12, working: 1, stopped: 18, delivered: 29, agents: 14, profiles: 6 },
  rooms: BIG_ROOMS.map((id, index) => room(id, id.toUpperCase(), {
    agents: [{ name: `Agent${index}a`, profiles: [], hermes: false, state: index === 1 ? 'working' : 'idle', card: null }, { name: `Agent${index}b`, profiles: [], hermes: true, state: 'idle', card: null }],
    board: { working: index === 1 ? [card(`w${index}`, { room: id })] : [], waiting: Array.from({ length: index < 3 ? 4 : 0 }, (_, i) => card(`${id}-q${i}`, { room: id })), stopped: stoppedIn(id, index === 1 ? 8 : index < 6 ? 2 : 0) },
    shelf: Array.from({ length: 3 }, (_, i) => card(`${id}-d${i}`, { status: 'done', summary: `Done ${id} ${i}` })), delivered: 3,
  })),
};
BIG.desk = BIG.rooms.flatMap((item) => item.board.stopped);

const FAKE_XR = `
  window.__xr = { requests: [] };
  const mode = window.__xrMode || 'headset';
  if (mode === 'http') Object.defineProperty(window, 'isSecureContext', { value: false });
  if (mode === 'none') Object.defineProperty(navigator, 'xr', { value: undefined, configurable: true });
  if (mode === 'headset' || mode === 'no-headset') {
    const xr = new EventTarget();
    xr.isSessionSupported = async (kind) => mode === 'headset' && kind === 'immersive-vr';
    xr.requestSession = async (kind, init) => { window.__xr.requests.push({ kind, init }); throw new DOMException('fake headset refused', 'NotSupportedError'); };
    Object.defineProperty(navigator, 'xr', { value: xr, configurable: true });
  }
`;

const server = await createServer({ root, configFile: false, plugins: [react()], logLevel: 'error', appType: 'spa', server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}/vr`;
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let failed = false;
const check = async (name, fn) => {
  try { await fn(); console.log(`ok   ${name}`); } catch (error) { failed = true; console.log(`FAIL ${name}\n     ${error.message.split('\n').slice(0, 6).join(' | ')}`); }
};
const open = async ({ xrMode = 'headset', office = OFFICE, status = 200, size = { width: 1280, height: 800 } } = {}) => {
  const page = await browser.newPage({ viewport: size });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/office', (route) => route.fulfill({ status, json: office }));
  await page.addInitScript(`window.__xrMode = ${JSON.stringify(xrMode)};${FAKE_XR}`);
  await page.goto(base);
  await page.waitForSelector('.office-vr-stage canvas');
  page.errors = errors;
  return page;
};
// Wait for a frame drawn with the rooms in it (the hook is set before that frame renders).
const ready = (page, rooms = 1) => page.waitForFunction((n) => window.__brainbookOfficeVr?.rooms.length >= n && window.__brainbookOfficeVr.drawCalls > 10, rooms);
const placed = (page) => page.evaluate(() => window.__brainbookOfficeVr && { rooms: window.__brainbookOfficeVr.rooms, agents: window.__brainbookOfficeVr.agents, picked: window.__brainbookOfficeVr.picked, drawCalls: window.__brainbookOfficeVr.drawCalls });
// Every animation frame until the camera stops (or 20 s): was Yuma's desk sheet ever in the camera's view?
const flight = (page) => page.evaluate(() => new Promise((resolve) => {
  const vr = window.__brainbookOfficeVr;
  const start = performance.now();
  let frames = 0;
  let deskSeen = 0;
  const step = () => {
    frames += 1;
    if (vr.deskInView) deskSeen += 1;
    if (!vr.moving || performance.now() - start > 20000) resolve({ frames, deskSeen, moving: vr.moving });
    else requestAnimationFrame(step);
  };
  step();
}));

try {
  await check('draws the rooms of /api/office in WebGL (empty shared room skipped)', async () => {
    const page = await open();
    await ready(page);
    const state = await placed(page);
    assert.deepEqual(state.rooms, ['hq', 'apppro']);
    assert.equal(state.agents, 2);
    assert.ok(state.drawCalls > 10, `draw calls ${state.drawCalls}`);
    assert.match(await page.textContent('.office-vr-bar small'), /1 working · 1 stopped · 1 waiting · 1 delivered in 7d/);
    assert.deepEqual(page.errors, []);
    await page.close();
  });

  await check('click a room: walks there and shows its details; Back to desk closes them', async () => {
    const page = await open();
    await ready(page);
    const at = await page.evaluate(() => window.__brainbookOfficeVr.screenOf('apppro'));
    await page.mouse.click(at.x, at.y);
    await page.waitForSelector('.office-vr-room');
    assert.equal((await placed(page)).picked, 'apppro');
    const text = await page.textContent('.office-vr-room');
    assert.match(text, /AppPro/);
    assert.match(text, /Fix the build/);
    assert.match(text, /needs Yuma/);
    assert.match(text, /Shipped the VR view/);
    await page.click('.office-vr-room header button');
    await page.waitForSelector('.office-vr-room', { state: 'detached' });
    assert.equal((await placed(page)).picked, null);
    await page.close();
  });

  await check('real-scale office (18 stopped, 9 rooms): Yuma\'s desk never covers a front-row room, comes back at the desk', async () => {
    const page = await open({ office: BIG, size: { width: 1440, height: 900 } });
    await ready(page, BIG_ROOMS.length);
    assert.equal(await page.evaluate(() => window.__brainbookOfficeVr.deskInView), true, 'the desk is in view from the lobby');
    const rooms = (await placed(page)).rooms;
    for (const id of rooms.slice(0, 3)) { // the front row: the camera flies past the desk to reach them
      const at = await page.evaluate((roomId) => window.__brainbookOfficeVr.screenOf(roomId), id);
      await page.mouse.click(at.x, at.y);
      await page.waitForSelector('.office-vr-room');
      const trip = await flight(page);
      assert.equal(trip.moving, false, `camera did not settle on ${id}`);
      assert.equal(trip.deskSeen, 0, `desk sheet in view on ${trip.deskSeen}/${trip.frames} frames on the way to ${id}`);
      assert.equal((await placed(page)).picked, id);
      const [room, aside] = await Promise.all([page.evaluate((roomId) => window.__brainbookOfficeVr.screenOf(roomId), id), page.locator('.office-vr-room').boundingBox()]);
      assert.ok(room.x > 0 && room.x < aside.x && room.y > 0 && room.y < 900, `${id} on screen left of the details (${Math.round(room.x)},${Math.round(room.y)} vs aside x ${Math.round(aside.x)})`);
      await page.click('.office-vr-room header button');
      await page.waitForSelector('.office-vr-room', { state: 'detached' });
      assert.equal((await flight(page)).moving, false);
      assert.equal(await page.evaluate(() => window.__brainbookOfficeVr.deskInView), true, 'Back to desk shows the desk again');
    }
    assert.deepEqual(page.errors, []);
    await page.close();
  });

  await check('headset present: Enter VR asks for an immersive-vr session with a floor', async () => {
    const page = await open({ xrMode: 'headset' });
    await page.waitForSelector('.office-vr-enter[data-xr="ready"]');
    assert.equal(await page.textContent('.office-vr-enter'), 'Enter VR');
    await page.click('.office-vr-enter');
    await page.waitForSelector('.office-vr-enter[data-xr="error"]');
    const requests = await page.evaluate(() => window.__xr.requests);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].kind, 'immersive-vr');
    assert.ok(requests[0].init.optionalFeatures.includes('local-floor'));
    assert.match(await page.textContent('.office-vr-note'), /VR did not start: fake headset refused/);
    assert.ok(await page.isEnabled('.office-vr-enter'), 'can try again');
    await page.close();
  });

  for (const [mode, state, text] of [['no-headset', 'no-headset', /No VR headset found/], ['http', 'no-https', /VR needs https/], ['none', 'no-webxr', /no WebXR/]]) {
    await check(`${mode}: the button says why and stays off; the 3D view still draws`, async () => {
      const page = await open({ xrMode: mode });
      await page.waitForSelector(`.office-vr-enter[data-xr="${state}"]`);
      assert.match(await page.textContent('.office-vr-enter'), text);
      assert.equal(await page.isEnabled('.office-vr-enter'), false);
      await page.waitForFunction(() => window.__brainbookOfficeVr?.rooms.length === 2);
      await page.close();
    });
  }

  await check('Hermes unreadable: says so, draws no rooms, no page error', async () => {
    const page = await open({ status: 502, office: { rooms: [], desk: [], error: 'Could not read Hermes: test' } });
    await page.waitForFunction(() => document.querySelector('.office-vr-bar small')?.textContent.includes('Could not read Hermes'));
    assert.deepEqual((await placed(page)).rooms, []);
    assert.deepEqual(page.errors, []);
    await page.close();
  });

  if (process.argv.includes('--real')) {
    await check('real Hermes boards (read-only): screenshots', async () => {
      const raw = JSON.parse(execFileSync('python3', [path.join(root, 'agent-feed.py'), `${os.homedir()}/.hermes`, 'cards', '7'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }));
      const teams = JSON.parse(readFileSync(`${os.homedir()}/Documents/AI/router/config/teams.yaml`, 'utf8')).teams; // as /api/office reads it
      const map = JSON.parse(readFileSync(path.join(root, 'office-map.json'), 'utf8'));
      const office = { ...buildOffice({ ...raw, teams, map }), readAt: Math.floor(Date.now() / 1000) };
      const page = await open({ office, xrMode: 'no-headset', size: { width: 1440, height: 900 } });
      await ready(page);
      await page.waitForTimeout(1200);
      mkdirSync(path.join(root, 'evidence'), { recursive: true });
      await page.screenshot({ path: path.join(root, 'evidence', 'office-vr-3d-2026-10-01.png') });
      const state = await placed(page);
      const busy = office.rooms.find((item) => item.board.working.length) || office.rooms[0];
      const at = await page.evaluate((id) => window.__brainbookOfficeVr.screenOf(id), busy.id);
      await page.mouse.click(at.x, at.y);
      await page.waitForSelector('.office-vr-room');
      const trip = await flight(page); // screenshot only once the camera has arrived
      assert.equal(trip.deskSeen, 0, `desk sheet in view on ${trip.deskSeen}/${trip.frames} frames`);
      await page.screenshot({ path: path.join(root, 'evidence', 'office-vr-room-2026-10-01.png') });
      console.log(`     REAL rooms=${state.rooms.length} (${state.rooms.join(',')}) agents=${state.agents} drawCalls=${state.drawCalls} totals=${JSON.stringify(office.totals)} picked=${busy.id}`);
      assert.deepEqual(page.errors, []);
      await page.close();
    });
  }
} finally {
  await browser.close();
  await server.close();
}
console.log(failed ? 'OFFICE_VR_FAIL' : 'OFFICE_VR_OK');
process.exit(failed ? 1 : 0);
