import test from 'node:test';
import assert from 'node:assert/strict';
import {LAYOUT_SOURCES} from '../scripts/source-fingerprint.mjs';
test('department glyph changes invalidate attributed menu/layout captures',()=>{
  for(const path of ['src/TeamMark.tsx','src/team-marks.mjs','src/neon-navigation.css'])assert.ok(LAYOUT_SOURCES.includes(path),`Missing actual navigation dependency ${path}`);
});
