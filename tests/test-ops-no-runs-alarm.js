// No-runs alarm: stale/fresh/one-stale/dedupe logic, cron bearer, flag default off.
const fs = require('fs');
const path = require('path');

const opsDir = path.join(__dirname, '../api/ops');
const health = require(path.join(opsDir, '_routine_health.js'));
const tri = require(path.join(opsDir, '_inbox_triage.js'));
const alarm = require(path.join(opsDir, '_no_runs_alarm.js'));
const route = require(path.join(__dirname, '../api/no-runs-alarm.js'));

const CRON_SECRET = 'test-cron-secret-32chars-please!!';
const BRIDGE_SECRET = 'test-ceo-bridge-secret-32chars!!';
const FEED_SECRET = 'test-inbox-feed-secret-32chars!!';
const AUTH_SECRET = 'test-ops-auth-secret-32chars!!';

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

function isoAt(ms) {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function healthSnapshot(at) {
  return {
    generatedAt: isoAt(at),
    routines: [
      { slug: 'ceo-talk-bridge-poll', status: 'OK', lastRunAt: isoAt(at), reason: 'polled' },
    ],
  };
}

function inboxFeed(at) {
  return {
    generatedAt: isoAt(at),
    mailbox: 'support@lavaall.com',
    items: [{
      id: 'aaaa0000000000a1',
      threadId: 'aaaa0000000000a1',
      receivedAt: isoAt(at),
      from: 'Example <example@example.com>',
      subject: 'RFQ',
      unread: true,
      flag: 'Real',
      urgency: 'Urgent',
      category: 'customer',
      reason: 'Customer quote request.',
      notes: [],
      checks: 'SPF pass',
      via: '',
      jev: { status: 'NOT_RUN', legit: null, urgency: null },
    }],
  };
}

function cronReq(extra) {
  const secret = extra && Object.prototype.hasOwnProperty.call(extra, 'secret') ? extra.secret : CRON_SECRET;
  const headers = Object.assign({
    host: 'preview.example.test',
    accept: 'application/json',
  }, extra && extra.headers ? extra.headers : {});
  if (secret) headers.authorization = `Bearer ${secret}`;
  return {
    method: (extra && extra.method) || 'GET',
    headers,
    url: (extra && extra.url) || '/api/no-runs-alarm',
    query: extra && extra.query ? extra.query : {},
  };
}

async function postHealth(at) {
  const realNow = Date.now;
  Date.now = () => at;
  try {
    const res = mockRes();
    await health.handleRoutineHealth({
      method: 'POST',
      headers: {
        authorization: `Bearer ${BRIDGE_SECRET}`,
        'content-type': 'application/json',
      },
      url: '/ops/api/ceo-bridge/routine-health',
      query: { area: 'api/ceo-bridge/routine-health' },
      body: healthSnapshot(at),
    }, res);
    return res;
  } finally {
    Date.now = realNow;
  }
}

async function postInbox(at) {
  const realNow = Date.now;
  Date.now = () => at;
  try {
    const res = mockRes();
    await tri.handleInboxTriage({
      method: 'POST',
      headers: {
        authorization: `Bearer ${FEED_SECRET}`,
        'content-type': 'application/json',
      },
      url: '/ops/api/inbox-triage',
      query: { area: 'api/inbox-triage' },
      body: inboxFeed(at),
    }, res);
    return res;
  } finally {
    Date.now = realNow;
  }
}

function enableFeeds() {
  process.env.OPS_ROUTINE_HEALTH_ENABLED = '1';
  process.env.OPS_INBOX_TRIAGE_ENABLED = '1';
  process.env.OPS_CEO_BRIDGE_SECRET = BRIDGE_SECRET;
  process.env.OPS_INBOX_FEED_SECRET = FEED_SECRET;
}

function disableFeeds() {
  delete process.env.OPS_ROUTINE_HEALTH_ENABLED;
  delete process.env.OPS_INBOX_TRIAGE_ENABLED;
}

function enableAlarm() {
  process.env.OPS_NO_RUNS_ALARM_ENABLED = '1';
  process.env.CRON_SECRET = CRON_SECRET;
}

function disableAlarm() {
  delete process.env.OPS_NO_RUNS_ALARM_ENABLED;
}

function resetStores() {
  health.resetRoutineHealth();
  tri.resetInboxTriage();
  alarm.resetNoRunsAlarm();
}

async function run() {
  const origFetch = global.fetch;
  process.env.OPS_AUTH_SECRET = AUTH_SECRET;
  for (const key of ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'VERCEL', 'VERCEL_ENV', 'OPS_STORE_FILE', 'OPS_NO_RUNS_ALARM_STALE_HOURS', 'RESEND_API_KEY', 'OPS_FROM_EMAIL']) {
    delete process.env[key];
  }
  disableAlarm();
  disableFeeds();
  resetStores();

  check('flag defaults off', alarm.noRunsAlarmEnabled() === false);
  process.env.OPS_NO_RUNS_ALARM_ENABLED = 'true';
  check('true enables the flag', alarm.noRunsAlarmEnabled() === true);
  process.env.OPS_NO_RUNS_ALARM_ENABLED = 'on';
  check('on enables the flag', alarm.noRunsAlarmEnabled() === true);
  process.env.OPS_NO_RUNS_ALARM_ENABLED = 'yes';
  check('yes does not enable the flag', alarm.noRunsAlarmEnabled() === false);
  process.env.OPS_NO_RUNS_ALARM_ENABLED = '1';
  check('1 enables the flag', alarm.noRunsAlarmEnabled() === true);
  disableAlarm();

  check('default threshold is 6 hours', alarm.staleThresholdMs() === alarm.DEFAULT_STALE_MS && alarm.DEFAULT_STALE_HOURS === 6);
  process.env.OPS_NO_RUNS_ALARM_STALE_HOURS = '8';
  check('OPS_NO_RUNS_ALARM_STALE_HOURS=8 sets an 8 hour threshold', alarm.staleThresholdMs() === 8 * 60 * 60 * 1000);
  process.env.OPS_NO_RUNS_ALARM_STALE_HOURS = '0';
  check('zero hours falls back to 6', alarm.staleThresholdMs() === alarm.DEFAULT_STALE_MS);
  process.env.OPS_NO_RUNS_ALARM_STALE_HOURS = '169';
  check('hours over 168 fall back to 6', alarm.staleThresholdMs() === alarm.DEFAULT_STALE_MS);
  process.env.OPS_NO_RUNS_ALARM_STALE_HOURS = 'nope';
  check('invalid hours fall back to 6', alarm.staleThresholdMs() === alarm.DEFAULT_STALE_MS);
  delete process.env.OPS_NO_RUNS_ALARM_STALE_HOURS;

  const now = Date.parse('2026-11-20T14:00:00Z');
  const freshAt = now - (60 * 60 * 1000);
  const staleAt = now - alarm.DEFAULT_STALE_MS - 1;
  const exactAt = now - alarm.DEFAULT_STALE_MS;
  const thresholdMs = alarm.DEFAULT_STALE_MS;

  const fresh = alarm.evaluateNoRuns({
    now, thresholdMs, routine: { landedAt: freshAt }, inbox: { landedAt: freshAt }, lastAlert: null,
  });
  check('fresh: both recent signals skip and close any alert',
    fresh.action === 'skip' && fresh.reason === 'fresh' && fresh.nextAlert && fresh.nextAlert.open === false);

  const stale = alarm.evaluateNoRuns({
    now, thresholdMs, routine: { landedAt: staleAt }, inbox: { landedAt: staleAt }, lastAlert: null,
  });
  check('stale: both older than 6 hours alert once',
    stale.action === 'alert' && stale.reason === 'stale' && stale.nextAlert.open === true);

  const missing = alarm.evaluateNoRuns({
    now, thresholdMs, routine: { landedAt: null }, inbox: { landedAt: null }, lastAlert: null,
  });
  check('missing records count as stale and alert',
    missing.action === 'alert' && missing.routine.stale === true && missing.inbox.stale === true);

  const oneHealth = alarm.evaluateNoRuns({
    now, thresholdMs, routine: { landedAt: staleAt }, inbox: { landedAt: freshAt }, lastAlert: null,
  });
  const oneInbox = alarm.evaluateNoRuns({
    now, thresholdMs, routine: { landedAt: freshAt }, inbox: { landedAt: staleAt }, lastAlert: null,
  });
  check('one-stale: a fresh inbox push does not alert',
    oneHealth.action === 'skip' && oneHealth.reason === 'one_fresh');
  check('one-stale: a fresh routine-health snapshot does not alert',
    oneInbox.action === 'skip' && oneInbox.reason === 'one_fresh');

  const exact = alarm.evaluateNoRuns({
    now, thresholdMs, routine: { landedAt: exactAt }, inbox: { landedAt: exactAt }, lastAlert: null,
  });
  check('exactly 6 hours old is still fresh',
    exact.action === 'skip' && exact.reason === 'fresh');

  const deduped = alarm.evaluateNoRuns({
    now, thresholdMs, routine: { landedAt: staleAt }, inbox: { landedAt: staleAt }, lastAlert: { open: true, sentAt: now - 3600000, routineLandedAt: staleAt, inboxLandedAt: staleAt },
  });
  check('dedupe: a still-open outage does not alert again',
    deduped.action === 'dedupe' && deduped.reason === 'already_alerted');

  const recoveredThenStale = alarm.evaluateNoRuns({
    now, thresholdMs, routine: { landedAt: staleAt }, inbox: { landedAt: staleAt }, lastAlert: { open: false },
  });
  check('after recovery, a new outage can alert again',
    recoveredThenStale.action === 'alert');

  const storeErr = alarm.evaluateNoRuns({
    now, thresholdMs, routine: { error: 'store_unavailable' }, inbox: { landedAt: staleAt }, lastAlert: null,
  });
  check('a store error on one signal does not alert',
    storeErr.action === 'store_unavailable');

  check('Chicago labels use America/Chicago and CT',
    alarm.formatChicagoFromMs(Date.parse('2026-11-17T21:00:00Z')) === 'Tue Nov 17, 2026, 3:00 PM CT');

  // --- HTTP + store path ---
  enableFeeds();
  enableAlarm();
  resetStores();

  {
    const res = mockRes();
    await route(cronReq({ secret: '' }), res);
    const missingSecret = mockRes();
    const saved = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;
    await route(cronReq({ secret: CRON_SECRET }), missingSecret);
    process.env.CRON_SECRET = saved;
    const wrong = mockRes();
    await route(cronReq({ secret: 'wrong-cron-secret-32chars-please!!' }), wrong);
    check('auth failure: missing bearer, unset CRON_SECRET, or wrong bearer is 401',
      [res, missingSecret, wrong].every((row) => row.statusCode === 401 && row.body.error === 'unauthorized'));
  }

  {
    const sent = [];
    alarm.setNoRunsAlarmSender(async (msg) => { sent.push(msg); return { ok: true, via: 'resend' }; });
    disableAlarm();
    const res = mockRes();
    await route(cronReq(), res);
    check('flag off: authorized cron is skipped and does not email',
      res.statusCode === 200 && res.body.skipped === true && res.body.reason === 'disabled' && sent.length === 0);
    enableAlarm();
  }

  {
    const res = mockRes();
    await route(cronReq({ method: 'POST' }), res);
    check('POST is 405', res.statusCode === 405 && res.body.error === 'method_not_allowed');
  }

  {
    resetStores();
    const healthPut = await postHealth(freshAt);
    const inboxPut = await postInbox(freshAt);
    const sent = [];
    alarm.setNoRunsAlarmSender(async (msg) => { sent.push(msg); return { ok: true, via: 'resend' }; });
    const realNow = Date.now;
    Date.now = () => now;
    const res = mockRes();
    await route(cronReq(), res);
    Date.now = realNow;
    check('seeded fresh health and inbox posts succeed', healthPut.statusCode === 200 && inboxPut.statusCode === 200);
    check('fresh store records: HTTP path skips and does not email',
      res.statusCode === 200 && res.body.ok === true && res.body.reason === 'fresh' && sent.length === 0);
  }

  {
    resetStores();
    const healthPut = await postHealth(staleAt);
    const inboxPut = await postInbox(freshAt);
    const sent = [];
    alarm.setNoRunsAlarmSender(async (msg) => { sent.push(msg); return { ok: true, via: 'resend' }; });
    const realNow = Date.now;
    Date.now = () => now;
    const res = mockRes();
    await route(cronReq(), res);
    Date.now = realNow;
    check('one-stale store records: HTTP path skips',
      healthPut.statusCode === 200 && inboxPut.statusCode === 200
      && res.statusCode === 200 && res.body.reason === 'one_fresh' && sent.length === 0);
  }

  {
    resetStores();
    const healthPut = await postHealth(staleAt);
    const inboxPut = await postInbox(staleAt);
    const sent = [];
    alarm.setNoRunsAlarmSender(async (msg) => { sent.push(msg); return { ok: true, via: 'test' }; });
    const realNow = Date.now;
    Date.now = () => now;
    const first = mockRes();
    await route(cronReq(), first);
    const second = mockRes();
    await route(cronReq(), second);
    Date.now = realNow;
    check('stale store records: first cron emails support@ once',
      healthPut.statusCode === 200 && inboxPut.statusCode === 200
      && first.statusCode === 200 && first.body.alerted === true
      && sent.length === 1 && sent[0].to === 'support@lavaall.com'
      && /no agent signal in 6 hours/.test(sent[0].subject)
      && /Routine health last landed/.test(sent[0].text)
      && /Inbox push last landed/.test(sent[0].text));
    check('dedupe: second hourly cron does not email again',
      second.statusCode === 200 && second.body.skipped === true && second.body.reason === 'already_alerted' && sent.length === 1);
  }

  {
    resetStores();
    await postHealth(staleAt);
    await postInbox(staleAt);
    const sent = [];
    alarm.setNoRunsAlarmSender(async () => ({ ok: false, code: 'delivery_not_configured' }));
    const realNow = Date.now;
    Date.now = () => now;
    const failed = mockRes();
    await route(cronReq(), failed);
    alarm.setNoRunsAlarmSender(async (msg) => { sent.push(msg); return { ok: true, via: 'gmail' }; });
    const retry = mockRes();
    await route(cronReq(), retry);
    Date.now = realNow;
    check('failed send is 503 and is retried on the next cron',
      failed.statusCode === 503 && failed.body.error === 'delivery_not_configured'
      && retry.statusCode === 200 && retry.body.alerted === true && retry.body.via === 'gmail' && sent.length === 1);
  }

  {
    const env = fs.readFileSync(path.join(__dirname, '../.env.example'), 'utf8');
    const doc = fs.readFileSync(path.join(__dirname, '../docs/ops/no-runs-alarm.md'), 'utf8');
    const vercel = JSON.parse(fs.readFileSync(path.join(__dirname, '../vercel.json'), 'utf8'));
    const cron = (vercel.crons || []).find((row) => row.path === alarm.ENDPOINT);
    check('vercel.json has an hourly cron on /api/no-runs-alarm',
      cron && cron.schedule === '0 * * * *');
    check('docs describe the flag, CRON_SECRET bearer, 6 hour default, and support@ destination',
      doc.includes('OPS_NO_RUNS_ALARM_ENABLED')
      && doc.includes('OPS_NO_RUNS_ALARM_STALE_HOURS')
      && doc.includes('CRON_SECRET')
      && doc.includes('Authorization: Bearer $CRON_SECRET')
      && doc.includes('/api/no-runs-alarm')
      && doc.includes('support@lavaall.com')
      && doc.includes('6 hours')
      && !/Bearer\s+[A-Za-z0-9+/=_-]{16,}/.test(doc.replace(/\$CRON_SECRET/g, '')));
    check('.env.example lists names only, flag off, no secret values',
      env.includes('OPS_NO_RUNS_ALARM_ENABLED')
      && env.includes('OPS_NO_RUNS_ALARM_STALE_HOURS')
      && env.includes('CRON_SECRET')
      && !/^OPS_NO_RUNS_ALARM_ENABLED=.+/m.test(env)
      && !/^OPS_NO_RUNS_ALARM_STALE_HOURS=.+/m.test(env)
      && !/^#?\s*CRON_SECRET=.+/m.test(env));
  }

  disableAlarm();
  disableFeeds();
  resetStores();
  global.fetch = origFetch;

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
