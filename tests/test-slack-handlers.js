// Tests for api/slack/* Ticket 02–05 handlers — mocks req/res/fetch so these
// run in plain node (same pattern as tests/test-inquiry-and-schedule.js).
const crypto = require('crypto');
const path = require('path');
const { Readable } = require('stream');

const slackDir = path.join(__dirname, '../api/slack');
const lib = require(path.join(slackDir, '_lib.js'));
const events = require(path.join(slackDir, 'events.js'));
const commands = require(path.join(slackDir, 'commands.js'));
const interactions = require(path.join(slackDir, 'interactions.js'));
const {
  AGENT_REGISTRY,
  COUNCIL_SKILLS,
  GROK_SPECIALIST_IDS,
  MODE_COUNCIL,
  classify,
  isConnected,
} = require(path.join(slackDir, '_router/classify.js'));
const { STATUSES, needsApproval, isStatus } = require(path.join(slackDir, '_router/status.js'));
const { ACTION_IDS } = require(path.join(slackDir, '_router/approval.js'));
const { DEFAULT_HANDOFF_CHANNEL, SLACK_POST_MESSAGE, formatLavalTaskFence, buildHandoffPayload } = require(path.join(slackDir, '_router/bridge.js'));

const TEST_SECRET = 'test-signing-secret';
const results = [];
function check(name, cond) { results.push({ name, pass: !!cond }); }

