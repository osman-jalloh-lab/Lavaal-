// Booking recovery must return its durable receipt without repeating side effects.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../scripts/booking-scheduler/booking-router.gs'), 'utf8');

function fixture({ email = 'qa@example.test', emailSucceeds = true } = {}) {
  const values = {
    'Scheduling Lead ID': 'SCH-TEST', 'Booking Token': 'test-token',
    'First Name': 'QA', 'Last Name': 'Scheduler', 'Email': email,
    'Preferred Contact Method': email ? 'email' : 'phone', 'Phone': '+23276000000',
    'Website Language': 'en', 'Reason for Call': 'general',
    'Booking Token Expiration': '2099-12-31T00:00:00Z', 'Booking Status': 'Registration Received',
  };
  const calls = { events: 0, emails: 0, released: 0 };
  const context = vm.createContext({ console });
  vm.runInContext(source, context);
  Object.assign(context, {
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() { calls.released++; } }) },
    Utilities: { formatDate: () => 'test time' },
    findLeadRow: (id, token) => id === 'SCH-TEST' && token === 'test-token' ? { rowIndex: 2, values } : null,
    jsonOut: body => body,
    isWithinBusinessHours: () => true,
    isFutureSlot: () => true,
    isSlotFree: () => true,
    createMeetEvent: () => { calls.events++; return { eventId: 'event-test', meetLink: '' }; },
    createPlainEvent: () => { calls.events++; return { eventId: 'event-test', meetLink: '' }; },
    updateRowStatusFields: (row, fields) => Object.assign(values, fields),
    updateAllRequestsStatus() {},
    safeSendEmail: to => {
      assert.equal(values['Booking Status'], 'Scheduled', 'receipt is saved before mail');
      assert.equal(values['Calendar Event ID'], 'event-test');
      calls.emails++;
      return to === email ? emailSucceeds : true;
    },
  });
  return { context, values, calls };
}

const request = { leadId: 'SCH-TEST', token: 'test-token', date: '2099-12-01', time: '10:00' };
{
  const { context, calls } = fixture({ emailSucceeds: false });
  const booked = context.handleBook(request);
  assert.equal(booked.ok, true);
  assert.equal(booked.emailSent, false);
  assert.equal(booked.meetLink, null);
  assert.equal(booked.start, '2099-12-01T10:00:00.000Z');
  const replay = context.handleBook(request);
  assert.equal(replay.ok, true);
  assert.equal(replay.replayed, true);
  assert.equal(replay.emailSent, false);
  assert.equal(calls.events, 1);
  assert.equal(calls.emails, 2, 'customer and team each attempted once');
  assert.equal(context.handleBook({ ...request, time: '11:00' }).error, 'already_scheduled');
  assert.equal(context.handleBook({ ...request, token: 'wrong' }).error, 'invalid_lead_or_token');
  assert.equal(calls.events, 1);
  const lookup = context.lookupLead('SCH-TEST', 'test-token');
  assert.equal(lookup.hasEmail, true);
  assert.equal(lookup.bookingStatus, 'Scheduled');
  assert.equal(lookup.emailSent, false);
  assert.equal(lookup.start, booked.start);
  assert.equal('email' in lookup, false);
  assert.equal('phone' in lookup, false);
  assert.equal('token' in lookup, false);
  assert.equal(context.lookupLead('SCH-TEST', 'wrong').error, 'invalid_lead_or_token');
}
{
  const { context } = fixture();
  assert.equal(context.handleBook(request).emailSent, true);
}
{
  const { context, calls } = fixture({ email: '' });
  assert.equal(context.handleBook(request).emailSent, null);
  assert.equal(calls.emails, 1, 'only the team gets mail for a phone-only booking');
}
{
  const { context, values, calls } = fixture();
  context.safeSendEmail = () => { throw new Error('interrupted after event checkpoint'); };
  assert.throws(() => context.handleBook(request), /interrupted/);
  assert.equal(values['Booking Status'], 'Scheduled');
  const replay = context.handleBook(request);
  assert.equal(replay.replayed, true);
  assert.equal(replay.emailSent, null, 'interrupted mail status remains unknown');
  assert.equal(calls.events, 1);
}
{
  const { context, values, calls } = fixture();
  Object.assign(values, {
    'Booking Status': 'Scheduled', 'Appointment Date': '2099-12-01',
    'Appointment Time': '10:00', 'Customer Notification Status': 'Sent',
  });
  assert.equal(context.handleBook(request).replayed, true, 'legacy scheduled rows also recover');
  assert.equal(calls.events, 0);
}

async function testProxy() {
  process.env.BOOKING_WEBHOOK_URL = 'https://example.test/scheduler';
  process.env.BOOKING_WEBHOOK_SECRET = 'test-secret';
  const originalFetch = global.fetch;
  const schedule = require('../api/schedule');
  let forwarded;
  global.fetch = async (url, options) => {
    forwarded = { url, body: JSON.parse(options.body) };
    return { ok: true, status: 200, json: async () => ({ ok: true, bookingStatus: 'Scheduled', emailSent: false }) };
  };
  const response = () => ({
    status(code) { this.code = code; return this; },
    setHeader() { return this; },
    send(body) { this.body = JSON.parse(body); return this; },
  });
  try {
    const res = response();
    await schedule({ method: 'POST', body: { action: 'lookup', leadId: 'SCH-TEST', token: 'test-token' } }, res);
    assert.equal(res.code, 200);
    assert.equal(res.body.emailSent, false);
    assert.equal(forwarded.url, 'https://example.test/scheduler');
    assert.deepEqual(forwarded.body, { action: 'lookup', leadId: 'SCH-TEST', token: 'test-token', secret: 'test-secret' });
    const missing = response();
    forwarded = null;
    await schedule({ method: 'POST', body: { action: 'lookup', leadId: 'SCH-TEST' } }, missing);
    assert.equal(missing.code, 400);
    assert.equal(forwarded, null);
  } finally {
    global.fetch = originalFetch;
  }
}

testProxy().then(() => console.log('PASS — booking receipt recovery, notification outcomes, and POST lookup')).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
