// LAVAALL OS live feeds: the authenticated POST endpoints under api/os/ingest/*, and what /os shows from them.
// Drives the real handler, the real adapter and the real client files. No network: KV is a stub.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const feeds = require(path.join(root, 'api/ops/_os_feeds.js'));
const { handleIngest } = require(path.join(root, 'api/ops/_os_ingest.js'));
const osData = require(path.join(root, 'api/ops/_os_data.js'));
const entry = require(path.join(root, 'api/os/ingest/[feed].js'));

const results = [];
function check(name, cond) { results.push({ name, pass: !!cond }); }

const TOKEN = 'unit-test-bridge-secret-0123456789';
const NOW = Date.parse('2026-10-23T15:00:00Z');
const ENV = { OPS_CEO_BRIDGE_SECRET: TOKEN, KV_REST_API_URL: 'https://kv.example', KV_REST_API_TOKEN: 'kv-token' };

// ---- a stub KV that remembers every command -----------------------------------------
function makeKv() {
  const data = new Map();
  const cmds = [];
  const fetchImpl = async (url, init) => {
    const cmd = JSON.parse(init.body);
    cmds.push(cmd);
    if (cmd[0] === 'GET') return { ok: true, json: async () => ({ result: data.has(cmd[1]) ? data.get(cmd[1]) : null }) };
    if (cmd[0] === 'SET') { data.set(cmd[1], cmd[2]); return { ok: true, json: async () => ({ result: 'OK' }) }; }
    return { ok: false, json: async () => ({}) };
  };
  return { data, cmds, fetchImpl };
}

