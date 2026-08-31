/**
 * LAVAALL "Schedule a Call" booking backend — Google Apps Script Web App.
 *
 * WHY THIS EXISTS
 * Backs the site's two-step scheduler: Step 1 registers the customer's
 * details and hands back a secure token (so Step 2 unlocks immediately,
 * no waiting on email); Step 2 books a real Google Calendar slot against
 * that lead. Runs under the same Workspace account already proven out for
 * scripts/email-router/contact-router.gs — no separate Google Cloud
 * project, no OAuth consent screen beyond the one Apps Script deployment
 * itself asks for.
 *
 * ENDPOINTS
 * GET  ?action=availability&date=YYYY-MM-DD
 *     Real open slots for that date (business hours, existing events, lead
 *     time, and booking window all enforced) -- unchanged from the first
 *     version of this file, still covered by the same unit tests.
 * GET  ?action=lookup&token=...&leadId=...
 *     Returns the lead's own registration info (name, reason, call method,
 *     language) so a customer following the emailed backup link doesn't
 *     have to retype anything. Never returns the spreadsheet ID, calendar
 *     ID, or any other lead's data.
 * POST { action:'register', secret, ... }
 *     Step 1. Validates + sanitizes, writes a "Registration Received" row,
 *     emails the internal team, emails the customer a backup booking link,
 *     and returns a token immediately -- the front end does NOT need to
 *     wait for that email before opening Step 2.
 * POST { action:'book', secret, leadId, token, date, time, ... }
 *     Step 2. Validates the token against the lead, locks, re-checks the
 *     slot is still free, creates the Calendar event (with a Google Meet
 *     link if requested), UPDATES the same lead row to "Scheduled" rather
 *     than creating a new one, and sends the real confirmation emails.
 *
 * ONE-TIME SETUP
 * 1. New Apps Script project ("LAVAALL Booking Scheduler"), paste this file.
 * 2. Script Properties (Project Settings):
 *      BOOKING_CALENDAR_ID    = target calendar ID, or "primary"
 *      BOOKING_WEBHOOK_SECRET = long random value (same value goes into
 *                               Vercel's BOOKING_WEBHOOK_SECRET)
 * 3. To offer Google Meet as a call method: Editor -> Services (+) ->
 *    add "Google Calendar API" (the ADVANCED service, not just CalendarApp,
 *    which is already built in). This is a one-time click only you can do
 *    inside your own script.google.com project -- see createMeetEvent()
 *    below for exactly what breaks without it (nothing breaks; it just
 *    quietly falls back to a plain event with no Meet link, and says so
 *    in the response).
 * 4. Deploy -> New deployment -> "Web app" -> Execute as "Me" -> Who has
 *    access "Anyone". Copy the URL into Vercel as BOOKING_WEBHOOK_URL.
 * 5. First real request (register or availability) auto-creates the
 *    "LAVAALL Customer Requests" spreadsheet under this account the first
 *    time it's needed, and reuses it (by name, then by its cached Script
 *    Property) on every request after -- never creates a second one.
 * 6. Book one real test slot end-to-end before calling this done.
 */

var TIMEZONE = 'Africa/Freetown'; // GMT, no DST
var BUSINESS_DAYS = [1, 2, 3, 4, 5]; // Mon-Fri (0=Sun ... 6=Sat)
var BUSINESS_START_HOUR = 9;  // 9am
var BUSINESS_END_HOUR = 17;   // 5pm
var SLOT_DURATION_MINUTES = 30;
var BOOKING_WINDOW_DAYS = 21; // don't offer/accept bookings further out than this
var TOKEN_EXPIRY_DAYS = 7;
var RATE_LIMIT_SECONDS = 30; // per email, mirrors the Vercel-layer per-IP limit

var SPREADSHEET_NAME = 'LAVAALL Customer Requests';

