// Founder polish: Helper kill, mic policy, goal seed, inbox/calendar quiet, Office wordmark.
const fs = require('fs');
const path = require('path');
const { assertPublicLogin } = require('./_public-login');

const opsDir = path.join(__dirname, '../api/ops');
const lib = require(path.join(opsDir, '_lib.js'));
const store = require(path.join(opsDir, '_store.js'));
const office = require(path.join(opsDir, '_office.js'));
const calendar = require(path.join(opsDir, '_calendar.js'));
const { NAV } = require(path.join(opsDir, '_shell.js'));
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
      'content-type': asJson ? 'application/json' : 'text/html',
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

  {
    const vercel = fs.readFileSync(path.join(__dirname, '../vercel.json'), 'utf8');
    check('Talk Mic is allowed on /ops: Permissions-Policy uses microphone=(self)',
      vercel.includes('"source": "/ops(.*)"')
      && /"source": "\/ops\(\.\*\)"[\s\S]*microphone=\(self\)/.test(vercel)
      && vercel.includes('microphone=(self)'));
  }

  {
    check('nav has Profile and no Chat/Helper hub',
      NAV.some((item) => item.id === 'profile' && item.label === 'Profile')
      && !NAV.some((item) => item.id === 'chat' || item.label === 'Chat' || item.label === 'You'));
  }

  {
    const res = mockRes();
    await ops(authed({ json: false, url: '/ops/chat', query: { area: 'chat' } }), res);
    check('bare /ops/chat redirects to Office',
      res.statusCode === 302 && res.headers.Location === '/ops/office');
  }

  {
    const dash = mockRes();
    await ops(authed({ json: false, url: '/ops', query: { area: 'dashboard' } }), dash);
    const html = String(dash.raw);
    check('dashboard shows seeded West Africa Apple reseller goal',
      /Close first West Africa Apple reseller quote path \(ASBIS\/MCI\)/.test(html)
      && /open Instagram \+ Facebook business accounts/.test(html)
      && /research only, no posts/.test(html));
    check('nav is Profile not You, and Chat is gone',
      html.includes('>Profile</a>')
      && !html.includes('>You</a>')
      && !html.includes('>Chat</a>'));
  }

  {
    const profile = mockRes();
    await ops(authed({ json: false, url: '/ops/profile', query: { area: 'profile' } }), profile);
    check('Profile page is titled Profile and carries the seeded goal',
      String(profile.raw).includes('<h1>Profile</h1>')
      && String(profile.raw).includes('West Africa Apple reseller')
      && !String(profile.raw).includes('<h1>You</h1>'));
  }

  {
    const routines = mockRes();
    await ops(authed({ json: false, url: '/ops/routines', query: { area: 'routines' } }), routines);
    const html = String(routines.raw);
    check('Routines see the seeded goal and have no Helper copy',
      html.includes('West Africa Apple reseller')
      && !html.includes('<div class="kicker">Helper</div>')
      && !html.includes('Helper connected')
      && !html.includes('Helper not connected')
      && html.includes('>Run</button>')
      && !html.includes('disabled>Run</button>'));
    const pages = fs.readFileSync(path.join(opsDir, '_pages.js'), 'utf8');
    check('Routines disable Run in markup when no goal is saved',
      pages.includes('disabled>Run</button>')
      && pages.includes('Save one on Profile before running'));
  }

  {
    await store.addEvent({
      title: 'QA VoiceCal invite',
      date: '2026-09-22',
      start: '11:00',
      end: '11:30',
      timezone: 'Africa/Freetown',
      notes: 'VoiceCal QA residue',
      createdBy: OSMAN,
    });
    await store.addEvent({
      title: 'Founder sync',
      date: '2026-09-22',
      start: '09:00',
      end: '09:30',
      timezone: 'Africa/Freetown',
      createdBy: OSMAN,
    });
    const cal = mockRes();
    await ops(authed({ json: false, url: '/ops/calendar', query: { area: 'calendar' } }), cal);
    const html = String(cal.raw);
    check('calendar hides QA VoiceCal residue and keeps real events',
      calendar.isCalendarResidue({ title: 'QA VoiceCal invite', notes: 'VoiceCal' }) === true
      && html.includes('Founder sync')
      && !html.includes('QA VoiceCal invite')
      && html.includes('Google Calendar is not connected')
      && !html.includes('Workspace admin may still block'));
  }

  {
    check('Office floor maps all six desks including Researchy',
      office.OFFICE_CAMERAS.every((camera) => {
        const ids = (office.OFFICE_HOTSPOTS[camera.id] || []).map((spot) => spot.id);
        return ids.includes('researchy') && ids.length === 6;
      })
      && office.OFFICE_WORDMARK.lead
      && office.OFFICE_WORDMARK.wide);
    const officePage = mockRes();
    await ops(authed({ json: false, url: '/ops/office', query: { area: 'office' } }), officePage);
    const html = String(officePage.raw);
    check('Office does not paint the frosted LAVAALL wordmark over the aisle',
      !html.includes('id="office-wordmark"')
      && !html.includes('<span class="office-wordmark-name"')
      && !html.includes('>LAVAALL</span>')
      && html.includes('>Lead view<')
      && html.includes('aria-label="Cameras"')
      && html.includes('class="office-roster-logo"')
      && !html.includes('AI AGENTS')
      && !html.includes('AI agents'));
  }

  {
    const bucket = { value: null };
    process.env.KV_REST_API_URL = 'https://kv.example.test';
    process.env.KV_REST_API_TOKEN = 'kv-token';
    store.resetStore();
    const origFetch = global.fetch;
    global.fetch = async (_url, opts) => {
      const cmd = JSON.parse(opts.body);
      if (cmd[0] === 'GET') return { ok: true, json: async () => ({ result: bucket.value }) };
      if (cmd[0] === 'SET') {
        bucket.value = cmd[2];
        return { ok: true, json: async () => ({ result: 'OK' }) };
      }
      return { ok: false, json: async () => ({ error: 'unknown_cmd' }) };
    };
    const first = await store.readStore();
    const landed = typeof bucket.value === 'string' ? JSON.parse(bucket.value) : bucket.value;
    check('empty durable KV is seeded with the reseller goal so Routines can see it',
      first.goal && /West Africa Apple reseller/.test(first.goal.title)
      && landed && landed.goal && landed.goal.title === first.goal.title
      && store.isDurable() === true);
    global.fetch = origFetch;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    store.resetStore();
  }

  {
    const home = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
    assertPublicLogin(check, home);
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
