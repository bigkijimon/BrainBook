import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JEV_CONFIDENCE_FLOOR, JEV_DECISIONS, JEV_PAID_LANES, JEV_SEND_BACK_CODES, JEV_SEND_BACK_MEANING,
  ROUTER_OWN_DECISION_CONFIDENCE, formatJevSendBack, isFreeLaneId, judgeJevAnswer, judgeRouterLane } from '../jev-decisions.mjs';

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
  // The shipped paid id is `claudecode` (server.mjs ROUTER_DIRECT profile, office-map.json
  // profiles). A word-boundary regex found no boundary inside it and accepted it as a free lane,
  // so the criterion "never names a paid worker" was not the criterion the code enforced.
  for (const id of ['claude', 'claude-code', 'claudecode', 'claude.code', 'claude:code', 'codex', 'codex-cli']) {
    const verdict = lane({ source: 'jev', status: 'ready', worker: id, jev: { confidence: 0.99 } });
    assert.equal(verdict.accepted, false, `${id} is a paid lane and must be sent back`);
    assert.equal(verdict.code, 'over_authority');
    assert.equal(verdict.value, null);
    assert.match(verdict.reason, /"[^"]*"/, 'the reason names the paid lane that was refused');
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
  assert.equal(own.confidence, ROUTER_OWN_DECISION_CONFIDENCE, "the Router's own decision carries no confidence Jev reported");
  assert.equal(judgeRouterLane({ source: 'deterministic', status: 'ready' }).worker, 'hermes',
    'an answer that names no usable lane falls back to the Router default lane');
  assert.equal(judgeRouterLane({ source: 'deterministic', worker: 42, status: 'ready' }).worker, 'hermes',
    'a lane that is not an id is not a lane');

  // Free-only execution is an invariant of the app, not of one branch of a Router answer. The branch
  // that trusts the Router's own decision used to forward whatever worker name it carried, so
  // `claudecode` reached BrainBook without ever meeting the paid-lane criterion.
  for (const [answer, code, named] of [
    [{ source: 'deterministic', worker: 'claudecode', status: 'ready' }, 'over_authority', 'claudecode'],
    [{ source: 'deterministic', worker: 'claude-code', status: 'ready' }, 'over_authority', 'claude code'],
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
    assert.ok(judged.sendBack.reason.includes(named.replace(/[^A-Za-z0-9]+/g, ' ')),
      `the reason names the lane that was refused: ${judged.sendBack.reason}`);
  }
});

test('the paid-lane rule is held against the lane ids the app actually ships', async () => {
  // Read the shipped ids out of the app's own tables instead of restating them, so adding a paid
  // lane to the product fails here rather than becoming advice Jev was allowed to give.
  const feed = await read('agent-feed.py');
  const nameMap = feed.slice(feed.indexOf('AGENT_NAME = {'), feed.indexOf('}', feed.indexOf('AGENT_NAME = {')));
  const paidNames = new Set(['Claude Code', 'Codex']);
  const shippedPaid = new Set([...nameMap.matchAll(/"([a-z0-9._-]+)":\s*"([^"]+)"/g)]
    .filter(([, , display]) => paidNames.has(display)).map(([id]) => id));
  const profiles = JSON.parse(await read('office-map.json')).profiles;
  for (const [id, display] of Object.entries(profiles)) if (paidNames.has(display)) shippedPaid.add(id);
  for (const id of (await read('server.mjs')).matchAll(/'Claude Code':\s*\{\s*profile:\s*'([a-z0-9._-]+)'/g)) shippedPaid.add(id[1]);

  assert.deepEqual([...shippedPaid].sort(), ['claude', 'claudecode', 'codex'],
    'the shipped paid lane ids changed, so the criteria in jev-decisions.mjs must change with them');
  assert.ok(JEV_PAID_LANES.length > 0 && JEV_PAID_LANES.every((name) => /^[a-z0-9]+$/.test(name)),
    'JEV_PAID_LANES is the one list, and every entry is a bare name so the separator-stripped match is meaningful');
  for (const id of shippedPaid) {
    assert.equal(lane({ source: 'jev', status: 'ready', worker: id, jev: { confidence: 0.99 } }).code, 'over_authority',
      `Jev must never name the shipped paid lane ${id}`);
    assert.equal(isFreeLaneId(id), false, `${id} is a paid lane, so the Router's own answer may not name it either`);
    assert.equal(judgeRouterLane({ source: 'deterministic', worker: id, status: 'ready' }).sendBack.code, 'over_authority',
      `the Router's own decision is held to the same free-only rule as Jev's advice (${id})`);
  }
  // The free ids the Router ships are read from the same table, so a paid stem added to the rule
  // cannot quietly close a free lane either.
  const routerWorkers = feed.slice(feed.indexOf('ROUTER_WORKERS = {'));
  const free = [...routerWorkers.slice(0, routerWorkers.indexOf('}')).matchAll(/"([a-z0-9._-]+)"/g)]
    .map(([id]) => id).filter((id) => !shippedPaid.has(id) && /^[a-z0-9][a-z0-9._:-]{0,39}$/.test(id));
  assert.ok(free.includes('mimo'), 'the default free worker must be in the Router worker set');
  for (const id of free) {
    assert.equal(lane({ source: 'jev', status: 'ready', worker: id, jev: { confidence: 0.9 } }).accepted, true,
      `${id} is a free Router worker and must stay usable`);
    assert.equal(isFreeLaneId(id), true, `${id} is a free Router worker, so the Router's own answer may name it`);
  }
});

test('a send-back is logged the same way wherever it happened, and carries no answer or task text', async () => {
  const fromJev = judgeJevAnswer('worker-lane', { source: 'jev', status: 'ready', worker: 'claudecode', jev: { confidence: 0.99 } });
  const fromRouter = judgeRouterLane({ source: 'deterministic', worker: 'claudecode', status: 'ready' }).sendBack;
  for (const verdict of [fromJev, fromRouter]) {
    const line = formatJevSendBack(verdict);
    assert.equal(line, `decision support sent back: worker-lane/over_authority -> ${verdict.fallback}`);
    assert.doesNotMatch(line, /claudecode/, 'the log line carries the code and the fallback, never the answer');
    assert.doesNotMatch(line, /confidence/, 'the log line carries no provider evidence');
  }
  assert.equal(formatJevSendBack(judgeJevAnswer('task-priority', null)),
    `decision support sent back: task-priority/no_answer -> ${JEV_DECISIONS[0].fallback}`);
  // One line, two callers: the priority classifier and the lane adapter must not each write their own.
  assert.match(await read('server.mjs'), /console\.log\(formatJevSendBack\(verdict\)\)/);
  assert.match(await read('worker-router.mjs'), /onSendBack = \(verdict\) => console\.log\(formatJevSendBack\(verdict\)\)/);
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