// Department -> inbox that gets internal notifications.
var DEPARTMENT_INBOX = {
  sales: 'sales@lavaall.com',
  support: 'support@lavaall.com',
  orders: 'orders@lavaall.com',
  general: 'info@lavaall.com',
  partnership: 'contact@lavaall.com',
};

// "Reason for call" -> department, used to route Step 1 registrations.
var REASON_DEPARTMENT = {
  sales: 'sales', quotation: 'sales', availability: 'sales', procurement: 'sales',
  routers: 'sales', servers: 'sales', computers: 'sales', fiber: 'sales', cabling: 'sales',
  support: 'support', technical: 'support', order: 'orders',
  partnership: 'partnership', general: 'general', other: 'general',
};

// Minimal localized strings for the two customer-facing emails this script
// sends. Mirrors the site's en/fr/kr language codes; falls back to English
// for anything unrecognized rather than failing the request.
var EMAIL_STRINGS = {
  en: {
    regSubject: 'Complete Your LAVAALL Call Booking',
    regBody: function (d) {
      return 'Hello ' + d.firstName + ',\n\nThank you for contacting LAVAALL. We received your request to speak with our ' + d.reason + ' team.\n\nChoose an available time using the secure link below:\n' + d.link + '\n\nThis link expires on ' + d.expiry + '.\n\nIf you have already scheduled your call, no further action is needed.\n\nLAVAALL\nEnterprise IT Hardware & Solutions';
    },
    bookSubject: function (d) { return 'Your LAVAALL call is booked — ' + d.when; },
    bookBody: function (d) {
      return 'Hi ' + d.firstName + ',\n\nYour call with LAVAALL is confirmed.\n\nDate/time: ' + d.when + ' (' + d.tz + ')\nReason: ' + d.reason + '\nCall method: ' + d.method + (d.meet ? '\nGoogle Meet: ' + d.meet : '') + '\n\nA calendar invite has also been sent to this email — use it to reschedule or cancel if your plans change.\n\nQuestions? ' + d.inbox + '\n\nLAVAALL\nEnterprise IT Hardware & Solutions';
    },
  },
  fr: {
    regSubject: 'Terminez la Réservation de Votre Appel LAVAALL',
    regBody: function (d) {
      return 'Bonjour ' + d.firstName + ',\n\nMerci d’avoir contacté LAVAALL. Nous avons reçu votre demande de contact avec notre équipe ' + d.reason + '.\n\nChoisissez un horaire disponible via le lien sécurisé ci-dessous :\n' + d.link + '\n\nCe lien expire le ' + d.expiry + '.\n\nSi vous avez déjà planifié votre appel, aucune action supplémentaire n’est requise.\n\nLAVAALL\nMatériel Informatique Entreprise & Solutions';
    },
    bookSubject: function (d) { return 'Votre appel LAVAALL est réservé — ' + d.when; },
    bookBody: function (d) {
      return 'Bonjour ' + d.firstName + ',\n\nVotre appel avec LAVAALL est confirmé.\n\nDate/heure : ' + d.when + ' (' + d.tz + ')\nMotif : ' + d.reason + '\nMéthode d’appel : ' + d.method + (d.meet ? '\nGoogle Meet : ' + d.meet : '') + '\n\nUne invitation calendrier a également été envoyée à cette adresse — utilisez-la pour reporter ou annuler si vos plans changent.\n\nQuestions ? ' + d.inbox + '\n\nLAVAALL\nMatériel Informatique Entreprise & Solutions';
    },
  },
  kr: {
    regSubject: 'Kɔmplit Yu LAVAALL Kɔl Buking',
    regBody: function (d) {
      return 'Ɛlo ' + d.firstName + ',\n\nTɛnki fɔ kɔntakt LAVAALL. Wi risiv yu rikwɛst fɔ tɔk wit wi ' + d.reason + ' tim.\n\nPik wan tem we de open, yuz di sekyua link dɔng below:\n' + d.link + '\n\nDis link go ɛkspaya na ' + d.expiry + '.\n\nIf yu dɔn buk yu kɔl already, yu nɔ nid du ɛnitin ɛls.\n\nLAVAALL\nEnterprise IT Hardwɛ & Solushan';
    },
    bookSubject: function (d) { return 'Yu LAVAALL kɔl dɔn buk — ' + d.when; },
    bookBody: function (d) {
      return 'Ɛlo ' + d.firstName + ',\n\nYu kɔl wit LAVAALL dɔn kɔnfɔm.\n\nDet/tem: ' + d.when + ' (' + d.tz + ')\nRisin: ' + d.reason + '\nKɔl mɛtɔd: ' + d.method + (d.meet ? '\nGoogle Meet: ' + d.meet : '') + '\n\nWi dɔn sɛn wan kalɛnda invayt to dis imel tu — yuz am fɔ chenj ɔ kansul if yu plan chenj.\n\nKwɛstyɔn? ' + d.inbox + '\n\nLAVAALL\nEnterprise IT Hardwɛ & Solushan';
    },
  },
};
function lang(code) { return EMAIL_STRINGS[code] ? code : 'en'; }

