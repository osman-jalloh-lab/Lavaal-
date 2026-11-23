// Founder-only /ops/harness chat, history, and usage. No real provider calls.
'use strict';

const path = require('path');
const lib = require(path.join(__dirname, '../api/ops/_lib.js'));

const SECRET = 'test-ops-auth-secret-32chars!!';
const ALLOWED = 'osmanjalloh104@gmail.com';
const FAKE_OPENAI = 'sk-test-DO-NOT-PRINT-openai-aaaaaaaa';
const FAKE_ANTHROPIC = 'sk-ant-test-DO-NOT-PRINT-bbbbbbbb';
const FAKE_DEEPSEEK = 'sk-test-DO-NOT-PRINT-deepseek-cccccc';
const FAKE_KV = 'kv-test-DO-NOT-PRINT-token-dddddddd';

process.env.OPS_AUTH_SECRET = SECRET;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.ANTHROPIC_ADMIN_API_KEY;
delete process.env.OPENAI_API_KEY;
delete process.env.DEEPSEEK_API_KEY;
delete process.env.KV_REST_API_URL;
delete process.env.KV_REST_API_TOKEN;

const chat = require(path.join(__dirname, '../api/ops/_harness_chat.js'));
const ops = require(path.join(__dirname, '../api/ops/index.js'));

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

function reqFor(kind, extra) {
  const extraSafe = extra || {};
  const headers = Object.assign({
    host: 'preview.example.test',
    accept: 'application/json',
    'content-type': 'application/json',
  }, extraSafe.headers || {});
  if (extraSafe.auth !== false && !headers.cookie && !headers.authorization) {
    headers.cookie = cookieFor(ALLOWED);
  }
  const query = Object.assign({ area: `harness/${kind}` }, extraSafe.query || {});
  return {
    method: extraSafe.method || (kind === 'chat' ? 'POST' : 'GET'),
    headers,
    query,
    url: extraSafe.url || `/ops/harness/${kind}`,
    body: extraSafe.body,
  };
}

async function call(kind, extra, opts) {
  const res = mockRes();
  const handled = await chat.handleHarnessChat(reqFor(kind, extra), res, opts || { env: {} });
  return { handled, res };
}

function dumpHas(obj, secret) {
  return JSON.stringify(obj || {}).includes(secret);
}

