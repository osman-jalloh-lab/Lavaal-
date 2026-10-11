// Ranked support@ feed (option B): flag, bearer, strict shape, KV key, ranking, escaping, fallback.
const fs = require('fs');
const path = require('path');

const opsDir = path.join(__dirname, '../api/ops');
const lib = require(path.join(opsDir, '_lib.js'));
const tri = require(path.join(opsDir, '_inbox_triage.js'));
const ops = require(path.join(opsDir, 'index.js'));

const SECRET = 'test-ops-auth-secret-32chars!!';
const FEED_SECRET = 'test-inbox-feed-secret-32chars!!';
const ALLOWED = 'osmanjalloh104@gmail.com';
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
  const html = extra && extra.html;
  const headers = {
    host: 'preview.example.test',
    accept: html ? 'text/html' : 'application/json',
  };
  if (!(extra && extra.anon)) headers.cookie = cookieFor((extra && extra.email) || ALLOWED);
  return {
    method: (extra && extra.method) || 'GET',
    headers,
    query: (extra && extra.query) || { area: 'api/inbox-triage' },
    url: (extra && extra.url) || '/ops/api/inbox-triage',
  };
}

function inboxPageReq() {
  return founderReq({ html: true, url: '/ops/inbox', query: { area: 'inbox' } });
}

function feedPost(body, extra) {
  const secret = extra && extra.secret !== undefined ? extra.secret : FEED_SECRET;
  const headers = Object.assign({
    host: 'preview.example.test',
    accept: 'application/json',
    'content-type': 'application/json',
  }, extra && extra.headers ? extra.headers : {});
  if (secret) headers.authorization = `Bearer ${secret}`;
  return {
    method: (extra && extra.method) || 'POST',
    headers,
    query: { area: 'api/inbox-triage' },
    url: '/ops/api/inbox-triage',
    body,
  };
}

function item(overrides) {
  return Object.assign({
    id: '1a0e728d16db5c7f',
    threadId: '1a0e728d16db5c7f',
    receivedAt: '2026-09-28T08:36:41Z',
    from: 'Austin Foster <austin@nexusnode.co.uk>',
    subject: 'RFQ – NETGEAR APS1000W-100NES | Qty 10',
    unread: true,
    flag: 'Real',
    urgency: 'Urgent',
    category: 'customer',
    reason: 'Customer quote request (revenue).',
    notes: ['sent Bcc to many vendors'],
    checks: 'SPF pass / DKIM pass / DMARC pass · no warning signs',
    via: 'sales@lavaall.com',
    jev: { status: 'RUN', legit: 0.57, urgency: 0.69 },
  }, overrides || {});
}

function feed(overrides) {
  return Object.assign({
    generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    mailbox: 'support@lavaall.com',
    items: [
      item({ id: 'aaaa0000000000a1', threadId: 'aaaa0000000000a1', urgency: 'Low', category: 'promo', subject: 'Workspace tips', from: 'Google <workspace-noreply@google.com>', notes: [], via: '', reason: 'Newsletter.', jev: { status: 'RUN', legit: 0.25, urgency: 0.09 } }),
      item({ id: 'aaaa0000000000a2', threadId: 'aaaa0000000000a2', urgency: 'Soon', category: 'security', subject: 'Security alert', notes: [], via: '', jev: { status: 'NOT_RUN', legit: null, urgency: null } }),
      item(),
    ],
  }, overrides || {});
}

function enable() { process.env.OPS_INBOX_TRIAGE_ENABLED = '1'; }
function disable() { delete process.env.OPS_INBOX_TRIAGE_ENABLED; }

