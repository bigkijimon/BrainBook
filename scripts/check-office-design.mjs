// Checks the Hermes3D office design note against the real company and the real office map.
// Read-only: every company group in SYSTEMS.md has exactly one room, every room exists in the
// Hermes3D map, and no room is given to two owners.
// Run: node scripts/check-office-design.mjs [SYSTEMS.md] [hermesHqMap.ts] [design.md]
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SYSTEMS = process.argv[2] || '/Users/yuma/Documents/ObsidianVault/Vault/SYSTEMS.md';
const MAP = process.argv[3] || '/Users/yuma/Documents/Hermes/Hermes3D/src/features/pixel-office/map/hermesHqMap.ts';
const DESIGN = process.argv[4] || fileURLToPath(new URL('../docs/hermes3d-office-design.md', import.meta.url));

// First-column cells of the table under a "## <heading>" section, header/separator skipped.
const table = (text, heading) => {
  const start = text.indexOf(heading);
  assert.ok(start >= 0, `section not found: ${heading}`);
  const out = [];
  let seen = false;
  for (const line of text.slice(start).split('\n').slice(1)) {
    if (/^#{2,3} /.test(line)) break;
    if (!line.startsWith('|')) { if (seen && out.length) break; continue; }
    seen = true;
    if (/^\|[-:| ]+\|$/.test(line)) continue;
    out.push(line.split('|').slice(1, -1).map((c) => c.trim()));
  }
  return out.slice(1); // drop the header row
};

const groupName = (cell) => cell.replace(/\s*\(.*\)$/, ''); // "AppPro (`app-dev`)" -> "AppPro"
const design = readFileSync(DESIGN, 'utf8');
const groups = table(readFileSync(SYSTEMS, 'utf8'), '## Company groups').map(([cell]) => groupName(cell));
const zones = new Set([...readFileSync(MAP, 'utf8').matchAll(/zone\("(z-[a-z0-9-]+)"/g)].map((m) => m[1]));
const groupRooms = table(design, '## 決定 1');
const sharedRooms = table(design, '## 決定 2');

assert.ok(groups.length >= 8, `expected the company groups table in SYSTEMS.md, got ${groups.length}`);
assert.ok(zones.size >= 10, `expected the Hermes3D map zones, got ${zones.size}`);

const designed = groupRooms.map(([group]) => groupName(group));
for (const group of groups) {
  const rows = designed.filter((g) => g === group).length;
  assert.equal(rows, 1, `company group ${group} has ${rows} rooms in 決定 1, expected exactly 1`);
}
for (const group of designed) assert.ok(groups.includes(group), `room for a group not in SYSTEMS.md: ${group}`);

const owners = new Map();
for (const [owner, zone] of [...groupRooms, ...sharedRooms]) {
  assert.ok(zones.has(zone), `${owner}: zone ${zone} is not in the Hermes3D map`);
  assert.ok(!owners.has(zone), `${zone} is given to both ${owners.get(zone)} and ${owner}`);
  owners.set(zone, owner);
}

console.log(`PASS ${groups.length} company groups each have one room; ${owners.size} rooms used, all in the Hermes3D map (${zones.size} zones)`);

// office-map.json (what the Office view and later Hermes3D read) must say the same as the note.
const officeMap = JSON.parse(readFileSync(fileURLToPath(new URL('../office-map.json', import.meta.url)), 'utf8'));
const mapped = new Map(officeMap.rooms.map((room) => [room.zone, room]));
for (const [owner, zone] of groupRooms) assert.equal(mapped.get(zone)?.group, groupName(owner), `office-map.json: ${zone} should be ${groupName(owner)}`);
for (const [owner, zone] of sharedRooms) assert.ok(mapped.get(zone)?.shared, `office-map.json: ${zone} (${owner}) should be a shared room`);
assert.equal(officeMap.rooms.length, owners.size, `office-map.json has ${officeMap.rooms.length} rooms, the note has ${owners.size}`);
for (const key of ['inbox', 'idle', 'gpu', ...Object.values(officeMap.teams), ...Object.values(officeMap.boards)]) {
  const id = officeMap[key] || key;
  assert.ok(officeMap.rooms.some((room) => room.id === id), `office-map.json points at a missing room: ${id}`);
}
console.log(`PASS office-map.json matches the note: ${officeMap.rooms.length} rooms, ${Object.keys(officeMap.teams).length} team lanes, ${Object.keys(officeMap.profiles).length} profile names`);
