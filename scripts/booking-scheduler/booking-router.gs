/**
 * LAVAALL "Schedule a Quick Call" booking backend — Google Apps Script Web App.
 *
 * WHY THIS EXISTS
 * The website's scheduling widget calls this script to (a) ask which time
 * slots are actually free on a given day, and (b) book a real slot. It
 * reuses the same support@lavaall.com Google Workspace account already
 * proven out for the contact-form router (scripts/email-router/contact-router.gs)
 * — no Google Cloud project, no OAuth consent screen, no paid API. It uses
 * Google's built-in CalendarApp and GmailApp services, running under
 * whichever Workspace account you deploy this as.
 *
 * WHAT IT DOES
 * - GET  ?action=availability&date=YYYY-MM-DD
 *     Returns the open slots for that date, respecting BUSINESS_HOURS,
 *     SLOT_DURATION_MINUTES, and whatever's already on the target calendar
 *     (so it can never offer a time that's already booked).
 * - POST { action:'book', secret, name, email, phone, department, reason,
 *          date, time, notes, contactMethod }
 *     Re-checks the slot is still free (a lock prevents a race between two
 *     people booking the same slot at once), creates the calendar event
 *     with the customer added as a guest (Google automatically emails them
 *     a real calendar invite with native reschedule/cancel actions built
 *     into Google Calendar — no custom reschedule UI needed), sends a
 *     plain-text confirmation email restating the details, and notifies
 *     the right LAVAALL team inbox.
 *
 * ONE-TIME SETUP (same pattern as contact-router.gs)
 * 1. In the same Apps Script project as contact-router.gs (or a new one,
 *    your call), add this file as a second .gs file — Apps Script Web Apps
 *    can only have ONE set of doGet/doPost per deployment, so if you keep
 *    it in the same project, rename this file's functions or deploy it as
 *    its own separate project. Simplest: make this its own new Apps Script
 *    project ("LAVAALL Booking Scheduler"), deployed separately, with its
 *    own Web App URL.
 * 2. Create (or pick) the Google Calendar you want bookings to land on.
 *    Its Calendar ID is in Google Calendar -> Settings -> that calendar ->
 *    "Integrate calendar" -> Calendar ID. The account's own primary
 *    calendar works too — use "primary" in that case.
 * 3. Project Settings -> Script Properties, add:
 *      BOOKING_CALENDAR_ID       = the calendar ID from step 2 (or "primary")
 *      BOOKING_WEBHOOK_SECRET    = a long random value (put the same value
 *                                  in Vercel as BOOKING_WEBHOOK_SECRET)
 * 4. Deploy -> New deployment -> "Web app" -> Execute as "Me" -> Who has
 *    access "Anyone". Copy the deployment URL.
 * 5. In Vercel: add BOOKING_WEBHOOK_URL and BOOKING_WEBHOOK_SECRET env
 *    vars with those values, redeploy.
 * 6. Book one real test slot from the live site and confirm: the event
 *    appears on the calendar, the customer gets a Google Calendar invite
 *    email, the customer gets the plain confirmation email, and the right
 *    LAVAALL team inbox gets the internal notification — before calling
 *    this done.
 */

var TIMEZONE = 'Africa/Freetown'; // GMT, no DST
var BUSINESS_DAYS = [1, 2, 3, 4, 5]; // Mon-Fri (0=Sun ... 6=Sat)
var BUSINESS_START_HOUR = 9;  // 9am
var BUSINESS_END_HOUR = 17;   // 5pm
var SLOT_DURATION_MINUTES = 30;
var BOOKING_WINDOW_DAYS = 21; // don't offer/accept bookings further out than this

// Department -> inbox that gets the internal "you have a call booked" notice.
var DEPARTMENT_INBOX = {
  sales: 'sales@lavaall.com',
  support: 'support@lavaall.com',
  orders: 'orders@lavaall.com',
  general: 'info@lavaall.com',
  partnership: 'contact@lavaall.com',
};

