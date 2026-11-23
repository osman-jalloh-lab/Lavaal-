'use strict';
// Exercise the actual widget methods with controlled responses and no network.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
const widgetSource = html.slice(html.indexOf('class ScheduleModal {'), html.indexOf('\nconst SCHED_STRINGS ='));
const stringsSource = html.slice(html.indexOf('const SCHED_STRINGS ='), html.indexOf('\nfunction formatSlotLabel'));
let calendarBlob;
const elements = new Map();
const makeElement = () => ({ hidden: false, textContent: '', children: [],
  appendChild(child) { this.children.push(child); },
  addEventListener() {},
  set innerHTML(value) { this.children = []; },
});
const context = vm.createContext({
  console, Date, Blob, URL: { createObjectURL: blob => { calendarBlob = blob; return 'blob:test-calendar'; }, revokeObjectURL() {} }, currentLang: 'en', translations: { en: {} },
  document: { getElementById: id => {
    if (!elements.has(id)) elements.set(id, makeElement());
    return elements.get(id);
  }, createElement: makeElement },
  formatSlotLabel: time => time,
});
vm.runInContext(widgetSource + '\n' + stringsSource + '\nthis.Widget = ScheduleModal;', context);
const widget = () => Object.assign(Object.create(context.Widget.prototype), {
  availabilityRequest: 0, dateInput: { value: '2026-12-01' },
  slotsEl: makeElement(), emptyEl: makeElement(), loadingEl: makeElement(),
  errors: [], showStep2Error(message) { this.errors.push(message); },
});
const response = slots => ({ ok: true, json: async () => ({ ok: true, slots }) });
async function run() {
  const pending = [];
  context.fetch = () => new Promise((resolve, reject) => pending.push({ resolve, reject }));
  const w = widget();
  const first = w.loadAvailability();
  w.dateInput.value = '2026-12-02';
  const second = w.loadAvailability();
  pending[1].resolve(response(['2026-12-02T10:00:00Z']));
  await second;
  pending[0].resolve(response(['2026-12-01T09:00:00Z']));
  await first;
  assert.deepEqual(w.slotsEl.children.map(b => b.textContent), ['10:00']);
  assert.equal(w.errors.length, 0);

  const staleFailure = w.loadAvailability();
  w.dateInput.value = '2026-12-03';
  const latest = w.loadAvailability();
  pending[2].reject(new Error('old request failed'));
  await staleFailure;
  assert.equal(w.loadingEl.hidden, false);
  assert.equal(w.errors.length, 0);
  pending[3].resolve(response([]));
  await latest;
  assert.equal(w.emptyEl.hidden, false);

  // Closing or leaving date selection invalidates an outstanding response.
  const closedRequest = w.loadAvailability();
  w.availabilityRequest++;
  pending[4].resolve(response(['2026-12-03T11:00:00Z']));
  await closedRequest;
  assert.equal(w.slotsEl.children.length, 0);

  const c = widget();
  c.lead = { leadId: 'SCH-QA', firstName: 'QA', method: 'email', wantsMeet: true, hasEmail: true };
  c.confirmDetail = makeElement();
  c.showStep = () => {};
  for (const emailSent of [undefined, false, true]) {
    c.showConfirmation('2026-12-01', '10:00', { emailSent });
    assert.equal(elements.get('sched-confirm-email-note').hidden, emailSent !== true);
    assert.equal(elements.get('sched-confirm-save-note').hidden, emailSent === true);
    assert.match(c.confirmDetail.textContent, /details are unavailable/);
    assert.equal(elements.get('sched-calendar-download').hidden, true);
  }
  c.showConfirmation('2026-12-01', '10:00', {
    start: '2026-12-01T10:00:00Z', end: '2026-12-01T10:30:00Z',
    meetLink: 'https://meet.google.com/test-call', emailSent: false,
  });
  const calendar = elements.get('sched-calendar-download');
  assert.equal(calendar.hidden, false);
  const ics = await calendarBlob.text();
  assert.match(ics, /DTSTART:20261201T100000Z/);
  assert.match(ics, /DTEND:20261201T103000Z/);
  assert.match(ics, /DESCRIPTION:https:\/\/meet.google.com\/test-call/);
  assert.match(c.confirmDetail.textContent, /https:\/\/meet.google.com\/test-call/);


  // Recovery resumes the validated lead and can recover a completed booking.
  const r = widget();
  r.open = () => {};
  r.regSubmitBtn = {};
  r.showStep1Error = message => { throw new Error(message); };
  r.enterStep2 = () => { r.resumed = true; };
  let sent;
  context.fetch = async (url, opts) => {
    sent = JSON.parse(opts.body);
    return { ok: true, json: async () => ({ ok: true, firstName: 'QA', preferredContactMethod: 'email' }) };
  };
  await r.recover('SCH-QA', 'test-token');
  assert.equal(sent.action, 'lookup');
  assert.equal(sent.token, 'test-token');
  assert.equal(r.resumed, true);
  context.fetch = async () => ({ ok: true, json: async () => ({
    ok: true, bookingStatus: 'Scheduled', start: '2026-12-01T10:00:00Z',
  }) });
  r.showConfirmation = (date, time) => { r.confirmed = [date, time]; };
  await r.recover('SCH-QA', 'test-token');
  assert.deepEqual(r.confirmed, ['2026-12-01', '10:00']);

  // Run the actual startup callback for a tokenized scheduling URL.
  const initStart = html.indexOf("document.addEventListener('DOMContentLoaded', function() {\n  // Build ticker");
  const initEnd = html.indexOf('\n});', initStart) + 4;
  let startup;
  const init = vm.createContext({
    document: { addEventListener: (event, fn) => { startup = fn; } },
    buildTicker() {}, InquiryFormHandler: function() {}, URLSearchParams,
    setLang: lang => { init.language = lang; },
    location: { pathname: '/schedule', search: '?leadId=SCH-QA&token=secret&lang=fr' },
    history: { replaceState: (state, title, url) => { init.cleanedUrl = url; } },
    window: { openScheduleModal: () => { init.opened = true; } },
    scheduleModalInstance: { recover: (leadId, token) => { init.recovery = [leadId, token]; } },
  });
  vm.runInContext(html.slice(initStart, initEnd), init);
  startup();
  assert.equal(init.opened, true);
  assert.equal(init.language, 'fr');
  assert.equal(init.cleanedUrl, '/schedule');
  assert.deepEqual(init.recovery, ['SCH-QA', 'secret']);
  console.log('PASS scheduling widget: response ordering, stale errors, confirmation, calendar export, recovery, direct entry');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
