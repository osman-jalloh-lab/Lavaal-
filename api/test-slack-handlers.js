// Tests for api/slack/* Ticket 02 handlers — mocks req/res so these run in
// plain node (same pattern as api/test-inquiry-and-schedule.js).
const crypto = require('crypto');
const path = require('path');
const { Readable } = require('stream');

const lib = require(path.join(__dirname, 'slack/_lib.js'));
const events = require(path.join(__dirname, 'slack/events.js'));
const commands = require(path.join(__dirname, 'slack/commands.js'));
const interactions = require(path.join(__dirname, 'slack/interactions.js'));

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
  lib.resetRecordedTasks();

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
    check('/lavaall echoes RECEIVED', res.body && res.body.text === 'RECEIVED');
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

  let failed = 0;
  for (const r of results) {
    console.log((r.pass ? 'PASS' : 'FAIL') + ' - ' + r.name);
    if (!r.pass) failed++;
  }
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}

run();
