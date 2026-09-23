// Capability registry, valid operations/targets, and delegation lineage.
// Shadow stays the default: routing is logged, Talk stays authoritative
// unless DECISION_ENGINE_ROUTING_PREVIEW is set off Production.
const path = require('path');

const opsDir = path.join(__dirname, '../api/ops');
const decision = require(path.join(opsDir, '_decision.js'));
const store = require(path.join(opsDir, '_store.js'));
const ceo = require(path.join(opsDir, '_ceo_bridge.js'));
const desks = require(path.join(opsDir, '_agent_thread.js'));
const assign = require(path.join(opsDir, '_assign.js'));

const FOUNDER = 'osmanjalloh104@gmail.com';
const DESKS = ['lavaall-ceo', 'researchy', 'sales', 'growth', 'technical', 'lifecycle'];

const results = [];
function check(name, cond) { results.push({ name, pass: !!cond }); }

function snap(overrides) {
  return Object.assign({
    threadId: 'thread-1',
    latestMessageId: 'msg-a',
    latestMessageAt: 1000,
    businessStateVersion: 'biz-v1',
    messages: [{ id: 'msg-a', role: 'founder', at: 1000 }],
  }, overrides || {});
}

function requestFor(agent, text, extras) {
  return decision.createDecisionRequest(Object.assign({
    rawInput: text,
    requestedAgent: agent,
    resolvedAgent: agent,
    snapshot: snap(),
  }, extras || {}));
}

function opsOf(agent, text, extras) {
  const request = requestFor(agent, text, extras);
  return { request, decision: decision.decide(request) };
}

function xaiFetch(bucket) {
  return async (_url, opts) => {
    const body = JSON.parse(opts.body);
    bucket.calls += 1;
    bucket.system = body.messages && body.messages[0] ? body.messages[0].content : '';
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: 'MODEL PRODUCTION' } }] }),
    };
  };
}

function idsOf(targets, type) {
  return (targets || []).filter((row) => row.type === type).map((row) => row.id);
}

