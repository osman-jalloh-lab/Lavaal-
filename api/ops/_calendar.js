// Ticket 07 — Manual agenda + optional shared Google Calendar sync.
// Internal attendees only. Never writes Osman's primary calendar.
// Underscore prefix: not a Vercel function. No npm.

const { ALLOWLIST } = require('./_lib');
const { refreshGmailAccessToken } = require('./_gmail');
const {
  addEvent,
  deleteEvent,
  listEvents,
  readStore,
  updateEvent,
} = require('./_store');

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const INTERNAL_DOMAINS = Object.freeze(['lavaall.com']);

function calendarId() {
  const raw = typeof process.env.OPS_GOOGLE_CALENDAR_ID === 'string'
    ? process.env.OPS_GOOGLE_CALENDAR_ID.trim()
    : '';
  // Never fall back to Osman's primary calendar.
  if (!raw || raw.toLowerCase() === 'primary') return '';
  return raw;
}

function calendarRefreshToken() {
  return process.env.OPS_GOOGLE_CALENDAR_REFRESH_TOKEN || process.env.OPS_GMAIL_REFRESH_TOKEN || '';
}

function calendarOAuthConfigured() {
  return Boolean(
    process.env.OPS_GMAIL_CLIENT_ID
    && process.env.OPS_GMAIL_CLIENT_SECRET
    && (process.env.OPS_GOOGLE_CALENDAR_REFRESH_TOKEN || process.env.OPS_GMAIL_REFRESH_TOKEN)
  );
}

function calendarGoogleConfigured() {
  return calendarOAuthConfigured() && Boolean(calendarId());
}

function describeCalendarSetup() {
  return {
    googleConnected: calendarGoogleConfigured(),
    calendarIdSet: Boolean(calendarId()),
    oauthSet: calendarOAuthConfigured(),
  };
}

function isInternalAttendee(email) {
  const value = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!value) return false;
  if (ALLOWLIST.includes(value)) return true;
  return INTERNAL_DOMAINS.some((domain) => value.endsWith(`@${domain}`));
}

function normalizeAttendeeList(value) {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[\s,]+/)
      : [];
  return raw.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean);
}

function guardAttendees(value) {
  const attendees = normalizeAttendeeList(value);
  const blocked = attendees.filter((email) => !isInternalAttendee(email));
  if (blocked.length) return { error: 'external_attendee', blocked };
  return { attendees };
}

function addOneDay(isoDate) {
  const parts = String(isoDate || '').split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return isoDate;
  const utc = Date.UTC(parts[0], parts[1] - 1, parts[2] + 1);
  return new Date(utc).toISOString().slice(0, 10);
}

