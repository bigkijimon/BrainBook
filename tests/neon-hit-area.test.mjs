import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import postcss from 'postcss';

test('primary and VR actions have a shared 44px floor outside viewport/motion conditions', async () => {
  const css = postcss.parse(await readFile(new URL('../src/styles.css', import.meta.url), 'utf8'));
  for (const selector of ['.primary-button', '.office-vr-enter']) {
    const minimums = {};
    css.walkRules(rule => {
      if (rule.parent.type !== 'root' || !rule.selectors.includes(selector)) return;
      rule.walkDecls(/^min-(height|width)$/, declaration => { minimums[declaration.prop] = declaration.value; });
    });
    assert.equal(minimums['min-height'], '44px', `${selector}: default desktop height floor`);
    assert.equal(minimums['min-width'], '44px', `${selector}: narrow-label width floor`);
  }
});

test('Tasks, Ideas and Goals actual controls retain 44px floors and search/filter wrappers grow with their inputs', async () => {
  const css = postcss.parse(await readFile(new URL('../src/styles.css', import.meta.url), 'utf8'));
  const declarations = selector => {
    const result = {};
    css.walkRules(rule => {
      if (rule.parent.type !== 'root' || !rule.selectors.includes(selector)) return;
      rule.walkDecls(d => { result[d.prop] = d.value; });
    });
    return result;
  };
  for (const selector of ['.board-toolbar button', '.board button', '.board-empty-hint button', '.idea-shelf button', '.tree-fold button', '.tree-fold > summary', '.goal-sources summary', '.board-toolbar .search-box input', '.board-toolbar .filter-box select', '.idea-shelf .idea-search input']) {
    const values = declarations(`.app-shell ${selector}`);
    assert.equal(values['min-height'], '44px', `${selector}: control itself, not just its label`);
    assert.equal(values['min-width'], '44px', `${selector}: narrow labels also reachable`);
  }
  for (const selector of ['.board-toolbar .search-box', '.board-toolbar .filter-box', '.idea-shelf .idea-search']) {
    const values = declarations(`.app-shell ${selector}`);
    assert.equal(values.height, 'auto', `${selector}: no short fixed wrapper around 44px child`);
    assert.equal(values['min-height'], '44px');
  }
});
