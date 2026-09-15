// Pure classifier for Slack Command Center tasks.
// classify({ text, source }) → routing decision. No I/O, no Slack calls.
const AGENT_REGISTRY = require('./agent-registry.json');
const SKILL_REGISTRY = require('./skill-registry.json');

const CEO_ID = 'lavaall-ceo';

const VERB_ALIASES = Object.freeze({
  research: 'research',
  source: 'source',
  sourcing: 'source',
  build: 'build',
  code: 'build',
  bug: 'build',
  audit: 'audit',
  qa: 'qa',
  spec: 'spec',
  tickets: 'tickets',
  ticket: 'tickets',
  brand: 'brand',
  creative: 'brand',
  ugc: 'brand',
  handoff: 'handoff',
  security: 'security',
  ship: 'ship',
  deploy: 'ship',
  council: 'council',
  decision: 'decision',
  decide: 'decision',
  grill: 'council',
  route: 'handoff',
  quote: 'quote',
  crm: 'crm',
  sales: 'sales',
  draft: 'draft',
  send: 'send',
  pay: 'pay',
  ads: 'ads',
  ad: 'ads',
  campaign: 'ads',
  contract: 'contract',
  secret: 'secret',
  secrets: 'secret',
  delete: 'delete',
});

const COMPLEXITY_BY_RISK = Object.freeze({
  L0: 'low',
  L1: 'low',
  L2: 'medium',
  L3: 'high',
  L4: 'high',
});

const agentsById = new Map(
  (AGENT_REGISTRY.agents || []).map((agent) => [agent.id, agent]),
);

