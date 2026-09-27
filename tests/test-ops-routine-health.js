// Routine health strip: shape, size cap, escaping, bridge vs founder auth.
const fs = require('fs');
const path = require('path');

const opsDir = path.join(__dirname, '../api/ops');
const lib = require(path.join(opsDir, '_lib.js'));
const ceo = require(path.join(opsDir, '_ceo_bridge.js'));
const health = require(path.join(opsDir, '_routine_health.js'));
const ops = require(path.join(opsDir, 'index.js'));

const SECRET = 'test-ops-auth-secret-32chars!!';
const BRIDGE_SECRET = 'test-ceo-bridge-secret-32chars!!';
const ALLOWED = 'osmanjalloh104@gmail.com';
const OTHER = 'abdulhbah55@gmail.com';
const STRANGER = 'stranger@example.com';
const ATTACK = '<script>alert(1)</script> & "x" \'';

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

function founderReq(extra) {
  const headers = {
    cookie: cookieFor((extra && extra.email) || ALLOWED),
    host: 'preview.example.test',
    accept: extra && extra.html ? 'text/html' : 'application/json',
  };
  if (!(extra && extra.html)) headers['content-type'] = 'application/json';
  Object.assign(headers, extra && extra.headers ? extra.headers : {});
  return {
    method: extra && extra.method ? extra.method : 'GET',
    headers,
    query: extra && extra.query ? extra.query : {},
    url: extra && extra.url ? extra.url : '/ops',
    body: extra && extra.body,
  };
}

function bridgePost(body, extra) {
  const secret = extra && extra.secret !== undefined ? extra.secret : BRIDGE_SECRET;
  const headers = Object.assign({
    host: 'preview.example.test',
    accept: 'application/json',
    'content-type': 'application/json',
  }, extra && extra.headers ? extra.headers : {});
  if (secret) headers.authorization = `Bearer ${secret}`;
  return {
    method: extra && extra.method ? extra.method : 'POST',
    headers,
    query: { area: 'api/ceo-bridge/routine-health' },
    url: '/ops/api/ceo-bridge/routine-health',
    body,
  };
}

function row(slug, status, lastRunAt, reason) {
  return { slug, status, lastRunAt, reason };
}

function snapshot(overrides) {
  const now = new Date().toISOString();
  const base = {
    generatedAt: now,
    routines: [
      row('eod-jev-review', 'OK', '2026-09-27T05:00:12Z', 'scored'),
      row('scout-scan', 'PARTIAL', '2026-09-27T23:05:00Z', 'one source skipped'),
      row('kit-registry-sync', 'NOT_WIRED', null, 'no schedule'),
      row('overnight-morning-brief', 'FAILED', '2026-09-25T11:00:00Z', 'cause unknown'),
      row('vault-flush', 'RUNNING', '2026-09-27T22:00:00Z', 'still going'),
      row('creator-scan', 'STARTED_NO_END', '2026-09-27T21:00:00Z', 'no end line'),
      row('missing-job', 'MISSING', null, 'expected run absent'),
    ],
  };
  return Object.assign(base, overrides || {});
}

function enable() {
  process.env.OPS_ROUTINE_HEALTH_ENABLED = '1';
}

function disable() {
  delete process.env.OPS_ROUTINE_HEALTH_ENABLED;
}

