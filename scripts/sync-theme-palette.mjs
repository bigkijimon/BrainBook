// Regenerate only the delimited CSS tokens from the one canonical palette.
import { readFile, writeFile } from 'node:fs/promises';
import { themeDeclarations } from '../src/theme-palette.mjs';
const file = new URL('../src/styles.css', import.meta.url);
const begin = '/* BEGIN generated sunset tokens: src/theme-palette.mjs */';
const end = '/* END generated sunset tokens */';
const block = `${begin}\n${themeDeclarations()}\n${end}`;
const old = await readFile(file, 'utf8');
const pattern = /\/\* BEGIN generated sunset tokens: src\/theme-palette\.mjs \*\/[\s\S]*?\/\* END generated sunset tokens \*\//;
const next = pattern.test(old) ? old.replace(pattern, block) : block + '\n\n' + old;
if (process.argv.includes('--check')) {
  if (next !== old) throw new Error('CSS tokens differ from the canonical sunset palette; run node scripts/sync-theme-palette.mjs.');
} else if (next !== old) {
  await writeFile(file, next);
}
console.log('Sunset palette and CSS tokens match.');
