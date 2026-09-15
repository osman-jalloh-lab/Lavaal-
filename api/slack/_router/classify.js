// Pure classifier for Slack Command Center tasks.
// classify({ text, source }) → routing decision. No I/O, no Slack calls.
const AGENT_REGISTRY = require('./agent-registry.json');
const SKILL_REGISTRY = require('./skill-registry.json');

const CEO_ID = 'lavaall-ceo';
const MODE_COUNCIL = 'council';
const GROK_SPECIALIST_IDS = Object.freeze(['sales', 'technical', 'lifecycle', 'growth']);
const NEVER_LEAD_IDS = Object.freeze([
  'claude-api',
  'chatgpt-api',
  'grok-xai-api',
  'claude-slack-assistant',
]);
const COUNCIL_TOKENS = Object.freeze([
  'council',
  'deliberate',
  'debate',
  'everyone',
  'specialists',
  'team',
  'all-hands',
  'allhands',
  'grill',
]);
const COUNCIL_SKILLS = Object.freeze(['grill-founder', 'research-primary', 'decision-log']);

const VERB_ALIASES = Object.freeze({
  research: 'research',
  source: 'source',
  sourcing: 'source',
  build: 'build',
  code: 'build',
  bug: 'build',
  vercel: 'build',
  audit: 'audit',
  qa: 'qa',
  spec: 'spec',
  tickets: 'tickets',
  ticket: 'tickets',
  brand: 'brand',
  creative: 'brand',
  ugc: 'brand',
  social: 'brand',
  handoff: 'handoff',
  security: 'security',
  ship: 'ship',
  deploy: 'ship',
  council: 'council',
  decision: 'decision',
  decide: 'decision',
  grill: 'council',
  deliberate: 'council',
  debate: 'council',
  everyone: 'council',
  specialists: 'council',
  team: 'council',
  'all-hands': 'council',
  allhands: 'council',
  route: 'handoff',
  quote: 'quote',
  crm: 'crm',
  sales: 'sales',
  order: 'quote',
  customer: 'crm',
  supplier: 'sales',
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

const SALES_AREA_TOKENS = Object.freeze([
  'sales', 'quote', 'crm', 'invoice', 'procurement', 'customer', 'supplier', 'order', 'pay', 'contract',
]);
const SALES_CLEAR_TOKENS = Object.freeze([
  'sales', 'quote', 'crm', 'invoice', 'procurement', 'customer', 'order',
]);
const TECH_AREA_TOKENS = Object.freeze([
  'build', 'code', 'bug', 'deploy', 'technical', 'api', 'repo', 'ship', 'vercel',
]);
const GROWTH_AREA_TOKENS = Object.freeze([
  'creative', 'ads', 'ad', 'ugc', 'campaign', 'brand', 'growth', 'social',
]);
const LIFECYCLE_AREA_TOKENS = Object.freeze([
  'lifecycle', 'churn', 'onboard', 'retention', 'email', 'klaviyo', 'journey',
]);
const RESEARCHY_VERBS = Object.freeze(['research', 'source', 'audit', 'qa']);

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

function hasNonEmptyEnv(name) {
  const value = process.env[name];
  return typeof value === 'string' && value.trim() !== '';
}

function envConnectedId(id) {
  if (id === 'claude-api' && hasNonEmptyEnv('ANTHROPIC_API_KEY')) return true;
  if (id === 'chatgpt-api' && hasNonEmptyEnv('OPENAI_API_KEY')) return true;
  return false;
}

function isConnected(id) {
  if (envConnectedId(id)) return true;
  const agent = lookupAgent(id);
  return !!(agent && agent.status === 'CONNECTED');
}

function displayStatus(agent) {
  if (!agent) return 'NOT CONNECTED';
  if (envConnectedId(agent.id) || agent.status === 'CONNECTED') return 'CONNECTED';
  if (agent.status === 'NOT_INVOKEABLE') return 'NOT_INVOKEABLE';
  return 'NOT CONNECTED';
}

function helperLabel(id) {
  const agent = lookupAgent(id);
  const status = displayStatus(agent);
  if (status === 'CONNECTED') return id;
  return `${id} (${status})`;
}

function addHelper(helpers, label) {
  if (!label || helpers.includes(label)) return;
  helpers.push(label);
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

function tokenHas(tokens, list) {
  return tokens.some((t) => list.includes(t));
}

function isCouncilAsk(tokens, firstToken) {
  if (firstToken && COUNCIL_TOKENS.includes(firstToken)) return true;
  if (tokenHas(tokens, COUNCIL_TOKENS)) return true;
  for (let i = 0; i < tokens.length - 1; i += 1) {
    if (tokens[i] === 'all' && tokens[i + 1] === 'hands') return true;
  }
  return false;
}

function detectArea(tokens, verb) {
  let area = 'ceo';
  if (tokenHas(tokens, SALES_AREA_TOKENS)) area = 'sales';
  else if (tokenHas(tokens, TECH_AREA_TOKENS)) area = 'technical';
  else if (tokenHas(tokens, GROWTH_AREA_TOKENS)) area = 'growth';
  else if (tokenHas(tokens, LIFECYCLE_AREA_TOKENS)) area = 'lifecycle';

  if (RESEARCHY_VERBS.includes(verb)) {
    if (area === 'sales' && tokenHas(tokens, SALES_CLEAR_TOKENS)) return 'sales';
    if (area === 'technical') return 'technical';
    return 'ceo';
  }
  return area;
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

function listCouncilHelpers() {
  const helpers = [];
  for (const id of GROK_SPECIALIST_IDS) {
    addHelper(helpers, isConnected(id) ? id : helperLabel(id));
  }
  if (isConnected('claude-api')) addHelper(helpers, 'claude-api');
  if (isConnected('chatgpt-api')) addHelper(helpers, 'chatgpt-api');
  return helpers;
}

function clampCouncilRisk(risk) {
  if (risk === 'L3' || risk === 'L4') return risk;
  if (risk === 'L0') return 'L1';
  return risk === 'L1' || risk === 'L2' ? risk : 'L2';
}

function classify({ text, source } = {}) {
  const reasons = [];
  const cleaned = stripMentions(text);
  const tokens = tokenize(cleaned);
  const firstToken = tokens[0] || '';
  const sourceLabel = typeof source === 'string' && source ? source : 'unknown';
  const mentioned = mentionedExternalAgents(tokens);

  if (isCouncilAsk(tokens, firstToken)) {
    const area = detectArea(tokens, 'council');
    let risk = clampCouncilRisk(detectRisk(tokens, 'council'));
    reasons.push('verb=council via council_mode');
    reasons.push(`area=${area}`);
    reasons.push('mode=council');
    if (risk === 'L3' || risk === 'L4') {
      reasons.push(`risk bump ${risk} from send|deploy|pay|ads|contract|secret|delete`);
    } else {
      reasons.push(`council default risk ${risk}`);
    }

    const helperAgents = listCouncilHelpers();
    for (const id of mentioned) {
      addHelper(helperAgents, helperLabel(id));
      const agent = lookupAgent(id);
      reasons.push(`${id} is ${displayStatus(agent)}`);
    }

    const skills = skillsForVerb('council');
    if (!skills.length) reasons.push('no skills mapped for verb');
    reasons.push(`source=${sourceLabel}`);

    return {
      verb: 'council',
      area,
      complexity: COMPLEXITY_BY_RISK[risk] || 'medium',
      risk,
      leadAgent: CEO_ID,
      helperAgents,
      skills: skills.length ? skills : COUNCIL_SKILLS.slice(),
      reasons,
      mode: MODE_COUNCIL,
    };
  }

  const verbHit = detectVerb(tokens, firstToken);
  const verb = verbHit.verb;
  reasons.push(`verb=${verb} via ${verbHit.via}`);

  const area = detectArea(tokens, verb);
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
  const helpers = [];

  for (const id of mentioned) {
    addHelper(helpers, helperLabel(id));
    const agent = lookupAgent(id);
    reasons.push(`${id} is ${displayStatus(agent)}`);
  }

  const preferredLead = leadForArea(area);
  let leadAgent = preferredLead;
  if (area === 'lifecycle') {
    addHelper(helpers, helperLabel('lifecycle'));
    reasons.push('lifecycle is helper; lead=lavaall-ceo');
    leadAgent = CEO_ID;
  } else if (!isConnected(leadAgent) || NEVER_LEAD_IDS.includes(leadAgent)) {
    addHelper(helpers, helperLabel(leadAgent));
    reasons.push(`${leadAgent} is not CONNECTED; lead=${CEO_ID}`);
    leadAgent = CEO_ID;
  }

  if (mentioned.length && !isConnected(mentioned[0]) && area === 'ceo' && verbHit.via !== 'first_token') {
    reasons.push('only unavailable agent matched; lead=lavaall-ceo');
  }

  const lifecycle = lookupAgent('lifecycle');
  if (helpers.includes('lifecycle') && lifecycle && lifecycle.note === 'parked') {
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
  COUNCIL_SKILLS,
  GROK_SPECIALIST_IDS,
  MODE_COUNCIL,
  NEVER_LEAD_IDS,
  SKILL_REGISTRY,
  classify,
  displayStatus,
  helperLabel,
  isConnected,
  isCouncilAsk,
  lookupAgent,
  stripMentions,
};