async function run() {
  const origFetch = global.fetch;
  process.env.OPS_AUTH_SECRET = SECRET;
  process.env.OPS_CEO_BRIDGE_SECRET = BRIDGE_SECRET;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  delete process.env.VERCEL_ENV;
  delete process.env.OPS_STORE_FILE;
  disable();
  health.resetRoutineHealth();

  check('flag defaults off', health.routineHealthEnabled() === false);
  process.env.OPS_ROUTINE_HEALTH_ENABLED = 'true';
  check('true enables the flag', health.routineHealthEnabled() === true);
  process.env.OPS_ROUTINE_HEALTH_ENABLED = 'on';
  check('on enables the flag', health.routineHealthEnabled() === true);
  process.env.OPS_ROUTINE_HEALTH_ENABLED = 'yes';
  check('yes does not enable the flag', health.routineHealthEnabled() === false);
  disable();

  check('chicago time labels America/Chicago as CT',
    health.formatChicago('2026-09-27T23:05:00Z') === 'Sep 27, 6:05 PM CT');
  check('stale is older than 26 hours, not equal',
    health.snapshotIsStale('2026-09-26T00:00:00Z', Date.parse('2026-09-26T00:00:00Z') + health.STALE_MS) === false
    && health.snapshotIsStale('2026-09-26T00:00:00Z', Date.parse('2026-09-26T00:00:00Z') + health.STALE_MS + 1) === true);

  const tones = {
    OK: 'ok',
    PARTIAL: 'warn',
    STARTED_NO_END: 'warn',
    NOT_WIRED: 'warn',
    FAILED: 'bad',
    MISSING: 'bad',
    RUNNING: 'run',
  };
  check('every status has one tone',
    health.STATUSES.every((status) => health.toneFor(status) === tones[status])
    && health.toneFor('ok') === '');

  check('bridge kind is routine-health',
    ceo.ceoBridgeKind({
      url: '/ops/api/ceo-bridge/routine-health',
      query: { area: 'api/ceo-bridge/routine-health' },
    }) === 'routine-health');
  check('routine-health does not steal confirm or reply',
    ceo.ceoBridgeKind({ url: '/ops/api/ceo-bridge/confirm', query: { area: 'api/ceo-bridge/confirm' } }) === 'confirm'
    && ceo.ceoBridgeKind({ url: '/ops/api/ceo-bridge/reply', query: { area: 'api/ceo-bridge/reply' } }) === 'reply');

  {
    const post = mockRes();
    await ops(bridgePost(snapshot()), post);
    const read = mockRes();
    await ops(founderReq({
      url: '/ops/api/ceo-bridge/routine-health',
      query: { area: 'api/ceo-bridge/routine-health' },
    }), read);
    const home = mockRes();
    await ops(founderReq({ html: true, url: '/ops', query: { area: 'dashboard' } }), home);
    check('flag off hides post, read, and the strip',
      post.statusCode === 404 && post.body && post.body.error === 'not_found'
      && read.statusCode === 404
      && typeof home.raw === 'string'
      && !home.raw.includes('Routine health')
      && !home.raw.includes('ops-routine-health.js'));
  }

  enable();
  health.resetRoutineHealth();

  {
    const home = mockRes();
    await ops(founderReq({ html: true, url: '/ops', query: {} }), home);
    check('flag on with no snapshot says No data yet',
      home.statusCode === 200
      && typeof home.raw === 'string'
      && home.raw.includes('Routine health')
      && home.raw.includes('No data yet')
      && home.raw.includes('ops-routine-health.js')
      && home.raw.includes('data-role="stale" hidden'));
  }

  const bad = [
    ['missing generatedAt', { routines: [] }],
    ['extra top-level field', Object.assign(snapshot(), { note: 'x' })],
    ['lowercase status', snapshot({
      routines: [row('eod-jev-review', 'ok', null, 'no')],
    })],
    ['unknown status', snapshot({
      routines: [row('eod-jev-review', 'WARN', null, 'no')],
    })],
    ['bad slug', snapshot({
      routines: [row('../etc', 'OK', null, 'no')],
    })],
    ['duplicate slug', snapshot({
      routines: [
        row('eod-jev-review', 'OK', null, 'a'),
        row('eod-jev-review', 'FAILED', null, 'b'),
      ],
    })],
    ['missing reason', {
      generatedAt: new Date().toISOString(),
      routines: [{ slug: 'eod-jev-review', status: 'OK', lastRunAt: null }],
    }],
    ['offset timestamp', snapshot({ generatedAt: '2026-09-27T23:05:00+00:00' })],
    ['impossible day', snapshot({ generatedAt: '2026-02-31T00:00:00Z' })],
    ['future generatedAt', snapshot({
      generatedAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    })],
    ['newline in reason', snapshot({
      routines: [row('eod-jev-review', 'OK', null, 'line\nbreak')],
    })],
    ['reason too long', snapshot({
      routines: [row('eod-jev-review', 'OK', null, 'a'.repeat(health.MAX_REASON + 1))],
    })],
    ['too many routines', snapshot({
      routines: Array.from({ length: health.MAX_ROUTINES + 1 }, (_, i) => row(`job-${i}`, 'OK', null, 'ok')),
    })],
    ['array body', []],
    ['null body', null],
  ];
  for (const [name, body] of bad) {
    health.resetRoutineHealth();
    const res = mockRes();
    await ops(bridgePost(body), res);
    const read = mockRes();
    await ops(founderReq({
      url: '/ops/api/ceo-bridge/routine-health',
      query: { area: 'api/ceo-bridge/routine-health' },
    }), read);
    const error = name === 'null body' ? 'invalid_json' : 'invalid_shape';
    check(`rejects ${name}`,
      res.statusCode === 400
      && res.body
      && res.body.error === error
      && read.body
      && read.body.empty === true);
  }

  {
    health.resetRoutineHealth();
    const empty = mockRes();
    await ops(bridgePost(snapshot({ routines: [] })), empty);
    const home = mockRes();
    await ops(founderReq({ html: true, url: '/ops', query: { area: 'dashboard' } }), home);
    check('empty routine list is stored and is not No data yet',
      empty.statusCode === 200
      && empty.body
      && empty.body.count === 0
      && typeof home.raw === 'string'
      && home.raw.includes('No routines reported')
      && !home.raw.includes('No data yet'));
  }

  {
    health.resetRoutineHealth();
    const over = mockRes();
    await ops(bridgePost('x'.repeat(health.MAX_SNAPSHOT_BYTES + 1)), over);
    const atCap = mockRes();
    await ops(bridgePost('x'.repeat(health.MAX_SNAPSHOT_BYTES)), atCap);
    const declared = mockRes();
    await ops(bridgePost(snapshot(), {
      headers: { 'content-length': String(health.MAX_SNAPSHOT_BYTES + 50) },
    }), declared);
    const read = mockRes();
    await ops(founderReq({
      url: '/ops/api/ceo-bridge/routine-health',
      query: { area: 'api/ceo-bridge/routine-health' },
    }), read);
    check('size cap rejects over 20KB and a large content-length',
      over.statusCode === 413
      && over.body
      && over.body.error === 'payload_too_large'
      && atCap.statusCode === 400
      && declared.statusCode === 413
      && read.body
      && read.body.empty === true);
  }

  {
    health.resetRoutineHealth();
    const attackSnap = snapshot({
      routines: [row('eod-jev-review', 'FAILED', '2026-09-27T23:05:00Z', ATTACK)],
    });
    const posted = mockRes();
    await ops(bridgePost(attackSnap), posted);
    const read = mockRes();
    await ops(founderReq({
      url: '/ops/api/ceo-bridge/routine-health',
      query: { area: 'api/ceo-bridge/routine-health' },
    }), read);
    const home = mockRes();
    await ops(founderReq({ html: true, url: '/ops', query: { area: 'dashboard' } }), home);
    const html = String(home.raw || '');
    const escaped = '&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot; &#39;';
    check('post does not echo the reason',
      posted.statusCode === 200
      && posted.body
      && posted.body.stored === true
      && !JSON.stringify(posted.body).includes('<script>'));
    check('founder JSON keeps the raw reason as data',
      read.statusCode === 200
      && read.body
      && read.body.routines
      && read.body.routines[0].reason === ATTACK
      && read.body.routines[0].lastRunLabel === 'Sep 27, 6:05 PM CT');
    check('dashboard escapes untrusted reason text',
      html.includes(escaped)
      && !html.includes('<script>alert(1)</script>')
      && html.includes('class="rh-dot rh-bad"')
      && html.includes('Sep 27, 6:05 PM CT'));
  }

  {
    health.resetRoutineHealth();
    const posted = mockRes();
    await ops(bridgePost(snapshot()), posted);
    const bearerRead = mockRes();
    await ops(bridgePost(undefined, { method: 'GET' }), bearerRead);
    const bearerAndCookie = mockRes();
    await ops(founderReq({
      url: '/ops/api/ceo-bridge/routine-health',
      query: { area: 'api/ceo-bridge/routine-health' },
      headers: { authorization: `Bearer ${BRIDGE_SECRET}` },
    }), bearerAndCookie);
    const founder = mockRes();
    await ops(founderReq({
      email: OTHER,
      url: '/ops/api/ceo-bridge/routine-health',
      query: { area: 'api/ceo-bridge/routine-health' },
    }), founder);
    const stranger = mockRes();
    await ops(founderReq({
      email: STRANGER,
      url: '/ops/api/ceo-bridge/routine-health',
      query: { area: 'api/ceo-bridge/routine-health' },
    }), stranger);
    const anon = mockRes();
    await ops({
      method: 'GET',
      headers: { accept: 'application/json', host: 'preview.example.test' },
      query: { area: 'api/ceo-bridge/routine-health' },
      url: '/ops/api/ceo-bridge/routine-health',
    }, anon);
    const founderPost = mockRes();
    await ops(founderReq({
      method: 'POST',
      url: '/ops/api/ceo-bridge/routine-health',
      query: { area: 'api/ceo-bridge/routine-health' },
      body: snapshot({ routines: [row('eod-jev-review', 'MISSING', null, 'should-not-store')] }),
    }), founderPost);
    const wrong = mockRes();
    await ops(bridgePost(snapshot(), { secret: 'wrong-bridge-secret-32chars!!' }), wrong);
    const after = mockRes();
    await ops(founderReq({
      url: '/ops/api/ceo-bridge/routine-health',
      query: { area: 'api/ceo-bridge/routine-health' },
    }), after);
    const hidden = JSON.stringify(bearerRead.body || {}) + JSON.stringify(stranger.body || {}) + JSON.stringify(anon.body || {});
    check('bridge bearer can push and cannot read the founder view',
      posted.statusCode === 200
      && bearerRead.statusCode === 403
      && bearerRead.body
      && bearerRead.body.error === 'agent_denied'
      && bearerAndCookie.statusCode === 403
      && !hidden.includes('cause unknown')
      && !hidden.includes('eod-jev-review'));
    check('non-founder and anonymous cannot read',
      stranger.statusCode === 403
      && stranger.body
      && stranger.body.error === 'forbidden'
      && anon.statusCode === 403
      && anon.body
      && !anon.body.routines);
    check('founder session can read and cannot push',
      founder.statusCode === 200
      && founder.body
      && founder.body.empty === false
      && founder.body.routines.some((item) => item.slug === 'overnight-morning-brief' && item.status === 'FAILED')
      && founderPost.statusCode === 401
      && after.body
      && !after.body.routines.some((item) => item.reason === 'should-not-store'));
    check('wrong bearer cannot push',
      wrong.statusCode === 401 && wrong.body && wrong.body.error === 'unauthorized');
  }

  {
    health.resetRoutineHealth();
    const old = snapshot({
      generatedAt: new Date(Date.now() - health.STALE_MS - 60 * 1000).toISOString(),
    });
    const posted = mockRes();
    await ops(bridgePost(old), posted);
    const read = mockRes();
    await ops(founderReq({
      url: '/ops/api/ceo-bridge/routine-health',
      query: { area: 'api/ceo-bridge/routine-health' },
    }), read);
    const home = mockRes();
    await ops(founderReq({ html: true, url: '/ops', query: { area: 'dashboard' } }), home);
    const html = String(home.raw || '');
    check('snapshot older than 26 hours is marked stale',
      posted.statusCode === 200
      && read.body
      && read.body.stale === true
      && html.includes('data-role="stale"')
      && !html.includes('data-role="stale" hidden')
      && html.includes('>stale</p>'));
  }

  {
    health.resetRoutineHealth();
    const fresh = mockRes();
    await ops(bridgePost(snapshot()), fresh);
    const home = mockRes();
    await ops(founderReq({ html: true, url: '/ops', query: { area: 'dashboard' } }), home);
    const html = String(home.raw || '');
    check('fresh snapshot shows status dots and hides stale',
      html.includes('data-role="stale" hidden')
      && html.includes('rh-dot rh-ok')
      && html.includes('rh-dot rh-warn')
      && html.includes('rh-dot rh-bad')
      && html.includes('rh-dot rh-run')
      && html.includes('>OK<')
      && html.includes('>RUNNING<')
      && html.includes('>MISSING<'));
  }

  {
    const prior = process.env.VERCEL_ENV;
    function restoreEnv() {
      if (prior == null) delete process.env.VERCEL_ENV;
      else process.env.VERCEL_ENV = prior;
    }
    delete process.env.VERCEL_ENV;
    const unsetKey = health.routineHealthKey();
    process.env.VERCEL_ENV = 'production';
    const prodKey = health.routineHealthKey();
    process.env.VERCEL_ENV = 'preview';
    const previewKey = health.routineHealthKey();
    check('preview KV key uses the preview: prefix and production does not',
      unsetKey === health.SNAPSHOT_KEY
      && prodKey === health.SNAPSHOT_KEY
      && previewKey === `preview:${health.SNAPSHOT_KEY}`);

    const store = new Map();
    const calls = [];
    global.fetch = (url, opts) => {
      const args = JSON.parse(opts.body);
      calls.push(args);
      const cmd = args[0];
      const key = args[1];
      if (cmd === 'SET') {
        store.set(key, args[2]);
        return Promise.resolve({ ok: true, json: async () => ({ result: 'OK' }) });
      }
      if (cmd === 'GET') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ result: store.has(key) ? store.get(key) : null }),
        });
      }
      return Promise.resolve({ ok: false, status: 500, json: async () => ({}) });
    };
    process.env.KV_REST_API_URL = 'https://kv.example.test';
    process.env.KV_REST_API_TOKEN = 'test-token';
    process.env.VERCEL_ENV = 'preview';
    health.resetRoutineHealth();
    const posted = mockRes();
    await ops(bridgePost(snapshot({
      routines: [row('eod-jev-review', 'OK', null, 'preview-only-phrase')],
    })), posted);
    const read = mockRes();
    await ops(founderReq({
      url: '/ops/api/ceo-bridge/routine-health',
      query: { area: 'api/ceo-bridge/routine-health' },
    }), read);
    check('preview post writes only the prefixed KV key',
      posted.statusCode === 200
      && calls.some((cmd) => cmd[0] === 'SET' && cmd[1] === `preview:${health.SNAPSHOT_KEY}`)
      && calls.every((cmd) => cmd[1] === `preview:${health.SNAPSHOT_KEY}`)
      && read.statusCode === 200
      && read.body.routines
      && read.body.routines[0].reason === 'preview-only-phrase');

    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    global.fetch = origFetch;
    restoreEnv();
    health.resetRoutineHealth();
  }

  {
    const client = fs.readFileSync(path.join(__dirname, '../assets/js/ops-routine-health.js'), 'utf8');
    const doc = fs.readFileSync(path.join(__dirname, '../docs/ops/routine-health.md'), 'utf8');
    const env = fs.readFileSync(path.join(__dirname, '../.env.example'), 'utf8');
    check('client renders text with textContent and does not inject HTML',
      client.includes('textContent')
      && client.includes(health.ENDPOINT)
      && !client.includes('innerHTML')
      && !client.includes('insertAdjacentHTML')
      && !client.includes('outerHTML')
      && !client.includes('document.write'));
    const realSlugs = [
      'kit-registry-eod-sync',
      'ceo-talk-bridge-poll',
      'researchy-assign-wake-poll',
      'overnight-ops-fix-morning-brief',
      'jev-eod-decision-review',
      'nightly-decision-flush-to-obsidian',
      'researchy-next-new-thing-daily-channel-check',
      'scout-weekly-minimal-x-scan',
    ];
    check('docs give the box curl without a secret value',
      doc.includes('curl -sS -X POST "$ORIGIN/ops/api/ceo-bridge/routine-health"')
      && doc.includes('Authorization: Bearer $OPS_CEO_BRIDGE_SECRET')
      && realSlugs.every((slug) => doc.includes(`"slug": "${slug}"`))
      && !doc.includes('overnight-morning-brief"')
      && !doc.includes('"slug": "eod-jev-review"')
      && !doc.includes('"slug": "scout-scan"')
      && !doc.includes('"slug": "kit-registry-sync"')
      && doc.includes('"status": "FAILED"')
      && doc.includes('20480')
      && !/Bearer\s+[A-Za-z0-9+/=_-]{16,}/.test(doc.replace(/\$OPS_CEO_BRIDGE_SECRET/g, '')));
    check('.env.example documents the flag as off and adds no secret',
      env.includes('OPS_ROUTINE_HEALTH_ENABLED')
      && env.includes('Default off')
      && !/^OPS_ROUTINE_HEALTH_ENABLED=.+/m.test(env));
  }

  disable();
  health.resetRoutineHealth();
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  global.fetch = origFetch;

  let failed = 0;
  for (const item of results) {
    console.log(`${item.pass ? 'PASS' : 'FAIL'} - ${item.name}`);
    if (!item.pass) failed += 1;
  }
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
