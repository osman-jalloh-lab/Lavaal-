// Pure router for CEO Talk questions the trusted records cannot answer.
// No I/O. No new dependencies. Desk answers stay data-only queries.
// isPhaticGreeting is required lazily: _ceo_bridge calls this module from
// talkToCeo, so a top-level require of the bridge would cycle.

const { classify } = require('../slack/_router/classify');
const { formatOfficeTrustedContext } = require('./_office_context');

const DESK_LABELS = Object.freeze({
  growth: 'Growth',
  technical: 'Technical',
  sales: 'Sales',
  researchy: 'Researchy',
});

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const EXPIRE_MS = 24 * 60 * 60 * 1000;

function envFlag(name) {
  const value = String(process.env[name] || '').trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

function activeRoutingEnabled() {
  return envFlag('OPS_CEO_ACTIVE_ROUTING_ENABLED');
}

function researchyRoutingEnabled(options) {
  if (options && Object.prototype.hasOwnProperty.call(options, 'researchy')) {
    return options.researchy === true;
  }
  return envFlag('OPS_CEO_ROUTE_RESEARCHY');
}

function timeoutMs() {
  const raw = Number(process.env.OPS_CEO_QUERY_TIMEOUT_MS);
  if (Number.isFinite(raw) && raw >= 1000) return raw;
  return DEFAULT_TIMEOUT_MS;
}

function deskLabel(desk) {
  return DESK_LABELS[desk] || 'the desk';
}

function checkingCopy(label, ambiguous) {
  if (ambiguous) {
    return `Checking with ${label} — this could also be Technical, so I asked ${label}. I'll post the answer here.`;
  }
  return `Checking with ${label} — I'll post the answer here.`;
}

function timeoutCopy(label) {
  return `${label} hasn't answered yet; it will appear here when it lands.`;
}

function expireCopy(label) {
  return `That question to ${label} expired after 24 hours. Ask again if you still need it.`;
}

function answerCopy(label, text) {
  return `From ${label}: ${text}\nThat's the live note from ${label}.`;
}

function noRoute(decision, risk) {
  return {
    decision,
    desk: '',
    label: '',
    ambiguous: false,
    risk: risk || '',
    reply: '',
  };
}

function isPhatic(text) {
  const ceo = require('./_ceo_bridge');
  return typeof ceo.isPhaticGreeting === 'function' && ceo.isPhaticGreeting(text);
}

function isKitsAsk(text) {
  const body = String(text || '').toLowerCase();
  if (/\bhow many (?:kits|kids) are active\b/.test(body)) return true;
  if (/\bactive kits\b/.test(body)) return true;
  if (/\bkit count\b/.test(body)) return true;
  return false;
}

function isPreviousAsk(text) {
  const body = String(text || '');
  if (/\b(?:previous|last|prior)\s+(?:user\s+|founder\s+)?messages?\b/i.test(body)) return true;
  return /\bwhat did i (?:just )?(?:say|send|type|write)\b/i.test(body);
}

function isAssignCommand(text) {
  if (/^\/assign\b/i.test(text)) return true;
  return /\bassign(?:\s+this)?\s+to\s+researchy\b/i.test(text);
}

function riskOf(text) {
  const route = classify({ text: String(text || ''), source: 'ops-office' });
  return route && route.risk ? route.risk : '';
}

function isImperativeAction(text) {
  const body = String(text || '').trim();
  if (/^(?:please\s+)?(?:deploy|send|ship|pay|delete|destroy|wipe|publish)\b/i.test(body)) return true;
  return /\b(?:go ahead and|please)\s+(?:deploy|send|ship|pay|delete|wipe)\b/i.test(body);
}

function isStatusQuestion(text) {
  const body = String(text || '').trim();
  if (/\?/.test(body)) return true;
  if (/\bstatus\b/i.test(body)) return true;
  return /^(what|how|when|where|who|which|is|are|do|does|did|can|could|would|should)\b/i.test(body);
}

function isBlockedAction(text, risk) {
  if (risk !== 'L3' && risk !== 'L4') return false;
  if (risk === 'L4') return true;
  if (isImperativeAction(text)) return true;
  if (isStatusQuestion(text)) return false;
  return true;
}

function deskSignals(text) {
  const growthContent = /\b(starlink|landing(?:\s+pages?)?|brands?|social|ugc|copy|creatives?|content|designs?|ads?|campaigns?)\b/i.test(text);
  const site = /\b(websites?|sites?|pages?)\b/i.test(text);
  const technical = /\b(bugs?|deploys?|deployments?|pull requests?|prs?|qa|validation|specs?|specifications?|errors?|builds?|broken|crashes?|crashed)\b/i.test(text);
  const sales = /\b(customers?|quotes?|inquiries|inquiry)\b/i.test(text)
    || (/\bfollow[- ]?ups?\b/i.test(text) && /\b(bookings?|customers?|quotes?|inquiries|inquiry)\b/i.test(text));
  const researchy = /\b(sourcing|suppliers?|catalog(?:ue)?|market research|icecat)\b/i.test(text)
    || (/\bsource\b/i.test(text) && !/\bsource of\b/i.test(text));
  return { growthContent, site, technical, sales, researchy };
}

function pickDesk(text) {
  const signals = deskSignals(text);
  const growth = signals.growthContent || (signals.site && !signals.technical);
  const technical = signals.technical;
  const page = signals.site || /\b(landing|copy)\b/i.test(text);
  if (growth && technical) return { desk: 'growth', ambiguous: true };
  if (technical && !growth) return { desk: 'technical', ambiguous: false };
  if (signals.sales && growth && !page) return { desk: 'sales', ambiguous: false };
  if (signals.sales && !growth) return { desk: 'sales', ambiguous: false };
  if (growth) return { desk: 'growth', ambiguous: false };
  if (signals.researchy) return { desk: 'researchy', ambiguous: false };
  return null;
}

function isLiveDeskQuestion(text) {
  return Boolean(pickDesk(text));
}

function isOfficeTopic(text) {
  if (isKitsAsk(text) || isPreviousAsk(text)) return true;
  if (/\b(goal|open tasks?|unfinished|working on|next step|definition of done)\b/i.test(text)) return true;
  if (/\bwhat(?:'s| is| are) (?:the )?status\b/i.test(text) && !isLiveDeskQuestion(text)) return true;
  if (/\bnotes?\b/i.test(text)) return true;
  if (/\bassigns?\b|\bassignments?\b/i.test(text)) return true;
  if (/\broutines?\b|\broutine health\b/i.test(text)) return true;
  if (/\bissues?\b/i.test(text) && !/\b(site|website|page|starlink)\b/i.test(text)) return true;
  if (/\bcalendar\b|\bupcoming events?\b/i.test(text)) return true;
  if (/\b(how many bookings|pending bookings|booking count)\b/i.test(text)) return true;
  if (/\binbox\b/i.test(text)) return true;
  if (/\bfounders?(?:'s)? (?:chat|dm|messages|thread)\b/i.test(text)) return true;
  if (/\bsign[- ]?ins?\b/i.test(text)) return true;
  if (/\bprojects?\b/i.test(text) && !isLiveDeskQuestion(text)) return true;
  if (/\bmail audit\b/i.test(text)) return true;
  return false;
}

function trustedBlock(records) {
  if (!records) return '';
  if (typeof records === 'string') return records;
  if (typeof records.block === 'string') return records.block;
  try {
    return formatOfficeTrustedContext(records);
  } catch {
    return '';
  }
}

function lineAnswers(text, records) {
  if (!/\bstarlink\b/i.test(text)) return false;
  const block = trustedBlock(records);
  if (!block) return false;
  return block.split('\n').some((line) => (
    /\bstarlink\b/i.test(line) && !/not loaded|none loaded|not stored/i.test(line)
  ));
}

function recordsAnswer(text, records) {
  if (isKitsAsk(text) || isPreviousAsk(text)) return true;
  if (isLiveDeskQuestion(text)) return lineAnswers(text, records);
  return isOfficeTopic(text);
}

function routeCeoQuery(text, records, options) {
  const body = String(text || '').trim();
  if (!body) return noRoute('none');
  if (isPhatic(body)) return noRoute('phatic');
  const risk = riskOf(body);
  if (isBlockedAction(body, risk)) return noRoute('action', risk);
  if (isAssignCommand(body)) return noRoute('none');
  if (recordsAnswer(body, records)) return noRoute('records');
  const pick = pickDesk(body);
  if (!pick) return noRoute('none');
  const label = deskLabel(pick.desk);
  if (pick.desk === 'researchy' && !researchyRoutingEnabled(options)) {
    return {
      decision: 'offer',
      desk: 'researchy',
      label,
      ambiguous: false,
      risk: '',
      reply: 'Want me to ask Researchy?',
    };
  }
  return {
    decision: 'route',
    desk: pick.desk,
    label,
    ambiguous: pick.ambiguous === true,
    risk: '',
    reply: checkingCopy(label, pick.ambiguous === true),
  };
}

module.exports = {
  DESK_LABELS,
  EXPIRE_MS,
  DEFAULT_TIMEOUT_MS,
  activeRoutingEnabled,
  answerCopy,
  checkingCopy,
  deskLabel,
  expireCopy,
  researchyRoutingEnabled,
  routeCeoQuery,
  timeoutCopy,
  timeoutMs,
};
