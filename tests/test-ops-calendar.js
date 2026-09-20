// Ticket 07 — Manual calendar CRUD, overlap flags, internal attendees, optional Google.
const fs = require('fs');
const path = require('path');

const opsDir = path.join(__dirname, '../api/ops');
const lib = require(path.join(opsDir, '_lib.js'));
const store = require(path.join(opsDir, '_store.js'));
const calendar = require(path.join(opsDir, '_calendar.js'));
const ops = require(path.join(opsDir, 'index.js'));

const SECRET = 'test-ops-auth-secret-32chars!!';
const OSMAN = 'osmanjalloh104@gmail.com';
const ABDUL = 'abdulhbah55@gmail.com';
const SHARED_CAL = 'c_lavaall_shared@group.calendar.google.com';

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
  const email = extra && extra.email ? extra.email : OSMAN;
  return {
    method: extra && extra.method ? extra.method : 'GET',
    headers: {
      cookie: cookieFor(email),
      host: 'preview.example.test',
      accept: asJson ? 'application/json' : 'text/html',
      'content-type': asJson ? 'application/json' : 'text/html',
    },
    query: extra && extra.query ? extra.query : {},
    url: extra && extra.url ? extra.url : '/ops/calendar',
    body: extra && extra.body,
  };
}

function clearCalendarEnv() {
  delete process.env.OPS_GMAIL_CLIENT_ID;
  delete process.env.OPS_GMAIL_CLIENT_SECRET;
  delete process.env.OPS_GMAIL_REFRESH_TOKEN;
  delete process.env.OPS_GOOGLE_CALENDAR_REFRESH_TOKEN;
  delete process.env.OPS_GOOGLE_CALENDAR_ID;
}

function setCalendarEnv() {
  process.env.OPS_GMAIL_CLIENT_ID = 'client-id';
  process.env.OPS_GMAIL_CLIENT_SECRET = 'client-secret';
  process.env.OPS_GMAIL_REFRESH_TOKEN = 'refresh-token';
  process.env.OPS_GOOGLE_CALENDAR_ID = SHARED_CAL;
}

function installCalendarFetch() {
  const state = { posts: [], patches: [], lists: 0, bodies: [] };
  global.fetch = async (url, opts) => {
    const href = String(url);
    const method = String((opts && opts.method) || 'GET').toUpperCase();
    if (href.includes('oauth2.googleapis.com/token')) {
      return { ok: true, json: async () => ({ access_token: 'ya29.test-cal' }) };
    }
    if (href.includes('googleapis.com/calendar/v3/calendars/')) {
      if (href.includes('singleEvents=true')) {
        state.lists += 1;
        return {
          ok: true,
          json: async () => ({
            items: [{
              id: 'gcal-listed',
              summary: 'Shared standup',
              description: 'From Google',
              start: { dateTime: '2026-09-22T09:00:00+00:00', timeZone: 'Africa/Freetown' },
              end: { dateTime: '2026-09-22T09:30:00+00:00', timeZone: 'Africa/Freetown' },
              attendees: [
                { email: OSMAN },
                { email: 'buyer@example.com' },
              ],
            }],
          }),
        };
      }
      if (method === 'POST') {
        state.posts.push(href);
        state.bodies.push(JSON.parse(opts.body));
        return { ok: true, json: async () => ({ id: `gcal-${state.posts.length}` }) };
      }
      if (method === 'PATCH') {
        state.patches.push(href);
        state.bodies.push(JSON.parse(opts.body));
        return { ok: true, json: async () => ({ id: 'gcal-1' }) };
      }
    }
    return { ok: false, status: 404, json: async () => ({ error: href, method }) };
  };
  return state;
}