function doGet(e) {
  try {
    var action = e.parameter.action;
    if (action === 'availability') {
      var dateStr = String(e.parameter.date || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return jsonOut({ error: 'invalid_date' }, 400);
      return jsonOut({ ok: true, date: dateStr, timezone: TIMEZONE, slots: getAvailableSlots(dateStr) });
    }
    if (action === 'lookup') {
      return lookupLead(String(e.parameter.leadId || ''), String(e.parameter.token || ''));
    }
    return jsonOut({ error: 'unknown_action' }, 400);
  } catch (err) {
    logError('doGet', err);
    return jsonOut({ error: 'server_error' }, 500);
  }
}

function doPost(e) {
  var payload;
  try {
    payload = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOut({ error: 'invalid_json' }, 400);
  }
  try {
    var secret = PropertiesService.getScriptProperties().getProperty('BOOKING_WEBHOOK_SECRET');
    if (secret && payload.secret !== secret) return jsonOut({ error: 'forbidden' }, 403);

    if (payload.action === 'register') return handleRegister(payload);
    if (payload.action === 'book') return handleBook(payload);
    return jsonOut({ error: 'unknown_action' }, 400);
  } catch (err) {
    logError('doPost:' + payload.action, err);
    return jsonOut({ error: 'server_error' }, 500);
  }
}

// ============================================================================
// STEP 1 — REGISTER
// ============================================================================
function handleRegister(payload) {
  var required = ['firstName', 'lastName', 'email', 'phone', 'country', 'reason', 'preferredCallMethod'];
  for (var i = 0; i < required.length; i++) {
    if (!payload[required[i]]) return jsonOut({ error: 'missing_field', field: required[i] }, 400);
  }
  if (!payload.consent) return jsonOut({ error: 'consent_required' }, 400);

  if (isRateLimited('reg_' + String(payload.email).toLowerCase())) {
    return jsonOut({ error: 'rate_limited', message: 'Please wait a moment before trying again.' }, 429);
  }

  var langCode = lang(payload.language);
  var dept = REASON_DEPARTMENT[String(payload.reason).toLowerCase()] || 'general';
  var inbox = DEPARTMENT_INBOX[dept];

  var leadId = 'SCH-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
  var token = Utilities.getUuid();
  var now = new Date();
  var expiry = new Date(now.getTime() + TOKEN_EXPIRY_DAYS * 86400000);

  var fullName = payload.firstName + ' ' + payload.lastName;
  var row = {
    'Scheduling Lead ID': leadId,
    'Registration Date': Utilities.formatDate(now, TIMEZONE, 'yyyy-MM-dd'),
    'Registration Time': Utilities.formatDate(now, TIMEZONE, 'HH:mm'),
    'Customer Timezone': payload.customerTimezone || TIMEZONE,
    'Website Language': langCode,
    'First Name': payload.firstName,
    'Last Name': payload.lastName,
    'Email': payload.email,
    'Phone': payload.phone,
    'Country': payload.country,
    'Reason for Call': payload.reason,
    'Preferred Call Method': payload.preferredCallMethod,
    'Customer Note': payload.note || '',
    'Verification Status': 'Not Verified',
    'Booking Status': 'Registration Received',
    'Appointment Date': '', 'Appointment Time': '', 'Appointment Timezone': '',
    'Calendar Event ID': '', 'Google Meet Link': '',
    'Assigned Team': inbox,
    'Booking Token Expiration': expiry.toISOString(),
    'Customer Notification Status': 'Pending', 'Internal Notification Status': 'Pending',
    'Cancellation Status': '', 'Rescheduling Status': '',
    'Internal Notes': '', 'Booking Token': token,
  };

  var sheetRowIndex = appendRow('Scheduling Leads', SCHEDULING_HEADERS(), row);
  appendRow('All Requests', ALL_REQUESTS_HEADERS(), {
    'Request ID': leadId, 'Submitted Date': row['Registration Date'], 'Submitted Time': row['Registration Time'],
    'Customer Timezone': row['Customer Timezone'], 'Website Language': langCode, 'Request Type': 'Schedule a Call',
    'First Name': payload.firstName, 'Last Name': payload.lastName, 'Full Name': fullName,
    'Email': payload.email, 'Phone': payload.phone, 'Company': '', 'Country': payload.country,
    'Inquiry Category': payload.reason, 'Product or Service': '', 'Subject': 'Call request: ' + payload.reason,
    'Message': payload.note || '', 'Preferred Response Method': payload.preferredCallMethod,
    'Assigned Team': inbox, 'Status': 'Registration Received', 'Source Page': payload.sourcePage || 'lavaall.com',
    'Consent Recorded': 'Yes', 'Notification Status': 'Pending', 'Internal Notes': '',
  });

  var backupLink = (payload.bookingBaseUrl || 'https://www.lavaall.com/schedule') +
    '?leadId=' + encodeURIComponent(leadId) + '&token=' + encodeURIComponent(token) + '&lang=' + langCode;
  var strings = EMAIL_STRINGS[langCode];

  var custNotifyOk = safeSendEmail(payload.email, strings.regSubject,
    strings.regBody({ firstName: payload.firstName, reason: payload.reason, link: backupLink, expiry: Utilities.formatDate(expiry, TIMEZONE, 'MMMM d, yyyy') }));
  var teamNotifyOk = safeSendEmail(inbox, 'New scheduling registration: ' + fullName,
    'A new call registration was received.\n\nName: ' + fullName + '\nEmail: ' + payload.email + '\nPhone: ' + payload.phone +
    '\nReason: ' + payload.reason + '\nPreferred method: ' + payload.preferredCallMethod + '\nNote: ' + (payload.note || '(none)') +
    '\n\nThey have NOT booked a time yet. Lead ID: ' + leadId, { replyTo: payload.email });

  updateRowStatusFields(sheetRowIndex, {
    'Customer Notification Status': custNotifyOk ? 'Sent' : 'Failed',
    'Internal Notification Status': teamNotifyOk ? 'Sent' : 'Failed',
  });

  return jsonOut({ ok: true, leadId: leadId, token: token, tokenExpiration: expiry.toISOString(), timezone: TIMEZONE });
}

// ============================================================================
// STEP 2 — BOOK
// ============================================================================
function handleBook(payload) {
  var required = ['leadId', 'token', 'date', 'time'];
  for (var i = 0; i < required.length; i++) {
    if (!payload[required[i]]) return jsonOut({ error: 'missing_field', field: required[i] }, 400);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.date) || !/^\d{2}:\d{2}$/.test(payload.time)) {
    return jsonOut({ error: 'invalid_date_or_time' }, 400);
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var lead = findLeadRow(payload.leadId, payload.token);
    if (!lead) return jsonOut({ error: 'invalid_lead_or_token' }, 404);
    if (lead.values['Booking Status'] === 'Scheduled') return jsonOut({ error: 'already_scheduled' }, 409);
    if (new Date(lead.values['Booking Token Expiration']).getTime() < Date.now()) {
      updateRowStatusFields(lead.rowIndex, { 'Booking Status': 'Expired' });
      return jsonOut({ error: 'token_expired' }, 410);
    }

    var start = parseSlot(payload.date, payload.time);
    var end = new Date(start.getTime() + SLOT_DURATION_MINUTES * 60000);
    if (!isWithinBusinessHours(start) || !isFutureSlot(start)) return jsonOut({ error: 'slot_not_bookable' }, 409);
    if (!isSlotFree(start, end)) return jsonOut({ error: 'slot_taken', message: 'That time was just taken -- please pick another.' }, 409);

    var langCode = lang(lead.values['Website Language']);
    var dept = REASON_DEPARTMENT[String(lead.values['Reason for Call']).toLowerCase()] || 'general';
    var inbox = DEPARTMENT_INBOX[dept];
    var fullName = lead.values['First Name'] + ' ' + lead.values['Last Name'];
    var wantsMeet = String(lead.values['Preferred Call Method']).toLowerCase().indexOf('meet') !== -1;

    var descLines = [
      'Booked via lavaall.com scheduling widget. Lead ID: ' + lead.values['Scheduling Lead ID'],
      'Name: ' + fullName, 'Email: ' + lead.values['Email'], 'Phone: ' + lead.values['Phone'],
      'Reason: ' + lead.values['Reason for Call'], 'Call method: ' + lead.values['Preferred Call Method'],
      'Note: ' + (lead.values['Customer Note'] || '(none)'),
    ];
    if (!wantsMeet) descLines.push('', 'TELEPHONE CALLBACK -- call ' + lead.values['Phone'] + ' at the scheduled time.');

    var title = 'LAVAALL call: ' + fullName + ' (' + lead.values['Reason for Call'] + ')';
    var created = wantsMeet
      ? createMeetEvent(title, start, end, descLines.join('\n'), lead.values['Email'])
      : createPlainEvent(title, start, end, descLines.join('\n'), lead.values['Email']);

    var whenStr = Utilities.formatDate(start, TIMEZONE, "EEEE, MMMM d, yyyy 'at' h:mm a") + ' (' + TIMEZONE + ')';
    var strings = EMAIL_STRINGS[langCode];

    var custOk = safeSendEmail(lead.values['Email'], strings.bookSubject({ when: whenStr }),
      strings.bookBody({ firstName: lead.values['First Name'], when: whenStr, tz: TIMEZONE, reason: lead.values['Reason for Call'], method: lead.values['Preferred Call Method'], meet: created.meetLink, inbox: inbox }));
    var teamOk = safeSendEmail(inbox, 'New call booked: ' + fullName + ' — ' + whenStr,
      'A call was booked.\n\nWhen: ' + whenStr + '\n' + descLines.join('\n'), { replyTo: lead.values['Email'] });

    updateRowStatusFields(lead.rowIndex, {
      'Booking Status': 'Scheduled',
      'Appointment Date': payload.date, 'Appointment Time': payload.time, 'Appointment Timezone': TIMEZONE,
      'Calendar Event ID': created.eventId, 'Google Meet Link': created.meetLink || '',
      'Customer Notification Status': custOk ? 'Sent' : 'Failed',
      'Internal Notification Status': teamOk ? 'Sent' : 'Failed',
    });
    updateAllRequestsStatus(lead.values['Scheduling Lead ID'], 'Scheduled');

    return jsonOut({ ok: true, start: start.toISOString(), end: end.toISOString(), timezone: TIMEZONE, meetLink: created.meetLink || null });
  } finally {
    lock.releaseLock();
  }
}