async function run() {
  check('harnessKind maps chat, history, and usage, and ignores other paths',
    chat.harnessKind({ url: '/ops/harness/chat', query: { area: 'harness/chat' } }) === 'chat'
    && chat.harnessKind({ url: '/api/ops?area=harness/history', query: { area: 'harness/history' } }) === 'history'
    && chat.harnessKind({ url: '/ops/harness/usage', query: { area: 'harness/usage' } }) === 'usage'
    && chat.harnessKind({ url: '/ops/chat', query: { area: 'chat' } }) === '');

  check('findProject resolves salonehire and the LAVAALL umbrella',
    Boolean(chat.findProject('salonehire') && chat.findProject('SaloneHire') && chat.findProject('lavaall')));

  const composed = chat.composePrompt(chat.findProject('salonehire'), [], 'Add a receipt hold.', []);
  check('composed prompt includes RULES, the SaloneHire handoff, and the request',
    /RULES\.md/.test(composed.system) && /hosted API/.test(composed.system) && /cannot edit files/.test(composed.system)
    && /SaloneHire/.test(composed.user) && /Add a receipt hold/.test(composed.user));
  check('composed prompt tells the model not to deploy, merge, send, or spend',
    /Do not deploy, merge, send, or spend/.test(composed.system));

  check('Claude model picker defaults to Sonnet and accepts Haiku and Opus',
    chat.modelFor('claude', undefined, {}) === chat.CLAUDE_MODELS.sonnet
    && chat.modelFor('claude', 'haiku', {}) === chat.CLAUDE_MODELS.haiku
    && chat.modelFor('claude', 'opus', {}) === chat.CLAUDE_MODELS.opus
    && chat.modelFor('claude', 'sonnet', {}) === chat.CLAUDE_MODELS.sonnet
    && chat.modelFor('claude', 'wrong', {}).error === 'unknown_model');
  check('Codex and DeepSeek models have defaults',
    chat.modelFor('codex', '', {}) === 'gpt-4.1'
    && chat.modelFor('deepseek', '', {}) === 'deepseek-flash');

  {
    const { handled, res } = await call('usage', { auth: false, headers: {} }, { env: {} });
    check('usage without a session is 401', handled === true && res.statusCode === 401 && res.body.error === 'sign_in_required');
  }
  {
    const { handled, res } = await call('chat', {
      auth: false,
      headers: { authorization: 'Bearer agent-token' },
      body: { project: 'salonehire', harness: 'deepseek', message: 'hi' },
    }, { env: {} });
    check('agent-looking requests are 403', handled === true && res.statusCode === 403 && res.body.error === 'agent_denied');
  }
  {
    const { handled, res } = await call('chat', {
      body: { project: 'salonehire', harness: 'gemini', message: 'hello' },
    }, { env: { GEMINI_API_KEY: FAKE_OPENAI } });
    check('Gemini is disabled even when a key is present', handled === true && res.statusCode === 400 && res.body.error === 'harness_disabled' && !dumpHas(res.body, FAKE_OPENAI));
  }
  {
    const { handled, res } = await call('chat', { body: { project: 'not-a-project', harness: 'codex', message: 'hi' } }, { env: {} });
    check('unknown project is 400', handled === true && res.statusCode === 400 && res.body.error === 'unknown_project');
  }
  {
    const { handled, res } = await call('chat', { body: { project: 'salonehire', harness: 'codex', message: '   ' } }, { env: {} });
    check('empty message is 400', handled === true && res.statusCode === 400 && res.body.error === 'missing_message');
  }
  {
    const { handled, res } = await call('chat', {
      body: { project: 'salonehire', harness: 'codex', message: 'Add tests.' },
    }, { env: {} });
    check('missing OpenAI key is 409 and names OPENAI_API_KEY',
      handled === true && res.statusCode === 409 && res.body.error === 'key_missing' && /OPENAI_API_KEY/.test(res.body.message));
  }
  {
    const { handled, res } = await call('chat', {
      body: { project: 'salonehire', harness: 'claude', message: 'Add tests.' },
    }, { env: {} });
    check('missing Anthropic key is 409 and names ANTHROPIC_API_KEY',
      handled === true && res.statusCode === 409 && res.body.error === 'key_missing' && /ANTHROPIC_API_KEY/.test(res.body.message));
  }
  {
    const { handled, res } = await call('chat', {
      body: { project: 'salonehire', harness: 'deepseek', message: 'Add tests.' },
    }, { env: {} });
    check('missing DeepSeek key is 409 and names DEEPSEEK_API_KEY',
      handled === true && res.statusCode === 409 && res.body.error === 'key_missing' && /DEEPSEEK_API_KEY/.test(res.body.message));
  }
  {
    const other = mockRes();
    const handled = await chat.handleHarnessChat({ method: 'GET', url: '/ops/kits', query: { area: 'kits' }, headers: {} }, other, { env: {} });
    check('non-harness routes are not handled', handled === false && other.body === null);
  }

  {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url: String(url), method: (init && init.method) || 'GET', body: init && init.body });
      if (String(url).includes('api.openai.com/v1/chat/completions')) {
        return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content: 'I cannot edit the checkout. Here is the plan.' } }] }) };
      }
      throw new Error('unexpected fetch ' + url);
    };
    const { handled, res } = await call('chat', {
      body: { project: 'salonehire', harness: 'codex', message: 'Add a receipt hold for hired applicants.' },
    }, { env: { OPENAI_API_KEY: FAKE_OPENAI }, fetchImpl });
    check('Codex chat returns a hosted reply without claiming local edits were applied',
      handled === true && res.statusCode === 200 && res.body.ok === true
      && res.body.harness === 'codex' && res.body.model === 'gpt-4.1'
      && /cannot edit the checkout/.test(res.body.reply)
      && /hosted API, no local checkout edits/.test(res.body.logLine)
      && res.body.persist === false
      && Array.isArray(res.body.messages) && res.body.messages.length === 2);
    check('Codex request went to the OpenAI chat API, not a CLI, and the key is not in the response',
      calls.length === 1 && /api\.openai\.com\/v1\/chat\/completions/.test(calls[0].url)
      && !dumpHas(res.body, FAKE_OPENAI)
      && JSON.stringify(calls[0].body || '').includes('Add a receipt hold'));
  }

  {
    const fetchImpl = async (url) => {
      if (String(url).includes('api.anthropic.com/v1/messages')) {
        return { ok: true, status: 200, text: async () => JSON.stringify({ content: [{ type: 'text', text: 'Opus plan for SaloneHire.' }] }) };
      }
      throw new Error('unexpected fetch ' + url);
    };
    const { res } = await call('chat', {
      body: { project: 'salonehire', harness: 'claude', model: 'opus', message: 'Review the interview tools.' },
    }, { env: { ANTHROPIC_API_KEY: FAKE_ANTHROPIC }, fetchImpl });
    check('Claude chat honors the Opus picker',
      res.statusCode === 200 && res.body.harness === 'claude' && res.body.model === chat.CLAUDE_MODELS.opus
      && res.body.reply === 'Opus plan for SaloneHire.' && !dumpHas(res.body, FAKE_ANTHROPIC));
  }

  {
    const fetchImpl = async (url) => {
      if (String(url).includes('api.deepseek.com/chat/completions')) {
        return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content: 'DeepSeek reply' } }] }) };
      }
      throw new Error('unexpected fetch ' + url);
    };
    const { res } = await call('chat', {
      body: { project: 'lavaall', harness: 'deepseek', message: 'Summarize the OS work.' },
    }, { env: { DEEPSEEK_API_KEY: FAKE_DEEPSEEK }, fetchImpl });
    check('DeepSeek chat works on the LAVAALL umbrella project',
      res.statusCode === 200 && res.body.project === 'lavaall' && res.body.reply === 'DeepSeek reply' && !dumpHas(res.body, FAKE_DEEPSEEK));
  }

  {
    const kv = { projects: {} };
    const fetchImpl = async (url, init) => {
      const href = String(url);
      if (href.includes('kv.example.test')) {
        const args = JSON.parse(init.body);
        if (args[0] === 'GET') return { ok: true, status: 200, text: async () => JSON.stringify({ result: JSON.stringify(kv) }), json: async () => ({ result: JSON.stringify(kv) }) };
        if (args[0] === 'SET') {
          kv.projects = JSON.parse(args[2]).projects;
          return { ok: true, status: 200, text: async () => JSON.stringify({ result: 'OK' }), json: async () => ({ result: 'OK' }) };
        }
      }
      if (href.includes('api.openai.com/v1/chat/completions')) {
        return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content: 'Stored reply' } }] }) };
      }
      throw new Error('unexpected fetch ' + href);
    };
    const env = {
      OPENAI_API_KEY: FAKE_OPENAI,
      KV_REST_API_URL: 'https://kv.example.test',
      KV_REST_API_TOKEN: FAKE_KV,
    };
    const sent = await call('chat', {
      body: { project: 'salonehire', harness: 'codex', message: 'Remember this.' },
    }, { env, fetchImpl });
    check('chat history persists in the dedicated KV key when KV is bound',
      sent.res.statusCode === 200 && sent.res.body.persist === true);
    const hist = await call('history', { query: { area: 'harness/history', project: 'salonehire' } }, { env, fetchImpl });
    check('history returns the stored messages for that project',
      hist.res.statusCode === 200 && hist.res.body.persist === true
      && hist.res.body.messages.some((m) => m.role === 'user' && m.text === 'Remember this.')
      && hist.res.body.messages.some((m) => m.role === 'assistant' && m.text === 'Stored reply')
      && !dumpHas(hist.res.body, FAKE_OPENAI) && !dumpHas(hist.res.body, FAKE_KV));
  }

  {
    const fetchImpl = async (url) => {
      if (String(url).includes('api.openai.com/v1/chat/completions')) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            choices: [{ message: { content: 'Review complete.' } }],
            usage: { prompt_tokens: 123, completion_tokens: 33,
              prompt_tokens_details: { cached_tokens: 20 } },
          }),
        };
      }
      throw new Error('unexpected provider URL');
    };
    const { res } = await call('chat', {
      body: { project: 'salonehire', harness: 'codex', message: 'Review a synthetic issue.' },
    }, { env: { OPENAI_API_KEY: FAKE_OPENAI }, fetchImpl });
    check('provider-reported token usage is displayed per chat reply, not charged as a fabricated dollar amount',
      res.statusCode === 200
      && res.body.usage.source === 'provider_response'
      && res.body.usage.inputTokens === 123
      && res.body.usage.outputTokens === 33
      && res.body.usage.cachedInputTokens === 20
      && res.body.billedUsd === null
      && res.body.messages[1].usage.billedUsd === null);
  }
  {
    const fetchImpl = async () => { throw new Error('synthetic provider transport failure'); };
    const { res } = await call('chat', {
      body: { project: 'salonehire', harness: 'codex', message: 'Check transport failure.' },
    }, { env: { OPENAI_API_KEY: FAKE_OPENAI }, fetchImpl });
    check('provider transport failure is safely reported without leaking internals',
      res.statusCode === 502
      && res.body.error === 'provider_unavailable'
      && !JSON.stringify(res.body).includes('synthetic provider transport failure'));
  }
  {
    const fetchImpl = async () => {
      const err = new Error('synthetic timeout');
      err.name = 'AbortError';
      throw err;
    };
    const { res } = await call('chat', {
      body: { project: 'salonehire', harness: 'codex', message: 'Check timeout.' },
    }, { env: { OPENAI_API_KEY: FAKE_OPENAI }, fetchImpl });
    check('provider timeout is safely converted into HTTP 504',
      res.statusCode === 504 && res.body.error === 'provider_timeout');
  }

  {
    const snap = await chat.usageSnapshot({}, async () => { throw new Error('no network'); });
    check('usage without keys is not available, never a number',
      snap.providers.length === 3
      && snap.providers.every((p) => p.available === false && p.total == null)
      && snap.providers.every((p) => /key missing|not available/i.test(p.reason)));
  }

  {
    const fetchImpl = async (url) => {
      const href = String(url);
      if (href.includes('api.deepseek.com/user/balance')) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            is_available: true,
            balance_infos: [
              { currency: 'USD', total_balance: '12.34', granted_balance: '10.00', topped_up_balance: '2.34' },
            ],
          }),
        };
      }
      if (href.includes('api.openai.com')) {
        return { ok: false, status: 403, text: async () => JSON.stringify({ error: { message: 'no org access' } }) };
      }
      throw new Error('unexpected fetch ' + href);
    };
    const { handled, res } = await call('usage', {}, {
      env: { DEEPSEEK_API_KEY: FAKE_DEEPSEEK, OPENAI_API_KEY: FAKE_OPENAI, ANTHROPIC_API_KEY: FAKE_ANTHROPIC },
      fetchImpl,
    });
    const byId = Object.fromEntries((res.body.providers || []).map((p) => [p.id, p]));
    check('DeepSeek usage shows the returned balance and never invents other totals',
      handled === true && res.statusCode === 200
      && byId.deepseek.available === true && byId.deepseek.total === '12.34' && byId.deepseek.currency === 'USD'
      && byId.codex.available === false && /not available/.test(byId.codex.reason) && byId.codex.total == null
      && byId.claude.available === false && /not available/.test(byId.claude.reason) && byId.claude.total == null
      && !dumpHas(res.body, FAKE_DEEPSEEK) && !dumpHas(res.body, FAKE_OPENAI) && !dumpHas(res.body, FAKE_ANTHROPIC));
  }

  {
    const fetchImpl = async (url) => {
      if (String(url).includes('user/balance')) {
        return { ok: true, status: 200, text: async () => JSON.stringify({ balance_infos: [{ currency: 'USD' }] }) };
      }
      return { ok: false, status: 404, text: async () => '{}' };
    };
    const snap = await chat.usageSnapshot({ DEEPSEEK_API_KEY: FAKE_DEEPSEEK, OPENAI_API_KEY: FAKE_OPENAI }, fetchImpl);
    const deep = snap.providers.find((p) => p.id === 'deepseek');
    check('a balance response without a total is not available, not guessed',
      deep.available === false && deep.total == null && /no total/.test(deep.reason));
  }

  {
    const page = mockRes();
    await ops(reqFor('usage', {}), page);
    check('ops index serves /ops/harness/usage for a signed-in founder',
      page.statusCode === 200 && Array.isArray(page.body && page.body.providers) && page.body.providers.length === 3);
  }

  const failed = results.filter((r) => !r.pass);
  for (const r of results) process.stdout.write(`${r.pass ? 'PASS' : 'FAIL'} ${r.name}\n`);
  process.stdout.write(`${results.length - failed.length}/${results.length} passed\n`);
  if (failed.length) process.exit(1);
}

run().catch((err) => {
  process.stderr.write(String(err && err.stack || err) + '\n');
  process.exit(1);
});
