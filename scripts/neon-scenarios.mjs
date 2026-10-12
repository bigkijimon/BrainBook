import assert from 'node:assert/strict';

export const DEVICES = [['desktop', 1440, 900], ['touch360', 360, 800], ['touch390', 390, 844], ['touch430', 430, 932], ['landscape', 844, 390]];
export const MOTIONS = ['no-preference', 'reduce'];
export const SCENARIOS = {
  home: 'Home live-only, gauges, neon and boot-free capture',
  relationship: 'Relationship selection, real emulated touch/cancel, animation pause and resource removal',
  'other-work': 'Other work categories, search, source counts, repeated popup close/focus',
  capture: 'Capture empty/error flow, intercepted sort contract only',
  apps: 'All managed app popups, registry nested close, sidebar scroll reachability',
  teams: 'Every group filters Office, member popup, nested agent info, ALL reset',
  office: 'Office agents/teams, original sources and chat/meeting reading',
  goals: 'Original/related goal display, separate progress/actions (reading only)',
  tasks: 'Tasks board/timeline, search/priority, task detail/editor without saving',
  ideas: 'Ideas tabs/search/folders/tree (no copy or mutations)',
  more: 'More actions, glossary, notices, scheduled tasks, account, help/dump/settings/phone close/focus',
  routes: '3D/VR and pairing route render/back (no XR session, no pairing)',
};

export function selectValues(requested, allowed, label) {
  if (requested === undefined) return [...allowed];
  const values = [...new Set(requested.split(',').map(value => value.trim()).filter(Boolean))];
  if (!values.length) throw new Error(`Empty ${label} filter`);
  for (const value of values) if (!allowed.includes(value)) throw new Error(`Unknown ${label}: ${value}. Choose ${allowed.join(', ')}`);
  return values;
}

const errorText = error => error?.stack || String(error);

// A failed assertion stays failed after recovery. Capture its actual state before
// navigation cleanup; if isolation fails, stop exercising this browser context.
export function createScenarioRunner({ prepare, captureFailure, cleanup, onResult }) {
  let isolated = true;
  return async (name, exercise) => {
    if (!isolated) {
      await onResult({ name, status: 'blocked', error: 'Previous scenario cleanup failed; context is not isolated.' });
      return;
    }
    const result = { name, status: 'exercised' };
    try {
      await prepare();
      await exercise();
    } catch (error) {
      result.status = 'failed';
      result.error = errorText(error);
      try { result.failureCapture = await captureFailure(result); }
      catch (captureError) { result.captureError = errorText(captureError); }
    } finally {
      try { await cleanup(); }
      catch (cleanupError) {
        isolated = false;
        result.status = 'failed';
        result.cleanupError = errorText(cleanupError);
      }
      await onResult(result);
    }
  };
}

// Status view is a separate semantic group from the voice/text composer. Even a
// visible microphone must never be part of this read-only mode exercise.
export async function exerciseStatusModes(status, action) {
  const modes = status.getByRole('group', { name: 'Status view', exact: true }).locator(':scope > button:visible');
  assert.deepEqual((await modes.allTextContents()).map(text => text.trim()), ['Agents', 'Teams'], 'visible intended status modes');
  for (const mode of await modes.all()) {
    await action(mode);
    assert.equal(await mode.getAttribute('aria-pressed'), 'true', 'mode selection applied');
  }
}

// Call with the header or Office disclosure, not the company-wide repeated class.
export async function exerciseGlossary(disclosure, action) {
  assert.equal(await disclosure.count(), 1, 'one glossary in the intended scope');
  assert.equal(await disclosure.evaluate(element => element.open), false, 'glossary initially compact');
  const summary = disclosure.locator(':scope > summary');
  await action(summary);
  assert.equal(await disclosure.evaluate(element => element.open), true, 'glossary opens');
  assert.equal(await disclosure.locator(':scope > dl').isVisible(), true, 'definitions visible');
  assert.ok((await disclosure.locator(':scope > dl > dt').allTextContents()).includes('Model'), 'actual terms present');
  await action(summary);
  assert.equal(await disclosure.evaluate(element => element.open), false, 'glossary closes');
}

export async function exerciseReadOnlyComposer(disclosure, { name, field, submit }, action) {
  assert.equal(await disclosure.count(), 1, `one ${name} disclosure in its owning section`);
  const summary = disclosure.locator(':scope > summary');
  assert.equal((await summary.innerText()).trim(), name);
  assert.equal(await disclosure.evaluate(element => element.open), false);
  await action(summary);
  assert.equal(await disclosure.evaluate(element => element.open), true);
  assert.equal(await disclosure.getByRole('textbox', { name: field, exact: true }).isVisible(), true);
  const button = disclosure.getByRole('button', { name: submit, exact: true });
  assert.equal(await button.count(), 1);
  assert.equal(await button.isVisible(), true);
  // Read only: never fill, submit, select recipients, or touch recording controls.
  await action(summary);
  assert.equal(await disclosure.evaluate(element => element.open), false);
}

