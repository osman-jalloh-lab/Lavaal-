// Decision request envelope, state fingerprint, and shadow no-op.
// Shadow mode is the Preview default: the engine decides, Talk stays authoritative.
const path = require('path');
const fs = require('fs');

const opsDir = path.join(__dirname, '../api/ops');
const decision = require(path.join(opsDir, '_decision.js'));
const store = require(path.join(opsDir, '_store.js'));
const ceo = require(path.join(opsDir, '_ceo_bridge.js'));
const desks = require(path.join(opsDir, '_agent_thread.js'));

const FOUNDER = 'osmanjalloh104@gmail.com';
const GOAL = 'QA Goal Sentinel';

const results = [];
function check(name, cond) { results.push({ name, pass: !!cond }); }

function snap(overrides) {
  return Object.assign({
    threadId: 'thread-1',
    latestMessageId: 'msg-a',
    latestMessageAt: 1000,
    activeEntity: { type: 'task', id: 'task-1', source: 'request' },
    businessStateVersion: 'biz-v1',
    messages: [{ id: 'msg-a', role: 'founder', at: 1000 }],
  }, overrides || {});
}

function xaiFetch(bucket) {
  return async (_url, opts) => {
    const body = JSON.parse(opts.body);
    const system = body.messages && body.messages[0] ? body.messages[0].content : '';
    bucket.calls += 1;
    bucket.system = system;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: `MODEL ECHO ${GOAL}` } }],
      }),
    };
  };
}

