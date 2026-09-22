// Jev-style decision envelope for Office Talk. Shadow by default.
// STATE -> VALID OPERATIONS -> VALID TARGETS -> DECISION -> POLICY GATE
// -> (existing Talk remains the executor while DECISION_ENGINE_SHADOW_MODE
// is on). This module does not send, purchase, or delete.
// Underscore prefix: not a Vercel function. No npm. Never log emails,
// raw prompts, or secrets.

const crypto = require('crypto');

const PHATIC_REPLY = 'Hi. What should we look at?';
const BLOCKED_EXTERNAL_REPLY = 'That send, purchase, or delete stays blocked until a founder approves it. I will not do it from Talk.';
const STALE_TURN_COPY = 'That turn moved before I could answer. Send it again.';
const LOG_LIMIT = 30;
const CONSEQUENTIAL = Object.freeze(['send', 'purchase', 'delete']);

const log = [];

class StaleDecisionError extends Error {
  constructor() {
    super('stale_decision');
    this.name = 'StaleDecisionError';
    this.code = 'stale_decision';
  }
}

function clip(value, max) {
  return typeof value === 'string' ? value.trim().replace(/[<>]/g, '').slice(0, max) : '';
}

function isShadowMode() {
  const raw = process.env.DECISION_ENGINE_SHADOW_MODE;
  if (raw == null || String(raw).trim() === '') return true;
  switch (String(raw).trim().toLowerCase()) {
    case '0':
    case 'false':
    case 'off':
    case 'no':
      return false;
    case '1':
    case 'true':
    case 'on':
    case 'yes':
      return true;
    default: {
      return true;
    }
  }
}

function isPhatic(text) {
  const raw = String(text || '').trim().replace(/\s+/g, ' ');
  return /^(?:hi|hello|hey|yo|howdy|good morning|good afternoon|good evening)[.!?]*$/i.test(raw);
}

function consequentialKind(text) {
  const raw = String(text || '').toLowerCase();
  if (/\b(purchase|buy)\b/.test(raw)) return 'purchase';
  if (/\bdelete\b/.test(raw)) return 'delete';
  if (/\bsend\b/.test(raw) && /\b(e-?mail|mail|message|invoice|dm)\b/.test(raw)) return 'send';
  return '';
}

function normalizeEntity(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const type = clip(value.type, 40);
  if (!type) return null;
  const entity = {
    type,
    source: clip(value.source, 40) || 'request',
  };
  const id = clip(value.id, 80);
  const name = clip(value.name, 120);
  if (id) entity.id = id;
  if (name) entity.name = name;
  return entity;
}

function businessStateVersion(store) {
  const data = store && typeof store === 'object' ? store : {};
  const goal = data.goal && typeof data.goal === 'object' ? data.goal : null;
  const payload = {
    goal: goal ? {
      title: goal.title || '',
      nextStep: goal.nextStep || '',
      definitionOfDone: goal.definitionOfDone || '',
      targetDate: goal.targetDate || '',
    } : null,
    tasks: (Array.isArray(data.tasks) ? data.tasks : []).map((task) => ({
      id: task && task.id ? String(task.id) : '',
      title: task && task.title ? String(task.title) : '',
      status: task && task.status ? String(task.status) : '',
      nextAction: task && task.nextAction ? String(task.nextAction) : '',
    })),
    notes: (Array.isArray(data.notes) ? data.notes : []).map((note) => ({
      id: note && note.id ? String(note.id) : '',
      title: note && note.title ? String(note.title) : '',
      body: note && note.body ? String(note.body) : '',
    })),
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16);
}

function fingerprintParts(snapshot) {
  const row = snapshot && typeof snapshot === 'object' ? snapshot : {};
  const entity = row.activeEntity && typeof row.activeEntity === 'object' ? row.activeEntity : {};
  return {
    threadId: String(row.threadId || ''),
    latestMessageId: String(row.latestMessageId || ''),
    latestMessageAt: String(row.latestMessageAt == null ? '' : row.latestMessageAt),
    activeEntityType: String(entity.type || ''),
    activeEntityId: String(entity.id || ''),
    businessStateVersion: String(row.businessStateVersion || ''),
  };
}

