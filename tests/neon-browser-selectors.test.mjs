import test from 'node:test';
import assert from 'node:assert/strict';
import { exerciseStatusModes, exerciseGlossary, exerciseReadOnlyComposer } from '../scripts/neon-scenarios.mjs';

test('Office exercises exactly visible Status view modes; nested microphone is never selected', async () => {
  const actions = [];
  const modes = ['Agents', 'Teams'].map(name => ({ name, pressed: false, async getAttribute(key) { assert.equal(key, 'aria-pressed'); return String(this.pressed); } }));
  const status = {
    getByRole(role, options) {
      assert.equal(role, 'group'); assert.deepEqual(options, { name: 'Status view', exact: true });
      return { locator(selector) {
        assert.equal(selector, ':scope > button:visible');
        return { allTextContents: async () => modes.map(m => m.name), all: async () => modes };
      } };
    },
    locator() { throw new Error('Broad console-tools selection could include voice-mic'); },
  };
  await exerciseStatusModes(status, async mode => { actions.push(mode.name); mode.pressed = true; });
  assert.deepEqual(actions, ['Agents', 'Teams']);
});

test('an unexpected mode fails before any action rather than silently dropping a control', async () => {
  let clicks = 0;
  const status = { getByRole: () => ({ locator: () => ({ allTextContents: async () => ['Agents', 'Teams', 'Start voice input'] }) }) };
  await assert.rejects(exerciseStatusModes(status, async () => clicks++));
  assert.equal(clicks, 0);
});

test('each explicitly scoped glossary opens, shows its definitions, and closes independently', async () => {
  const actions = [];
  for (const scope of ['Header', 'Office']) {
    let open = false;
    const disclosure = {
      count: async () => 1,
      evaluate: async () => open,
      locator(selector) {
        if (selector === ':scope > summary') return { scope };
        if (selector === ':scope > dl') return { isVisible: async () => open };
        if (selector === ':scope > dl > dt') return { allTextContents: async () => ['Model', 'Session', 'Card'] };
        throw new Error(selector);
      },
    };
    await exerciseGlossary(disclosure, async summary => { assert.equal(summary.scope, scope); actions.push(scope); open = !open; });
    assert.equal(open, false);
  }
  assert.deepEqual(actions, ['Header', 'Header', 'Office', 'Office']);
});

test('missing or duplicated scoped glossary fails before click; no arbitrary first element', async () => {
  let clicks = 0;
  for (const count of [0, 2]) await assert.rejects(exerciseGlossary({ count: async () => count }, async () => clicks++));
  assert.equal(clicks, 0);
});

test('separate owning composer scopes only open/read/close; no Send, meeting submit or microphone actions', async () => {
  const actions = [];
  for (const [name, field, submit] of [['Send a request by voice or text', 'Instruction for Bigkiji', 'Send'], ['Start a meeting', 'Meeting topic', 'Start meeting']]) {
    let open = false;
    const summary = { innerText: async () => name };
    const disclosure = {
      count: async () => 1,
      evaluate: async () => open,
      locator(selector) { assert.equal(selector, ':scope > summary'); return summary; },
      getByRole(role, options) {
        assert.ok((role === 'textbox' && options.name === field) || (role === 'button' && options.name === submit));
        assert.equal(options.exact, true);
        return { isVisible: async () => open, count: async () => 1 };
      },
    };
    await exerciseReadOnlyComposer(disclosure, { name, field, submit }, async target => {
      assert.equal(target, summary, 'only disclosure summary receives input'); open = !open; actions.push(name);
    });
    assert.equal(open, false);
  }
  assert.equal(actions.length, 4);
});
