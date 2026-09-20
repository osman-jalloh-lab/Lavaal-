// Tickets 12b–12e — CEO Talk bridge: store, bearer adapter, UI, deny.
const fs = require('fs');
const path = require('path');
const { assertPublicLogin } = require('./_public-login');

const opsDir = path.join(__dirname, '../api/ops');
const lib = require(path.join(opsDir, '_lib.js'));
const store = require(path.join(opsDir, '_store.js'));
const chat = require(path.join(opsDir, '_chat.js'));
const ceo = require(path.join(opsDir, '_ceo_bridge.js'));
const ops = require(path.join(opsDir, 'index.js'));

const SECRET = 'test-ops-auth-secret-32chars!!';
const BRIDGE_SECRET = 'test-ceo-bridge-secret-32chars!!';
const ALLOWED = 'osmanjalloh104@gmail.com';
const OTHER = 'abdulhbah55@gmail.com';
const STRANGER = 'stranger@example.com';

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
  const asJson = extra && extra.json !== false;
  const headers = Object.assign({
    cookie: cookieFor((extra && extra.email) || ALLOWED),
    host: 'preview.example.test',
    accept: asJson ? 'application/json' : 'text/html',
    'content-type': asJson ? 'application/json' : 'text/html',
  }, extra && extra.headers ? extra.headers : {});
  return {
    method: extra && extra.method ? extra.method : 'GET',
    headers,
    query: extra && extra.query ? extra.query : {},
    url: extra && extra.url ? extra.url : '/ops/chat?agent=lavaall-ceo',
    body: extra && extra.body,
  };
}

function bridgeReq(kind, extra) {
  const asJson = extra && extra.json !== false;
  const secret = extra && extra.secret !== undefined ? extra.secret : BRIDGE_SECRET;
  const headers = Object.assign({
    host: 'preview.example.test',
    accept: 'application/json',
    'content-type': 'application/json',
  }, extra && extra.headers ? extra.headers : {});
  if (secret) headers.authorization = `Bearer ${secret}`;
  return {
    method: extra && extra.method ? extra.method : (kind === 'reply' ? 'POST' : 'GET'),
    headers,
    query: extra && extra.query ? extra.query : { area: `api/ceo-bridge/${kind}` },
    url: extra && extra.url ? extra.url : `/ops/api/ceo-bridge/${kind}`,
    body: extra && extra.body,
  };
}