function lookupLead(leadId, token) {
  var lead = findLeadRow(leadId, token);
  if (!lead) return jsonOut({ error: 'invalid_lead_or_token' }, 404);
  if (new Date(lead.values['Booking Token Expiration']).getTime() < Date.now()) return jsonOut({ error: 'token_expired' }, 410);
  return jsonOut({
    ok: true,
    firstName: lead.values['First Name'], lastName: lead.values['Last Name'],
    reason: lead.values['Reason for Call'], preferredCallMethod: lead.values['Preferred Call Method'],
    language: lead.values['Website Language'], bookingStatus: lead.values['Booking Status'],
  });
  // Deliberately omits: email/phone (rendered again by the customer's own
  // browser session, not re-served), spreadsheet ID, calendar ID, everything
  // else about any *other* lead.
}

// ============================================================================
// GOOGLE MEET (Advanced Calendar Service)
// ============================================================================
function createMeetEvent(title, start, end, description, guestEmail) {
  try {
    var calendarId = calendarIdForAdvancedApi();
    var event = Calendar.Events.insert({
      summary: title, description: description,
      start: { dateTime: start.toISOString(), timeZone: TIMEZONE },
      end: { dateTime: end.toISOString(), timeZone: TIMEZONE },
      attendees: [{ email: guestEmail }],
      conferenceData: { createRequest: { requestId: Utilities.getUuid(), conferenceSolutionKey: { type: 'hangoutsMeet' } } },
      guestsCanModify: true,
    }, calendarId, { conferenceDataVersion: 1, sendUpdates: 'all' });
    var meetLink = '';
    if (event.conferenceData && event.conferenceData.entryPoints) {
      for (var i = 0; i < event.conferenceData.entryPoints.length; i++) {
        if (event.conferenceData.entryPoints[i].entryPointType === 'video') meetLink = event.conferenceData.entryPoints[i].uri;
      }
    }
    return { eventId: event.id, meetLink: meetLink };
  } catch (err) {
    // The Advanced Calendar Service isn't enabled yet for this project, or
    // Meet creation failed for some other reason. Fail *open* to a plain
    // event rather than losing the booking entirely -- logged so it's
    // visible, not silent.
    logError('createMeetEvent (falling back to plain event)', err);
    return createPlainEvent(title, start, end, description + '\n\n(Google Meet link could not be created -- see System Errors sheet.)', guestEmail);
  }
}

