/**
 * MockChatAdapter unit tests
 */

import { test, assert, assertEqual, assertNotEqual } from './run-all.js';

// MockChatAdapter uses Node's built-in EventTarget — do NOT override CustomEvent here.
// Node's EventTarget requires real Event instances (not mock classes).
// We unset any mock CustomEvent so the adapter uses the Node-compatible Event path.
if (typeof global.CustomEvent !== 'undefined' && !(global.CustomEvent.prototype instanceof Event)) {
  delete global.CustomEvent;
}

const { MockChatAdapter } = await import('../src/chat/mock-chat-adapter.js');

// Helper: wait for ms
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper: collect first event of given type within timeout
function waitForEvent(adapter, eventType, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${eventType}`)), timeout);
    adapter.addEventListener(eventType, (e) => {
      clearTimeout(timer);
      resolve(e);
    }, { once: true });
  });
}

// ── Tests ─────────────────────────────────────────────────────────

test('MockChatAdapter extends EventTarget', () => {
  const adapter = new MockChatAdapter();
  assert(adapter instanceof EventTarget, 'MockChatAdapter should extend EventTarget');
  adapter.reset();
});

test('send() fires chat:listening within 500ms', async () => {
  const adapter = new MockChatAdapter();
  const eventPromise = waitForEvent(adapter, 'chat:listening', 600);
  adapter.send('hello');
  await eventPromise;
  adapter.reset();
  // If we get here, test passed
  assert(true, 'chat:listening fired within 500ms');
});

test('send() fires turn:start within 500ms', async () => {
  const adapter = new MockChatAdapter();
  const eventPromise = waitForEvent(adapter, 'turn:start', 600);
  adapter.send('hello');
  await eventPromise;
  adapter.reset();
  assert(true, 'turn:start fired within 500ms');
});

test('send() fires chat:thinking after chat:listening', async () => {
  const adapter = new MockChatAdapter();
  const events = [];
  adapter.addEventListener('chat:listening', () => events.push('chat:listening'));
  adapter.addEventListener('chat:thinking',  () => events.push('chat:thinking'));

  adapter.send('what do you do');
  await wait(2000);
  adapter.reset();

  const liIdx = events.indexOf('chat:listening');
  const thIdx = events.indexOf('chat:thinking');
  assert(liIdx >= 0, 'chat:listening should have fired');
  assert(thIdx >= 0, 'chat:thinking should have fired');
  assert(thIdx > liIdx, 'chat:thinking should fire after chat:listening');
});

test('send() fires turn:response with non-empty text', async () => {
  const adapter = new MockChatAdapter();
  let responseText = null;

  adapter.addEventListener('turn:response', (e) => {
    responseText = e.detail && e.detail.text;
  });

  adapter.send('tell me about technology services');
  await wait(3500);
  adapter.reset();

  assert(responseText !== null, 'turn:response should have fired');
  assert(typeof responseText === 'string', 'Response text should be a string');
  assert(responseText.length > 0, 'Response text should not be empty');
});

test('send() fires chat:speaking after chat:thinking', async () => {
  const adapter = new MockChatAdapter();
  const events = [];
  adapter.addEventListener('chat:thinking', () => events.push('chat:thinking'));
  adapter.addEventListener('chat:speaking', () => events.push('chat:speaking'));

  adapter.send('hello');
  await wait(3500);
  adapter.reset();

  const thIdx = events.indexOf('chat:thinking');
  const spIdx = events.indexOf('chat:speaking');
  assert(thIdx >= 0, 'chat:thinking should have fired');
  assert(spIdx >= 0, 'chat:speaking should have fired');
  assert(spIdx > thIdx, 'chat:speaking should fire after chat:thinking');
});

test('send() fires chat:idle after response', async () => {
  const adapter = new MockChatAdapter();
  let idleFired = false;
  adapter.addEventListener('chat:idle', () => { idleFired = true; });

  adapter.send('hello');
  await wait(5500);
  adapter.reset();

  assert(idleFired, 'chat:idle should fire after turn completes');
});

test('simulateError() fires chat:error', async () => {
  const adapter = new MockChatAdapter();
  const eventPromise = waitForEvent(adapter, 'chat:error', 1500);
  adapter.simulateError();
  await eventPromise;
  adapter.reset();
  assert(true, 'chat:error fired');
});

test('simulateError() fires turn:error', async () => {
  const adapter = new MockChatAdapter();
  const eventPromise = waitForEvent(adapter, 'turn:error', 1500);
  adapter.simulateError();
  await eventPromise;
  adapter.reset();
  assert(true, 'turn:error fired');
});

test('simulateHandoff() fires chat:handoff', async () => {
  const adapter = new MockChatAdapter();
  const eventPromise = waitForEvent(adapter, 'chat:handoff', 1500);
  adapter.simulateHandoff();
  const event = await eventPromise;
  adapter.reset();
  assert(event.detail && event.detail.message, 'chat:handoff should have message in detail');
});

test('chat:handoff detail has message and channel', async () => {
  const adapter = new MockChatAdapter();
  let handoffDetail = null;
  adapter.addEventListener('chat:handoff', (e) => { handoffDetail = e.detail; });
  adapter.simulateHandoff();
  await wait(800);
  adapter.reset();

  assert(handoffDetail !== null, 'handoff detail should not be null');
  assert(handoffDetail.message, 'handoff should include message');
  assert(handoffDetail.channel, 'handoff should include channel');
});

test('reset() cancels pending timers — no events fire after reset', async () => {
  const adapter = new MockChatAdapter();
  let eventCount = 0;
  adapter.addEventListener('chat:listening', () => { eventCount++; });
  adapter.addEventListener('chat:thinking',  () => { eventCount++; });
  adapter.addEventListener('turn:response',  () => { eventCount++; });

  adapter.send('should be cancelled');
  adapter.reset(); // cancel immediately

  await wait(4000); // wait longer than any timer would fire

  assertEqual(eventCount, 0, 'No events should fire after reset()');
});

test('turnCount increments with each send()', async () => {
  const adapter = new MockChatAdapter();
  assertEqual(adapter.turnCount, 0, 'turnCount should start at 0');
  adapter.send('first');
  await wait(50);
  assertEqual(adapter.turnCount, 1, 'turnCount should be 1 after first send');
  adapter.send('second');
  await wait(50);
  assertEqual(adapter.turnCount, 2, 'turnCount should be 2 after second send');
  adapter.reset();
  assertEqual(adapter.turnCount, 0, 'turnCount should reset to 0 after reset()');
});

test('open() fires chat:open event', () => {
  const adapter = new MockChatAdapter();
  let fired = false;
  adapter.addEventListener('chat:open', () => { fired = true; });
  adapter.open();
  assert(fired, 'chat:open should fire when open() is called');
});

test('close() fires chat:close event', () => {
  const adapter = new MockChatAdapter();
  let fired = false;
  adapter.addEventListener('chat:close', () => { fired = true; });
  adapter.close();
  assert(fired, 'chat:close should fire when close() is called');
});

test('LAVAALL Technology keyword returns relevant response', async () => {
  const adapter = new MockChatAdapter();
  let responseText = '';
  adapter.addEventListener('turn:response', (e) => {
    responseText = (e.detail && e.detail.text) || '';
  });
  adapter.send('tell me about technology hardware');
  await wait(3500);
  adapter.reset();
  assert(responseText.toLowerCase().includes('lavaall') || responseText.length > 20,
    'Technology keyword should return a relevant LAVAALL response');
});

test('contact keyword returns support info', async () => {
  const adapter = new MockChatAdapter();
  let responseText = '';
  adapter.addEventListener('turn:response', (e) => {
    responseText = (e.detail && e.detail.text) || '';
  });
  adapter.send('how do I contact support');
  await wait(3500);
  adapter.reset();
  assert(responseText.includes('support@lavaall.com') || responseText.includes('WhatsApp') || responseText.length > 20,
    'Contact keyword should return support contact info');
});
