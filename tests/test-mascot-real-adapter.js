'use strict';
// End-to-end, local only: Bob's RealChatAdapter talking to the real api/chat-inquiry handler over
// loopback HTTP with an in-memory store. The model and the contact transport are stubs that count
// calls; no network beyond 127.0.0.1 and no paid calls.
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createHandler } = require('../api/chat-inquiry');
const { memoryStore } = require('../api/_chat/store');

(async () => {
  const { RealChatAdapter } = await import(pathToFileURL(path.join(__dirname, '../mascot/src/chat/real-chat-adapter.js')).href);
  const store = memoryStore();
  let modelCalls = 0, transportCalls = 0;
  const prompts = [];
  const chat = async ({ messages }) => {
    modelCalls++;
    prompts.push(messages);
    return { content: "We deliver depending on your location. We're reachable 24/7 on WhatsApp and email: support@lavaall.com or WhatsApp +1 (737) 704-4182. Which city are you in?", usage: { prompt_tokens: 1, completion_tokens: 1 }, costUsd: 0, model: 'deepseek-flash', provider: 'deepseek' };
  };
  const transport = async () => { transportCalls++; throw new Error('transport must never be called'); };

  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', async () => {
      const url = new URL(req.url, 'http://127.0.0.1');
      const shim = {
        statusCode: 200, headers: {},
        setHeader(k, v) { this.headers[k] = v; res.setHeader(k, v); },
        status(code) { this.statusCode = code; return this; },
        send(body) { res.statusCode = this.statusCode; res.end(body); },
      };
      await handler({ method: req.method, headers: req.headers, query: Object.fromEntries(url.searchParams), body: raw || undefined }, shim);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const handler = createHandler({ runtime: 'test', localTests: true, CHAT_ENABLED: true, store, transport, chat, trustedOrigins: [origin], salt: 'TEST ONLY salt' });

  // Browser-like fetch: same-origin cookie jar + Origin header, relative URLs.
  let cookie = '';
  const browserFetch = async (url, init = {}) => {
    const headers = { ...(init.headers || {}), Origin: origin };
    if (cookie && init.credentials === 'include') headers.Cookie = cookie;
    const response = await fetch(origin + url, { method: init.method, headers, body: init.body });
    const set = response.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return response;
  };
  const crypto = require('node:crypto').webcrypto;
  const adapter = new RealChatAdapter({ fetch: browserFetch, crypto, listenMs: 0 });
  const events = [];
  for (const name of ['chat:listening', 'chat:thinking', 'chat:speaking', 'chat:chips', 'chat:idle', 'chat:error', 'chat:handoff', 'request:review', 'request:confirmed', 'request:unconfirmed']) {
    adapter.addEventListener(name, e => events.push({ name, detail: e.detail }));
  }
  const turn = text => new Promise(resolve => {
    const done = () => { adapter.removeEventListener('chat:idle', done); adapter.removeEventListener('chat:error', done); resolve(); };
    adapter.addEventListener('chat:idle', done); adapter.addEventListener('chat:error', done);
    adapter.send(text);
  });
  const spoken = () => events.filter(e => e.name === 'chat:speaking').map(e => e.detail.text);
  const count = name => events.filter(e => e.name === name).length;

  try {
    // 1. A free-form question reaches the (stubbed) model with verified facts from the knowledge pack.
    await turn('Which brands of routers would suit a small clinic?');
    assert.equal(modelCalls, 1, 'model not called; reply: ' + spoken().pop());
    const user = prompts[0][1].content;
    assert.match(user, /Verified LAVAALL facts \(public knowledge pack v1\)/);
    assert.match(user, /Routers & Networking/);
    assert.match(prompts[0][0].content, /I don't have that information\./);
    console.log('ok - model prompt carries knowledge-pack facts');

    // 2. Catalogue narrowing goes through the real backend with zero model calls.
    await turn('iPhone 16');
    assert.equal(count('chat:error'), 0, JSON.stringify(events.filter(e => e.name === 'chat:error')));
    assert.match(spoken().pop(), /iPhone 16/);
    assert.equal(modelCalls, 1, 'catalogue turn adds no model call');
    assert.ok(cookie.startsWith('lavaall_chat='), 'HttpOnly proof cookie was set and reused');
    assert.deepEqual(events.slice(-5).map(e => e.name), ['chat:listening', 'chat:thinking', 'chat:speaking', 'chat:chips', 'chat:idle']);
    console.log('ok - catalogue turn through the real handler, 0 model calls');

    // 3. Handoff on this branch's server (92157c9 flow, no Confirm step yet): the adapter must NOT
    //    claim a confirmed request, and says so with request:unconfirmed.
    await turn('I want to speak to someone');
    assert.equal(spoken().pop(), 'Yes, sure. Can I get your first and last name?');
    await turn('Ada Test');
    await turn('ada@example.test');
    assert.match(spoken().pop(), /someone from our team will reach out to you shortly/i);
    assert.equal(count('request:confirmed'), 0, 'no request:confirmed without an explicit Confirm');
    assert.equal(count('request:unconfirmed'), 1);
    assert.equal(transportCalls, 0);
    const sinks = await store.transaction(rows => [...rows].filter(([key]) => key.startsWith('test-handoff:')));
    assert.equal(sinks.length, 1, 'server still writes the Preview test record on this base (Mark adds the Confirm gate)');
    console.log('ok - handoff without Confirm never fires request:confirmed');

    // 4. The adapter never touched review/confirm/draft or any contact endpoint.
    assert.equal(transportCalls, 0);
    console.log('ok - no transport, review, confirm or contact calls');
  } finally {
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
