// Runs the actual .gs action with local Apps Script service stubs. No network.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, 'booking-router.gs'), 'utf8');
let total = 0;
function check(name, fn) {
  fn();
  total++;
  console.log('PASS - ' + name);
}
function setup(properties = { CHAT_HANDOFF_WEBHOOK_SECRET: 'unit-chat-secret', BOOKING_WEBHOOK_SECRET: 'unit-booking-secret' }) {
  const emails = [], rows = [];
  const sheet = { appendRow: row => rows.push(row), getLastRow: () => rows.length + 1 };
  const context = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => properties[key] || '' }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: text => ({ text, setMimeType() {} }) },
    Utilities: { getUuid: () => 'unit-request-id', formatDate: (date, zone, format) => `${zone}:${format}` },
    GmailApp: { sendEmail: (...args) => emails.push(args) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  context.getOrCreateSpreadsheet = () => ({ getSheetByName: name => {
    assert.equal(name, 'All Requests');
    return sheet;
  } });
  const post = payload => JSON.parse(context.doPost({ postData: { contents: JSON.stringify(payload) } }).text);
  const row = () => Object.fromEntries(context.ALL_REQUESTS_HEADERS().map((header, i) => [header, rows[0][i]]));
  return { context, emails, rows, post, row };
}
const payload = {
  action: 'chat-handoff', secret: 'unit-chat-secret', test: false,
  name: 'Aminata Kamara', email: 'visitor@example.test', whatsapp: '+23276123456',
  country: 'Sierra Leone', city: 'Freetown', organisation: 'Example Ltd', topic: 'Procurement',
  ownWords: '=Need ten laptops for our office', botSummary: 'Visitor wants laptops.\nPrice: $500; stock: available; date: Monday.',
  transcript: 'User: Need ten laptops\nAssistant: Team will verify the quote.',
  timeCT: '2026-11-15 10:00 CT', timeGMT: '2026-11-15 16:00 GMT',
  preferredChannel: 'email', consent: false, pageUrl: 'https://www.lavaall.com/products', sourcePage: 'untrusted-source',
};
check('chat action authenticates dedicated secret and sends one support email plus one All Requests row', () => {
  const test = setup();
  assert.deepEqual(test.post(payload), { ok: true });
  assert.equal(test.emails.length, 1);
  assert.equal(test.rows.length, 1);
  assert.equal(test.emails[0][0], 'support@lavaall.com');
  assert.equal(test.emails[0][3].name, 'LAVAALL Website');
  assert.equal(test.emails[0][3].replyTo, payload.email);
  const row = test.row();
  assert.equal(row['Source Page'], 'chatbot');
  assert.equal(row['Consent Recorded'], 'No');
  assert.equal(row['Request Type'], 'Chatbot handoff');
  assert.equal(row['Assigned Team'], 'support@lavaall.com');
  assert.equal(row['Full Name'], payload.name);
  assert.equal(row.Email, payload.email);
  assert.equal(row.Phone, "'" + payload.whatsapp);
  assert.equal(row.Company, payload.organisation);
  assert.equal(row.Country, payload.country);
  assert.equal(row['Inquiry Category'], payload.topic);
  assert.equal(row.Message, "'" + payload.ownWords);
  assert.equal(row['Preferred Response Method'], 'email');
  for (const key of ['botSummary', 'transcript', 'timeCT', 'timeGMT', 'city', 'pageUrl']) {
    assert.ok(row['Internal Notes'].includes(payload[key]), key);
    assert.ok(test.emails[0][2].includes(payload[key]), key);
  }
});
check('phone-only delivery omits Reply-To and defaults absent consent to No', () => {
  const test = setup();
  const phoneOnly = { ...payload, email: '', preferredChannel: 'whatsapp' };
  delete phoneOnly.consent;
  assert.equal(test.post(phoneOnly).ok, true);
  assert.equal(test.emails.length, 1);
  assert.equal(Object.hasOwn(test.emails[0][3], 'replyTo'), false);
  assert.equal(test.row()['Consent Recorded'], 'No');
  assert.equal(test.row()['Preferred Response Method'], 'whatsapp');
});
check('only boolean true records consent', () => {
  for (const [value, expected] of [[true, 'Yes'], [false, 'No'], ['true', 'No']]) {
    const test = setup();
    assert.equal(test.post({ ...payload, consent: value }).ok, true);
    assert.equal(test.row()['Consent Recorded'], expected);
  }
});
check('dedicated secret takes precedence over booking secret', () => {
  const test = setup();
  assert.equal(test.post({ ...payload, secret: 'unit-booking-secret' }).error, 'forbidden');
  assert.equal(test.emails.length + test.rows.length, 0);
});
check('shared existing booking secret works only when dedicated secret is absent', () => {
  const test = setup({ BOOKING_WEBHOOK_SECRET: 'unit-booking-secret' });
  assert.equal(test.post({ ...payload, secret: 'unit-booking-secret' }).ok, true);
  assert.equal(test.emails.length, 1);
  assert.equal(test.rows.length, 1);
});
check('missing or incorrect secret refuses delivery', () => {
  for (const test of [setup({}), setup()]) {
    assert.equal(test.post({ ...payload, secret: '' }).error, 'forbidden');
    assert.equal(test.emails.length + test.rows.length, 0);
  }
});
check('chat-handoff secret compare is length-independent and accepts only an exact match', () => {
  const test = setup();
  assert.equal(test.context.secretsEqual('unit-chat-secret', 'unit-chat-secret'), true);
  assert.equal(test.context.secretsEqual('unit-chat-secret', 'unit-chat-secreu'), false);
  assert.equal(test.context.secretsEqual('short', 'unit-chat-secret'), false);
  assert.equal(test.context.secretsEqual('unit-chat-secret', 'unit-chat-secret-extra'), false);
  assert.equal(test.context.secretsEqual('', 'unit-chat-secret'), false);
  assert.equal(test.context.secretsEqual(undefined, 'unit-chat-secret'), false);
  assert.equal(test.post({ ...payload, secret: 'unit-chat-secre' }).error, 'forbidden');
  assert.equal(test.post({ ...payload, secret: 'unit-chat-secret!' }).error, 'forbidden');
  assert.deepEqual(test.post(payload), { ok: true });
  assert.equal(test.emails.length, 1);
});
check('test payload cannot email or append a request', () => {
  const test = setup();
  assert.equal(test.post({ ...payload, test: true }).error, 'test_delivery_disabled');
  assert.equal(test.emails.length + test.rows.length, 0);
});
check('missing contact or malformed email refuses delivery', () => {
  for (const change of [{ email: '', whatsapp: '' }, { email: 'bad\nemail' }, { name: '' }]) {
    const test = setup();
    assert.ok(test.post({ ...payload, ...change }).error);
    assert.equal(test.emails.length + test.rows.length, 0);
  }
});
check('legacy POST actions retain booking-secret authentication and dispatch', () => {
  const test = setup();
  test.context.handleRegister = () => ({ text: '{"route":"register"}' });
  test.context.handleBook = () => ({ text: '{"route":"book"}' });
  for (const action of ['register', 'book']) {
    assert.equal(test.post({ action, secret: 'unit-booking-secret' }).route, action);
    assert.equal(test.post({ action, secret: 'unit-chat-secret' }).error, 'forbidden');
  }
});
check('legacy availability and lookup GET dispatch remains intact', () => {
  const test = setup();
  test.context.getAvailableSlots = () => [];
  test.context.lookupLead = (leadId, token) => ({ text: JSON.stringify({ leadId, token }) });
  const get = parameter => JSON.parse(test.context.doGet({ parameter }).text);
  assert.equal(get({ action: 'availability', date: '2026-11-16' }).ok, true);
  assert.deepEqual(get({ action: 'lookup', leadId: 'unit-lead', token: 'unit-token' }), { leadId: 'unit-lead', token: 'unit-token' });
});
console.log(`\n${total}/${total} passed`);