async function run() {
  const regressionPath = path.join(__dirname, '../qa/regression/2026-09-21-failures.json');
  const regression = JSON.parse(fs.readFileSync(regressionPath, 'utf8'));
  const rows = regression.failures || [];
  const required = ['test_id', 'phase', 'agent', 'failure_type', 'prompt', 'expected', 'actual'];
  check('regression file has 44 failing or blocked rows', rows.length === 44);
  check('regression ids are unique', new Set(rows.map((row) => row.test_id)).size === 44);
  check('regression rows keep id, phase, agent, failure type, prompt, expected, actual',
    rows.every((row) => required.every((key) => Object.prototype.hasOwnProperty.call(row, key))));
  check('regression keeps 42 failed and 2 blocked/partial',
    rows.filter((row) => row.kind === 'failed').length === 42
    && rows.filter((row) => row.kind === 'blocked_partial').length === 2);

  const base = snap();
  const request = decision.createDecisionRequest({
    rawInput: 'hi',
    requestedAgent: 'lavaall-ceo',
    resolvedAgent: 'lavaall-ceo',
    observedAt: '2026-09-22T00:00:00.000Z',
    snapshot: base,
  });
  check('envelope has thread, fingerprint, window, and policy fields',
    request.requestId
    && request.threadId === 'thread-1'
    && request.rawInput === 'hi'
    && request.stateFingerprint === decision.stateFingerprint(base)
    && request.observedAt === '2026-09-22T00:00:00.000Z'
    && request.conversationWindow.length === 1
    && request.businessStateRefs[0].version === 'biz-v1'
    && request.allowedTools.length === 1
    && request.allowedTools[0] === 'talk_reply'
    && request.approvalContext.externalActionsPermitted === false);
  check('phatic hi is an allowed operation and omits store context in the decision',
    request.allowedOperations.indexOf('PHATIC_ACK') !== -1
    && decision.decide(request).operation === 'PHATIC_ACK'
    && decision.decide(request).omitStoreContext === true
    && decision.decide(request).executeExternal === false);

  const parts = decision.fingerprintParts(base);
  check('fingerprint parts include thread, message, time, entity, and business version',
    parts.threadId === 'thread-1'
    && parts.latestMessageId === 'msg-a'
    && parts.latestMessageAt === '1000'
    && parts.activeEntityType === 'task'
    && parts.activeEntityId === 'task-1'
    && parts.businessStateVersion === 'biz-v1');
  check('same snapshot hashes the same fingerprint',
    decision.stateFingerprint(base) === decision.stateFingerprint(snap()));
  check('a new message id changes the fingerprint',
    decision.stateFingerprint(base) !== decision.stateFingerprint(snap({ latestMessageId: 'msg-b' })));
  check('a new message timestamp changes the fingerprint',
    decision.stateFingerprint(base) !== decision.stateFingerprint(snap({ latestMessageAt: 1001 })));
  check('a new thread id changes the fingerprint',
    decision.stateFingerprint(base) !== decision.stateFingerprint(snap({ threadId: 'thread-2' })));
  check('a new active entity changes the fingerprint',
    decision.stateFingerprint(base) !== decision.stateFingerprint(snap({
      activeEntity: { type: 'task', id: 'task-2', source: 'request' },
    })));
  check('a new business-state version changes the fingerprint',
    decision.stateFingerprint(base) !== decision.stateFingerprint(snap({ businessStateVersion: 'biz-v2' })));

  const hiA = decision.decide(decision.createDecisionRequest({ rawInput: 'hi', snapshot: base }));
  const hiB = decision.decide(decision.createDecisionRequest({
    rawInput: 'hi',
    snapshot: snap({ latestMessageId: 'msg-b', latestMessageAt: 2000, messages: [{ id: 'msg-b', role: 'founder', at: 2000 }] }),
  }));
  check('a hi reply bound to message A is not valid for message B',
    decision.replyBoundToMessage(hiA, 'msg-a')
    && !decision.replyBoundToMessage(hiA, 'msg-b')
    && hiA.stateFingerprint !== hiB.stateFingerprint);

  let staleThrown = false;
  try {
    decision.assertFresh(hiA, decision.stateFingerprint(snap({ latestMessageId: 'msg-b' })));
  } catch (err) {
    staleThrown = err instanceof decision.StaleDecisionError && err.code === 'stale_decision';
  }
  check('freshness guard throws StaleDecisionError when the fingerprint moved', staleThrown);
  decision.assertFresh(hiA, hiA.stateFingerprint);
  check('freshness guard accepts the fingerprint the decision was built from', true);

  const moved = [
    base,
    snap({ latestMessageId: 'msg-b', latestMessageAt: 2000, messages: [{ id: 'msg-b', role: 'founder', at: 2000 }] }),
    snap({ latestMessageId: 'msg-b', latestMessageAt: 2000, messages: [{ id: 'msg-b', role: 'founder', at: 2000 }] }),
  ];
  let movedReads = 0;
  decision.resetDecisionEngine();
  const retried = await decision.resolveFreshDecision({
    rawInput: 'hi',
    requestedAgent: 'lavaall-ceo',
    resolvedAgent: 'lavaall-ceo',
    readSnapshot: async () => moved[Math.min(movedReads++, moved.length - 1)],
  });
  check('a moved fingerprint discards the first decision and re-decides on the new one',
    retried.discarded === true
    && retried.stale === false
    && retried.decision.boundMessageId === 'msg-b'
    && retried.decision.stateFingerprint === decision.stateFingerprint(moved[1]));

  const racing = [base, snap({ latestMessageId: 'msg-b' }), snap({ latestMessageId: 'msg-c' })];
  let raceReads = 0;
  const unresolved = await decision.resolveFreshDecision({
    rawInput: 'hi',
    requestedAgent: 'lavaall-ceo',
    resolvedAgent: 'lavaall-ceo',
    readSnapshot: async () => racing[Math.min(raceReads++, racing.length - 1)],
  });
  check('a fingerprint that keeps moving stays stale and is not applied',
    unresolved.discarded === true
    && unresolved.stale === true
    && unresolved.applied === false
    && unresolved.decision.executeExternal === false);

  const blocked = decision.createDecisionRequest({
    rawInput: 'Please send the email to the supplier',
    snapshot: base,
    approvalContext: { founderApproved: true },
    requestedAgent: 'lavaall-ceo',
    resolvedAgent: 'lavaall-ceo',
  });
  const blockedDecision = decision.decide(blocked);
  check('send stays out of allowed operations even with a founder flag',
    blocked.allowedOperations.indexOf('send') === -1
    && blocked.allowedOperations.indexOf('SEND') === -1
    && blocked.approvalContext.externalActionsPermitted === false
    && blocked.approvalContext.founderApproved === true
    && blockedDecision.operation === 'BLOCKED_EXTERNAL'
    && blockedDecision.executeExternal === false);

  const previousShadow = process.env.DECISION_ENGINE_SHADOW_MODE;
  delete process.env.DECISION_ENGINE_SHADOW_MODE;
  check('shadow mode defaults on when the flag is unset', decision.isShadowMode() === true);
  process.env.DECISION_ENGINE_SHADOW_MODE = 'false';
  check('shadow mode turns off only when the flag is explicitly false', decision.isShadowMode() === false);
  let liveRaceReads = 0;
  const liveUnresolved = await decision.resolveFreshDecision({
    rawInput: 'hi',
    requestedAgent: 'lavaall-ceo',
    resolvedAgent: 'lavaall-ceo',
    readSnapshot: async () => racing[Math.min(liveRaceReads++, racing.length - 1)],
  });
  check('live mode replaces a still-stale decision instead of reusing it',
    liveUnresolved.shadow === false
    && liveUnresolved.stale === true
    && liveUnresolved.applied === false
    && decision.authoritativeOverride(liveUnresolved) === decision.STALE_TURN_COPY
    && decision.authoritativeOverride(unresolved) === '');
  if (previousShadow == null) delete process.env.DECISION_ENGINE_SHADOW_MODE;
  else process.env.DECISION_ENGINE_SHADOW_MODE = previousShadow;

  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  delete process.env.OPS_STORE_FILE;
  delete process.env.VERCEL;
  process.env.XAI_API_KEY = 'test-xai-key-not-real';
  process.env.DECISION_ENGINE_SHADOW_MODE = 'true';
  store.resetStore({
    goal: {
      title: GOAL,
      definitionOfDone: 'sentinel done',
      nextStep: 'sentinel next',
      targetDate: '',
      updatedAt: 1,
    },
    tasks: [],
    notes: [],
  });
  ceo.resetCeoBridge();
  desks.resetDeskTalk();
  decision.resetDecisionEngine();
  const origFetch = global.fetch;
  const shadowBucket = { calls: 0, system: '' };
  global.fetch = xaiFetch(shadowBucket);
  const shadowReply = await ceo.talkToCeo({
    text: 'hi',
    founderEmail: FOUNDER,
    source: 'ops-office',
  });
  const shadowLog = decision.recentDecisions()[0];
  check('shadow hi keeps the production model reply, including the goal dump path',
    shadowBucket.calls === 1
    && shadowBucket.system.indexOf(GOAL) !== -1
    && shadowReply.reply === `MODEL ECHO ${GOAL}`
    && shadowReply.usedModel === true);
  check('shadow hi still records a phatic decision that is not applied',
    shadowLog
    && shadowLog.shadow === true
    && shadowLog.applied === false
    && shadowLog.operation === 'PHATIC_ACK'
    && shadowLog.omitStoreContext === true
    && shadowLog.executeExternal === false
    && !Object.prototype.hasOwnProperty.call(shadowLog, 'rawInput'));

  process.env.DECISION_ENGINE_SHADOW_MODE = 'false';
  ceo.resetCeoBridge();
  decision.resetDecisionEngine();
  const liveBucket = { calls: 0, system: '' };
  global.fetch = xaiFetch(liveBucket);
  const liveReply = await ceo.talkToCeo({
    text: 'Hi',
    founderEmail: FOUNDER,
    source: 'ops-office',
  });
  check('live phatic hi skips the model and does not dump the goal',
    liveBucket.calls === 0
    && liveReply.reply === decision.PHATIC_REPLY
    && liveReply.reply.indexOf(GOAL) === -1
    && liveReply.usedModel === false
    && decision.recentDecisions()[0].applied === true);

  ceo.resetCeoBridge();
  const workBucket = { calls: 0, system: '' };
  global.fetch = xaiFetch(workBucket);
  const workReply = await ceo.talkToCeo({
    text: 'What should we research next?',
    founderEmail: FOUNDER,
    source: 'ops-office',
  });
  check('live non-phatic talk still uses the production prompt',
    workBucket.calls === 1
    && workBucket.system.indexOf(GOAL) !== -1
    && workReply.reply === `MODEL ECHO ${GOAL}`);

  ceo.resetCeoBridge();
  const blockBucket = { calls: 0, system: '' };
  global.fetch = xaiFetch(blockBucket);
  const blockReply = await ceo.talkToCeo({
    text: 'Please send the email to the supplier',
    founderEmail: FOUNDER,
    source: 'ops-office',
  });
  check('live send intent is blocked and does not call the model',
    blockBucket.calls === 0
    && blockReply.reply === decision.BLOCKED_EXTERNAL_REPLY
    && blockReply.reply.indexOf(GOAL) === -1);

  process.env.DECISION_ENGINE_SHADOW_MODE = 'true';
  desks.resetDeskTalk();
  decision.resetDecisionEngine();
  const deskBucket = { calls: 0, system: '' };
  global.fetch = xaiFetch(deskBucket);
  const deskReply = await desks.talkToDesk({
    agentId: 'sales',
    text: 'hi',
    founderEmail: FOUNDER,
    source: 'ops-office',
  });
  const deskLog = decision.recentDecisions()[0];
  check('shadow desk hi also leaves production Talk authoritative',
    deskBucket.calls === 1
    && deskBucket.system.indexOf(GOAL) !== -1
    && deskReply.reply === `MODEL ECHO ${GOAL}`
    && deskLog
    && deskLog.agent === 'sales'
    && deskLog.applied === false
    && deskLog.operation === 'PHATIC_ACK');

  global.fetch = origFetch;
  delete process.env.XAI_API_KEY;
  if (previousShadow == null) delete process.env.DECISION_ENGINE_SHADOW_MODE;
  else process.env.DECISION_ENGINE_SHADOW_MODE = previousShadow;

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
