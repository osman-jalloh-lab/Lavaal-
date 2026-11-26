// LAVAALL OS Connect Google: OAuth with PKCE and a signed state cookie, an encrypted refresh token, Calendar,
// and Gmail drafts (never send). Google and KV are mocked; no network.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

process.env.OPS_AUTH_SECRET = process.env.OPS_AUTH_SECRET || 'unit-test-auth-secret-0123456789abcdef';
const root = path.join(__dirname, '..');
const g = require(path.join(root, 'api/ops/_os_google.js'));
const results = [];
function check(name, cond) { results.push({ name, pass: !!cond }); }
const SESSION = { email: 'founder@example.com' };
const ENV = { OPS_GMAIL_CLIENT_ID: 'cid.apps.googleusercontent.com', OPS_GMAIL_CLIENT_SECRET: 'csecret-DO-NOT-PRINT', KV_REST_API_URL: 'https://kv.example', KV_REST_API_TOKEN: 'kvt' };
const REFRESH = '1//refresh-DO-NOT-PRINT';

function mockRes() {
  const res = { statusCode: 200, headers: {}, raw: '' };
  res.status = (c) => { res.statusCode = c; return res; };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; return res; };
  res.send = (b) => { res.raw = String(b); try { res.body = JSON.parse(b); } catch { res.body = b; } return res; };
  return res;
}
function world() {
  const kv = new Map(); const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const u = String(url);
    if (u === 'https://kv.example') {
      const cmd = JSON.parse(init.body);
      if (cmd[0] === 'GET') return { ok: true, json: async () => ({ result: kv.get(cmd[1]) || null }) };
      if (cmd[0] === 'SET') { kv.set(cmd[1], cmd[2]); return { ok: true, json: async () => ({ result: 'OK' }) }; }
      if (cmd[0] === 'DEL') { kv.delete(cmd[1]); return { ok: true, json: async () => ({ result: 1 }) }; }
    }
    if (u === 'https://oauth2.googleapis.com/token') {
      const p = new URLSearchParams(init.body);
      if (p.get('grant_type') === 'authorization_code') return { ok: true, json: async () => ({ access_token: 'at1', refresh_token: REFRESH, scope: g.SCOPES.join(' ') }) };
      return { ok: p.get('refresh_token') === REFRESH, json: async () => ({ access_token: 'at2' }) };
    }
    if (u.endsWith('/users/me/profile')) return { ok: true, json: async () => ({ emailAddress: 'Support@LAVAALL.com' }) };
    if (u.includes('/calendar/v3/calendars/primary/events?timeMin')) return { ok: true, json: async () => ({ items: [{ id: 'e1', summary: '<b>Call</b>', start: { dateTime: '2026-11-27T15:00:00Z' }, end: { dateTime: '2026-11-27T15:30:00Z' }, htmlLink: 'javascript:alert(1)' }] }) };
    if (u.includes('/calendar/v3/calendars/primary/events?sendUpdates=none')) return { ok: true, json: async () => ({ id: 'new1' }) };
    if (u.endsWith('/users/me/drafts')) return { ok: true, json: async () => ({ id: 'd1' }) };
    if (u.startsWith('https://oauth2.googleapis.com/revoke')) return { ok: true, json: async () => ({}) };
    throw new Error('unexpected ' + u);
  };
  return { kv, calls, fetchImpl };
}
async function call(w, route, req, extra) {
  const res = mockRes();
  const handled = await g.handleOsGoogle(Object.assign({ method: 'GET', url: '/ops/' + route, headers: {}, query: { area: route } }, req || {}),
    res, Object.assign({ env: ENV, fetchImpl: w.fetchImpl, session: SESSION, origin: 'https://www.lavaall.com' }, extra || {}));
  return { handled, res };
}

