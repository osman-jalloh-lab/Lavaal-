// Founders SMS line — Twilio webhook, allowlist, opt-out, and untrusted inbound.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const opsDir = path.join(root, 'api/ops');

process.env.OPS_AUTH_SECRET = 'test-ops-auth-secret-32chars!!';
process.env.OPS_CEO_BRIDGE_SECRET = 'test-ceo-bridge-secret-32chars!!';
delete process.env.FOUNDERS_SMS_ENABLED;
delete process.env.FOUNDERS_SMS_AUTOSEND_ALERTS;
delete process.env.TWILIO_ACCOUNT_SID;
delete process.env.TWILIO_AUTH_TOKEN;
delete process.env.TWILIO_FROM_NUMBER;
delete process.env.FOUNDERS_SMS_NUMBERS;
delete process.env.KV_REST_API_URL;
delete process.env.KV_REST_API_TOKEN;
delete process.env.VERCEL_ENV;

const lib = require(path.join(opsDir, '_lib.js'));
const store = require(path.join(opsDir, '_store.js'));
const ops = require(path.join(opsDir, 'index.js'));
const sms = require(path.join(opsDir, '_sms.js'));
const inbound = require(path.join(root, 'api/sms/inbound.js'));
const { UNTRUSTED_BEGIN, UNTRUSTED_END } = require(path.join(opsDir, '_untrusted.js'));

const OSMAN = 'osmanjalloh104@gmail.com';
const HAMEED = 'abdulhbah55@gmail.com';
const OUTSIDER = 'ada@example.com';
const SID = 'AC11111111111111111111111111111111';
const TOKEN = 'twilio-test-token-not-real';
const FROM = '+18005550100';
const OSMAN_NUMBER = '+15555550123';
const HAMEED_NUMBER = '+15555550199';
const NUMBERS = `${OSMAN}:${OSMAN_NUMBER},${HAMEED}:${HAMEED_NUMBER}`;
const PHRASE = 'sms-secret-phrase-9f3c';
const BRIDGE = process.env.OPS_CEO_BRIDGE_SECRET;

const results = [];
function check(name, cond) { results.push({ name, pass: !!cond }); }

