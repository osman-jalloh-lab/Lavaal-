// Queued text for box agents (CEO pending, Assign/desk wake, Slack handoff).
// The bytes are data. Only an allowlisted founder session can originate an
// instruction, and a tool or side-effect still needs a second founder confirm
// in /ops. Slack and other inbound sources stay data only. No npm. No secrets.

const { isAllowlisted, normalizeEmail } = require('./_lib');
const { classify } = require('../slack/_router/classify');

const UNTRUSTED_BEGIN = '<<<UNTRUSTED-CONTENT>>>';
const UNTRUSTED_END = '<<<END-UNTRUSTED-CONTENT>>>';

// Sources a signed-in founder session can use. Anything else is data only.
const FOUNDER_SOURCES = new Set([
  'ops-office',
  'ops-chat',
  'ops_chat',
  'ops_ceo_send',
  'ceo-assign',
  'desk-talk',
]);

// L3/L4 from the Slack risk ladder, plus tool words the ladder files under L2.
const TOOL_ACTION_RE = /\b(git\s+push|git\s+commit|force-push|shell|bash|exec|sudo|curl|wget|ssh|vercel|npm\s+publish|gh\s+(?:pr|release|secret)|gmail|post\s+to\s+slack)\b/i;

const HEADER_LINE_RE = /^(source|sender|founderAuthenticated|instruction|actionStatus|mayAct):/i;

function cleanLabel(value, max) {
  return typeof value === 'string' ? value.trim().replace(/[<>]/g, '').slice(0, max) : '';
}

function normalizeSource(value) {
  return cleanLabel(value, 40).toLowerCase();
}

function requestsSideEffect(text) {
  const body = String(text || '');
  const route = classify({ text: body, source: 'queued_text' });
  if (route && (route.risk === 'L3' || route.risk === 'L4')) return true;
  return TOOL_ACTION_RE.test(body);
}

function allowsInstruction(item) {
  const source = normalizeSource(item && item.source);
  if (!FOUNDER_SOURCES.has(source)) return false;
  if (!item || item.founderAuthenticated !== true) return false;
  const sender = normalizeEmail((item && (item.sender || item.founderEmail)) || '');
  return isAllowlisted(sender);
}

function neutralizeBody(text) {
  return String(text || '')
    .split(UNTRUSTED_BEGIN).join('[blocked-marker]')
    .split(UNTRUSTED_END).join('[blocked-marker]')
    .split('\n')
    .map((line) => (HEADER_LINE_RE.test(line.trim()) ? `quoted: ${line}` : line))
    .join('\n');
}

function presentQueuedForAgent(item) {
  const source = normalizeSource(item && item.source) || 'unknown';
  const sender = cleanLabel((item && (item.sender || item.founderEmail)) || '', 120) || 'unknown';
  const founderAuthenticated = allowsInstruction(item);
  const instruction = founderAuthenticated ? 'founder' : 'data-only';
  const actionRequested = requestsSideEffect(item && item.text);
  let actionStatus = 'none';
  let mayAct = false;
  if (actionRequested && !founderAuthenticated) {
    actionStatus = 'forbidden';
  } else if (actionRequested && item && item.founderConfirmed === true) {
    actionStatus = 'confirmed';
    mayAct = true;
  } else if (actionRequested) {
    actionStatus = 'needs_founder_confirm';
  }
  const text = [
    UNTRUSTED_BEGIN,
    `source: ${source}`,
    `sender: ${sender}`,
    `founderAuthenticated: ${founderAuthenticated ? 'yes' : 'no'}`,
    `instruction: ${instruction}`,
    `actionStatus: ${actionStatus}`,
    `mayAct: ${mayAct ? 'yes' : 'no'}`,
    neutralizeBody(item && item.text),
    UNTRUSTED_END,
  ].join('\n');
  return {
    untrusted: true,
    source,
    sender,
    founderAuthenticated,
    instruction,
    actionRequested,
    actionStatus,
    mayAct,
    text,
  };
}

function agentPendingItem(item) {
  const view = presentQueuedForAgent(item || {});
  const next = Object.assign({}, item || {}, view);
  delete next.confirmedBy;
  return next;
}

// Unconfirmed tool/side-effect asks stay in the queue until a founder
// confirms and the box completes, or the founder declines.
function isHeldAction(item) {
  if (!item || item.founderConfirmed === true) return false;
  const view = agentPendingItem(item);
  return view.actionRequested === true && view.actionStatus === 'needs_founder_confirm';
}

const SOURCE_LABELS = Object.freeze({
  'ops-office': 'Office',
  'ops-chat': 'Chat',
  ops_chat: 'Chat',
  ops_ceo_send: 'CEO Talk',
  'ceo-assign': 'Assign',
  'desk-talk': 'Desk Talk',
  slash_command: 'Slack',
});

function sourceLabel(source) {
  const key = normalizeSource(source);
  if (Object.prototype.hasOwnProperty.call(SOURCE_LABELS, key)) return SOURCE_LABELS[key];
  return key || 'Unknown';
}

function summarizeQueuedText(text, max) {
  const limit = Number.isFinite(max) && max > 8 ? Math.floor(max) : 140;
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  if (!flat) return 'Queued action';
  if (flat.length <= limit) return flat;
  return `${flat.slice(0, limit - 1)}…`;
}

function heldActionView(item, email) {
  if (!isHeldAction(item)) return null;
  const who = normalizeEmail(email);
  if (who && normalizeEmail(item.founderEmail) !== who) return null;
  return {
    messageId: cleanLabel(item.messageId, 40),
    summary: summarizeQueuedText(item.text),
    sender: cleanLabel(item.sender || item.founderEmail, 120) || 'unknown',
    source: normalizeSource(item.source) || 'unknown',
    sourceLabel: sourceLabel(item.source),
  };
}

function heldActionsForFounder(items, email) {
  return (Array.isArray(items) ? items : [])
    .map((item) => heldActionView(item, email))
    .filter(Boolean);
}

// Bearer reply bodies are ids and status only. Callers must not pass text.
function bearerStatusBody(fields) {
  const src = fields && typeof fields === 'object' ? fields : {};
  const body = {
    ok: true,
    replay: src.replay === true,
  };
  ['threadId', 'messageId', 'correlationId', 'taskId', 'status', 'assignStatus', 'lead'].forEach((key) => {
    if (typeof src[key] === 'string' && src[key]) body[key] = src[key];
  });
  if (typeof src.waiting === 'boolean') body.waiting = src.waiting;
  return body;
}

module.exports = {
  FOUNDER_SOURCES,
  UNTRUSTED_BEGIN,
  UNTRUSTED_END,
  agentPendingItem,
  allowsInstruction,
  bearerStatusBody,
  heldActionsForFounder,
  heldActionView,
  isHeldAction,
  presentQueuedForAgent,
  requestsSideEffect,
  sourceLabel,
  summarizeQueuedText,
};
