// Jev is advice, never a decision. This module owns every Jev answer BrainBook receives: the
// decision points, when an answer may be used (合), when it must be sent back (差し戻し) and what
// the caller falls back to. Callers pass a raw answer and read the verdict; they never repeat
// these rules. The declaration is also the documentation (README, agent roster, Kanban card
// rules), so the owner-facing words and the enforced code cannot drift apart.

export const JEV_CONFIDENCE_FLOOR = 0.72;

// A decision the Router made itself is not Jev advice, so it does not have to clear the confidence
// floor — but the figure shown for it must still be one figure, and it must never be a number nobody
// measured. So the confidence the Router reported is kept exactly as reported, and this is only the
// fallback for a decision that reported none. Exported because `server.mjs` fills in a routing
// record from this declaration instead of typing the number again, and because
// tests/jev-decisions.test.mjs holds every copy of it (this one, `server.mjs` and the client default
// in `src/App.tsx`) against this value.
export const ROUTER_OWN_DECISION_CONFIDENCE = 0.76;

// Every way an answer can come back unusable. A caller only ever has to handle accept or send-back.
export const JEV_SEND_BACK_CODES = ['no_answer', 'provider_refused', 'over_authority', 'out_of_range',
  'low_confidence', 'unusable_confidence'];

// What each code means, in the words the owner reads in the log. Uncertainty (a real number under
// the floor) and nonsense (nothing that is a number from 0 to 1) are separate codes, so a send-back
// log can be triaged instead of guessed at. Every reason is generated from this table and README
// documents the same table, so a code the judge can return without a meaning — or a meaning the
// README never shows — fails tests/jev-decisions.test.mjs.
export const JEV_SEND_BACK_MEANING = {
  no_answer: 'nothing usable came back',
  provider_refused: 'the provider did not answer',
  over_authority: 'the answer claimed a decision Jev must not make',
  out_of_range: 'the value is not an allowed answer',
  low_confidence: 'the confidence is below the floor',
  unusable_confidence: 'there is no confidence to read',
};

// The lane the Router falls back to when its own decision names none.
const DEFAULT_ROUTER_WORKER = 'hermes';

// What a lane id is allowed to look like. This is part of the interface, not an internal detail: the
// same rule answers "is this a lane id at all" on Jev's branch, on the Router's own branch, and in a
// test that has to pick which of the ids the app ships are lanes before it holds the paid-lane rule
// against them. Exported because the copy a test used to write for itself was a second definition of
// a lane, and the second definition is the one that drifts (it dropped `_`, so `human_review` was
// quietly filtered out of the check that was supposed to prove it usable). Not `/g`, so `test` on it
// carries no state between calls.
export const JEV_LANE_ID = /^[a-z0-9][a-z0-9._:-]{0,39}$/;

// The paid lanes, as one list, because a hand-written word-boundary regex was not the same set as
// the lane ids the app actually ships. The app ships three ids for the paid escalation: `claude`
// (the Router's own worker id — agent-feed.py ROUTER_WORKERS and AGENT_NAME), `claudecode` (the
// Hermes profile behind it — server.mjs ROUTER_DIRECT, office-map.json profiles) and `codex`
// (retired by the owner, files kept, still mapped so its records keep their author). `\bclaude\b`
// has no boundary inside `claudecode`, so a shipped id was accepted as a free lane. A lane id is
// paid when it *contains* a paid name once separators are dropped, so `claude-code`, `claude.code`
// and `claudecode` are all the same lane, and the bare names `claude` and `codex` cover all three
// shipped ids. Exported so a test can hold this list against the ids the app really ships, read back
// out of those tables; a new paid lane that is not here fails that test instead of slipping through
// as advice.
export const JEV_PAID_LANES = ['claude', 'codex', 'gemini', 'opus', 'sonnet', 'haiku', 'gpt',
  'chatgpt', 'paid', 'premium', 'subscription'];

const laneKey = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, '');

// Exported as the paid half of `isFreeLaneId`, and held to the same ids. A test that asks only
// `isFreeLaneId(id) === false` cannot say *why* a shipped id is paid — a malformed id and a paid
// lane are the same answer — so the predicate the rule actually runs on is part of the interface.
export const isPaidLane = (value) => typeof value === 'string'
  && JEV_PAID_LANES.some((paid) => laneKey(value).includes(paid));

// The one free-lane rule. Free-only execution is an invariant of the whole app, not of one branch of
// a Router answer, so the branch that trusts the Router's own decision is held to it too: before, a
// deterministic answer could name `claudecode` and it was forwarded unchecked, because the paid-lane
// criterion lived only on the Jev branch. Exported because a test must hold it to the lane ids the
// app really ships.
export const isFreeLaneId = (value) => typeof value === 'string'
  && JEV_LANE_ID.test(value.toLowerCase()) && !isPaidLane(value);