function createPlainEvent(title, start, end, description, guestEmail) {
  var calendar = getCalendar();
  var event = calendar.createEvent(title, start, end, { description: description, guests: guestEmail, sendInvite: true });
  event.setGuestsCanModify(true);
  return { eventId: event.getId(), meetLink: '' };
}

function calendarIdForAdvancedApi() {
  var id = PropertiesService.getScriptProperties().getProperty('BOOKING_CALENDAR_ID') || 'primary';
  return id === 'primary' ? Session.getActiveUser().getEmail() : id;
}

function getCalendar() {
  var id = PropertiesService.getScriptProperties().getProperty('BOOKING_CALENDAR_ID') || 'primary';
  return id === 'primary' ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(id);
}

// ============================================================================
// SLOT MATH -- unchanged from the first version of this file, same behavior,
// still covered by scripts/booking-scheduler's unit tests.
// ============================================================================
function parseSlot(dateStr, timeStr) {
  return new Date(dateStr + 'T' + timeStr + ':00Z');
}
function isWithinBusinessHours(date) {
  var day = date.getUTCDay();
  var hour = date.getUTCHours();
  var isBusinessDay = BUSINESS_DAYS.indexOf(day) !== -1;
  var afterOpen = hour >= BUSINESS_START_HOUR;
  var beforeClose = hour < BUSINESS_END_HOUR;
  return isBusinessDay && afterOpen && beforeClose;
}
function isFutureSlot(date) {
  var now = new Date();
  var maxDate = new Date(now.getTime() + BOOKING_WINDOW_DAYS * 86400000);
  return date.getTime() > now.getTime() + 30 * 60000 && date.getTime() < maxDate.getTime();
}
function isSlotFree(start, end) {
  return getCalendar().getEvents(start, end).length === 0;
}
function getAvailableSlots(dateStr) {
  var calendar = getCalendar();
  var dayStart = parseSlot(dateStr, '00:00');
  var dayEnd = new Date(dayStart.getTime() + 24 * 3600000);
  var busy = calendar.getEvents(dayStart, dayEnd);
  var slots = [];
  var cursor = parseSlot(dateStr, pad2(BUSINESS_START_HOUR) + ':00');
  var closeTime = parseSlot(dateStr, pad2(BUSINESS_END_HOUR) + ':00');
  while (cursor.getTime() + SLOT_DURATION_MINUTES * 60000 <= closeTime.getTime()) {
    var slotEnd = new Date(cursor.getTime() + SLOT_DURATION_MINUTES * 60000);
    if (isWithinBusinessHours(cursor) && isFutureSlot(cursor) && !overlapsAny(cursor, slotEnd, busy)) {
      slots.push({ start: cursor.toISOString(), end: slotEnd.toISOString() });
    }
    cursor = new Date(cursor.getTime() + SLOT_DURATION_MINUTES * 60000);
  }
  return slots;
}
function overlapsAny(start, end, events) {
  for (var i = 0; i < events.length; i++) {
    if (start < events[i].getEndTime() && end > events[i].getStartTime()) return true;
  }
  return false;
}
function pad2(n) { return (n < 10 ? '0' : '') + n; }

