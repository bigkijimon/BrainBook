import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
const palette = await import('../src/theme-palette.mjs').catch(() => null);

test('one sunset palette supplies identical CSS and canvas colors', () => {
  assert.equal(typeof palette?.themeDeclarations, 'function', 'shared sunset palette is missing');
  const css = palette.themeDeclarations();
  for (const [key, color] of Object.entries(palette.themePalette)) {
    assert.match(color, /^#[0-9a-f]{6}$/);
    assert.ok(css.includes(`--theme-${key}: ${color};`), `${key}: CSS/canvas mismatch`);
  }
  assert.equal(palette.themePalette.coral, '#ee9e8a');
  assert.equal(palette.themePalette.text, '#f8e4d9');
});

test('actual brain color exports share the palette instead of private cyan/green numbers', async () => {
  await mkdir(new URL('../evidence/compiled/',import.meta.url), {recursive:true});
  const file = new URL('../evidence/compiled/theme-brain-test.mjs',import.meta.url);
  await build({entryPoints:[fileURLToPath(new URL('../src/BrainScene.tsx',import.meta.url))],outfile:fileURLToPath(file),bundle:true,format:'esm',platform:'node',external:['react','three','three/*']});
  const {AREA_COLOR} = await import(file.href);
  assert.equal(AREA_COLOR.learning,parseInt(palette.themePalette.lavender.slice(1),16));
  assert.equal(AREA_COLOR['mental-health'],parseInt(palette.themePalette.peach.slice(1),16));
});

test('capture provenance includes the shared palette as well as its generated CSS', async () => {
  const {LAYOUT_SOURCES,CARD_SOURCES} = await import('../scripts/source-fingerprint.mjs');
  assert.ok(LAYOUT_SOURCES.includes('src/theme-palette.mjs'));
  assert.ok(CARD_SOURCES.includes('src/theme-palette.mjs'));
});