function mockRes() {
  const res = { statusCode: null, headers: {}, body: null, raw: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.setHeader = (k, v) => { res.headers[k] = v; return res; };
  res.send = (b) => {
    res.raw = b;
    res.body = b ? JSON.parse(b) : null;
    return res;
  };
  return res;
}

function parseLavalTaskFence(text) {
  const match = String(text || '').match(/```LAVAALL_TASK\n([\s\S]*?)\n```/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function sign(secret, timestamp, rawBody) {
  const digest = crypto.createHmac('sha256', secret).update(`v0:${timestamp}:${rawBody}`, 'utf8').digest('hex');
  return `v0=${digest}`;
}

function signedReq({ rawBody, method = 'POST', timestamp, secret = TEST_SECRET, headers = {}, omitSignature = false, omitTimestamp = false }) {
  const ts = timestamp === undefined ? String(Math.floor(Date.now() / 1000)) : String(timestamp);
  const reqHeaders = { 'content-type': 'application/json', ...headers };
  if (!omitTimestamp) reqHeaders['x-slack-request-timestamp'] = ts;
  if (!omitSignature) reqHeaders['x-slack-signature'] = sign(secret, ts, rawBody);
  return { method, headers: reqHeaders, rawBody };
}

async function run() {
  process.env.SLACK_SIGNING_SECRET = TEST_SECRET;
  delete process.env.SLACK_BOT_TOKEN;
  delete process.env.LAVAALL_HANDOFF_CHANNEL;
  lib.resetRecordedTasks();

  const origFetch = global.fetch;
  const fetchCalls = [];
  global.fetch = async (url, opts) => {
    fetchCalls.push({
      url,
      body: opts && opts.body ? JSON.parse(opts.body) : null,
      headers: opts && opts.headers ? opts.headers : {},
    });
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true, ts: '1710000000.000200', channel: DEFAULT_HANDOFF_CHANNEL }),
    };
  };

  // --- helper: valid HMAC + replay window ---
  {
    const rawBody = '{"ok":true}';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = sign(TEST_SECRET, timestamp, rawBody);
    const ok = lib.verifySlackRequest({ signingSecret: TEST_SECRET, timestamp, signature, rawBody });
    check('verifySlackRequest accepts a valid HMAC', ok.ok === true);
  }
  {
    const rawBody = '{"ok":true}';
    const timestamp = String(Math.floor(Date.now() / 1000) - (lib.MAX_SKEW_SECONDS + 1));
    const signature = sign(TEST_SECRET, timestamp, rawBody);
    const result = lib.verifySlackRequest({ signingSecret: TEST_SECRET, timestamp, signature, rawBody });
    check('verifySlackRequest rejects a stale timestamp (replay window)', result.ok === false && result.error === 'replay_rejected');
  }
  {
    const result = lib.verifySlackRequest({
      signingSecret: TEST_SECRET,
      timestamp: String(Math.floor(Date.now() / 1000)),
      signature: 'v0=deadbeef',
      rawBody: '{"ok":true}',
    });
    check('verifySlackRequest rejects a bad HMAC', result.ok === false && result.error === 'invalid_signature');
  }

  // --- events: url_verification ---
  {
    const challenge = '3eZbrw1aBm2rZgRNFdxV2595E9CY3gmdALWMmHkvFXO7tYXAYM8P';
    const rawBody = JSON.stringify({ token: 'unused-legacy-token', challenge, type: 'url_verification' });
    const res = mockRes();
    await events(signedReq({ rawBody }), res);
    check('url_verification returns HTTP 200', res.statusCode === 200);
    check('url_verification echoes the challenge', res.body && res.body.challenge === challenge);
  }

  // --- events: missing signature → 401 ---
  {
    const rawBody = JSON.stringify({ type: 'url_verification', challenge: 'abc' });
    const res = mockRes();
    await events(signedReq({ rawBody, omitSignature: true }), res);
    check('events missing signature → 401', res.statusCode === 401 && res.body && res.body.error === 'missing_signature');
  }

  // --- events: app_mention acks without doing AI work ---
  {
    lib.resetRecordedTasks();
    const rawBody = JSON.stringify({
      type: 'event_callback',
      event_id: 'EvTESTAPPMENTION',
      event: {
        type: 'app_mention',
        user: 'U123',
        text: '<@Ubot> hello',
        channel: 'C123',
        ts: '1710000000.000100',
      },
    });
    const res = mockRes();
    await events(signedReq({ rawBody }), res);
    const recorded = lib.getRecordedTasks();
    check('app_mention acks 200', res.statusCode === 200 && res.body && res.body.ok === true);
    check('app_mention records a log-only task', recorded.length === 1 && recorded[0].kind === 'app_mention' && recorded[0].eventId === 'EvTESTAPPMENTION');
  }

  // --- events: url_verification over a real stream (no req.rawBody shortcut) ---
  {
    const challenge = 'stream-challenge-value';
    const rawBody = JSON.stringify({ type: 'url_verification', challenge });
    const ts = String(Math.floor(Date.now() / 1000));
    const req = Readable.from([rawBody]);
    req.method = 'POST';
    req.headers = {
      'content-type': 'application/json',
      'x-slack-request-timestamp': ts,
      'x-slack-signature': sign(TEST_SECRET, ts, rawBody),
    };
    const res = mockRes();
    await events(req, res);
    check('url_verification from a request stream echoes the challenge', res.statusCode === 200 && res.body && res.body.challenge === challenge);
  }

  // --- events: GET is rejected ---
  {
    const res = mockRes();
    await events({ method: 'GET', headers: {}, rawBody: '' }, res);
    check('events GET → 405', res.statusCode === 405);
  }

  // --- commands: /lavaall → RECEIVED ---
  {
    lib.resetRecordedTasks();
    const rawBody = 'token=legacy&team_id=T1&channel_id=C1&user_id=U1&command=%2Flavaall&text=quote+fiber&response_url=https%3A%2F%2Fhooks.slack.com%2Fcommands%2FT1%2F1%2Fx';
    const res = mockRes();
    await commands(signedReq({
      rawBody,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    }), res);
    check('/lavaall returns HTTP 200', res.statusCode === 200);
    check('/lavaall founder ack is routed (not bare RECEIVED)', !!(res.body && typeof res.body.text === 'string' && res.body.text.includes('Routed to sales') && /task slack-/.test(res.body.text)));
    check('/lavaall records a slash_command task', lib.getRecordedTasks()[0] && lib.getRecordedTasks()[0].kind === 'slash_command' && lib.getRecordedTasks()[0].command === '/lavaall');
  }

  // --- commands: missing signature → 401 ---
  {
    const rawBody = 'command=%2Flavaall&text=hi';
    const res = mockRes();
    await commands(signedReq({
      rawBody,
      omitSignature: true,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    }), res);
    check('commands missing signature → 401', res.statusCode === 401 && res.body && res.body.error === 'missing_signature');
  }

  // --- commands: invalid signature → 401 ---
  {
    const rawBody = 'command=%2Flavaall&text=hi';
    const ts = String(Math.floor(Date.now() / 1000));
    const res = mockRes();
    await commands({
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'x-slack-request-timestamp': ts,
        'x-slack-signature': 'v0=0000000000000000000000000000000000000000000000000000000000000000',
      },
      rawBody,
    }, res);
    check('commands invalid signature → 401', res.statusCode === 401 && res.body && res.body.error === 'invalid_signature');
  }

  // --- commands: replay window ---
  {
    const rawBody = 'command=%2Flavaall&text=hi';
    const stale = String(Math.floor(Date.now() / 1000) - 301);
    const res = mockRes();
    await commands(signedReq({
      rawBody,
      timestamp: stale,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    }), res);
    check('commands stale timestamp → 401 replay_rejected', res.statusCode === 401 && res.body && res.body.error === 'replay_rejected');
  }

  // --- interactions: Approve stub ---
  {
    lib.resetRecordedTasks();
    const payload = JSON.stringify({
      type: 'block_actions',
      user: { id: 'U99' },
      channel: { id: 'C99' },
      actions: [{ action_id: 'approve', value: 'task-1' }],
    });
    const rawBody = `payload=${encodeURIComponent(payload)}`;
    const res = mockRes();
    await interactions(signedReq({
      rawBody,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    }), res);
    const recorded = lib.getRecordedTasks();
    check('interactions Approve acks 200', res.statusCode === 200 && res.body && res.body.ok === true);
    check('interactions records approve action_id', recorded[0] && recorded[0].kind === 'interaction' && recorded[0].actionIds.includes('approve'));
  }

  // --- interactions: Edit / Reject stubs ---
  {
    for (const actionId of ['edit', 'reject']) {
      lib.resetRecordedTasks();
      const payload = JSON.stringify({
        type: 'block_actions',
        user: { id: 'U99' },
        channel: { id: 'C99' },
        actions: [{ action_id: actionId, value: 'task-1' }],
      });
      const rawBody = `payload=${encodeURIComponent(payload)}`;
      const res = mockRes();
      await interactions(signedReq({
        rawBody,
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
      }), res);
      check(`interactions ${actionId} acks 200`, res.statusCode === 200 && res.body && res.body.ok === true);
      check(`interactions records ${actionId} action_id`, lib.getRecordedTasks()[0] && lib.getRecordedTasks()[0].actionIds.includes(actionId));
    }
  }

  // --- interactions: missing signature → 401 ---
  {
    const rawBody = 'payload=%7B%7D';
    const res = mockRes();
    await interactions(signedReq({
      rawBody,
      omitSignature: true,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    }), res);
    check('interactions missing signature → 401', res.statusCode === 401 && res.body && res.body.error === 'missing_signature');
  }

  // --- missing signing secret → 503 ---
  {
    delete process.env.SLACK_SIGNING_SECRET;
    const rawBody = JSON.stringify({ type: 'url_verification', challenge: 'abc' });
    const res = mockRes();
    await events(signedReq({ rawBody }), res);
    check('missing SLACK_SIGNING_SECRET → 503', res.statusCode === 503 && res.body && res.body.error === 'signing_secret_not_configured');
    process.env.SLACK_SIGNING_SECRET = TEST_SECRET;
  }

  // --- handlers disable body parsing so HMAC uses the raw bytes ---
  check('events.config disables bodyParser', events.config && events.config.api && events.config.api.bodyParser === false);
  check('commands.config disables bodyParser', commands.config && commands.config.api && commands.config.api.bodyParser === false);
  check('interactions.config disables bodyParser', interactions.config && interactions.config.api && interactions.config.api.bodyParser === false);

  // --- Ticket 03: classify samples ---
  {
    const sales = classify({ text: 'quote fiber for Accra', source: 'slash_command' });
    check('classify sales → sales lead', sales.leadAgent === 'sales' && sales.area === 'sales' && sales.verb === 'quote');
    check('classify sales risk stays L0–L1', sales.risk === 'L0' || sales.risk === 'L1');
    check('classify sales maps quote/crm/sales skills', sales.skills.includes('quote') && sales.skills.includes('crm') && sales.skills.includes('sales'));
  }
  {
    const tech = classify({ text: 'build a failing test for the importer bug', source: 'slash_command' });
    check('classify tech → technical lead', tech.leadAgent === 'technical' && tech.area === 'technical' && tech.verb === 'build');
    check('classify build is L0–L2 (auto-bridge)', tech.risk === 'L0' || tech.risk === 'L1' || tech.risk === 'L2');
    check('classify build does not require approval', needsApproval(tech.risk) === false);
  }
  {
    const growth = classify({ text: 'creative ugc for the phones category', source: 'slash_command' });
    check('classify growth → growth lead', growth.leadAgent === 'growth' && growth.area === 'growth');
    check('classify creative/ugc stays below L3', needsApproval(growth.risk) === false);
  }
  {
    const ads = classify({ text: 'ads campaign for facebook', source: 'slash_command' });
    check('classify ads → growth L3 gate', ads.leadAgent === 'growth' && ads.area === 'growth' && ads.risk === 'L3' && needsApproval(ads.risk) === true);
  }
  {
    const l3 = classify({ text: 'deploy production', source: 'slash_command' });
    check('classify deploy → L3 technical gate', l3.risk === 'L3' && l3.leadAgent === 'technical' && needsApproval(l3.risk) === true);
  }
  {
    const l4 = classify({ text: 'delete production secrets', source: 'slash_command' });
    check('classify secret/delete → L4', l4.risk === 'L4' && needsApproval(l4.risk) === true);
  }
  {
    const research = classify({ text: 'research competitor pricing in Accra', source: 'slash_command' });
    check('classify research stays L0–L1', research.verb === 'research' && (research.risk === 'L0' || research.risk === 'L1'));
  }
  {
    const unavailable = classify({ text: 'use claude to research the Accra market', source: 'slash_command' });
    check('UNAVAILABLE is never the lead', unavailable.leadAgent === 'lavaall-ceo' && isConnected(unavailable.leadAgent));
    check('UNAVAILABLE helper labeled NOT CONNECTED', unavailable.helperAgents.some((h) => String(h).includes('claude-api') && String(h).includes('NOT CONNECTED')));
    check('UNAVAILABLE note is in reasons', unavailable.reasons.some((r) => /NOT CONNECTED/.test(r)));
  }
  {
    const grok = classify({ text: 'ask grok xai to draft a spec', source: 'slash_command' });
    check('grok-xai-api is never lead', grok.leadAgent !== 'grok-xai-api' && isConnected(grok.leadAgent));
    check('grok helper labeled NOT CONNECTED', grok.helperAgents.some((h) => String(h).includes('grok-xai-api') && String(h).includes('NOT CONNECTED')));
  }
  {
    const chatgpt = classify({ text: 'chatgpt', source: 'slash_command' });
    check('only-unavailable match leads with lavaall-ceo', chatgpt.leadAgent === 'lavaall-ceo');
    check('chatgpt-api helper labeled NOT CONNECTED', chatgpt.helperAgents.some((h) => String(h).includes('chatgpt-api') && String(h).includes('NOT CONNECTED')));
  }
  {
    const names = ['RECEIVED', 'CLASSIFIED', 'AWAITING_APPROVAL', 'BRIDGED', 'DONE', 'FAILED'];
    check('status registry has L0–L4 pipeline names', names.every((name) => STATUSES[name] === name && isStatus(name)));
  }

  // --- Council / group mode ---
  {
    const council = classify({ text: 'council review the Accra launch', source: 'slash_command' });
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
      const result = classify({ text, source: 'slash_command' });
      return result.mode === MODE_COUNCIL && result.leadAgent === 'lavaall-ceo' && GROK_SPECIALIST_IDS.every((id) => result.helperAgents.includes(id));
    });
    check('council verbs/keywords fan out to connected specialists', allCouncil);
  }
  {
    const bumped = classify({ text: 'council deploy production', source: 'slash_command' });
    check('council + deploy stays L3 approval', bumped.mode === MODE_COUNCIL && bumped.risk === 'L3' && needsApproval(bumped.risk) === true && bumped.leadAgent === 'lavaall-ceo');
  }
  {
    const l4 = classify({ text: 'council delete production secrets', source: 'slash_command' });
    check('council + secret/delete stays L4', l4.mode === MODE_COUNCIL && l4.risk === 'L4' && needsApproval(l4.risk) === true);
  }
  {
    const prevAnthropic = process.env.ANTHROPIC_API_KEY;
    const prevOpenAI = process.env.OPENAI_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'present';
    process.env.OPENAI_API_KEY = 'present';
    const council = classify({ text: 'council review', source: 'slash_command' });
    const claude = AGENT_REGISTRY.agents.find((a) => a.id === 'claude-api');
    const chatgpt = AGENT_REGISTRY.agents.find((a) => a.id === 'chatgpt-api');
    check('ANTHROPIC_API_KEY adds claude-api as CONNECTED helper', council.helperAgents.includes('claude-api'));
    check('OPENAI_API_KEY adds chatgpt-api as CONNECTED helper', council.helperAgents.includes('chatgpt-api'));
    check('registry JSON still marks claude-api UNAVAILABLE', !!(claude && claude.status === 'UNAVAILABLE'));
    check('registry JSON still marks chatgpt-api UNAVAILABLE', !!(chatgpt && chatgpt.status === 'UNAVAILABLE'));
    const mentioned = classify({ text: 'use claude to research the Accra market', source: 'slash_command' });
    check('env-connected claude-api is still never lead', mentioned.leadAgent === 'lavaall-ceo' && mentioned.helperAgents.includes('claude-api'));
    if (prevAnthropic === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = prevAnthropic;
    if (prevOpenAI === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = prevOpenAI;
  }

  // --- Tighter non-council routing ---
  {
    const sales = classify({ text: 'customer order from the supplier', source: 'slash_command' });
    check('order/customer/supplier → sales lead', sales.leadAgent === 'sales' && sales.area === 'sales' && sales.mode !== MODE_COUNCIL);
  }
  {
    const tech = classify({ text: 'vercel repo api bug in the importer', source: 'slash_command' });
    check('vercel/repo/api/bug → technical lead', tech.leadAgent === 'technical' && tech.area === 'technical');
  }
  {
    const life = classify({ text: 'email klaviyo journey for retention', source: 'slash_command' });
    check('klaviyo/journey/retention lead is ceo', life.leadAgent === 'lavaall-ceo' && life.area === 'lifecycle');
    check('lifecycle stays a helper when it is the only specialist', life.helperAgents.includes('lifecycle'));
  }
  {
    const growth = classify({ text: 'social ugc for the phones category', source: 'slash_command' });
    check('social/ugc → growth lead', growth.leadAgent === 'growth' && growth.area === 'growth' && needsApproval(growth.risk) === false);
    const leverage = classify({ text: 'how can we leverage LAVAALL better?', source: 'ops_ceo_send' });
    check('leverage → growth area, CEO still answers on Send', leverage.area === 'growth' && leverage.leadAgent === 'growth');
  }
  {
    const researchCeo = classify({ text: 'research supplier lead times', source: 'slash_command' });
    check('research + supplier stays ceo unless clearly sales', researchCeo.leadAgent === 'lavaall-ceo' && researchCeo.verb === 'research' && researchCeo.area === 'ceo');
  }
  {
    const auditCeo = classify({ text: 'audit the catalog images', source: 'slash_command' });
    check('audit/qa without sales/tech stays ceo', auditCeo.leadAgent === 'lavaall-ceo' && auditCeo.verb === 'audit');
  }

  // --- Ticket 03–04: /lavaall research routes; deploy asks approval ---
  {
    fetchCalls.length = 0;
    process.env.SLACK_BOT_TOKEN = 'xoxb-test-token';
    lib.resetRecordedTasks();
    const rawBody = 'command=%2Flavaall&text=research+competitor+pricing&user_id=U1&channel_id=C1';
    const res = mockRes();
    await commands(signedReq({
      rawBody,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    }), res);
    const task = lib.getRecordedTasks().find((t) => t.kind === 'slash_command');
    check('/lavaall research HTTP 200', res.statusCode === 200);
    check('/lavaall research founder ack names lead + risk + task', !!(res.body && /Routed to lavaall-ceo · risk L[01] · task slack-/.test(res.body.text)));
    check('/lavaall research bridges LAVAALL_TASK', fetchCalls.length === 1 && fetchCalls[0].url === SLACK_POST_MESSAGE && typeof fetchCalls[0].body.text === 'string' && fetchCalls[0].body.text.includes('```LAVAALL_TASK') && fetchCalls[0].body.channel === DEFAULT_HANDOFF_CHANNEL);
    check('/lavaall research uses bot token header', !!(fetchCalls[0] && fetchCalls[0].headers.Authorization === 'Bearer xoxb-test-token'));
    check('/lavaall research task ends BRIDGED', task && task.status === STATUSES.BRIDGED);
    const fence = fetchCalls[0] && fetchCalls[0].body.text;
    check('/lavaall research fence includes task fields', !!(fence && fence.includes('"verb": "research"') && fence.includes('"lead": "lavaall-ceo"') && fence.includes('"user": "U1"')));
    delete process.env.SLACK_BOT_TOKEN;
  }
  {
    fetchCalls.length = 0;
    process.env.SLACK_BOT_TOKEN = 'xoxb-test-token';
    lib.resetRecordedTasks();
    const order = [];
    const prevFetch = global.fetch;
    global.fetch = async (url, opts) => {
      order.push('fetch');
      return prevFetch(url, opts);
    };
    const res = mockRes();
    const origSend = res.send.bind(res);
    res.send = (b) => {
      order.push('send');
      return origSend(b);
    };
    const fakeWaitUntil = [];
    globalThis.waitUntil = (promise) => {
      fakeWaitUntil.push(promise);
    };
    await commands(signedReq({
      rawBody: 'command=%2Flavaall&text=research+competitor+pricing+in+Accra&user_id=U1&channel_id=C1',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    }), res);
    delete globalThis.waitUntil;
    global.fetch = prevFetch;
    check('waitUntil is not used without @vercel/functions in package.json', lib.canUseWaitUntil() === false);
    check('research planRoute background posts chat.postMessage', fetchCalls.length === 1 && fetchCalls[0].url === SLACK_POST_MESSAGE && fetchCalls[0].body.text.includes('LAVAALL_TASK'));
    check('research handoff completes before ephemeral ack (no fire-and-forget)', order.length >= 2 && order.indexOf('fetch') > -1 && order.indexOf('send') > -1 && order.indexOf('fetch') < order.indexOf('send'));
    check('fake waitUntil is not relied on for the handoff', fakeWaitUntil.length === 0);
    delete process.env.SLACK_BOT_TOKEN;
  }
  {
    fetchCalls.length = 0;
    process.env.SLACK_BOT_TOKEN = 'xoxb-test-token';
    lib.resetRecordedTasks();
    const logged = [];
    const origError = console.error;
    console.error = function (...args) {
      logged.push(args);
      return origError.apply(console, args);
    };
    const prevFetch = global.fetch;
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: false, error: 'channel_not_found' }),
    });
    const res = mockRes();
    await commands(signedReq({
      rawBody: 'command=%2Flavaall&text=research+bridge+failure&user_id=U1&channel_id=C1',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    }), res);
    console.error = origError;
    global.fetch = prevFetch;
    const task = lib.getRecordedTasks().find((t) => t.kind === 'slash_command');
    check('bridge failure still returns routed ack', res.statusCode === 200 && res.body && /Routed to /.test(res.body.text));
    check('bridge failure marks task FAILED', task && task.status === STATUSES.FAILED && task.bridgeError === 'channel_not_found');
    check('bridge failure logs result.error', logged.some((args) => String(args[0]).includes('postLavalHandoff failed') && args[1] === 'channel_not_found'));
    delete process.env.SLACK_BOT_TOKEN;
  }
  {
    fetchCalls.length = 0;
    process.env.SLACK_BOT_TOKEN = 'xoxb-test-token';
    lib.resetRecordedTasks();
    const rawBody = 'command=%2Flavaall&text=deploy+production&user_id=U1&channel_id=C1';
    const res = mockRes();
    await commands(signedReq({
      rawBody,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    }), res);
    const task = lib.getRecordedTasks().find((t) => t.kind === 'slash_command');
    const actionIds = ((res.body && res.body.blocks) || [])
      .flatMap((block) => (block.elements || []).map((el) => el.action_id))
      .filter(Boolean);
    check('/lavaall deploy HTTP 200', res.statusCode === 200);
    check('/lavaall deploy does not bridge yet', fetchCalls.length === 0);
    check('/lavaall deploy is AWAITING_APPROVAL', task && task.status === STATUSES.AWAITING_APPROVAL && task.risk === 'L3');
    check('/lavaall deploy posts Approve/Edit/Reject', actionIds.includes(ACTION_IDS.approve) && actionIds.includes(ACTION_IDS.edit) && actionIds.includes(ACTION_IDS.reject));
    check('/lavaall deploy Block Kit lists ACTION/AGENT/WHY/SYSTEM/RISK/EXPECTED RESULT', !!(res.body && res.body.blocks && JSON.stringify(res.body.blocks).includes('*ACTION:*') && JSON.stringify(res.body.blocks).includes('*AGENT:*') && JSON.stringify(res.body.blocks).includes('*WHY:*') && JSON.stringify(res.body.blocks).includes('*SYSTEM:*') && JSON.stringify(res.body.blocks).includes('*RISK:*') && JSON.stringify(res.body.blocks).includes('*EXPECTED RESULT:*')));
    delete process.env.SLACK_BOT_TOKEN;
  }

  // --- Ticket 04: app_mention thread-replies + handoff ---
  {
    fetchCalls.length = 0;
    process.env.SLACK_BOT_TOKEN = 'xoxb-test-token';
    lib.resetRecordedTasks();
    const rawBody = JSON.stringify({
      type: 'event_callback',
      event_id: 'EvROUTE',
      event: {
        type: 'app_mention',
        user: 'U123',
        text: '<@Ubot> research supplier lead times',
        channel: 'C123',
        ts: '1710000000.000100',
      },
    });
    const res = mockRes();
    await events(signedReq({ rawBody }), res);
    check('app_mention research acks 200 before/without blocking Slack', res.statusCode === 200 && res.body && res.body.ok === true);
    check('app_mention research posts thread ack + handoff', fetchCalls.length === 2);
    check('app_mention research thread reply preferred', fetchCalls[0] && fetchCalls[0].body.channel === 'C123' && fetchCalls[0].body.thread_ts === '1710000000.000100' && /Routed to /.test(fetchCalls[0].body.text));
    check('app_mention research handoff goes to default channel', fetchCalls[1] && fetchCalls[1].body.channel === DEFAULT_HANDOFF_CHANNEL && fetchCalls[1].body.text.includes('```LAVAALL_TASK'));
    delete process.env.SLACK_BOT_TOKEN;
  }
  {
    fetchCalls.length = 0;
    process.env.SLACK_BOT_TOKEN = 'xoxb-test-token';
    lib.resetRecordedTasks();
    const rawBody = JSON.stringify({
      type: 'event_callback',
      event_id: 'EvDEPLOY',
      event: {
        type: 'app_mention',
        user: 'U123',
        text: '<@Ubot> deploy production',
        channel: 'C123',
        ts: '1710000000.000300',
      },
    });
    const res = mockRes();
    await events(signedReq({ rawBody }), res);
    const task = lib.getRecordedTasks().find((t) => t.kind === 'app_mention');
    const posted = fetchCalls[0] && fetchCalls[0].body;
    const actionIds = ((posted && posted.blocks) || [])
      .flatMap((block) => (block.elements || []).map((el) => el.action_id))
      .filter(Boolean);
    check('app_mention deploy acks 200', res.statusCode === 200 && res.body && res.body.ok === true);
    check('app_mention deploy stays AWAITING_APPROVAL (no handoff)', !!(task && task.status === STATUSES.AWAITING_APPROVAL && fetchCalls.length === 1 && posted && posted.channel === 'C123' && posted.thread_ts === '1710000000.000300'));
    check('app_mention deploy thread has approval buttons', actionIds.includes(ACTION_IDS.approve) && actionIds.includes(ACTION_IDS.reject));
    delete process.env.SLACK_BOT_TOKEN;
  }

  // --- Ticket 05: Approve / Edit / Reject ---
  {
    fetchCalls.length = 0;
    process.env.SLACK_BOT_TOKEN = 'xoxb-test-token';
    lib.resetRecordedTasks();
    const audit = [];
    const origLog = console.log;
    console.log = function (...args) {
      const line = args[0];
      if (typeof line === 'string' && line.includes('"type":"AuditEvent"')) {
        try { audit.push(JSON.parse(line)); } catch { /* ignore */ }
      }
      return origLog.apply(console, args);
    };
    const value = JSON.stringify({
      id: 'slack-test-approve',
      text: 'deploy production',
      verb: 'ship',
      risk: 'L3',
      lead: 'technical',
      helpers: [],
      skills: ['ship'],
      channel: 'C1',
      thread_ts: '1710000000.000100',
      user: 'U1',
    });
    const payload = JSON.stringify({
      type: 'block_actions',
      user: { id: 'U99' },
      channel: { id: 'C99' },
      actions: [{ action_id: ACTION_IDS.approve, value }],
    });
    const res = mockRes();
    await interactions(signedReq({
      rawBody: `payload=${encodeURIComponent(payload)}`,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    }), res);
    console.log = origLog;
    check('approve_task acks 200', res.statusCode === 200 && res.body && /Approved/.test(res.body.text));
    check('approve_task logs AuditEvent JSON', audit.length === 1 && audit[0].type === 'AuditEvent' && audit[0].action === ACTION_IDS.approve && audit[0].taskId === 'slack-test-approve');
    check('approve_task bridges LAVAALL_TASK', fetchCalls.length === 1 && fetchCalls[0].url === SLACK_POST_MESSAGE && fetchCalls[0].body.text.includes('```LAVAALL_TASK') && fetchCalls[0].body.text.includes('slack-test-approve'));
    delete process.env.SLACK_BOT_TOKEN;
  }
  {
    fetchCalls.length = 0;
    lib.resetRecordedTasks();
    const payload = JSON.stringify({
      type: 'block_actions',
      user: { id: 'U99' },
      channel: { id: 'C99' },
      actions: [{ action_id: ACTION_IDS.reject, value: JSON.stringify({ id: 'slack-test-reject', risk: 'L3', verb: 'ship', lead: 'technical' }) }],
    });
    const res = mockRes();
    await interactions(signedReq({
      rawBody: `payload=${encodeURIComponent(payload)}`,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    }), res);
    check('reject_task replies and does not bridge', res.statusCode === 200 && res.body && /Rejected task slack-test-reject/.test(res.body.text) && fetchCalls.length === 0);
  }
  {
    fetchCalls.length = 0;
    const payload = JSON.stringify({
      type: 'block_actions',
      user: { id: 'U99' },
      channel: { id: 'C99' },
      actions: [{ action_id: ACTION_IDS.edit, value: JSON.stringify({ id: 'slack-test-edit', risk: 'L3', verb: 'ship', lead: 'technical' }) }],
    });
    const res = mockRes();
    await interactions(signedReq({
      rawBody: `payload=${encodeURIComponent(payload)}`,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    }), res);
    check('edit_task asks to resubmit and does not bridge', res.statusCode === 200 && res.body && /Resubmit with \/lavaall/.test(res.body.text) && fetchCalls.length === 0);
  }
  {
    const payload = buildHandoffPayload({
      id: 'slack-x',
      text: 'research',
      verb: 'research',
      risk: 'L0',
      leadAgent: 'lavaall-ceo',
      helperAgents: ['claude-api (NOT CONNECTED)'],
      skills: ['research', 'source'],
      channelId: 'C1',
      thread_ts: '1.2',
      userId: 'U1',
    });
    const fence = formatLavalTaskFence(payload);
    check('handoff payload has required LAVAALL_TASK fields', !!(payload.id && payload.text && payload.verb && payload.risk && payload.lead && Array.isArray(payload.helpers) && Array.isArray(payload.skills) && payload.channel && payload.thread_ts && payload.user));
    check('LAVAALL_TASK fence is labeled JSON', fence.startsWith('```LAVAALL_TASK') && fence.includes('"lead": "lavaall-ceo"'));
  }

  // --- Council slash command posts one LAVAALL_TASK with mode + helpers ---
  {
    fetchCalls.length = 0;
    process.env.SLACK_BOT_TOKEN = 'xoxb-test-token';
    lib.resetRecordedTasks();
    const order = [];
    const prevFetch = global.fetch;
    global.fetch = async (url, opts) => {
      order.push('fetch');
      return prevFetch(url, opts);
    };
    const res = mockRes();
    const origSend = res.send.bind(res);
    res.send = (b) => {
      order.push('send');
      return origSend(b);
    };
    await commands(signedReq({
      rawBody: 'command=%2Flavaall&text=council+review+the+Accra+launch&user_id=U1&channel_id=C1',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    }), res);
    global.fetch = prevFetch;
    const task = lib.getRecordedTasks().find((t) => t.kind === 'slash_command');
    const payload = parseLavalTaskFence(fetchCalls[0] && fetchCalls[0].body && fetchCalls[0].body.text);
    check('/lavaall council HTTP 200', res.statusCode === 200);
    check('/lavaall council founder ack names ceo + helpers', !!(res.body && /Routed to lavaall-ceo/.test(res.body.text) && /helpers sales, technical, lifecycle, growth/.test(res.body.text)));
    check('/lavaall council posts one LAVAALL_TASK', fetchCalls.length === 1 && fetchCalls[0].url === SLACK_POST_MESSAGE);
    check('/lavaall council fence mode is council', !!(payload && payload.mode === MODE_COUNCIL && payload.lead === 'lavaall-ceo' && payload.verb === 'council'));
    check('/lavaall council fence lists connected helpers', !!(payload && GROK_SPECIALIST_IDS.every((id) => payload.helpers.includes(id))));
    check('/lavaall council fence keeps full text', !!(payload && payload.text === 'council review the Accra launch'));
    check('/lavaall council handoff completes before ephemeral ack', order.indexOf('fetch') > -1 && order.indexOf('send') > -1 && order.indexOf('fetch') < order.indexOf('send'));
    check('/lavaall council task ends BRIDGED', task && task.status === STATUSES.BRIDGED && task.mode === MODE_COUNCIL);
    delete process.env.SLACK_BOT_TOKEN;
  }
  {
    fetchCalls.length = 0;
    process.env.SLACK_BOT_TOKEN = 'xoxb-test-token';
    lib.resetRecordedTasks();
    const res = mockRes();
    await commands(signedReq({
      rawBody: 'command=%2Flavaall&text=deliberate+the+Accra+launch&user_id=U1&channel_id=C1',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    }), res);
    const payload = parseLavalTaskFence(fetchCalls[0] && fetchCalls[0].body && fetchCalls[0].body.text);
    check('/lavaall deliberate is council mode', !!(payload && payload.mode === MODE_COUNCIL && payload.lead === 'lavaall-ceo' && GROK_SPECIALIST_IDS.every((id) => payload.helpers.includes(id))));
    delete process.env.SLACK_BOT_TOKEN;
  }
  {
    fetchCalls.length = 0;
    process.env.SLACK_BOT_TOKEN = 'xoxb-test-token';
    lib.resetRecordedTasks();
    const res = mockRes();
    await commands(signedReq({
      rawBody: 'command=%2Flavaall&text=council+deploy+production&user_id=U1&channel_id=C1',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    }), res);
    const task = lib.getRecordedTasks().find((t) => t.kind === 'slash_command');
    check('/lavaall council deploy does not bridge yet', fetchCalls.length === 0 && res.statusCode === 200);
    check('/lavaall council deploy is AWAITING_APPROVAL', task && task.status === STATUSES.AWAITING_APPROVAL && task.risk === 'L3' && task.mode === MODE_COUNCIL);
    delete process.env.SLACK_BOT_TOKEN;
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

run();
