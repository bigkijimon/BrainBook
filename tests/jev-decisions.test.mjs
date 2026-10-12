import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JEV_CONFIDENCE_FLOOR, JEV_DECISIONS, JEV_LANE_ID, JEV_PAID_LANES, JEV_SEND_BACK_CODES, JEV_SEND_BACK_MEANING,
  ROUTER_OWN_DECISION_CONFIDENCE, formatJevSendBack, isFreeLaneId, isPaidLane, judgeJevAnswer, judgeRouterLane } from '../jev-decisions.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFile(path.join(root, file), 'utf8');
const priority = (answer) => judgeJevAnswer('task-priority', answer);
const lane = (answer) => judgeJevAnswer('worker-lane', answer);
const labelOf = (pointId) => JEV_DECISIONS.find((point) => point.id === pointId).label;
// Codes whose reason must also name the thing that failed. `no_answer` has nothing to name, and
// `over_authority` is reached both by an explicit claim (nothing to name) and by naming a paid lane,
// which the paid-lane test below checks by value rather than by shape.
const CODES_WITH_DETAIL = ['provider_refused', 'out_of_range', 'low_confidence', 'unusable_confidence'];

test('an in-contract answer is accepted and carries the value and confidence the caller needs', () => {
  const urgency = priority({ status: 'ok', priority: 'high', confidence: 0.93 });
  assert.equal(urgency.accepted, true);
  assert.equal(urgency.value, 'high');
  assert.equal(urgency.confidence, 0.93);
  assert.equal(urgency.code, null);
  assert.match(urgency.reason, /Task urgency: high \(confidence 0\.93\)/);

  const jevLane = lane({ source: 'jev', status: 'ready', worker: 'mimo', jev: { confidence: 0.8 } });
  assert.equal(jevLane.accepted, true);
  assert.equal(jevLane.value, 'mimo');
  assert.equal(jevLane.confidence, 0.8);
  assert.equal(lane({ source: 'jev', status: 'ready', worker: 'MiMo', jev: { confidence: 0.9 } }).accepted, true, 'lane ids are matched case-insensitively');
  assert.equal(lane({ source: 'jev', status: 'ready', worker: 'mimo', budget: { used_usd: 0.4, cap_usd: 1 }, jev: { confidence: 0.8 } }).accepted, true,
    'a provider reporting its own cost ledger is metadata, not a claim over authority');
  assert.equal(priority({ status: 'ok', priority: 'low', confidence: JEV_CONFIDENCE_FLOOR }).accepted, true, 'the floor itself passes');
});

