import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import postcss from 'postcss';
import { runInNewContext } from 'node:vm';
import { exerciseScheduledPopup } from '../scripts/neon-scenarios.mjs';

test('mobile sibling popups use the shared More flow after controls, with bounded scrolling; desktop unaffected', async () => {
  const css = postcss.parse(await readFile(new URL('../src/styles.css', import.meta.url), 'utf8'));
  const selectors = ['.topbar-secondary .routine-popover', '.topbar-secondary .profile-popover', '.topbar-secondary .feed-panel'];
  for (const selector of selectors) {
    const rules = [];
    css.walkRules(rule => { if (rule.selectors.includes(selector)) rules.push(rule); });
    assert.equal(rules.length, 1, `${selector}: one shared positioning correction`);
    const rule = rules[0], values = Object.fromEntries(rule.nodes.map(d => [d.prop, d.value]));
    assert.equal(rule.parent.type, 'atrule');
    assert.equal(rule.parent.params, '(max-width:900px)', 'desktop1440 not changed');
    assert.equal(values.position, 'static');
    assert.equal(values.order, '1', 'popup after trigger controls');
    assert.equal(values.flex, '0 0 100%');
    assert.equal(values.width, '100%');
  }
  const mobile = selector => {
    let values;
    css.walkRules(rule => { if (rule.parent.type === 'atrule' && rule.parent.params === '(max-width:900px)' && rule.selectors.includes(selector)) values = Object.fromEntries(rule.nodes.map(d => [d.prop, d.value])); });
    return values;
  };
  assert.equal(mobile('.topbar-secondary .routine-menu').display, 'contents', 'nested routine popup joins the shared flow');
  const menu = mobile('.app-shell .topbar-secondary');
  assert.equal(menu['overflow-y'], 'auto', 'long sibling popups remain reachable');
  assert.match(menu['max-height'], /100dvh/);
});

function fixture({ overlap = false, width, height, reduced }) {
  let open = false, settled = reduced;
  const actions = [], captures = [];
  const rect = () => ({ x: width - 100, y: 80, left: width - 100, top: 80, right: width - 56, bottom: 124, width: settled ? 44 : 42.24, height: settled ? 44 : 42.24 });
  const icon = {}, popupNode = {}, element = { getBoundingClientRect: rect, contains: node => node === icon };
  const popup = {
    waitFor: async options => assert.equal(open, options.state === 'visible'),
    boundingBox: async () => ({ x: 12, y: overlap ? 62 : 194, width: width - 24, height: Math.min(96, height - 210) }),
  };
  const trigger = {
    count: async () => 1, getAttribute: async () => String(open), boundingBox: async () => rect(),
    scrollIntoViewIfNeeded: async () => {},
    evaluate: async fn => runInNewContext(`(${fn.toString()})(element)`, { element, innerWidth: width, innerHeight: height, document: { elementFromPoint: () => overlap ? popupNode : icon } }),
  };
  const page = {
    locator: selector => { assert.equal(selector, '.routine-toggle'); return trigger; },
    getByRole: (role, options) => { assert.equal(role, 'menu'); assert.deepEqual(options, { name: 'Scheduled tasks', exact: true }); return popup; },
    waitForTimeout: async ms => { assert.ok(ms <= 250); settled = true; },
  };
  return { page, actions, captures, action: async target => { assert.equal(target, trigger); open = !open; settled = reduced; actions.push(open ? 'open' : 'close'); }, capture: async name => captures.push(name) };
}

for (const [width, height] of [[360, 800], [390, 844], [844, 390]]) for (const reduced of [false, true]) {
  test(`${width}x${height}/${reduced ? 'reduce' : 'normal'} fixture: real hit algorithm guards repeated normal trigger actions`, async () => {
    const f = fixture({ width, height, reduced });
    await exerciseScheduledPopup(f.page, f.action, f.capture);
    assert.deepEqual(f.actions, ['open', 'close', 'open', 'close']);
    assert.equal(f.captures.length, 2);
  });
}

test('preserved62px overlay fixture fails before closing tap, never bypassed', async () => {
  const f = fixture({ overlap: true, width: 390, height: 844, reduced: false });
  await assert.rejects(exerciseScheduledPopup(f.page, f.action, f.capture), /Scheduled popup below its trigger/);
  assert.deepEqual(f.actions, ['open']);
});
