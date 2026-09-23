// Jev-style decision envelope for Office Talk. Shadow by default.
// STATE -> VALID OPERATIONS -> VALID TARGETS -> DECISION -> POLICY GATE
// -> (existing Talk remains the executor while DECISION_ENGINE_SHADOW_MODE
// is on). Routing and capability choices are logged and compared. They
// replace the Talk reply only when DECISION_ENGINE_ROUTING_PREVIEW is set
// off Production. This module does not send, purchase, delete, or open tasks.
// Underscore prefix: not a Vercel function. No npm. Never log emails,
// raw prompts, or secrets.

const crypto = require('crypto');

const PHATIC_REPLY = 'Hi. What should we look at?';
const BLOCKED_EXTERNAL_REPLY = 'That send, purchase, or delete stays blocked until a founder approves it. I will not do it from Talk.';
const STALE_TURN_COPY = 'That turn moved before I could answer. Send it again.';
const BLOCKED_CAPABILITY_REPLY = 'That request is outside this desk\'s tools.';
const ASK_TECH_CONTEXT_REPLY = 'Technical & QA needs the device model and what should change before a configuration review.';
const ASK_CLARIFY_REPLY = 'Name the customer or lead first. This desk will not invent one.';
const LOG_LIMIT = 30;
const CONSEQUENTIAL = Object.freeze(['send', 'purchase', 'delete']);

// Talk ids from api/ops/_office.js TALK_AGENT_IDS. `ceo` is an alias only.
const DESK_IDS = Object.freeze([
  'lavaall-ceo',
  'researchy',
  'sales',
  'growth',
  'technical',
  'lifecycle',
]);

const DESK_NAMES = Object.freeze({
  'lavaall-ceo': 'LAVAALL CEO',
  researchy: 'Researchy',
  sales: 'Sales',
  growth: 'Growth',
  technical: 'Technical & QA',
  lifecycle: 'Lifecycle & Klaviyo',
});

const AGENT_CAPABILITIES = Object.freeze({
  'lavaall-ceo': Object.freeze([
    'prioritize',
    'delegate',
    'review',
    'approve_recommendation',
    'strategy',
  ]),
  researchy: Object.freeze([
    'web_research',
    'source_comparison',
    'market_research',
    'supplier_research',
  ]),
  sales: Object.freeze([
    'customer_followup',
    'quote_draft',
    'pipeline_review',
  ]),
  growth: Object.freeze([
    'campaign_analysis',
    'creative_analysis',
    'marketing_research',
  ]),
  technical: Object.freeze([
    'code_audit',
    'security_review',
    'technical_troubleshooting',
  ]),
  lifecycle: Object.freeze([
    'email_flow',
    'klaviyo_journey',
    'retention_review',
  ]),
});

const AGENT_TOOLS = Object.freeze({
  'lavaall-ceo': Object.freeze(['talk_reply', 'delegate_task', 'review_artifact']),
  researchy: Object.freeze(['talk_reply', 'web_research', 'source_comparison']),
  sales: Object.freeze(['talk_reply', 'quote_draft', 'customer_followup_draft']),
  growth: Object.freeze(['talk_reply', 'campaign_draft', 'creative_draft']),
  technical: Object.freeze(['talk_reply', 'code_audit', 'security_review']),
  lifecycle: Object.freeze(['talk_reply', 'journey_draft']),
});

const DENIED_TOOLS = Object.freeze([
  'send_sales_email',
  'purchase',
  'delete',
  'book_meeting',
  'web_weather',
]);

const RESEARCH_SOURCE_IDS = Object.freeze([
  'web_research',
  'source_comparison',
  'market_research',
  'supplier_research',
]);