test('every unusable answer is sent back with a code, its declared meaning and its fallback', () => {
  const cases = [
    [priority(null), 'no_answer'],
    [priority('high'), 'no_answer'],
    [priority({ priority: 'high', confidence: 0.9 }), 'provider_refused'],
    [priority({ status: 'budget_exhausted', priority: null }), 'provider_refused'],
    [priority({ status: 'ok', priority: 'urgent', confidence: 0.9 }), 'out_of_range'],
    [priority({ status: 'ok', priority: 'high', confidence: 0.71 }), 'low_confidence'],
    [priority({ status: 'ok', priority: 'high', confidence: 0 }), 'low_confidence'],
    [priority({ status: 'ok', priority: 'high' }), 'unusable_confidence'],
    [priority({ status: 'ok', priority: 'high', confidence: 1.4 }), 'unusable_confidence'],
    [priority({ status: 'ok', priority: 'high', confidence: -0.2 }), 'unusable_confidence'],
    [priority({ status: 'ok', priority: 'high', confidence: 'very' }), 'unusable_confidence'],
    [priority({ status: 'ok', priority: 'high', confidence: '' }), 'unusable_confidence'],
    [priority({ status: 'ok', priority: 'high', confidence: 0.9, approved: true }), 'over_authority'],
    [priority({ status: 'ok', priority: 'high', confidence: 0.9, spend: true }), 'over_authority'],
    [priority({ status: 'ok', priority: 'high', confidence: 0.9, signoff: 'yuma' }), 'over_authority'],
    [lane({ source: 'deterministic', worker: 'mimo' }), 'provider_refused'],
    [lane({ source: 'jev', worker: 'claude-code', jev: { confidence: 0.9 } }), 'over_authority'],
    [lane({ source: 'jev', worker: 'mimo' }), 'unusable_confidence'],
    [lane({ source: 'jev', status: 'ready', worker: 'a lane with spaces', jev: { confidence: 0.9 } }), 'out_of_range'],
    [lane({ source: 'jev', status: 'ready', worker: 'x'.repeat(41), jev: { confidence: 0.9 } }), 'out_of_range'],
    // A Jev-sourced answer the Router reported it did not produce. Attribution (`source`) and
    // ability-to-answer (`status`) are separate fields, so reading only `source` let the refusal
    // through and reported the empty value instead: the right verdict under the wrong reason.
    [lane({ source: 'jev', status: 'budget_exhausted', worker: null, jev: { confidence: 0.9 } }), 'provider_refused'],
    [lane({ source: 'jev', status: 'error', worker: 'mimo', jev: { confidence: 0.9 } }), 'provider_refused'],
    [lane({ source: 'jev', status: null, worker: 'mimo', jev: { confidence: 0.9 } }), 'provider_refused'],
  ];
  for (const [verdict, code] of cases) {
    assert.equal(verdict.accepted, false, `${code} must not be accepted`);
    assert.equal(verdict.code, code);
    assert.ok(JEV_SEND_BACK_CODES.includes(verdict.code), `${code} must be a declared send-back code`);
    assert.equal(verdict.value, null);
    assert.equal(verdict.confidence, null);
    assert.ok(verdict.fallback.length > 0, 'a sent-back answer must name its fallback');
    // "It explains itself" is a property of the reason, not its length: the reason must be the
    // declared meaning of the code for this point, plus the bounded detail of what failed.
    assert.ok(JEV_SEND_BACK_MEANING[code], `${code} must say what it means, or the log cannot be triaged`);
    assert.ok(verdict.reason.startsWith(`${labelOf(verdict.point)}: ${JEV_SEND_BACK_MEANING[code]}`),
      `the ${code} reason must be the declared meaning, not a hand-written sentence: ${verdict.reason}`);
    if (CODES_WITH_DETAIL.includes(code)) {
      assert.match(verdict.reason, /\([^()]*\)$/, `the ${code} reason must name what actually failed: ${verdict.reason}`);
    }
    assert.doesNotMatch(verdict.reason, /NaN|undefined/, 'reasons are owner-readable, never raw JavaScript');
  }
  // The provider sees the task, so "the reason carries no task text" has to be checked against an
  // envelope that carries it: only the offending value may reach the reason.
  assert.doesNotMatch(priority({ status: 'ok', priority: 'urgent', confidence: 0.9, title: 'fix the login bug' }).reason,
    /login/, 'a field the criteria ignore never reaches the reason');
  assert.deepEqual([...new Set(cases.map(([, code]) => code))].sort(), [...JEV_SEND_BACK_CODES].sort(),
    'every declared code must be exercised here, or the log can still meet a code this test never saw');
});

test('uncertainty and nonsense are separate codes, so a send-back log can be triaged', () => {
  const hesitant = priority({ status: 'ok', priority: 'high', confidence: 0.71 });
  assert.equal(hesitant.code, 'low_confidence');
  assert.match(hesitant.reason, /below the 0\.72 floor/, 'a real number under the floor says so');

  for (const verdict of [priority({ status: 'ok', priority: 'high' }),
    priority({ status: 'ok', priority: 'high', confidence: 1.4 }),
    priority({ status: 'ok', priority: 'high', confidence: -0.2 }),
    priority({ status: 'ok', priority: 'high', confidence: 'very' })]) {
    assert.equal(verdict.code, 'unusable_confidence', 'nothing that is a number from 0 to 1 is nonsense, not uncertainty');
    assert.ok(verdict.reason.startsWith(`Task urgency: ${JEV_SEND_BACK_MEANING.unusable_confidence} (`), verdict.reason);
  }
  assert.match(priority({ status: 'ok', priority: 'high' }).reason, /no confidence was reported/);
  assert.match(priority({ status: 'ok', priority: 'high', confidence: 'very' }).reason, /"very" is not a number/);
  assert.match(priority({ status: 'ok', priority: 'high', confidence: 1.4 }).reason, /outside 0 to 1/);
  assert.equal(priority({ status: 'ok', priority: 'high', confidence: '0.8' }).accepted, true,
    'a number the provider sent as text is still a number');
});

