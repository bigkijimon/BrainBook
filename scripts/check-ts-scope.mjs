// Type-check scope regression check. `npx tsc --noEmit` is this project's baseline check, but tsc
// only sees the files tsconfig's `include` matches. A TypeScript file outside `include` is silently
// unchecked: the command still exits 0 while a regression in it ships. That is how
// scripts/voice-harness/main.tsx - the page scripts/test-voice.mjs drives - went unchecked for a
// round, because `include` listed only "src".
//
// This check asks tsc which files are actually in the program (--listFiles) and fails when any
// TypeScript source the repo ships is missing from it. A new harness added without a matching
// tsconfig entry fails here instead of nowhere.
//
// Usage: node scripts/check-ts-scope.mjs
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const TYPES = /\.(ts|tsx|mts|cts)$/;

const shipped = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : shipped(full);
  return TYPES.test(entry.name) ? [path.relative(root, full)] : [];
});

const sources = [...shipped(path.join(root, 'src')), ...shipped(path.join(root, 'scripts'))].sort();
const program = new Set(execFileSync('npx', ['tsc', '--noEmit', '--listFiles'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  .split('\n').map((line) => path.relative(root, path.resolve(line.trim()))).filter(Boolean));

const unchecked = sources.filter((file) => !program.has(file));
if (unchecked.length) {
  console.error(`FAIL npx tsc --noEmit does not cover ${unchecked.length} shipped file(s):`);
  for (const file of unchecked) console.error(`       ${file}`);
  console.error('     Add them to "include" in tsconfig.json, or they ship unchecked.');
  process.exit(1);
}
console.log(`ok   all ${sources.length} shipped TypeScript files are inside the tsc program (npx tsc --noEmit covers them)`);
