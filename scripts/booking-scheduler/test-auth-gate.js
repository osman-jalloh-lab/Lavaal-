// Regression test for booking-router.gs's shared-secret check (SECURITY-AUDIT.md
// finding M3): a Script Property that is unset must REJECT requests, not
// silently accept them. Only stubs what doPost touches before the auth gate
// and before dispatching to handleRegister/handleBook, so we never need to
// simulate SpreadsheetApp/CalendarApp/GmailApp for this test's purpose.
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'booking-router.gs'), 'utf8');

const results = [];
function check(name, cond, detail) { results.push({ name, pass: !!cond, detail }); }

function run(secretPropertyValue, payload) {
  global.PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (name) => (name === 'BOOKING_WEBHOOK_SECRET' ? secretPropertyValue : null),
    }),
  };
  global.ContentService = {
    MimeType: { JSON: 'JSON' },
    createTextOutput: (text) => ({ _text: text, setMimeType() { return this; } }),
  };
  global.Utilities = { formatDate: (d) => d.toISOString() };
  eval(src);
  const e = { postData: { contents: JSON.stringify(payload) } };
  const out = doPost(e);
  return JSON.parse(out._text);
}

// 1. Secret Script Property unset (null) + attacker sends NO secret at all.
//    Old buggy code (`secret && payload.secret !== secret`) skipped the check
//    entirely here and would have dispatched straight to handleRegister.
{
  const res = run(null, { action: 'register', firstName: 'Eve', reason: 'general', consent: true });
  check('unset secret + no payload.secret -> rejected (forbidden)', res.error === 'forbidden', JSON.stringify(res));
}

// 2. Secret Script Property unset (empty string) + attacker guesses a secret.
{
  const res = run('', { action: 'book', secret: 'guessed', leadId: 'x', token: 'y' });
  check('empty-string secret + any payload.secret -> rejected (forbidden)', res.error === 'forbidden', JSON.stringify(res));
}

// 3. Secret configured, wrong secret supplied -> rejected.
{
  const res = run('real-secret-value', { action: 'register', secret: 'wrong', firstName: 'Eve', reason: 'general', consent: true });
  check('configured secret + wrong payload.secret -> rejected (forbidden)', res.error === 'forbidden', JSON.stringify(res));
}

// 4. Secret configured, correct secret supplied -> gate passes (proven by
//    reaching action dispatch past the gate: an unrecognized action gets its
//    own distinct error, never reachable without first clearing the gate).
{
  const res = run('real-secret-value', { action: 'not-a-real-action', secret: 'real-secret-value' });
  check('configured secret + correct payload.secret -> passes gate (reaches action dispatch)', res.error === 'unknown_action', JSON.stringify(res));
}

let failed = 0;
for (const r of results) {
  console.log((r.pass ? 'PASS' : 'FAIL') + ' - ' + r.name + (r.pass ? '' : ` (${r.detail})`));
  if (!r.pass) failed++;
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
