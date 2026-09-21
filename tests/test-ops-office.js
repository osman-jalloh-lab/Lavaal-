// Additive Office — desks, cameras, Researchy crop from side.png, Talk → existing chat.
const fs = require('fs');
const path = require('path');
const { assertPublicLogin } = require('./_public-login');

const opsDir = path.join(__dirname, '../api/ops');
const lib = require(path.join(opsDir, '_lib.js'));
const store = require(path.join(opsDir, '_store.js'));
const office = require(path.join(opsDir, '_office.js'));
const { NAV } = require(path.join(opsDir, '_shell.js'));
const ops = require(path.join(opsDir, 'index.js'));

const SECRET = 'test-ops-auth-secret-32chars!!';
const ALLOWED = 'osmanjalloh104@gmail.com';
const NAMES = [
  'LAVAALL CEO',
  'LAVAALL Sales & Customer Success',
  'LAVAALL Technical & QA',
  'LAVAALL Growth, UGC & Ads',
  'LAVAALL Lifecycle & Klaviyo',
  'Researchy',
];
const CAMERAS = ['Wide', 'Front left', 'Front right', 'Side', 'Lead view'];
const TALK_IDS = ['lavaall-ceo', 'sales', 'technical', 'growth', 'lifecycle', 'researchy'];
const CAMERA_TALK_IDS = ['lavaall-ceo', 'sales', 'technical', 'growth', 'lifecycle'];
const CAMERA_FILES = ['wide.png', 'front-left.png', 'front-right.png', 'side.png', 'lead.png'];
const CAMERA_SOURCES = '04-primary-wide.png,01-front-left.png,02-front-right.png,03-side.png,05-lead-view.png';

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
      cookie: cookieFor(ALLOWED),
      host: 'preview.example.test',
      accept: asJson ? 'application/json' : 'text/html',
      'content-type': asJson ? 'application/json' : 'text/html',
    },
    query: extra && extra.query ? extra.query : {},
    url: extra && extra.url ? extra.url : '/ops/office',
    body: extra && extra.body,
  };
}

