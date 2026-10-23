// LAVAALL OS data adapter: read-only, null when missing, no invented values.
// Synthetic fixtures only. No network, no KV writes.

const fs = require('fs');
const path = require('path');

const opsDir = path.join(__dirname, '../api/ops');
const osData = require(path.join(opsDir, '_os_data.js'));
const { OFFICE_AGENTS } = require(path.join(opsDir, '_office.js'));

const results = [];
function check(name, cond) { results.push({ name, pass: !!cond }); }

const realFetch = globalThis.fetch;
const calls = [];
function stubFetch(storeJson) {
  return async (url, init) => {
    calls.push({ url, init });
    const cmd = JSON.parse(init.body);
    if (cmd[0] === 'GET' && cmd[1] === 'lavaall-ops-v2') {
      return { ok: true, json: async () => ({ result: storeJson == null ? null : JSON.stringify(storeJson) }) };
    }
    return { ok: true, json: async () => ({ result: null }) };
  };
}

const STORE = {
  chats: [{
    id: 'shared',
    proposals: [
      { id: 'p1', kind: 'add-task', status: 'pending', title: 'Add task', body: 'b', fields: { source: 'chat' }, createdAt: 200 },
      { id: 'p2', kind: 'add-note', status: 'dismissed', title: 'Old', body: '', createdAt: 100 },
      { id: 'p3', kind: 'save-goal', status: 'pending', title: 'Goal', body: '', createdAt: 300 },
    ],
  }],
  routines: [
    { id: 'morning-brief', name: 'STORE PROMPT one', lastRunAt: 0, lastRunStatus: '' },
    { id: 'weekly-review', name: 'STORE PROMPT two', lastRunAt: 1760000000000, lastRunStatus: 'ok' },
    { id: '', name: 'no id' },
  ],
  notes: [
    { id: 'n1', title: 'Older', body: 'x', updatedAt: 10, deletedAt: 0 },
    { id: 'n2', title: 'Newer', body: 'y', updatedAt: 20, deletedAt: 0 },
    { id: 'n3', title: 'Deleted', body: 'z', updatedAt: 30, deletedAt: 5 },
  ],
};

