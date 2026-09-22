// Preview spike — POST /ops/api/jev/evaluate research quality gate.
// Mocked fetch only. No live AI_GATEWAY_API_KEY.
const fs = require('fs');
const path = require('path');

const opsDir = path.join(__dirname, '../api/ops');
const lib = require(path.join(opsDir, '_lib.js'));
const jev = require(path.join(opsDir, '_jev.js'));
const ops = require(path.join(opsDir, 'index.js'));

const SECRET = 'test-ops-auth-secret-32chars!!';
const GATEWAY_KEY = 'test-gateway-key-not-live-0001';
const ALLOWED = 'osmanjalloh104@gmail.com';

const WEAK_RESULT = 'About 40 suppliers sell this dock for $12. No sources.';
const STRONG_RESULT = 'According to https://example.com/docks/spec, the vendor lists one USB-C dock. No price invented.';

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
  const headers = Object.assign({
    cookie: cookieFor(ALLOWED),
    host: 'preview.example.test',
    accept: 'application/json',
    'content-type': 'application/json',
  }, extra && extra.headers ? extra.headers : {});
  return {
    method: extra && extra.method ? extra.method : 'POST',
    headers,
    query: extra && extra.query ? extra.query : { area: 'api/jev/evaluate' },
    url: extra && extra.url ? extra.url : '/ops/api/jev/evaluate',
    body: extra && Object.prototype.hasOwnProperty.call(extra, 'body') ? extra.body : undefined,
  };
}

function csrf() {
  return lib.createCsrfToken(ALLOWED);
}

function gatewayAnswers(acceptProbability, strengthScore) {
  return {
    model: 'typesafe-ai/jev',
    answers: {
      accept_research: { type: 'boolean', probability: acceptProbability },
      strength: {
        type: 'score',
        score: strengthScore,
        probabilities: { 0: 0.1, 1: 0.1, 2: 0.1, 3: 0.7 },
      },
      needs_technical: { type: 'boolean', probability: 0.3 },
    },
  };
}

function mockFetch(handler) {
  const seen = [];
  global.fetch = async (url, opts) => {
    const body = opts && opts.body ? JSON.parse(opts.body) : null;
    seen.push({
      url,
      method: opts && opts.method,
      authorization: opts && opts.headers && opts.headers.Authorization,
      body,
    });
    return handler(body, seen);
  };
  return seen;
}

function jsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}

