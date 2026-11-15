'use strict';

const assert = require('node:assert/strict');
const { createService } = require('../api/_chat/service');
const { memoryStore } = require('../api/_chat/store');
const { createHandler } = require('../api/chat-inquiry');
const { respond } = require('../api/_chat/responder');

const aliases = ['Confirm', 'yes', 'yes, confirm', 'yes confirm', 'yes please', 'correct', 'ok', 'okay', 'Confirm!', 'YES.'];
const refusedValues = [undefined, false, null, 'true', 1, [], {}];
const intake = ['talk to someone', 'Email', 'privacy-test@example.org', 'Ada Test', 'Office equipment', 'skip', 'skip'];
const webhook = {
  CHAT_HANDOFF_WEBHOOK_URL: 'https://handoff.invalid/never',
  CHAT_HANDOFF_WEBHOOK_SECRET: 'synthetic-consent-test-secret',
};
let checks = 0;
function check(fn) { fn(); checks++; }
const snapshot = store => store.transaction(rows => [...rows]);

async function conversational(runtime) {
  const store = memoryStore();
  let calls = 0, modelCalls = 0, sent;
  const service = createService({ store, salt: 'privacy-consent-test', previewLimits: true,
    runtime, env: webhook, now: () => Date.UTC(2026, 10, 15, 12),
    chat: () => { modelCalls++; throw Error('No model calls permitted'); },
    handoffFetch: async (url, init) => { calls++; sent = JSON.parse(init.body); return { ok: true, json: async () => ({ ok: true }) }; },
  });
  const session = await service.start('192.0.2.80');
  const turn = (text, eventId, privacyConsent) => service.turn(session.sessionId, session.proof, eventId,
    undefined, session.csrf, text, { privacyConsent });
  for (const [index, text] of intake.entries()) await turn(text, 'intake-' + index);
  const before = await snapshot(store);
  for (const text of aliases) {
    for (const privacyConsent of refusedValues) {
      await assert.rejects(turn(text, 'confirm-once', privacyConsent), error => error.code === 'privacy_consent');
      checks++;
      check(() => assert.equal(calls, 0));
      const after = await snapshot(store);
      check(() => assert.deepEqual(after, before, 'Refused Confirm must not reserve a turn or write a payload/receipt/test sink'));
    }
  }
  // The same event ID succeeds once the visitor checks the box; rejected turns
  // cannot poison the event or consume the session's turn allowance.
  const done = await turn('Confirm', 'confirm-once', true);
  check(() => assert.equal(done.text, 'Thank you, someone from our team will reach out to you shortly.'));
  check(() => assert.equal(done.handoff.status, 'received'));
  check(() => assert.equal(calls, runtime === 'preview' ? 0 : 1));
  const rows = await snapshot(store);
  const sinks = rows.filter(([key]) => key.startsWith('test-handoff:'));
  check(() => assert.equal(sinks.length, runtime === 'preview' ? 1 : 0));
  if (sinks.length) check(() => assert.equal(sinks[0][1].payload.consent, true));
  if (sent) check(() => assert.equal(sent.consent, true));
  await assert.rejects(turn('Confirm', 'confirm-once'), error => error.code === 'privacy_consent');
  checks++;
  const afterReplay = await snapshot(store);
  check(() => assert.deepEqual(afterReplay, rows));
  check(() => assert.equal(modelCalls, 0));
}

async function formalConfirmation() {
  const store = memoryStore();
  let calls = 0;
  const service = createService({ store, salt: 'formal-consent-test',
    transport: async () => { calls++; return { ok: true, json: async () => ({ ok: true }) }; },
  });
  const session = await service.start('192.0.2.81');
  const draft = await service.draft(session.sessionId, { name: 'Ada Test', phone: '+23276000000' }, 'draft');
  const review = await service.review(session.sessionId, session.proof, session.csrf, draft.draftId);
  const confirm = privacyConsent => service.confirm(session.sessionId, session.proof, session.csrf,
    draft.draftId, review.token, review.idempotencyKey, privacyConsent);
  const before = await snapshot(store);
  for (const value of refusedValues) {
    await assert.rejects(confirm(value), error => error.code === 'privacy_consent'); checks++;
    const after = await snapshot(store);
    check(() => assert.deepEqual(after, before, 'Privacy refusal must preserve the distinct two-minute draft token'));
    check(() => assert.equal(calls, 0));
  }
  check(() => assert.match(review.token, /^[a-f0-9]{64}$/));
  const done = await confirm(true);
  check(() => assert.equal(done.status, 'accepted'));
  check(() => assert.equal(calls, 1));
}

async function httpBoundary() {
  const store = memoryStore();
  const handler = createHandler({ store, runtime: 'test', localTests: true, CHAT_ENABLED: true,
    salt: 'http-consent-test', deepseekApiKey: 'synthetic-unused-key', trustedOrigins: ['https://lavaall.test'],
    chat: () => { throw Error('No model calls permitted'); },
  });
  let cookie;
  async function request(action, body) {
    const res = { headers: {}, setHeader(key, value) { this.headers[key] = value; },
      status(code) { this.code = code; return this; }, send(value) { this.body = JSON.parse(value); return this; } };
    await handler({ method: 'POST', query: { action }, body,
      headers: { origin: 'https://lavaall.test', 'content-type': 'application/json', cookie } }, res);
    if (res.headers['Set-Cookie']) cookie = res.headers['Set-Cookie'].split(';')[0];
    return res;
  }
  const session = (await request('session', {})).body;
  for (const [index, text] of intake.entries()) {
    const res = await request('turn', { ...session, text, eventId: 'http-' + index });
    check(() => assert.equal(res.code, 200));
  }
  for (const value of refusedValues) {
    const res = await request('turn', { ...session, text: 'Confirm', eventId: 'http-confirm',
      ...(value === undefined ? {} : { privacyConsent: value }) });
    check(() => assert.equal(res.code, 400));
    check(() => assert.deepEqual(res.body, { error: 'privacy_consent' }));
    const rows = await snapshot(store);
    check(() => assert.equal(rows.filter(([key]) => /^(test-handoff|handoff-receipt):/.test(key)).length, 0));
  }
  const accepted = await request('turn', { ...session, text: 'Confirm', eventId: 'http-confirm', privacyConsent: true });
  check(() => assert.equal(accepted.code, 200));
  check(() => assert.equal(accepted.body.handoff.status, 'received'));
}

async function main() {
  let state = respond(intake[0]);
  for (const text of intake.slice(1)) state = respond(text, state);
  for (const value of refusedValues) {
    check(() => assert.throws(() => respond('Confirm', state, { privacyConsent: value }), error => error.code === 'privacy_consent'));
    check(() => assert.equal(state.handoffPayload, undefined));
  }
  for (const alias of aliases) {
    check(() => assert.equal(respond(alias, state, { privacyConsent: true }).handoffPayload.consent, true));
  }
  await conversational('preview');
  await conversational('production');
  await formalConfirmation();
  await httpBoundary();
  console.log(`PASS ${checks} privacy consent checks (strict boolean, independent server refusal, no writes/model/transport before consent; mocked only)`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