// One reader and one test for a confidence, wherever it was reported: a real number, a number the
// provider sent as text, or nothing at all. These were written twice — once for Jev's advice and once
// for the Router's own decision — and two readers can disagree about what counts as a confidence,
// which is the one thing the send-back codes exist to say. Locality over a restatement.
const readConfidence = (reported) => (typeof reported === 'number' ? reported
  : (typeof reported === 'string' && reported.trim() ? Number(reported) : NaN));

const isUsableConfidence = (value) => Number.isFinite(value) && value >= 0 && value <= 1;

// The confidence a Router decision is reported with. "Used as it is" has to include the number it
// reported: replacing a Router's 0.3 with a flattering constant would show the owner certainty the
// Router did not claim, and it is the very failure the floor exists to catch on the other branch.
const routerOwnDecisionConfidence = (reported) => {
  const confidence = readConfidence(reported);
  return isUsableConfidence(confidence) ? confidence : ROUTER_OWN_DECISION_CONFIDENCE;
};

// An authority claim is an affirmative statement that Jev decided, or may decide, something
// reserved to the owner. Cost and budget *reporting* is not a claim: the Router tracks the
// shared monthly ceiling itself and may echo its ledger next to a valid answer, and a blanket
// key scan turned that metadata into a send-back the owner could not act on. What actually
// constrains an accepted answer is the value field below (allowed values, bounded token, no
// paid lane name) plus the confidence floor.
const AUTHORITY_CLAIM = ['approved', 'approve', 'approval', 'authorised', 'authorized',
  'escalate', 'escalation', 'paid', 'paid_worker_execution', 'spend', 'spending', 'signoff'];

export const JEV_DECISIONS = [
  {
    id: 'task-priority',
    label: 'Task urgency',
    question: 'How urgent is this new or edited task?',
    mayAnswer: 'low, normal or high, with a confidence of at least 0.72',
    mayNot: 'It never starts work, approves anything or spends money',
    usedBy: 'POST/PUT /api/tasks, when the task has no clear deadline or blocker signal and no manual priority',
    statusField: 'status', okStatus: 'ok', valueField: 'priority', allowed: ['low', 'normal', 'high'], confidencePath: 'confidence',
    fallback: 'the configured local classifier, then BrainBook deterministic rules',
  },
  {
    id: 'worker-lane',
    label: 'Lane advice',
    question: 'Which lane should take this task?',
    mayAnswer: 'one bounded free lane id, with a confidence of at least 0.72',
    mayNot: 'It never picks the worker itself, never names a paid lane (JEV_PAID_LANES) on either branch, never approves spending',
    usedBy: 'the Router lane adapter (worker-router.mjs routeTaskLane) through judgeRouterLane: a Jev-sourced answer is judged as advice, and the Router\'s own decision is held to the same free-lane rule',
    // The Router reports attribution and ability-to-answer on separate fields: `source` says the
    // decision is Jev's advice, `status` says the Router actually produced one. Reading only
    // `source` let a refused answer ("budget_exhausted", no worker) through the refusal gate and
    // die later as an out-of-range value, so the send-back named the wrong reason.
    statusField: 'source', okStatus: 'jev', answeredBy: { field: 'status', ok: 'ready' },
    valueField: 'worker', confidencePath: 'jev.confidence',
    fallback: "BrainBook's deterministic stream rules",
  },
  {
    id: 'repair-or-hold',
    label: 'After a failed check',
    question: 'Retry the free lane, or hold for the owner?',
    mayAnswer: 'retry or hold_for_owner',
    mayNot: 'It never grants paid escalation: a failed free attempt is not spending authority',
    usedBy: 'the Bigkiji Kanban card rules; Bigkiji acts on it, BrainBook does not act on it',
    statusField: 'status', okStatus: 'ok', valueField: 'decision', allowed: ['retry', 'hold_for_owner'], confidencePath: 'confidence',
    fallback: 'hold_for_owner',
  },
];

const BY_ID = new Map(JEV_DECISIONS.map((point) => [point.id, point]));

const readPath = (answer, dotted) => dotted.split('.').reduce((node, key) => (
  node && typeof node === 'object' ? node[key] : undefined), answer);

// Reasons are logged and shown, so they carry only bounded provider tokens, never task text.
const token = (value) => (typeof value === 'string' ? value : String(value ?? ''))
  .replace(/[^\w.:@-]+/g, ' ').trim().slice(0, 40);

// One verdict shape, so every caller reads every answer the same way and the send-back log has the
// same fields whatever produced it.
const verdictFor = (point, accepted, code, reason, value = null, confidence = null) => ({
  point: point.id, accepted, code, reason, value, confidence, fallback: point.fallback,
});

// A reason is generated, never hand-written per call site: which point, what the code means, and the
// bounded detail of what actually failed. That is the whole "it explains itself" property, so a test
// can assert it instead of counting characters.
const reasonFor = (point, code, detail) =>
  `${point.label}: ${JEV_SEND_BACK_MEANING[code]}${detail ? ` (${detail})` : ''}`;