async function run() {
  check('registry matches the six Talk desk ids',
    DESKS.every((id) => decision.DESK_IDS.indexOf(id) !== -1 && decision.AGENT_CAPABILITIES[id]));
  check('ceo alias resolves to lavaall-ceo and invented desks do not',
    decision.canonicalAgent('ceo') === 'lavaall-ceo'
    && decision.isRegisteredAgent('researchy')
    && decision.isRegisteredAgent('marketing-bot') === false
    && decision.canonicalAgent('marketing-bot') === '');
  check('researchy can research and cannot audit code',
    decision.agentAllows('researchy', 'supplier_research')
    && decision.agentAllows('researchy', 'web_research')
    && decision.agentAllows('researchy', 'code_audit') === false);
  check('growth can draft campaigns and cannot run a security review tool',
    decision.agentAllows('growth', 'campaign_analysis')
    && decision.isRegisteredTool('growth', 'campaign_draft')
    && decision.isRegisteredTool('growth', 'security_review') === false
    && decision.isRegisteredTool('growth', 'web_weather') === false);
  check('denied tools are never registered on any desk',
    DESKS.every((id) => decision.DENIED_TOOLS.every((tool) => decision.isRegisteredTool(id, tool) === false)));

  const cisco = opsOf('researchy', 'Configure a Cisco router.');
  check('ROUTE-004 Cisco on Researchy exposes route, clarify, research, and blocked',
    ['ROUTE_TO_TECHNICAL', 'ASK_FOR_MISSING_TECH_CONTEXT', 'RESEARCH', 'BLOCKED']
      .every((op) => cisco.request.allowedOperations.indexOf(op) !== -1));
  check('ROUTE-004 Cisco menu has no send or purchase operation',
    cisco.request.allowedOperations.indexOf('SEND_SALES_EMAIL') === -1
    && cisco.request.allowedOperations.indexOf('PURCHASE') === -1
    && cisco.request.allowedOperations.indexOf('send') === -1
    && cisco.request.allowedTools.indexOf('send_sales_email') === -1
    && cisco.request.allowedTools.indexOf('purchase') === -1
    && cisco.request.allowedTools.indexOf('code_audit') === -1);
  check('ROUTE-004 Cisco decision routes only to registered Technical',
    cisco.decision.operation === 'ROUTE_TO_TECHNICAL'
    && cisco.decision.routeTo === 'technical'
    && cisco.decision.targetType === 'agent'
    && cisco.decision.executeExternal === false
    && idsOf(cisco.request.allowedTargets, 'agent').indexOf('marketing-bot') === -1
    && idsOf(cisco.request.allowedTargets, 'agent').indexOf('technical') !== -1);

  const salesAudit = opsOf('sales', 'Audit our website code for security issues.');
  check('ROUTE-005 Sales security audit routes to Technical and hides audit tools',
    salesAudit.decision.operation === 'ROUTE_TO_TECHNICAL'
    && salesAudit.decision.routeTo === 'technical'
    && salesAudit.request.allowedTools.indexOf('code_audit') === -1
    && salesAudit.request.allowedTools.indexOf('security_review') === -1
    && decision.agentAllows('sales', 'code_audit') === false);

  const growthMail = opsOf('growth', 'Reconcile our customer email flows.');
  check('ROUTE-006 Growth email flows route to Lifecycle',
    growthMail.decision.operation === 'ROUTE_TO_LIFECYCLE'
    && growthMail.decision.routeTo === 'lifecycle'
    && growthMail.request.allowedOperations.indexOf('SEND_SALES_EMAIL') === -1);

  const lifecycleOwns = opsOf('lifecycle', 'Reconcile our customer email flows.');
  check('Lifecycle keeps customer email flows on its own desk',
    lifecycleOwns.decision.operation === 'ANSWER_IN_THREAD'
    && lifecycleOwns.decision.routeTo === '');

  const starlink = opsOf('lavaall-ceo', 'Figure out whether we should sell Starlink Mini.');
  const routeAgents = idsOf(starlink.request.allowedTargets.filter((row) => row.operation === 'ROUTE_TASK' || row.operation === 'DELEGATE'), 'agent');
  check('CEO-001 sell decision delegates to Researchy only',
    starlink.decision.operation === 'DELEGATE'
    && starlink.decision.routeTo === 'researchy'
    && starlink.request.allowedOperations.indexOf('DELEGATE') !== -1
    && starlink.request.allowedOperations.indexOf('RESEARCH') !== -1
    && starlink.request.allowedOperations.indexOf('ROUTE_TASK') !== -1
    && routeAgents.length > 0
    && routeAgents.every((id) => id === 'researchy')
    && starlink.decision.executeExternal === false);

  const research = opsOf('researchy', 'Research Starlink distribution options.');
  const apple = opsOf('researchy', 'Research Apple ASBIS MCI sourcing for Sierra Leone.');
  check('ROUTE-002 Researchy research stays on this prompt, not another task',
    research.decision.operation === 'RESEARCH'
    && research.decision.targetType === 'research_task'
    && research.decision.targetId === decision.researchTaskId('Research Starlink distribution options.')
    && research.decision.targetId !== apple.decision.targetId
    && research.request.delegation
    && research.request.delegation.parentRequestId === research.request.requestId
    && research.request.delegation.parentThreadId === 'thread-1'
    && /Starlink distribution/.test(research.request.delegation.delegatedGoal)
    && idsOf(research.request.allowedTargets, 'research').indexOf('supplier_research') !== -1
    && idsOf(research.request.allowedTargets, 'agent').length === 0);

  const mars = opsOf('growth', "What's the weather on Mars?");
  check('G-growth-2 Mars weather is blocked with no weather tool',
    mars.decision.operation === 'BLOCKED'
    && mars.decision.policy === 'capability_denied'
    && mars.request.allowedOperations.length === 1
    && mars.request.allowedTools.length === 0
    && mars.request.allowedTools.indexOf('web_weather') === -1
    && mars.decision.executeExternal === false);
  const growthAudit = opsOf('growth', 'Audit website security');
  check('G-growth-3 Growth security audit routes to Technical',
    growthAudit.decision.operation === 'ROUTE_TO_TECHNICAL'
    && growthAudit.request.allowedTools.indexOf('security_review') === -1
    && growthAudit.request.allowedTools.indexOf('code_audit') === -1);
  const revenue = opsOf('growth', 'Confirm we made $2M last month');
  check('G-growth-4 Growth revenue assertion is blocked',
    revenue.decision.operation === 'BLOCKED'
    && revenue.decision.reason === 'revenue_assertion_denied'
    && revenue.decision.executeExternal === false);
  const researchyMars = opsOf('researchy', "What's the weather on Mars?");
  check('Researchy Mars weather is blocked instead of a sourcing tool',
    researchyMars.decision.operation === 'BLOCKED'
    && researchyMars.request.allowedTools.indexOf('web_research') === -1);
  const hello = opsOf('researchy', 'hello Researchy');
  check('Researchy hello stays a greeting, not a capability block',
    hello.decision.operation === 'PHATIC_ACK'
    && hello.request.allowedTools.length === 1
    && hello.request.allowedTools[0] === 'talk_reply');

  const technicalCisco = opsOf('technical', 'Configure a Cisco router.');
  check('Technical Cisco ask asks for device context and can research',
    technicalCisco.decision.operation === 'ASK_FOR_MISSING_TECH_CONTEXT'
    && technicalCisco.request.allowedOperations.indexOf('RESEARCH') !== -1
    && technicalCisco.request.allowedOperations.indexOf('ROUTE_TO_TECHNICAL') === -1);

  const withLead = opsOf('sales', 'Follow up with the customer', {
    eligibleLeads: [{ id: 'lead-1', name: 'Known lead' }],
  });
  const invented = { type: 'lead', id: 'lead-999', source: 'model' };
  check('FOLLOW_UP targets only eligible leads',
    withLead.decision.operation === 'FOLLOW_UP'
    && withLead.decision.targetId === 'lead-1'
    && withLead.decision.targetType === 'lead'
    && decision.acceptTarget('FOLLOW_UP', { type: 'lead', id: 'lead-1', source: 'eligible' }, withLead.request.allowedTargets)
    && decision.acceptTarget('FOLLOW_UP', invented, withLead.request.allowedTargets) === false
    && decision.targetIsRegistered({ type: 'agent', id: 'marketing-bot' }) === false);
  const noLead = opsOf('sales', 'Follow up with the customer');
  check('FOLLOW_UP without a lead asks instead of inventing one',
    noLead.decision.operation === 'ASK_CLARIFY'
    && noLead.request.allowedOperations.indexOf('FOLLOW_UP') === -1);

  const same = { parentRequestId: 'req-1', parentThreadId: 'thread-parent', id: 'task-1', delegatedGoal: 'Research Starlink distribution options.' };
  const child = {
    parentRequestId: 'req-1',
    parentThreadId: 'thread-parent',
    taskId: 'task-1',
    delegatedGoal: 'Research Starlink distribution options.',
  };
  const other = Object.assign({}, child, { parentRequestId: 'req-apple', delegatedGoal: 'Research Apple ASBIS' });
  check('delegation attaches only when parent request, thread, task, and goal match',
    decision.delegationAttaches(same, child)
    && decision.delegationAttaches(same, other) === false
    && decision.delegationAttaches(same, Object.assign({}, child, { parentThreadId: 'other-thread' })) === false);

  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  delete process.env.OPS_STORE_FILE;
  delete process.env.VERCEL;
  delete process.env.XAI_API_KEY;
  delete process.env.DECISION_ENGINE_ROUTING_PREVIEW;
  const previousShadow = process.env.DECISION_ENGINE_SHADOW_MODE;
  const previousEnv = process.env.VERCEL_ENV;
  delete process.env.DECISION_ENGINE_SHADOW_MODE;
  check('shadow mode still defaults on', decision.isShadowMode() === true);
  check('routing preview defaults off', decision.routingPreviewEnabled() === false);
  process.env.DECISION_ENGINE_ROUTING_PREVIEW = 'true';
  process.env.VERCEL_ENV = 'production';
  check('routing preview is ignored on Production', decision.routingPreviewEnabled() === false);
  delete process.env.VERCEL_ENV;
  check('routing preview can be enabled off Production', decision.routingPreviewEnabled() === true);
  delete process.env.DECISION_ENGINE_ROUTING_PREVIEW;

  process.env.XAI_API_KEY = 'test-xai-key-not-real';
  process.env.DECISION_ENGINE_SHADOW_MODE = 'true';
  store.resetStore();
  ceo.resetCeoBridge();
  desks.resetDeskTalk();
  decision.resetDecisionEngine();
  const origFetch = global.fetch;
  const shadowBucket = { calls: 0, system: '' };
  global.fetch = xaiFetch(shadowBucket);
  const shadowReply = await desks.talkToDesk({
    agentId: 'researchy',
    text: 'Configure a Cisco router.',
    founderEmail: FOUNDER,
    source: 'ops-office',
  });
  const shadowLog = decision.recentDecisions()[0];
  check('shadow Cisco route keeps the production Talk reply',
    shadowBucket.calls === 1
    && shadowReply.reply === 'MODEL PRODUCTION'
    && shadowReply.usedModel === true
    && shadowLog
    && shadowLog.shadow === true
    && shadowLog.applied === false
    && shadowLog.shadowDisagreement === true
    && shadowLog.operation === 'ROUTE_TO_TECHNICAL'
    && shadowLog.routeTo === 'technical'
    && shadowLog.executeExternal === false
    && !Object.prototype.hasOwnProperty.call(shadowLog, 'rawInput'));

  process.env.DECISION_ENGINE_ROUTING_PREVIEW = 'true';
  desks.resetDeskTalk();
  decision.resetDecisionEngine();
  const previewBucket = { calls: 0, system: '' };
  global.fetch = xaiFetch(previewBucket);
  const previewReply = await desks.talkToDesk({
    agentId: 'sales',
    text: 'Audit our website code for security issues.',
    founderEmail: FOUNDER,
    source: 'ops-office',
  });
  check('routing preview replaces the model with an in-thread handoff and still sends nothing',
    previewBucket.calls === 0
    && previewReply.reply === 'This belongs with Technical & QA. Hand it to that desk.'
    && previewReply.usedModel === false
    && decision.recentDecisions()[0].applied === true
    && decision.recentDecisions()[0].executeExternal === false
    && decision.recentDecisions()[0].shadow === true);

  delete process.env.DECISION_ENGINE_ROUTING_PREVIEW;
  process.env.VERCEL_ENV = 'production';
  desks.resetDeskTalk();
  decision.resetDecisionEngine();
  const prodBucket = { calls: 0, system: '' };
  global.fetch = xaiFetch(prodBucket);
  process.env.DECISION_ENGINE_ROUTING_PREVIEW = 'true';
  const prodReply = await desks.talkToDesk({
    agentId: 'growth',
    text: 'Reconcile our customer email flows.',
    founderEmail: FOUNDER,
    source: 'ops-office',
  });
  check('Production ignores the routing preview flag and keeps Talk',
    decision.routingPreviewEnabled() === false
    && prodBucket.calls === 1
    && prodReply.reply === 'MODEL PRODUCTION'
    && decision.recentDecisions()[0].applied === false
    && decision.recentDecisions()[0].operation === 'ROUTE_TO_LIFECYCLE');

  delete process.env.XAI_API_KEY;
  delete process.env.DECISION_ENGINE_ROUTING_PREVIEW;
  delete process.env.VERCEL_ENV;
  store.resetStore();
  ceo.resetCeoBridge();
  desks.resetDeskTalk();
  const assigned = await assign.assignToResearchy({
    text: 'Research Starlink distribution options.',
    founderEmail: FOUNDER,
    source: 'ceo-assign',
    correlationId: 'starlink-parent',
    activeEntity: { type: 'product_family', id: 'starlink-mini', name: 'Starlink Mini', source: 'request' },
  });
  const task = assigned.task;
  const pending = store.listResearchyPending(await store.readStore());
  const inspected = await desks.inspectDeskThread('researchy', task && task.childThreadId);
  const founderMsg = inspected.thread && (inspected.thread.messages || []).find((item) => item.role === 'founder');
  check('Assign carries parent request, parent thread, child task, goal, and entity',
    assigned.ok === true
    && task
    && task.parentRequestId === 'starlink-parent'
    && task.parentThreadId
    && task.delegatedGoal.indexOf('Research Starlink distribution options.') !== -1
    && task.originatingEntityType === 'product_family'
    && task.originatingEntityId === 'starlink-mini'
    && pending.length === 1
    && pending[0].parentRequestId === 'starlink-parent'
    && pending[0].parentThreadId === task.parentThreadId
    && pending[0].taskId === task.id
    && pending[0].delegatedGoal.indexOf('Starlink') !== -1
    && founderMsg
    && founderMsg.delegation
    && founderMsg.delegation.parentRequestId === 'starlink-parent'
    && founderMsg.delegation.parentThreadId === task.parentThreadId
    && founderMsg.delegation.childTaskId === task.id
    && founderMsg.delegation.delegatedGoal.indexOf('Starlink') !== -1
    && founderMsg.delegation.originatingEntity
    && founderMsg.delegation.originatingEntity.id === 'starlink-mini');

  const wrong = await assign.postResearchyReply({
    threadId: task.childThreadId,
    pendingId: pending[0].correlationId,
    text: 'Apple ASBIS findings that must stay off this parent.',
  });
  check('a matching Researchy pending still attaches to its parent task',
    wrong.ok === true && wrong.task && wrong.task.id === task.id);

  const second = await store.addTask({
    title: 'Assign 9 — Apple path',
    status: 'doing',
    createdBy: FOUNDER,
    ownerAgentId: 'researchy',
    parentThreadId: 'other-ceo-thread',
    parentCorrelationId: 'apple-parent',
    parentRequestId: 'apple-parent',
    childCorrelationId: 'apple-child',
    delegatedGoal: 'Research Apple ASBIS',
    assignStatus: 'assigned',
  });
  await store.enqueueResearchyPending({
    threadId: task.childThreadId,
    founderEmail: FOUNDER,
    taskId: second.task.id,
    messageId: 'apple-child',
    correlationId: 'apple-child',
    text: 'Packed Apple brief',
    parentRequestId: 'starlink-parent',
    parentThreadId: task.parentThreadId,
    delegatedGoal: 'Research Starlink distribution options.',
  });
  const stolen = await assign.postResearchyReply({
    threadId: task.childThreadId,
    pendingId: 'apple-child',
    text: 'Starlink text must not land on the Apple task.',
  });
  const after = await store.readStore();
  const appleTask = after.tasks.find((row) => row.id === second.task.id);
  check('wrong parent request does not attach a child result',
    stolen.error === 'wrong_thread'
    && appleTask.assignStatus === 'assigned'
    && !appleTask.result);

  global.fetch = origFetch;
  if (previousShadow == null) delete process.env.DECISION_ENGINE_SHADOW_MODE;
  else process.env.DECISION_ENGINE_SHADOW_MODE = previousShadow;
  if (previousEnv == null) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = previousEnv;

  let failed = 0;
  for (const row of results) {
    console.log(`${row.pass ? 'PASS' : 'FAIL'} - ${row.name}`);
    if (!row.pass) failed += 1;
  }
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
