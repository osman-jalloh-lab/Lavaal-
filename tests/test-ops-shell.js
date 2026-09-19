// Tests for ticket 02 /ops shell + dashboard. Mocks req/res so these run in plain node.
const fs = require('fs');
const path = require('path');

const opsDir = path.join(__dirname, '../api/ops');
const lib = require(path.join(opsDir, '_lib.js'));
const store = require(path.join(opsDir, '_store.js'));
const { NAV } = require(path.join(opsDir, '_shell.js'));
const ops = require(path.join(opsDir, 'index.js'));
const auth = require(path.join(opsDir, 'auth.js'));

const SECRET = 'test-ops-auth-secret-32chars!!';
const ALLOWED = 'osmanjalloh104@gmail.com';

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
  const token = lib.createSessionToken(email);
  return `${lib.SESSION_COOKIE}=${encodeURIComponent(token)}`;
}

function authed(extra) {
  return {
    method: extra && extra.method ? extra.method : 'GET',
    headers: {
      cookie: cookieFor(ALLOWED),
      host: 'preview.example.test',
      accept: extra && extra.json ? 'application/json' : 'text/html',
      'content-type': extra && extra.json ? 'application/json' : 'application/x-www-form-urlencoded',
      ...(extra && extra.headers),
    },
    query: extra && extra.query ? extra.query : {},
    url: extra && extra.url ? extra.url : '/ops',
    body: extra && extra.body,
  };
}

async function run() {
  process.env.OPS_AUTH_SECRET = SECRET;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  store.resetStore();

  check('nav lists all eight areas', NAV.length === 8
    && NAV.map((item) => item.id).join(',') === 'dashboard,profile,chat,memory,inbox,calendar,tasks,routines');

  {
    const res = mockRes();
    await ops({ method: 'GET', headers: {}, query: { area: 'chat' }, url: '/ops/chat' }, res);
    check('stub routes require a session', res.statusCode === 401 && String(res.raw).includes('Email me a sign-in link'));
  }

  {
    const res = mockRes();
    await ops(authed({ json: true }), res);
    check('empty dashboard snapshot has no invented records', res.statusCode === 200 && res.body.snapshot.empty === true && res.body.snapshot.unfinished.length === 0 && !res.body.snapshot.goal && !res.body.snapshot.nextAction);
    check('empty dashboard names the demo store when KV is unset', String(res.raw).includes('Demo store') || res.body.snapshot.durable === false);
  }

  {
    const res = mockRes();
    await ops(authed(), res);
    const html = String(res.raw);
    check('logged-in /ops is the dashboard shell', res.statusCode === 200 && html.includes('Dashboard') && html.includes('signed in as') && html.includes(ALLOWED));
    check('dashboard nav links all eight areas', NAV.every((item) => html.includes(`href="${item.href}"`)));
    check('empty state copy is present', html.includes('Nothing saved yet') && html.includes('No current goal saved yet') && html.includes('No unfinished tasks'));
    check('add task and note are reachable from home', html.includes('id="add-task"') && html.includes('id="add-note"') && html.includes('Save task') && html.includes('Save note'));
    check('dashboard does not invent activity metrics', !/productivity|streak|points|12 tasks completed/i.test(html));
    check('Sign out is still on the shell', /Sign out/.test(html));
  }

  {
    const res = mockRes();
    await ops(authed({ json: true, method: 'POST', body: { action: 'add-task', title: 'Confirm preview env', nextAction: 'Paste the fresh Resend key' } }), res);
    check('add-task from home saves an unfinished task', res.statusCode === 200 && res.body.ok === true && res.body.snapshot.unfinished[0].title === 'Confirm preview env');
    check('next action comes from the saved task', res.body.snapshot.nextAction && res.body.snapshot.nextAction.detail === 'Paste the fresh Resend key');
    check('empty state clears after a real save', res.body.snapshot.empty === false);
  }

  {
    const res = mockRes();
    await ops(authed({ json: true, method: 'POST', body: { action: 'add-note', title: 'Supplier fact', body: 'Asked for lead time only.' } }), res);
    check('add-note from home saves a note', res.statusCode === 200 && res.body.ok === true && res.body.snapshot.notes[0].title === 'Supplier fact');
  }

  {
    const res = mockRes();
    await ops(authed({ json: true, method: 'POST', body: { action: 'add-task', title: '' } }), res);
    check('blank task title is rejected', res.statusCode === 400 && res.body.error === 'invalid_task');
  }

  {
    const res = mockRes();
    await ops(authed({ json: true, query: { area: 'inbox' }, url: '/ops/inbox' }), res);
    check('inbox stub is authenticated and names ticket 06', res.statusCode === 200 && res.body.area === 'inbox');
    const html = mockRes();
    await ops(authed({ query: { area: 'inbox' }, url: '/ops/inbox' }), html);
    check('inbox stub page says coming in ticket 06', String(html.raw).includes('coming in ticket 06') && String(html.raw).includes('Inbox'));
  }

  {
    const res = mockRes();
    await ops(authed({ query: { area: 'calendar' }, url: '/ops/calendar' }), res);
    check('calendar stub requires the same session cookie', res.statusCode === 200 && String(res.raw).includes('coming in ticket 07') && String(res.raw).includes('Sign out'));
  }

  {
    store.resetStore();
    const saved = await store.addTask({ title: 'Shared floor task', nextAction: 'Call Osman', createdBy: ALLOWED });
    const again = store.dashboardSnapshot(await store.readStore());
    check('store survives a later read in the same process', saved.ok && again.unfinished[0].title === 'Shared floor task' && again.nextAction.detail === 'Call Osman');
  }

  {
    const kv = { lavaall: null };
    process.env.KV_REST_API_URL = 'https://kv.example.test';
    process.env.KV_REST_API_TOKEN = 'kv-token';
    store.resetStore();
    const origFetch = global.fetch;
    global.fetch = async (url, opts) => {
      if (String(url).includes('/get/')) {
        return { ok: true, json: async () => ({ result: kv.lavaall }) };
      }
      kv.lavaall = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ result: 'OK' }) };
    };
    await store.addNote({ title: 'KV note', body: 'durable', createdBy: ALLOWED });
    const snapshot = store.dashboardSnapshot(await store.readStore());
    check('optional KV REST is used when KV env is present', store.isDurable() === true && snapshot.notes[0].title === 'KV note');
    global.fetch = origFetch;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    store.resetStore();
  }

  {
    const cookie = cookieFor(ALLOWED);
    const out = mockRes();
    await auth({
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json', cookie },
      body: { action: 'logout' },
    }, out);
    const after = mockRes();
    await ops({ method: 'GET', headers: { cookie: `${lib.SESSION_COOKIE}=` }, query: {}, url: '/ops' }, after);
    check('sign out still returns the login page', out.body && out.body.ok === true && after.statusCode === 401 && String(after.raw).includes('Email me a sign-in link'));
  }

  {
    const home = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
    check('public catalog is still ungated', home.includes('Enterprise IT Hardware') && !home.includes('href="/ops"'));
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
