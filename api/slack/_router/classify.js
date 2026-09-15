// Pure classifier for Slack Command Center tasks.
// classify({ text, source }) → routing decision. No I/O, no Slack calls.
const AGENT_REGISTRY = require('./agent-registry.json');
const SKILL_REGISTRY = require('./skill-registry.json');

const CEO_ID = 'lavaall-ceo';
const MODE_COUNCIL = 'council';

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

const COUNCIL_TOKENS = new Set([
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

const SALES_TOKENS = new Set([
  'sales', 'quote', 'crm', 'invoice', 'procurement', 'customer',
  'order', 'supplier', 'outreach',
]);
const TECHNICAL_TOKENS = new Set([
  'build', 'code', 'bug', 'deploy', 'technical', 'api', 'repo', 'ship', 'vercel',
]);
const GROWTH_TOKENS = new Set([
  'creative', 'ads', 'ad', 'ugc', 'campaign', 'brand', 'growth', 'social',
]);
const LIFECYCLE_TOKENS = new Set([
  'lifecycle', 'churn', 'onboard', 'retention', 'email', 'klaviyo', 'journey',
]);
const BRANDISH_TOKENS = new Set([
  'brand', 'creative', 'ugc', 'ads', 'ad', 'campaign', 'social',
]);
const RESEARCH_VERBS = new Set(['research', 'source', 'audit', 'qa']);

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

function isParked(id) {
  const agent = lookupAgent(id);
  return !!(agent && agent.note === 'parked');
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

function isCouncilAsk(tokens, firstToken) {
  if (COUNCIL_TOKENS.has(firstToken)) return true;
  if (tokens.some((token) => COUNCIL_TOKENS.has(token))) return true;
  for (let i = 0; i < tokens.length - 1; i += 1) {
    if (tokens[i] === 'all' && tokens[i + 1] === 'hands') return true;
  }
  return false;
}

function tokenMatches(tokens, set) {
  return tokens.some((token) => set.has(token));
}

function detectArea(tokens) {
  const has = (word) => tokens.includes(word);
  if (tokenMatches(tokens, SALES_TOKENS)) return 'sales';
  if (tokenMatches(tokens, TECHNICAL_TOKENS)) return 'technical';
  if (tokenMatches(tokens, GROWTH_TOKENS)) return 'growth';
  if (tokenMatches(tokens, LIFECYCLE_TOKENS)) return 'lifecycle';
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

function pushHelper(helpers, id) {
  const label = helperLabel(id);
  if (!helpers.includes(label)) helpers.push(label);
}

function connectedSpecialists() {
  return (AGENT_REGISTRY.agents || [])
    .filter((agent) => agent && agent.id && agent.id !== CEO_ID && agent.status === 'CONNECTED')
    .map((agent) => agent.id);
}

function councilSkills(tokens) {
  const skills = skillsForVerb('council');
  if (tokenMatches(tokens, BRANDISH_TOKENS) && !skills.includes('brand-check')) {
    skills.push('brand-check');
  }
  return skills;
}

function classify({ text, source } = {}) {
  const reasons = [];
  const cleaned = stripMentions(text);
  const tokens = tokenize(cleaned);
  const firstToken = tokens[0] || '';
  const sourceLabel = typeof source === 'string' && source ? source : 'unknown';
  const councilMode = isCouncilAsk(tokens, firstToken);

  const verbHit = detectVerb(tokens, firstToken);
  let verb = councilMode ? 'council' : verbHit.verb;
  reasons.push(`verb=${verb} via ${councilMode ? 'council' : verbHit.via}`);

  let area = detectArea(tokens);
  if (councilMode) {
    area = 'ceo';
    reasons.push('mode=council fan-out to CONNECTED specialists');
  } else if (RESEARCH_VERBS.has(verb) && area !== 'sales' && area !== 'technical') {
    area = 'ceo';
    reasons.push(`${verb} leads ${CEO_ID} unless sales/tech`);
  }
  reasons.push(`area=${area}`);

  let risk = detectRisk(tokens, verb);
  if (councilMode && risk !== 'L3' && risk !== 'L4') {
    risk = 'L2';
    reasons.push('council default risk L2');
  }
  if (!councilMode && RESEARCH_VERBS.has(verb) && risk !== 'L3' && risk !== 'L4') {
    risk = verb === 'audit' || verb === 'qa' ? 'L1' : 'L0';
    reasons.push(`${verb} stays ${risk}`);
  }
  if (risk === 'L3' || risk === 'L4') {
    reasons.push(`risk bump ${risk} from send|deploy|pay|ads|contract|secret|delete`);
  }

  const complexity = COMPLEXITY_BY_RISK[risk] || 'low';
  const helpers = [];
  const mentioned = mentionedExternalAgents(tokens);
  const specialists = connectedSpecialists();

  let leadAgent;
  if (councilMode) {
    leadAgent = CEO_ID;
    for (const id of specialists) pushHelper(helpers, id);
    reasons.push(`lead=${CEO_ID} helpers=${specialists.join(',')}`);
  } else {
    const preferredLead = leadForArea(area);
    leadAgent = preferredLead;
    if (preferredLead === 'lifecycle' && isParked('lifecycle')) {
      pushHelper(helpers, 'lifecycle');
      reasons.push('lifecycle is CONNECTED (parked); lead=lavaall-ceo');
      leadAgent = CEO_ID;
    } else if (!isConnected(leadAgent)) {
      pushHelper(helpers, leadAgent);
      reasons.push(`${leadAgent} is not CONNECTED; lead=${CEO_ID}`);
      leadAgent = CEO_ID;
    }
  }

  for (const id of mentioned) {
    pushHelper(helpers, id);
    const agent = lookupAgent(id);
    reasons.push(`${id} is ${displayStatus(agent)}`);
  }

  if (mentioned.length && !isConnected(mentioned[0]) && area === 'ceo' && verbHit.via !== 'first_token') {
    reasons.push('only unavailable agent matched; lead=lavaall-ceo');
  }

  if (leadAgent !== CEO_ID && !isConnected(leadAgent)) {
    pushHelper(helpers, leadAgent);
    reasons.push(`${leadAgent} is not CONNECTED; lead=${CEO_ID}`);
    leadAgent = CEO_ID;
  }

  const skills = councilMode ? councilSkills(tokens) : skillsForVerb(verb);
  if (!skills.length) reasons.push('no skills mapped for verb');
  reasons.push(`source=${sourceLabel}`);

  const result = {
    verb,
    area,
    complexity,
    risk,
    leadAgent,
    helperAgents: helpers,
    skills,
    reasons,
  };
  if (councilMode) result.mode = MODE_COUNCIL;
  return result;
}

module.exports = {
  AGENT_REGISTRY,
  CEO_ID,
  MODE_COUNCIL,
  SKILL_REGISTRY,
  classify,
  connectedSpecialists,
  displayStatus,
  helperLabel,
  isConnected,
  isCouncilAsk,
  lookupAgent,
  stripMentions,
};