function stripMentions(text) {
  return String(text || '').replace(/<@[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokenize(text) {
  return stripMentions(text)
    .toLowerCase()
    .split(/[^a-z0-9-]+/)
    .filter(Boolean);
}

function lookupAgent(id) {
  return agentsById.get(id) || null;
}

function isConnected(id) {
  const agent = lookupAgent(id);
  return !!(agent && agent.status === 'CONNECTED');
}

function displayStatus(agent) {
  if (!agent) return 'NOT CONNECTED';
  if (agent.status === 'CONNECTED') return 'CONNECTED';
  if (agent.status === 'NOT_INVOKEABLE') return 'NOT_INVOKEABLE';
  return 'NOT CONNECTED';
}

function helperLabel(id) {
  const agent = lookupAgent(id);
  const status = displayStatus(agent);
  if (status === 'CONNECTED') return id;
  return `${id} (${status})`;
}

function skillsForVerb(verb) {
  const list = SKILL_REGISTRY.byVerb && SKILL_REGISTRY.byVerb[verb];
  return Array.isArray(list) ? list.slice() : [];
}

function detectVerb(tokens, firstToken) {
  if (firstToken && VERB_ALIASES[firstToken]) {
    return { verb: VERB_ALIASES[firstToken], via: 'first_token' };
  }
  for (const token of tokens) {
    if (VERB_ALIASES[token]) {
      return { verb: VERB_ALIASES[token], via: 'keyword' };
    }
  }
  return { verb: 'handoff', via: 'default' };
}

function detectArea(tokens) {
  const has = (word) => tokens.includes(word);
  if (tokens.some((t) => t === 'sales' || t === 'quote' || t === 'crm' || t === 'invoice' || t === 'procurement' || t === 'customer')) {
    return 'sales';
  }
  if (tokens.some((t) => t === 'build' || t === 'code' || t === 'bug' || t === 'deploy' || t === 'technical' || t === 'api' || t === 'repo' || t === 'ship')) {
    return 'technical';
  }
  if (tokens.some((t) => t === 'creative' || t === 'ads' || t === 'ad' || t === 'ugc' || t === 'campaign' || t === 'brand' || t === 'growth')) {
    return 'growth';
  }
  if (tokens.some((t) => t === 'lifecycle' || t === 'churn' || t === 'onboard' || t === 'retention')) {
    return 'lifecycle';
  }
  if (has('pay') || has('contract')) return 'sales';
  return 'ceo';
}

function detectRisk(tokens, verb) {
  const has = (re) => tokens.some((t) => re.test(t));
  if (has(/^(secret|secrets|credential|password|delete|destroy|wipe)$/)) return 'L4';
  if (has(/^(send|deploy|pay|payment|ads|ad|campaign|contract)$/)) return 'L3';
  if (verb === 'secret' || verb === 'delete') return 'L4';
  if (verb === 'send' || verb === 'ship' || verb === 'pay' || verb === 'ads' || verb === 'contract') return 'L3';
  if (verb === 'research' || verb === 'source' || verb === 'draft') return 'L0';
  if (verb === 'audit' || verb === 'qa' || verb === 'spec' || verb === 'tickets') return 'L1';
  if (verb === 'build' || verb === 'council' || verb === 'decision' || verb === 'handoff' || verb === 'brand') return 'L2';
  if (verb === 'quote' || verb === 'crm' || verb === 'sales') return 'L0';
  return 'L1';
}

function leadForArea(area) {
  switch (area) {
    case 'sales':
      return 'sales';
    case 'technical':
      return 'technical';
    case 'growth':
      return 'growth';
    case 'lifecycle':
      return 'lifecycle';
    case 'ceo':
      return CEO_ID;
    default: {
      const _exhaustive = area;
      void _exhaustive;
      return CEO_ID;
    }
  }
}

function mentionedExternalAgents(tokens) {
  const found = [];
  const add = (id) => {
    if (!found.includes(id)) found.push(id);
  };
  const joined = tokens.join(' ');
  if (/\bclaude-slack-assistant\b|\bslack-assistant\b/.test(joined)) add('claude-slack-assistant');
  else if (/\bclaude\b/.test(joined)) add('claude-api');
  if (/\bchatgpt\b|\bopenai\b/.test(joined)) add('chatgpt-api');
  if (/\bgrok\b|\bxai\b/.test(joined)) add('grok-xai-api');
  return found;
}

function classify({ text, source } = {}) {
  const reasons = [];
  const cleaned = stripMentions(text);
  const tokens = tokenize(cleaned);
  const firstToken = tokens[0] || '';
  const sourceLabel = typeof source === 'string' && source ? source : 'unknown';

  const verbHit = detectVerb(tokens, firstToken);
  const verb = verbHit.verb;
  reasons.push(`verb=${verb} via ${verbHit.via}`);

  const area = detectArea(tokens);
  reasons.push(`area=${area}`);

  let risk = detectRisk(tokens, verb);
  if ((verb === 'research' || verb === 'draft' || verb === 'audit' || verb === 'qa' || verb === 'source')
    && risk !== 'L3' && risk !== 'L4') {
    risk = verb === 'audit' || verb === 'qa' ? 'L1' : 'L0';
    reasons.push(`${verb} stays ${risk}`);
  }
  if (risk === 'L3' || risk === 'L4') {
    reasons.push(`risk bump ${risk} from send|deploy|pay|ads|contract|secret|delete`);
  }

  const complexity = COMPLEXITY_BY_RISK[risk] || 'low';
  const preferredLead = leadForArea(area);
  const helpers = [];

  const mentioned = mentionedExternalAgents(tokens);
  for (const id of mentioned) {
    helpers.push(helperLabel(id));
    const agent = lookupAgent(id);
    reasons.push(`${id} is ${displayStatus(agent)}`);
  }

  let leadAgent = preferredLead;
  if (!isConnected(leadAgent)) {
    helpers.push(helperLabel(leadAgent));
    reasons.push(`${leadAgent} is not CONNECTED; lead=${CEO_ID}`);
    leadAgent = CEO_ID;
  }

  if (mentioned.length && !isConnected(mentioned[0]) && area === 'ceo' && verbHit.via !== 'first_token') {
    // Only-unavailable match: keep CEO lead (already set) and helpers labeled NOT CONNECTED.
    reasons.push('only unavailable agent matched; lead=lavaall-ceo');
  }

  const lifecycle = lookupAgent('lifecycle');
  if (leadAgent === 'lifecycle' && lifecycle && lifecycle.note === 'parked') {
    reasons.push('lifecycle is CONNECTED (parked)');
  }

  const skills = skillsForVerb(verb);
  if (!skills.length) reasons.push('no skills mapped for verb');
  reasons.push(`source=${sourceLabel}`);

  return {
    verb,
    area,
    complexity,
    risk,
    leadAgent,
    helperAgents: helpers,
    skills,
    reasons,
  };
}

module.exports = {
  AGENT_REGISTRY,
  CEO_ID,
  SKILL_REGISTRY,
  classify,
  displayStatus,
  helperLabel,
  isConnected,
  lookupAgent,
  stripMentions,
};