async function run() {
  process.env.OPS_AUTH_SECRET = SECRET;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  store.resetStore();

  check('Office sits after Dashboard and before You',
    NAV.map((item) => item.id).join(',').startsWith('dashboard,office,profile')
    && NAV.some((item) => item.id === 'office' && item.href === '/ops/office' && item.label === 'Office'));

  check('exact desk names are the only six seats and all six Talk',
    office.OFFICE_AGENTS.map((agent) => agent.name).join('|') === NAMES.join('|')
    && office.OFFICE_AGENTS.every((agent) => !agent.placeholder && agent.talk)
    && office.OFFICE_AGENTS.filter((agent) => agent.photo).length === 6);

  check('Talk maps to existing per-agent chat routes including Researchy',
    TALK_IDS.every((id) => office.talkHref(id) === `/ops/chat?agent=${id}`)
    && office.talkHref('lavaall-ceo') === '/ops/chat?agent=lavaall-ceo'
    && office.talkHref('researchy') === '/ops/chat?agent=researchy');

  check('camera files map from the approved PNG names',
    office.OFFICE_CAMERAS.map((item) => item.source).join(',') === CAMERA_SOURCES
    && office.OFFICE_CAMERAS.every((item) => item.photo === `/assets/ops/office/cameras/${item.id}.png`));

  check('each camera has its own five-desk hotspot map and never hits Researchy',
    office.OFFICE_CAMERAS.map((item) => item.label).join(',') === CAMERAS.join(',')
    && Object.keys(office.OFFICE_HOTSPOTS).join(',') === office.OFFICE_CAMERAS.map((item) => item.id).join(',')
    && office.OFFICE_CAMERAS.every((camera) => {
      const spots = office.OFFICE_HOTSPOTS[camera.id] || [];
      const ids = spots.map((spot) => spot.id);
      return spots.length === 5
        && ids.slice().sort().join(',') === CAMERA_TALK_IDS.slice().sort().join(',')
        && !ids.includes('researchy');
    })
    && JSON.stringify(office.OFFICE_HOTSPOTS.wide) !== JSON.stringify(office.OFFICE_HOTSPOTS.lead)
    && JSON.stringify(office.OFFICE_HOTSPOTS['front-left']) !== JSON.stringify(office.OFFICE_HOTSPOTS['front-right']));

  {
    const gated = mockRes();
    await ops({ method: 'GET', headers: {}, query: { area: 'office' }, url: '/ops/office' }, gated);
    check('office still requires a session', gated.statusCode === 401 && String(gated.raw).includes('Enter your work email'));
  }

  {
    const page = mockRes();
    await ops(authed({ json: false, url: '/ops/office', query: { area: 'office' } }), page);
    const html = String(page.raw);
    check('office page is cream Option I, not a ticket stub',
      page.statusCode === 200
      && html.includes('<h1>Office</h1>')
      && html.includes('--canvas:#EDE7E0')
      && !html.includes('coming in ticket'));
    check('desktop cameras and LAVAALL-branded roster are present',
      CAMERAS.every((label) => html.includes(`>${label}<`))
      && html.includes('aria-label="Cameras"')
      && html.includes('id="office-roster"')
      && html.includes('src="/images/logo.png"')
      && html.includes('alt="LAVAALL"')
      && !html.includes('>Agents<')
      && !html.includes('>Roster<')
      && !html.includes('AI agents')
      && fs.existsSync(path.join(__dirname, '../images/logo.png'))
      && fs.existsSync(path.join(__dirname, '../images/logo.webp')));
    check('phone/iPad cards crop the same camera photos plus Talk, never text-only',
      html.includes('src="/assets/ops/office/cameras/lead.png"')
      && html.includes('src="/assets/ops/office/cameras/front-left.png"')
      && html.includes('src="/assets/ops/office/cameras/front-right.png"')
      && html.includes('object-position:')
      && TALK_IDS.every((id) => html.includes(`href="/ops/chat?agent=${id}"`))
      && html.includes('grid-template-columns:1fr;')
      && html.includes('min-width:768px')
      && html.includes('orientation:landscape')
      && (html.match(/class="btn"[^>]*>Talk<\/a>/g) || []).length >= 6);
    check('desktop cameras use the approved photo files',
      CAMERA_FILES.every((file) => html.includes(`src="/assets/ops/office/cameras/${file}"`))
      && html.includes('data-camera-photo="wide"'));
    check('Researchy shows a cropped specialist portrait and Talk',
      html.includes('src="/assets/ops/office/cameras/researchy.png"')
      && html.includes('alt="Researchy"')
      && html.includes('>Researchy<')
      && !html.includes('No robot portrait')
      && !html.includes('visual placeholder')
      && html.includes('href="/ops/chat?agent=researchy"'));
    check('office does not invent online dots and Researchy Talk is on',
      !/\bonline\b/i.test(html)
      && !html.includes('is-online')
      && html.includes('data-agent="researchy"')
      && office.OFFICE_AGENTS.length === 6
      && office.talkHref('researchy') === '/ops/chat?agent=researchy');
    {
      const portrait = path.join(__dirname, '../assets/ops/office/cameras/researchy.png');
      const lead = path.join(__dirname, '../assets/ops/office/cameras/lead.png');
      const buf = fs.readFileSync(portrait);
      check('Researchy PNG is a real crop from side.png, not lead.png',
        office.RESEARCHY_PORTRAIT.source === '03-side.png'
        && office.RESEARCHY_PORTRAIT.camera === 'side'
        && office.RESEARCHY_PORTRAIT.photo === '/assets/ops/office/cameras/researchy.png'
        && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
        && buf.length > 50000
        && buf.length !== fs.statSync(lead).size);
    }
    check('Chat tab stays council while Talk uses the existing chat route',
      html.includes('href="/ops/chat"')
      && html.includes('href="/ops/chat?agent=sales"'));
    check('Office CEO Talk still opens the lavaall-ceo chat route',
      html.includes('href="/ops/chat?agent=lavaall-ceo"')
      && html.includes('all six desks, including Researchy'));
    check('desktop Office is full-bleed at laptop width, not a 1100px phone frame',
      html.includes('class="ops-app is-office"')
      && html.includes('id="office-hero"')
      && html.includes('min-width:1200px')
      && html.includes('.ops-app.is-office .ops-wrap{width:100%;max-width:none;margin:0;}')
      && html.includes('.office-hero{display:block;position:relative;width:100%;}')
      && html.includes('.office-stage{width:100%;border:0;border-radius:0;min-height:0;}')
      && !html.includes('grid-template-columns:minmax(0,1fr) 280px')
      && !html.includes('min-width:1024px'));
    check('dashboard content sits below the office scene',
      html.includes('id="office-dash"')
      && html.indexOf('id="office-hero"') < html.indexOf('id="office-dash"')
      && html.includes('<h2>Goal</h2>')
      && html.includes('<h2>Unfinished tasks</h2>')
      && html.includes('id="add-task"')
      && html.includes('id="add-note"')
      && html.includes('name="returnTo" value="/ops/office"')
      && html.includes('.office-dash{display:block;margin-top:8px;}'));
  }

  {
    const src = fs.readFileSync(path.join(__dirname, '../assets/js/ops-office.js'), 'utf8');
    check('camera switch redraws that camera’s hotspot map and keeps selection',
      src.includes('graph.hotspots[cameraId]')
      && src.includes('if (selectedId) setSelected(selectedId)')
      && src.includes("setCamera('lead')")
      && office.DEFAULT_CAMERA_ID === 'lead');
  }

  {
    const home = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
    assertPublicLogin(check, home);
    check('public catalog still has no /ops office link', !home.includes('href="/ops/office"'));
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
