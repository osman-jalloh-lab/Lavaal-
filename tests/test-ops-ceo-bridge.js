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
  delete process.env.XAI_API_KEY;
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
    check('thread poll responses are not cacheable',
      String(thread.headers['Cache-Control'] || thread.headers['cache-control'] || '') === 'no-store');

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
    const afterReply = mockRes();
    await ops(authed({
      json: true,
      url: `/ops/api/ceo-bridge/thread?id=${queued.thread.id}`,
      query: { area: 'api/ceo-bridge/thread', id: queued.thread.id },
    }), afterReply);
    check('GET thread after reply clears waiting without a page reload',
      afterReply.statusCode === 200
      && afterReply.body.waiting === false
      && ceo.threadIsWaiting(afterReply.body.thread) === false
      && afterReply.body.thread.status === 'answered'
      && afterReply.body.thread.messages.some((item) => item.role === 'ceo'));
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
      question: 'Draft a note about the catalog tone.',
      selection: {},
      createdBy: ALLOWED,
      agentId: 'sales',
    });
    check('sales Talk uses desk Talk and never calls the Anthropic helper',
      sales.deskTalk === true && sales.usedModel === false && fetchCalls === 0 && sales.route.leadAgent === 'sales');
    const everyone = await chat.sendChatTurn({
      question: 'Draft a note about the catalog tone.',
      selection: {},
      createdBy: ALLOWED,
    });
    check('everyone chat still reaches the helper when configured',
      everyone.usedModel === true && fetchCalls >= 1);
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
    check('sales Talk uses desk Talk, not the helper and not the CEO B2 form',
      String(sales.raw).includes('name="agentId" value="sales"')
      && String(sales.raw).includes('/ops/desk-talk/sales/message')
      && !String(sales.raw).includes('<h2>Helper</h2>')
      && !String(sales.raw).includes('/ops/ceo-bridge/')
      && !String(sales.raw).includes('/ops/api/ceo-bridge/'));

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
    check('waiting is false once the last message is a CEO reply',
      ceo.threadIsWaiting({ status: 'pending', messages: [{ role: 'founder', text: 'Hi' }] }) === true
      && ceo.threadIsWaiting({ status: 'pending', messages: [{ role: 'founder', text: 'Hi' }, { role: 'ceo', text: 'Ok' }] }) === false
      && ceo.threadIsWaiting({ status: 'answered', messages: [{ role: 'ceo', text: 'Ok' }] }) === false);
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
    check('OS note has smoke steps, xAI + B2 ownership, extended poll, and prod HOLD',
      note.includes('Preview smoke')
      && note.includes('XAI_API_KEY')
      && note.includes('explicit wake')
      && note.includes('not limited to 9')
      && note.includes('GET {PREVIEW_ORIGIN}/ops/api/ceo-bridge/pending')
      && note.includes('POST {PREVIEW_ORIGIN}/ops/api/ceo-bridge/reply')
      && note.includes('Prod HOLD'));
    check('env example names XAI_API_KEY only',
      envExample.includes('XAI_API_KEY=')
      && !/XAI_API_KEY=\S+/.test(envExample));
    const xaiMod = require(path.join(opsDir, '_xai.js'));
    const xaiSrc = fs.readFileSync(path.join(opsDir, '_xai.js'), 'utf8');
    check('xAI stays in a small underscored adapter',
      fs.existsSync(path.join(opsDir, '_xai.js'))
      && !fs.existsSync(path.join(opsDir, 'xai.js'))
      && xaiSrc.includes('https://api.x.ai/v1/chat/completions')
      && xaiSrc.includes('grok-4.3')
      && !xaiSrc.includes("require('./_ceo_bridge')"));
    check('xAI CEO/desk timeout is 20–25s under the Hobby ops budget',
      xaiMod.DEFAULT_TIMEOUT_MS >= 20000
      && xaiMod.DEFAULT_TIMEOUT_MS <= 25000);
    const vercel = JSON.parse(fs.readFileSync(path.join(__dirname, '../vercel.json'), 'utf8'));
    check('ops function maxDuration is 30s so the xAI wait fits under Hobby',
      vercel.functions
      && vercel.functions['api/ops/index.js']
      && vercel.functions['api/ops/index.js'].maxDuration === 30
      && xaiMod.DEFAULT_TIMEOUT_MS < vercel.functions['api/ops/index.js'].maxDuration * 1000);
    const chatJs = fs.readFileSync(path.join(__dirname, '../assets/js/ops-ceo-chat.js'), 'utf8');
    check('CEO chat poll busts cache and clears waiting when a CEO reply lands',
      chatJs.includes("cache: 'no-store'")
      && chatJs.includes("t=' + Date.now()")
      && chatJs.includes("last.role === 'ceo'")
      && chatJs.includes('poll();')
      && chatJs.includes('setInterval(poll, 2000)')
      && chatJs.includes('applyThread(payload.thread, payload.waiting)'));
  }

  {
    ceo.resetCeoBridge();
    store.resetStore();
    await store.saveGoal({
      title: 'Ship Preview Slice 1',
      definitionOfDone: 'CEO Talk writes into KV',
      nextStep: 'Keep Researchy first on sourcing',
    });
    process.env.XAI_API_KEY = 'test-xai-key-not-real';
    let xaiCalls = 0;
    let lastXaiBody = null;
    global.fetch = async (url, opts) => {
      xaiCalls += 1;
      lastXaiBody = opts && opts.body ? JSON.parse(opts.body) : null;
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'Preview draft from CEO. No deploy.' } }] }),
      };
    };

    const first = mockRes();
    await ops(authed({
      json: true,
      method: 'POST',
      url: '/ops/api/ceo-bridge/message',
      query: { area: 'api/ceo-bridge/message' },
      body: {
        csrf: lib.createCsrfToken(ALLOWED),
        text: 'Need a Preview status',
        correlationId: 'corr-xai-1',
      },
    }), first);
    const ceoNotes = (first.body.thread.messages || []).filter((item) => item.role === 'ceo');
    const founderNotes = (first.body.thread.messages || []).filter((item) => item.role === 'founder');
    check('xAI writes one CEO reply into the same KV thread',
      first.statusCode === 200
      && first.body.ok === true
      && first.body.waiting === false
      && first.body.thread.status === 'answered'
      && founderNotes.length === 1
      && ceoNotes.length === 1
      && ceoNotes[0].text === 'Preview draft from CEO. No deploy.'
      && !Object.prototype.hasOwnProperty.call(ceoNotes[0], 'provenance')
      && xaiCalls === 1
      && lastXaiBody
      && lastXaiBody.model === 'grok-4.3'
      && String(lastXaiBody.messages[0].content).includes('Researchy-first')
      && String(lastXaiBody.messages[0].content).includes('Do not invent prices'));

    const pendingAfterXai = await ceo.listPending();
    check('normal xAI chat is not left on the B2 wake inbox',
      pendingAfterXai.ok === true && pendingAfterXai.pending.every((item) => item.threadId !== first.body.thread.id));

    const refreshA = mockRes();
    await ops(authed({
      json: true,
      url: `/ops/api/ceo-bridge/thread?id=${first.body.thread.id}`,
      query: { area: 'api/ceo-bridge/thread', id: first.body.thread.id },
    }), refreshA);
    const refreshB = mockRes();
    await ops(authed({
      json: true,
      url: `/ops/api/ceo-bridge/thread?id=${first.body.thread.id}`,
      query: { area: 'api/ceo-bridge/thread', id: first.body.thread.id },
    }), refreshB);
    check('refresh does not add another turn',
      refreshA.statusCode === 200
      && refreshA.body.waiting === false
      && refreshA.body.thread.messages.length === first.body.thread.messages.length
      && refreshB.body.thread.messages.length === refreshA.body.thread.messages.length
      && xaiCalls === 1);

    const retry = mockRes();
    await ops(authed({
      json: true,
      method: 'POST',
      url: '/ops/api/ceo-bridge/message',
      query: { area: 'api/ceo-bridge/message' },
      body: {
        csrf: lib.createCsrfToken(ALLOWED),
        text: 'Need a Preview status',
        correlationId: 'corr-xai-1',
      },
    }), retry);
    check('HTTP retry of the same correlationId does not duplicate',
      retry.statusCode === 200
      && retry.body.thread.messages.filter((item) => item.role === 'founder').length === 1
      && retry.body.thread.messages.filter((item) => item.role === 'ceo').length === 1
      && xaiCalls === 1);

    const bridgeAfter = mockRes();
    await ops(bridgeReq('reply', {
      body: {
        threadId: first.body.thread.id,
        text: 'Second brain must not append.',
        pendingId: 'corr-xai-1',
      },
    }), bridgeAfter);
    check('B2 reply is a replay when xAI already owned that founder message',
      bridgeAfter.statusCode === 200
      && bridgeAfter.body.replay === true
      && bridgeAfter.body.thread.messages.filter((item) => item.role === 'ceo').length === 1
      && !bridgeAfter.body.thread.messages.some((item) => item.text === 'Second brain must not append.'));

    const inspected = await ceo.inspectCeoThread(first.body.thread.id);
    const internalFounder = inspected.thread.messages.find((item) => item.role === 'founder');
    const internalCeo = inspected.thread.messages.find((item) => item.role === 'ceo');
    check('KV provenance records xAI ownership and correlation',
      internalFounder.provenance === 'human'
      && internalFounder.responseOwner === 'xai_runtime'
      && internalFounder.correlationId === 'corr-xai-1'
      && internalCeo.provenance === 'xai_runtime'
      && internalCeo.correlationId === 'corr-xai-1');

    const page = mockRes();
    await ops(authed({
      json: false,
      url: '/ops/chat?agent=lavaall-ceo',
      query: { area: 'chat', agent: 'lavaall-ceo' },
    }), page);
    check('UI stays one LAVAALL CEO with no dual-brain labels',
      String(page.raw).includes('LAVAALL CEO')
      && String(page.raw).includes('Preview draft from CEO. No deploy.')
      && !String(page.raw).includes('xai_runtime')
      && !String(page.raw).includes('grok_bot_bridge')
      && !String(page.raw).includes('second brain'));

    ceo.resetCeoBridge();
    const wake = mockRes();
    const xaiBeforeWake = xaiCalls;
    await ops(authed({
      json: true,
      method: 'POST',
      url: '/ops/api/ceo-bridge/message',
      query: { area: 'api/ceo-bridge/message' },
      body: {
        csrf: lib.createCsrfToken(ALLOWED),
        text: '@grok check the queue',
        correlationId: 'corr-wake-1',
      },
    }), wake);
    const wakePending = await ceo.listPending();
    check('explicit wake skips xAI and stays on the B2 inbox',
      wake.statusCode === 200
      && wake.body.waiting === true
      && xaiCalls === xaiBeforeWake
      && wakePending.pending.some((item) => item.correlationId === 'corr-wake-1')
      && ceo.isExplicitWake({ text: '@grok check the queue' }) === true);

    ceo.resetCeoBridge();
    global.fetch = async () => ({ ok: false, status: 503, json: async () => ({}) });
    const failed = mockRes();
    await ops(authed({
      json: true,
      method: 'POST',
      url: '/ops/api/ceo-bridge/message',
      query: { area: 'api/ceo-bridge/message' },
      body: {
        csrf: lib.createCsrfToken(ALLOWED),
        text: 'xAI is down',
        correlationId: 'corr-fail-1',
      },
    }), failed);
    const failPending = await ceo.listPending();
    const failCeo = (failed.body.thread.messages || []).find((item) => item.role === 'ceo');
    check('xAI failure answers the thread with a runtime notice, not Waiting',
      failed.statusCode === 200
      && failed.body.ok === true
      && failed.body.waiting === false
      && failed.body.usedModel === false
      && failed.body.thread.status === 'answered'
      && failCeo
      && failCeo.text === ceo.RUNTIME_UNAVAILABLE_COPY
      && failPending.pending.every((item) => item.correlationId !== 'corr-fail-1'));

    const inspectedFail = await ceo.inspectCeoThread(failed.body.thread.id);
    const internalFailCeo = inspectedFail.thread.messages.find((item) => item.role === 'ceo');
    check('runtime notice is system provenance and the founder turn is answered',
      inspectedFail.thread.status === 'answered'
      && inspectedFail.thread.answeredIds.includes('corr-fail-1')
      && internalFailCeo.provenance === 'system'
      && internalFailCeo.correlationId === 'corr-fail-1');

    const recovered = mockRes();
    await ops(bridgeReq('reply', {
      body: {
        threadId: failed.body.thread.id,
        text: 'Bridge recovered the turn.',
        pendingId: 'corr-fail-1',
      },
    }), recovered);
    check('B2 does not append a second CEO turn after the runtime notice',
      recovered.statusCode === 200
      && recovered.body.replay === true
      && recovered.body.thread.messages.filter((item) => item.role === 'ceo').length === 1
      && !recovered.body.thread.messages.some((item) => item.text === 'Bridge recovered the turn.'));

    ceo.resetCeoBridge();
    global.fetch = async (_url, opts) => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      if (opts && opts.signal && typeof opts.signal.addEventListener === 'function') {
        // Adapter still attaches an abort listener; no wait — simulate timeout now.
      }
      throw err;
    };
    const timedOut = mockRes();
    await ops(authed({
      json: true,
      method: 'POST',
      url: '/ops/api/ceo-bridge/message',
      query: { area: 'api/ceo-bridge/message' },
      body: {
        csrf: lib.createCsrfToken(ALLOWED),
        text: 'xAI timed out',
        correlationId: 'corr-timeout-1',
      },
    }), timedOut);
    const timeoutPending = await ceo.listPending();
    const timeoutCeo = (timedOut.body.thread.messages || []).find((item) => item.role === 'ceo');
    check('xAI timeout answers the thread with a runtime notice, not stuck pending',
      timedOut.statusCode === 200
      && timedOut.body.waiting === false
      && timedOut.body.thread.status === 'answered'
      && timeoutCeo
      && timeoutCeo.text === ceo.RUNTIME_UNAVAILABLE_COPY
      && timeoutPending.pending.every((item) => item.correlationId !== 'corr-timeout-1'));

    const xaiModTimeout = require(path.join(opsDir, '_xai.js'));
    process.env.XAI_API_KEY = 'test-xai-key-not-real';
    global.fetch = (url, opts) => new Promise((_, reject) => {
      if (!opts || !opts.signal) {
        reject(new Error('missing abort signal'));
        return;
      }
      opts.signal.addEventListener('abort', () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        reject(err);
      });
    });
    const adapterTimeout = await xaiModTimeout.completeXai({
      system: 'CEO',
      messages: [{ role: 'user', content: 'ping' }],
      timeoutMs: 20,
    });
    check('completeXai abort path returns helper_failed timeout',
      adapterTimeout.error === 'helper_failed'
      && adapterTimeout.status === 'timeout');

    delete process.env.XAI_API_KEY;
    global.fetch = origFetch;
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