async function run() {
  const origFetch = global.fetch;
  const origLog = console.log;
  const logs = [];
  console.log = (...args) => {
    logs.push(args.map((part) => String(part)).join(' '));
  };
  process.env.OPS_AUTH_SECRET = SECRET;
  delete process.env.OPS_JEV_DEBUG;
  delete process.env.AI_GATEWAY_API_KEY;

  const pack = jev.researchQualityQuestions();
  check('research_quality pack is boolean + 4-level score + technical boolean',
    pack.accept_research.type === 'boolean'
    && /sourced enough to show the founder/i.test(pack.accept_research.instructions)
    && /invented prices or supplier counts/i.test(pack.accept_research.criteria.false)
    && pack.strength.type === 'score'
    && pack.strength.criteria.length === 4
    && pack.strength.criteria[0].startsWith('weak:')
    && pack.strength.criteria[1].startsWith('thin:')
    && pack.strength.criteria[2].startsWith('adequate:')
    && pack.strength.criteria[3].startsWith('strong:')
    && pack.needs_technical.type === 'boolean'
    && /Technical validation before founder OK/i.test(pack.needs_technical.instructions));

  check('decision threshold is 0.75 in code',
    jev.decideResearchQuality({ accept_research: { type: 'boolean', probability: 0.75 } }).action === 'accept'
    && jev.decideResearchQuality({ accept_research: { type: 'boolean', probability: 0.749 } }).action === 'revise'
    && jev.decideResearchQuality({ accept_research: { type: 'boolean', probability: 0.2 } }).ok === true
    && jev.decideResearchQuality({}).ok === false);

  {
    const packed = jev.truncateResearchState({
      brief: 'b'.repeat(100),
      result: 'r'.repeat(6000),
    });
    check('state text truncates to about 4k chars',
      packed.truncated === true
      && packed.chars <= jev.MAX_STATE_CHARS
      && packed.state.brief.length + packed.state.result.length <= jev.MAX_STATE_CHARS
      && packed.state.result.startsWith('r'));
  }

  {
    const calls = [];
    global.fetch = async () => { calls.push(1); return jsonResponse(200, gatewayAnswers(0.1, 0)); };
    const missing = await jev.evaluate({
      state: { result: WEAK_RESULT },
      questions: pack,
    });
    process.env.AI_GATEWAY_API_KEY = 'short';
    const short = await jev.evaluate({
      state: { result: WEAK_RESULT },
      questions: pack,
    });
    check('evaluate refuses missing and short keys without fetch',
      missing.error === 'jev_not_configured'
      && short.error === 'jev_not_configured'
      && calls.length === 0
      && jev.jevConfigured() === false);
    delete process.env.AI_GATEWAY_API_KEY;
  }

  {
    const res = mockRes();
    await ops(authed({
      body: { purpose: 'research_quality', state: { result: WEAK_RESULT }, csrf: csrf() },
    }), res);
    check('missing key returns 503 jev_not_configured',
      res.statusCode === 503
      && res.body.error === 'jev_not_configured'
      && /AI_GATEWAY_API_KEY/.test(res.body.message));
  }

  {
    process.env.AI_GATEWAY_API_KEY = 'short-key';
    const res = mockRes();
    const seen = mockFetch(async () => jsonResponse(200, gatewayAnswers(0.99, 3)));
    await ops(authed({
      body: { purpose: 'research_quality', state: { result: STRONG_RESULT }, csrf: csrf() },
    }), res);
    check('short key returns 503 and does not call the gateway',
      res.statusCode === 503
      && res.body.error === 'jev_not_configured'
      && seen.length === 0);
    delete process.env.AI_GATEWAY_API_KEY;
  }

  {
    process.env.AI_GATEWAY_API_KEY = GATEWAY_KEY;
    const seen = mockFetch(async (body) => {
      const weak = body && body.state && body.state.result === WEAK_RESULT;
      return jsonResponse(200, gatewayAnswers(weak ? 0.18 : 0.04, 0.2));
    });
    const res = mockRes();
    await ops(authed({
      body: {
        purpose: 'research_quality',
        csrf: csrf(),
        state: { brief: 'Find docks', result: WEAK_RESULT },
      },
    }), res);
    const call = seen[0];
    check('weak unsourced blob revises',
      res.statusCode === 200
      && res.body.ok === true
      && res.body.action === 'revise'
      && res.body.purpose === 'research_quality'
      && res.body.thresholds.accept_research === 0.75
      && res.body.answers.accept_research.probability === 0.18
      && res.body.model === 'typesafe-ai/jev'
      && call.url === jev.EVALUATE_URL
      && call.method === 'POST'
      && call.authorization === `Bearer ${GATEWAY_KEY}`
      && call.body.model === 'typesafe-ai/jev'
      && call.body.state.result === WEAK_RESULT
      && call.body.state.brief === 'Find docks'
      && call.body.questions.accept_research.type === 'boolean'
      && call.body.questions.strength.criteria.length === 4
      && !res.raw.includes(GATEWAY_KEY));
  }

  {
    const seen = mockFetch(async () => jsonResponse(200, gatewayAnswers(0.93, 2.9)));
    const res = mockRes();
    await ops(authed({
      body: {
        purpose: 'research_quality',
        csrf: csrf(),
        state: { result: STRONG_RESULT },
      },
    }), res);
    check('strong cited result accepts at or above 0.75',
      res.statusCode === 200
      && res.body.action === 'accept'
      && res.body.answers.accept_research.probability === 0.93
      && seen[0].body.state.result === STRONG_RESULT
      && seen[0].body.questions.needs_technical.type === 'boolean');
  }

  {
    const seen = mockFetch(async () => jsonResponse(200, gatewayAnswers(0.99, 3)));
    const anon = mockRes();
    await ops(authed({
      headers: { cookie: '' },
      body: { purpose: 'research_quality', state: { result: STRONG_RESULT }, csrf: csrf() },
    }), anon);
    const agent = mockRes();
    await ops(authed({
      headers: { authorization: 'Bearer agent-token' },
      body: { purpose: 'research_quality', state: { result: STRONG_RESULT }, csrf: csrf() },
    }), agent);
    const noCsrf = mockRes();
    await ops(authed({
      body: { purpose: 'research_quality', state: { result: STRONG_RESULT } },
    }), noCsrf);
    const badCsrf = mockRes();
    await ops(authed({
      body: { purpose: 'research_quality', state: { result: STRONG_RESULT }, csrf: 'not-a-token' },
    }), badCsrf);
    check('auth and csrf failures do not call Jev',
      anon.statusCode === 401 && anon.body.error === 'sign_in_required'
      && agent.statusCode === 403 && agent.body.error === 'agent_denied'
      && noCsrf.statusCode === 403 && noCsrf.body.error === 'csrf'
      && badCsrf.statusCode === 403 && badCsrf.body.error === 'csrf'
      && seen.length === 0);
  }

  {
    const seen = mockFetch(async () => jsonResponse(200, gatewayAnswers(0.99, 3)));
    const purpose = mockRes();
    await ops(authed({
      body: { purpose: 'assign_routing', state: { result: STRONG_RESULT }, csrf: csrf() },
    }), purpose);
    const empty = mockRes();
    await ops(authed({
      body: { purpose: 'research_quality', state: { brief: 'only a brief' }, csrf: csrf() },
    }), empty);
    const get = mockRes();
    await ops(authed({ method: 'GET', body: {} }), get);
    check('rejects non-research purpose, empty result, and non-POST',
      purpose.statusCode === 400 && purpose.body.error === 'invalid_purpose'
      && empty.statusCode === 400 && empty.body.error === 'invalid_state'
      && get.statusCode === 405 && get.body.error === 'method_not_allowed'
      && seen.length === 0);
  }

  {
    const logsBefore = logs.length;
    const seen = mockFetch(async () => jsonResponse(500, { error: 'upstream' }));
    const res = mockRes();
    await ops(authed({
      body: { purpose: 'research_quality', state: { result: WEAK_RESULT }, csrf: csrf() },
    }), res);
    const fresh = logs.slice(logsBefore).join('\n');
    check('gateway failure is jev_failed and logs keys without the secret',
      res.statusCode === 502
      && res.body.error === 'jev_failed'
      && seen.length === 1
      && fresh.includes('accept_research')
      && fresh.includes('helper_failed')
      && !fresh.includes(GATEWAY_KEY)
      && !fresh.includes(WEAK_RESULT));
  }

  {
    const long = 'z'.repeat(5000);
    const seen = mockFetch(async () => jsonResponse(200, gatewayAnswers(0.8, 2)));
    const res = mockRes();
    await ops(authed({
      body: {
        purpose: 'research_quality',
        csrf: csrf(),
        state: { brief: 'b'.repeat(2000), result: long },
      },
    }), res);
    const sent = seen[0].body.state;
    check('route truncates state before the gateway call',
      res.statusCode === 200
      && res.body.truncated === true
      && res.body.action === 'accept'
      && sent.brief.length + sent.result.length <= jev.MAX_STATE_CHARS
      && sent.result.length > 0);
  }

  {
    const env = fs.readFileSync(path.join(__dirname, '../.env.example'), 'utf8');
    const vercel = fs.readFileSync(path.join(__dirname, '../vercel.json'), 'utf8');
    check('.env.example names AI_GATEWAY_API_KEY and does not store a value',
      /^AI_GATEWAY_API_KEY=\s*$/m.test(env)
      && /Preview spike/.test(env)
      && /Never commit the value/.test(env)
      && !env.includes(GATEWAY_KEY));
    check('vercel rewrite sends /ops/api/jev/evaluate to the ops function',
      vercel.includes('"/ops/api/jev/evaluate"')
      && vercel.includes('area=api/jev/evaluate'));
  }

  {
    const joined = logs.join('\n');
    check('no test log line contains the gateway key', !joined.includes(GATEWAY_KEY));
  }

  global.fetch = origFetch;
  console.log = origLog;
  delete process.env.AI_GATEWAY_API_KEY;

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
