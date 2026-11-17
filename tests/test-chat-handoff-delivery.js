'use strict';
const assert = require('node:assert/strict');
const { createService, HANDOFF_FALLBACK } = require('../api/_chat/service');
const { createHandoffTransport, TIMEOUT_MS } = require('../api/_chat/handoff-transport');
const { memoryStore, kvStore } = require('../api/_chat/store');
const { createHandler } = require('../api/chat-inquiry');
const { respond } = require('../api/_chat/responder');
const CLOSE = "Thanks, we've got your message. Someone from our team will reply by WhatsApp or email within 1 business day (Monday to Friday).";
const webhook = { CHAT_HANDOFF_WEBHOOK_URL: 'https://handoff.invalid/exec', CHAT_HANDOFF_WEBHOOK_SECRET: 'synthetic-handoff-secret' };
const PII = ['Ada Test', 'ada@example.com', '076658960', '+23276658960', 'Repair and buy school laptops', 'School Test', 'synthetic-handoff-secret', 'Freetown', 'I need 20 laptops'];
function noPii(logs) {
  const blob = logs.join(' ');
  for (const value of PII) assert.ok(!blob.includes(value), 'log leaked ' + value);
  for (const raw of logs) {
    const entry = JSON.parse(raw);
    assert.deepEqual(Object.keys(entry).sort(), ['id', 'ms', 'status']);
    assert.equal(typeof entry.id, 'string');
    assert.equal(typeof entry.ms, 'number');
    assert.ok(entry.ms >= 0);
  }
}
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
  const logs = [];
  const originalInfo = console.info;
  console.info = function (...args) {
    if (args[0] === 'CHAT_HANDOFF') logs.push(String(args[1]));
    return originalInfo.apply(console, args);
  };
  try {
  const record = fetchImpl => async (...args) => { calls.push(args); return fetchImpl(...args); };
  const defaultFetch = record(async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) }));
  const service = createService({ store, salt: 'delivery-fixture', previewLimits: true,
    now: () => Date.UTC(2026, 6, 15, 12), trustedOrigins: ['https://lavaall.test'],
    chat: () => { throw Error('No model permitted'); }, ...options,
    handoffFetch: Object.hasOwn(options, 'handoffFetch')
      ? (typeof options.handoffFetch === 'function' ? record(options.handoffFetch) : options.handoffFetch)
      : defaultFetch });
  const session = await service.start('192.0.2.30');
  await store.transaction(rows => {
    rows.get('s:' + session.sessionId).context = { history: options.history || [
      { role: 'user', text: 'I need 20 laptops for my school and repairs for our old ones.' },
      { role: 'assistant', text: 'The price was $450. Stock is unverified. Ask about November 20, 2026.' },
    ] };
  });
  let n = 0;
  const turn = (text, eventId = 'delivery-' + ++n) => service.turn(session.sessionId, session.proof, eventId, undefined, session.csrf, text, { pageUrl, privacyConsent: text === 'Confirm' });
  for (const text of ['talk to someone', email ? 'Email' : 'WhatsApp', email ? 'ada@example.com' : '076658960', 'Ada Test', 'Repair and buy school laptops', 'Sierra Leone, Freetown', 'School Test']) await turn(text);
  const before = await store.transaction(rows => [...rows].filter(([key]) => key.startsWith('test-handoff:')));
  check(() => assert.equal(before.length, 0));
  const confirmed = options.concurrent ? (await Promise.all([turn('Confirm', 'confirm-once'), turn('Confirm', 'other-confirm')]))[0] : await turn('Confirm', 'confirm-once');
  const expectedText = options.expectedText === undefined ? CLOSE : options.expectedText;
  check(() => assert.equal(confirmed.text, expectedText));
  await turn('Confirm', 'confirm-once');
  const records = await store.transaction(rows => [...rows].filter(([key]) => key.startsWith('test-handoff:')));
  return { calls, confirmed, records, service, store, session, logs };
  } finally {
    console.info = originalInfo;
  }
}
async function main() {
  // Env unset, Preview, or only one webhook var: stay on the test sink. Thank-you stays immediate.
  for (const options of [{}, { runtime: 'preview', env: webhook }, { env: { ...webhook, VERCEL_ENV: 'preview' } },
    { runtime: 'production' }, { runtime: 'production', env: { CHAT_HANDOFF_WEBHOOK_URL: webhook.CHAT_HANDOFF_WEBHOOK_URL } },
    { runtime: 'production', env: { CHAT_HANDOFF_WEBHOOK_SECRET: webhook.CHAT_HANDOFF_WEBHOOK_SECRET } }]) {
    const f = await flow(options);
    check(() => assert.equal(f.calls.length, 0));
    check(() => assert.equal(f.records.length, 1));
    check(() => assert.equal(f.records[0][1].payload.test, true));
    check(() => assert.equal(f.confirmed.handoff.test, true));
    check(() => assert.equal(f.logs.length, 0));
  }
  for (const email of [false, true]) {
    const f = await flow({ runtime: 'production', env: webhook }, email);
    check(() => assert.equal(f.calls.length, 1));
    check(() => assert.equal(f.records.length, 0));
    const [url, init] = f.calls[0], body = JSON.parse(init.body);
    check(() => assert.equal(url, webhook.CHAT_HANDOFF_WEBHOOK_URL));
    check(() => assert.ok(!String(url).includes('?')));
    check(() => assert.ok(!String(url).includes(webhook.CHAT_HANDOFF_WEBHOOK_SECRET)));
    check(() => assert.equal(init.method, 'POST'));
    check(() => assert.deepEqual(init.headers, { 'Content-Type': 'application/json' }));
    check(() => assert.equal(body.action, 'chat-handoff'));
    check(() => assert.equal(body.secret, webhook.CHAT_HANDOFF_WEBHOOK_SECRET));
    check(() => assert.equal(body.receiptText, undefined));
    check(() => assert.equal(body.test, false));
    check(() => assert.equal(body.name, 'Ada Test'));
    check(() => assert.equal(body.whatsapp, email ? '' : '+23276658960'));
    check(() => assert.equal(body.preferredChannel, email ? 'email' : 'whatsapp'));
    check(() => assert.equal(body.consent, true));
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
    check(() => noPii(f.logs));
    check(() => assert.equal(f.logs.length, 1));
    check(() => assert.equal(JSON.parse(f.logs[0]).status, 200));
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
  const failed = await flow({ runtime: 'production', env: webhook, expectedText: HANDOFF_FALLBACK,
    handoffFetch: async () => { failedAttempts++; throw Error('synthetic timeout'); } });
  check(() => assert.equal(failed.confirmed.handoff.status, 'uncertain'));
  check(() => assert.equal(failedAttempts, 1));
  check(() => assert.ok(HANDOFF_FALLBACK.includes('WhatsApp +1 (737) 704-4182')));
  check(() => assert.ok(!HANDOFF_FALLBACK.includes('076 658 960')));
  check(() => noPii(failed.logs));
  check(() => assert.equal(JSON.parse(failed.logs[0]).status, 'network'));

  const serverError = await flow({ runtime: 'production', env: webhook, expectedText: HANDOFF_FALLBACK,
    handoffFetch: async (...args) => { failedAttempts++; return { ok: false, status: 500, json: async () => ({ error: 'email_failed' }) }; } });
  check(() => assert.equal(serverError.confirmed.handoff.status, 'uncertain'));
  check(() => assert.equal(serverError.calls.length, 1));
  check(() => assert.equal(JSON.parse(serverError.logs[0]).status, 500));
  check(() => noPii(serverError.logs));

  for (const reply of [
    { ok: true, status: 200, json: async () => ({ ok: false }) },
    { ok: true, status: 200, json: async () => { throw Error('invalid json'); } },
  ]) {
    const bad = await flow({ runtime: 'production', env: webhook, expectedText: HANDOFF_FALLBACK,
      handoffFetch: async (...args) => reply });
    check(() => assert.equal(bad.confirmed.handoff.status, 'uncertain'));
    check(() => assert.equal(bad.calls.length, 1));
  }

  check(() => assert.equal(TIMEOUT_MS, 18000));

  // Default transport (no injected handoffFetch): 18s AbortController, one attempt, no retry on timeout.
  {
    const previous = globalThis.fetch;
    let attempts = 0;
    globalThis.fetch = (url, init) => {
      attempts += 1;
      return new Promise((_, reject) => {
        init.signal.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      });
    };
    try {
      const timedOut = await flow({ runtime: 'production', env: webhook, expectedText: HANDOFF_FALLBACK,
        handoffFetch: createHandoffTransport({ timeoutMs: 40 }) });
      check(() => assert.equal(timedOut.confirmed.handoff.status, 'uncertain'));
      check(() => assert.equal(attempts, 1));
      check(() => noPii(timedOut.logs));
      check(() => assert.equal(JSON.parse(timedOut.logs[0]).status, 'timeout'));
    } finally {
      globalThis.fetch = previous;
    }
  }

  // Omitted handoffFetch uses globalThis.fetch; secret is only in the JSON body.
  {
    const previous = globalThis.fetch;
    const liveCalls = [];
    globalThis.fetch = async (url, init) => {
      liveCalls.push({ url, init });
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    };
    try {
      const live = await flow({ runtime: 'production', env: webhook, handoffFetch: undefined });
      check(() => assert.equal(live.confirmed.handoff.status, 'received'));
      check(() => assert.equal(live.calls.length, 0));
      check(() => assert.equal(liveCalls.length, 1));
      check(() => assert.equal(liveCalls[0].url, webhook.CHAT_HANDOFF_WEBHOOK_URL));
      check(() => assert.ok(!String(liveCalls[0].url).includes(webhook.CHAT_HANDOFF_WEBHOOK_SECRET)));
      check(() => assert.ok(!String(liveCalls[0].url).includes('?')));
      check(() => assert.equal(JSON.parse(liveCalls[0].init.body).secret, webhook.CHAT_HANDOFF_WEBHOOK_SECRET));
      check(() => assert.equal(JSON.parse(liveCalls[0].init.body).receiptText, undefined));
      check(() => noPii(live.logs));
      check(() => assert.equal(JSON.parse(live.logs[0]).status, 200));
    } finally {
      globalThis.fetch = previous;
    }
  }

  // Transport refuses to put the secret on the URL, and does not call fetch.
  {
    let reached = 0;
    const transport = createHandoffTransport({ fetch: async () => { reached += 1; return { ok: true, status: 200, json: async () => ({ ok: true }) }; } });
    await assert.rejects(
      () => transport(webhook.CHAT_HANDOFF_WEBHOOK_URL + '?secret=' + webhook.CHAT_HANDOFF_WEBHOOK_SECRET, {
        method: 'POST', body: JSON.stringify({ secret: webhook.CHAT_HANDOFF_WEBHOOK_SECRET }),
      }),
      /secret_in_url/,
    );
    check(() => assert.equal(reached, 0));
  }
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
  check(() => assert.equal(respond('Confirm', state, { privacyConsent: true }).text, CLOSE));
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
    await request('turn', { ...session.body, eventId: 'http-' + i, text, privacyConsent: text === 'Confirm', pageUrl: 'https://lavaall.test/catalog' }, cookie);
  }
  check(() => assert.equal(sent.pageUrl, 'https://lavaall.test/catalog'));
  check(() => assert.equal(sent.secret, webhook.CHAT_HANDOFF_WEBHOOK_SECRET));
  check(() => assert.ok(!Object.values(sent).some(value => typeof value === 'string' && String(value).includes('?secret='))));

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