(async () => {
  // 1. Missing store: every store-backed loader is null, nothing is invented.
  const none = osData.buildOsData({ store: null, health: null }, { env: {}, pack: null });
  check('no store -> approvals null', none.approvals === null);
  check('no pack -> routines null (they never come from the store)', none.routines === null);
  check('no store -> notes null', none.notes === null);
  check('no store -> awaitingApproval null', none.kpis.awaitingApproval === null);
  check('storeAvailable false', none.storeAvailable === false);

  // 2. Sources with no backing data are always null.
  ['openDecisions', 'hotelBounceRate', 'aiSpendMonth'].forEach((k) => check(`kpi ${k} null`, none.kpis[k] === null));
  ['brief', 'decisions', 'outreach', 'council', 'spend'].forEach((k) => check(`${k} null`, none[k] === null));
  const withStore = osData.buildOsData({ store: STORE, health: null }, { env: {}, pack: null });
  ['brief', 'decisions', 'outreach', 'council', 'spend'].forEach((k) => check(`${k} still null with a store`, withStore[k] === null));
  check('openDecisions still null with a store', withStore.kpis.openDecisions === null);

  // 3. Real data maps through.
  check('approvals only pending', withStore.approvals.length === 2 && withStore.approvals.every((a) => ['p1', 'p3'].includes(a.id)));
  check('approvals newest first', withStore.approvals[0].id === 'p3');
  check('awaitingApproval is the count', withStore.kpis.awaitingApproval === 2);
  check('empty proposals -> 0 not null', osData.buildOsData({ store: { chats: [] } }, { env: {}, pack: null }).kpis.awaitingApproval === 0);
  const RPACK = { routines: [
    { id: 'morning-brief', name: 'Morning brief', schedule: 'Weekdays 7:30 AM CT', owner: 'lavaall-ceo', status: 'active', lastRunAt: 1760000000000, lastRunStatus: 'ok' },
    { id: 'weekly-review', name: 'Weekly review', schedule: 'Fri 8:47 AM CT', owner: 'researchy', status: 'paused', lastRunAt: 0, lastRunStatus: '' },
    { id: '', name: 'no id' },
    { id: 'bare', name: 'Bare routine' },
  ] };
  const rp = osData.buildOsData({ store: STORE, health: null }, { env: {}, pack: RPACK });
  check('routines come from the pack; rows without an id are dropped', rp.routines.length === 3);
  check('routines carry the pack schedule, owner and status', rp.routines[0].schedule === 'Weekdays 7:30 AM CT' && rp.routines[0].owner === 'lavaall-ceo' && rp.routines[0].status === 'active' && rp.routines[1].owner === 'researchy' && rp.routines[1].status === 'paused');
  check('a routine with no schedule or owner stays null, never invented', rp.routines[2].schedule === null && rp.routines[2].owner === null && rp.routines[2].status === '');
  check("the pack's stale last-run fields are ignored", rp.routines.every((r) => r.lastRunAt === 0 && r.lastRunLabel === '' && r.lastRunStatus === ''));
  check('store routines are ignored (they are /ops prompts)', !JSON.stringify(rp.routines).includes('STORE PROMPT'));
  check('routines are available even when the store is down', osData.buildOsData({ store: null, health: null }, { env: {}, pack: RPACK }).routines.length === 3);
  check('notes hide deleted, newest first', withStore.notes.map((n) => n.id).join() === 'n2,n1');

  // 4. Routine health joins by slug.
  const health = { ok: true, empty: false, checkedLabel: 'now', routines: [{ slug: 'weekly-review', status: 'OK', tone: 'ok', reason: 'ran', lastRunAt: '2026-10-09T08:53:00Z', lastRunLabel: 'Oct 9, 3:53 AM CT' }] };
  const joined = osData.buildOsData({ store: STORE, health }, { env: {}, pack: RPACK });
  check('live health is merged by routine id', joined.routines[1].health && joined.routines[1].health.status === 'OK' && joined.routines[0].health === null);
  check('"last run" comes only from live health', joined.routines[1].lastRunLabel === 'Oct 9, 3:53 AM CT' && joined.routines[1].lastRunAt === Date.parse('2026-10-09T08:53:00Z') && joined.routines[0].lastRunLabel === '' && joined.routines[0].lastRunAt === 0);

  // 5. Desks come from the registry; SOUL-derived fields stay null.
  check('desks match registry', withStore.desks.length === OFFICE_AGENTS.length && withStore.desks.every((d, i) => d.id === OFFICE_AGENTS[i].id));
  check('desk soul fields null', withStore.desks.every((d) => d.now === null && d.skills === null && d.rules === null));

  // 6. Settings: names only, never values.
  const secret = 'SECRET-VALUE-123';
  const env = { KV_REST_API_URL: 'https://kv.example', KV_REST_API_TOKEN: secret, OPS_GMAIL_CLIENT_ID: secret, VERCEL: '1' };
  const settings = osData.settingsFrom(env);
  check('settings never contain values', !JSON.stringify(settings).includes(secret) && !JSON.stringify(settings).includes('kv.example'));
  check('github is unknown, not connected', settings.find((s) => s.name === 'GitHub').status === 'unknown');
  check('vercel configured from env presence', settings.find((s) => s.name === 'Vercel').status === 'configured');
  check('mail configured from env presence', settings.find((s) => s.name === 'Mail').status === 'configured');
  check('empty env -> not configured', osData.settingsFrom({}).find((s) => s.name === 'Store (KV)').status === 'not configured');

  // 7. Source table flags live vs empty honestly.
  check('sources: store-backed live', joined.sources.approvals.live && joined.sources.routines.live && joined.sources.notes.live);
  check('sources: missing ones empty', ['decisions', 'jev', 'spend', 'council', 'brief', 'outreach', 'hotelBounceRate'].every((k) => joined.sources[k].live === false));
  check('sources: no store -> store-backed not live', !none.sources.approvals.live && !none.sources.notes.live);
  check('every source says where data would come from', Object.values(joined.sources).every((s) => s.from && s.label));

  // 7b. Decision log: null until a log exists; scores and levels are validated, never invented.
  check('no decision log -> decisions null and open KPI null', none.decisions === null && withStore.decisions === null && withStore.kpis.openDecisions === null);
  const logData = osData.buildOsData({ store: { decisions: [
    { id: 'a', title: 'Old', level: 'L2', status: 'open', jev: 0.9, date: '2026-10-01T00:00:00Z' },
    { id: 'b', title: 'New', level: 'L9', status: 'Closed', jev: 1.4, date: '2026-10-05T00:00:00Z' },
    { id: 'c', title: 'No score', level: 'L0', status: 'Open', date: 'not a date' },
    { id: 'x', title: '   ' },
  ] } }, { env: {}, pack: null });
  check('decisions: rows without a title are dropped', logData.decisions.length === 3);
  check('decisions: newest first', logData.decisions[0].id === 'b');
  check('decisions: invalid level becomes empty', logData.decisions[0].level === '');
  check('decisions: out-of-range Jev is dropped, not clamped', logData.decisions[0].jev === null);
  check('decisions: valid Jev kept, missing Jev is null', logData.decisions.find((d) => d.id === 'a').jev === 0.9 && logData.decisions.find((d) => d.id === 'c').jev === null);
  check('decisions: bad date becomes 0', logData.decisions.find((d) => d.id === 'c').date === 0);
  check('decisions: open KPI is case-insensitive', logData.kpis.openDecisions === 2);
  check('decisions: sources flip live only with real data', logData.sources.decisions.live === true && logData.sources.jev.live === true && joined.sources.decisions.live === false);
  check('desks expose their /ops Talk link', withStore.desks.every((d) => /^\/ops\/chat\//.test(d.talk)));

  // 8. No network without KV or file store.
  globalThis.fetch = stubFetch(STORE);
  calls.length = 0;
  const offline = await osData.loadOsData({ env: {}, health: null });
  check('no KV env -> no network call', calls.length === 0);
  check('no KV env -> store null, empty states', offline.storeAvailable === false && offline.approvals === null);

  // 9. With KV: only GET of the existing key, never a write.
  calls.length = 0;
  const live = await osData.loadOsData({
    env: { KV_REST_API_URL: 'https://kv.example', KV_REST_API_TOKEN: 't' },
    fetchImpl: globalThis.fetch,
    health: null,
  });
  check('KV load reads the store', live.storeAvailable && live.kpis.awaitingApproval === 2);
  check('KV load made six calls: the store, then one for each of the five feeds', calls.length === 6);
  const cmds = calls.map((c) => JSON.parse(c.init.body));
  check('KV commands are GET only', cmds.every((c) => c[0] === 'GET'));
  check('KV GETs target lavaall-ops-v2 once and the five lavaall-os-feed-* keys, nothing else', cmds.filter((c) => c[1] === 'lavaall-ops-v2').length === 1 && cmds.filter((c) => /^lavaall-os-feed-(morning-brief|routine-health|spend|outreach-stats|desk-status)-v1$/.test(c[1])).length === 5);
  check('no SET/DEL/EXPIRE anywhere', !cmds.some((c) => /^(SET|DEL|EXPIRE|MSET|HSET|INCR|APPEND)$/i.test(c[0])));

  // 10. A failing store degrades to null, not a throw or sample data.
  const failing = await osData.loadOsData({
    env: { KV_REST_API_URL: 'https://kv.example', KV_REST_API_TOKEN: 't' },
    fetchImpl: async () => { throw new Error('down'); },
    health: null,
  });
  check('KV failure -> store-backed widgets empty, static pack still shown', failing.storeAvailable === false && failing.approvals === null && failing.notes === null && failing.routines.length === 14 && failing.decisions.length === 52);
  const notOk = await osData.loadOsData({
    env: { KV_REST_API_URL: 'https://kv.example', KV_REST_API_TOKEN: 't' },
    fetchImpl: async () => ({ ok: false, json: async () => ({}) }),
    health: null,
  });
  check('KV http error -> empty states', notOk.storeAvailable === false);
  const garbled = await osData.readRawStore({
    env: { KV_REST_API_URL: 'https://kv.example', KV_REST_API_TOKEN: 't' },
    fetchImpl: async () => ({ ok: true, json: async () => ({ result: '{not json' }) }),
  });
  check('garbled stored value -> null', garbled === null);

  // 11. Source hygiene: no readStore/write calls, no model SDKs.
  const src = fs.readFileSync(path.join(opsDir, '_os_data.js'), 'utf8');
  const code = src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  check('adapter never calls readStore', !/readStore\s*\(/.test(code));
  check('adapter never calls a store write', !/writeStore|kvSet|persistSeeded|['"](SET|DEL|EXPIRE)['"]/.test(code));
  check('adapter has no model SDK or key', !/ANTHROPIC|OPENAI|XAI_|@anthropic|require\(['"]openai/.test(code));

  globalThis.fetch = realFetch;
  const failed = results.filter((r) => !r.pass);
  results.forEach((r) => console.log(`${r.pass ? 'ok  ' : 'FAIL'} ${r.name}`));
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((err) => {
  globalThis.fetch = realFetch;
  console.error(err);
  process.exit(1);
});