test('Jev may advise the repair decision but may never grant paid escalation', () => {
  const hold = judgeJevAnswer('repair-or-hold', { status: 'ok', decision: 'hold_for_owner', confidence: 0.9 });
  assert.equal(hold.accepted, true);
  assert.equal(hold.value, 'hold_for_owner');
  assert.equal(judgeJevAnswer('repair-or-hold', { status: 'ok', decision: 'retry', confidence: 0.9 }).accepted, true);

  const escalated = judgeJevAnswer('repair-or-hold', { status: 'ok', decision: 'escalate_to_claude', confidence: 0.99 });
  assert.equal(escalated.accepted, false);
  assert.equal(escalated.code, 'over_authority');
  assert.equal(escalated.fallback, 'hold_for_owner', 'the only safe fallback is to wait for the owner');

  const approval = judgeJevAnswer('repair-or-hold', { status: 'ok', decision: 'retry', confidence: 0.9, approved: true });
  assert.equal(approval.code, 'over_authority');
  assert.throws(() => judgeJevAnswer('approve-publication', { status: 'ok' }), /Unknown Jev decision point/);
});

test('Jev may name a free lane and never a paid one, in every spelling the Router uses', () => {
  for (const id of ['mimo', 'qwen', 'vision', 'hermes', 'pi', 'opencode']) {
    assert.equal(lane({ source: 'jev', status: 'ready', worker: id, jev: { confidence: 0.9 } }).accepted, true,
      `${id} is a free lane and must stay usable`);
  }
  // The app ships three ids for the paid lane: `claude` (the Router's own worker id, agent-feed.py
  // ROUTER_WORKERS), `claudecode` (the Hermes profile behind it, server.mjs ROUTER_DIRECT and
  // office-map.json profiles) and `codex` (retired, files kept). A word-boundary regex found no
  // boundary inside `claudecode` and accepted it as a free lane, so the criterion "never names a
  // paid worker" was not the criterion the code enforced. Those shipped ids are held against the rule
  // from the app's own tables in the next test; here every paid *name* is exercised, with the
  // spellings the separator-stripped match has to cover, generated rather than written out — so a
  // name added to JEV_PAID_LANES is covered on the day it is added.
  //
  // One rule, one sentence, both branches. Each branch used to write its own copy of "it named the
  // paid lane …", and a check on either branch alone would pass with either copy in place, because
  // each copy names the lane it refused. Comparing the two branches against *each other* is the
  // check that reaches the rule: if either sentence is edited alone, this fails.
  for (const name of JEV_PAID_LANES) {
    for (const id of [name, `${name}-code`, `${name}.code`, `${name}:code`, `${name}-cli`]) {
      const asAdvice = lane({ source: 'jev', status: 'ready', worker: id, jev: { confidence: 0.99 } });
      assert.equal(asAdvice.accepted, false, `${id} is a paid lane and must be sent back`);
      assert.equal(asAdvice.code, 'over_authority', `${name} is a paid name, so Jev may not advise ${id}`);
      assert.equal(asAdvice.value, null);
      assert.ok(asAdvice.reason.includes(`"${id}"`), `the reason names the paid lane that was refused: ${asAdvice.reason}`);
      const decided = judgeRouterLane({ source: 'deterministic', worker: id, status: 'ready' });
      assert.equal(decided.sendBack.code, asAdvice.code, `the Router's own decision is held to the same rule (${id})`);
      assert.equal(decided.sendBack.reason, asAdvice.reason, `both branches must log the same words about ${id}: ${decided.sendBack.reason}`);
      assert.equal(decided.worker, null, `${id} must not become the lane`);
      assert.equal(decided.confidence, null, 'a sent-back answer carries no confidence');
    }
  }
});