// ============================================================================
// SHEETS -- created once, reused forever; formula-injection-safe writes.
// ============================================================================
function ALL_REQUESTS_HEADERS() {
  return ['Request ID', 'Submitted Date', 'Submitted Time', 'Customer Timezone', 'Website Language', 'Request Type',
    'First Name', 'Last Name', 'Full Name', 'Email', 'Phone', 'Company', 'Country', 'Inquiry Category',
    'Product or Service', 'Subject', 'Message', 'Preferred Response Method', 'Assigned Team', 'Status',
    'Source Page', 'Consent Recorded', 'Notification Status', 'Internal Notes'];
}
function SCHEDULING_HEADERS() {
  return ['Scheduling Lead ID', 'Registration Date', 'Registration Time', 'Customer Timezone', 'Website Language',
    'First Name', 'Last Name', 'Email', 'Phone', 'Country', 'Reason for Call', 'Preferred Call Method',
    'Customer Note', 'Verification Status', 'Booking Status', 'Appointment Date', 'Appointment Time',
    'Appointment Timezone', 'Calendar Event ID', 'Google Meet Link', 'Assigned Team', 'Booking Token Expiration',
    'Customer Notification Status', 'Internal Notification Status', 'Cancellation Status', 'Rescheduling Status',
    'Internal Notes', 'Booking Token']; // Booking Token: internal-only, never returned except to its own owner via lookup
}
function ERROR_HEADERS() { return ['Timestamp', 'Function', 'Message', 'Context']; }