async function run() {
  const origFetch = global.fetch;
  process.env.OPS_AUTH_SECRET = SECRET;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  clearCalendarEnv();
  store.resetStore();

  {
    const html = mockRes();
    await ops(authed({ json: false, url: '/ops/calendar', query: { area: 'calendar' } }), html);
    const page = String(html.raw);
    check('calendar page is real and names the manual path',
      page.includes('Add an event') && page.includes('Google Calendar is not connected') && !page.includes('coming in ticket 07'));
    check('unconfigured calendar does not invent Google events',
      page.includes('No events yet') && !/Shared standup|Founder offsite #/.test(page));
    check('calendar HTML does not leak OAuth secrets',
      !/ya29\.|refresh-token|OPS_GMAIL_CLIENT_SECRET/.test(page));
  }

  {
    const first = await calendar.saveCalendarEvent({
      title: 'Morning planning',
      date: '2026-09-21',
      start: '09:00',
      end: '10:00',
      timezone: 'Africa/Freetown',
      attendees: OSMAN,
    }, { createdBy: OSMAN });
    const second = await calendar.saveCalendarEvent({
      title: 'Catalog review',
      date: '2026-09-21',
      start: '09:30',
      end: '11:00',
      timezone: 'Africa/Freetown',
      attendees: ABDUL,
    }, { createdBy: ABDUL });
    const allDay = await calendar.saveCalendarEvent({
      title: 'Shipping holiday',
      date: '2026-09-21',
      allDay: '1',
    }, { createdBy: OSMAN });
    const data = await store.readStore();
    const listed = store.listEvents(data);
    const timed = listed.filter((row) => !row.allDay);
    check('manual create keeps two overlapping timed events and one all-day',
      first.ok && second.ok && allDay.ok && listed.length === 3 && allDay.event.allDay === true);
    check('timed overlaps are flagged; all-day is not',
      timed.length === 2 && timed.every((row) => row.overlaps === true) && listed.some((row) => row.allDay && row.overlaps === false));
    check('events persist in the store after a later read',
      data.events.some((row) => row.title === 'Morning planning') && data.events.some((row) => row.title === 'Shipping holiday'));
  }

  {
    const page = mockRes();
    await ops(authed({ json: false, url: '/ops/calendar', query: { area: 'calendar' } }), page);
    const html = String(page.raw);
    check('agenda refresh shows saved titles and an overlap warning',
      html.includes('Morning planning') && html.includes('Catalog review') && html.includes('Shipping holiday') && html.includes('Overlaps'));
  }

  {
    const data = await store.readStore();
    const morning = data.events.find((row) => row.title === 'Morning planning');
    const renamed = await calendar.saveCalendarEvent({
      id: morning.id,
      title: 'Morning planning (moved)',
      date: '2026-09-21',
      start: '13:00',
      end: '14:00',
      timezone: 'Africa/Freetown',
    });
    const afterMove = store.listEvents(await store.readStore());
    check('edit updates title/time and clears the overlap once ranges no longer collide',
      renamed.ok && renamed.event.title === 'Morning planning (moved)' && afterMove.filter((row) => row.overlaps).length === 0);
    const removed = await calendar.removeCalendarEvent(renamed.event.id);
    const leftover = (await store.readStore()).events;
    check('delete removes the event from the agenda',
      removed.ok && leftover.every((row) => row.id !== renamed.event.id) && leftover.length === 2);
  }

  {
    const blocked = await calendar.saveCalendarEvent({
      title: 'Customer walkthrough',
      date: '2026-09-23',
      start: '10:00',
      end: '11:00',
      attendees: 'buyer@example.com',
    }, { createdBy: OSMAN });
    check('external customer attendee is rejected',
      blocked.error === 'external_attendee' && blocked.blocked.includes('buyer@example.com'));
    const allowed = await calendar.saveCalendarEvent({
      title: 'Internal huddle',
      date: '2026-09-23',
      start: '10:00',
      end: '11:00',
      attendees: `${OSMAN}, ${ABDUL}, ops@lavaall.com`,
    }, { createdBy: OSMAN });
    check('allowlisted founders and @lavaall.com attendees are accepted',
      allowed.ok && allowed.event.attendees.includes(OSMAN) && allowed.event.attendees.includes('ops@lavaall.com'));
    const viaOps = mockRes();
    await ops(authed({
      json: true,
      method: 'POST',
      url: '/ops/calendar',
      query: { area: 'calendar' },
      body: {
        action: 'save-event',
        title: 'Quote call',
        date: '2026-09-24',
        start: '15:00',
        end: '16:00',
        attendees: 'customer@example.com',
      },
    }), viaOps);
    check('ops POST also blocks external invites', viaOps.statusCode === 400 && viaOps.body.error === 'external_attendee');
  }

  {
    const gmail = installCalendarFetch();
    const saved = await calendar.saveCalendarEvent({
      title: 'Local only',
      date: '2026-09-25',
      start: '08:00',
      end: '09:00',
    }, { createdBy: OSMAN });
    check('unconfigured Google path saves locally and does not call Calendar API',
      saved.ok && saved.google === false && gmail.posts.length === 0 && gmail.lists === 0);
    const refreshed = await calendar.refreshGoogleAgenda();
    check('refresh while unconfigured does not invent Google events',
      refreshed.ok && refreshed.google === false && (await store.readStore()).events.every((row) => row.title !== 'Shared standup'));
    global.fetch = origFetch;
  }

  {
    process.env.OPS_GOOGLE_CALENDAR_ID = 'primary';
    check('primary calendar id is treated as not connected',
      calendar.calendarId() === '' && calendar.describeCalendarSetup().googleConnected === false);
    clearCalendarEnv();
  }

  {
    setCalendarEnv();
    const gmail = installCalendarFetch();
    const created = await calendar.saveCalendarEvent({
      title: 'Shared planning',
      date: '2026-09-26',
      start: '11:00',
      end: '12:00',
      attendees: `${OSMAN}, ops@lavaall.com`,
    }, { createdBy: OSMAN });
    check('configured Google create POSTs to the shared calendar, not primary',
      created.ok && created.google === true && created.event.googleEventId === 'gcal-1'
      && gmail.posts.length === 1
      && gmail.posts[0].includes(encodeURIComponent(SHARED_CAL))
      && !gmail.posts[0].includes('/calendars/primary/')
      && gmail.posts[0].includes('sendUpdates=none'));
    check('Google create payload has only internal attendees',
      gmail.bodies[0].attendees.map((row) => row.email).join(',') === `${OSMAN},ops@lavaall.com`
      && !JSON.stringify(gmail.bodies[0]).includes('example.com'));
    const updated = await calendar.saveCalendarEvent({
      id: created.event.id,
      title: 'Shared planning (updated)',
      date: '2026-09-26',
      start: '11:00',
      end: '12:30',
      attendees: OSMAN,
    });
    check('later edit PATCHes the existing Google event instead of creating a second one',
      updated.ok && gmail.posts.length === 1 && gmail.patches.length === 1);
    const pulled = await calendar.refreshGoogleAgenda();
    const data = await store.readStore();
    check('Google refresh upserts the shared event and drops external attendees',
      pulled.ok && pulled.google === true
      && data.events.some((row) => row.googleEventId === 'gcal-listed' && row.title === 'Shared standup')
      && data.events.filter((row) => row.googleEventId === 'gcal-listed')[0].attendees.every((email) => calendar.isInternalAttendee(email)));
    global.fetch = origFetch;
    clearCalendarEnv();
  }

  {
    const home = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
    check('public catalog is still ungated', home.includes('Enterprise IT Hardware') && !home.includes('href="/ops"'));
  }

  {
    const gated = mockRes();
    await ops({ method: 'GET', headers: {}, query: { area: 'calendar' }, url: '/ops/calendar' }, gated);
    check('calendar still requires a session', gated.statusCode === 401 && String(gated.raw).includes('Email me a sign-in link'));
  }

  global.fetch = origFetch;
  clearCalendarEnv();
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