function doGet(e) {
  try {
    var action = e.parameter.action;
    if (action === 'availability') {
      var dateStr = String(e.parameter.date || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return jsonOut({ error: 'invalid_date' }, 400);
      }
      return jsonOut({ ok: true, date: dateStr, timezone: TIMEZONE, slots: getAvailableSlots(dateStr) });
    }
    return jsonOut({ error: 'unknown_action' }, 400);
  } catch (err) {
    return jsonOut({ error: 'server_error', message: String(err) }, 500);
  }
}

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var secret = PropertiesService.getScriptProperties().getProperty('BOOKING_WEBHOOK_SECRET');
    if (secret && payload.secret !== secret) {
      return jsonOut({ error: 'forbidden' }, 403);
    }

    var required = ['name', 'email', 'date', 'time', 'department'];
    for (var i = 0; i < required.length; i++) {
      if (!payload[required[i]]) return jsonOut({ error: 'missing_field', field: required[i] }, 400);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.date) || !/^\d{2}:\d{2}$/.test(payload.time)) {
      return jsonOut({ error: 'invalid_date_or_time' }, 400);
    }

    var lock = LockService.getScriptLock();
    lock.waitLock(15000); // up to 15s -- prevents two people booking the same slot at once
    try {
      var start = parseSlot(payload.date, payload.time);
      var end = new Date(start.getTime() + SLOT_DURATION_MINUTES * 60000);

      if (!isWithinBusinessHours(start) || !isFutureSlot(start)) {
        return jsonOut({ error: 'slot_not_bookable' }, 409);
      }
      if (!isSlotFree(start, end)) {
        return jsonOut({ error: 'slot_taken' }, 409);
      }

      var dept = String(payload.department || 'general').toLowerCase();
      var inbox = DEPARTMENT_INBOX[dept] || DEPARTMENT_INBOX.general;

      var title = 'LAVAALL call: ' + payload.name + ' (' + (payload.reason || dept) + ')';
      var descLines = [
        'Booked via lavaall.com scheduling widget.',
        '',
        'Name: ' + payload.name,
        'Email: ' + payload.email,
        'Phone / WhatsApp: ' + (payload.phone || '(not provided)'),
        'Department: ' + dept,
        'Reason: ' + (payload.reason || ''),
        'Preferred contact method: ' + (payload.contactMethod || ''),
        'Notes: ' + (payload.notes || '(none)'),
      ];

      var calendar = getCalendar();
      var event = calendar.createEvent(title, start, end, {
        description: descLines.join('\n'),
        guests: payload.email,
        sendInvite: true,
      });
      event.setGuestsCanModify(true); // lets the customer propose a new time / cancel from the Calendar invite itself

      var whenStr = Utilities.formatDate(start, TIMEZONE, "EEEE, MMMM d, yyyy 'at' h:mm a") + ' (' + TIMEZONE + ')';

      GmailApp.sendEmail(payload.email,
        'Your LAVAALL call is booked — ' + whenStr,
        [
          'Hi ' + payload.name + ',',
          '',
          'Your call with LAVAALL is confirmed for ' + whenStr + '.',
          'Department: ' + dept,
          'Contact method: ' + (payload.contactMethod || 'to be confirmed'),
          '',
          'A calendar invite has also been sent to this email — use it to reschedule or cancel if your plans change.',
          '',
          'Talk soon,',
          'LAVAALL',
        ].join('\n'),
        { name: 'LAVAALL Website' }
      );

      GmailApp.sendEmail(inbox,
        'New call booked: ' + payload.name + ' — ' + whenStr,
        [
          'A new call was booked through the website scheduler.',
          '',
          'When: ' + whenStr,
          descLines.slice(2).join('\n'),
        ].join('\n'),
        { replyTo: payload.email, name: 'LAVAALL Website' }
      );

      return jsonOut({ ok: true, start: start.toISOString(), end: end.toISOString(), timezone: TIMEZONE });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return jsonOut({ error: 'server_error', message: String(err) }, 500);
  }
}

function getCalendar() {
  var id = PropertiesService.getScriptProperties().getProperty('BOOKING_CALENDAR_ID') || 'primary';
  return id === 'primary' ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(id);
}

// Africa/Freetown (Sierra Leone) is UTC+0 year-round with no DST, so a UTC
// instant and Freetown wall-clock time are always the same numbers. That
// lets us parse/compare slot times directly against UTC getters below
// instead of pulling in a general timezone-conversion routine.
function parseSlot(dateStr, timeStr) {
  return new Date(dateStr + 'T' + timeStr + ':00Z');
}

function isWithinBusinessHours(date) {
  var day = date.getUTCDay(); // 0=Sun..6=Sat, matches BUSINESS_DAYS below
  var hour = date.getUTCHours();
  var isBusinessDay = BUSINESS_DAYS.indexOf(day) !== -1;
  var afterOpen = hour >= BUSINESS_START_HOUR;
  var beforeClose = hour < BUSINESS_END_HOUR;
  return isBusinessDay && afterOpen && beforeClose;
}

function isFutureSlot(date) {
  var now = new Date();
  var maxDate = new Date(now.getTime() + BOOKING_WINDOW_DAYS * 86400000);
  return date.getTime() > now.getTime() + 30 * 60000 && date.getTime() < maxDate.getTime(); // at least 30min lead time
}

function isSlotFree(start, end) {
  var events = getCalendar().getEvents(start, end);
  return events.length === 0;
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
    var evStart = events[i].getStartTime();
    var evEnd = events[i].getEndTime();
    if (start < evEnd && end > evStart) return true;
  }
  return false;
}

function pad2(n) { return (n < 10 ? '0' : '') + n; }

function jsonOut(obj, code) {
  var out = ContentService.createTextOutput(JSON.stringify(obj));
  out.setMimeType(ContentService.MimeType.JSON);
  return out;
}
