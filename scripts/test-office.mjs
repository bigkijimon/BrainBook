// Office placement rules (office.mjs) on a fixed set of cards. Run: node scripts/test-office.mjs
// With --real, also reads the live Hermes boards read-only and prints what each room shows.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildOffice } from '../office.mjs';

const map = JSON.parse(readFileSync(fileURLToPath(new URL('../office-map.json', import.meta.url)), 'utf8'));
const now = 2_000_000_000;
const card = (id, fields) => ({ id, board: 'owner', title: id, status: 'todo', assignee: null, team: null, result: null, reason: null, createdAt: now - 3600, startedAt: null, completedAt: null, ...fields });
const office = buildOffice({
  map, now, boards: ['owner', 'movie'], profiles: ['default', 'kuro', 'stevenspielberg', 'file-editor'],
  cards: [
    card('team-app', { assignee: 'team', team: 'app-dev', status: 'running', startedAt: now - 60 }),
    card('team-acct', { assignee: 'team', team: 'accountpro', status: 'blocked', reason: '⛔ Stopped for Yuma: not approved' }),
    card('steve', { assignee: 'stevenspielberg', status: 'running', board: 'movie' }),
    card('kuro-review', { assignee: 'kuro', status: 'blocked', board: 'movie', reason: 'workflow mismatch' }),
    card('movie-orphan', { assignee: 'charref-driver', board: 'movie' }),
    card('nobody', { assignee: null }),
    card('stranger', { assignee: 'momo', board: 'soak' }),
    card('night', { assignee: 'stevenspielberg', status: 'scheduled', board: 'movie' }),
    card('old-done', { assignee: 'team', team: 'app-dev', status: 'done', completedAt: now - 8 * 86400 }),
    card('archived', { assignee: 'team', team: 'app-dev', status: 'archived' }),
    ...Array.from({ length: 7 }, (_, i) => card(`done-${i}`, { assignee: 'team', team: 'app-dev', status: 'done', result: `Result ${i}\nmore`, completedAt: now - i * 60 })),
  ],
});
const room = (id) => office.rooms.find((r) => r.id === id);
const ids = (cards) => cards.map((c) => c.id);

assert.deepEqual(ids(room('apppro').board.working), ['team-app'], 'team lane card sits in its group room');
assert.deepEqual(ids(room('accountpro').board.stopped), ['team-acct']);
assert.deepEqual(ids(room('moviepro').board.working), ['steve'], 'assignee card sits in the assignee room');
assert.deepEqual(ids(room('qa').board.stopped), ['kuro-review'], 'the reviewer sits apart from the team it checks');
assert.ok(ids(room('moviepro').board.waiting).includes('movie-orphan'), 'unknown assignee falls back to the board room');
assert.deepEqual(ids(room('hq').board.waiting).sort(), ['nobody', 'stranger'], 'unroutable cards go to the HQ inbox');
assert.ok(ids(room('gpu').board.waiting).includes('night'), 'scheduled cards also show on the GPU board');
assert.equal(office.totals.waiting, 4, 'a scheduled card copied to the GPU board is counted once');
assert.equal(room('apppro').shelf.length, 5, 'shelf keeps the newest 5');
assert.equal(room('apppro').delivered, 7, 'old done and archived cards are left out');
assert.deepEqual(ids(room('apppro').shelf), ['done-0', 'done-1', 'done-2', 'done-3', 'done-4']);
assert.equal(room('apppro').shelf[0].summary, 'Result 0\nmore', 'shelf label is the result line agent-feed.py gives');
assert.deepEqual(ids(office.desk).sort(), ['kuro-review', 'team-acct'], "every stopped card is on Yuma's desk");
assert.equal(office.desk.find((c) => c.id === 'team-acct').needsYuma, true);
assert.equal(office.desk.find((c) => c.id === 'kuro-review').needsYuma, false);
const steve = room('moviepro').agents.find((a) => a.name === 'Steve');
assert.equal(steve.state, 'working', 'working beats a scheduled card on the head');
assert.equal(steve.card.id, 'steve');
assert.equal(steve.hermes, true);
assert.equal(room('qa').agents.find((a) => a.name === 'Kuro').state, 'stopped');
assert.ok(room('idle').agents.some((a) => a.name === 'file-editor' && a.hermes), 'unplaced Hermes profiles sit in the Lounge');
assert.ok(room('hq').agents.some((a) => a.name === 'Bigkiji' && a.profiles.includes('default')));
console.log('PASS office placement: team lane, assignee, board fallback, HQ inbox, GPU copy, shelf, desk, agent heads');

