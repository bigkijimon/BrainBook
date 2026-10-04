// Jev is advice, never a decision. This module owns every Jev answer BrainBook receives: the
// decision points, when an answer may be used (合), when it must be sent back (差し戻し) and what
// the caller falls back to. Callers pass a raw answer and read the verdict; they never repeat
// these rules. The declaration is also the documentation (README, agent roster, Kanban card
// rules), so the owner-facing words and the enforced code cannot drift apart.

export const JEV_CONFIDENCE_FLOOR = 0.72;

// A decision the Router made itself is not Jev advice and carries no confidence of its own. This is
// the value BrainBook has always shown for one; it lives here so the lane adapter reads one number
// instead of inventing its own, and it is never passed off as a confidence Jev reported.
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

const BOUNDED_TOKEN = /^[a-z0-9][a-z0-9._:-]{0,39}$/;

// The paid lanes, as one list, because a hand-written word-boundary regex was not the same set as
// the lane ids the app actually ships: the Router/BrainBook id for the paid escalation is
// `claudecode` (server.mjs ROUTER_DIRECT profile, agent-feed.py AGENT_NAME, office-map.json
// profiles), and `\bclaude\b` has no boundary inside `claudecode`, so the shipped id was accepted as
// a free lane. A lane id is paid when it *contains* a paid name once separators are dropped, so
// `claude-code`, `claude.code` and `claudecode` are all the same lane. Exported so a test can hold
// this list against the ids the app really uses; a new paid lane that is not here fails that test
// instead of slipping through as advice.
export const JEV_PAID_LANES = ['claude', 'codex', 'gemini', 'opus', 'sonnet', 'haiku', 'gpt',
  'chatgpt', 'paid', 'premium', 'subscription'];

const laneKey = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, '');
const isPaidLane = (value) => typeof value === 'string'
  && JEV_PAID_LANES.some((paid) => laneKey(value).includes(paid));

// The one free-lane rule. Free-only execution is an invariant of the whole app, not of one branch of
// a Router answer, so the branch that trusts the Router's own decision is held to it too: before, a
// deterministic answer could name `claudecode` and it was forwarded unchecked, because the paid-lane
// criterion lived only on the Jev branch. Exported because a test must hold it to the lane ids the
// app really ships.
export const isFreeLaneId = (value) => typeof value === 'string'
  && BOUNDED_TOKEN.test(value.toLowerCase()) && !isPaidLane(value);

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
  if (isPaidLane(answerText)) {
    return sendBack('over_authority', `it named the paid lane "${token(answerText)}"`);
  }
  const inRange = point.allowed ? point.allowed.includes(value) : BOUNDED_TOKEN.test(answerText.toLowerCase());
  if (!inRange) {
    return sendBack('out_of_range', `"${token(answerText)}" is not an allowed answer`);
  }
  // Confidence is read in two steps, because "not confident enough" and "not a confidence" are
  // different failures: a caller triaging a log needs to tell a hesitant provider from a broken one.
  const reported = readPath(answer, point.confidencePath);
  const confidence = typeof reported === 'number' ? reported
    : (typeof reported === 'string' && reported.trim() ? Number(reported) : NaN);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
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
// are judged here so the free-lane rule cannot be bypassed by answering as something other than Jev.
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
  if (!isFreeLaneId(worker)) {
    const code = isPaidLane(worker) ? 'over_authority' : 'out_of_range';
    const detail = isPaidLane(worker) ? `it named the paid lane "${token(worker)}"`
      : `"${token(worker)}" is not a free lane id`;
    return { sendBack: verdictFor(point, false, code, reasonFor(point, code, detail)), advice: false, worker: null, confidence: null };
  }
  return { sendBack: null, advice: false, worker, confidence: ROUTER_OWN_DECISION_CONFIDENCE };
};

// The one line an unattended run leaves when an answer is sent back: which point, which code, which
// fallback. Both adapters print this, so the record never depends on which caller logged it, and it
// carries no task text and no provider answer.
export const formatJevSendBack = (verdict) =>
  `decision support sent back: ${verdict.point}/${verdict.code} -> ${verdict.fallback}`;
