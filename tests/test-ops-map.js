// Tickets 11 / 11b / 11c — Map graph API, phone-first page, deny + no fake nodes.
// Synthetic fixture data only. No real kit emails.

const fs = require('fs');
const path = require('path');
const { assertPublicLogin } = require('./_public-login');

const opsDir = path.join(__dirname, '../api/ops');
const lib = require(path.join(opsDir, '_lib.js'));
const store = require(path.join(opsDir, '_store.js'));
const map = require(path.join(opsDir, '_map.js'));
const { NAV } = require(path.join(opsDir, '_shell.js'));
const ops = require(path.join(opsDir, 'index.js'));

const SECRET = 'test-ops-auth-secret-32chars!!';
const ALLOWED = 'osmanjalloh104@gmail.com';
const DENIED = 'stranger@example.com';
const REAL_EMAILS = ['osmanjalloh104@gmail.com', 'abdulhbah55@gmail.com'];
const FAKE_KITS = ['KIT00384515', 'KITDEMO', 'demo-kit'];

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
      cookie: extra && extra.cookie ? extra.cookie : cookieFor(ALLOWED),
      host: 'preview.example.test',
      accept: asJson ? 'application/json' : 'text/html',
      'content-type': asJson ? 'application/json' : 'application/x-www-form-urlencoded',
      ...(extra && extra.headers),
    },
    query: extra && extra.query ? extra.query : {},
    url: extra && extra.url ? extra.url : '/ops/map',
    body: extra && extra.body,
  };
}

function apiReq(extra) {
  return authed(Object.assign({
    url: '/ops/api/map',
    query: { area: 'api/map' },
  }, extra));
}

function noFakeAndNoPii(value) {
  const raw = JSON.stringify(value || '').toLowerCase();
  return FAKE_KITS.every((kit) => !raw.includes(kit.toLowerCase()))
    && !raw.includes('ada.example@example.test')
    && !raw.includes('ben.example@example.test')
    && REAL_EMAILS.every((email) => !raw.includes(email));
}

function nodeTypes(graph) {
  return Array.from(new Set((graph.nodes || []).map((node) => node.type))).sort();
}

async function seedTwoKits() {
  store.resetStore();
  await store.applyKitsSync({
    rows: [
      {
        kit_number: 'KIT000TEST01',
        person_name: 'Ada Example',
        email: 'ada.example@example.test',
        status: 'Active',
        date_added: '2026-09-20',
        notes: 'Synthetic fixture',
      },
      {
        kit_number: 'KIT000TEST02',
        person_name: 'Ben Example',
        email: 'ben.example@example.test',
        status: 'Inactive',
        date_added: '2026-09-18',
      },
    ],
    syncedBy: ALLOWED,
    now: Date.now(),
  });
}

