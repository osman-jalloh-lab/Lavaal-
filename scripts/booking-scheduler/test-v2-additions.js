// Tests for the new (v2) pure-logic additions: sanitizeForSheet, lang(),
// and internal consistency of the reason/department/email-string maps.
const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, 'booking-router.gs'), 'utf8');
eval(src);

const results = [];
function check(name, cond) { results.push({ name, pass: !!cond }); }

// --- sanitizeForSheet: formula-injection neutralization ---
check("sanitizeForSheet neutralizes '='", sanitizeForSheet('=1+1') === "'=1+1");
check("sanitizeForSheet neutralizes '+'", sanitizeForSheet('+1+1') === "'+1+1");
check("sanitizeForSheet neutralizes '-'", sanitizeForSheet('-1+1') === "'-1+1");
check("sanitizeForSheet neutralizes '@'", sanitizeForSheet('@SUM(1)') === "'@SUM(1)");
check('sanitizeForSheet leaves normal text alone', sanitizeForSheet('Jean Kamara') === 'Jean Kamara');
check('sanitizeForSheet handles null/undefined as empty string', sanitizeForSheet(null) === '' && sanitizeForSheet(undefined) === '');
check('sanitizeForSheet does not double-escape a leading quote-safe string', sanitizeForSheet("O'Brien") === "O'Brien");

// --- lang(): unknown codes fall back to English, never throw ---
check("lang('en') stays en", lang('en') === 'en');
check("lang('fr') stays fr", lang('fr') === 'fr');
check("lang('kr') stays kr", lang('kr') === 'kr');
check("lang('xx') falls back to en", lang('xx') === 'en');
check('lang(undefined) falls back to en', lang(undefined) === 'en');

// --- EMAIL_STRINGS: all 3 languages implement the full template set ---
['en', 'fr', 'kr'].forEach(code => {
  const s = EMAIL_STRINGS[code];
  check(`EMAIL_STRINGS.${code} has all 4 templates`,
    s && typeof s.regSubject === 'string' && typeof s.regBody === 'function' &&
    typeof s.bookSubject === 'function' && typeof s.bookBody === 'function');
});
// Spot-check the templates actually render without throwing and contain the placeholder data.
['en', 'fr', 'kr'].forEach(code => {
  const s = EMAIL_STRINGS[code];
  const reg = s.regBody({ firstName: 'Jean', reason: 'sales', link: 'https://x/y', expiry: 'Sept 7' });
  check(`${code} regBody includes the booking link`, reg.indexOf('https://x/y') !== -1);
  const book = s.bookBody({ firstName: 'Jean', when: 'Monday', tz: TIMEZONE, reason: 'sales', method: 'meet', meet: 'https://meet.google.com/abc', inbox: 'sales@lavaall.com' });
  check(`${code} bookBody includes the Meet link when provided`, book.indexOf('https://meet.google.com/abc') !== -1);
  const bookNoMeet = s.bookBody({ firstName: 'Jean', when: 'Monday', tz: TIMEZONE, reason: 'sales', method: 'phone', meet: '', inbox: 'sales@lavaall.com' });
  check(`${code} bookBody omits Meet line when no link given`, bookNoMeet.indexOf('Meet:') === -1 && bookNoMeet.indexOf('Meet :') === -1 && bookNoMeet.indexOf('Meet: ') === -1);
});

// --- REASON_DEPARTMENT -> DEPARTMENT_INBOX consistency: every department
// a reason can map to must have a real inbox configured. ---
const usedDepts = Array.from(new Set(Object.values(REASON_DEPARTMENT)));
check('Every REASON_DEPARTMENT value has a configured inbox',
  usedDepts.every(d => typeof DEPARTMENT_INBOX[d] === 'string' && DEPARTMENT_INBOX[d].indexOf('@lavaall.com') !== -1));

// --- Sheet header sets are non-empty and internally consistent ---
check('ALL_REQUESTS_HEADERS has 24 columns per spec', ALL_REQUESTS_HEADERS().length === 24);
check('SCHEDULING_HEADERS has the 34 spec columns + 5 recovery/Meet-status columns + internal Booking Token', SCHEDULING_HEADERS().length === 40);
check('SCHEDULING_HEADERS includes Booking Token for token lookup', SCHEDULING_HEADERS().indexOf('Booking Token') !== -1);
check('SCHEDULING_HEADERS includes the new Meet/recovery tracking columns', ['Calendar Event URL', 'Meet Status', 'Reminder Status', 'Last Error', 'Last Updated'].every(h => SCHEDULING_HEADERS().indexOf(h) !== -1));
check('SHEET_DEFS covers all 9 required worksheets', SHEET_DEFS.length === 9 &&
  ['All Requests', 'Scheduling Leads', 'Call Bookings', 'Sales & Quotes', 'Customer Support', 'Orders', 'Partnerships', 'General Inquiries', 'System Errors']
    .every(name => SHEET_DEFS.some(d => d.name === name)));

let failed = 0;
for (const r of results) {
  console.log((r.pass ? 'PASS' : 'FAIL') + ' - ' + r.name);
  if (!r.pass) failed++;
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