test('a Router lane answer is judged on both branches: Jev advice and the Router\'s own decision', () => {
  const advice = judgeRouterLane({ source: 'jev', status: 'ready', worker: 'mimo', jev: { confidence: 0.86 } });
  assert.equal(advice.sendBack, null);
  assert.equal(advice.advice, true);
  assert.equal(advice.worker, 'mimo');
  assert.equal(advice.confidence, 0.86);

  const own = judgeRouterLane({ source: 'deterministic', worker: 'hermes', status: 'ready', reason: 'stream rule' });
  assert.equal(own.sendBack, null);
  assert.equal(own.advice, false);
  assert.equal(own.worker, 'hermes');
  assert.equal(own.confidence, ROUTER_OWN_DECISION_CONFIDENCE, "a Router decision that reported no confidence falls back to the one declared number");
  assert.equal(judgeRouterLane({ source: 'deterministic', status: 'ready' }).worker, 'hermes',
    'an answer that names no usable lane falls back to the Router default lane');
  assert.equal(judgeRouterLane({ source: 'deterministic', worker: 42, status: 'ready' }).worker, 'hermes',
    'a lane that is not an id is not a lane');

  // "The Router's own decision is used as it is" is a claim README repeats, so it is checked as a
  // behaviour and not by comparing the returned number to the exported constant — that comparison
  // passes whatever the constant is, which is how a stale figure shipped unnoticed: the code replaced
  // the confidence the Router reported with a flattering 0.76, so a Router that was unsure (0.3) was
  // shown to the owner as certain while its lane was put to work.
  assert.equal(judgeRouterLane({ source: 'deterministic', worker: 'hermes', status: 'ready', confidence: 0.3 }).confidence, 0.3,
    'a confidence the Router reported is kept, below the floor or not: it is the Router\'s own decision');
  assert.equal(judgeRouterLane({ source: 'deterministic', worker: 'hermes', status: 'ready', confidence: '0.44' }).confidence, 0.44,
    'a number the Router sent as text is still a number');
  for (const nonsense of [1.4, -0.2, 'very', '', null]) {
    assert.equal(judgeRouterLane({ source: 'deterministic', worker: 'hermes', status: 'ready', confidence: nonsense }).confidence,
      ROUTER_OWN_DECISION_CONFIDENCE, `${JSON.stringify(nonsense)} is not a confidence, so no confidence is shown`);
  }
  assert.ok(ROUTER_OWN_DECISION_CONFIDENCE >= JEV_CONFIDENCE_FLOOR,
    'the fallback is shown next to a lane that is in use, so it can never read as below the floor');
  assert.ok(ROUTER_OWN_DECISION_CONFIDENCE <= 1, 'and a confidence is a number from 0 to 1');

  // Free-only execution is an invariant of the app, not of one branch of a Router answer. The branch
  // that trusts the Router's own decision used to forward whatever worker name it carried, so
  // `claudecode` reached BrainBook without ever meeting the paid-lane criterion.
  for (const [answer, code, named] of [
    [{ source: 'deterministic', worker: 'claudecode', status: 'ready' }, 'over_authority', 'claudecode'],
    [{ source: 'deterministic', worker: 'claude-code', status: 'ready' }, 'over_authority', 'claude-code'],
    [{ source: 'Jev', worker: 'codex', status: 'ready' }, 'over_authority', 'codex'],
    [{ source: 'deterministic', worker: 'a lane with spaces', status: 'ready' }, 'out_of_range', 'a lane with spaces'],
  ]) {
    const judged = judgeRouterLane(answer);
    assert.equal(judged.worker, null, `${named} must not become the lane`);
    assert.equal(judged.confidence, null);
    assert.equal(judged.sendBack.accepted, false);
    assert.equal(judged.sendBack.point, 'worker-lane');
    assert.equal(judged.sendBack.code, code, `${named} must be sent back as ${code}`);
    assert.equal(judged.sendBack.fallback, "BrainBook's deterministic stream rules");
    assert.ok(judged.sendBack.reason.startsWith(`Lane advice: ${JEV_SEND_BACK_MEANING[code]}`), judged.sendBack.reason);
    // The reason must quote the lane that was refused, spelled the way the app ships it. A reason
    // carries the bounded provider token, and that token keeps the separators a real lane id has
    // (`claude-code`, not `claude code`), so this reads the id verbatim: re-normalising it here
    // asserted a string no reason can ever contain, which is a check that never reached the rule.
    assert.ok(judged.sendBack.reason.includes(`"${named}"`),
      `the reason names the lane that was refused: ${judged.sendBack.reason}`);
  }
});