async function run() {
  process.env.OPS_AUTH_SECRET = SECRET;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  store.resetStore();

  check('nav includes Map after Kits',
    NAV.some((item) => item.id === 'map' && item.href === '/ops/map' && item.label === 'Map')
    && NAV.map((item) => item.id).indexOf('map') === NAV.map((item) => item.id).indexOf('kits') + 1);

  {
    const graph = map.buildMapGraph(store.emptyStore());
    check('empty store has no nodes or edges', graph.nodes.length === 0 && graph.edges.length === 0 && graph.empty === true);
    check('empty graph still declares four types and excludes mail',
      graph.types.join(',') === 'kit,person,task,decision'
      && !graph.types.includes('mail')
      && !graph.types.includes('inbox'));
    check('empty graph invents no demo kits', noFakeAndNoPii(graph));
  }

  {
    await seedTwoKits();
    await store.addInboxItem({
      from: 'vendor.example@example.test',
      subject: 'Mail should never become a map node',
      body: 'Ignore this thread',
    });
    const graph = map.buildMapGraph(await store.readStore());
    const kits = graph.nodes.filter((node) => node.type === 'kit');
    const people = graph.nodes.filter((node) => node.type === 'person');
    const adaKit = kits.find((node) => node.kit_number === 'KIT000TEST01');
    const benKit = kits.find((node) => node.kit_number === 'KIT000TEST02');
    const degrees = {};
    graph.edges.forEach((edge) => {
      degrees[edge.from] = (degrees[edge.from] || 0) + 1;
      degrees[edge.to] = (degrees[edge.to] || 0) + 1;
    });
    check('unlinked kits still appear as kit nodes', kits.length === 2 && adaKit && benKit);
    check('people come from kit names without inventing extras',
      people.length === 2
      && people.some((node) => node.title === 'Ada Example')
      && people.some((node) => node.title === 'Ben Example'));
    check('no notes means no invented kit edges', graph.edges.length === 0 && graph.sparse === true);
    check('unlinked kits have degree zero', (degrees[adaKit.id] || 0) === 0 && (degrees[benKit.id] || 0) === 0);
    check('mail and inbox never become nodes',
      !graph.nodes.some((node) => node.type === 'mail' || node.type === 'inbox')
      && !graph.nodes.some((node) => /mail should never/i.test(node.title || '')));
    check('canvas payload strips emails and fake kit numbers',
      noFakeAndNoPii(graph.nodes)
      && graph.nodes.every((node) => !/@/.test(JSON.stringify(node.label) + JSON.stringify(node.title) + JSON.stringify(node.working))));
    check('kit open links point at Kits, not a fake record',
      adaKit.href === '/ops/kits?kit=KIT000TEST01' && adaKit.linkLabel === 'Open in Kits');
  }

  {
    await seedTwoKits();
    await store.addNote({
      title: 'Ada Example',
      body: 'Working on KIT000TEST01 quote pack.',
      createdBy: ALLOWED,
    });
    await store.addTask({
      title: 'Ping Ada Example',
      nextAction: 'Ask Ada Example for the missing serial.',
      createdBy: ALLOWED,
    });
    await store.saveGoal({
      title: 'Ship Map tab',
      nextStep: 'Founder phone smoke on Preview.',
    });
    await store.addTask({
      title: 'Finish Ship Map tab copy',
      nextAction: 'Keep the Map empty copy honest.',
      createdBy: ALLOWED,
    });
    const graph = map.buildMapGraph(await store.readStore());
    const kitAda = graph.nodes.find((node) => node.kit_number === 'KIT000TEST01');
    const kitBen = graph.nodes.find((node) => node.kit_number === 'KIT000TEST02');
    const personAda = graph.nodes.find((node) => node.type === 'person' && node.title === 'Ada Example');
    const linked = graph.edges.some((edge) => (
      (edge.from === kitAda.id && edge.to === personAda.id) || (edge.from === personAda.id && edge.to === kitAda.id)
    ));
    const benLinked = graph.edges.some((edge) => edge.from === kitBen.id || edge.to === kitBen.id);
    const taskPerson = graph.edges.some((edge) => edge.kind === 'task-person');
    const taskDecision = graph.edges.some((edge) => edge.kind === 'task-decision');
    check('kit name match on a note creates a real kit-person edge', linked === true);
    check('unmatched kit stays unlinked', benLinked === false);
    check('task mentioning a person creates a task-person edge', taskPerson === true);
    check('task mentioning the goal creates a task-decision edge', taskDecision === true);
    check('linked graph still has only four node types', nodeTypes(graph).every((type) => map.MAP_NODE_TYPES.includes(type)));
    check('decision node opens You, person opens Memory',
      graph.nodes.some((node) => node.type === 'decision' && node.linkLabel === 'Open in You' && node.href === '/ops/profile')
      && personAda.linkLabel === 'Open in Memory');
  }

  {
    const res = mockRes();
    await ops({ method: 'GET', headers: { accept: 'application/json' }, query: { area: 'api/map' }, url: '/ops/api/map' }, res);
    check('unauthenticated GET /ops/api/map is 401', res.statusCode === 401 && res.body && res.body.error === 'sign_in_required');
    check('unauthenticated map API does not return nodes', !res.body.nodes);
  }

  {
    const res = mockRes();
    await ops(authed({
      json: true,
      cookie: cookieFor(DENIED),
      url: '/ops/api/map',
      query: { area: 'api/map' },
    }), res);
    check('non-allowlist session cannot GET map', res.statusCode === 403 && res.body.error === 'forbidden' && !res.body.nodes);
  }

  {
    const res = mockRes();
    await ops({
      method: 'GET',
      headers: { accept: 'application/json', 'x-ops-email': DENIED },
      query: { area: 'api/map' },
      url: '/ops/api/map',
    }, res);
    check('non-allowlist claimed email cannot GET map', res.statusCode === 403 && res.body.error === 'forbidden');
  }

  {
    const res = mockRes();
    await ops({
      method: 'GET',
      headers: { accept: 'application/json', authorization: 'Bearer simulated-agent-token' },
      query: { area: 'api/map' },
      url: '/ops/api/map',
    }, res);
    check('simulated agent bearer cannot GET map', res.statusCode === 403 && res.body.error === 'agent_denied' && !res.body.nodes);
  }

  {
    const res = mockRes();
    await ops(authed({
      json: true,
      headers: { 'x-lavaall-agent': 'lavaall-ceo', authorization: 'Bearer simulated-agent-token' },
      url: '/ops/api/map',
      query: { area: 'api/map' },
    }), res);
    check('simulated agent cannot GET map even with a founder cookie',
      res.statusCode === 403 && res.body.error === 'agent_denied');
  }

  {
    const page = mockRes();
    await ops({ method: 'GET', headers: {}, query: { area: 'map' }, url: '/ops/map' }, page);
    check('logged-out /ops/map is the login page', page.statusCode === 401 && String(page.raw).includes('Email me a sign-in link'));
    check('logged-out Map HTML has no kit rows',
      !String(page.raw).includes('KIT000TEST01')
      && !String(page.raw).includes('Ada Example')
      && noFakeAndNoPii(page.raw));
  }

  {
    const page = mockRes();
    await ops({
      method: 'GET',
      headers: { 'x-lavaall-agent': 'sales-bot' },
      query: { area: 'map' },
      url: '/ops/map',
    }, page);
    check('agent hitting /ops/map gets a hard deny page',
      page.statusCode === 403
      && String(page.raw).includes('Access denied')
      && String(page.raw).includes('founder-only')
      && !String(page.raw).includes('KIT000TEST')
      && !String(page.raw).includes('id="map-svg"'));
  }

  {
    store.resetStore();
    const page = mockRes();
    await ops(authed({ json: false, url: '/ops/map', query: { area: 'map' } }), page);
    const html = String(page.raw);
    check('Map page is real, not a ticket stub',
      page.statusCode === 200
      && html.includes('<h1>Map</h1>')
      && html.includes('href="/ops/map"')
      && html.includes('aria-current="page"')
      && !html.includes('coming in ticket'));
    check('Map copy and legend match DESIGN-PASS D3',
      html.includes('kits, people, tasks, and decisions')
      && html.includes('Only a few links so far')
      && html.includes('invent fake nodes')
      && html.includes('>Kit<')
      && html.includes('>Person<')
      && html.includes('>Task<')
      && html.includes('>Decision<'));
    check('Map card placeholder and Open pattern are present',
      html.includes('Tap a bubble')
      && html.includes('Open in Kits') === false
      && html.includes('link to the real Kits, Memory, or Tasks record'));
    check('Map filters, search, and optional polish exist off by default',
      html.includes('id="map-search"')
      && html.includes('data-type="kit"')
      && html.includes('id="map-opt-cream"')
      && html.includes('id="map-opt-sound"')
      && !html.includes('id="map-opt-sound" checked')
      && !html.includes('id="map-opt-cream" checked')
      && !/autoplay/i.test(html));
    check('Map uses Option I cream and reduced-motion drift',
      html.includes('--canvas:#EDE7E0')
      && html.includes('--surface:#F3EEE7')
      && html.includes('prefers-reduced-motion:reduce')
      && html.includes('ops-map.js')
      && !html.includes('#0B1424'));
    check('empty Map invents no demo bubbles',
      !html.includes('KIT00384515')
      && !/19 kits/.test(html)
      && html.includes('id="map-svg"')
      && html.includes('id="map-data"'));
  }

  {
    await seedTwoKits();
    const list = mockRes();
    await ops(apiReq({ json: true }), list);
    check('founder GET /ops/api/map returns every mirrored kit',
      list.statusCode === 200
      && Array.isArray(list.body.nodes)
      && list.body.nodes.filter((node) => node.type === 'kit').length === 2
      && list.body.nodes.some((node) => node.kit_number === 'KIT000TEST01')
      && list.body.nodes.some((node) => node.kit_number === 'KIT000TEST02')
      && list.body.edges.length === 0);
    check('map API never returns mail nodes or fake kits',
      list.body.types.join(',') === 'kit,person,task,decision'
      && noFakeAndNoPii(list.body));
    const posted = mockRes();
    await ops(apiReq({ json: true, method: 'POST', body: {} }), posted);
    check('POST /ops/api/map is 405', posted.statusCode === 405 && posted.body.error === 'method_not_allowed');
    const html = mockRes();
    await ops(authed({ json: false, url: '/ops/map', query: { area: 'map' } }), html);
    check('Map page embeds real kit numbers without emails',
      String(html.raw).includes('KIT000TEST01')
      && String(html.raw).includes('KIT000TEST02')
      && !String(html.raw).includes('ada.example@example.test'));
  }

  {
    const home = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
    const catalog = fs.readFileSync(path.join(__dirname, '../assets/js/catalog-data.js'), 'utf8');
    const client = fs.readFileSync(path.join(__dirname, '../assets/js/ops-map.js'), 'utf8');
    assertPublicLogin(check, home);
    check('public catalog HTML has no map API',
      !home.includes('/ops/api/map')
      && !home.includes('KIT000TEST')
      && home.includes('Enterprise IT Hardware'));
    check('public catalog data is unchanged by map',
      !catalog.includes('/ops/api/map') && !catalog.includes('KIT000TEST01'));
    check('map client never autoplays sound',
      !/autoplay/i.test(client)
      && client.includes('sound.checked = false')
      && client.includes("fetch('/ops/api/map'"));
  }

  store.resetStore();

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
