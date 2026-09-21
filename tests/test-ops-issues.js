// Founder issue log — count/recurrence, Technical stub at ≥2, not dumped into CEO Talk.
const path = require('path');

const opsDir = path.join(__dirname, '../api/ops');
const lib = require(path.join(opsDir, '_lib.js'));
const store = require(path.join(opsDir, '_store.js'));
const ops = require(path.join(opsDir, 'index.js'));

const SECRET = 'test-ops-auth-secret-32chars!!';
const OSMAN = 'osmanjalloh104@gmail.com';

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
  return {
    method: extra && extra.method ? extra.method : 'GET',
    headers: {
      cookie: cookieFor(OSMAN),
      host: 'preview.example.test',
      accept: asJson ? 'application/json' : 'text/html',
      'content-type': asJson ? 'application/json' : 'application/x-www-form-urlencoded',
    },
    query: extra && extra.query ? extra.query : {},
    url: extra && extra.url ? extra.url : '/ops/issues',
    body: extra && extra.body,
  };
}

async function run() {
  process.env.OPS_AUTH_SECRET = SECRET;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  store.resetStore();

  {
    const first = await store.addIssue({ title: 'Inbox list empty', body: 'Opened /ops/inbox, saw connect state.', createdBy: OSMAN });
    check('first file creates count 1 and no Technical stub yet',
      first.ok && first.created === true && first.issue.count === 1 && !first.issue.planStub);
    const second = await store.addIssue({ title: 'inbox list empty', body: 'Same title, second time.', createdBy: OSMAN });
    check('filing the same title twice increments count',
      second.ok && second.created === false && second.issue.count === 2 && second.issue.id === first.issue.id);
    check('count ≥ 2 suggests a Technical plan stub',
      /Technical plan stub/i.test(second.issue.planStub) && second.issue.planStub.includes('Inbox list empty'));
  }

  {
    const page = mockRes();
    await ops(authed({ json: false, url: '/ops/issues', query: { area: 'issues' } }), page);
    const html = String(page.raw);
    check('issues page lists the filed title and count',
      html.includes('Inbox list empty') && html.includes('2×') && html.includes('Technical stub'));
    check('issues page does not dump stack traces',
      !html.includes('at Object.') && !html.includes('TypeError'));
  }

  {
    const again = mockRes();
    await ops(authed({
      json: true,
      method: 'POST',
      url: '/ops/issues',
      query: { area: 'issues' },
      body: { action: 'file-issue', title: 'Inbox list empty', body: 'Third report' },
    }), again);
    check('POST file-issue increments the same row',
      again.statusCode === 200 && again.body.ok === true && again.body.issue.count === 3);
  }

  {
    const blank = await store.addIssue({ title: '   ', createdBy: OSMAN });
    check('blank issue title is rejected', blank.error === 'invalid_issue');
  }

  {
    const memory = mockRes();
    await ops(authed({ json: false, url: '/ops/memory', query: { area: 'memory' } }), memory);
    check('Memory subsection links to the issue log',
      String(memory.raw).includes('/ops/issues') && String(memory.raw).includes('Issue log'));
  }

  {
    const chat = mockRes();
    await ops(authed({ json: false, url: '/ops/chat', query: { area: 'chat', agent: 'lavaall-ceo' } }), chat);
    const html = String(chat.raw);
    check('CEO Talk does not dump issue titles or raw logs',
      !html.includes('Inbox list empty') && !html.includes('Technical plan stub') && !html.includes('Opened /ops/inbox'));
  }

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