export async function exerciseMapExit(page, action, capture) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const open = page.getByRole('button', { name: 'Open map', exact: true });
    assert.equal(await open.count(), 1, 'one intended map toggle');
    await action(open);
    assert.equal(await page.locator('.brain-hud').isVisible(), true);
    const close = page.getByRole('button', { name: 'Close map', exact: true });
    await close.waitFor({ state: 'visible' });
    await close.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200); // Let the existing150ms press feedback finish.
    assert.equal(await close.getAttribute('aria-pressed'), 'true');
    const hit = await close.evaluate(element => {
      const rect = element.getBoundingClientRect();
      const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
      const target = document.elementFromPoint(x, y);
      return { width: rect.width, height: rect.height, inViewport: x >= 0 && y >= 0 && x < innerWidth && y < innerHeight, ownsPointer: target === element || element.contains(target) };
    });
    assert.ok(hit.width >= 44 && hit.height >= 44, 'Close map retains44px target');
    assert.equal(hit.inViewport, true, 'Close map within viewport');
    assert.equal(hit.ownsPointer, true, 'Close map owns its pointer hit (no canvas interception)');
    const canvas = page.locator('canvas.brain-scene.is-focus');
    assert.equal(await canvas.count(), 1);
    assert.equal(await canvas.evaluate(element => getComputedStyle(element).pointerEvents), 'auto', 'canvas drag/pick remains enabled');
    await capture(attempt ? 'map-reopen' : 'map-open');
    await action(close); // Actual click/tap, never force or DOM click.
    await page.locator('.brain-hud').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('.brain-hud').count(), 0);
    assert.equal(await page.locator('canvas.brain-scene.is-focus').count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Open map', exact: true }).getAttribute('aria-pressed'), 'false');
  }
}

export async function exerciseScheduledPopup(page, action, capture) {
  const trigger = page.locator('.routine-toggle');
  assert.equal(await trigger.count(), 1, 'one scheduled tasks trigger');
  for (let attempt = 0; attempt < 2; attempt++) {
    assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
    await action(trigger);
    const popup = page.getByRole('menu', { name: 'Scheduled tasks', exact: true });
    await popup.waitFor({ state: 'visible' });
    await trigger.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200); // Existing press feedback, no hit-target tolerance.
    assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
    const buttonBox = await trigger.boundingBox(), popupBox = await popup.boundingBox();
    assert.ok(popupBox.y >= buttonBox.y + buttonBox.height, 'Scheduled popup below its trigger');
    const hit = await trigger.evaluate(element => {
      const box = element.getBoundingClientRect();
      const x = box.left + box.width / 2, y = box.top + box.height / 2;
      const target = document.elementFromPoint(x, y);
      return { width: box.width, height: box.height, inViewport: x >= 0 && y >= 0 && x < innerWidth && y < innerHeight, ownsPointer: target === element || element.contains(target) };
    });
    assert.ok(hit.width >= 44 && hit.height >= 44, 'Scheduled trigger44px');
    assert.equal(hit.inViewport, true);
    assert.equal(hit.ownsPointer, true, 'Scheduled trigger owns its hit while popup open');
    await capture(attempt ? 'scheduled-reopen' : 'scheduled-open');
    await action(trigger); // Actual click/tap, never forced or redirected to another control.
    await popup.waitFor({ state: 'hidden' });
    assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
  }
}

// IntersectionObserver owns playback. Scroll the real decoration into the
// viewport before testing animation; never change its state or observer result.
export async function exerciseNeonMotion(page, motion, capture) {
  const deco = page.locator('.neon-deco');
  assert.equal(await deco.count(), 1, 'one actual decoration');
  const observe = async expected => {
    await page.waitForFunction(({expected}) => document.querySelector('.neon-deco')?.getAttribute('data-playing') === expected, {expected}, {timeout:5000});
    assert.equal(await deco.getAttribute('data-playing'), expected);
  };
  const intoView = async () => {
    await deco.evaluate(e => e.scrollIntoView({block:'center', behavior:'instant'}));
    assert.ok(await deco.evaluate(e => {
      const r=e.getBoundingClientRect(), header=document.querySelector('.topbar')?.getBoundingClientRect();
      return r.top >= Math.max(0,header?.bottom||0) && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth;
    }), 'decoration inside actual viewport below sticky header');
    await observe(motion==='reduce'?'false':'true');
  };
  const times = () => deco.evaluate(e => e.getAnimations({subtree:true}).map(a => a.currentTime));
  await intoView();
  const a=await times(); await page.waitForTimeout(160); const b=await times();
  if(motion==='no-preference')assert.notDeepEqual(a,b,'neon actually advances');
  else assert.deepEqual(a,b,'reduced decoration does not animate');
  await capture('home-neon-visible');
  await page.evaluate(() => scrollTo(0,document.documentElement.scrollHeight));
  const offscreen=await deco.evaluate(e => {const r=e.getBoundingClientRect();return r.bottom<=0 || r.top>=innerHeight;});
  if(offscreen){
    await observe('false');
    // Let any already queued animation frame settle before testing pause.
    await page.waitForTimeout(80);
    const paused=await times();await page.waitForTimeout(160);
    assert.deepEqual(await times(),paused,'offscreen decoration remains paused');
    await capture('home-neon-offscreen');
  }
  await intoView();
  return offscreen;
}