var SHEET_DEFS = [
  { name: 'All Requests', headers: ALL_REQUESTS_HEADERS },
  { name: 'Scheduling Leads', headers: SCHEDULING_HEADERS },
  { name: 'Call Bookings', headers: SCHEDULING_HEADERS },
  { name: 'Sales & Quotes', headers: ALL_REQUESTS_HEADERS },
  { name: 'Customer Support', headers: ALL_REQUESTS_HEADERS },
  { name: 'Orders', headers: ALL_REQUESTS_HEADERS },
  { name: 'Partnerships', headers: ALL_REQUESTS_HEADERS },
  { name: 'General Inquiries', headers: ALL_REQUESTS_HEADERS },
  { name: 'System Errors', headers: ERROR_HEADERS },
];

function getOrCreateSpreadsheet() {
  var props = PropertiesService.getScriptProperties();
  var cachedId = props.getProperty('SPREADSHEET_ID');
  if (cachedId) {
    try { return SpreadsheetApp.openById(cachedId); } catch (e) { /* fall through and re-resolve below */ }
  }

  var files = DriveApp.getFilesByName(SPREADSHEET_NAME);
  var ss;
  if (files.hasNext()) {
    ss = SpreadsheetApp.open(files.next());
  } else {
    ss = SpreadsheetApp.create(SPREADSHEET_NAME);
    var defaultSheet = ss.getSheets()[0];
    for (var i = 0; i < SHEET_DEFS.length; i++) {
      var def = SHEET_DEFS[i];
      var sheet = i === 0 ? defaultSheet.setName(def.name) : ss.insertSheet(def.name);
      var headers = def.headers();
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, headers.length).createFilter();
      sheet.getRange(2, 1, Math.max(sheet.getMaxRows() - 1, 1), headers.length).setWrap(true);
      var protection = sheet.getRange(1, 1, 1, headers.length).protect().setDescription('Header row -- do not edit');
      protection.setWarningOnly(true);
    }
  }
  props.setProperty('SPREADSHEET_ID', ss.getId());
  return ss;
}