function mockRes() {
  const res = { statusCode: 200, headers: {}, body: null, raw: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.setHeader = (key, value) => { res.headers[key] = value; return res; };
  res.send = (body) => {
    res.raw = body;
    if (typeof body === 'string' && (body.startsWith('{') || body.startsWith('['))) {
      try { res.body = JSON.parse(body); } catch { res.body = body; }
    } else {
      res.body = body;
    }
    return res;
  };
  return res;
}

function cookieFor(email) {
  return `${lib.SESSION_COOKIE}=${encodeURIComponent(lib.createSessionToken(email))}`;
}

function enable() {
  process.env.FOUNDERS_SMS_ENABLED = '1';
  process.env.TWILIO_ACCOUNT_SID = SID;
  process.env.TWILIO_AUTH_TOKEN = TOKEN;
  process.env.TWILIO_FROM_NUMBER = FROM;
  process.env.FOUNDERS_SMS_NUMBERS = NUMBERS;
  delete process.env.FOUNDERS_SMS_AUTOSEND_ALERTS;
  sms.resetSms();
}

function disable() {
  delete process.env.FOUNDERS_SMS_ENABLED;
  delete process.env.FOUNDERS_SMS_AUTOSEND_ALERTS;
  sms.resetSms();
}

function mockTwilio(status) {
  const calls = [];
  const code = status == null ? 201 : status;
  sms.setSmsTransport(async (url, opts) => {
    calls.push({ url: String(url), body: opts && opts.body ? String(opts.body) : '', headers: opts && opts.headers ? opts.headers : {} });
    return { ok: code >= 200 && code < 300, status: code };
  });
  return calls;
}

function formBody(params) {
  return new URLSearchParams(params).toString();
}

function signedInbound(params, signature) {
  const url = 'https://www.lavaall.com/api/sms/inbound';
  const sig = signature == null
    ? sms.computeTwilioSignature(url, params, process.env.TWILIO_AUTH_TOKEN || TOKEN)
    : signature;
  return {
    method: 'POST',
    url: '/api/sms/inbound',
    headers: {
      host: 'www.lavaall.com',
      'x-forwarded-proto': 'https',
      'x-twilio-signature': sig,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: params,
  };
}

function authed(extra) {
  const headers = Object.assign({
    cookie: cookieFor((extra && extra.email) || OSMAN),
    host: 'preview.example.test',
    accept: 'application/json',
    'content-type': 'application/json',
  }, extra && extra.headers ? extra.headers : {});
  return {
    method: extra && extra.method ? extra.method : 'POST',
    headers,
    query: extra && extra.query ? extra.query : { area: 'api/sms/send' },
    url: extra && extra.url ? extra.url : '/ops/api/sms/send',
    body: extra && extra.body,
  };
}

async function capture(fn) {
  const lines = [];
  const orig = console.log;
  console.log = (...args) => { lines.push(args.map(String).join(' ')); };
  try {
    const result = await fn();
    return { result, log: lines.join('\n') };
  } finally {
    console.log = orig;
  }
}

function decodedTo(call) {
  const params = new URLSearchParams(call.body || '');
  return { to: params.get('To') || '', body: params.get('Body') || '' };
}

async function run() {
  {
    process.env.FOUNDERS_SMS_ENABLED = 'yes';
    check('flag yes stays off', sms.foundersSmsEnabled() === false);
    process.env.FOUNDERS_SMS_ENABLED = 'on';
    check('flag on is on', sms.foundersSmsEnabled() === true);
    disable();
    check('flag defaults off', sms.foundersSmsEnabled() === false);
  }

  {
    const calls = mockTwilio();
    const inboundRes = mockRes();
    await inbound(signedInbound({ From: OSMAN_NUMBER, Body: PHRASE }), inboundRes);
    const sendRes = mockRes();
    await ops(authed({ body: { to: 'hameed', text: PHRASE, csrf: lib.createCsrfToken(OSMAN) } }), sendRes);
    check('flag off makes inbound and send 404 without a Twilio call',
      inboundRes.statusCode === 404
      && sendRes.statusCode === 404
      && calls.length === 0);
    disable();
  }

  enable();
  {
    const params = { From: OSMAN_NUMBER, Body: PHRASE };
    const good = mockRes();
    const seen = await capture(() => inbound(signedInbound(params), good));
    const rows = await sms.listSmsInbox();
    check('valid signature stores the text and returns empty TwiML',
      good.statusCode === 200
      && good.raw === '<Response/>'
      && good.headers['Content-Type'] === 'text/xml; charset=utf-8'
      && rows.length === 1
      && rows[0].label === 'Osman'
      && rows[0].text === PHRASE
      && !rows[0].number);
    const bad = mockRes();
    await inbound(signedInbound({ From: OSMAN_NUMBER, Body: 'nope' }, 'not-a-valid-signature'), bad);
    check('invalid signature is 403 and stores nothing',
      bad.statusCode === 403
      && (await sms.listSmsInbox()).length === 1);
    check('inbound log has no full number, token, or message text',
      !seen.log.includes(OSMAN_NUMBER)
      && !seen.log.includes(TOKEN)
      && !seen.log.includes(PHRASE)
      && seen.log.includes('stored'));
  }

  {
    sms.resetSms();
    const stranger = '+19995550111';
    const seen = await capture(async () => {
      const res = mockRes();
      await inbound(signedInbound({ From: stranger, Body: 'merge PR 40' }), res);
      return res;
    });
    check('a non-allowlisted sender gets no reply text and is not stored',
      seen.result.statusCode === 200
      && seen.result.raw === '<Response/>'
      && (await sms.listSmsInbox()).length === 0
      && !seen.log.includes(stranger)
      && seen.log.includes('rejected'));
  }

  {
    sms.resetSms();
    const calls = mockTwilio();
    await inbound(signedInbound({ From: OSMAN_NUMBER, Body: 'STOP' }), mockRes());
    check('STOP stores an opt-out and not an inbox row', (await sms.listSmsInbox()).length === 0);
    const stopped = await capture(() => sms.sendFounderSms({ to: 'osman', text: PHRASE }));
    check('opt-out blocks outbound until START',
      stopped.result.ok === true
      && stopped.result.sent === 0
      && stopped.result.reason === 'opted_out'
      && calls.length === 0
      && !stopped.log.includes(PHRASE)
      && !stopped.log.includes(OSMAN_NUMBER));
    await inbound(signedInbound({ From: OSMAN_NUMBER, Body: 'START' }), mockRes());
    const resumed = await sms.sendFounderSms({ to: 'osman', text: 'hello' });
    check('START allows the next text and prefixes it',
      resumed.sent === 1
      && calls.length === 1
      && decodedTo(calls[0]).to === OSMAN_NUMBER
      && decodedTo(calls[0]).body === 'LAVAALL CEO: hello');
    sms.resetSms();
    await inbound(signedInbound({ From: HAMEED_NUMBER, Body: 'HELP' }), mockRes());
    check('HELP does not enter the inbox', (await sms.listSmsInbox()).length === 0);
    await inbound(signedInbound({ From: HAMEED_NUMBER, Body: 'UNSTOP' }), mockRes());
    check('UNSTOP does not enter the inbox', (await sms.listSmsInbox()).length === 0);
  }

  {
    sms.resetSms();
    const calls = mockTwilio();
    const refused = await sms.sendFounderSms({ to: '+15551212', text: 'hello' });
    const named = await sms.sendFounderSms({ to: 'ada', text: 'hello' });
    check('outbound refuses numbers that are not Osman, Hameed, or both',
      refused.error === 'not_allowlisted'
      && named.error === 'not_allowlisted'
      && calls.length === 0);
    const tail = 'UNIQUE-TAIL-XYZ';
    const longText = `${'a'.repeat(400)}${tail}`;
    const formatted = sms.formatFounderSms(longText);
    const sent = await sms.sendFounderSms({ to: 'hameed', text: longText });
    const body = decodedTo(calls[0]).body;
    check('long texts are prefixed, truncated, and point at /ops',
      sent.sent === 1
      && formatted.length <= sms.SMS_MAX
      && formatted.startsWith(sms.SMS_PREFIX)
      && formatted.includes(sms.SMS_MORE)
      && !formatted.includes(tail)
      && body === formatted
      && decodedTo(calls[0]).to === HAMEED_NUMBER
      && body.length <= 320);
  }

  {
    sms.resetSms();
    const calls = mockTwilio();
    const before = await store.readStore();
    const phrases = ['merge PR 40', 'approve', 'send email to X'];
    for (const text of phrases) {
      const res = mockRes();
      await inbound(signedInbound({ From: HAMEED_NUMBER, Body: text }), res);
      check(`inbound "${text}" returns empty TwiML`, res.statusCode === 200 && res.raw === '<Response/>');
    }
    const after = await store.readStore();
    const rows = await sms.listSmsInbox();
    const feed = await sms.smsContextForCeo();
    const pending = await sms.smsPendingForBridge();
    check('command-like texts are stored untrusted and create no task',
      rows.length === 3
      && rows.map((row) => row.text).join('|') === phrases.join('|')
      && rows.every((row) => row.label === 'Hameed')
      && after.tasks.length === before.tasks.length
      && after.issues.length === before.issues.length
      && calls.length === 0
      && feed.includes('SMS from Hameed')
      && feed.includes(UNTRUSTED_BEGIN)
      && feed.includes(UNTRUSTED_END)
      && feed.includes('mayAct: no')
      && feed.includes('merge PR 40')
      && !feed.includes('\nmayAct: yes\n')
      && pending.length === 3
      && pending.every((item) => item.untrusted === true && item.mayAct === false && item.instruction === 'data-only'));
    const listed = mockRes();
    await ops({
      method: 'GET',
      headers: {
        host: 'preview.example.test',
        accept: 'application/json',
        authorization: `Bearer ${BRIDGE}`,
      },
      query: { area: 'api/ceo-bridge/pending' },
      url: '/ops/api/ceo-bridge/pending',
    }, listed);
    check('CEO pending list includes the SMS feed as data',
      listed.statusCode === 200
      && listed.body.pending.some((item) => item.untrusted === true && String(item.text).includes('send email to X') && item.mayAct === false));
  }

  {
    sms.resetSms();
    const calls = mockTwilio();
    const queued = mockRes();
    await ops({
      method: 'POST',
      headers: {
        host: 'preview.example.test',
        accept: 'application/json',
        'content-type': 'application/json',
        authorization: `Bearer ${BRIDGE}`,
      },
      query: { area: 'api/sms/send' },
      url: '/ops/api/sms/send',
      body: { to: 'both', text: PHRASE },
    }, queued);
    check('sms-send queues until a founder confirms',
      queued.statusCode === 200
      && queued.body.queued === true
      && calls.length === 0);
    const page = mockRes();
    await ops({
      method: 'GET',
      headers: { cookie: cookieFor(OSMAN), host: 'preview.example.test', accept: 'text/html' },
      query: { area: 'profile' },
      url: '/ops/profile',
    }, page);
    check('profile settings show the masked number and the confirm step',
      page.statusCode === 200
      && String(page.raw).includes('Test text')
      && String(page.raw).includes('••23')
      && String(page.raw).includes('Confirm send')
      && String(page.raw).includes('Hameed')
      && !String(page.raw).includes(OSMAN_NUMBER)
      && !String(page.raw).includes(HAMEED_NUMBER)
      && !String(page.raw).includes(TOKEN));
    const missing = mockRes();
    await ops(authed({
      url: '/ops/profile',
      query: { area: 'profile' },
      body: { action: 'sms-test', confirmMask: '••23' },
    }), missing);
    check('test text without CSRF is rejected', missing.statusCode === 403 && calls.length === 0);
    const wrong = mockRes();
    await ops(authed({
      url: '/ops/profile',
      query: { area: 'profile' },
      body: { action: 'sms-test', confirmMask: OSMAN_NUMBER, csrf: lib.createCsrfToken(OSMAN) },
    }), wrong);
    check('test text requires the masked number, not the full number',
      wrong.statusCode === 400 && calls.length === 0);
    const test = mockRes();
    await ops(authed({
      url: '/ops/profile',
      query: { area: 'profile' },
      body: { action: 'sms-test', confirmMask: '••23', csrf: lib.createCsrfToken(OSMAN), to: 'hameed' },
    }), test);
    check('test text goes only to the signed-in founder',
      test.statusCode === 200
      && test.body.sent === 1
      && calls.length === 1
      && decodedTo(calls[0]).to === OSMAN_NUMBER);
    calls.length = 0;
    const confirmed = mockRes();
    await ops(authed({
      url: '/ops/profile',
      query: { area: 'profile' },
      body: { action: 'sms-confirm', id: queued.body.id, csrf: lib.createCsrfToken(OSMAN) },
    }), confirmed);
    check('founder confirm sends to both allowlisted numbers',
      confirmed.statusCode === 200
      && confirmed.body.sent === 2
      && calls.length === 2
      && calls.map((call) => decodedTo(call).to).sort().join() === [OSMAN_NUMBER, HAMEED_NUMBER].sort().join()
      && calls.every((call) => decodedTo(call).body === `LAVAALL CEO: ${PHRASE}`)
      && calls.every((call) => String(call.url).includes('api.twilio.com')));
  }

  {
    sms.resetSms();
    process.env.FOUNDERS_SMS_AUTOSEND_ALERTS = 'true';
    const calls = mockTwilio();
    const sent = await sms.queueOrSend({ to: 'hameed', text: 'ping' });
    check('autosend true delivers without a queue',
      sent.sent === 1 && sent.queued !== true && calls.length === 1);
    delete process.env.FOUNDERS_SMS_AUTOSEND_ALERTS;
  }

  {
    sms.resetSms();
    const calls = mockTwilio();
    let last = null;
    for (let i = 0; i < 30; i += 1) last = await sms.sendFounderSms({ to: 'osman', text: `n${i}` });
    const blocked = await sms.sendFounderSms({ to: 'osman', text: PHRASE });
    check('thirty texts a day is the cap',
      last.sent === 1
      && calls.length === 30
      && blocked.sent === 0
      && blocked.reason === 'rate_limited');
  }

  {
    sms.resetSms();
    const outsider = mockRes();
    await ops(authed({
      email: OUTSIDER,
      body: { to: 'osman', text: 'hi', csrf: lib.createCsrfToken(OUTSIDER) },
    }), outsider);
    check('an outsider cannot send', outsider.statusCode === 403);
    const badSecret = mockRes();
    await ops({
      method: 'POST',
      headers: {
        host: 'preview.example.test',
        accept: 'application/json',
        'content-type': 'application/json',
        authorization: 'Bearer not-the-secret',
      },
      query: { area: 'api/sms/send' },
      url: '/ops/api/sms/send',
      body: { to: 'osman', text: 'hi' },
    }, badSecret);
    check('a bad bridge secret cannot send', badSecret.statusCode === 403);
  }

  {
    sms.resetSms();
    const first = `first-${PHRASE}`;
    const origLog = console.log;
    console.log = () => {};
    try {
      for (let i = 0; i < sms.INBOX_CAP; i += 1) {
        await inbound(signedInbound({ From: OSMAN_NUMBER, Body: i === 0 ? first : `row-${i}` }), mockRes());
      }
      await inbound(signedInbound({ From: OSMAN_NUMBER, Body: 'newest-row' }), mockRes());
    } finally {
      console.log = origLog;
    }
    const rows = await sms.listSmsInbox();
    check('inbox keeps the newest 200 texts',
      rows.length === sms.INBOX_CAP
      && rows[0].text !== first
      && rows[rows.length - 1].text === 'newest-row');
  }

  {
    const prior = process.env.VERCEL_ENV;
    delete process.env.VERCEL_ENV;
    const prod = sms.smsKeys();
    process.env.VERCEL_ENV = 'preview';
    const preview = sms.smsKeys();
    if (prior == null) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = prior;
    check('production inbox key is sms:inbox and preview is prefixed',
      prod.inbox === 'sms:inbox' && preview.inbox === 'preview:sms:inbox');
  }

  {
    disable();
    const page = mockRes();
    await ops({
      method: 'GET',
      headers: { cookie: cookieFor(OSMAN), host: 'preview.example.test', accept: 'text/html' },
      query: { area: 'profile' },
      url: '/ops/profile',
    }, page);
    check('flag off hides the test text control',
      page.statusCode === 200 && !String(page.raw).includes('Test text') && !String(page.raw).includes('sms-test'));
    enable();
    const script = mockRes();
    await inbound(signedInbound({ From: OSMAN_NUMBER, Body: '<script>alert(1)</script>' }), script);
    const inboxPage = mockRes();
    await ops({
      method: 'GET',
      headers: { cookie: cookieFor(HAMEED), host: 'preview.example.test', accept: 'text/html' },
      query: { area: 'inbox' },
      url: '/ops/inbox',
    }, inboxPage);
    check('inbox escapes SMS text',
      String(inboxPage.raw).includes('SMS from Osman')
      && String(inboxPage.raw).includes('&lt;script&gt;')
      && !String(inboxPage.raw).includes('<script>alert(1)</script>'));
  }

  {
    const source = fs.readFileSync(path.join(opsDir, '_sms.js'), 'utf8')
      + fs.readFileSync(path.join(root, 'api/sms/inbound.js'), 'utf8');
    check('the SMS modules do not send mail, assign work, or merge',
      !/addTask|addIssue|sendGmail|_assign|mergePullRequest|conversations\.open/.test(source)
      && source.includes('Hameed')
      && !source.includes('Hamid'));
    const env = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
    const privacy = fs.readFileSync(path.join(root, 'privacy.html'), 'utf8');
    const terms = fs.readFileSync(path.join(root, 'terms.html'), 'utf8');
    check('.env.example documents SMS placeholders and does not set them',
      env.includes('FOUNDERS_SMS_ENABLED')
      && env.includes('TWILIO_ACCOUNT_SID')
      && env.includes('TWILIO_AUTH_TOKEN')
      && env.includes('TWILIO_FROM_NUMBER')
      && env.includes('FOUNDERS_SMS_NUMBERS')
      && env.includes('FOUNDERS_SMS_AUTOSEND_ALERTS')
      && env.includes('Hameed')
      && env.includes('+1XXXXXXXXXX')
      && env.includes('https://www.lavaall.com/api/sms/inbound')
      && !env.includes('Hamid')
      && !/^FOUNDERS_SMS_ENABLED=.+/m.test(env)
      && !/^TWILIO_ACCOUNT_SID=.+/m.test(env)
      && !/^TWILIO_AUTH_TOKEN=.+/m.test(env)
      && !/^TWILIO_FROM_NUMBER=.+/m.test(env)
      && !/^FOUNDERS_SMS_NUMBERS=.+/m.test(env)
      && !/^FOUNDERS_SMS_AUTOSEND_ALERTS=.+/m.test(env));
    check('privacy and terms describe founders-only SMS',
      privacy.includes('<h2>Text messages (SMS)</h2>')
      && privacy.includes('STOP')
      && privacy.includes('HELP')
      && privacy.includes('not marketing')
      && privacy.includes('Message and data rates may apply')
      && privacy.includes('not shared')
      && terms.includes('<h2>Text messages (SMS)</h2>')
      && terms.includes('STOP')
      && terms.includes('HELP')
      && terms.includes('No marketing')
      && terms.includes('not shared')
      && !privacy.includes('Hamid')
      && !terms.includes('Hamid'));
  }

  disable();
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
