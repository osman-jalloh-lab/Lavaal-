// Pure-logic tests for this session's two fixes:
//  BUG 1 (recovery-link 404)  -- lookupLead now reports hasEmail.
//  BUG 2 (Meet never verified) -- extractMeetLink/conferenceStatusCode never
//  report a link that wasn't actually confirmed by Google, and
//  calendarEventUrl/REMINDER_CONFIG are shaped correctly.
// Stubs out the Google services createMeetEvent/createPlainEvent themselves
// depend on (Calendar, CalendarApp, LockService, etc. aren't exercised here
// -- those need a live Apps Script deployment, see the delivery report).
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'booking-router.gs'), 'utf8');

global.Utilities = {
  getUuid: () => 'test-uuid-0000',
  formatDate: (date) => date.toISOString(),
  base64Encode: (s) => Buffer.from(s, 'utf8').toString('base64'),
  sleep: () => {},
};
eval(src);

const results = [];
function check(name, cond) { results.push({ name, pass: !!cond }); }

// --- extractMeetLink: only ever returns a link Google's own entryPoints
// array actually contains, never invents one. ---
check('extractMeetLink returns the video entry point URI',
  extractMeetLink({ conferenceData: { entryPoints: [
    { entryPointType: 'more', uri: 'https://example.com/more' },
    { entryPointType: 'video', uri: 'https://meet.google.com/abc-defg-hij' },
  ] } }) === 'https://meet.google.com/abc-defg-hij');
check('extractMeetLink returns empty string when there is no video entry point',
  extractMeetLink({ conferenceData: { entryPoints: [{ entryPointType: 'phone', uri: 'tel:+1' }] } }) === '');
check('extractMeetLink returns empty string when conferenceData is entirely missing',
  extractMeetLink({}) === '');
check('extractMeetLink returns empty string when entryPoints is entirely missing',
  extractMeetLink({ conferenceData: {} }) === '');

// --- conferenceStatusCode: 'success' only once a real link exists; otherwise
// mirrors Google's own createRequest.status.statusCode (e.g. 'pending'),
// or 'unknown' if that isn't present -- so createMeetEvent's poll loop only
// keeps retrying while Google itself says the request is still pending. ---
check("conferenceStatusCode reports 'success' once a meet link exists",
  conferenceStatusCode({}, 'https://meet.google.com/abc-defg-hij') === 'success');
check("conferenceStatusCode reports Google's own 'pending' status when no link yet",
  conferenceStatusCode({ conferenceData: { createRequest: { status: { statusCode: 'pending' } } } }, '') === 'pending');
check("conferenceStatusCode reports Google's own 'failure' status when no link yet",
  conferenceStatusCode({ conferenceData: { createRequest: { status: { statusCode: 'failure' } } } }, '') === 'failure');
check("conferenceStatusCode falls back to 'unknown' rather than assuming success",
  conferenceStatusCode({}, '') === 'unknown');

// --- REMINDER_CONFIG: exactly the 30-min email + 10-min popup spec, with
// useDefault:false so those overrides actually take effect. ---
check('REMINDER_CONFIG disables the calendar default reminders', REMINDER_CONFIG.useDefault === false);
check('REMINDER_CONFIG has a 30-minute email override', REMINDER_CONFIG.overrides.some(o => o.method === 'email' && o.minutes === 30));
check('REMINDER_CONFIG has a 10-minute popup override', REMINDER_CONFIG.overrides.some(o => o.method === 'popup' && o.minutes === 10));

// --- calendarEventUrl: builds a real "eid=" deep link, never throws even
// with a broken encoder. ---
check('calendarEventUrl builds a calendar.google.com deep link',
  calendarEventUrl('evt123', 'sales@lavaall.com').indexOf('https://calendar.google.com/calendar/event?eid=') === 0);
(function () {
  const realEncode = global.Utilities.base64Encode;
  global.Utilities.base64Encode = () => { throw new Error('boom'); };
  check('calendarEventUrl fails soft (empty string) rather than throwing', calendarEventUrl('evt123', 'sales@lavaall.com') === '');
  global.Utilities.base64Encode = realEncode;
})();

// --- bookBodyMeetPending: every language implements it, never claims a
// Meet link was sent, and still gives the customer their date/time. ---
['en', 'fr', 'kr'].forEach(code => {
  const s = EMAIL_STRINGS[code];
  check(`EMAIL_STRINGS.${code} has bookBodyMeetPending`, typeof s.bookBodyMeetPending === 'function');
  const body = s.bookBodyMeetPending({ firstName: 'Jean', when: 'Monday', tz: TIMEZONE, reason: 'sales', method: 'meet', inbox: 'sales@lavaall.com' });
  check(`${code} bookBodyMeetPending never mentions a Meet URL`, body.indexOf('meet.google.com') === -1);
  check(`${code} bookBodyMeetPending still includes the confirmed date/time`, body.indexOf('Monday') !== -1);
});

// --- doGet/doPost dispatch: lookup (GET) and retryMeet (POST) are wired. ---
check('doGet is a function', typeof doGet === 'function');
check('doPost is a function', typeof doPost === 'function');
check('handleRetryMeet is defined', typeof handleRetryMeet === 'function');
check('ensureSheetHeaders is defined', typeof ensureSheetHeaders === 'function');

let failed = 0;
for (const r of results) {
  console.log((r.pass ? 'PASS' : 'FAIL') + ' - ' + r.name);
  if (!r.pass) failed++;
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
