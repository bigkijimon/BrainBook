import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import postcss from 'postcss';
import { runInNewContext } from 'node:vm';
import { exerciseMapExit } from '../scripts/neon-scenarios.mjs';

test('focused map header owns a layer above canvas/HUD in every viewport and motion mode, canvas remains interactive', async () => {
  const css = postcss.parse(await readFile(new URL('../src/styles.css', import.meta.url), 'utf8'));
  const properties = selector => {
    const result = {};
    css.walkRules(rule => {
      if (rule.parent.type === 'root' && rule.selectors.includes(selector)) rule.walkDecls(d => { result[d.prop] = d.value; });
    });
    return result;
  };
  const header = properties('.app-shell.brain-open .topbar');
  assert.ok(Number(header['z-index']) > Number(properties('.brain-scene.is-focus')['z-index']));
  assert.ok(Number(header['z-index']) > Number(properties('.brain-hud')['z-index']));
  assert.equal(properties('.brain-scene.is-focus')['pointer-events'], 'auto', 'drag/pick input retained');
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /aria-label=\{brainOpen \? 'Close map' : 'Open map'\}/, 'icon remains named when its text span is hidden');
});

function fixture({ blocked = false, width = 1440, height = 900, reduced = false } = {}) {
  let open = false, settled = reduced; const actions = [];
  const icon = {}, canvas = {};
  const element = {
    getBoundingClientRect: () => ({ left: width - 60, top: height < 500 ? 300 : 100, width: settled ? 44 : 42.24, height: settled ? 44 : 42.24 }),
    contains: target => target === icon,
  };
  const environment = { element, innerWidth: width, innerHeight: height, document: { elementFromPoint: () => blocked ? canvas : icon } };
  const control = {
    count: async () => 1, waitFor: async () => {}, scrollIntoViewIfNeeded: async () => {},
    getAttribute: async () => String(open),
    evaluate: async callback => runInNewContext(`(${callback.toString()})(element)`, environment),
  };
  const page = {
    getByRole(role, options) { assert.equal(role, 'button'); assert.equal(options.exact, true); assert.equal(options.name, open ? 'Close map' : 'Open map'); return control; },
    waitForTimeout: async milliseconds => { assert.ok(milliseconds <= 250); settled = true; },
    locator(selector) {
      if (selector === '.brain-hud') return { isVisible: async () => open, count: async () => Number(open), waitFor: async () => assert.equal(open, false) };
      if (selector === 'canvas.brain-scene.is-focus') return { count: async () => Number(open), evaluate: async () => 'auto' };
      throw new Error(selector);
    },
  };
  return { page, actions, action: async () => { open = !open; settled = reduced; actions.push(open ? 'open' : 'close'); } };
}

for (const [device, width, height] of [['desktop', 1440, 900], ['portrait', 390, 844], ['landscape', 844, 390]]) for (const motion of ['normal', 'reduce']) {
  test(`${device}/${motion}: exit contract checks exposed44px control and closes/reopens using normal actions`, async () => {
    const f = fixture({ width, height, reduced: motion === 'reduce' });
    await exerciseMapExit(f.page, f.action, async () => {});
    assert.deepEqual(f.actions, ['open', 'close', 'open', 'close']);
  });
}

test('canvas interception is a failure before exit input, never bypassed by forced action', async () => {
  const f = fixture({ blocked: true });
  await assert.rejects(exerciseMapExit(f.page, f.action, async () => {}), /Close map owns its pointer hit/);
  assert.deepEqual(f.actions, ['open']);
});
