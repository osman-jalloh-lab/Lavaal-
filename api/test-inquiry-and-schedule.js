// Tests for api/contact.js (Send an Inquiry) and api/schedule.js (Schedule
// a Call proxy) -- mocks req/res/fetch so these run in plain node.
const path = require('path');
const contactMod = require(process.env.CONTACT_JS || require('path').join(__dirname, 'contact.js'));
const scheduleMod = require(process.env.SCHEDULE_JS || require('path').join(__dirname, 'schedule.js'));

const results = [];
function check(name, cond) { results.push({ name, pass: !!cond }); }

function mockRes() {
  const res = { statusCode: null, headers: {}, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.setHeader = (k, v) => { res.headers[k] = v; return res; };
  res.send = (b) => { res.body = JSON.parse(b); return res; };
  return res;
}

async function run() {
  // --- contact.js: ROUTES completeness (all 15 spec inquiry types) ---
  const EXPECTED_TYPES = ['sales-quotation', 'product-availability', 'equipment-procurement',
    'routers-networking', 'servers-infrastructure', 'computers-workstations', 'fiber-optic',
    'structured-cabling', 'installation-services', 'customer-support', 'technical-support',
    'existing-order', 'partnership', 'general-inquiry', 'other'];

  process.env.CONTACT_WEBHOOK_URL = 'https://example.test/webhook';
  process.env.CONTACT_WEBHOOK_SECRET = 'test-secret';
  const origFetch = global.fetch;

  for (const type of EXPECTED_TYPES) {
    global.fetch = async (url, opts) => {
      const sent = JSON.parse(opts.body);
      check(`[${type}] routes to an @lavaall.com address`, /@lavaall\.com$/.test(sent.routeTo));
      return { ok: true, json: async () => ({}) };
    };
    const req = { method: 'POST', headers: { 'x-forwarded-for': `10.0.0.${Math.random()}` }, body: {
      inquiryType: type, name: 'Jean Kamara', email: 'jean@example.com', phone: '+232 76 000 000',
      country: 'Sierra Leone', subject: 'Test', message: 'Hello there', preferredResponse: 'email',
      consent: true, orderNumber: type === 'existing-order' ? 'ORD-123' : undefined,
    }};
    const res = mockRes();
    await contactMod(req, res);
    check(`[${type}] accepted (202)`, res.statusCode === 202);
  }

  // Missing order number on existing-order should be rejected
  {
    global.fetch = async () => ({ ok: true, json: async () => ({}) });
    const req = { method: 'POST', headers: { 'x-forwarded-for': '10.0.0.99' }, body: {
      inquiryType: 'existing-order', name: 'Jean Kamara', email: 'jean@example.com',
      country: 'Sierra Leone', subject: 'Order', message: 'Where is my order', preferredResponse: 'email', consent: true,
    }};
    const res = mockRes();
    await contactMod(req, res);
    check('existing-order without an order number is rejected (400)', res.statusCode === 400);
  }

  // Conditional fields actually reach the outgoing message
  {
    let sentMessage = '';
    global.fetch = async (url, opts) => { sentMessage = JSON.parse(opts.body).message; return { ok: true, json: async () => ({}) }; };
    const req = { method: 'POST', headers: { 'x-forwarded-for': '10.0.0.50' }, body: {
      inquiryType: 'sales-quotation', name: 'Jean Kamara', email: 'jean@example.com',
      country: 'Sierra Leone', subject: 'Quote', message: 'Need pricing', preferredResponse: 'phone', consent: true,
      productOrService: 'Dell PowerEdge R750', quantity: '5', budget: '$20,000', deliveryLocation: 'Freetown', timeline: '2 weeks',
    }};
    const res = mockRes();
    await contactMod(req, res);
    check('sales-quotation folds product/quantity/budget/timeline into message',
      sentMessage.includes('Dell PowerEdge R750') && sentMessage.includes('5') && sentMessage.includes('$20,000') && sentMessage.includes('2 weeks'));
  }

  global.fetch = origFetch;

  // --- schedule.js ---
  process.env.BOOKING_WEBHOOK_URL = 'https://example.test/booking';
  process.env.BOOKING_WEBHOOK_SECRET = 'test-secret';

  // availability (GET)
  {
    global.fetch = async (url) => { check('availability GET forwards the date param', String(url).includes('date=2026-09-07')); return { ok: true, status: 200, json: async () => ({ ok: true, slots: [] }) }; };
    const req = { method: 'GET', query: { action: 'availability', date: '2026-09-07' } };
    const res = mockRes();
    await scheduleMod(req, res);
    check('availability returns 200', res.statusCode === 200);
  }

  // register: rejects invalid reason
  {
    const req = { method: 'POST', body: { action: 'register', firstName: 'Jean', lastName: 'Kamara', email: 'jean@example.com', phone: '+232 76 000 000', country: 'Sierra Leone', reason: 'not-a-real-reason', preferredContactMethod: 'phone', consent: true } };
    const res = mockRes();
    await scheduleMod(req, res);
    check('register rejects an invalid reason code (400)', res.statusCode === 400);
  }

  // register: valid payload proxies through with action+secret attached
  {
    let sentBody = null;
    global.fetch = async (url, opts) => { sentBody = JSON.parse(opts.body); return { ok: true, status: 200, json: async () => ({ ok: true, leadId: 'SCH-1', token: 'tok' }) }; };
    const req = { method: 'POST', headers: { host: 'www.lavaall.com' }, body: {
      action: 'register', firstName: 'Jean', lastName: 'Kamara', email: 'reg-test@example.com', phone: '+232 76 000 000',
      country: 'Sierra Leone', reason: 'sales-quotation', preferredContactMethod: 'email', consent: true, language: 'fr',
    }};
    const res = mockRes();
    await scheduleMod(req, res);
    check('register succeeds (200) and proxies action=register with the secret attached',
      res.statusCode === 200 && sentBody.action === 'register' && sentBody.secret === 'test-secret' && sentBody.language === 'fr');
  }

  // book: rejects malformed date/time
  {
    const req = { method: 'POST', body: { action: 'book', leadId: 'SCH-1', token: 'tok', date: 'not-a-date', time: '9am' } };
    const res = mockRes();
    await scheduleMod(req, res);
    check('book rejects malformed date/time (400)', res.statusCode === 400);
  }

  // =========================================================================
  // FINAL SIMPLIFIED CONTACT RULES -- the 16 user-specified scenarios,
  // exercised directly against api/schedule.js's register validation.
  // =========================================================================
  function registerReq(overrides) {
    return { method: 'POST', headers: { host: 'www.lavaall.com' }, body: Object.assign({
      action: 'register', firstName: 'Aminata', reason: 'general', consent: true,
    }, overrides) };
  }
  async function registerAndCheck(name, overrides, expectStatus) {
    global.fetch = async (url, opts) => ({ ok: true, status: 200, json: async () => ({ ok: true, leadId: 'SCH-T', token: 'tok-t' }) });
    const req = registerReq(overrides);
    const res = mockRes();
    await scheduleMod(req, res);
    check(name, res.statusCode === expectStatus, `(got ${res.statusCode}, wanted ${expectStatus})`);
    return res;
  }

  // 1. First name + email -- accepted
  await registerAndCheck('1. First name + email -- accepted', { email: 'a1@example.com', preferredContactMethod: 'email' }, 200);
  // 2. First name + phone -- accepted
  await registerAndCheck('2. First name + phone -- accepted', { phone: '+232 76 000 001', preferredContactMethod: 'phone' }, 200);
  // 3. First name without email or phone -- rejected
  await registerAndCheck('3. First name without email or phone -- rejected', {}, 400);
  // 4. Missing inquiry type -- rejected
  await registerAndCheck('4. Missing inquiry type -- rejected', { email: 'a4@example.com', preferredContactMethod: 'email', reason: '' }, 400);
  // 5. Missing country -- accepted
  await registerAndCheck('5. Missing country -- accepted', { email: 'a5@example.com', preferredContactMethod: 'email', country: '' }, 200);
  // 6. Missing last name -- accepted
  await registerAndCheck('6. Missing last name -- accepted', { email: 'a6@example.com', preferredContactMethod: 'email', lastName: '' }, 200);
  // 7. Phone entry allows Phone or WhatsApp as method
  await registerAndCheck('7a. Phone-only + method=phone -- accepted', { phone: '+232 76 000 007', preferredContactMethod: 'phone' }, 200);
  await registerAndCheck('7b. Phone-only + method=whatsapp + connected=yes + consent -- accepted',
    { phone: '+232 76 000 070', preferredContactMethod: 'whatsapp', whatsappConnected: 'yes', whatsappConsent: true }, 200);
  // 8. Email entry allows Email as method
  await registerAndCheck('8. Email-only + method=email -- accepted', { email: 'a8@example.com', preferredContactMethod: 'email' }, 200);
  // 9. WhatsApp selection requires permission (consent)
  await registerAndCheck('9. WhatsApp selected without consent -- rejected',
    { phone: '+232 76 000 009', preferredContactMethod: 'whatsapp', whatsappConnected: 'yes', whatsappConsent: false }, 400);
  // 10. Separate WhatsApp number works
  await registerAndCheck('10a. WhatsApp connected=no without separate number -- rejected',
    { phone: '+232 76 000 010', preferredContactMethod: 'whatsapp', whatsappConnected: 'no', whatsappConsent: true }, 400);
  {
    let sentBody = null;
    global.fetch = async (url, opts) => { sentBody = JSON.parse(opts.body); return { ok: true, status: 200, json: async () => ({ ok: true, leadId: 'SCH-T', token: 'tok-t' }) }; };
    const req = registerReq({ phone: '+232 76 000 010', preferredContactMethod: 'whatsapp', whatsappConnected: 'no', whatsappNumber: '+232 77 000 010', whatsappConsent: true });
    const res = mockRes();
    await scheduleMod(req, res);
    check('10b. WhatsApp connected=no + separate number -- accepted', res.statusCode === 200);
    check('10c. separate whatsappNumber forwarded to backend', sentBody && sentBody.whatsappNumber === '+232 77 000 010');
  }
  // 11. Messenger requires a profile identifier
  await registerAndCheck('11a. Messenger without profile -- rejected',
    { email: 'a11@example.com', preferredContactMethod: 'messenger', messengerConsent: true }, 400);
  await registerAndCheck('11b. Messenger with profile but no consent -- rejected',
    { email: 'a11@example.com', preferredContactMethod: 'messenger', messengerProfile: 'facebook.com/a11', messengerConsent: false }, 400);
  await registerAndCheck('11c. Messenger with profile + consent -- accepted',
    { email: 'a11@example.com', preferredContactMethod: 'messenger', messengerProfile: 'facebook.com/a11', messengerConsent: true }, 200);
  // 12. Phone callback requires phone
  await registerAndCheck('12. method=phone without a phone number -- rejected',
    { email: 'a12@example.com', preferredContactMethod: 'phone' }, 400);
  // 13. Google Meet (method=email) requires email
  await registerAndCheck('13. method=email without an email address -- rejected',
    { phone: '+232 76 000 013', preferredContactMethod: 'email' }, 400);
  // 14/15. Email forwarded only when provided; phone-only never sends an email field
  {
    let sentBody = null;
    global.fetch = async (url, opts) => { sentBody = JSON.parse(opts.body); return { ok: true, status: 200, json: async () => ({ ok: true, leadId: 'SCH-T', token: 'tok-t' }) }; };
    const req = registerReq({ phone: '+232 76 000 014', preferredContactMethod: 'phone' });
    const res = mockRes();
    await scheduleMod(req, res);
    check('14/15. Phone-only registration forwards an empty email field (no email attempted)', sentBody && sentBody.email === '');
  }
  {
    let sentBody = null;
    global.fetch = async (url, opts) => { sentBody = JSON.parse(opts.body); return { ok: true, status: 200, json: async () => ({ ok: true, leadId: 'SCH-T', token: 'tok-t' }) }; };
    const req = registerReq({ email: 'a14b@example.com', preferredContactMethod: 'email' });
    const res = mockRes();
    await scheduleMod(req, res);
    check('14b. Email-provided registration forwards the email field', sentBody && sentBody.email === 'a14b@example.com');
  }
  // 16. Language code forwards correctly for en/fr/kr (full UI behavior covered by Playwright)
  for (const langCode of ['en', 'fr', 'kr']) {
    let sentBody = null;
    global.fetch = async (url, opts) => { sentBody = JSON.parse(opts.body); return { ok: true, status: 200, json: async () => ({ ok: true, leadId: 'SCH-T', token: 'tok-t' }) }; };
    const req = registerReq({ email: `a16-${langCode}@example.com`, preferredContactMethod: 'email', language: langCode });
    const res = mockRes();
    await scheduleMod(req, res);
    check(`16. [${langCode}] language forwarded and registration accepted`, res.statusCode === 200 && sentBody && sentBody.language === langCode);
  }

  let failed = 0;
  for (const r of results) {
    console.log((r.pass ? 'PASS' : 'FAIL') + ' - ' + r.name);
    if (!r.pass) failed++;
  }
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}

run();