// One refusal, one sentence, both branches. Refusing a paid lane is the same rule whether Jev named
// it in its advice or the Router named it in its own decision, so it is written once here instead of
// once per branch: two copies of the sentence could drift, and a per-case "does the reason contain
// the lane id" check would pass either way, because each would still name the lane it refused.
const paidLaneVerdict = (point, value) => (isPaidLane(value)
  ? verdictFor(point, false, 'over_authority',
    reasonFor(point, 'over_authority', `it named the paid lane "${token(value)}"`))
  : null);

export const judgeJevAnswer = (pointId, answer) => {
  const point = BY_ID.get(pointId);
  if (!point) throw new Error(`Unknown Jev decision point: ${pointId}`);
  const sendBack = (code, detail) => verdictFor(point, false, code, reasonFor(point, code, detail));
  if (!answer || typeof answer !== 'object' || Array.isArray(answer)) {
    return sendBack('no_answer');
  }
  const status = answer[point.statusField];
  if (typeof status !== 'string' || status !== point.okStatus) {
    return sendBack('provider_refused', `it answered "${token(status)}" instead of "${point.okStatus}"`);
  }
  // A provider that reported it did not answer is a refusal whatever else the envelope carries, so
  // this is read before the value is judged: an empty value from a refusal is not a bad answer, it
  // is no answer. An *absent* field is not a reported refusal — the envelope simply said nothing, and
  // the value and confidence gates below judge what is there.
  if (point.answeredBy && answer[point.answeredBy.field] !== undefined
      && answer[point.answeredBy.field] !== point.answeredBy.ok) {
    return sendBack('provider_refused', `it reported "${token(answer[point.answeredBy.field])}" instead of "${point.answeredBy.ok}"`);
  }
  if (AUTHORITY_CLAIM.some((key) => Boolean(answer[key]))) {
    return sendBack('over_authority');
  }
  const value = answer[point.valueField];
  const answerText = typeof value === 'string' ? value : '';
  const paidLane = paidLaneVerdict(point, answerText);
  if (paidLane) return paidLane;
  const inRange = point.allowed ? point.allowed.includes(value) : JEV_LANE_ID.test(answerText.toLowerCase());
  if (!inRange) {
    return sendBack('out_of_range', `"${token(answerText)}" is not an allowed answer`);
  }
  // Confidence is read in two steps, because "not confident enough" and "not a confidence" are
  // different failures: a caller triaging a log needs to tell a hesitant provider from a broken one.
  const reported = readPath(answer, point.confidencePath);
  const confidence = readConfidence(reported);
  if (!isUsableConfidence(confidence)) {
    const seen = Number.isFinite(confidence) ? `confidence ${token(confidence)} is outside 0 to 1`
      : (reported === undefined || reported === null || (typeof reported === 'string' && !reported.trim())
        ? 'no confidence was reported' : `confidence "${token(reported)}" is not a number`);
    return sendBack('unusable_confidence', seen);
  }
  if (confidence < JEV_CONFIDENCE_FLOOR) {
    return sendBack('low_confidence', `confidence ${token(confidence)} is below the ${JEV_CONFIDENCE_FLOOR} floor`);
  }
  return verdictFor(point, true, null, `${point.label}: ${token(answerText)} (confidence ${confidence})`, value, confidence);
};

// The Router's lane answer, whichever branch produced it. The adapter hands over the raw answer and
// reads one result: a worker it may use, or a send-back it must log and fall back from. Both branches
// are judged here so the free-lane rule cannot be bypassed by answering as something other than Jev,
// and the paid-lane refusal is the same verdict on both (paidLaneVerdict), so the log cannot say two
// different things about one lane.
export const judgeRouterLane = (answer) => {
  const point = BY_ID.get('worker-lane');
  const usable = Boolean(answer) && typeof answer === 'object' && !Array.isArray(answer);
  if (usable && answer[point.statusField] === point.okStatus) {
    const judged = judgeJevAnswer('worker-lane', answer);
    return judged.accepted
      ? { sendBack: null, advice: true, worker: judged.value, confidence: judged.confidence }
      : { sendBack: judged, advice: true, worker: null, confidence: null };
  }
  const named = usable ? answer[point.valueField] : undefined;
  const worker = typeof named === 'string' && named.trim() ? named : DEFAULT_ROUTER_WORKER;
  const paidLane = paidLaneVerdict(point, worker);
  if (paidLane) return { sendBack: paidLane, advice: false, worker: null, confidence: null };
  if (!isFreeLaneId(worker)) {
    const code = 'out_of_range';
    const detail = `"${token(worker)}" is not a free lane id`;
    return { sendBack: verdictFor(point, false, code, reasonFor(point, code, detail)), advice: false, worker: null, confidence: null };
  }
  return { sendBack: null, advice: false, worker, confidence: routerOwnDecisionConfidence(usable ? answer.confidence : undefined) };
};

// The one line an unattended run leaves when an answer is sent back: which point, which code, which
// fallback. Both adapters print this, so the record never depends on which caller logged it, and it
// carries no task text and no provider answer.
export const formatJevSendBack = (verdict) =>
  `decision support sent back: ${verdict.point}/${verdict.code} -> ${verdict.fallback}`;