async function run() {
  const origFetch = global.fetch;
  process.env.OPS_AUTH_SECRET = SECRET;
  process.env.OPS_CEO_BRIDGE_SECRET = BRIDGE_SECRET;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  store.resetStore();
  ceo.resetCeoBridge();

  {
    const unauth = mockRes();
    await ops({
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      query: { area: 'api/ceo-bridge/message' },
      url: '/ops/api/ceo-bridge/message',
      body: { csrf: lib.createCsrfToken(ALLOWED), text: 'Hello CEO' },
    }, unauth);
    check('unauthenticated founder POST is 403',
      unauth.statusCode === 403 && unauth.body && unauth.body.error === 'forbidden');

    const stranger = mockRes();
    await ops({
      method: 'POST',
      headers: {
        cookie: cookieFor(STRANGER),
        accept: 'application/json',
        'content-type': 'application/json',
      },
      query: { area: 'api/ceo-bridge/message' },
      url: '/ops/api/ceo-bridge/message',
      body: { csrf: lib.createCsrfToken(STRANGER), text: 'Hello CEO' },
    }, stranger);
    check('wrong email cannot enqueue',
      stranger.statusCode === 403 && stranger.body && (stranger.body.error === 'forbidden' || stranger.body.error === 'agent_denied'));

    const noCsrf = mockRes();
    await ops(authed({
      json: true,
      method: 'POST',
      url: '/ops/api/ceo-bridge/message',
      query: { area: 'api/ceo-bridge/message' },
      body: { text: 'Hello CEO' },
    }), noCsrf);
    check('founder POST without CSRF is 403',
      noCsrf.statusCode === 403 && noCsrf.body && noCsrf.body.error === 'csrf');

    const agent = mockRes();
    await ops(authed({
      json: true,
      method: 'POST',
      url: '/ops/api/ceo-bridge/message',
      query: { area: 'api/ceo-bridge/message' },
      headers: { 'x-lavaall-agent': 'lavaall-ceo', authorization: 'Bearer simulated-agent-token' },
      body: { csrf: lib.createCsrfToken(ALLOWED), text: 'Hello CEO' },
    }), agent);
    check('agent header cannot enqueue as founder',
      agent.statusCode === 403 && agent.body && agent.body.error === 'agent_denied');
  }

  {
    ceo.resetCeoBridge();
    const sent = mockRes();
    await ops(authed({
      json: true,
      method: 'POST',
      url: '/ops/api/ceo-bridge/message',
      query: { area: 'api/ceo-bridge/message' },
      body: { csrf: lib.createCsrfToken(ALLOWED), text: 'Ship the Preview MVP' },
    }), sent);
    check('founder enqueue stores a pending thread',
      sent.statusCode === 200
      && sent.body.ok === true
      && sent.body.waiting === true
      && sent.body.thread
      && sent.body.thread.status === 'pending'
      && sent.body.thread.messages.some((item) => item.role === 'founder' && item.text === 'Ship the Preview MVP'));

    const pending = mockRes();
    await ops(bridgeReq('pending'), pending);
    check('secret client lists the pending founder text',
      pending.statusCode === 200
      && pending.body.ok === true
      && Array.isArray(pending.body.pending)
      && pending.body.pending.some((item) => item.text === 'Ship the Preview MVP' && item.threadId === sent.body.thread.id));

    const thread = mockRes();
    await ops(authed({
      json: true,
      url: `/ops/api/ceo-bridge/thread?id=${sent.body.thread.id}`,
      query: { area: 'api/ceo-bridge/thread', id: sent.body.thread.id },
    }), thread);
    check('founder GET thread shows the enqueued message',
      thread.statusCode === 200
      && thread.body.waiting === true
      && thread.body.thread.messages[0].text === 'Ship the Preview MVP');

    const other = mockRes();
    await ops(authed({
      json: true,
      email: OTHER,
      url: `/ops/api/ceo-bridge/thread?id=${sent.body.thread.id}`,
      query: { area: 'api/ceo-bridge/thread', id: sent.body.thread.id },
    }), other);
    check('the other founder cannot read this thread id',
      other.statusCode === 403 && other.body && other.body.error === 'forbidden');
  }

  {
    const missing = mockRes();
    await ops(bridgeReq('pending', { secret: '' }), missing);
    check('pending without bearer is 401',
      missing.statusCode === 401 && missing.body && missing.body.error === 'unauthorized');

    const wrong = mockRes();
    await ops(bridgeReq('pending', { secret: 'wrong-ceo-bridge-secret!!' }), wrong);
    check('pending with a bad secret is 401',
      wrong.statusCode === 401 && wrong.body && wrong.body.error === 'unauthorized');

    const replyBad = mockRes();
    await ops(bridgeReq('reply', {
      secret: 'nope-not-the-bridge-secret',
      body: { threadId: 'ceo-x', text: 'No' },
    }), replyBad);
    check('reply with a bad secret is 401',
      replyBad.statusCode === 401 && replyBad.body && replyBad.body.error === 'unauthorized');
  }

  {
    const queued = await ceo.enqueueFounderMessage({
      text: 'Need a Preview status',
      founderEmail: ALLOWED,
      source: 'ops-office',
    });
    const pendingId = queued.pending && queued.pending.messageId;
    const replied = mockRes();
    await ops(bridgeReq('reply', {
      body: {
        threadId: queued.thread.id,
        text: 'Preview is on track. No deploy.',
        pendingId,
      },
    }), replied);
    check('CEO reply appends and clears pending',
      replied.statusCode === 200
      && replied.body.ok === true
      && replied.body.thread.status === 'answered'
      && replied.body.thread.messages.some((item) => item.role === 'ceo' && item.text === 'Preview is on track. No deploy.'));

    const after = await ceo.listPending();
    check('pending list is empty after reply',
      after.ok === true && after.pending.every((item) => item.threadId !== queued.thread.id));

    const replay = mockRes();
    await ops(bridgeReq('reply', {
      body: {
        threadId: queued.thread.id,
        text: 'Preview is on track. No deploy.',
        pendingId,
      },
    }), replay);
    const ceoNotes = (replay.body.thread.messages || []).filter((item) => item.role === 'ceo');
    check('replayed reply does not append again',
      replay.statusCode === 200 && replay.body.replay === true && ceoNotes.length === 1);

    const visible = mockRes();
    await ops(authed({
      json: false,
      url: '/ops/chat?agent=lavaall-ceo',
      query: { area: 'chat', agent: 'lavaall-ceo' },
    }), visible);
    check('CEO reply is visible on the lavaall-ceo chat page',
      String(visible.raw).includes('Preview is on track. No deploy.')
      && String(visible.raw).includes('LAVAALL CEO')
      && String(visible.raw).includes('Waiting on CEO'));
  }

  {
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key-not-real';
    let fetchCalls = 0;
    global.fetch = async () => {
      fetchCalls += 1;
      return { ok: true, json: async () => ({ content: [{ type: 'text', text: 'helper should not run' }] }) };
    };
    const desk = await chat.sendChatTurn({
      question: 'Give me a plan.',
      createdBy: ALLOWED,
      agentId: 'lavaall-ceo',
    });
    check('sendChatTurn for lavaall-ceo never calls the helper',
      desk.ok === true && desk.usedModel === false && desk.ceoBridge === true && fetchCalls === 0);

    const sales = await chat.sendChatTurn({
      question: 'What is the next step?',
      selection: {},
      createdBy: ALLOWED,
      agentId: 'sales',
    });
    check('other agent chat routes still reach the helper when configured',
      sales.usedModel === true && fetchCalls >= 1 && sales.route.leadAgent === 'sales');
    delete process.env.ANTHROPIC_API_KEY;
    global.fetch = origFetch;
  }

  {
    const sales = mockRes();
    await ops(authed({
      json: false,
      url: '/ops/chat?agent=sales',
      query: { area: 'chat', agent: 'sales' },
    }), sales);
    check('sales Talk still uses the existing helper chat',
      String(sales.raw).includes('name="action" value="send-chat"')
      && String(sales.raw).includes('name="agent" value="sales"')
      && String(sales.raw).includes('<h2>Helper</h2>')
      && !String(sales.raw).includes('/ops/api/ceo-bridge/message'));

    const everyone = mockRes();
    await ops(authed({
      json: false,
      url: '/ops/chat',
      query: { area: 'chat' },
    }), everyone);
    check('Chat without an agent stays the helper / everyone path',
      String(everyone.raw).includes('This tab talks to everyone')
      && String(everyone.raw).includes('name="action" value="send-chat"')
      && !String(everyone.raw).includes('name="agent"'));
  }

  {
    const src = fs.readFileSync(path.join(opsDir, '_ceo_bridge.js'), 'utf8');
    check('bridge uses dedicated KV keys and never posts Slack',
      src.includes('ops:ceo:thread:')
      && src.includes('ops:ceo:pending')
      && !src.includes('chat.postMessage')
      && !src.includes('LAVAALL_TASK'));
    check('Hobby function stays underscored',
      fs.existsSync(path.join(opsDir, '_ceo_bridge.js'))
      && !fs.existsSync(path.join(opsDir, 'ceo-bridge.js')));
    const envExample = fs.readFileSync(path.join(__dirname, '../.env.example'), 'utf8');
    check('env example names OPS_CEO_BRIDGE_SECRET only',
      envExample.includes('OPS_CEO_BRIDGE_SECRET=')
      && !/OPS_CEO_BRIDGE_SECRET=\S+/.test(envExample));
    const note = fs.readFileSync(path.join(__dirname, '../docs/OPS-CEO-BRIDGE.md'), 'utf8');
    check('OS note has smoke steps, weekday routine prompt, and prod HOLD',
      note.includes('Preview smoke')
      && note.includes('weekday daytime')
      && note.includes('GET {PREVIEW_ORIGIN}/ops/api/ceo-bridge/pending')
      && note.includes('POST {PREVIEW_ORIGIN}/ops/api/ceo-bridge/reply')
      && note.includes('Prod HOLD'));
  }

  {
    const home = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
    assertPublicLogin(check, home);
    check('public catalog still has no CEO bridge link',
      !home.includes('/ops/api/ceo-bridge') && !home.includes('href="/ops/chat?agent=lavaall-ceo"'));
  }

  global.fetch = origFetch;
  let failed = 0;
  for (const r of results) {
    console.log((r.pass ? 'PASS' : 'FAIL') + ' - ' + r.name);
    if (!r.pass) failed++;
  }
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