const OPERATION_TOOLS = Object.freeze({
  PHATIC_ACK: Object.freeze(['talk_reply']),
  ANSWER_IN_THREAD: Object.freeze([
    'talk_reply',
    'quote_draft',
    'customer_followup_draft',
    'campaign_draft',
    'creative_draft',
    'journey_draft',
    'code_audit',
    'security_review',
    'review_artifact',
  ]),
  RESEARCH: Object.freeze(['web_research', 'source_comparison']),
  ROUTE_TO_TECHNICAL: Object.freeze(['talk_reply', 'delegate_task']),
  ROUTE_TO_LIFECYCLE: Object.freeze(['talk_reply', 'delegate_task']),
  ROUTE_TO_RESEARCHY: Object.freeze(['talk_reply', 'delegate_task']),
  ROUTE_TO_SALES: Object.freeze(['talk_reply', 'delegate_task']),
  ROUTE_TO_GROWTH: Object.freeze(['talk_reply', 'delegate_task']),
  ROUTE_TASK: Object.freeze(['talk_reply', 'delegate_task']),
  DELEGATE: Object.freeze(['delegate_task', 'talk_reply']),
  BLOCKED: Object.freeze([]),
  BLOCKED_EXTERNAL: Object.freeze([]),
  ASK_FOR_MISSING_TECH_CONTEXT: Object.freeze(['talk_reply']),
  ASK_CLARIFY: Object.freeze(['talk_reply']),
  FOLLOW_UP: Object.freeze(['customer_followup_draft', 'talk_reply']),
  REVIEW: Object.freeze(['review_artifact', 'talk_reply']),
  PRIORITIZE: Object.freeze(['talk_reply']),
});

const ROUTING_PREVIEW_OPS = Object.freeze([
  'ROUTE_TO_TECHNICAL',
  'ROUTE_TO_LIFECYCLE',
  'ROUTE_TO_RESEARCHY',
  'ROUTE_TO_SALES',
  'ROUTE_TO_GROWTH',
  'ROUTE_TASK',
  'DELEGATE',
  'BLOCKED',
  'ASK_FOR_MISSING_TECH_CONTEXT',
  'ASK_CLARIFY',
]);

const HANDOFF_OPS = Object.freeze([
  'DELEGATE',
  'RESEARCH',
  'ROUTE_TASK',
  'ROUTE_TO_TECHNICAL',
  'ROUTE_TO_LIFECYCLE',
  'ROUTE_TO_RESEARCHY',
  'ROUTE_TO_SALES',
  'ROUTE_TO_GROWTH',
]);

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

