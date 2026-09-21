// Talk-ALL desks: persistent KV threads + xAI, Researchy Talk on, CEO B2 preserved.
const fs = require('fs');
const path = require('path');
const { assertPublicLogin } = require('./_public-login');

const opsDir = path.join(__dirname, '../api/ops');
const lib = require(path.join(opsDir, '_lib.js'));
const store = require(path.join(opsDir, '_store.js'));
const chat = require(path.join(opsDir, '_chat.js'));
const office = require(path.join(opsDir, '_office.js'));
const ceo = require(path.join(opsDir, '_ceo_bridge.js'));
const desks = require(path.join(opsDir, '_agent_thread.js'));
const ops = require(path.join(opsDir, 'index.js'));

const SECRET = 'test-ops-auth-secret-32chars!!';
const BRIDGE_SECRET = 'test-ceo-bridge-secret-32chars!!';
const ALLOWED = 'osmanjalloh104@gmail.com';
const DESK_IDS = ['lavaall-ceo', 'sales', 'technical', 'growth', 'lifecycle', 'researchy'];

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
    cookie: cookieFor(ALLOWED),
    host: 'preview.example.test',
    accept: asJson ? 'application/json' : 'text/html',
    'content-type': asJson ? 'application/json' : 'text/html',
  }, extra && extra.headers ? extra.headers : {});
  return {
    method: extra && extra.method ? extra.method : 'GET',
    headers,
    query: extra && extra.query ? extra.query : {},
    url: extra && extra.url ? extra.url : '/ops/chat',
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
  desks.resetDeskTalk();

  check('office Talk ids are the six desks including Researchy',
    office.TALK_AGENT_IDS.join(',') === DESK_IDS.join(',')
    && office.talkHref('researchy') === '/ops/chat/researchy'
    && office.isTalkAgent('researchy') === true);

  {
    for (const id of DESK_IDS) {
      const page = mockRes();
      await ops(authed({
        json: false,
        url: `/ops/chat?agent=${id}`,
        query: { area: 'chat', agent: id },
      }), page);
      const html = String(page.raw);
      const name = office.officeAgentById(id).name;
      const escaped = name.replace(/&/g, '&amp;');
      check(`${id} Talk page shows that desk and hides the helper`,
        page.statusCode === 200
        && html.includes(`<h1>${escaped}</h1>`)
        && !html.includes('<h2>Helper</h2>')
        && !html.includes('Anthropic')
        && !html.includes('OpenAI')
        && !html.includes('Helper connected')
        && !html.includes('assistant is not connected')
        && !html.includes('xai_runtime')
        && !html.includes('grok_bot_bridge')
        && html.includes(`"agentName":${JSON.stringify(name)}`)
        && html.includes('/assets/js/ops-ceo-chat.js?v=send-not-assign')
        && html.includes('id="talk-mic"')
        && html.includes('id="talk-mic-status"')
        && !html.includes('This desk uses Office Talk')
        && !html.includes('not the Anthropic or OpenAI helper')
        && (id === 'lavaall-ceo'
          ? html.includes('/ops/ceo-bridge/message')
          : html.includes(`/ops/desk-talk/${id}/message`)
            && !html.includes('/ops/ceo-bridge/thread')
            && !html.includes('>LAVAALL CEO<')
            && !html.includes('"agentName":"LAVAALL CEO"')));
    }
    const pathCeo = mockRes();
    await ops(authed({
      json: false,
      url: '/ops/chat/lavaall-ceo',
      query: { area: 'chat', agent: 'lavaall-ceo' },
    }), pathCeo);
    check('path /ops/chat/lavaall-ceo opens CEO Talk',
      pathCeo.statusCode === 200
      && String(pathCeo.raw).includes('<h1>LAVAALL CEO</h1>')
      && String(pathCeo.raw).includes('/ops/ceo-bridge/message')
      && !String(pathCeo.raw).includes('<h2>Helper</h2>'));
    const alias = mockRes();
    await ops(authed({
      json: false,
      url: '/ops/chat?agent=ceo',
      query: { area: 'chat', agent: 'ceo' },
    }), alias);
    check('agent=ceo is lavaall-ceo Talk, not the helper',
      alias.statusCode === 200
      && office.normalizeTalkAgentId('ceo') === 'lavaall-ceo'
      && String(alias.raw).includes('<h1>LAVAALL CEO</h1>')
      && String(alias.raw).includes('/ops/ceo-bridge/message')
      && !String(alias.raw).includes('<h2>Helper</h2>')
      && !String(alias.raw).includes('Helper connected'));
  }

  {
    process.env.XAI_API_KEY = 'test-xai-key-not-real';
    const seen = {};
    global.fetch = async (url, opts) => {
      const body = opts && opts.body ? JSON.parse(opts.body) : {};
      const system = body.messages && body.messages[0] ? String(body.messages[0].content) : '';
      const desk = DESK_IDS.find((id) => system.includes(desks.DESK_PROMPTS[id].lines[0].slice(0, 24))) || 'unknown';
      seen[desk] = (seen[desk] || 0) + 1;
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: `Draft from ${desk}. No price invented.` } }] }),
      };
    };

    const threads = {};
    for (const id of ['sales', 'technical', 'growth', 'lifecycle', 'researchy']) {
      const sent = mockRes();
      await ops(authed({
        json: true,
        method: 'POST',
        url: '/ops/api/desk-talk/message',
        query: { area: 'api/desk-talk/message', agent: id },
        body: {
          csrf: lib.createCsrfToken(ALLOWED),
          agentId: id,
          text: `Hello ${id}`,
          correlationId: `corr-${id}-1`,
        },
      }), sent);
      threads[id] = sent.body.thread;
      const assistants = (sent.body.thread.messages || []).filter((item) => item.role === 'assistant');
      check(`${id} xAI writes one reply into its own KV thread`,
        sent.statusCode === 200
        && sent.body.waiting === false
        && sent.body.thread.agentId === id
        && assistants.length === 1
        && assistants[0].text === `Draft from ${id}. No price invented.`
        && !Object.prototype.hasOwnProperty.call(assistants[0], 'provenance'));

      const retry = mockRes();
      await ops(authed({
        json: true,
        method: 'POST',
        url: '/ops/api/desk-talk/message',
        query: { area: 'api/desk-talk/message', agent: id },
        body: {
          csrf: lib.createCsrfToken(ALLOWED),
          agentId: id,
          text: `Hello ${id}`,
          correlationId: `corr-${id}-1`,
        },
      }), retry);
      check(`${id} HTTP retry does not duplicate`,
        retry.body.thread.messages.filter((item) => item.role === 'founder').length === 1
        && retry.body.thread.messages.filter((item) => item.role === 'assistant').length === 1
        && seen[id] === 1);

      const refresh = mockRes();
      await ops(authed({
        json: true,
        url: `/ops/api/desk-talk/thread?agent=${id}&id=${sent.body.thread.id}`,
        query: { area: 'api/desk-talk/thread', agent: id, id: sent.body.thread.id },
      }), refresh);
      check(`${id} refresh keeps the same thread`,
        refresh.statusCode === 200
        && refresh.headers['Cache-Control'] === 'no-store'
        && refresh.body.thread.messages.length === sent.body.thread.messages.length
        && refresh.body.agentId === id
        && refresh.body.agentName === office.officeAgentById(id).name);

      const visible = mockRes();
      await ops(authed({
        json: false,
        url: `/ops/chat?agent=${id}`,
        query: { area: 'chat', agent: id },
      }), visible);
      const page = String(visible.raw);
      const visibleName = office.officeAgentById(id).name.replace(/&/g, '&amp;');
      check(`${id} visible history uses that desk voice, not LAVAALL CEO`,
        page.includes(`<div class="kicker">${visibleName}</div>`)
        && page.includes(`Draft from ${id}. No price invented.`)
        && !page.includes('<div class="kicker">LAVAALL CEO</div>')
        && !page.includes('This desk uses Office Talk')
        && !page.includes('answering through the /ops Talk bridge'));
    }

    const salesId = threads.sales.id;
    const researchyId = threads.researchy.id;
    check('desk threads stay isolated from each other',
      salesId !== researchyId
      && salesId.startsWith('sales-')
      && researchyId.startsWith('researchy-'));

    const pathPoll = mockRes();
    await ops(authed({
      json: true,
      url: `/ops/api/desk-talk/sales/thread?id=${salesId}`,
      query: { area: 'api/desk-talk/sales/thread', id: salesId },
    }), pathPoll);
    check('desk thread poll keeps auth when agent is in the path, not only query',
      pathPoll.statusCode === 200
      && pathPoll.body.ok === true
      && pathPoll.body.agentId === 'sales'
      && pathPoll.body.thread.id === salesId);

    const ceoPoll = mockRes();
    await ops(authed({
      json: true,
      url: `/ops/api/ceo-bridge/thread?id=${salesId}`,
      query: { area: 'api/ceo-bridge/thread', id: salesId },
    }), ceoPoll);
    check('desk thread ids must not poll the CEO bridge',
      ceoPoll.statusCode === 403
      && ceoPoll.body.error === 'forbidden');

    const inspected = await desks.inspectDeskThread('sales', salesId);
    check('sales KV provenance is xAI-owned and not on the CEO key',
      inspected.thread.messages.find((item) => item.role === 'founder').responseOwner === 'xai_runtime'
      && inspected.thread.messages.find((item) => item.role === 'assistant').provenance === 'xai_runtime'
      && desks.threadKey('sales', salesId) === `ops:agent:thread:sales:${salesId}`
      && !desks.threadKey('sales', salesId).includes('ops:ceo:thread:'));

    const prompt = desks.deskSystemPrompt('researchy', { goal: null, tasks: [], notes: [] });
    check('per-desk system stub is quote-first and forbids invented prices',
      prompt.includes('Researchy')
      && prompt.includes(desks.MARKETS_STUB)
      && prompt.includes('Do not invent prices')
      && prompt.includes('Assigned research from LAVAALL CEO'));

    const pending = await ceo.listPending();
    check('non-CEO xAI turns are not added to the CEO B2 inbox',
      pending.ok === true && pending.pending.length === 0);

    desks.resetDeskTalk();
    global.fetch = async () => ({ ok: false, status: 503, json: async () => ({}) });
    const salesFail = mockRes();
    await ops(authed({
      json: true,
      method: 'POST',
      url: '/ops/api/desk-talk/message',
      query: { area: 'api/desk-talk/message', agent: 'sales' },
      body: {
        csrf: lib.createCsrfToken(ALLOWED),
        agentId: 'sales',
        text: 'xAI is down at sales',
        correlationId: 'corr-sales-fail-1',
      },
    }), salesFail);
    const salesFailAssistants = (salesFail.body.thread.messages || []).filter((item) => item.role === 'assistant');
    check('sales xAI failure answers with a runtime notice, not Waiting forever',
      salesFail.statusCode === 200
      && salesFail.body.waiting === false
      && salesFail.body.usedModel === false
      && salesFail.body.thread.status === 'answered'
      && salesFailAssistants.length === 1
      && salesFailAssistants[0].text === desks.runtimeUnavailableCopy('sales'));

    const inspectedFail = await desks.inspectDeskThread('sales', salesFail.body.thread.id);
    check('sales runtime notice is system provenance and marked answered',
      inspectedFail.thread.status === 'answered'
      && inspectedFail.thread.answeredIds.includes('corr-sales-fail-1')
      && inspectedFail.thread.messages.find((item) => item.role === 'assistant').provenance === 'system');

    desks.resetDeskTalk();
    global.fetch = async () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    };
    const salesTimeout = mockRes();
    await ops(authed({
      json: true,
      method: 'POST',
      url: '/ops/api/desk-talk/message',
      query: { area: 'api/desk-talk/message', agent: 'sales' },
      body: {
        csrf: lib.createCsrfToken(ALLOWED),
        agentId: 'sales',
        text: 'xAI timed out at sales',
        correlationId: 'corr-sales-timeout-1',
      },
    }), salesTimeout);
    check('sales xAI timeout answers the thread instead of staying pending',
      salesTimeout.statusCode === 200
      && salesTimeout.body.waiting === false
      && salesTimeout.body.thread.status === 'answered'
      && (salesTimeout.body.thread.messages || []).some((item) => (
        item.role === 'assistant' && item.text === desks.runtimeUnavailableCopy('sales')
      )));

    delete process.env.XAI_API_KEY;
    global.fetch = origFetch;
  }

  {
    ceo.resetCeoBridge();
    desks.resetDeskTalk();
    const queued = await chat.sendChatTurn({
      question: 'Need a status',
      createdBy: ALLOWED,
      agentId: 'lavaall-ceo',
    });
    check('CEO Talk still uses the A–D bridge when xAI is unset',
      queued.ceoBridge === true
      && queued.waiting === true
      && queued.reply.includes('Waiting on CEO'));
    const listed = await ceo.listPending();
    check('CEO BRIDGE-OK pending still works',
      listed.pending.some((item) => item.text === 'Need a status'));

    const salesWait = await chat.sendChatTurn({
      question: 'Need a sales draft',
      createdBy: ALLOWED,
      agentId: 'sales',
    });
    check('sales without xAI waits and does not invent a reply',
      salesWait.waiting === true
      && salesWait.usedModel === false
      && salesWait.reply.includes('Waiting on LAVAALL Sales')
      && !salesWait.reply.includes('helper should not run'));
  }

  {
    const src = fs.readFileSync(path.join(opsDir, '_agent_thread.js'), 'utf8');
    const xai = fs.readFileSync(path.join(opsDir, '_xai.js'), 'utf8');
    check('desk Talk reuses the xAI adapter and stays underscored',
      fs.existsSync(path.join(opsDir, '_agent_thread.js'))
      && !fs.existsSync(path.join(opsDir, 'agent-thread.js'))
      && src.includes('ops:agent:thread:')
      && src.includes("require('./_xai')")
      && xai.includes('https://api.x.ai/v1/chat/completions')
      && !src.includes('Assign routing'));
    const note = fs.readFileSync(path.join(__dirname, '../docs/OPS-CEO-BRIDGE.md'), 'utf8');
    check('docs list per-desk smoke for all six Talk agents',
      note.includes('Talk-ALL')
      && DESK_IDS.every((id) => note.includes(`/ops/chat/${id}`)));
    const chatJs = fs.readFileSync(path.join(__dirname, '../assets/js/ops-ceo-chat.js'), 'utf8');
    check('Talk JS keeps the desk voice and desk poll URL',
      chatJs.includes('function deskVoice()')
      && chatJs.includes('graph.agentName')
      && chatJs.includes("'/ops/desk-talk/' + encodeURIComponent(agentId) + '/thread")
      && chatJs.includes("last.role === 'assistant'")
      && chatJs.includes('isTalkChromeNoise')
      && chatJs.includes('/ceo-bridge/i.test(url) && !isCeoTalk()')
      && chatJs.includes("isDeskTalk() && url.indexOf('/ops/desk-talk/')")
      && !chatJs.includes('/ops/api/ceo-bridge')
      && !chatJs.includes("mine ? 'You' : 'LAVAALL CEO'"));
    check('Talk JS binds browser SpeechRecognition into the compose box',
      chatJs.includes('webkitSpeechRecognition')
      && chatJs.includes('bindTalkMic')
      && chatJs.includes('Microphone permission denied')
      && !chatJs.includes('api.openai.com')
      && !chatJs.includes('/stt'));
  }

  {
    const home = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
    assertPublicLogin(check, home);
    check('public catalog still has no desk Talk API',
      !home.includes('/ops/api/desk-talk') && !home.includes('href="/ops/chat?agent=researchy"'));
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
