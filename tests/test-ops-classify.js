// Pure /ops classifier and status helpers. Run with plain node.
const {
  AGENT_REGISTRY,
  COUNCIL_SKILLS,
  GROK_SPECIALIST_IDS,
  MODE_COUNCIL,
  classify,
  isConnected,
} = require('../api/ops/_router/classify.js');
const { STATUSES, needsApproval, isStatus } = require('../api/ops/_router/status.js');

const results = [];
function check(name, cond) { results.push({ name, pass: !!cond }); }

function run() {
  const originalAnthropic = process.env.ANTHROPIC_API_KEY;
  const originalOpenAI = process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;

  // --- Task classification ---
  {
    const sales = classify({ text: 'quote fiber for Accra', source: 'ops_chat' });
    check('classify sales → sales lead', sales.leadAgent === 'sales' && sales.area === 'sales' && sales.verb === 'quote');
    check('classify sales risk stays L0–L1', sales.risk === 'L0' || sales.risk === 'L1');
    check('classify sales maps quote/crm/sales skills', sales.skills.includes('quote') && sales.skills.includes('crm') && sales.skills.includes('sales'));
  }
  {
    const tech = classify({ text: 'build a failing test for the importer bug', source: 'ops_chat' });
    check('classify tech → technical lead', tech.leadAgent === 'technical' && tech.area === 'technical' && tech.verb === 'build');
    check('classify build is L0–L2', tech.risk === 'L0' || tech.risk === 'L1' || tech.risk === 'L2');
    check('classify build does not require approval', needsApproval(tech.risk) === false);
  }
  {
    const growth = classify({ text: 'creative ugc for the phones category', source: 'ops_chat' });
    check('classify growth → growth lead', growth.leadAgent === 'growth' && growth.area === 'growth');
    check('classify creative/ugc stays below L3', needsApproval(growth.risk) === false);
  }
  {
    const ads = classify({ text: 'ads campaign for facebook', source: 'ops_chat' });
    check('classify ads → growth L3 gate', ads.leadAgent === 'growth' && ads.area === 'growth' && ads.risk === 'L3' && needsApproval(ads.risk) === true);
  }
  {
    const l3 = classify({ text: 'deploy production', source: 'ops_chat' });
    check('classify deploy → L3 technical gate', l3.risk === 'L3' && l3.leadAgent === 'technical' && needsApproval(l3.risk) === true);
  }
  {
    const l4 = classify({ text: 'delete production secrets', source: 'ops_chat' });
    check('classify secret/delete → L4', l4.risk === 'L4' && needsApproval(l4.risk) === true);
  }
  {
    const research = classify({ text: 'research competitor pricing in Accra', source: 'ops_chat' });
    check('classify research stays L0–L1', research.verb === 'research' && (research.risk === 'L0' || research.risk === 'L1'));
  }
  {
    const unavailable = classify({ text: 'use claude to research the Accra market', source: 'ops_chat' });
    check('UNAVAILABLE is never the lead', unavailable.leadAgent === 'lavaall-ceo' && isConnected(unavailable.leadAgent));
    check('UNAVAILABLE helper labeled NOT CONNECTED', unavailable.helperAgents.some((h) => String(h).includes('claude-api') && String(h).includes('NOT CONNECTED')));
    check('UNAVAILABLE note is in reasons', unavailable.reasons.some((r) => /NOT CONNECTED/.test(r)));
  }
  {
    const grok = classify({ text: 'ask grok xai to draft a spec', source: 'ops_chat' });
    check('grok-xai-api is never lead', grok.leadAgent !== 'grok-xai-api' && isConnected(grok.leadAgent));
    check('grok helper labeled NOT CONNECTED', grok.helperAgents.some((h) => String(h).includes('grok-xai-api') && String(h).includes('NOT CONNECTED')));
  }
  {
    const chatgpt = classify({ text: 'chatgpt', source: 'ops_chat' });
    check('only-unavailable match leads with lavaall-ceo', chatgpt.leadAgent === 'lavaall-ceo');
    check('chatgpt-api helper labeled NOT CONNECTED', chatgpt.helperAgents.some((h) => String(h).includes('chatgpt-api') && String(h).includes('NOT CONNECTED')));
  }
  {
    const names = ['RECEIVED', 'CLASSIFIED', 'AWAITING_APPROVAL', 'BRIDGED', 'DONE', 'FAILED'];
    check('status registry has L0–L4 pipeline names', names.every((name) => STATUSES[name] === name && isStatus(name)));
  }

  // --- Council / group mode ---
  {
    const council = classify({ text: 'council review the Accra launch', source: 'ops_chat' });
    check('council lead is lavaall-ceo', council.leadAgent === 'lavaall-ceo' && council.mode === MODE_COUNCIL && council.verb === 'council');
    check('council helpers are all CONNECTED Grok specialists', GROK_SPECIALIST_IDS.every((id) => council.helperAgents.includes(id)));
    check('council helpers omit UNAVAILABLE APIs by default', !council.helperAgents.some((h) => /claude-api|chatgpt-api|grok-xai-api/.test(String(h))));
    check('council skills are grill-founder, research-primary, decision-log', COUNCIL_SKILLS.every((s) => council.skills.includes(s)));
    check('council default risk is L1–L2', council.risk === 'L1' || council.risk === 'L2');
    check('council does not require approval by default', needsApproval(council.risk) === false);
  }
  {
    const samples = [
      'deliberate the supplier strategy',
      'debate pricing with specialists',
      'all-hands on the catalog',
      'all hands on the catalog',
      'everyone review the Accra launch',
      'ask the team about next week',
    ];
    const allCouncil = samples.every((text) => {
      const result = classify({ text, source: 'ops_chat' });
      return result.mode === MODE_COUNCIL && result.leadAgent === 'lavaall-ceo' && GROK_SPECIALIST_IDS.every((id) => result.helperAgents.includes(id));
    });
    check('council verbs/keywords fan out to connected specialists', allCouncil);
  }
  {
    const bumped = classify({ text: 'council deploy production', source: 'ops_chat' });
    check('council + deploy stays L3 approval', bumped.mode === MODE_COUNCIL && bumped.risk === 'L3' && needsApproval(bumped.risk) === true && bumped.leadAgent === 'lavaall-ceo');
  }
  {
    const l4 = classify({ text: 'council delete production secrets', source: 'ops_chat' });
    check('council + secret/delete stays L4', l4.mode === MODE_COUNCIL && l4.risk === 'L4' && needsApproval(l4.risk) === true);
  }
  {
    const prevAnthropic = process.env.ANTHROPIC_API_KEY;
    const prevOpenAI = process.env.OPENAI_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'present';
    process.env.OPENAI_API_KEY = 'present';
    const council = classify({ text: 'council review', source: 'ops_chat' });
    const claude = AGENT_REGISTRY.agents.find((a) => a.id === 'claude-api');
    const chatgpt = AGENT_REGISTRY.agents.find((a) => a.id === 'chatgpt-api');
    check('ANTHROPIC_API_KEY adds claude-api as CONNECTED helper', council.helperAgents.includes('claude-api'));
    check('OPENAI_API_KEY adds chatgpt-api as CONNECTED helper', council.helperAgents.includes('chatgpt-api'));
    check('registry JSON still marks claude-api UNAVAILABLE', !!(claude && claude.status === 'UNAVAILABLE'));
    check('registry JSON still marks chatgpt-api UNAVAILABLE', !!(chatgpt && chatgpt.status === 'UNAVAILABLE'));
    const mentioned = classify({ text: 'use claude to research the Accra market', source: 'ops_chat' });
    check('env-connected claude-api is still never lead', mentioned.leadAgent === 'lavaall-ceo' && mentioned.helperAgents.includes('claude-api'));
    if (prevAnthropic === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = prevAnthropic;
    if (prevOpenAI === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = prevOpenAI;
  }

  // --- Tighter non-council routing ---
  {
    const sales = classify({ text: 'customer order from the supplier', source: 'ops_chat' });
    check('order/customer/supplier → sales lead', sales.leadAgent === 'sales' && sales.area === 'sales' && sales.mode !== MODE_COUNCIL);
  }
  {
    const tech = classify({ text: 'vercel repo api bug in the importer', source: 'ops_chat' });
    check('vercel/repo/api/bug → technical lead', tech.leadAgent === 'technical' && tech.area === 'technical');
  }
  {
    const life = classify({ text: 'email klaviyo journey for retention', source: 'ops_chat' });
    check('klaviyo/journey/retention lead is ceo', life.leadAgent === 'lavaall-ceo' && life.area === 'lifecycle');
    check('lifecycle stays a helper when it is the only specialist', life.helperAgents.includes('lifecycle'));
  }
  {
    const growth = classify({ text: 'social ugc for the phones category', source: 'ops_chat' });
    check('social/ugc → growth lead', growth.leadAgent === 'growth' && growth.area === 'growth' && needsApproval(growth.risk) === false);
    const leverage = classify({ text: 'how can we leverage LAVAALL better?', source: 'ops_ceo_send' });
    check('leverage → growth area, CEO still answers on Send', leverage.area === 'growth' && leverage.leadAgent === 'growth');
  }
  {
    const researchCeo = classify({ text: 'research supplier lead times', source: 'ops_chat' });
    check('research + supplier stays ceo unless clearly sales', researchCeo.leadAgent === 'lavaall-ceo' && researchCeo.verb === 'research' && researchCeo.area === 'ceo');
  }
  {
    const auditCeo = classify({ text: 'audit the catalog images', source: 'ops_chat' });
    check('audit/qa without sales/tech stays ceo', auditCeo.leadAgent === 'lavaall-ceo' && auditCeo.verb === 'audit');
  }

  if (originalAnthropic === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = originalAnthropic;
  if (originalOpenAI === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalOpenAI;

  let failed = 0;
  for (const row of results) {
    console.log((row.pass ? 'PASS' : 'FAIL') + ' - ' + row.name);
    if (!row.pass) failed += 1;
  }
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}

run();