function canonicalAgent(value) {
  const raw = clip(String(value || ''), 40).toLowerCase();
  if (raw === 'ceo') return 'lavaall-ceo';
  return DESK_IDS.indexOf(raw) === -1 ? '' : raw;
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

function routingPreviewEnabled() {
  if (String(process.env.VERCEL_ENV || '').trim().toLowerCase() === 'production') return false;
  const raw = process.env.DECISION_ENGINE_ROUTING_PREVIEW;
  if (raw == null || String(raw).trim() === '') return false;
  switch (String(raw).trim().toLowerCase()) {
    case '1':
    case 'true':
    case 'on':
    case 'yes':
      return true;
    case '0':
    case 'false':
    case 'off':
    case 'no':
      return false;
    default: {
      return false;
    }
  }
}

function isPhatic(text) {
  const raw = String(text || '').trim().replace(/\s+/g, ' ');
  const desk = '(?:lavaall-ceo|researchy|sales|growth|technical|lifecycle|ceo)';
  const greeting = '(?:hi|hello|hey|yo|howdy|good morning|good afternoon|good evening)';
  return new RegExp(`^${greeting}(?:\\s+${desk})?[.!?]*$`, 'i').test(raw);
}

function consequentialKind(text) {
  const raw = String(text || '').toLowerCase();
  if (/\b(purchase|buy)\b/.test(raw)) return 'purchase';
  if (/\bdelete\b/.test(raw)) return 'delete';
  if (/\bsend\b/.test(raw) && /\b(e-?mail|mail|message|invoice|dm)\b/.test(raw)) return 'send';
  return '';
}

function isRouterConfig(text) {
  return /\bcisco\b/.test(text) || (/\brouter\b/.test(text) && /\b(configur|set ?up)\b/.test(text));
}

function isSecurityAudit(text) {
  return /\b(security audit|audit website security)\b/.test(text)
    || (/\baudit\b/.test(text) && /\b(code|website|security)\b/.test(text))
    || (/\bsecurity\b/.test(text) && /\b(code|website|vulnerab)\b/.test(text));
}

function isEmailFlow(text) {
  return /\b(email flows?|customer email|klaviyo)\b/.test(text);
}

function isFollowUp(text) {
  return /\bfollow[- ]?up\b/.test(text) && /\b(customer|lead|pipeline)\b/.test(text);
}

function isSellDecision(text) {
  return /\bshould we sell\b/.test(text)
    || /\bwhether we should sell\b/.test(text)
    || (/\bstarlink\b/.test(text) && /\b(sell|whether)\b/.test(text));
}

function isResearchAsk(text) {
  return /\bresearch\b/.test(text) || /\bdistribution options\b/.test(text);
}

function isRevenueAssertion(text) {
  return /\$\s?\d/.test(text) || /\brevenue\b/.test(text) || /\bmade\s+\$/.test(text);
}

function classifyDeskIntent(agentId, text) {
  const agent = canonicalAgent(agentId);
  const lower = String(text || '').toLowerCase();
  if (consequentialKind(text)) {
    return { operation: 'BLOCKED_EXTERNAL', reason: 'consequential', targetAgent: '' };
  }
  if (isPhatic(text)) {
    return { operation: 'PHATIC_ACK', reason: 'phatic', targetAgent: '' };
  }
  if (/\bweather\b/.test(lower)) {
    return { operation: 'BLOCKED', reason: 'outside_capability', targetAgent: '' };
  }
  if (isRevenueAssertion(lower)) {
    return { operation: 'BLOCKED', reason: 'revenue_assertion_denied', targetAgent: '' };
  }
  if (isRouterConfig(lower)) {
    if (agent === 'technical') {
      return { operation: 'ASK_FOR_MISSING_TECH_CONTEXT', reason: 'missing_tech_context', targetAgent: 'technical' };
    }
    return { operation: 'ROUTE_TO_TECHNICAL', reason: 'capability_mismatch', targetAgent: 'technical' };
  }
  if (isSecurityAudit(lower)) {
    if (agent === 'technical') {
      return { operation: 'ANSWER_IN_THREAD', reason: 'in_capability', targetAgent: 'technical' };
    }
    return { operation: 'ROUTE_TO_TECHNICAL', reason: 'capability_mismatch', targetAgent: 'technical' };
  }
  if (isEmailFlow(lower)) {
    if (agent === 'lifecycle') {
      return { operation: 'ANSWER_IN_THREAD', reason: 'in_capability', targetAgent: 'lifecycle' };
    }
    return { operation: 'ROUTE_TO_LIFECYCLE', reason: 'capability_mismatch', targetAgent: 'lifecycle' };
  }
  if (isFollowUp(lower)) {
    return { operation: 'FOLLOW_UP', reason: 'customer_followup', targetAgent: '' };
  }
  if (agent === 'lavaall-ceo' && (isSellDecision(lower) || isResearchAsk(lower))) {
    return { operation: 'DELEGATE', reason: 'specialist_research', targetAgent: 'researchy' };
  }
  if (agent === 'researchy' && isResearchAsk(lower)) {
    return { operation: 'RESEARCH', reason: 'in_capability', targetAgent: 'researchy' };
  }
  return { operation: 'ANSWER_IN_THREAD', reason: 'in_capability', targetAgent: agent };
}

function eligibleLeadTargets(extras) {
  const list = extras && Array.isArray(extras.eligibleLeads) ? extras.eligibleLeads : [];
  const seen = new Set();
  const out = [];
  list.forEach((row) => {
    if (out.length >= 20) return;
    const id = clip(typeof row === 'string' ? row : (row && row.id), 80);
    if (!id || seen.has(id)) return;
    seen.add(id);
    const target = { type: 'lead', id, source: 'eligible' };
    const name = clip(row && row.name, 120);
    if (name) target.name = name;
    out.push(target);
  });
  return out;
}

function allowedOperationsFor(agentId, text, extras) {
  const intent = classifyDeskIntent(agentId, text);
  const lower = String(text || '').toLowerCase();
  switch (intent.operation) {
    case 'PHATIC_ACK':
      return ['ANSWER_IN_THREAD', 'PHATIC_ACK'];
    case 'BLOCKED_EXTERNAL':
      return ['ANSWER_IN_THREAD'];
    case 'BLOCKED':
      return ['BLOCKED'];
    case 'ROUTE_TO_TECHNICAL':
      return isRouterConfig(lower)
        ? ['ROUTE_TO_TECHNICAL', 'ASK_FOR_MISSING_TECH_CONTEXT', 'RESEARCH', 'BLOCKED']
        : ['ROUTE_TO_TECHNICAL', 'BLOCKED'];
    case 'ASK_FOR_MISSING_TECH_CONTEXT':
      return ['ASK_FOR_MISSING_TECH_CONTEXT', 'ANSWER_IN_THREAD', 'RESEARCH', 'BLOCKED'];
    case 'ROUTE_TO_LIFECYCLE':
      return ['ROUTE_TO_LIFECYCLE', 'BLOCKED'];
    case 'FOLLOW_UP':
      return eligibleLeadTargets(extras).length ? ['FOLLOW_UP', 'BLOCKED'] : ['ASK_CLARIFY', 'BLOCKED'];
    case 'DELEGATE':
      return ['DELEGATE', 'RESEARCH', 'ROUTE_TASK', 'REVIEW', 'BLOCKED'];
    case 'RESEARCH':
      return ['RESEARCH', 'BLOCKED'];
    case 'ANSWER_IN_THREAD':
      return ['ANSWER_IN_THREAD'];
    default: {
      const _never = intent.operation;
      void _never;
      return ['ANSWER_IN_THREAD'];
    }
  }
}

function toolsFor(agentId, operations) {
  const ops = Array.isArray(operations) ? operations : [];
  if (ops.indexOf('PHATIC_ACK') !== -1) return ['talk_reply'];
  const owned = AGENT_TOOLS[canonicalAgent(agentId)] || [];
  const needed = new Set();
  ops.forEach((op) => {
    const row = OPERATION_TOOLS[op] || [];
    row.forEach((tool) => needed.add(tool));
  });
  return owned.filter((tool) => needed.has(tool) && DENIED_TOOLS.indexOf(tool) === -1);
}

function agentAllows(agentId, capability) {
  const list = AGENT_CAPABILITIES[canonicalAgent(agentId)] || [];
  return list.indexOf(capability) !== -1;
}

function isRegisteredAgent(agentId) {
  return Boolean(canonicalAgent(agentId));
}

function isRegisteredTool(agentId, tool) {
  const name = clip(tool, 80);
  if (!name || DENIED_TOOLS.indexOf(name) !== -1) return false;
  const owned = AGENT_TOOLS[canonicalAgent(agentId)] || [];
  return owned.indexOf(name) !== -1;
}

function researchTaskId(rawInput) {
  const goal = String(rawInput || '').trim().replace(/\s+/g, ' ').toLowerCase();
  return crypto.createHash('sha256').update(goal).digest('hex').slice(0, 16);
}

function researchTargets(agentId, rawInput) {
  const caps = AGENT_CAPABILITIES[canonicalAgent(agentId)] || [];
  const sources = RESEARCH_SOURCE_IDS.filter((id) => caps.indexOf(id) !== -1).map((id) => ({
    type: 'research',
    id,
    source: 'registry',
  }));
  return [{
    type: 'research_task',
    id: researchTaskId(rawInput),
    source: 'request',
  }].concat(sources);
}

function agentTarget(agentId) {
  const id = canonicalAgent(agentId);
  if (!id) return null;
  return { type: 'agent', id, source: 'registry' };
}

function targetsForOperation(operation, request) {
  const row = request && typeof request === 'object' ? request : {};
  const agent = canonicalAgent(row.resolvedAgent || row.requestedAgent);
  const intent = row.intent && typeof row.intent === 'object'
    ? row.intent
    : classifyDeskIntent(agent, row.rawInput);
  const threadId = clip(row.threadId, 40);
  const thread = threadId ? [{ type: 'thread', id: threadId, source: 'request' }] : [];
  switch (operation) {
    case 'ROUTE_TO_TECHNICAL':
      return [agentTarget('technical')];
    case 'ROUTE_TO_LIFECYCLE':
      return [agentTarget('lifecycle')];
    case 'ROUTE_TO_RESEARCHY':
      return [agentTarget('researchy')];
    case 'ROUTE_TO_SALES':
      return [agentTarget('sales')];
    case 'ROUTE_TO_GROWTH':
      return [agentTarget('growth')];
    case 'ROUTE_TASK':
    case 'DELEGATE': {
      const target = agentTarget(intent.targetAgent);
      if (!target || target.id === agent) return [];
      return [target];
    }
    case 'RESEARCH':
      return researchTargets(agent, row.rawInput);
    case 'FOLLOW_UP':
      return eligibleLeadTargets(row);
    case 'PHATIC_ACK':
    case 'ANSWER_IN_THREAD':
    case 'ASK_FOR_MISSING_TECH_CONTEXT':
    case 'ASK_CLARIFY':
    case 'REVIEW':
    case 'PRIORITIZE':
      return thread;
    case 'BLOCKED':
    case 'BLOCKED_EXTERNAL':
      return [];
    default: {
      const _never = operation;
      void _never;
      return [];
    }
  }
}

function targetIsRegistered(target) {
  if (!target || typeof target !== 'object') return false;
  switch (target.type) {
    case 'agent':
      return canonicalAgent(target.id) === target.id;
    case 'research':
      return RESEARCH_SOURCE_IDS.indexOf(target.id) !== -1;
    case 'research_task':
      return /^[a-f0-9]{16}$/.test(String(target.id || ''));
    case 'lead':
      return Boolean(target.id) && target.source === 'eligible';
    case 'thread':
      return Boolean(target.id);
    default: {
      return false;
    }
  }
}

function acceptTarget(operation, target, allowedTargets) {
  if (!targetIsRegistered(target)) return false;
  const list = Array.isArray(allowedTargets) ? allowedTargets : [];
  return list.some((row) => row
    && row.type === target.type
    && row.id === target.id
    && (!row.operation || row.operation === operation));
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

function buildDelegationLineage(input) {
  const source = input && typeof input === 'object' ? input : {};
  const entity = normalizeEntity(source.originatingEntity || source.activeEntity);
  const lineage = {
    parentRequestId: clip(source.parentRequestId, 40),
    parentThreadId: clip(source.parentThreadId, 40),
    childTaskId: clip(source.childTaskId || source.taskId, 40),
    delegatedGoal: clip(source.delegatedGoal, 400),
  };
  if (entity) lineage.originatingEntity = entity;
  return lineage;
}

function lineagePresent(lineage) {
  if (!lineage || typeof lineage !== 'object') return false;
  return Boolean(
    lineage.parentRequestId
    || lineage.parentThreadId
    || lineage.childTaskId
    || lineage.delegatedGoal
    || lineage.originatingEntity
  );
}

function lineageField(record, key) {
  if (!record || typeof record !== 'object') return '';
  if (record[key]) return clip(record[key], key === 'delegatedGoal' ? 400 : 80);
  if (record.delegation && record.delegation[key]) {
    return clip(record.delegation[key], key === 'delegatedGoal' ? 400 : 80);
  }
  return '';
}

function delegationAttaches(task, child) {
  const parentRequest = lineageField(task, 'parentRequestId');
  const childParent = lineageField(child, 'parentRequestId');
  if (parentRequest && childParent && parentRequest !== childParent) return false;
  const parentThread = lineageField(task, 'parentThreadId');
  const childThread = lineageField(child, 'parentThreadId');
  if (parentThread && childThread && parentThread !== childThread) return false;
  const taskId = clip(task && task.id, 40);
  const childTask = lineageField(child, 'childTaskId') || clip(child && child.taskId, 40);
  if (taskId && childTask && taskId !== childTask) return false;
  const goalA = lineageField(task, 'delegatedGoal');
  const goalB = lineageField(child, 'delegatedGoal');
  if (goalA && goalB && goalA !== goalB) return false;
  return true;
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
  const resolvedAgent = canonicalAgent(source.resolvedAgent) || canonicalAgent(source.requestedAgent);
  const requestedAgent = canonicalAgent(source.requestedAgent) || clip(source.requestedAgent, 40);
  const intent = classifyDeskIntent(resolvedAgent, rawInput);
  const menuContext = {
    eligibleLeads: source.eligibleLeads,
    resolvedAgent,
    requestedAgent,
    rawInput,
    threadId: parts.threadId,
    intent,
  };
  const allowedOperations = allowedOperationsFor(resolvedAgent, rawInput, menuContext);
  const allowedTools = toolsFor(resolvedAgent, allowedOperations);
  const allowedTargets = [];
  allowedOperations.forEach((operation) => {
    targetsForOperation(operation, menuContext).forEach((target) => {
      if (!targetIsRegistered(target)) return;
      allowedTargets.push(Object.assign({ operation }, target));
    });
  });
  const approvalIn = source.approvalContext && typeof source.approvalContext === 'object'
    ? source.approvalContext
    : {};
  const founderApproved = approvalIn.founderApproved === true;
  const activeEntity = normalizeEntity(snapshot.activeEntity || source.activeEntity);
  const requestId = clip(source.requestId, 40) || crypto.randomBytes(8).toString('hex');
  const request = {
    requestId,
    threadId: parts.threadId,
    requestedAgent,
    resolvedAgent,
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
    allowedTools,
    allowedTargets,
    approvalContext: {
      founderApproved,
      requiredFor: CONSEQUENTIAL.slice(),
      consequential,
      externalActionsPermitted: false,
    },
  };
  const callerLineage = buildDelegationLineage({
    parentRequestId: source.parentRequestId,
    parentThreadId: source.parentThreadId,
    childTaskId: source.childTaskId,
    delegatedGoal: source.delegatedGoal,
    originatingEntity: source.originatingEntity || activeEntity,
  });
  const handoff = HANDOFF_OPS.indexOf(intent.operation) !== -1;
  if (lineagePresent(callerLineage) || handoff) {
    request.delegation = buildDelegationLineage({
      parentRequestId: callerLineage.parentRequestId || requestId,
      parentThreadId: callerLineage.parentThreadId || parts.threadId,
      childTaskId: callerLineage.childTaskId,
      delegatedGoal: callerLineage.delegatedGoal || (handoff ? rawInput : ''),
      originatingEntity: callerLineage.originatingEntity || activeEntity,
    });
  }
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
    case 'BLOCKED':
      return 'capability_denied';
    case 'RESEARCH':
      return 'research_in_scope';
    case 'ROUTE_TASK':
    case 'ROUTE_TO_TECHNICAL':
    case 'ROUTE_TO_RESEARCHY':
    case 'ROUTE_TO_SALES':
    case 'ROUTE_TO_GROWTH':
    case 'ROUTE_TO_LIFECYCLE':
      return 'route_registered_agent';
    case 'ASK_FOR_MISSING_TECH_CONTEXT':
    case 'ASK_CLARIFY':
      return 'ask_clarify';
    case 'FOLLOW_UP':
      return 'eligible_lead_only';
    case 'DELEGATE':
      return 'delegate_registered_agent';
    case 'PRIORITIZE':
    case 'REVIEW':
      return 'ceo_review';
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
  const intent = classifyDeskIntent(row.resolvedAgent || row.requestedAgent, row.rawInput);
  let operation = 'ANSWER_IN_THREAD';
  if (consequential) operation = 'BLOCKED_EXTERNAL';
  else if (allowed.has('PHATIC_ACK')) operation = 'PHATIC_ACK';
  else if (intent.operation && allowed.has(intent.operation)) operation = intent.operation;
  else if (allowed.has('ASK_CLARIFY')) operation = 'ASK_CLARIFY';
  else if (allowed.has('BLOCKED') && !allowed.has('ANSWER_IN_THREAD')) operation = 'BLOCKED';
  else if (allowed.has('ANSWER_IN_THREAD')) operation = 'ANSWER_IN_THREAD';
  else if (allowed.has('BLOCKED')) operation = 'BLOCKED';
  const menu = (Array.isArray(row.allowedTargets) ? row.allowedTargets : [])
    .filter((target) => target && target.operation === operation && targetIsRegistered(target));
  let chosen = menu[0] || null;
  if (!chosen && (operation.indexOf('ROUTE') === 0 || operation === 'DELEGATE' || operation === 'FOLLOW_UP')) {
    operation = 'BLOCKED';
    chosen = null;
  }
  return {
    requestId: row.requestId || '',
    stateFingerprint: row.stateFingerprint || '',
    boundMessageId: (Array.isArray(row.conversationWindow) && row.conversationWindow.length
      ? row.conversationWindow[row.conversationWindow.length - 1].id
      : '') || '',
    operation,
    policy: policyFor(operation),
    omitStoreContext: operation === 'PHATIC_ACK',
    executeExternal: false,
    targetId: chosen ? chosen.id : '',
    targetType: chosen ? chosen.type : '',
    routeTo: chosen && chosen.type === 'agent' ? chosen.id : '',
    reason: intent.reason,
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

function routingReply(decision) {
  const op = decision && decision.operation;
  const name = DESK_NAMES[decision && decision.routeTo] || '';
  switch (op) {
    case 'ROUTE_TO_TECHNICAL':
      return 'This belongs with Technical & QA. Hand it to that desk.';
    case 'ROUTE_TO_LIFECYCLE':
      return 'Customer email flows belong with Lifecycle & Klaviyo.';
    case 'ROUTE_TO_RESEARCHY':
      return 'This belongs with Researchy.';
    case 'ROUTE_TO_SALES':
      return 'This belongs with Sales.';
    case 'ROUTE_TO_GROWTH':
      return 'This belongs with Growth.';
    case 'ROUTE_TASK':
      return name ? `This belongs with ${name}.` : BLOCKED_CAPABILITY_REPLY;
    case 'DELEGATE':
      return `I would ask ${name || 'a registered desk'} to take this, then synthesize here. No task was opened.`;
    case 'BLOCKED':
      return BLOCKED_CAPABILITY_REPLY;
    case 'ASK_FOR_MISSING_TECH_CONTEXT':
      return ASK_TECH_CONTEXT_REPLY;
    case 'ASK_CLARIFY':
      return ASK_CLARIFY_REPLY;
    case 'RESEARCH':
    case 'REVIEW':
    case 'PRIORITIZE':
    case 'FOLLOW_UP':
    case 'ANSWER_IN_THREAD':
    case 'PHATIC_ACK':
    case 'BLOCKED_EXTERNAL':
      return '';
    default: {
      const _never = op;
      void _never;
      return '';
    }
  }
}

function pack(request, decision, discarded, stillStale) {
  const shadow = isShadowMode();
  const preview = routingPreviewEnabled();
  const previewCopy = routingReply(decision);
  const routingApplied = preview && !stillStale && Boolean(previewCopy) && ROUTING_PREVIEW_OPS.indexOf(decision.operation) !== -1;
  const applicable = decision.operation === 'PHATIC_ACK' || decision.operation === 'BLOCKED_EXTERNAL';
  const applied = routingApplied || (!shadow && !stillStale && applicable);
  const record = {
    at: new Date().toISOString(),
    requestId: request.requestId,
    threadId: request.threadId,
    agent: request.resolvedAgent || '',
    operation: decision.operation,
    policy: decision.policy,
    fingerprint: decision.stateFingerprint,
    boundMessageId: decision.boundMessageId,
    targetId: decision.targetId || '',
    targetType: decision.targetType || '',
    routeTo: decision.routeTo || '',
    reason: decision.reason || '',
    shadow,
    routingPreview: preview,
    applied,
    shadowDisagreement: shadow && !applied && ROUTING_PREVIEW_OPS.indexOf(decision.operation) !== -1,
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
  if (!observation || !observation.decision) return '';
  if (observation.stale) return observation.shadow ? '' : STALE_TURN_COPY;
  const previewCopy = routingReply(observation.decision);
  if (
    routingPreviewEnabled()
    && previewCopy
    && ROUTING_PREVIEW_OPS.indexOf(observation.decision.operation) !== -1
  ) {
    return previewCopy;
  }
  if (observation.shadow || !observation.applied) return '';
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
  AGENT_CAPABILITIES,
  AGENT_TOOLS,
  ASK_CLARIFY_REPLY,
  ASK_TECH_CONTEXT_REPLY,
  BLOCKED_CAPABILITY_REPLY,
  BLOCKED_EXTERNAL_REPLY,
  CONSEQUENTIAL,
  DENIED_TOOLS,
  DESK_IDS,
  DESK_NAMES,
  PHATIC_REPLY,
  STALE_TURN_COPY,
  StaleDecisionError,
  acceptTarget,
  agentAllows,
  assertFresh,
  authoritativeOverride,
  buildDelegationLineage,
  businessStateVersion,
  canonicalAgent,
  classifyDeskIntent,
  createDecisionRequest,
  decide,
  delegationAttaches,
  fingerprintParts,
  isPhatic,
  isRegisteredAgent,
  isRegisteredTool,
  isShadowMode,
  latestFounderText,
  lineagePresent,
  recentDecisions,
  replyBoundToMessage,
  researchTaskId,
  resetDecisionEngine,
  resolveFreshDecision,
  routingPreviewEnabled,
  routingReply,
  snapshotFromThread,
  stateFingerprint,
  targetIsRegistered,
};