async function run() {
  const origFetch = global.fetch;
  process.env.OPS_AUTH_SECRET = SECRET;
  process.env.OPS_INBOX_FEED_SECRET = FEED_SECRET;
  for (const k of ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'VERCEL', 'VERCEL_ENV', 'OPS_STORE_FILE', 'OPS_GMAIL_FROM']) delete process.env[k];
  disable();
  tri.resetInboxTriage();

  check('flag defaults off', tri.inboxTriageEnabled() === false);
  process.env.OPS_INBOX_TRIAGE_ENABLED = 'true';
  check('true enables the flag', tri.inboxTriageEnabled() === true);
  process.env.OPS_INBOX_TRIAGE_ENABLED = 'on';
  check('on enables the flag', tri.inboxTriageEnabled() === true);
  process.env.OPS_INBOX_TRIAGE_ENABLED = 'yes';
  check('yes does not enable the flag', tri.inboxTriageEnabled() === false);
  disable();

  check('kind matches area and path',
    tri.inboxTriageKind({ url: '/ops/api/inbox-triage', query: { area: 'api/inbox-triage' } }) === 'feed'
    && tri.inboxTriageKind({ url: '/ops/api/inbox-triage/', query: {} }) === 'feed'
    && tri.inboxTriageKind({ url: '/ops/inbox', query: { area: 'inbox' } }) === ''
    && tri.inboxTriageKind({ url: '/ops/api/ceo-bridge/routine-health', query: { area: 'api/ceo-bridge/routine-health' } }) === '');
  check('KV key is lavaall-ops-inbox-triage-v1 on production, prefixed on preview',
    tri.inboxTriageKey() === 'lavaall-ops-inbox-triage-v1'
    && (() => { process.env.VERCEL_ENV = 'preview'; const k = tri.inboxTriageKey(); delete process.env.VERCEL_ENV; return k === 'preview:lavaall-ops-inbox-triage-v1'; })());
  check('gmail link only for hex thread ids',
    tri.gmailThreadUrl('1a0e728d16db5c7f') === 'https://mail.google.com/mail/?authuser=support%40lavaall.com#all/1a0e728d16db5c7f'
    && tri.gmailThreadUrl('javascript:alert(1)') === '');

  {
    const post = mockRes();
    await ops(feedPost(feed()), post);
    const read = mockRes();
    await ops(founderReq(), read);
    const page = mockRes();
    await ops(inboxPageReq(), page);
    check('flag off: post 404, read 404, Inbox page unchanged',
      post.statusCode === 404 && post.body.error === 'not_found'
      && read.statusCode === 404
      && page.statusCode === 200
      && page.raw.includes('What came in')
      && !page.raw.includes('id="inbox-triage"'));
  }

  enable();
  tri.resetInboxTriage();

  {
    const page = mockRes();
    await ops(inboxPageReq(), page);
    check('flag on, no feed yet: falls back to the current Inbox',
      page.statusCode === 200 && page.raw.includes('What came in') && !page.raw.includes('id="inbox-triage"'));
  }

  {
    const none = mockRes();
    await ops(feedPost(feed(), { secret: '' }), none);
    const wrong = mockRes();
    await ops(feedPost(feed(), { secret: 'wrong-secret-but-long-enough-000' }), wrong);
    const fromCookie = mockRes();
    const req = feedPost(feed(), { secret: '' });
    req.headers.cookie = cookieFor(ALLOWED);
    await ops(req, fromCookie);
    process.env.OPS_INBOX_FEED_SECRET = 'short-secret';
    const short = mockRes();
    await ops(feedPost(feed(), { secret: 'short-secret' }), short);
    process.env.OPS_INBOX_FEED_SECRET = FEED_SECRET;
    delete process.env.OPS_INBOX_FEED_SECRET;
    const unset = mockRes();
    await ops(feedPost(feed()), unset);
    process.env.OPS_INBOX_FEED_SECRET = FEED_SECRET;
    check('post needs the exact OPS_INBOX_FEED_SECRET bearer (none, wrong, founder cookie, short, unset all 401)',
      [none, wrong, fromCookie, short, unset].every((r) => r.statusCode === 401 && r.body.error === 'unauthorized'));
  }

  {
    const put = mockRes();
    await ops(feedPost(feed(), { method: 'PUT' }), put);
    check('PUT is 405', put.statusCode === 405);
  }

  const bad = [
    ['extra top-level field', Object.assign(feed(), { note: 'x' })],
    ['wrong mailbox', feed({ mailbox: 'sales@lavaall.com' })],
    ['future generatedAt', feed({ generatedAt: '2099-01-01T00:00:00Z' })],
    ['non-UTC generatedAt', feed({ generatedAt: '2026-10-11T04:30:00-05:00' })],
    ['unknown flag', feed({ items: [item({ flag: 'Safe' })] })],
    ['unknown urgency', feed({ items: [item({ urgency: 'High' })] })],
    ['unknown category', feed({ items: [item({ category: 'sales' })] })],
    ['html in id', feed({ items: [item({ id: '<b>x</b>' })] })],
    ['missing item key', feed({ items: [(() => { const x = item(); delete x.via; return x; })()] })],
    ['extra item key', feed({ items: [Object.assign(item(), { body: 'full text' })] })],
    ['four notes', feed({ items: [item({ notes: ['a', 'b', 'c', 'd'] })] })],
    ['control char in subject', feed({ items: [item({ subject: 'a\u0007b' })] })],
    ['subject too long', feed({ items: [item({ subject: 'x'.repeat(241) })] })],
    ['legit above 1', feed({ items: [item({ jev: { status: 'RUN', legit: 1.2, urgency: 0.5 } })] })],
    ['NOT_RUN with numbers', feed({ items: [item({ jev: { status: 'NOT_RUN', legit: 0.4, urgency: null } })] })],
    ['duplicate id', feed({ items: [item(), item()] })],
    ['51 items', feed({ items: Array.from({ length: 51 }, (_, i) => item({ id: `bbbb${String(i).padStart(12, '0')}`, threadId: `bbbb${String(i).padStart(12, '0')}` })) })],
    ['string unread', feed({ items: [item({ unread: 'yes' })] })],
  ];
  for (const [name, body] of bad) {
    const res = mockRes();
    await ops(feedPost(body), res);
    check(`rejects ${name} (400 invalid_shape)`, res.statusCode === 400 && res.body.error === 'invalid_shape');
  }

  {
    const big = mockRes();
    await ops(feedPost(JSON.stringify(feed()) + ' '.repeat(tri.MAX_FEED_BYTES)), big);
    const declared = mockRes();
    await ops(feedPost(feed(), { headers: { 'content-length': String(tri.MAX_FEED_BYTES + 1) } }), declared);
    const text = mockRes();
    await ops(feedPost('hello', { headers: { 'content-type': 'text/plain' } }), text);
    const broken = mockRes();
    await ops(feedPost('{not json'), broken);
    check('over 64 KB is 413 (body or declared length)', big.statusCode === 413 && declared.statusCode === 413);
    check('non-JSON content type and broken JSON are 400', text.statusCode === 400 && broken.statusCode === 400 && broken.body.error === 'invalid_json');
  }

  {
    const empty = mockRes();
    await ops(feedPost(feed({ items: [] })), empty);
    check('empty item list is accepted', empty.statusCode === 200 && empty.body.count === 0);
  }

  {
    const post = mockRes();
    await ops(feedPost(JSON.stringify(feed())), post);
    check('valid feed (string body) stores 3 items', post.statusCode === 200 && post.body.ok === true && post.body.count === 3);
    const read = mockRes();
    await ops(founderReq(), read);
    const ids = read.body && read.body.items ? read.body.items.map((x) => x.id) : [];
    check('founder GET returns the feed ranked Urgent, Soon, Low',
      read.statusCode === 200 && ids.join(',') === '1a0e728d16db5c7f,aaaa0000000000a2,aaaa0000000000a1'
      && read.body.counts.Urgent === 1 && read.body.counts.Soon === 1 && read.body.counts.Low === 1 && read.body.counts.flagged === 0);
    const stranger = mockRes();
    await ops(founderReq({ email: STRANGER }), stranger);
    const anon = mockRes();
    await ops(founderReq({ anon: true }), anon);
    check('stranger and signed-out GET are 403', stranger.statusCode === 403 && anon.statusCode === 403);
    const bearerRead = mockRes();
    const bearerReq = founderReq({ anon: true });
    bearerReq.headers.authorization = `Bearer ${FEED_SECRET}`;
    await ops(bearerReq, bearerRead);
    check('the feed bearer cannot read the feed back', bearerRead.statusCode === 403);
  }

  {
    const page = mockRes();
    await ops(inboxPageReq(), page);
    const html = page.raw || '';
    const urgentAt = html.indexOf('RFQ – NETGEAR');
    const soonAt = html.indexOf('Security alert');
    const lowAt = html.indexOf('Workspace tips');
    check('Inbox page shows the ranked feed, Urgent before Soon before Low',
      page.statusCode === 200 && html.includes('id="inbox-triage"') && html.includes('Most important first')
      && urgentAt > 0 && soonAt > urgentAt && lowAt > soonAt);
    check('low items sit in a collapsed group; old list moves under a details',
      /<details class="tri-low"><summary>1 low-priority/.test(html) && html.includes('Snapshots and live threads') && !html.includes('<h2>What came in</h2>'));
    check('Jev shown as legit/urgency, NOT_RUN shown as not run',
      html.includes('Jev: legit 0.57 · urgency 0.69') && html.includes('Jev: not run'));
    check('Open in Gmail link targets the support@ thread',
      html.includes('href="https://mail.google.com/mail/?authuser=support%40lavaall.com#all/1a0e728d16db5c7f"')
      && html.includes('rel="noopener noreferrer"'));
    check('came-in-via and warning note render', html.includes('came in via sales@lavaall.com') && html.includes('sent Bcc to many vendors'));
    check('setup card explains the desk feed instead of "not connected"', html.includes('CEO desk feed') && !html.includes('Live support@ not connected.'));
  }

  {
    const post = mockRes();
    await ops(feedPost(feed({ items: [item({ subject: ATTACK, from: `${ATTACK} <evil@example.com>`, reason: ATTACK, checks: ATTACK, notes: [ATTACK], flag: 'Phishing', urgency: 'Soon', category: 'phishing' })] })), post);
    const page = mockRes();
    await ops(inboxPageReq(), page);
    const html = page.raw || '';
    check('mail text is escaped (no raw script tag), phishing pill shows',
      post.statusCode === 200 && !html.includes('<script>alert(1)</script>') && html.includes('&lt;script&gt;alert(1)&lt;/script&gt;')
      && html.includes('Phishing — don’t click'));
  }

  {
    const old = feed({ generatedAt: '2026-10-01T00:00:00Z' });
    const v = tri.validateFeed(old);
    check('stale after 6 hours, not before',
      v.ok && tri.feedIsStale('2026-10-01T00:00:00Z', Date.parse('2026-10-01T00:00:00Z') + tri.STALE_MS) === false
      && tri.feedIsStale('2026-10-01T00:00:00Z', Date.parse('2026-10-01T00:00:00Z') + tri.STALE_MS + 1) === true);
    const post = mockRes();
    await ops(feedPost(old), post);
    const page = mockRes();
    await ops(inboxPageReq(), page);
    check('stale feed is labelled stale on the page', post.statusCode === 200 && page.raw.includes('class="tri-stale">stale'));
  }

  {
    const calls = [];
    process.env.KV_REST_API_URL = 'https://kv.example.test';
    process.env.KV_REST_API_TOKEN = 'kv-token';
    process.env.VERCEL_ENV = 'production';
    let stored = null;
    global.fetch = async (url, init) => {
      const args = JSON.parse(init.body);
      calls.push(args);
      if (args[0] === 'SET') { stored = args[2]; return { ok: true, json: async () => ({ result: 'OK' }) }; }
      if (args[0] === 'GET') return { ok: true, json: async () => ({ result: stored }) };
      return { ok: true, json: async () => ({ result: null }) };
    };
    const post = mockRes();
    await ops(feedPost(feed()), post);
    const feedCalls = calls.filter((c) => c[1] === 'lavaall-ops-inbox-triage-v1');
    const read = mockRes();
    await ops(founderReq(), read);
    check('KV write and read use key lavaall-ops-inbox-triage-v1',
      post.statusCode === 200 && feedCalls.some((c) => c[0] === 'SET') && read.statusCode === 200 && read.body.items.length === 3);
    check('stored record holds no raw body field', typeof stored === 'string' && !/"body"/.test(stored) && /"receivedAt":\d+/.test(stored));
    global.fetch = async () => ({ ok: false, json: async () => ({}) });
    const down = mockRes();
    await ops(feedPost(feed()), down);
    const downRead = mockRes();
    await ops(founderReq(), downRead);
    const downPage = mockRes();
    await ops(inboxPageReq(), downPage);
    check('KV outage: post 503, read 503, Inbox page still renders without the feed',
      down.statusCode === 503 && downRead.statusCode === 503 && downPage.statusCode === 200 && !downPage.raw.includes('id="inbox-triage"'));
    global.fetch = origFetch;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    delete process.env.VERCEL_ENV;
  }

  {
    const doc = fs.readFileSync(path.join(__dirname, '../docs/ops/inbox-triage.md'), 'utf8');
    const env = fs.readFileSync(path.join(__dirname, '../.env.example'), 'utf8');
    check('doc names the endpoint, flag, secret and KV key',
      doc.includes('/ops/api/inbox-triage') && doc.includes('OPS_INBOX_TRIAGE_ENABLED')
      && doc.includes('OPS_INBOX_FEED_SECRET') && doc.includes('lavaall-ops-inbox-triage-v1')
      && !/Bearer\s+[A-Za-z0-9+/=_-]{16,}/.test(doc.replace(/\$OPS_INBOX_FEED_SECRET/g, '')));
    check('.env.example lists names only, flag off',
      env.includes('OPS_INBOX_TRIAGE_ENABLED') && env.includes('OPS_INBOX_FEED_SECRET')
      && !/^OPS_INBOX_TRIAGE_ENABLED=.+/m.test(env) && !/^#?\s*OPS_INBOX_FEED_SECRET=.+/m.test(env));
  }

  disable();
  tri.resetInboxTriage();
  global.fetch = origFetch;

  let failed = 0;
  for (const r of results) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'} - ${r.name}`);
    if (!r.pass) failed += 1;
  }
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
