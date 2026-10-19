import test from 'node:test';
import assert from 'node:assert/strict';
const marks = await import('../src/team-marks.mjs').catch(() => null);

test('each of nine canonical departments has a distinct meaningful mark', () => {
  assert.ok(marks?.TEAM_MARKS, 'department mark system is missing');
  const ids = ['app-dev','accountpro','hs-school-ops','investment','igataya-web','movie','marketing','blog','securitypro'];
  assert.deepEqual(Object.keys(marks.TEAM_MARKS).sort(), ids.sort());
  assert.equal(new Set(Object.values(marks.TEAM_MARKS).map(x=>x.glyph)).size,9);
  assert.equal(marks.markFor('movie-pro').name,'MovieAgent');
  assert.equal(marks.markFor('securitypro').glyph,'ShieldCheck');
  assert.equal(marks.markFor('future-department').name,'future-department');
});