test('the paid-lane rule is held against the lane ids the app actually ships', async () => {
  // Read the shipped ids out of the app's own tables instead of restating them, so adding a paid
  // lane to the product fails here rather than becoming advice Jev was allowed to give. The
  // expectation is the rule, not a second copy of the inventory: this file once pinned
  // ['claude','claudecode','codex'] next to the same three ids in agent-feed.py, and a list written
  // twice is a list that drifts — it fails on a rename that changed nothing, and it cannot see a paid
  // lane added to a table it never learned to read. What has to hold is one thing: the rule refuses
  // every id the app ships, on both branches, and leaves every other shipped lane usable.
  const feed = await read('agent-feed.py');
  const nameMap = feed.slice(feed.indexOf('AGENT_NAME = {'), feed.indexOf('}', feed.indexOf('AGENT_NAME = {')));
  const paidNames = new Set(['Claude Code', 'Codex']);
  const shippedPaid = new Set([...nameMap.matchAll(/"([a-z0-9._-]+)":\s*"([^"]+)"/g)]
    .filter(([, , display]) => paidNames.has(display)).map(([, id]) => id));
  const profiles = JSON.parse(await read('office-map.json')).profiles;
  const fromProfiles = Object.entries(profiles).filter(([, display]) => paidNames.has(display)).map(([id]) => id);
  const fromRouterDirect = [...(await read('server.mjs'))
    .matchAll(/'Claude Code':\s*\{\s*profile:\s*'([a-z0-9._-]+)'/g)].map(([, id]) => id);
  for (const id of [...fromProfiles, ...fromRouterDirect]) shippedPaid.add(id);
  // Each reader above must still be reading something. If a display name is renamed or a table is
  // reformatted, the matching ids go to zero, every loop below iterates over nothing, and the check
  // turns green while reaching no rule at all — the failure mode this test exists to prevent.
  assert.ok(shippedPaid.size > 0 && fromProfiles.length > 0 && fromRouterDirect.length > 0,
    'the paid lane ids must still be readable out of all three tables the app ships them in');

  assert.ok(JEV_PAID_LANES.length > 0 && JEV_PAID_LANES.every((name) => /^[a-z0-9]+$/.test(name)),
    'JEV_PAID_LANES is the one list, and every entry is a bare name so the separator-stripped match is meaningful');
  for (const id of shippedPaid) {
    assert.equal(isPaidLane(id), true, `the paid-lane rule must cover the id the app ships, ${id}`);
    assert.equal(isFreeLaneId(id), false, `${id} is a paid lane, so the Router's own answer may not name it either`);
    assert.equal(lane({ source: 'jev', status: 'ready', worker: id, jev: { confidence: 0.99 } }).code, 'over_authority',
      `Jev must never name the shipped paid lane ${id}`);
    assert.equal(judgeRouterLane({ source: 'deterministic', worker: id, status: 'ready' }).sendBack.code, 'over_authority',
      `the Router's own decision is held to the same free-only rule as Jev's advice (${id})`);
  }
  // The free ids the Router ships are read from the same table, so a paid stem added to the rule
  // cannot quietly close a free lane either. The token rule is the module's own, not a copy written
  // here: a copy is a second definition of a lane id, and this one used to drop `_`, which silently
  // removed `human_review` from the very list meant to prove it usable.
  const routerWorkers = feed.slice(feed.indexOf('ROUTER_WORKERS = {'));
  const workerIds = [...routerWorkers.slice(0, routerWorkers.indexOf('}')).matchAll(/"([a-z0-9._-]+)"/g)]
    .map(([, id]) => id);
  const free = workerIds.filter((id) => !shippedPaid.has(id) && JEV_LANE_ID.test(id));
  assert.ok(free.includes('mimo'), 'the default free worker must be in the Router worker set');
  assert.ok(free.includes('human_review'),
    'human_review is a shipped free lane and must stay usable: it is the id the token rule has to let through');
  for (const id of free) {
    assert.equal(isPaidLane(id), false, `${id} ships as a free Router worker`);
    assert.equal(lane({ source: 'jev', status: 'ready', worker: id, jev: { confidence: 0.9 } }).accepted, true,
      `${id} is a free Router worker and must stay usable`);
    assert.equal(isFreeLaneId(id), true, `${id} is a free Router worker, so the Router's own answer may name it`);
  }
  // Every worker id the Router may pick is decided one way or the other by the loops above, so a
  // worker the app can route to is never a lane this file left unjudged.
  assert.deepEqual(workerIds.filter((id) => !free.includes(id) && !shippedPaid.has(id)), [],
    'a shipped Router worker id must be judged by the free loop or the paid loop, never by neither');
});

test('a send-back is logged the same way wherever it happened, and carries no answer or task text', async () => {
  const fromJev = judgeJevAnswer('worker-lane', { source: 'jev', status: 'ready', worker: 'claudecode', jev: { confidence: 0.99 } });
  const fromRouter = judgeRouterLane({ source: 'deterministic', worker: 'claudecode', status: 'ready' }).sendBack;
  // The expected line spells the format and the fallback out of the declaration. Building it from the
  // verdict's own field would pass whatever formatJevSendBack emitted, so the format was never read.
  const laneFallback = JEV_DECISIONS.find((point) => point.id === 'worker-lane').fallback;
  for (const verdict of [fromJev, fromRouter]) {
    const line = formatJevSendBack(verdict);
    assert.equal(line, `decision support sent back: worker-lane/over_authority -> ${laneFallback}`);
    assert.doesNotMatch(line, /claudecode/, 'the log line carries the code and the fallback, never the answer');
    assert.doesNotMatch(line, /confidence/, 'the log line carries no provider evidence');
  }
  assert.equal(formatJevSendBack(judgeJevAnswer('task-priority', null)),
    `decision support sent back: task-priority/no_answer -> ${JEV_DECISIONS[0].fallback}`);
  // One line, two callers: the priority classifier and the lane adapter must not each write their own.
  const card = await read('server.mjs');
  assert.match(card, /console\.log\(formatJevSendBack\(verdict\)\)/);
  assert.match(await read('worker-router.mjs'), /onSendBack = \(verdict\) => console\.log\(formatJevSendBack\(verdict\)\)/);

  // The number a routing record shows when nothing routed it was typed into three files, and nothing
  // held them together: the declaration, the record the server builds, and the client default the UI
  // uses before the server has answered. A value that moves in one place and not the others shows the
  // owner two different numbers for the same lane, and no check noticed. The server now imports the
  // declaration; the client cannot (it is a browser module and the declaration is server-side), so
  // this check is what keeps its copy honest — it fails the moment either side moves.
  assert.match(card, /ROUTER_OWN_DECISION_CONFIDENCE/, 'the routing record reads the declared number');
  assert.doesNotMatch(card, /\|\|\s*0\.76/, 'and no longer a copy of it typed by hand');
  assert.match(await read('src/App.tsx'), new RegExp(`confidence: ${ROUTER_OWN_DECISION_CONFIDENCE}\\b`),
    'the client default carries the same number the declaration owns');
});

test('the declaration is the documentation: every point, code and meaning is owner-visible', async () => {
  assert.deepEqual(JEV_DECISIONS.map((point) => point.id), ['task-priority', 'worker-lane', 'repair-or-hold']);
  for (const point of JEV_DECISIONS) {
    for (const field of ['label', 'question', 'mayAnswer', 'mayNot', 'usedBy', 'fallback']) {
      assert.ok(point[field]?.length > 3, `${point.id} needs a ${field} the owner can read`);
    }
  }
  // A code the judge can return with no meaning is a code nobody can triage, so the list of codes and
  // the table of meanings are one declaration and cannot drift apart.
  assert.deepEqual(Object.keys(JEV_SEND_BACK_MEANING).sort(), [...JEV_SEND_BACK_CODES].sort());
  assert.equal(new Set(Object.values(JEV_SEND_BACK_MEANING)).size, JEV_SEND_BACK_CODES.length,
    'two codes that mean the same thing are the same code');

  const readme = await read('README.md');
  const roster = await read('src/agentRoster.ts');
  const card = await read('server.mjs');
  for (const point of JEV_DECISIONS) assert.match(readme, new RegExp(point.id), `README must document ${point.id}`);
  for (const code of JEV_SEND_BACK_CODES) {
    assert.ok(readme.includes(code), `README must name the ${code} send-back code`);
    assert.ok(readme.includes(JEV_SEND_BACK_MEANING[code]),
      `README must carry the ${code} meaning the log shows, so the owner reads the same words`);
  }
  assert.ok(readme.includes('npm run test:criteria'), 'README must carry the command that runs these checks');
  assert.match(roster, /Jev: \{/, 'the roster keeps one Jev entry');
  assert.match(card, /jevRule\(\)/, 'the Kanban card rules are generated from the declaration');
  assert.match(card, /JEV_SEND_BACK_CODES\.join\(/, 'the card names the send-back codes from the declaration');
});