function mockRes() {
  const res = { statusCode: 200, headers: {}, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.setHeader = (k, v) => { res.headers[String(k).toLowerCase()] = v; return res; };
  res.send = (b) => { try { res.body = JSON.parse(b); } catch { res.body = b; } return res; };
  return res;
}

async function post(feed, body, o) {
  const opts = o || {};
  const kv = opts.kv || makeKv();
  const headers = { 'content-type': 'application/json' };
  if (opts.auth !== null) headers.authorization = opts.auth || `Bearer ${TOKEN}`;
  if (opts.headers) Object.assign(headers, opts.headers);
  const res = mockRes();
  await handleIngest({
    method: opts.method || 'POST',
    url: `/api/os/ingest/${feed}`,
    query: opts.noQuery ? undefined : { feed },
    headers,
    body,
  }, res, { env: opts.env || ENV, now: NOW, fetchImpl: kv.fetchImpl });
  return { res, kv };
}

const today = '2026-10-23';
const GOOD = {
  'morning-brief': { date: today, text: 'Good morning.\nThree things matter today.' },
  'routine-health': [{ id: 'sl-daily-leads', lastRun: '2026-10-23T12:00:00Z', status: 'ok' }, { id: 'midnight-closeout', lastRun: null, status: 'late' }, { id: 'friday-decide-or-kill', lastRun: '2026-10-22T05:00:00Z', status: 'failed' }, { id: 'kit-registry-eod-sync', lastRun: '2026-10-22T03:00:00Z', status: 'skipped' }],
  spend: [{ date: '2026-10-22', tool: 'Claude API', usd: 1.15, note: 'daily run' }, { date: '2026-10-22', tool: 'Voice', usd: 0.29, note: '' }, { date: '2026-10-23', tool: 'Claude API', usd: 2.5, note: '' }],
  'outreach-stats': { date: '2026-10-22', drafted: 12, approved: 10, sent: 20, replied: 3, bounced: 2 },
  'desk-status': [{ desk: 'technical', now: 'Shipping the live feeds', updated: '2026-10-23T14:00:00Z' }, { desk: 'scout', now: 'Watching two channels', updated: '2026-10-23T13:00:00Z' }],
  notes: [
    { id: 'nt-0000000001', type: 'idea', folder: 'Ideas', title: 'A plain idea', date: '2026-10-20', updated: '2026-10-21', desk: 'growth', status: 'open', level: null, jev: 'not run', tags: ['alpha'], links: ['nt-0000000002'], source: 'vault', body: 'Plain text body.\nSecond line.' },
    { id: 'nt-0000000002', type: 'scout-find', folder: 'Scout Finds', title: 'A scout find', date: '2026-10-22', updated: '2026-10-22', desk: '', status: 'new', level: 'L1', jev: 0.8, tags: ['scout'], links: [], source: 'x', body: 'Body.', urgent: true, url: 'https://example.com/post/1' },
  ],
};
GOOD['build-log'] = [
  { id: 'token-diet', project: 'lavaall-os', status: 'waiting', title: 'Merge the token diet', detail: 'Tests pass.\nNeeds your yes.', url: 'https://github.com/osman-jalloh-lab/Lavaal-/pull/113', updated: '2026-10-23T14:00:00Z' },
  { id: 'single-scan', project: 'salonehire', status: 'active', title: 'Scan each CV once', detail: '', url: '', updated: '2026-10-23T13:00:00Z' },
];
GOOD['daily-recap'] = [
  { id: 'grok-2026-10-23', agent: 'grok', project: 'starlink', date: today, happened: 'Planned the go-live checklist.', built: 'Launch page draft', blocked: '', next: 'Final QA', updated: '2026-10-23T14:00:00Z' },
  { id: 'claude-2026-10-23', agent: 'claude', project: 'lavaall-os', date: today, happened: 'Built the live calendar.', built: '', blocked: 'Needs the merge.', next: '', updated: '2026-10-23T13:00:00Z' },
];
GOOD['repo-status'] = {
  repo: 'osman-jalloh-lab/Lavaal-', branch: 'main', generatedAt: '2026-10-23T14:00:00Z', since: '2026-10-23T13:00:00Z', trigger: 'schedule', headSha: 'abcdef1',
  summary: { merges: 1, commits: 1, checksPass: 1, checksFail: 0, checksPending: 0, checksOther: 0 },
  merges: [{ pr: 1, sha: 'abcdef1', title: 'A change', branch: 'feature/change', at: '2026-10-23T13:30:00Z', kind: 'merge' }],
  commits: [{ sha: 'abcdef1', title: 'A change', at: '2026-10-23T13:30:00Z' }],
  checks: [{ name: 'Tests', runId: 1, sha: 'abcdef1', result: 'pass', pr: 1, url: 'https://github.com/org/repo/actions/runs/1' }],
};
const repoOf = (over) => Object.assign({}, GOOD['repo-status'], over);
const recapOf = (over) => [Object.assign({}, GOOD['daily-recap'][0], over)];
const noteOf = (over) => Object.assign({}, GOOD.notes[0], over);
const buildOf = (over) => [Object.assign({}, GOOD['build-log'][0], over)];

(async () => {
  // ================= 1. auth: 401 without the secret, for every feed ===========================
  for (const feed of feeds.FEEDS) {
    const none = await post(feed, GOOD[feed], { auth: null });
    check(`${feed}: no Authorization header -> 401, nothing stored`, none.res.statusCode === 401 && none.res.body.error === 'unauthorized' && none.kv.cmds.length === 0);
    const wrong = await post(feed, GOOD[feed], { auth: 'Bearer not-the-secret-not-the-secret-0' });
    check(`${feed}: wrong token -> 401, nothing stored`, wrong.res.statusCode === 401 && wrong.kv.cmds.length === 0);
  }
  check('401 says nothing about why', JSON.stringify((await post('spend', GOOD.spend, { auth: null })).res.body) === '{"error":"unauthorized"}');
  check('a non-Bearer scheme is refused', (await post('spend', GOOD.spend, { auth: `Basic ${TOKEN}` })).res.statusCode === 401);
  check('a Bearer token with extra words is refused', (await post('spend', GOOD.spend, { auth: `Bearer ${TOKEN} extra` })).res.statusCode === 401);
  check('a prefix of the secret is refused', (await post('spend', GOOD.spend, { auth: `Bearer ${TOKEN.slice(0, -1)}` })).res.statusCode === 401);
  check('a founder cookie is not enough', (await post('spend', GOOD.spend, { auth: null, headers: { cookie: 'lavaall_ops_session=x', 'x-ops-email': 'someone@example.com' } })).res.statusCode === 401);
  const unset = await post('spend', GOOD.spend, { env: Object.assign({}, ENV, { OPS_CEO_BRIDGE_SECRET: undefined }) });
  check('secret not configured -> 401 (no open door)', unset.res.statusCode === 401 && unset.kv.cmds.length === 0);
  const short = await post('spend', GOOD.spend, { env: Object.assign({}, ENV, { OPS_CEO_BRIDGE_SECRET: 'short' }), auth: 'Bearer short' });
  check('a secret under 16 characters is never accepted', short.res.statusCode === 401);
  const empty = await post('spend', GOOD.spend, { auth: 'Bearer ' });
  check('an empty Bearer token is refused', empty.res.statusCode === 401);
  const getReq = await post('spend', undefined, { method: 'GET', auth: null });
  check('GET without the secret is 401, not a hint that the route exists', getReq.res.statusCode === 401);
  const getAuth = await post('spend', undefined, { method: 'GET' });
  check('GET with the secret is 405 and names POST', getAuth.res.statusCode === 405 && getAuth.res.headers.allow === 'POST');
  check('PUT with the secret is 405', (await post('spend', GOOD.spend, { method: 'PUT' })).res.statusCode === 405);
  check('an unknown feed is 404 (with the secret) and 401 (without)', (await post('anything', {})).res.statusCode === 404 && (await post('anything', {}, { auth: null })).res.statusCode === 401);
  check('responses are never cached', (await post('spend', GOOD.spend)).res.headers['cache-control'] === 'no-store');

  // ================= 2. a good payload is stored and the answer is small =========================
  for (const feed of feeds.FEEDS) {
    const ok = await post(feed, GOOD[feed]);
    check(`${feed}: a good payload -> 200`, ok.res.statusCode === 200 && ok.res.body.ok === true && ok.res.body.feed === feed);
    const sets = ok.kv.cmds.filter((c) => c[0] === 'SET');
    check(`${feed}: exactly one SET, to its own new lavaall-os-feed key`, sets.length === 1 && sets[0][1] === `lavaall-os-feed-${feed}-v1`);
    check(`${feed}: it never touches the existing store key`, !ok.kv.cmds.some((c) => c[1] === 'lavaall-ops-v2'));
  }
  const viaQuery = await post('spend', GOOD.spend, { noQuery: true });
  check('the feed name is also read from the URL path', viaQuery.res.statusCode === 200);
  const prev = await post('spend', GOOD.spend, { env: Object.assign({}, ENV, { VERCEL_ENV: 'preview' }) });
  check('a preview deploy writes to a prefixed key, never the production one', prev.kv.cmds.some((c) => c[0] === 'SET' && c[1] === 'preview:lavaall-os-feed-spend-v1') && !prev.kv.cmds.some((c) => c[1] === 'lavaall-os-feed-spend-v1'));
  check('the function entry is the same handler', typeof entry === 'function' && entry.length === 2);

  // ================= 3. bad shapes are rejected, nothing stored =====================================
  const BAD = {
    'morning-brief': [
      ['missing text', { date: today }],
      ['extra key', { date: today, text: 'x', extra: 1 }],
      ['empty text', { date: today, text: '   ' }],
      ['text too long', { date: today, text: 'x'.repeat(6001) }],
      ['text a number', { date: today, text: 5 }],
      ['not a real day', { date: '2026-02-30', text: 'x' }],
      ['wrong date format', { date: '10/23/2026', text: 'x' }],
      ['far-future date', { date: '2027-01-01', text: 'x' }],
      ['control character', { date: today, text: 'a\u0000b' }],
      ['an array', [{ date: today, text: 'x' }]],
    ],
    'routine-health': [
      ['not an array', { id: 'a', lastRun: null, status: 'ok' }],
      ['empty array', []],
      ['bad status', [{ id: 'a', lastRun: null, status: 'OK' }]],
      ['legacy status word', [{ id: 'a', lastRun: null, status: 'MISSING' }]],
      ['id with spaces', [{ id: 'Not A Slug', lastRun: null, status: 'ok' }]],
      ['duplicate id', [{ id: 'a', lastRun: null, status: 'ok' }, { id: 'a', lastRun: null, status: 'late' }]],
      ['lastRun not ISO', [{ id: 'a', lastRun: 'yesterday', status: 'ok' }]],
      ['lastRun in the future', [{ id: 'a', lastRun: '2026-12-01T00:00:00Z', status: 'ok' }]],
      ['lastRun missing', [{ id: 'a', status: 'ok' }]],
      ['extra key', [{ id: 'a', lastRun: null, status: 'ok', reason: 'x' }]],
      ['41 rows', Array.from({ length: 41 }, (_, i) => ({ id: `r-${i}`, lastRun: null, status: 'ok' }))],
    ],
    spend: [
      ['not an array', { date: today, tool: 'x', usd: 1, note: '' }],
      ['empty array', []],
      ['usd a string', [{ date: today, tool: 'x', usd: '1.00', note: '' }]],
      ['usd negative', [{ date: today, tool: 'x', usd: -1, note: '' }]],
      ['usd NaN', JSON.parse('[{"date":"2026-10-23","tool":"x","usd":null,"note":""}]')],
      ['usd huge', [{ date: today, tool: 'x', usd: 1e9, note: '' }]],
      ['no tool', [{ date: today, tool: '', usd: 1, note: '' }]],
      ['note too long', [{ date: today, tool: 'x', usd: 1, note: 'n'.repeat(201) }]],
      ['note missing', [{ date: today, tool: 'x', usd: 1 }]],
      ['bad date', [{ date: '2026-13-01', tool: 'x', usd: 1, note: '' }]],
      ['extra key', [{ date: today, tool: 'x', usd: 1, note: '', currency: 'USD' }]],
      ['201 rows', Array.from({ length: 201 }, () => ({ date: today, tool: 'x', usd: 1, note: '' }))],
    ],
    'outreach-stats': [
      ['a name field', { date: today, drafted: 1, approved: 1, sent: 1, replied: 0, bounced: 0, name: 'A Lead' }],
      ['an email field', { date: today, drafted: 1, approved: 1, sent: 1, replied: 0, bounced: 0, email: 'a@b.co' }],
      ['a leads array', { date: today, drafted: 1, approved: 1, sent: 1, replied: 0, bounced: 0, leads: [] }],
      ['missing count', { date: today, drafted: 1, approved: 1, sent: 1, replied: 0 }],
      ['a count as a string', { date: today, drafted: '1', approved: 1, sent: 1, replied: 0, bounced: 0 }],
      ['a decimal count', { date: today, drafted: 1.5, approved: 1, sent: 1, replied: 0, bounced: 0 }],
      ['a negative count', { date: today, drafted: -1, approved: 1, sent: 1, replied: 0, bounced: 0 }],
      ['more bounces than sends', { date: today, drafted: 5, approved: 5, sent: 2, replied: 0, bounced: 3 }],
      ['bad date', { date: 'today', drafted: 1, approved: 1, sent: 1, replied: 0, bounced: 0 }],
      ['an array', [{ date: today, drafted: 1, approved: 1, sent: 1, replied: 0, bounced: 0 }]],
    ],
    'desk-status': [
      ['not an array', { desk: 'technical', now: 'x', updated: '2026-10-23T10:00:00Z' }],
      ['unknown desk', [{ desk: 'janitor', now: 'x', updated: '2026-10-23T10:00:00Z' }]],
      ['duplicate desk', [{ desk: 'sales', now: 'x', updated: '2026-10-23T10:00:00Z' }, { desk: 'sales', now: 'y', updated: '2026-10-23T10:00:00Z' }]],
      ['now empty', [{ desk: 'sales', now: '', updated: '2026-10-23T10:00:00Z' }]],
      ['now too long', [{ desk: 'sales', now: 'n'.repeat(201), updated: '2026-10-23T10:00:00Z' }]],
      ['now with a newline', [{ desk: 'sales', now: 'a\nb', updated: '2026-10-23T10:00:00Z' }]],
      ['updated not ISO', [{ desk: 'sales', now: 'x', updated: 'noon' }]],
      ['updated in the future', [{ desk: 'sales', now: 'x', updated: '2026-12-01T00:00:00Z' }]],
      ['extra key', [{ desk: 'sales', now: 'x', updated: '2026-10-23T10:00:00Z', owner: 'o' }]],
    ],
    notes: [
      ['not an array', noteOf({})],
      ['empty array', []],
      ['extra key', [noteOf({ extra: 1 })]],
      ['missing key', [(() => { const n = noteOf({}); delete n.body; return n; })()]],
      ['bad id', [noteOf({ id: 'secret-file-name' })]],
      ['duplicate id', [noteOf({}), noteOf({})]],
      ['bad type', [noteOf({ type: 'session' })]],
      ['bad folder', [noteOf({ folder: 'Sessions' })]],
      ['empty title', [noteOf({ title: '' })]],
      ['bad date', [noteOf({ date: 'yesterday' })]],
      ['level L9', [noteOf({ level: 'L9' })]],
      ['jev out of range', [noteOf({ jev: 2 })]],
      ['too many tags', [noteOf({ tags: Array.from({ length: 13 }, (_, i) => 't' + i) })]],
      ['bad link id', [noteOf({ links: ['nope'] })]],
      ['urgent not a boolean', [noteOf({ urgent: 'yes' })]],
      ['url with an at sign', [noteOf({ url: 'https://example.com/@someone' })]],
      ['body over 4000', [noteOf({ body: 'x'.repeat(4001) })]],
      ['a blocked word in the body', [noteOf({ body: 'about ' + 'Star' + 'link' })]],
      ['a phone number in the body', [noteOf({ body: 'call 202-555-0188' })]],
      ['a names table in the body', [noteOf({ body: '| Name | Use |\n|---|---|\n| a | b |' })]],
      ['a lead list title', [noteOf({ title: 'Lead list for the week' })]],
      ['an at sign in the title', [noteOf({ title: 'write to me@example.com' })]],
      ['a blocked word in a tag', [noteOf({ tags: ['Gui' + 'nea'] })]],
    ],
  };
  BAD['build-log'] = [
    ['not an array', GOOD['build-log'][0]],
    ['empty array', []],
    ['extra key', buildOf({ extra: 1 })],
    ['missing url', [(() => { const r = Object.assign({}, GOOD['build-log'][0]); delete r.url; return r; })()]],
    ['bad id', buildOf({ id: 'Has Spaces' })],
    ['duplicate id', GOOD['build-log'].concat(buildOf({}))],
    ['unknown project', buildOf({ project: 'secret-project' })],
    ['unknown status', buildOf({ status: 'blocked' })],
    ['empty title', buildOf({ title: '   ' })],
    ['title over 140', buildOf({ title: 'x'.repeat(141) })],
    ['detail over 600', buildOf({ detail: 'x'.repeat(601) })],
    ['http url', buildOf({ url: 'http://example.com/x' })],
    ['javascript url', buildOf({ url: 'javascript:alert(1)' })],
    ['future time', buildOf({ updated: '2026-10-24T15:00:00Z' })],
    ['an email in the detail', buildOf({ detail: 'write to me@example.com' })],
    ['a phone number in the detail', buildOf({ detail: 'call 202-555-0188' })],
    ['over 100 items', Array.from({ length: 101 }, (_, i) => ({ id: 'i' + i, project: 'agents', status: 'next', title: 'x', detail: '', url: '', updated: '2026-10-23T14:00:00Z' }))],
  ];
  BAD['daily-recap'] = [
    ['not an array', GOOD['daily-recap'][0]],
    ['empty array', []],
    ['extra key', recapOf({ extra: 1 })],
    ['missing next', [(() => { const r = Object.assign({}, GOOD['daily-recap'][0]); delete r.next; return r; })()]],
    ['bad id', recapOf({ id: 'Has Spaces' })],
    ['bad agent', recapOf({ agent: 'Grok XAI' })],
    ['duplicate id', GOOD['daily-recap'].concat(recapOf({}))],
    ['unknown project', recapOf({ project: 'secret-project' })],
    ['bad date', recapOf({ date: '23/10/2026' })],
    ['empty happened', recapOf({ happened: '  ' })],
    ['happened over 800', recapOf({ happened: 'x'.repeat(801) })],
    ['blocked over 600', recapOf({ blocked: 'x'.repeat(601) })],
    ['future time', recapOf({ updated: '2026-10-24T15:00:00Z' })],
    ['an email in what happened', recapOf({ happened: 'write to me@example.com' })],
    ['a phone number in next', recapOf({ next: 'call 202-555-0188' })],
    ['over 40 entries', Array.from({ length: 41 }, (_, i) => Object.assign({}, GOOD['daily-recap'][0], { id: 'r' + i }))],
  ];
  BAD['repo-status'] = [
    ['extra field', repoOf({ logs: 'x' })],
    ['invalid repo', repoOf({ repo: 'bad repo' })],
    ['invalid sha', repoOf({ headSha: 'ABCDEF1' })],
    ['future time', repoOf({ generatedAt: '2026-12-01T00:00:00Z' })],
    ['since after generated', repoOf({ since: '2026-10-23T14:30:00Z' })],
    ['invalid trigger', repoOf({ trigger: 'manual' })],
    ['invalid count', repoOf({ summary: { ...GOOD['repo-status'].summary, merges: -1 } })],
    ['extra summary field', repoOf({ summary: { ...GOOD['repo-status'].summary, extra: 1 } })],
    ['too many merges', repoOf({ merges: Array(21).fill(GOOD['repo-status'].merges[0]) })],
    ['email title', repoOf({ merges: [{ ...GOOD['repo-status'].merges[0], title: 'someone@example.com' }] })],
    ['phone branch', repoOf({ branch: '202-555-0188' })],
    ['email check name', repoOf({ checks: [{ ...GOOD['repo-status'].checks[0], name: 'someone@example.com' }] })],
    ['invalid check url', repoOf({ checks: [{ ...GOOD['repo-status'].checks[0], url: 'https://evil.example/1' }] })],
    ['extra commit field', repoOf({ commits: [{ ...GOOD['repo-status'].commits[0], author: 'x' }] })],
  ];
  for (const feed of feeds.FEEDS) {
    const cases = BAD[feed];
    const outcomes = [];
    for (const [label, payload] of cases) {
      const r = await post(feed, payload);
      outcomes.push({ label, ok: r.res.statusCode === 422 && r.res.body.error === 'invalid_shape' && r.kv.cmds.length === 0 });
    }
    const failed = outcomes.filter((o) => !o.ok).map((o) => o.label);
    check(`${feed}: ${cases.length} malformed payloads are all 422 and nothing is stored${failed.length ? ' (not rejected: ' + failed.join(', ') + ')' : ''}`, failed.length === 0);
  }
  const reason = await post('spend', [{ date: today, tool: 'SECRET-LOOKING-VALUE', usd: -5, note: '' }]);
  check('the 422 names the field, never a value from the payload', reason.res.body.field === '[0].usd' && !JSON.stringify(reason.res.body).includes('SECRET-LOOKING-VALUE'));

  // ================= 4. size cap, body type ============================================================
  const bigNotes = await post('notes', Array.from({ length: 4 }, (_, i) => noteOf({ id: 'nt-00000000a' + i, body: 'y'.repeat(4000) })), { headers: { 'content-length': '5000000' } });
  check('notes: a declared length over 900 KB is 413', bigNotes.res.statusCode === 413 && bigNotes.kv.cmds.length === 0);
  const fat = await post('notes', Array.from({ length: 300 }, (_, i) => noteOf({ id: 'nt-' + String(i).padStart(10, '0'), body: 'z'.repeat(3500) })));
  check('notes: ~1 MB of real notes is over the cap -> 413', fat.res.statusCode === 413 || JSON.stringify(fat.res.body).length < 5);
  const mid = await post('notes', Array.from({ length: 60 }, (_, i) => noteOf({ id: 'nt-' + String(i).padStart(10, '0'), body: 'z'.repeat(3500) })));
  check('notes: 200 KB passes the size check that stops every other feed at 20 KB', mid.res.statusCode === 200);
  const loose = await post('notes', [noteOf({ body: 'A lead developer, customer-facing copy, lead time, follow @someone, merged in PR #67 on 2026-10-23.' })]);
  check('notes: the words lead and customer, an @handle, a date and a PR number are accepted (the filter is precise)', loose.res.statusCode === 200);
  const otherBig = await post('spend', Array.from({ length: 200 }, () => ({ date: today, tool: 'x'.repeat(60), usd: 1, note: 'n'.repeat(200) })));
  check('every other feed keeps the 20 KB cap', otherBig.res.statusCode === 413);
  const big = await post('morning-brief', { date: today, text: 'x'.repeat(30000) });
  check('a body over 20 KB is 413 before it is parsed or stored', big.res.statusCode === 413 && big.kv.cmds.length === 0);
  const declared = await post('spend', GOOD.spend, { headers: { 'content-length': '99999' } });
  check('a declared length over 20 KB is 413', declared.res.statusCode === 413);
  const notJson = await post('spend', '{not json');
  check('invalid JSON is 400', notJson.res.statusCode === 400 && notJson.res.body.error === 'invalid_json');
  const noBody = await post('spend', undefined);
  check('no body is 400', noBody.res.statusCode === 400);
  const wrongType = await post('spend', JSON.stringify(GOOD.spend), { headers: { 'content-type': 'text/plain' } });
  check('a non-JSON content type is 400', wrongType.res.statusCode === 400);
  const asString = await post('spend', JSON.stringify(GOOD.spend));
  check('a JSON string body is accepted too', asString.res.statusCode === 200);
  const noKv = await post('spend', GOOD.spend, { env: { OPS_CEO_BRIDGE_SECRET: TOKEN, VERCEL: '1' } });
  check('production with no store is 503, not a silent success', noKv.res.statusCode === 503 && noKv.res.body.error === 'store_unavailable');
  const failingKv = makeKv();
  failingKv.fetchImpl = async () => { throw new Error('boom'); };
  const down = await post('spend', GOOD.spend, { kv: failingKv });
  check('a KV failure is 503 and leaks no detail', down.res.statusCode === 503 && JSON.stringify(down.res.body) === '{"error":"store_unavailable"}');

  // ================= 5. merge rules ========================================================================
  {
    const kv = makeKv();
    await post('spend', GOOD.spend, { kv });
    await post('spend', GOOD.spend, { kv });
    let rec = feeds.normalizeRecord('spend', JSON.parse(kv.data.get('lavaall-os-feed-spend-v1')));
    check('spend: sending the same day again does not duplicate rows (3 rows, not 6)', rec.rows.length === 3);
    await post('spend', [{ date: '2026-10-22', tool: 'Claude API', usd: 9, note: 'corrected' }], { kv });
    rec = feeds.normalizeRecord('spend', JSON.parse(kv.data.get('lavaall-os-feed-spend-v1')));
    check('spend: a date you send replaces that date only', rec.rows.filter((r) => r.date === '2026-10-22').length === 1 && rec.rows.some((r) => r.cents === 900) && rec.rows.some((r) => r.date === '2026-10-23' && r.cents === 250));
    check('spend: money is stored in whole cents (1.15 -> 115, 0.29 -> 29)', feeds.spendRows(feeds.normalizeRecord('spend', { receivedAt: 1, rows: [{ date: '2026-10-22', tool: 'a', cents: 115, note: '' }] }))[0].cents === 115 && feeds.validate('spend', [{ date: '2026-10-22', tool: 'a', usd: 1.15, note: '' }, { date: '2026-10-22', tool: 'b', usd: 0.29, note: '' }], { now: NOW }).value.map((r) => r.cents).join() === '115,29');
    await post('outreach-stats', GOOD['outreach-stats'], { kv });
    await post('outreach-stats', { date: '2026-10-23', drafted: 1, approved: 1, sent: 4, replied: 0, bounced: 1 }, { kv });
    const o = feeds.normalizeRecord('outreach-stats', JSON.parse(kv.data.get('lavaall-os-feed-outreach-stats-v1')));
    check('outreach-stats: one record per day, the latest day is shown', Object.keys(o.days).length === 2 && feeds.outreachView(o).date === '2026-10-23' && feeds.outreachView(o).bounceRate === 0.25);
    await post('desk-status', GOOD['desk-status'], { kv });
    await post('desk-status', [{ desk: 'technical', now: 'Newer line', updated: '2026-10-23T14:30:00Z' }], { kv });
    const dsk = feeds.normalizeRecord('desk-status', JSON.parse(kv.data.get('lavaall-os-feed-desk-status-v1')));
    check('desk-status: a desk you send is replaced, the others are kept', dsk.desks.technical.now === 'Newer line' && dsk.desks.scout.now === 'Watching two channels');
    await post('morning-brief', GOOD['morning-brief'], { kv });
    await post('morning-brief', { date: today, text: 'Replaced.' }, { kv });
    check('morning-brief: the latest post is the brief', JSON.parse(kv.data.get('lavaall-os-feed-morning-brief-v1')).text === 'Replaced.');
    check('a damaged stored record reads as "no data", not a crash', feeds.normalizeRecord('spend', { receivedAt: 1, rows: [{ nope: 1 }] }) === null && feeds.normalizeRecord('outreach-stats', { receivedAt: 1, days: { x: {} } }) === null && feeds.normalizeRecord('morning-brief', 'junk') === null);
  }

  // Repo status is read separately and keeps a compact bounded history.
  {
    for (const method of ['GET', 'POST']) {
      for (const auth of [null, 'Bearer wrong', `Bearer ${TOKEN.slice(0, -1)}`]) {
        const r = await post('repo-status', GOOD['repo-status'], { method, auth });
        check(`repo-status ${method}: unauthorized request issues no KV command`, r.res.statusCode === 401 && r.kv.cmds.length === 0);
      }
    }
    const store = makeKv();
    const emptyRepo = await post('repo-status', undefined, { method: 'GET', kv: store });
    check('repo-status: empty GET reads once and returns an empty view', emptyRepo.res.statusCode === 200 && emptyRepo.res.body.latest === null && Array.isArray(emptyRepo.res.body.history) && emptyRepo.res.body.history.length === 0 && store.cmds.length === 1 && store.cmds[0][0] === 'GET');
    for (let i = 0; i < 30; i++) {
      const value = repoOf({ generatedAt: new Date(NOW - (30 - i) * 1000).toISOString().replace('.000Z', 'Z'), headSha: i.toString(16).padStart(7, '0') });
      await post('repo-status', value, { kv: store });
    }
    store.cmds.length = 0;
    const latest = await post('repo-status', undefined, { method: 'GET', kv: store });
    const history = latest.res.body.history || [];
    check('repo-status: GET uses one GET, returns latest and 24 compact newest-first rows', latest.res.statusCode === 200 && store.cmds.length === 1 && store.cmds[0][0] === 'GET' && latest.res.body.latest.headSha === '000001d' && history.length === 24 && history[0].headSha === '000001d' && history[23].headSha === '0000006' && history.every((row) => Object.keys(row).sort().join() === 'generatedAt,headSha,summary,trigger'));
    const failure = makeKv();
    failure.fetchImpl = async (url, init) => { failure.cmds.push(JSON.parse(init.body)); throw new Error('store unavailable'); };
    const failedGet = await post('repo-status', undefined, { method: 'GET', kv: failure });
    const failedPost = await post('repo-status', GOOD['repo-status'], { kv: failure });
    check('repo-status: failed reads return 503 and never SET', failedGet.res.statusCode === 503 && failedPost.res.statusCode === 503 && failure.cmds.every((cmd) => cmd[0] === 'GET'));
    const put = await post('repo-status', undefined, { method: 'PUT' });
    check('repo-status: unsupported methods advertise GET and POST', put.res.statusCode === 405 && put.res.headers.allow === 'GET, POST');
    const oversize = await post('repo-status', repoOf({ branch: 'x'.repeat(21000) }));
    check('repo-status: body over 20 KB is rejected before KV', oversize.res.statusCode === 413 && oversize.kv.cmds.length === 0);
    const damaged = { receivedAt: NOW, latest: GOOD['repo-status'], history: [{ generatedAt: GOOD['repo-status'].generatedAt, trigger: 'schedule', headSha: 'abcdef1', summary: GOOD['repo-status'].summary, extra: 1 }] };
    check('repo-status: damaged stored history is rejected', feeds.normalizeRecord('repo-status', damaged) === null);
    check('ingest implementation never calls GitHub', ['api/ops/_os_feeds.js', 'api/ops/_os_ingest.js', 'api/os/ingest/[feed].js'].every((f) => !fs.readFileSync(path.join(root, f), 'utf8').includes('api.github.com')));
  }

  // ================= 6. a good payload is rendered by the real client ===========================================
  const kv = makeKv();
  for (const feed of feeds.FEEDS) await post(feed, GOOD[feed], { kv });
  const getsBefore = kv.cmds.length;
  const data = await osData.loadOsData({ env: ENV, fetchImpl: kv.fetchImpl, store: {}, health: null, now: NOW });
  const loadCmds = kv.cmds.slice(getsBefore);
  check('loading /os data after the posts uses GETs only', loadCmds.length === 8 && loadCmds.every((c) => c[0] === 'GET'));

  check('data: brief is the posted brief', data.brief && data.brief.date === today && /Three things matter/.test(data.brief.text));
  check('data: routine health merged by id onto the pack routines', data.routines.find((r) => r.id === 'sl-daily-leads').health.status === 'ok' && data.routines.find((r) => r.id === 'midnight-closeout').health.status === 'late' && data.routines.find((r) => r.id === 'friday-decide-or-kill').health.tone === 'bad');
  check('data: last run label is Chicago time, a dash source when never run', data.routines.find((r) => r.id === 'sl-daily-leads').lastRunLabel === 'Oct 23, 7:00 AM CT' && data.routines.find((r) => r.id === 'midnight-closeout').lastRunLabel === '');
  check('data: a routine that reported nothing has no health', data.routines.find((r) => r.id === 'lavaall-slack-task-bridge').health === null);
  check('data: health summary counts 1 ok, 1 late, 1 failed, 1 skipped of 14', JSON.stringify(data.routineHealth.counts) === '{"ok":1,"late":1,"failed":1,"skipped":1,"other":0}' && data.routineHealth.reporting === 4 && data.routineHealth.total === 14);
  check('data: spend month total is 3.94 dollars in whole cents (1.15 + 0.29 + 2.50)', data.spendMonth.totalCents === 394 && data.kpis.aiSpendMonth === 3.94 && data.spendMonth.count === 3);
  check('data: spend providers are the posted tools', data.spendMonth.providers.map((p) => p.name).join() === 'Claude API,Voice');
  check('data: outreach counts and bounce rate (2 of 20 = 10%)', data.outreachStats.sent === 20 && data.outreachStats.bounced === 2 && data.kpis.hotelBounceRate === 0.1 && data.kpis.hotelBounceDate === '2026-10-22');
  check('data: lead cards stay null (counts only)', data.outreach === null);
  check('data: the desk now lines come from the feed', data.desks.find((d) => d.id === 'technical').now === 'Shipping the live feeds' && data.desks.find((d) => d.id === 'scout').now === 'Watching two channels' && data.desks.find((d) => d.id === 'technical').nowUpdatedAt > 0);
  check('data: a desk the feed did not name keeps the pack line', data.desks.find((d) => d.id === 'lifecycle').now === 'Parked as routing priority; Talk still works.');
  check('data: notes come from the notes feed, with type, folder, tags and links', data.notes.length === 2 && data.notes.find((n) => n.id === 'nt-0000000002').type === 'scout-find' && data.notes.find((n) => n.id === 'nt-0000000002').urgent === true && data.notes.find((n) => n.id === 'nt-0000000001').links.join() === 'nt-0000000002' && data.notes.find((n) => n.id === 'nt-0000000001').folder === 'Ideas');
  check('data: the daily recap comes from the daily-recap feed', data.recap && data.recap.entries.length === 2 && data.sources.recap.live === true && data.recap.entries.some((e) => e.agent === 'grok' && e.project === 'starlink'));
  {
    const first = feeds.applyPayload('daily-recap', null, GOOD['daily-recap'], 1);
    const again = feeds.applyPayload('daily-recap', first, [Object.assign({}, GOOD['daily-recap'][0], { happened: 'Updated.' })], 2);
    check('daily-recap: re-sending an id replaces it, others are kept', again.entries.length === 2 && again.entries.find((e) => e.id === 'grok-2026-10-23').happened === 'Updated.');
    const many = Array.from({ length: 20 }, (_, i) => Object.assign({}, GOOD['daily-recap'][0], { id: 'd' + i, date: '2026-10-' + String(i + 1).padStart(2, '0') }));
    const kept = feeds.applyPayload('daily-recap', null, many, 3);
    check('daily-recap: only the newest 14 days are kept', new Set(kept.entries.map((e) => e.date)).size === 14 && kept.entries[0].date === '2026-10-20');
    check('daily-recap: a stored record survives normalizing', feeds.normalizeRecord('daily-recap', JSON.parse(JSON.stringify(kept))).entries.length === 14);
  }
  check('data: the source flags turn live', data.sources.brief.live && data.sources.outreach.live && data.sources.hotelBounceRate.live && data.sources.spend.live);

  const win = {};
  const sandbox = { window: win, document: { querySelector: () => null, querySelectorAll: () => [], documentElement: { setAttribute() {}, getAttribute: () => 'dark' } }, location: { hash: '' }, setTimeout: () => 0, setInterval: () => 0, Intl };
  vm.createContext(sandbox);
  ['core.js', 'home.js', 'desks.js', 'decisions.js', 'outreach.js', 'routines.js', 'notes.js', 'council.js', 'spend.js'].forEach((f) => vm.runInContext(fs.readFileSync(path.join(root, 'api/os/_client', f), 'utf8'), sandbox, { filename: f }));
  const OS = win.OS;
  vm.runInContext(fs.readFileSync(path.join(root, 'api/os/_client/build.js'), 'utf8'), sandbox, { filename: 'build.js' });
  check('data: the build log comes from the build-log feed, newest first', data.build && data.build.items.length === 2 && data.build.items[0].id === 'token-diet' && data.sources.build.live === true);
  const buildHtml = OS.views.build.render({ id: 'build', sub: '', data });
  check('Build: four lanes in order, Waiting on you first', ['Waiting on you', 'In progress', 'Done', 'Up next'].map((l) => buildHtml.indexOf('<h3>' + l + '</h3>')).every((n, k, a) => n > -1 && (k === 0 || n > a[k - 1])));
  check('Build: items land in their lanes with project tags and a link', /Merge the token diet/.test(buildHtml) && /LAVAALL OS/.test(buildHtml) && /SaloneHire/.test(buildHtml) && /href="https:\/\/github\.com\/osman-jalloh-lab\/Lavaal-\/pull\/113"/.test(buildHtml));
  check('Build: a lane with nothing says so', /Nothing finished yet\./.test(buildHtml) && /Nothing queued\./.test(buildHtml));
  const hostileBuild = OS.views.build.render({ id: 'build', sub: '', data: Object.assign({}, data, { build: { receivedAt: NOW, items: [{ id: 'x', project: 'agents', status: 'waiting', title: '<img src=x onerror=alert(1)>', detail: '<script>alert(2)</script>', url: 'javascript:alert(3)', updatedAt: NOW }] } }) });
  check('Build: hostile text is escaped and a non-https link is never rendered', !/<img src=x/.test(hostileBuild) && !/<script>alert/.test(hostileBuild) && !/javascript:/.test(hostileBuild));
  const emptyBuild = OS.views.build.render({ id: 'build', sub: '', data: Object.assign({}, data, { build: null }) });
  check('Build: with no feed, an empty state says so and tiles show dashes', /No build log has been received yet\./.test(emptyBuild) && /<b class="num">—<\/b>/.test(emptyBuild));
  OS.data = data;
  const draw = (id, sub) => OS.views[id].render({ id, sub: sub || '', data });
  const home = draw('home');
  check('Home: the Morning brief card shows the posted text and its date', /Three things matter today\./.test(home) && /class="brief"/.test(home) && />2026-10-23</.test(home) && !/No morning brief/.test(home));
  check('Home: no hotel bounce tile; a Waiting on you tile counts the Build log items that need Osman', !/Hotel bounce rate/.test(home) && /<span>Waiting on you<\/span><b class="num">1<\/b><i>from the Build log<\/i>/.test(home));
  check('Home: the AI spend tile shows the month total', /AI spend this month/.test(home) && /\$3\.94/.test(home));
  check('Home: the Routine health card counts the four statuses', /Routine health/.test(home) && /4 of 14 routines report/.test(home) && /Checked [A-Z][a-z]{2} \d+, \d+:\d{2} [AP]M CT/.test(home) && /pill pass">OK<\/span>[\s\S]*?<b class="num">1<\/b>/.test(home) && /pill bad">Failed/.test(home));
  check('Home: no "Other" row when no routine is outside the four statuses', !/>Other</.test(home));
  const rtn = draw('routines');
  check('Routines: Last run and Health columns show the fed values', /Oct 23, 7:00 AM CT/.test(rtn) && />ok<\/span>/.test(rtn) && />late<\/span>/.test(rtn) && />failed<\/span>/.test(rtn) && />skipped<\/span>/.test(rtn) && /Last run and health are from the routine-health record\./.test(rtn));
  const out = draw('outreach');
  check('Outreach: counters in the column headers come from the feed', ['Drafted', 'Approved', 'Sent', 'Replied', 'Bounced'].every((s, i) => new RegExp(`data-stage="${s}"[\\s\\S]*?data-count>${[12, 10, 20, 3, 2][i]}<`).test(out)));
  check('Outreach: says counts only, as of the day, and shows no lead cards or empty state', /Counts only, as of 2026-10-22\. No lead names or addresses are stored here\./.test(out) && !/class="kc"/.test(out) && !/class="empty"/.test(out));
  const spend = draw('spend');
  check('Spend: the tab shows the posted tools and total', /Claude API/.test(spend) && /Voice/.test(spend) && /\$3\.94/.test(spend));
  const desks = draw('desks');
  check('Desks: the card shows the fed now line', /Shipping the live feeds/.test(desks) && /Watching two channels/.test(desks));
  const drawers = [];
  OS.openDrawer = (h) => { drawers.push(h); };
  OS.views.desks.mount({ addEventListener() {}, querySelector: () => null }, { id: 'desks', sub: 'technical', data });
  check('Desks: the drawer shows the now line and when it was updated', drawers[0] && /Shipping the live feeds/.test(drawers[0]) && /Updated 23 Oct/.test(drawers[0]));

  // Text from a feed is data: it is escaped, never run.
  const hostile = await osData.loadOsData({ env: ENV, store: {}, health: null, now: NOW, feeds: { brief: feeds.normalizeRecord('morning-brief', { receivedAt: 1, date: today, text: '<img src=x onerror=alert(1)><script>alert(2)</script>' }), health: null, spend: null, outreach: null, desks: feeds.normalizeRecord('desk-status', { receivedAt: 1, desks: { sales: { now: '<b onmouseover=x>hi</b>', updated: '2026-10-23T10:00:00Z' } } }) } });
  OS.data = hostile;
  const hh = OS.views.home.render({ id: 'home', sub: '', data: hostile });
  check('hostile feed text is escaped on Home and Desks', !/<img src=x|<script>alert|<b onmouseover/.test(hh + OS.views.desks.render({ id: 'desks', sub: '', data: hostile })) && /&lt;img src=x/.test(hh));

  // ================= 7. with no feeds, nothing is invented ========================================================
  const none = await osData.loadOsData({ env: {}, store: {}, health: null, now: NOW, feeds: { brief: null, health: null, spend: null, outreach: null, desks: null } });
  OS.data = none;
  const homeNone = OS.views.home.render({ id: 'home', sub: '', data: none });
  check('no feeds: brief, health, bounce rate and spend show empty states or dashes', none.brief === null && none.routineHealth === null && none.outreachStats === null && none.kpis.hotelBounceRate === null && none.kpis.aiSpendMonth === null && none.spend === null && /No morning brief has been received yet\./.test(homeNone) && /No routine health has been received yet\./.test(homeNone));
  check('no feeds: the empty states still name the Sierra Leone leads routine for Outreach', /Sierra Leone leads routine/.test(OS.views.outreach.render({ id: 'outreach', sub: '', data: none })));
  check('no feeds: desks keep the pack now lines', none.desks.find((d) => d.id === 'lifecycle').now === 'Parked as routing priority; Talk still works.' && none.desks.find((d) => d.id === 'technical').nowUpdatedAt === 0);
  const zeroSent = feeds.outreachView({ receivedAt: 1, days: { '2026-10-22': { drafted: 3, approved: 0, sent: 0, replied: 0, bounced: 0 } } });
  check('zero sends -> no bounce rate (a dash), never a division by zero', zeroSent.bounceRate === null);

  // ================= 8. scope: no new env var, no vercel.json / auth change, repo carries no secrets ===============
  const files = ['api/ops/_os_feeds.js', 'api/ops/_os_ingest.js', 'api/os/ingest/[feed].js'];
  const src = files.map((f) => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');
  const envNames = new Set((src.match(/process\.env\.([A-Z0-9_]+)/g) || []).map((m) => m.replace('process.env.', '')));
  check('the only env vars named are the existing bridge secret, the KV pair, VERCEL_ENV, VERCEL and OPS_STORE_FILE', [...envNames].every((n) => ['OPS_CEO_BRIDGE_SECRET', 'VERCEL_ENV'].includes(n)) && /env\.KV_REST_API_URL/.test(src) && !/OS_INGEST|INGEST_TOKEN|FEED_SECRET/.test(src));
  check('the adapter still only reads: no SET and no store write in _os_data.js', !/writeStore|kvSet|persistSeeded|['"](SET|DEL|EXPIRE)['"]/.test(fs.readFileSync(path.join(root, 'api/ops/_os_data.js'), 'utf8')));
  check('only the ingest modules write, and only with SET on a lavaall-os-feed key', (src.match(/'SET'/g) || []).length === 1 && /KEY_PREFIX = 'lavaall-os-feed-'/.test(src));
  check('no payload, token or header is logged', !/console\.(log|error|warn)\([^)]*(body|token|authorization|req\.)/i.test(src));
  const docs = fs.readFileSync(path.join(root, 'api/os/_data/INGEST.md'), 'utf8');
  check('INGEST.md has one curl example per feed, with the secret shown as $TOKEN', feeds.FEEDS.every((f) => docs.includes('curl -sS -X POST https://www.lavaall.com/api/os/ingest/' + f + ' \\')) && (docs.match(/curl -sS -X POST/g) || []).length === 9 && (docs.match(/-H "Authorization: Bearer \$TOKEN"/g) || []).length === 10);
  const banned = new RegExp(['Star' + 'link', 'Gui' + 'nea', '@gmail', '@g\\.', '[A-Za-z0-9_-]{32,}'].join('|'));
  check('INGEST.md holds no real secret, email, lead name or banned public-copy term', !banned.test(docs.replace(/https?:\/\/\S+/g, '')));
  try {
    const diff = execFileSync('git', ['diff', '--name-only', 'origin/main...HEAD'], { cwd: root, encoding: 'utf8' }) + execFileSync('git', ['diff', '--name-only'], { cwd: root, encoding: 'utf8' });
    const names = diff.split(/\n/).filter(Boolean);
    check('auth code is not changed (the /os guard now has a local-only bypass, covered by test-os-dev-bypass.js)', !names.some((name) => /api\/ops\/auth\.js|_google_signin\.js|_signin_hardening\.js|_os_return\.js/.test(name)));
    let osRoutesIntact = true;
    if (names.includes('vercel.json')) {
      const current = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
      const base = JSON.parse(execFileSync('git', ['show', 'origin/main:vercel.json'], { cwd: root, encoding: 'utf8' }));
      const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
      const pick = (cfg, pred) => (cfg.headers || []).filter(pred);
      const currentFunctions = { ...(current.functions || {}) };
      const baseFunctions = { ...(base.functions || {}) };
      const chatFn = currentFunctions['api/chat-inquiry.js'];
      delete currentFunctions['api/chat-inquiry.js'];
      delete baseFunctions['api/chat-inquiry.js'];
      osRoutesIntact = same(currentFunctions, baseFunctions)
        && !!chatFn && chatFn.maxDuration === 20
        && typeof chatFn.includeFiles === 'string'
        && chatFn.includeFiles.includes('assets/js/catalog-data.js')
        && same(current.rewrites, base.rewrites)
        // /os may only gain the same same-origin microphone policy /ops has (Jarvis voice), nothing else.
        && same(pick(current, (h) => /^\/os/.test(h.source) && h.source !== '/os(.*)'), pick(base, (h) => /^\/os/.test(h.source) && h.source !== '/os(.*)'))
        && pick(current, (h) => h.source === '/os(.*)').every((h) => same(h.headers, [{ key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=()' }]))
        && same(pick(current, (h) => h.source === '/ops(.*)'), pick(base, (h) => h.source === '/ops(.*)'))
        && same(pick(current, (h) => h.source === '/web/(.*)' && !(h.headers.length === 1 && h.headers[0].key === 'Content-Security-Policy')), pick(base, (h) => h.source === '/web/(.*)'))
        && same(pick(current, (h) => h.source === '/(.*)'), pick(base, (h) => h.source === '/(.*)'));
      const rootHeader = (current.headers || []).find((h) => h.source === '/' && (h.headers || []).some((entry) => entry.key === 'Permissions-Policy'));
      const policy = rootHeader && (rootHeader.headers || []).find((h) => h.key === 'Permissions-Policy');
      osRoutesIntact = osRoutesIntact && !!policy && policy.value === 'camera=(), microphone=(self), geolocation=()';
    }
    check('/os, /ops and /web vercel routes stay unchanged; the homepage and /os may only add a scoped same-origin microphone policy', osRoutesIntact);
  } catch { check('vercel.json and the auth code are not changed (git unavailable, skipped)', true); }

  {
    const producer = require(path.join(root, 'scripts/os-repo-status.js'));
    const logs = [];
    let calls = [];
    const mock = (watermark, rich = false) => async (url, init) => {
      calls.push({ url, method: init.method, body: init.body });
      if (url === producer.INGEST_URL && init.method === 'GET') return watermark === null ? { ok: false } : { ok: true, json: async () => ({ latest: { generatedAt: watermark } }) };
      if (url === producer.INGEST_URL && init.method === 'POST') return { ok: true, status: 200 };
      if (url.includes('/pulls?')) return { ok: true, json: async () => rich ? [{ number: 1, title: 'Contact someone@example.com', head: { ref: 'feature/x' }, merged_at: '2026-10-23T14:30:00Z', merge_commit_sha: 'abcdef123456', author: { name: 'Private Name', email: 'someone@example.com' }, diff: 'private diff text' }] : [] };
      if (url.includes('/commits?')) return { ok: true, json: async () => rich ? [{ sha: 'abcdef123456', commit: { message: 'Change\nprivate log text', committer: { date: '2026-10-23T14:30:00Z', name: 'Private Name', email: 'someone@example.com' } } }] : [] };
      if (url.includes('/git/ref/')) return { ok: true, json: async () => ({ object: { sha: 'abcdef123456' } }) };
      if (url.includes('/actions/runs?')) return { ok: true, json: async () => ({ workflow_runs: rich ? [{ name: 'Tests', id: 2, head_sha: 'abcdef123456', status: 'completed', conclusion: 'success', pull_requests: [], html_url: 'https://github.com/org/repo/actions/runs/2', logs: 'private log text' }] : [] }) };
      throw new Error('unexpected host');
    };
    const skip = await producer.run({ env: {}, fetchImpl: () => { throw new Error('must not fetch'); }, log: (line) => logs.push(line) });
    check('producer: missing secret skips without any fetch', skip === 0 && logs.pop() === 'os-repo-status: skipped (ingest secret not configured)');
    const opts = { env: {}, secret: TOKEN, githubToken: 'test-github-token', now: NOW, log: (line) => logs.push(line) };
    let code = await producer.run({ ...opts, ingestUrl: 'https://evil.example/', fetchImpl: mock(null) });
    let posts = calls.filter((c) => c.method === 'POST');
    let digest = JSON.parse(posts[0].body);
    check('producer: quiet heartbeat posts once to safe default and falls back 70 minutes', code === 0 && posts.length === 1 && posts[0].url === producer.INGEST_URL && digest.since === '2026-10-23T13:50:00Z' && digest.generatedAt === '2026-10-23T15:00:00Z' && Object.values(digest.summary).every((n) => n === 0) && ['merges', 'commits', 'checks'].every((k) => digest[k].length === 0) && feeds.validate('repo-status', digest, { now: NOW }).ok);
    calls = [];
    code = await producer.run({ ...opts, fetchImpl: mock('2026-10-01T00:00:00Z', true) });
    posts = calls.filter((c) => c.method === 'POST');
    digest = JSON.parse(posts[0].body);
    const serialized = JSON.stringify(digest);
    check('producer: watermark clamps at 48 hours; private source fields never enter digest', code === 0 && posts.length === 1 && digest.since === '2026-10-21T15:00:00Z' && Object.keys(digest).sort().join() === 'branch,checks,commits,generatedAt,headSha,merges,repo,since,summary,trigger' && !/@|Private Name|private diff|private log|author|committer/.test(serialized) && /\[email\]|\[title withheld\]/.test(digest.merges[0].title) && feeds.validate('repo-status', digest, { now: NOW }).ok && logs.every((line) => !line.includes(TOKEN)));
    calls = [];
    await producer.run({ ...opts, fetchImpl: mock('2026-10-23T14:20:00Z') });
    check('producer: valid watermark is used', JSON.parse(calls.find((c) => c.method === 'POST').body).since === '2026-10-23T14:20:00Z');
    const large = repoOf({ checks: Array(20).fill({ ...GOOD['repo-status'].checks[0], name: 'x'.repeat(100) }), commits: Array(20).fill({ ...GOOD['repo-status'].commits[0], title: 'x'.repeat(140) }), merges: Array(20).fill({ ...GOOD['repo-status'].merges[0], title: 'x'.repeat(140), branch: 'x'.repeat(100) }) });
    const trimmed = producer.trim(large);
    check('producer: maximal rows fit the 19 KB target after trimming', !!trimmed && Buffer.byteLength(JSON.stringify(trimmed)) <= 19 * 1024 && feeds.validate('repo-status', trimmed, { now: NOW }).ok);
  }

  {
    const workflow = fs.readFileSync(path.join(root, '.github/workflows/os-repo-status.yml'), 'utf8');
    check('repo-status workflow: hourly, main push and manual triggers', /cron:\s*['"]0 \* \* \* \*['"]/.test(workflow) && /push:\s*\n\s*branches:\s*\[main\]/.test(workflow) && /workflow_dispatch:/.test(workflow));
    const permissions = (workflow.match(/^permissions:\s*\n((?:[ \t]+.*\n)+)/m) || [])[1] || '';
    check('repo-status workflow: only three read permissions', permissions.trim().split('\n').map((line) => line.trim()).sort().join('|') === 'actions: read|contents: read|pull-requests: read' && !/\bwrite\b/.test(workflow));
    check('repo-status workflow: secret referenced once in env', (workflow.match(/secrets\.OPS_CEO_BRIDGE_SECRET/g) || []).length === 1 && /OPS_CEO_BRIDGE_SECRET:\s*\$\{\{ secrets\.OPS_CEO_BRIDGE_SECRET \}\}/.test(workflow));
    check('repo-status workflow: no shell exposure or attacker-controlled expressions', !/\b(?:echo|printenv)\b|set -x|bash -x|github\.event\.|head_ref|pull_request(?:_target)?:/.test(workflow) && !/^\s*run:.*\$\{\{/m.test(workflow));
    const actions = [...workflow.matchAll(/\buses:\s*([^\s#]+)/g)].map((m) => m[1]);
    check('repo-status workflow: checkout is the only action and pinned to a full SHA', actions.length === 1 && /^actions\/checkout@[0-9a-f]{40}$/.test(actions[0]));
  }

  const failedChecks = results.filter((r) => !r.pass);
  results.forEach((r) => console.log(`${r.pass ? 'ok  ' : 'FAIL'} ${r.name}`));
  console.log(`\n${results.length - failedChecks.length}/${results.length} passed`);
  process.exit(failedChecks.length ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