async function calendarRequest(path, { method, body } = {}) {
  const previous = process.env.OPS_GMAIL_REFRESH_TOKEN;
  process.env.OPS_GMAIL_REFRESH_TOKEN = calendarRefreshToken();
  try {
    const accessToken = await refreshGmailAccessToken();
    return await fetch(`${CALENDAR_API}/${path.replace(/^\//, '')}`, {
      method: method || 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } finally {
    if (previous == null) delete process.env.OPS_GMAIL_REFRESH_TOKEN;
    else process.env.OPS_GMAIL_REFRESH_TOKEN = previous;
  }
}

function toGoogleEvent(event) {
  const attendees = (event.attendees || []).filter(isInternalAttendee).map((email) => ({ email }));
  const payload = {
    summary: event.title,
    description: event.notes || '',
    attendees,
  };
  if (event.allDay) {
    payload.start = { date: event.date };
    payload.end = { date: addOneDay(event.date) };
  } else {
    payload.start = { dateTime: `${event.date}T${event.start || '09:00'}:00`, timeZone: event.timezone };
    payload.end = { dateTime: `${event.date}T${event.end || '10:00'}:00`, timeZone: event.timezone };
  }
  return payload;
}

function calendarEventsPath(eventId) {
  const id = encodeURIComponent(calendarId());
  const suffix = eventId ? `/${encodeURIComponent(eventId)}` : '';
  return `calendars/${id}/events${suffix}?sendUpdates=none`;
}

async function createGoogleEvent(event) {
  const response = await calendarRequest(calendarEventsPath(), {
    method: 'POST',
    body: toGoogleEvent(event),
  });
  if (!response.ok) throw new Error('calendar_create_failed');
  const payload = await response.json();
  return { id: payload && payload.id ? String(payload.id) : '' };
}

async function patchGoogleEvent(event) {
  const response = await calendarRequest(calendarEventsPath(event.googleEventId), {
    method: 'PATCH',
    body: toGoogleEvent(event),
  });
  if (!response.ok) throw new Error('calendar_patch_failed');
  const payload = await response.json();
  return { id: payload && payload.id ? String(payload.id) : event.googleEventId };
}

async function upsertGoogleEvent(event) {
  if (event.googleEventId) return patchGoogleEvent(event);
  return createGoogleEvent(event);
}

async function listGoogleEvents() {
  const id = encodeURIComponent(calendarId());
  const response = await calendarRequest(`calendars/${id}/events?singleEvents=true&orderBy=startTime&maxResults=40`);
  if (!response.ok) throw new Error('calendar_list_failed');
  const payload = await response.json();
  return Array.isArray(payload.items) ? payload.items : [];
}

async function saveCalendarEvent(fields, { createdBy } = {}) {
  const guarded = guardAttendees(fields && fields.attendees);
  if (guarded.error) return guarded;
  const saved = fields && fields.id
    ? await updateEvent(fields.id, Object.assign({}, fields, { attendees: guarded.attendees }))
    : await addEvent(Object.assign({}, fields, { attendees: guarded.attendees, createdBy }));
  if (saved.error) return saved;
  if (!calendarGoogleConfigured()) {
    return Object.assign({ google: false }, saved);
  }
  try {
    const remote = await upsertGoogleEvent(saved.event);
    if (remote.id && remote.id !== saved.event.googleEventId) {
      const linked = await updateEvent(saved.event.id, { googleEventId: remote.id });
      return Object.assign({ google: true }, linked);
    }
    return Object.assign({ google: true }, saved);
  } catch {
    return Object.assign({ google: false, warning: 'calendar_reconnect' }, saved);
  }
}

async function removeCalendarEvent(id) {
  return deleteEvent(id);
}

async function refreshGoogleAgenda() {
  if (!calendarGoogleConfigured()) {
    return { ok: true, google: false, setup: describeCalendarSetup() };
  }
  try {
    const items = await listGoogleEvents();
    for (const item of items) {
      const start = item.start || {};
      const end = item.end || {};
      const allDay = Boolean(start.date);
      const date = start.date || String(start.dateTime || '').slice(0, 10);
      const attendees = Array.isArray(item.attendees)
        ? item.attendees.map((row) => row.email).filter(isInternalAttendee)
        : [];
      const storeData = await readStore();
      const existing = (storeData.events || []).find((row) => row.googleEventId === item.id);
      const fields = {
        title: item.summary || '(untitled)',
        date,
        allDay,
        start: allDay ? '' : String(start.dateTime || '').slice(11, 16),
        end: allDay ? '' : String(end.dateTime || '').slice(11, 16),
        timezone: start.timeZone || 'Africa/Freetown',
        attendees,
        notes: item.description || '',
        googleEventId: item.id,
      };
      if (existing) await updateEvent(existing.id, fields);
      else await addEvent(fields);
    }
    return { ok: true, google: true, count: items.length, setup: describeCalendarSetup() };
  } catch {
    return { error: 'calendar_reconnect', setup: describeCalendarSetup() };
  }
}

function calendarPayload(storeData) {
  return {
    setup: describeCalendarSetup(),
    events: listEvents(storeData),
  };
}

module.exports = {
  calendarGoogleConfigured,
  calendarId,
  calendarPayload,
  describeCalendarSetup,
  guardAttendees,
  isInternalAttendee,
  refreshGoogleAgenda,
  removeCalendarEvent,
  saveCalendarEvent,
};