function sanitizeForSheet(value) {
  var s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@]/.test(s)) return "'" + s; // neutralize spreadsheet-formula injection
  return s;
}

function appendRow(sheetName, headers, rowObject) {
  var ss = getOrCreateSpreadsheet();
  var sheet = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var row = headers.map(function (h) { return sanitizeForSheet(rowObject[h]); });
    sheet.appendRow(row);
    return sheet.getLastRow();
  } finally {
    lock.releaseLock();
  }
}

function updateRowStatusFields(rowIndex, fields) {
  var ss = getOrCreateSpreadsheet();
  var sheet = ss.getSheetByName('Scheduling Leads');
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  Object.keys(fields).forEach(function (key) {
    var col = headers.indexOf(key) + 1;
    if (col > 0) sheet.getRange(rowIndex, col).setValue(sanitizeForSheet(fields[key]));
  });
}

function updateAllRequestsStatus(requestId, status) {
  var ss = getOrCreateSpreadsheet();
  var sheet = ss.getSheetByName('All Requests');
  var data = sheet.getDataRange().getValues();
  var idCol = data[0].indexOf('Request ID');
  var statusCol = data[0].indexOf('Status');
  for (var r = 1; r < data.length; r++) {
    if (data[r][idCol] === requestId) { sheet.getRange(r + 1, statusCol + 1).setValue(status); return; }
  }
}

function findLeadRow(leadId, token) {
  var ss = getOrCreateSpreadsheet();
  var sheet = ss.getSheetByName('Scheduling Leads');
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var idCol = headers.indexOf('Scheduling Lead ID');
  var tokenCol = headers.indexOf('Booking Token');
  for (var r = 1; r < data.length; r++) {
    if (data[r][idCol] === leadId && data[r][tokenCol] === token) {
      var values = {};
      headers.forEach(function (h, i) { values[h] = data[r][i]; });
      return { rowIndex: r + 1, values: values };
    }
  }
  return null;
}

// ============================================================================
// RATE LIMITING, ERROR LOGGING, EMAIL, JSON
// ============================================================================
function isRateLimited(key) {
  var cache = CacheService.getScriptCache();
  if (cache.get(key)) return true;
  cache.put(key, '1', RATE_LIMIT_SECONDS);
  return false;
}

function safeSendEmail(to, subject, body, options) {
  try {
    GmailApp.sendEmail(to, subject, body, Object.assign({ name: 'LAVAALL Website' }, options || {}));
    return true;
  } catch (err) {
    logError('safeSendEmail:' + to, err);
    return false;
  }
}

function logError(where, err) {
  try {
    appendRow('System Errors', ERROR_HEADERS(), {
      'Timestamp': new Date().toISOString(), 'Function': where, 'Message': String(err), 'Context': '',
    });
  } catch (e) { /* logging must never throw and break the actual request */ }
}

function jsonOut(obj, code) {
  var out = ContentService.createTextOutput(JSON.stringify(obj));
  out.setMimeType(ContentService.MimeType.JSON);
  return out;
}
