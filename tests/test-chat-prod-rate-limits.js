'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { memoryStore } = require('../api/_chat/store');
const { createService } = require('../api/_chat/service');

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const SALT = 'TEST ONLY rate limit salt';
const IP = 'TEST ONLY rate limit IP';
let checks = 0;

async function check(name, run) {
  await run();
  checks++;
  console.log('PASS ' + name);
}

function fixture(time, previewLimits = false) {
  let clock = time;
  let vendorCalls = 0;
  const store = memoryStore();
  const options = {
    store,
    now: () => clock,
    salt: SALT,
    previewLimits,
    alert: () => {},
    chat: async () => {
      vendorCalls++;
      return { text: 'TEST ONLY reply', costUsd: 0 };
    },
  };
  return {
    store,
    service: createService(options),
    anotherService: () => createService(options),
    at: value => { clock = value; },
    records: () => store.transaction(records => [...records]),
    vendorCalls: () => vendorCalls,
  };
}

const quota = run => assert.rejects(run, error => error.code === 'quota');
const ipHash = crypto.createHmac('sha256', SALT).update(IP).digest('hex');
const key = (prefix, time, window) => prefix + ':' + ipHash + Math.floor(time / window);
async function startMany(service, count) {
  for (let index = 0; index < count; index++) await service.start(IP);
}
const turn = (service, session, event) => service.turn(
  session.sessionId, session.proof, event, undefined, session.csrf, 'Hello',
);

async function main() {
  await check('production uses exactly three sessions per UTC Unix-hour bucket', async () => {
    const boundary = Date.UTC(2026, 10, 15, 17);
    const f = fixture(boundary - 500);
    await startMany(f.service, 3);
    await quota(() => f.service.start(IP));
    let records = new Map(await f.records());
    assert.deepEqual(records.get(key('h', boundary - 500, HOUR)), { n: 3, exp: boundary });
    assert.deepEqual(records.get(key('d', boundary - 500, DAY)), {
      n: 3, exp: Date.UTC(2026, 10, 16),
    });
    // A new UTC hour allows three more after only 500 ms, not 60 minutes.
    f.at(boundary);
    await startMany(f.service, 3);
    await quota(() => f.service.start(IP));
    records = new Map(await f.records());
    assert.equal(records.has(key('h', boundary - 500, HOUR)), false);
    assert.deepEqual(records.get(key('h', boundary, HOUR)), { n: 3, exp: boundary + HOUR });
    assert.equal(records.get(key('d', boundary, DAY)).n, 6);
  });

  await check('production uses exactly six sessions per UTC Unix-day bucket', async () => {
    const midnight = Date.UTC(2026, 10, 16);
    const f = fixture(midnight - 2 * HOUR - 500);
    await startMany(f.service, 3);
    f.at(midnight - 2 * HOUR);
    await startMany(f.service, 3);
    // Move to another hour, so the rejection must come from the daily quota.
    f.at(midnight - 1);
    await quota(() => f.service.start(IP));
    const before = new Map(await f.records());
    assert.deepEqual(before.get(key('d', midnight - 1, DAY)), { n: 6, exp: midnight });
    assert.equal(before.has(key('h', midnight - 1, HOUR)), false);
    // Midnight resets the daily bucket despite the prior starts being recent.
    f.at(midnight);
    await startMany(f.service, 3);
    const after = new Map(await f.records());
    assert.equal(after.has(key('d', midnight - 1, DAY)), false);
    assert.deepEqual(after.get(key('d', midnight, DAY)), { n: 3, exp: midnight + DAY });
  });

  await check('production hourly cap is atomic across shared service instances', async () => {
    const f = fixture(Date.UTC(2026, 10, 15, 12));
    const services = [f.service, f.anotherService()];
    const attempts = await Promise.allSettled(Array.from({ length: 12 }, (_, index) => (
      services[index % services.length].start(IP)
    )));
    assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 3);
    assert.equal(attempts.filter(result => result.status === 'rejected').length, 9);
    for (const result of attempts.filter(result => result.status === 'rejected')) {
      assert.equal(result.reason.code, 'quota');
    }
  });

  await check('production allows ten turns within one fixed 30-minute session', async () => {
    const start = Date.UTC(2026, 10, 15, 12, 45);
    const f = fixture(start);
    const session = await f.service.start(IP);
    for (let index = 0; index < 9; index++) await turn(f.service, session, 'prod-' + index);
    f.at(start + 30 * 60 * 1000 - 1);
    await turn(f.service, session, 'prod-9');
    await quota(() => turn(f.service, session, 'prod-10'));
    const records = new Map(await f.records());
    assert.equal(records.get('s:' + session.sessionId).turns, 10);
    assert.equal(records.get('s:' + session.sessionId).exp, start + 30 * 60 * 1000);
    // Turns do not renew expiry, even when the session crosses a UTC hour.
    f.at(start + 30 * 60 * 1000);
    await assert.rejects(() => turn(f.service, session, 'prod-expired'), error => error.code === 'session');
    assert.equal(f.vendorCalls(), 0);
  });

  await check('preview retains exactly twenty sessions per hour and thirty per day', async () => {
    const start = Date.UTC(2026, 10, 15, 12);
    const f = fixture(start, true);
    await startMany(f.service, 20);
    await quota(() => f.service.start(IP));
    f.at(start + HOUR);
    await startMany(f.service, 10);
    await quota(() => f.service.start(IP));
    const records = new Map(await f.records());
    assert.deepEqual(records.get(key('h', start + HOUR, HOUR)), { n: 10, exp: start + 2 * HOUR });
    assert.deepEqual(records.get(key('d', start, DAY)), {
      n: 30, exp: Date.UTC(2026, 10, 16),
    });
  });

  await check('preview retains exactly twenty turns per 30-minute session', async () => {
    const start = Date.UTC(2026, 10, 15, 12);
    const f = fixture(start, true);
    const session = await f.service.start(IP);
    for (let index = 0; index < 20; index++) await turn(f.service, session, 'preview-' + index);
    await quota(() => turn(f.service, session, 'preview-20'));
    assert.equal(new Map(await f.records()).get('s:' + session.sessionId).turns, 20);
    f.at(start + 30 * 60 * 1000);
    await assert.rejects(() => turn(f.service, session, 'preview-expired'), error => error.code === 'session');
    assert.equal(f.vendorCalls(), 0);
  });

  console.log(`${checks}/${checks} passed`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
