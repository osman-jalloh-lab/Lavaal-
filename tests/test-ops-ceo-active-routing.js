// CEO Talk routes a live question to a desk as a read-only query.
const path = require('path');

const opsDir = path.join(__dirname, '../api/ops');
const lib = require(path.join(opsDir, '_lib.js'));
const store = require(path.join(opsDir, '_store.js'));
const ceo = require(path.join(opsDir, '_ceo_bridge.js'));
const route = require(path.join(opsDir, '_ceo_route.js'));
const ops = require(path.join(opsDir, 'index.js'));

const SECRET = 'test-ops-auth-secret-32chars!!';
const BRIDGE_SECRET = 'test-ceo-bridge-secret-32chars!!';
const ALLOWED = 'osmanjalloh104@gmail.com';

const results = [];
function check(name, cond) { results.push({ name, pass: !!cond }); }

function mockRes() {
  const res = { statusCode: 200, headers: {}, body: null, raw: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.setHeader = (k, v) => { res.headers[k] = v; return res; };
  res.send = (b) => {
    res.raw = b;
    if (typeof b === 'string' && (b.startsWith('{') || b.startsWith('['))) {
      try { res.body = JSON.parse(b); } catch { res.body = b; }
    } else {
      res.body = b;
    }
    return res;
  };
  return res;
}

function cookieFor(email) {
  return `${lib.SESSION_COOKIE}=${encodeURIComponent(lib.createSessionToken(email))}`;
}

function authed(extra) {
  return {
    method: extra && extra.method ? extra.method : 'GET',
    headers: Object.assign({
      cookie: cookieFor(ALLOWED),
      host: 'preview.example.test',
      accept: 'application/json',
      'content-type': 'application/json',
    }, extra && extra.headers ? extra.headers : {}),
    query: extra && extra.query ? extra.query : {},
    url: extra && extra.url ? extra.url : '/ops/api/ceo-bridge/message',
    body: extra && extra.body,
  };
}

function bridgeReq(kind, extra) {
  const secret = extra && extra.secret !== undefined ? extra.secret : BRIDGE_SECRET;
  const headers = Object.assign({
    host: 'preview.example.test',
    accept: 'application/json',
    'content-type': 'application/json',
  }, extra && extra.headers ? extra.headers : {});
  if (secret) headers.authorization = `Bearer ${secret}`;
  return {
    method: extra && extra.method ? extra.method : 'GET',
    headers,
    query: extra && extra.query ? extra.query : { area: `api/ceo-bridge/${kind}` },
    url: extra && extra.url ? extra.url : `/ops/api/ceo-bridge/${kind}`,
    body: extra && extra.body,
  };
}

function expectRoute(text, decision, desk, ambiguous) {
  const out = route.routeCeoQuery(text, 'Goal: Ship the quote path\nTask: Wire the board — open');
  check(`${text} → ${decision}${desk ? ` ${desk}` : ''}`,
    out.decision === decision && out.desk === (desk || '') && out.ambiguous === Boolean(ambiguous));
  return out;
}

async function run() {
  process.env.OPS_AUTH_SECRET = SECRET;
  process.env.OPS_CEO_BRIDGE_SECRET = BRIDGE_SECRET;
  delete process.env.XAI_API_KEY;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  delete process.env.OPS_CEO_ACTIVE_ROUTING_ENABLED;
  delete process.env.OPS_CEO_ROUTE_RESEARCHY;
  delete process.env.OPS_CEO_QUERY_TIMEOUT_MS;
  store.resetStore();
  ceo.resetCeoBridge();

  expectRoute("what's the status of the Starlink website?", 'route', 'growth');
  expectRoute('Starlink website status', 'route', 'growth');
  expectRoute('landing page copy', 'route', 'growth');
  expectRoute('brand and social status', 'route', 'growth');
  expectRoute("what's the status of our ads", 'route', 'growth');
  expectRoute('there is a bug on the site', 'route', 'technical');
  expectRoute("what's the deploy status", 'route', 'technical');
  expectRoute('pull request status', 'route', 'technical');
  expectRoute('QA validation spec', 'route', 'technical');
  const ambiguous = expectRoute('website design and deploy status', 'route', 'growth', true);
  check('ambiguous growth reply names Technical',
    ambiguous.reply === "Checking with Growth — this could also be Technical, so I asked Growth. I'll post the answer here.");
  expectRoute('follow up on the customer quote', 'route', 'sales');
  expectRoute('new inquiry', 'route', 'sales');
  const offer = expectRoute('suppliers for the catalog', 'offer', 'researchy');
  check('researchy flag off offers instead of routing', offer.reply === 'Want me to ask Researchy?');
  const researchOn = route.routeCeoQuery('suppliers for the catalog', '', { researchy: true });
  check('researchy flag on routes', researchOn.decision === 'route' && researchOn.desk === 'researchy');
  expectRoute('market research for Liberia', 'offer', 'researchy');
  expectRoute('how many kits are active', 'records');
  expectRoute('what are we working on', 'records');
  expectRoute('what did I just say', 'records');
  expectRoute('Hi', 'phatic');
  expectRoute('hey, how are you?', 'phatic');
  const deploy = expectRoute('deploy the site', 'action');
  check('deploy is L3 and not routed', deploy.risk === 'L3');
  const wipe = expectRoute('delete the secrets', 'action');
  check('delete secrets is L4 and not routed', wipe.risk === 'L4');
  expectRoute('send the customer the quote', 'action');
  const answered = route.routeCeoQuery('Starlink website status', 'Starlink website: in review.');
  check('records that already name Starlink are not routed', answered.decision === 'records');
  const plain = route.routeCeoQuery('Starlink website status', 'Goal: Ship the quote path\nKits: not loaded.');
  check('not-loaded office lines do not answer a website question',
    plain.decision === 'route' && plain.desk === 'growth'
    && plain.reply === "Checking with Growth — I'll post the answer here.");

  {
    store.resetStore();
    ceo.resetCeoBridge();
    const sent = mockRes();
    await ops(authed({
      method: 'POST',
      query: { area: 'api/ceo-bridge/message' },
      body: { csrf: lib.createCsrfToken(ALLOWED), text: "what's the status of the Starlink website?" },
    }), sent);
    const data = await store.readStore();
    check('flag off keeps the old waiting reply',
      sent.statusCode === 200
      && sent.body
      && sent.body.waiting === true
      && sent.body.reply === ceo.WAITING_COPY
      && !String(sent.body.reply || '').includes('Checking with'));
    check('flag off creates no desk query and no task',
      data.ceoDeskQueries.length === 0
      && data.tasks.length === 0
      && data.researchyPending.length === 0);
  }

  process.env.OPS_CEO_ACTIVE_ROUTING_ENABLED = '1';
  store.resetStore();
  ceo.resetCeoBridge();

  const before = await store.readStore();
  const sent = mockRes();
  await ops(authed({
    method: 'POST',
    query: { area: 'api/ceo-bridge/message' },
    body: { csrf: lib.createCsrfToken(ALLOWED), text: "what's the status of the Starlink website?" },
  }), sent);
  const after = await store.readStore();
  const query = after.ceoDeskQueries[0];
  check('flag on replies that it is checking with Growth',
    sent.statusCode === 200
    && sent.body
    && sent.body.reply === "Checking with Growth — I'll post the answer here."
    && sent.body.waiting === false
    && !/grok|bridge|bot/i.test(sent.body.reply));
  check('query is read-only and creates no task',
    before.tasks.length === after.tasks.length
    && after.tasks.length === 0
    && after.researchyPending.length === 0
    && after.assignSeq === 0
    && after.ceoDeskQueries.length === 1
    && query.kind === 'ceo-query'
    && query.mayAct === false
    && query.instruction === 'data-only-query'
    && query.desk === 'growth'
    && query.ceoThreadId === sent.body.thread.id
    && query.correlationId === sent.body.correlationId
    && query.status === 'open'
    && !query.taskId);

  const pending = mockRes();
  await ops(bridgeReq('pending'), pending);
  check('a routed question is not left on the CEO wake inbox',
    pending.statusCode === 200
    && Array.isArray(pending.body.pending)
    && pending.body.pending.length === 0);

  const listed = mockRes();
  await ops(bridgeReq('desk-query'), listed);
  check('bridge list returns the open ceo-query',
    listed.statusCode === 200
    && listed.body.queries.length === 1
    && listed.body.queries[0].mayAct === false
    && listed.body.queries[0].instruction === 'data-only-query'
    && listed.body.queries[0].kind === 'ceo-query'
    && listed.body.queries[0].untrustedText.includes('<<<UNTRUSTED-CONTENT>>>')
    && listed.body.queries[0].untrustedText.includes('mayAct: no'));

  const growthList = mockRes();
  await ops({
    method: 'GET',
    headers: { authorization: `Bearer ${BRIDGE_SECRET}`, accept: 'application/json' },
    query: { area: 'api/desk-talk/growth/ceo-query' },
    url: '/ops/api/desk-talk/growth/ceo-query',
  }, growthList);
  const technicalList = mockRes();
  await ops({
    method: 'GET',
    headers: { authorization: `Bearer ${BRIDGE_SECRET}`, accept: 'application/json' },
    query: { area: 'api/desk-talk/technical/ceo-query' },
    url: '/ops/api/desk-talk/technical/ceo-query',
  }, technicalList);
  check('desk poll is scoped to that desk',
    growthList.statusCode === 200
    && growthList.body.queries.length === 1
    && growthList.body.queries[0].desk === 'growth'
    && technicalList.statusCode === 200
    && technicalList.body.queries.length === 0);

  const missing = mockRes();
  await ops(bridgeReq('desk-answer', {
    method: 'POST',
    secret: '',
    body: { correlationId: query.correlationId, text: 'no auth' },
  }), missing);
  const wrong = mockRes();
  await ops(bridgeReq('desk-answer', {
    method: 'POST',
    secret: 'not-the-bridge-secret-value!!',
    body: { correlationId: query.correlationId, text: 'wrong auth' },
  }), wrong);
  check('missing or wrong auth is rejected',
    missing.statusCode === 401 && missing.body.error === 'unauthorized'
    && wrong.statusCode === 401 && wrong.body.error === 'unauthorized');

  const wrongDesk = mockRes();
  await ops({
    method: 'POST',
    headers: {
      authorization: `Bearer ${BRIDGE_SECRET}`,
      accept: 'application/json',
      'content-type': 'application/json',
    },
    query: { area: 'api/desk-talk/technical/ceo-answer' },
    url: '/ops/api/desk-talk/technical/ceo-answer',
    body: { correlationId: query.correlationId, text: 'Wrong desk.' },
  }, wrongDesk);
  check('another desk cannot answer this query',
    wrongDesk.statusCode === 403 && wrongDesk.body.error === 'forbidden');

  const answeredPost = mockRes();
  await ops(bridgeReq('desk-answer', {
    method: 'POST',
    body: { correlationId: query.correlationId, text: 'The Starlink page is in review.' },
  }), answeredPost);
  const thread = mockRes();
  await ops(authed({
    url: `/ops/api/ceo-bridge/thread?id=${query.ceoThreadId}`,
    query: { area: 'api/ceo-bridge/thread', id: query.ceoThreadId },
  }), thread);
  const fromLines = (thread.body.thread.messages || []).filter((item) => (
    item.role === 'ceo' && String(item.text).includes('From Growth: The Starlink page is in review.')
  ));
  check('answer lands in the same CEO thread',
    answeredPost.statusCode === 200
    && answeredPost.body.replay === false
    && thread.body.thread.id === query.ceoThreadId
    && fromLines.length === 1
    && fromLines[0].text.includes("That's the live note from Growth."));
  const afterAnswer = await store.readStore();
  check('answering still creates no task',
    afterAnswer.tasks.length === 0
    && afterAnswer.researchyPending.length === 0
    && afterAnswer.ceoDeskQueries[0].status === 'answered'
    && afterAnswer.ceoDeskQueries[0].mayAct === false);

  const replay = mockRes();
  await ops(bridgeReq('desk-answer', {
    method: 'POST',
    body: { correlationId: query.correlationId, text: 'The Starlink page is in review.' },
  }), replay);
  const threadAgain = mockRes();
  await ops(authed({
    url: `/ops/api/ceo-bridge/thread?id=${query.ceoThreadId}`,
    query: { area: 'api/ceo-bridge/thread', id: query.ceoThreadId },
  }), threadAgain);
  const fromAgain = (threadAgain.body.thread.messages || []).filter((item) => (
    String(item.text).includes('From Growth:')
  ));
  check('a second answer is a replay', replay.statusCode === 200 && replay.body.replay === true && fromAgain.length === 1);

  const founderAnswer = mockRes();
  await ops(authed({
    method: 'POST',
    url: '/ops/api/ceo-bridge/message',
    query: { area: 'api/ceo-bridge/message' },
    body: { csrf: lib.createCsrfToken(ALLOWED), text: 'there is a bug on the site' },
  }), founderAnswer);
  const bug = (await store.readStore()).ceoDeskQueries.find((row) => row.desk === 'technical');
  const noCsrf = mockRes();
  await ops(authed({
    method: 'POST',
    url: '/ops/api/ceo-bridge/desk-answer',
    query: { area: 'api/ceo-bridge/desk-answer' },
    body: { correlationId: bug.correlationId, text: 'Founder skipped csrf.' },
  }), noCsrf);
  const founderPost = mockRes();
  await ops(authed({
    method: 'POST',
    url: '/ops/api/ceo-bridge/desk-answer',
    query: { area: 'api/ceo-bridge/desk-answer' },
    body: { csrf: lib.createCsrfToken(ALLOWED), correlationId: bug.correlationId, text: 'The homepage returns a 500.' },
  }), founderPost);
  check('founder session can post the answer and missing csrf cannot',
    noCsrf.statusCode === 403
    && founderPost.statusCode === 200
    && founderPost.body.reply.includes('From Technical: The homepage returns a 500.'));

  process.env.OPS_CEO_QUERY_TIMEOUT_MS = '1000';
  const waitingAsk = mockRes();
  await ops(authed({
    method: 'POST',
    url: '/ops/api/ceo-bridge/message',
    query: { area: 'api/ceo-bridge/message' },
    body: { csrf: lib.createCsrfToken(ALLOWED), text: 'pull request status' },
  }), waitingAsk);
  const waitingQuery = (await store.readStore()).ceoDeskQueries.find((row) => row.question === 'pull request status');
  await store.patchCeoDeskQuery(waitingQuery.correlationId, { createdAt: Date.now() - 60 * 1000 });
  const timed = mockRes();
  await ops(authed({
    url: `/ops/api/ceo-bridge/thread?id=${waitingQuery.ceoThreadId}`,
    query: { area: 'api/ceo-bridge/thread', id: waitingQuery.ceoThreadId },
  }), timed);
  const timedAgain = mockRes();
  await ops(authed({
    url: `/ops/api/ceo-bridge/thread?id=${waitingQuery.ceoThreadId}`,
    query: { area: 'api/ceo-bridge/thread', id: waitingQuery.ceoThreadId },
  }), timedAgain);
  const timeoutHits = (timedAgain.body.thread.messages || []).filter((item) => (
    item.text === "Technical hasn't answered yet; it will appear here when it lands."
  ));
  check('timeout notice is posted once',
    timed.statusCode === 200 && timeoutHits.length === 1);

  await store.patchCeoDeskQuery(waitingQuery.correlationId, { createdAt: Date.now() - (25 * 60 * 60 * 1000) });
  const expired = mockRes();
  await ops(authed({
    url: `/ops/api/ceo-bridge/thread?id=${waitingQuery.ceoThreadId}`,
    query: { area: 'api/ceo-bridge/thread', id: waitingQuery.ceoThreadId },
  }), expired);
  const expireHits = (expired.body.thread.messages || []).filter((item) => (
    item.text === 'That question to Technical expired after 24 hours. Ask again if you still need it.'
  ));
  const late = mockRes();
  await ops(bridgeReq('desk-answer', {
    method: 'POST',
    body: { correlationId: waitingQuery.correlationId, text: 'Too late.' },
  }), late);
  check('expired query tells the founder and rejects a late answer',
    expireHits.length === 1
    && late.statusCode === 409
    && late.body.error === 'query_expired');
  delete process.env.OPS_CEO_QUERY_TIMEOUT_MS;

  store.resetStore();
  ceo.resetCeoBridge();
  const l3 = mockRes();
  await ops(authed({
    method: 'POST',
    url: '/ops/api/ceo-bridge/message',
    query: { area: 'api/ceo-bridge/message' },
    body: { csrf: lib.createCsrfToken(ALLOWED), text: 'deploy the site' },
  }), l3);
  const l4 = mockRes();
  await ops(authed({
    method: 'POST',
    url: '/ops/api/ceo-bridge/message',
    query: { area: 'api/ceo-bridge/message' },
    body: { csrf: lib.createCsrfToken(ALLOWED), text: 'delete the secrets' },
  }), l4);
  const blocked = await store.readStore();
  check('L3 and L4 asks are not routed',
    blocked.ceoDeskQueries.length === 0
    && !String(l3.body.reply || '').includes('Checking with')
    && !String(l4.body.reply || '').includes('Checking with'));

  const offerPost = mockRes();
  await ops(authed({
    method: 'POST',
    url: '/ops/api/ceo-bridge/message',
    query: { area: 'api/ceo-bridge/message' },
    body: { csrf: lib.createCsrfToken(ALLOWED), text: 'suppliers for the catalog' },
  }), offerPost);
  const offered = await store.readStore();
  check('researchy stays an offer when its flag is off',
    offerPost.body.reply === 'Want me to ask Researchy?'
    && offered.ceoDeskQueries.length === 0
    && offered.researchyPending.length === 0
    && offered.tasks.length === 0);

  process.env.OPS_CEO_ROUTE_RESEARCHY = '1';
  const researchPost = mockRes();
  await ops(authed({
    method: 'POST',
    url: '/ops/api/ceo-bridge/message',
    query: { area: 'api/ceo-bridge/message' },
    body: { csrf: lib.createCsrfToken(ALLOWED), text: 'need suppliers for the catalog refresh' },
  }), researchPost);
  const researched = await store.readStore();
  check('researchy flag on writes a query and leaves assign keys alone',
    researchPost.body.reply === "Checking with Researchy — I'll post the answer here."
    && researched.ceoDeskQueries.length === 1
    && researched.ceoDeskQueries[0].desk === 'researchy'
    && researched.ceoDeskQueries[0].mayAct === false
    && researched.researchyPending.length === 0
    && researched.tasks.length === 0);
  delete process.env.OPS_CEO_ROUTE_RESEARCHY;

  const wrapped = ceo.ceoMessagesForXai({
    messages: [{
      role: 'ceo',
      text: "From Technical: The build is green.\nThat's the live note from Technical.",
      provenance: 'desk_answer',
      correlationId: 'desk-answer-1',
    }],
  });
  check('desk answers are untrusted when fed back to a model',
    wrapped.length === 1
    && wrapped[0].content.includes('<<<UNTRUSTED-CONTENT>>>')
    && wrapped[0].content.includes('mayAct: no')
    && wrapped[0].content.includes('The build is green.'));

  const passed = results.filter((item) => item.pass).length;
  const failed = results.filter((item) => !item.pass);
  failed.forEach((item) => console.log('FAIL', item.name));
  console.log(`${passed}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