function stateFingerprint(snapshot) {
  const parts = fingerprintParts(snapshot);
  const canonical = [
    parts.threadId,
    parts.latestMessageId,
    parts.latestMessageAt,
    parts.activeEntityType,
    parts.activeEntityId,
    parts.businessStateVersion,
  ].join('\u001f');
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

function messageRefs(snapshot) {
  const messages = snapshot && Array.isArray(snapshot.messages) ? snapshot.messages : [];
  return messages.slice(-8).map((item) => ({
    id: String(item && item.id || ''),
    role: String(item && item.role || ''),
    at: Number.isFinite(item && item.at) ? item.at : 0,
  })).filter((item) => item.id);
}

function snapshotFromThread(thread, extras) {
  const extra = extras && typeof extras === 'object' ? extras : {};
  const messages = thread && Array.isArray(thread.messages) ? thread.messages : [];
  const latest = messages.length ? messages[messages.length - 1] : null;
  const activeEntity = normalizeEntity(extra.activeEntity);
  const snapshot = {
    threadId: thread && thread.id ? String(thread.id) : '',
    latestMessageId: latest && latest.id ? String(latest.id) : '',
    latestMessageAt: latest && Number.isFinite(latest.at) ? latest.at : 0,
    activeEntity,
    businessStateVersion: extra.businessStateVersion
      ? String(extra.businessStateVersion)
      : businessStateVersion(extra.store),
    messages: messages.map((item) => ({
      id: item && item.id ? String(item.id) : '',
      role: item && item.role ? String(item.role) : '',
      at: item && Number.isFinite(item.at) ? item.at : 0,
    })),
  };
  snapshot.fingerprint = stateFingerprint(snapshot);
  return snapshot;
}

function createDecisionRequest(input) {
  const source = input && typeof input === 'object' ? input : {};
  const snapshot = source.snapshot && typeof source.snapshot === 'object' ? source.snapshot : {};
  const parts = fingerprintParts(snapshot);
  const rawInput = typeof source.rawInput === 'string' ? source.rawInput : '';
  const consequential = consequentialKind(rawInput);
  const phatic = isPhatic(rawInput) && !consequential;
  const approvalIn = source.approvalContext && typeof source.approvalContext === 'object'
    ? source.approvalContext
    : {};
  const founderApproved = approvalIn.founderApproved === true;
  const allowedOperations = ['ANSWER_IN_THREAD'];
  if (phatic) allowedOperations.push('PHATIC_ACK');
  const activeEntity = normalizeEntity(snapshot.activeEntity || source.activeEntity);
  const request = {
    requestId: clip(source.requestId, 40) || crypto.randomBytes(8).toString('hex'),
    threadId: parts.threadId,
    requestedAgent: clip(source.requestedAgent, 40),
    resolvedAgent: clip(source.resolvedAgent, 40) || clip(source.requestedAgent, 40),
    rawInput,
    stateFingerprint: stateFingerprint(snapshot),
    observedAt: clip(source.observedAt, 40) || new Date().toISOString(),
    conversationWindow: messageRefs(snapshot),
    businessStateRefs: [{
      type: 'ops-store',
      id: 'lavaall-ops-v2',
      version: parts.businessStateVersion,
    }],
    allowedOperations,
    allowedTools: ['talk_reply'],
    allowedTargets: parts.threadId ? [{ type: 'thread', id: parts.threadId, source: 'request' }] : [],
    approvalContext: {
      founderApproved,
      requiredFor: CONSEQUENTIAL.slice(),
      consequential,
      externalActionsPermitted: false,
    },
  };
  const parentThreadId = clip(source.parentThreadId, 40);
  if (parentThreadId) request.parentThreadId = parentThreadId;
  const userId = clip(source.userId, 80);
  if (userId) request.userId = userId;
  if (activeEntity) request.activeEntity = activeEntity;
  return request;
}

function policyFor(operation) {
  switch (operation) {
    case 'PHATIC_ACK':
      return 'omit_store_context';
    case 'ANSWER_IN_THREAD':
      return 'production_talk';
    case 'BLOCKED_EXTERNAL':
      return 'founder_approval_required';
    default: {
      const _never = operation;
      void _never;
      return 'production_talk';
    }
  }
}

function decide(request) {
  const row = request && typeof request === 'object' ? request : {};
  const allowed = new Set(Array.isArray(row.allowedOperations) ? row.allowedOperations : []);
  const consequential = row.approvalContext && row.approvalContext.consequential;
  let operation = 'ANSWER_IN_THREAD';
  if (consequential) operation = 'BLOCKED_EXTERNAL';
  else if (allowed.has('PHATIC_ACK')) operation = 'PHATIC_ACK';
  const window = Array.isArray(row.conversationWindow) ? row.conversationWindow : [];
  const latest = window.length ? window[window.length - 1] : null;
  return {
    requestId: row.requestId || '',
    stateFingerprint: row.stateFingerprint || '',
    boundMessageId: latest && latest.id ? latest.id : '',
    operation,
    policy: policyFor(operation),
    omitStoreContext: operation === 'PHATIC_ACK',
    executeExternal: false,
  };
}

function assertFresh(decision, currentFingerprint) {
  if (!decision || decision.stateFingerprint !== currentFingerprint) {
    throw new StaleDecisionError();
  }
}

function replyBoundToMessage(decision, messageId) {
  return Boolean(decision && decision.boundMessageId && messageId && decision.boundMessageId === messageId);
}

function remember(record) {
  log.unshift(record);
  if (log.length > LOG_LIMIT) log.length = LOG_LIMIT;
  console.log(JSON.stringify(Object.assign({ type: 'DecisionEngine', event: 'observed' }, record)));
}

function pack(request, decision, discarded, stillStale) {
  const shadow = isShadowMode();
  const applicable = decision.operation === 'PHATIC_ACK' || decision.operation === 'BLOCKED_EXTERNAL';
  const applied = !shadow && !stillStale && applicable;
  const record = {
    at: new Date().toISOString(),
    requestId: request.requestId,
    threadId: request.threadId,
    agent: request.resolvedAgent || '',
    operation: decision.operation,
    policy: decision.policy,
    fingerprint: decision.stateFingerprint,
    boundMessageId: decision.boundMessageId,
    shadow,
    applied,
    discarded: Boolean(discarded),
    stale: Boolean(stillStale),
    omitStoreContext: decision.omitStoreContext === true,
    executeExternal: false,
  };
  remember(record);
  return {
    shadow,
    applied,
    discarded: Boolean(discarded),
    stale: Boolean(stillStale),
    decision,
    request,
  };
}

async function resolveFreshDecision(input) {
  const source = input && typeof input === 'object' ? input : {};
  const readSnapshot = typeof source.readSnapshot === 'function' ? source.readSnapshot : async () => ({});
  const first = await readSnapshot();
  const request = createDecisionRequest(Object.assign({}, source, { snapshot: first }));
  const decision = decide(request);
  const second = await readSnapshot();
  if (decision.stateFingerprint === stateFingerprint(second)) {
    return pack(request, decision, false, false);
  }
  const retryRequest = createDecisionRequest(Object.assign({}, source, {
    snapshot: second,
    requestId: request.requestId,
  }));
  const retry = decide(retryRequest);
  const third = await readSnapshot();
  const stillStale = retry.stateFingerprint !== stateFingerprint(third);
  return pack(retryRequest, retry, true, stillStale);
}

function authoritativeOverride(observation) {
  if (!observation || observation.shadow) return '';
  if (observation.stale) return STALE_TURN_COPY;
  if (!observation.applied || !observation.decision) return '';
  switch (observation.decision.operation) {
    case 'PHATIC_ACK':
      return PHATIC_REPLY;
    case 'BLOCKED_EXTERNAL':
      return BLOCKED_EXTERNAL_REPLY;
    case 'ANSWER_IN_THREAD':
      return '';
    default: {
      const _never = observation.decision.operation;
      void _never;
      return '';
    }
  }
}

function latestFounderText(thread, fallback) {
  const messages = thread && Array.isArray(thread.messages) ? thread.messages : [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const item = messages[i];
    if (item && item.role === 'founder' && item.text) return item.text;
  }
  return typeof fallback === 'string' ? fallback : '';
}

function recentDecisions() {
  return log.slice();
}

function resetDecisionEngine() {
  log.length = 0;
}

module.exports = {
  BLOCKED_EXTERNAL_REPLY,
  CONSEQUENTIAL,
  PHATIC_REPLY,
  STALE_TURN_COPY,
  StaleDecisionError,
  assertFresh,
  authoritativeOverride,
  businessStateVersion,
  createDecisionRequest,
  decide,
  fingerprintParts,
  isPhatic,
  isShadowMode,
  latestFounderText,
  recentDecisions,
  replyBoundToMessage,
  resetDecisionEngine,
  resolveFreshDecision,
  snapshotFromThread,
  stateFingerprint,
};
