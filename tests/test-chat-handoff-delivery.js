'use strict';
const assert = require('node:assert/strict');
const { createService } = require('../api/_chat/service');
const { memoryStore, kvStore } = require('../api/_chat/store');
const { createHandler } = require('../api/chat-inquiry');
const { respond } = require('../api/_chat/responder');
const CLOSE = 'Thank you, someone from our team will reach out to you shortly.';
const webhook = { CHAT_HANDOFF_WEBHOOK_URL: 'https://handoff.invalid/exec', CHAT_HANDOFF_WEBHOOK_SECRET: 'synthetic-handoff-secret' };
let assertions = 0;
function check(fn) { fn(); assertions++; }
async function flow(options = {}, email = false, pageUrl = 'https://lavaall.test/products?item=abc') {
  // Exercise the real JSON/CAS adapter without Redis or network. JSON breaks
  // object aliases between the event result and its separate receipt record.
  let serialized = null;
  const store = options.serializedStore ? kvStore({ url: 'https://store.invalid', token: 'synthetic-store-token',
    fetch: async (url, init) => {
      const command = JSON.parse(init.body);
      let result;
      if (command[0] === 'GET') result = serialized;
      else if (command[0] === 'EVAL') {
        if ((serialized || '') !== command[4]) result = 0;
        else { serialized = command[5]; result = 1; }
      } else throw Error('Unexpected mock store command');
      return { ok: true, json: async () => ({ result }) };
    } }) : memoryStore();
  const calls = [];
  const service = createService({ store, salt: 'delivery-fixture', previewLimits: true,
    now: () => Date.UTC(2026, 6, 15, 12), trustedOrigins: ['https://lavaall.test'],
    handoffFetch: async (...args) => { calls.push(args); return { ok: true, json: async () => ({ ok: true }) }; },
    chat: () => { throw Error('No model permitted'); }, ...options });
  const session = await service.start('192.0.2.30');
  await store.transaction(rows => {
    rows.get('s:' + session.sessionId).context = { history: options.history || [
      { role: 'user', text: 'I need 20 laptops for my school and repairs for our old ones.' },
      { role: 'assistant', text: 'The price was $450. Stock is unverified. Ask about November 20, 2026.' },
    ] };
  });
  let n = 0;
  const turn = (text, eventId = 'delivery-' + ++n) => service.turn(session.sessionId, session.proof, eventId, undefined, session.csrf, text, { pageUrl });
  for (const text of ['talk to someone', email ? 'Email' : 'WhatsApp', email ? 'ada@example.com' : '076658960', 'Ada Test', 'Repair and buy school laptops', 'Sierra Leone, Freetown', 'School Test']) await turn(text);
  const before = await store.transaction(rows => [...rows].filter(([key]) => key.startsWith('test-handoff:')));
  check(() => assert.equal(before.length, 0));
  const confirmed = options.concurrent ? (await Promise.all([turn('Confirm', 'confirm-once'), turn('Confirm', 'other-confirm')]))[0] : await turn('Confirm', 'confirm-once');
  check(() => assert.equal(confirmed.text, CLOSE));
  await turn('Confirm', 'confirm-once');
  const records = await store.transaction(rows => [...rows].filter(([key]) => key.startsWith('test-handoff:')));
  return { calls, confirmed, records, service, store, session };
}
async function main() {
  for (const options of [{}, { runtime: 'preview', env: webhook }, { env: { ...webhook, VERCEL_ENV: 'preview' } },
    { runtime: 'production' }, { runtime: 'production', env: { CHAT_HANDOFF_WEBHOOK_URL: webhook.CHAT_HANDOFF_WEBHOOK_URL } },
    { runtime: 'production', env: { CHAT_HANDOFF_WEBHOOK_SECRET: webhook.CHAT_HANDOFF_WEBHOOK_SECRET } },
    { runtime: 'production', env: webhook, handoffFetch: undefined }]) {
    const f = await flow(options);
    check(() => assert.equal(f.calls.length, 0));
    check(() => assert.equal(f.records.length, 1));
    check(() => assert.equal(f.records[0][1].payload.test, true));
    check(() => assert.equal(f.confirmed.handoff.test, true));
  }
  for (const email of [false, true]) {
    const f = await flow({ runtime: 'production', env: webhook }, email);
    check(() => assert.equal(f.calls.length, 1));
    check(() => assert.equal(f.records.length, 0));
    const [url, init] = f.calls[0], body = JSON.parse(init.body);
    check(() => assert.equal(url, webhook.CHAT_HANDOFF_WEBHOOK_URL));
    check(() => assert.equal(init.method, 'POST'));
    check(() => assert.deepEqual(init.headers, { 'Content-Type': 'application/json' }));
    check(() => assert.equal(body.action, 'chat-handoff'));
    check(() => assert.equal(body.secret, webhook.CHAT_HANDOFF_WEBHOOK_SECRET));
    check(() => assert.equal(body.test, false));
    check(() => assert.equal(body.name, 'Ada Test'));
    check(() => assert.equal(body.whatsapp, email ? '' : '+23276658960'));
    check(() => assert.equal(body.preferredChannel, email ? 'email' : 'whatsapp'));
    check(() => assert.equal(body.consent, false));
    check(() => assert.equal(body.sourcePage, 'chatbot'));
    check(() => assert.equal(body.country, 'Sierra Leone'));
    check(() => assert.equal(body.city, 'Freetown'));
    check(() => assert.equal(body.organisation, 'School Test'));
    check(() => assert.match(body.ownWords, /20 laptops for my school and repairs/));
    check(() => assert.equal(body.botSummary.split('\n').length, 3));
    check(() => assert.match(body.botSummary, /price:.*\$450.*stock:.*unverified.*date:.*November 20/i));
    check(() => assert.match(body.transcript, /Visitor:.*20 laptops/));
    check(() => assert.ok(body.transcript.length <= 6000));
    check(() => assert.match(body.timeCT, /07:00:00/));
    check(() => assert.match(body.timeGMT, /12:00:00/));
    check(() => assert.equal(body.pageUrl, 'https://lavaall.test/products?item=abc'));
    check(() => email ? assert.equal(body.replyTo, 'ada@example.com') : assert.equal(Object.hasOwn(body, 'replyTo'), false));
    check(() => assert.equal(f.confirmed.handoff.status, 'received'));
  }
  for (const value of ['https://evil.test/path', 'https://lavaall.test.evil.test', 'javascript:alert(1)', '/relative', 'https://user:pass@lavaall.test/private']) {
    const f = await flow({}, false, value);
    check(() => assert.equal(f.records[0][1].payload.pageUrl, ''));
  }
  const concurrent = await flow({ runtime: 'production', env: webhook, concurrent: true });
  check(() => assert.equal(concurrent.calls.length, 1));
  const serialized = await flow({ runtime: 'production', env: webhook, serializedStore: true });
  const persisted = await serialized.store.transaction(rows => [...rows]);
  check(() => assert.equal(persisted.find(([key]) => key.startsWith('handoff-receipt:'))[1].receipt.status, 'received'));
  check(() => assert.ok(!JSON.stringify(persisted).includes(webhook.CHAT_HANDOFF_WEBHOOK_SECRET)));
  let failedAttempts = 0;
  const failed = await flow({ runtime: 'production', env: webhook, handoffFetch: async () => { failedAttempts++; throw Error('synthetic timeout'); } });
  check(() => assert.equal(failed.confirmed.handoff.status, 'uncertain'));
  check(() => assert.equal(failedAttempts, 1));
  const huge = await flow({ history: [
    { role: 'assistant', text: 'Price is $450. Stock needs checking for November 20.' },
    ...Array.from({ length: 35 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: 'Long request ' + i + ' ' + 'x'.repeat(1950) })),
  ] });
  const hugePayload = huge.records[0][1].payload;
  check(() => assert.ok(hugePayload.transcript.length <= 6000));
  check(() => assert.ok(hugePayload.ownWords.length <= 2400));
  check(() => assert.match(hugePayload.botSummary, /price:.*450.*stock:.*checking.*date:.*November 20/i));
  check(() => assert.doesNotMatch(hugePayload.transcript, /Price is \$450/));
  for (const text of ['450 €. Disponible le 20 novembre 2026.', '450 euros. Ask about 15 November 2026.']) {
    const changed = await flow({ history: [
      { role: 'assistant', text: 'Prices are quoted per order. Stock must be verified.' },
      { role: 'assistant', text: 'Available now. ' + text },
    ] });
    const summary = changed.records[0][1].payload.botSummary;
    check(() => assert.match(summary, /price:.*450/));
    check(() => assert.match(summary, /stock:.*Available now/));
    check(() => assert.match(summary, /date:.*(?:20 novembre|15 November)/));
  }
  // Full-session mention flags survive the bounded transcript rolling forward.
  const ctx = await huge.store.transaction(rows => rows.get('s:' + huge.session.sessionId).context);
  check(() => assert.ok(ctx.history.length <= 24));
  check(() => assert.match(ctx.assistantMentions.price, /\$450/));
  let state = respond('talk to someone');
  for (const text of ['Email', 'ada@example.com', 'Ada Test', 'School laptops']) state = respond(text, state);
  check(() => assert.equal(state.awaiting, 'handoff-location'));
  state = respond('', state);
  check(() => assert.equal(state.awaiting, 'handoff-organisation'));
  state = respond('skip', state);
  check(() => assert.equal(state.awaiting, 'handoff-confirm'));
  check(() => assert.equal(respond('Confirm', state).text, CLOSE));
  // Exercise trusted origins at the HTTP boundary with an injected model and transport.
  const store = memoryStore(); let sent;
  const handler = createHandler({ runtime: 'test', localTests: true, CHAT_ENABLED: true,
    deepseekApiKey: 'synthetic-unused-key', salt: 'handler-fixture', store,
    trustedOrigins: ['https://lavaall.test'], env: webhook,
    chat: () => { throw Error('No model permitted'); },
    handoffFetch: async (url, init) => { sent = JSON.parse(init.body); return { ok: true, json: async () => ({ ok: true }) }; } });
  async function request(action, body, cookie) {
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(n) { this.code = n; return this; }, send(s) { this.body = JSON.parse(s); return this; } };
    await handler({ method: 'POST', query: { action }, headers: { origin: 'https://lavaall.test', 'content-type': 'application/json', cookie }, body }, res);
    check(() => assert.equal(res.code, 200)); return res;
  }
  const session = await request('session', {}), cookie = session.headers['Set-Cookie'].split(';')[0];
  for (const [i, text] of ['talk to someone', 'Email', 'ada@example.com', 'Ada Test', 'School laptops', '', '', 'Confirm'].entries()) {
    await request('turn', { ...session.body, eventId: 'http-' + i, text, pageUrl: 'https://lavaall.test/catalog' }, cookie);
  }
  check(() => assert.equal(sent.pageUrl, 'https://lavaall.test/catalog'));
  const ui = require('../assets/js/customer-assistant');
  const browserBodies = [];
  const browserTransport = ui.createPreviewTransport(async (url, init) => {
    browserBodies.push(JSON.parse(init.body));
    return { ok: true, json: async () => url.endsWith('session') ? { sessionId: 'synthetic-session', csrf: 'synthetic-csrf' } : { text: 'reply' } };
  }, { getRandomValues: bytes => bytes.fill(1) }, 'https://lavaall.test/widget');
  await browserTransport('turn', { text: 'hello' });
  check(() => assert.equal(browserBodies[1].pageUrl, 'https://lavaall.test/widget'));
  const { RealChatAdapter } = await import('../mascot/src/chat/real-chat-adapter.js');
  const previousLocation = globalThis.location;
  try {
    globalThis.location = { href: 'https://lavaall.test/mascot' };
    const adapter = new RealChatAdapter({ crypto: { getRandomValues: bytes => bytes.fill(2) },
      fetch: async (url, init) => {
        const body = JSON.parse(init.body);
        if (url.endsWith('turn')) check(() => assert.equal(body.pageUrl, 'https://lavaall.test/mascot'));
        return { ok: true, json: async () => url.endsWith('session') ? { sessionId: 'synthetic-session', csrf: 'synthetic-csrf' } : { text: 'reply' } };
      } });
    await adapter._turnOnce('hello');
    adapter.reset();
  } finally {
    if (previousLocation === undefined) delete globalThis.location;
    else globalThis.location = previousLocation;
  }
  require('../scripts/booking-scheduler/test-chat-handoff');
  console.log(`PASS ${assertions} handoff delivery checks (mocked only)`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
