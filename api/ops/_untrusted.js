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

module.exports = {
  FOUNDER_SOURCES,
  UNTRUSTED_BEGIN,
  UNTRUSTED_END,
  agentPendingItem,
  allowsInstruction,
  presentQueuedForAgent,
  requestsSideEffect,
};