// Step 4: the office follows Bigkiji's team routing (AI/router/config/teams.yaml) without editing office-map.json.
const teams = {
  'app-dev': { label: 'App Development', profiles: { tora: 'debug' } },
  accountpro: { label: 'AccountPro (Accounting)' },
  'hs-school-ops': { label: 'ClassPro', profiles: { hana: 'review', yuki: 'lesson planner' } },
  'sales-ops': { label: 'SalesPro (Sales operations)', profiles: { kai: 'sales lead' } },
};
const routed = buildOffice({
  map, now, teams, boards: ['owner'], profiles: ['default', 'pi', 'kai', 'yuki'],
  cards: [
    card('lane-pi', { assignee: 'team', team: 'app-dev', status: 'running', member: 'pi' }),
    card('lane-new', { assignee: 'team', team: 'sales-ops', status: 'running', member: 'claude' }),
    card('lane-new-wait', { assignee: 'team', team: 'sales-ops', status: 'ready' }),
    card('lane-retired', { assignee: 'team', team: 'gone-team', status: 'ready' }),
    card('bigkiji-routing', { assignee: 'default', status: 'ready' }),
  ],
});
const rroom = (id) => routed.rooms.find((r) => r.id === id);
const sales = rroom('team-sales-ops');
assert.ok(sales, 'a team Bigkiji routes to but office-map.json does not know gets its own room');
assert.equal(sales.label, 'SalesPro', 'the new room is named after the team label');
assert.equal(sales.auto, true);
assert.deepEqual(sales.teams, ['sales-ops']);
assert.deepEqual(ids(sales.board.working), ['lane-new']);
assert.deepEqual(ids(sales.board.waiting), ['lane-new-wait']);
assert.ok(sales.agents.some((a) => a.name === 'kai' && a.hermes), "a team's own Hermes profile sits in its team room, not the Lounge");
assert.ok(rroom('classpro').agents.some((a) => a.name === 'yuki'), 'a new profile added to a known team sits in that team room');
assert.ok(!rroom('classpro').agents.some((a) => a.name === 'Hana'), 'an explicit seat in office-map.json still wins (Hana reviews from QA)');
assert.ok(!rroom('idle').agents.some((a) => ['kai', 'yuki'].includes(a.name)));
assert.deepEqual(rroom('apppro').teams, ['app-dev'], 'rooms list the teams Bigkiji routes to them');
assert.equal(rroom('apppro').board.working[0].who, 'app-dev team · Pi', 'a team-lane card names the member working it now');
assert.equal(rroom('qa').agents.find((a) => a.name === 'Pi').card?.id, 'lane-pi', "the working member's head shows the team-lane card");
assert.equal(rroom('qa').agents.find((a) => a.name === 'Claude Code').card?.id, 'lane-new');
assert.ok(ids(rroom('hq').board.waiting).includes('lane-retired'), 'a card for a team that is gone goes back to Bigkiji (HQ inbox)');
assert.ok(ids(rroom('hq').board.waiting).includes('bigkiji-routing'), 'a card Bigkiji has not routed yet waits in HQ');
assert.deepEqual(routed.routing, { source: 'teams.yaml', teams: 4, auto: ['sales-ops'] });
const fallback = buildOffice({ map, now, cards: [card('t', { assignee: 'team', team: 'app-dev', status: 'running' })] });
assert.deepEqual(ids(fallback.rooms.find((r) => r.id === 'apppro').board.working), ['t'], 'without teams.yaml the office-map.json lanes still work');
assert.equal(fallback.routing.source, 'office-map.json');
console.log('PASS team routing: new team gets a room, team profiles seated, member on head, retired team back to HQ, fallback');

if (process.argv.includes('--real')) {
  const raw = JSON.parse(execFileSync('python3', [fileURLToPath(new URL('../agent-feed.py', import.meta.url)), `${os.homedir()}/.hermes`, 'cards', '7'], { encoding: 'utf8' }));
  const teams = JSON.parse(readFileSync(`${os.homedir()}/Documents/AI/router/config/teams.yaml`, 'utf8')).teams; // as /api/office reads it
  const real = buildOffice({ ...raw, teams, map });
  console.log(`REAL boards=${raw.boards.join(',')} cards=${raw.cards.length} profiles=${raw.profiles.length}`, JSON.stringify(real.totals), 'routing', JSON.stringify(real.routing));
  for (const r of real.rooms) console.log(`  ${r.label.padEnd(12)} teams=${r.teams.join(',') || '-'} agents=${r.agents.length} working=${r.board.working.length} stopped=${r.board.stopped.length} waiting=${r.board.waiting.length} shelf=${r.shelf.length}/${r.delivered}${r.board.working.map((c) => `\n    ▶ ${c.title} (${c.why}; ${c.who})`).join('')}${r.agents.filter((a) => a.card).map((a) => `\n    ${a.name}: ${a.state} · ${a.card.title.slice(0, 50)}`).join('')}`);
  console.log(`  Yuma's desk: ${real.desk.length} stopped (${real.desk.filter((c) => c.needsYuma).length} say Yuma/owner)`);
}