(async () => {
  const w = world();
  check('other routes fall through', (await call(w, 'os/inbox')).handled === false);
  check('agents refused, sign-in required', (await call(w, 'os/google/status', { headers: { authorization: 'Bearer x' } })).res.statusCode === 403
    && (await call(w, 'os/google/status', {}, { session: null })).res.statusCode === 401);
  check('not connected yet', (await call(w, 'os/google/status')).res.body.connected === false);
  check('calendar and drafts need a connection first', (await call(w, 'os/calendar')).res.statusCode === 409);

  const start = await call(w, 'os/google/connect');
  const loc = new URL(start.res.headers.location);
  check('connect redirects to Google with PKCE, offline access and the registered callback',
    start.res.statusCode === 302 && loc.origin === 'https://accounts.google.com' && loc.searchParams.get('redirect_uri') === 'https://www.lavaall.com/ops/os/gmail/callback'
    && loc.searchParams.get('code_challenge_method') === 'S256' && loc.searchParams.get('access_type') === 'offline' && loc.searchParams.get('login_hint') === 'support@lavaall.com');
  check('it asks only for Gmail read, Gmail drafts and Calendar events (no send scope)', g.SCOPES.includes('https://www.googleapis.com/auth/gmail.compose') && !g.SCOPES.some((s) => /gmail\.send|mail\.google\.com\/$|gmail\.modify/.test(s)));
  const cookie = /lavaall_os_google=([^;]+)/.exec(start.res.headers['set-cookie'])[1];
  check('the state cookie is HttpOnly', /HttpOnly/.test(start.res.headers['set-cookie']));

  const bad = await call(w, 'os/gmail/callback', { headers: { cookie: 'lavaall_os_google=' + cookie }, query: { area: 'os/gmail/callback', state: 'wrong', code: 'c' } });
  check('a mismatched state stores nothing', bad.res.statusCode === 302 && w.kv.size === 0);
  const other = await call(w, 'os/gmail/callback', { headers: { cookie: 'lavaall_os_google=' + cookie }, query: { area: 'os/gmail/callback', state: loc.searchParams.get('state'), code: 'c' } }, { session: { email: 'someone-else@example.com' } });
  check('a different signed-in person cannot finish the connection', w.kv.size === 0 && other.res.statusCode === 302);
  const ok = await call(w, 'os/gmail/callback', { headers: { cookie: 'lavaall_os_google=' + cookie }, query: { area: 'os/gmail/callback', state: loc.searchParams.get('state'), code: 'c' } });
  const stored = w.kv.get('lavaall-os-google-v1') || '';
  check('the callback stores the account and an ENCRYPTED refresh token, then returns to Inbox', ok.res.statusCode === 302 && ok.res.headers.location === '/os#inbox' && /support@lavaall\.com/.test(stored) && !stored.includes(REFRESH) && g.decrypt(JSON.parse(stored).enc) === REFRESH);
  const st = await call(w, 'os/google/status');
  check('status shows the connected account and never a token', st.res.body.connected === true && st.res.body.email === 'support@lavaall.com' && !st.res.raw.includes(REFRESH) && !st.res.raw.includes('enc'));

  const cal = await call(w, 'os/calendar');
  check('calendar lists events and drops non-Google links', cal.res.statusCode === 200 && cal.res.body.events[0].title === '<b>Call</b>' && cal.res.body.events[0].link === '');
  check('adding an event needs POST and a valid time range', (await call(w, 'os/calendar/event', { method: 'POST', body: { title: 'x', start: '2026-11-27T16:00:00Z', end: '2026-11-27T15:00:00Z' } })).res.statusCode === 400);
  const add = await call(w, 'os/calendar/event', { method: 'POST', body: { title: 'Supplier call', start: '2026-11-27T16:00:00Z', end: '2026-11-27T16:30:00Z' } });
  check('an event is created without emailing guests', add.res.body.ok === true && w.calls.some((c) => /sendUpdates=none/.test(c.url)));
  check('a draft needs a real address, subject and text', (await call(w, 'os/gmail/draft', { method: 'POST', body: { to: 'not-an-email', subject: 's', text: 't' } })).res.statusCode === 400);
  const draft = await call(w, 'os/gmail/draft', { method: 'POST', body: { to: 'buyer@example.com', subject: 'Quote', text: 'Hello' } });
  check('a draft is saved to Gmail drafts, never sent', draft.res.body.ok === true && w.calls.some((c) => /\/users\/me\/drafts$/.test(c.url)) && !w.calls.some((c) => /messages\/send|drafts\/send/.test(c.url)));
  check('the module has no send endpoint at all', !/messages\/send|drafts\/send/.test(fs.readFileSync(path.join(root, 'api/ops/_os_google.js'), 'utf8')));

  const w403 = world();
  const realFetch = w403.fetchImpl;
  w403.fetchImpl = async (url, init) => (String(url).includes('/calendar/v3/') ? { ok: false, status: 403, json: async () => ({ error: { message: 'Calendar API has not been used' } }) } : realFetch(url, init));
  await call(w403, 'os/google/connect');
  w403.kv.set('lavaall-os-google-v1', w.kv.get('lavaall-os-google-v1'));
  const forbidden = await call(w403, 'os/calendar');
  check('a 403 from Google explains how to fix it, without echoing Google', forbidden.res.statusCode === 502 && /Google Calendar API is enabled/.test(forbidden.res.body.message) && !/has not been used/.test(forbidden.res.raw));

  const off = await call(w, 'os/google/disconnect', { method: 'POST' });
  check('disconnect revokes at Google and forgets the token', off.res.body.connected === false && !w.kv.has('lavaall-os-google-v1') && w.calls.some((c) => /oauth2\.googleapis\.com\/revoke/.test(c.url)));
  const leaks = [REFRESH, 'csecret-DO-NOT-PRINT'];
  check('no response ever carried a secret', [start, ok, st, cal, add, draft, off].every((r) => leaks.every((s) => !r.res.raw.includes(s))));

  // ---- client ----
  const win = {};
  const sandbox = { window: win, document: { querySelector: () => null, querySelectorAll: () => [], documentElement: { setAttribute() {}, getAttribute: () => 'dark' } }, location: { hash: '' }, navigator: {}, setTimeout: () => 0, setInterval: () => 0, Intl };
  vm.createContext(sandbox);
  ['core.js', 'google.js'].forEach((f) => vm.runInContext(fs.readFileSync(path.join(root, 'api/os/_client', f), 'utf8'), sandbox, { filename: f }));
  const OS = win.OS;
  OS.setGoogleStatus({ connected: false });
  check('not connected: a Connect Google link to the server route', /href="\/ops\/os\/google\/connect"/.test(OS.googlePanel()));
  OS.setGoogleStatus({ connected: true, email: '<img src=x onerror=alert(1)>' });
  check('connected: names the account, escaped, with Disconnect', !/<img src=x/.test(OS.googlePanel()) && /Disconnect/.test(OS.googlePanel()));
  OS.setCalendarEvents([{ title: '<script>x</script>', start: '2026-11-27T15:00:00Z', allDay: false, link: 'javascript:alert(1)' }]);
  const calHtml = OS.calendarBody();
  check('calendar events are escaped and unsafe links dropped', !/<script>x/.test(calHtml) && !/javascript:/.test(calHtml));
  check('Calendar is a section under Work', OS.sectionOf('calendar').group === 'Work');
  check('Home calendar card: connect prompt, escaped events, at most five', /Connect Google to see your calendar here/.test(OS.homeCalendarHtml(null, null, false))
    && !/<img/.test(OS.homeCalendarHtml([{ title: '<img src=x>', start: '2026-11-27T15:00:00Z' }]))
    && (OS.homeCalendarHtml(Array.from({ length: 9 }, () => ({ title: 'x', start: '2026-11-27T15:00:00Z' }))).match(/cal-row/g) || []).length === 5);

  const failed = results.filter((r) => !r.pass);
  results.forEach((r) => console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.name}`));
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
