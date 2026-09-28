// Founders thread: native OS alerts via Web Push. No Slack. No message text.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const opsDir = path.join(__dirname, '../api/ops');
const lib = require(path.join(opsDir, '_lib.js'));
const ops = require(path.join(opsDir, 'index.js'));
const dm = require(path.join(opsDir, '_founders_dm.js'));
const push = require(path.join(opsDir, '_founders_dm_push.js'));
const webPush = require(path.join(opsDir, '_web_push.js'));

const SECRET = 'test-ops-auth-secret-32chars!!';
const OSMAN = 'osmanjalloh104@gmail.com';
const HAMEED = 'abdulhbah55@gmail.com';
const OUTSIDER = 'ada@example.com';
const ENC_KEY = crypto.randomBytes(32).toString('base64');
const SUBJECT = 'mailto:ops@lavaall.com';

const results = [];
function check(name, cond) { results.push({ name, pass: !!cond }); }

function mockRes() {
  const res = { statusCode: 200, headers: {}, body: null, raw: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.setHeader = (k, v) => { res.headers[k] = v; return res; };
  res.send = (b) => {
    res.raw = b;
    if (typeof b === 'string' && (b.startsWith('{') || b.startsWith('['))) {
      try { res.body = JSON.parse(b); } catch { res.body = b; }
    } else {
      res.body = b;
    }
    return res;
  };
  return res;
}

function cookieFor(email) {
  return `${lib.SESSION_COOKIE}=${encodeURIComponent(lib.createSessionToken(email))}`;
}

function authed(email, extra) {
  const asJson = !extra || extra.json !== false;
  return {
    method: extra && extra.method ? extra.method : 'GET',
    headers: Object.assign({
      cookie: extra && Object.prototype.hasOwnProperty.call(extra, 'cookie') ? extra.cookie : cookieFor(email),
      host: 'preview.example.test',
      accept: asJson ? 'application/json' : 'text/html',
      'content-type': 'application/json',
    }, extra && extra.headers),
    query: extra && extra.query ? extra.query : {},
    url: extra && extra.url ? extra.url : '/ops/api/founders-dm',
    body: extra && extra.body,
  };
}

function enableThread() {
  process.env.FOUNDERS_DM_ENABLED = '1';
  process.env.FOUNDERS_DM_ENC_KEY = ENC_KEY;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  delete process.env.OPS_STORE_FILE;
  delete process.env.VERCEL;
}

function clearPushEnv() {
  delete process.env.FOUNDERS_DM_PUSH_ENABLED;
  delete process.env.FOUNDERS_DM_VAPID_PUBLIC_KEY;
  delete process.env.FOUNDERS_DM_VAPID_PRIVATE_KEY;
  delete process.env.FOUNDERS_DM_VAPID_SUBJECT;
  delete process.env.FOUNDERS_DM_CEO_ENABLED;
  delete process.env.XAI_API_KEY;
}

function vapidPair() {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  return {
    publicKey: ecdh.getPublicKey().toString('base64url'),
    privateKey: ecdh.getPrivateKey().toString('base64url'),
  };
}

function device(label) {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const auth = crypto.randomBytes(16);
  return {
    endpoint: `https://push.example.test/${label}-${crypto.randomBytes(3).toString('hex')}`,
    keys: {
      p256dh: ecdh.getPublicKey().toString('base64url'),
      auth: auth.toString('base64url'),
    },
    privateKey: ecdh.getPrivateKey(),
    auth,
  };
}

function setVapid(pair) {
  process.env.FOUNDERS_DM_PUSH_ENABLED = '1';
  process.env.FOUNDERS_DM_VAPID_PUBLIC_KEY = pair.publicKey;
  process.env.FOUNDERS_DM_VAPID_PRIVATE_KEY = pair.privateKey;
  process.env.FOUNDERS_DM_VAPID_SUBJECT = SUBJECT;
}

async function post(email, body) {
  const res = mockRes();
  await ops(authed(email, { method: 'POST', body }), res);
  return res;
}

async function send(email, text) {
  return post(email, { text, csrf: lib.createCsrfToken(email) });
}

function pushCalls(calls) {
  return calls.filter((call) => String(call.url).includes('push.example.test'));
}

function headerValue(headers, name) {
  const key = Object.keys(headers || {}).find((item) => item.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : '';
}

async function run() {
  const origFetch = global.fetch;
  const origLog = console.log;
  const logs = [];
  console.log = (...args) => {
    logs.push(args.map((part) => String(part)).join(' '));
  };
  const calls = [];
  let pushStatus = 201;
  let pushThrow = false;
  global.fetch = async (url, opts) => {
    const href = String(url);
    calls.push({
      url: href,
      body: opts && opts.body,
      headers: opts && opts.headers ? opts.headers : {},
    });
    if (href.includes('api.x.ai')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: 'Kits are active.' } }] }),
      };
    }
    if (pushThrow) throw new Error('push down');
    return { ok: pushStatus >= 200 && pushStatus < 300, status: pushStatus, json: async () => ({}) };
  };

  process.env.OPS_AUTH_SECRET = SECRET;
  enableThread();
  clearPushEnv();
  dm.resetFoundersDm();

  const join = (value) => String(value).replace(/\s+/g, '');
  const uaPublic = Buffer.from(join('BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcx aOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4'), 'base64url');
  const uaPrivate = Buffer.from('q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94', 'base64url');
  const asPublic = Buffer.from(join('BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIg Dll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8'), 'base64url');
  const asPrivate = Buffer.from('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw', 'base64url');
  const salt = Buffer.from('DGv6ra1nlYgDCS1FRnbzlw', 'base64url');
  const auth = Buffer.from('BTBZMqHH6r4Tts7J_aSIgg', 'base64url');
  const expected = Buffer.from(join('DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN'), 'base64url');
  const vector = webPush.encryptAes128gcm({
    payload: 'When I grow up, I want to be a watermelon',
    userPublicKey: uaPublic,
    authSecret: auth,
    salt,
    asPublicKey: asPublic,
    asPrivateKey: asPrivate,
    padTo: Buffer.byteLength('When I grow up, I want to be a watermelon') + 1,
  });
  const opened = webPush.decryptAes128gcm({ body: vector, userPrivateKey: uaPrivate, authSecret: auth });
  check('aes128gcm matches the RFC 8291 example',
    vector.equals(expected) && opened && opened.toString() === 'When I grow up, I want to be a watermelon');

  const sentAt = '2026-09-28T02:18:00.000Z';
  const samples = [
    'zebra-secret-99',
    'a'.repeat(1800),
    '{"title":"leak"}',
    'ciphertext',
    'New message from someone else',
    'Hamid',
  ];
  const osmanPayload = push.buildPushPayload('Osman', sentAt);
  const hameedPayload = push.buildPushPayload('Hameed', sentAt);
  check('the payload has only sender metadata',
    Object.keys(osmanPayload).join(',') === 'title,body,sentAt,tag'
    && osmanPayload.title === 'LAVAALL'
    && osmanPayload.body === 'New message from Osman'
    && osmanPayload.sentAt === sentAt
    && osmanPayload.tag === 'founders-chat'
    && hameedPayload.body === 'New message from Hameed'
    && samples.every((text) => !JSON.stringify(osmanPayload).includes(text) && !JSON.stringify(hameedPayload).includes(text)));

  check('the push flag accepts 1, true, or on only', push.foundersDmPushEnabled() === false);
  process.env.FOUNDERS_DM_PUSH_ENABLED = 'yes';
  check('yes does not turn push on', push.foundersDmPushEnabled() === false);
  process.env.FOUNDERS_DM_PUSH_ENABLED = 'on';
  check('on turns push on', push.foundersDmPushEnabled() === true);
  clearPushEnv();

  const pair = vapidPair();
  const hameedDevice = device('hameed');
  const osmanDevice = device('osman');
  calls.length = 0;
  const quiet = await send(OSMAN, 'flag-off-body-zebra');
  check('flag off stores the message and does not push',
    quiet.statusCode === 200
    && quiet.body.messages.some((row) => row.text === 'flag-off-body-zebra')
    && pushCalls(calls).length === 0);

  process.env.FOUNDERS_DM_PUSH_ENABLED = '1';
  calls.length = 0;
  dm.resetFoundersDm();
  const missingKeys = await send(OSMAN, 'missing-keys-body-zebra');
  check('missing VAPID keys still send and do not push',
    missingKeys.statusCode === 200
    && pushCalls(calls).length === 0
    && logs.some((line) => line.includes('"reason":"vapid"')));
  setVapid(pair);

  const noCsrf = await post(OSMAN, { action: 'push-subscribe', subscription: hameedDevice });
  check('subscribe without CSRF is rejected', noCsrf.statusCode === 403 && noCsrf.body.error === 'csrf');
  const outsider = await post(OUTSIDER, {
    action: 'push-subscribe',
    subscription: hameedDevice,
    csrf: lib.createCsrfToken(OUTSIDER),
  });
  check('a non-founder cannot subscribe', outsider.statusCode === 403);
  const bad = await post(HAMEED, {
    action: 'push-subscribe',
    subscription: { endpoint: 'http://push.example.test/nope', keys: hameedDevice.keys },
    csrf: lib.createCsrfToken(HAMEED),
  });
  check('a non-https subscription is rejected', bad.statusCode === 400 && bad.body.error === 'invalid_subscription');

  const subHameed = await post(HAMEED, {
    action: 'push-subscribe',
    subscription: hameedDevice,
    csrf: lib.createCsrfToken(HAMEED),
  });
  const subAgain = await post(HAMEED, {
    action: 'push-subscribe',
    subscription: hameedDevice,
    csrf: lib.createCsrfToken(HAMEED),
  });
  check('a founder can subscribe and a repeat endpoint is one device',
    subHameed.statusCode === 200 && subAgain.statusCode === 200);
  calls.length = 0;
  const first = await send(OSMAN, 'private-osman-body-zebra');
  const firstPushes = pushCalls(calls);
  const firstHeaders = firstPushes[0] && firstPushes[0].headers;
  const firstPlain = firstPushes[0]
    ? webPush.decryptAes128gcm({
      body: firstPushes[0].body,
      userPrivateKey: hameedDevice.privateKey,
      authSecret: hameedDevice.auth,
    })
    : null;
  const firstJson = firstPlain ? JSON.parse(firstPlain.toString()) : null;
  check('every Osman send pushes only to Hameed, with metadata and no message text',
    first.statusCode === 200
    && firstPushes.length === 1
    && firstPushes[0].url === hameedDevice.endpoint
    && headerValue(firstHeaders, 'TTL') === '86400'
    && headerValue(firstHeaders, 'Urgency') === 'high'
    && headerValue(firstHeaders, 'Content-Encoding') === 'aes128gcm'
    && String(headerValue(firstHeaders, 'Authorization')).startsWith('vapid ')
    && firstJson
    && firstJson.body === 'New message from Osman'
    && firstJson.tag === 'founders-chat'
    && firstJson.title === 'LAVAALL'
    && !firstPlain.toString().includes('private-osman-body-zebra')
    && !Buffer.from(firstPushes[0].body).toString('utf8').includes('private-osman-body-zebra'));

  calls.length = 0;
  await send(OSMAN, 'second-osman-body-zebra');
  check('a second send still pushes, with no debounce', pushCalls(calls).length === 1);

  const subOsman = await post(OSMAN, {
    action: 'push-subscribe',
    subscription: osmanDevice,
    csrf: lib.createCsrfToken(OSMAN),
  });
  calls.length = 0;
  const reply = await send(HAMEED, 'private-hameed-body-zebra');
  const replyPushes = pushCalls(calls);
  const replyPlain = webPush.decryptAes128gcm({
    body: replyPushes[0] && replyPushes[0].body,
    userPrivateKey: osmanDevice.privateKey,
    authSecret: osmanDevice.auth,
  });
  check('Hameed\'s reply pushes only to Osman',
    subOsman.statusCode === 200
    && reply.statusCode === 200
    && replyPushes.length === 1
    && replyPushes[0].url === osmanDevice.endpoint
    && replyPlain
    && replyPlain.toString().includes('New message from Hameed')
    && !replyPlain.toString().includes('private-hameed-body-zebra'));

  calls.length = 0;
  process.env.FOUNDERS_DM_CEO_ENABLED = '1';
  process.env.XAI_API_KEY = 'test-xai-key';
  await send(OSMAN, 'CEO, kits? secret-ceo-question-zebra');
  delete process.env.FOUNDERS_DM_CEO_ENABLED;
  delete process.env.XAI_API_KEY;
  const ceoPushes = pushCalls(calls);
  const ceoPlain = ceoPushes[0]
    ? webPush.decryptAes128gcm({
      body: ceoPushes[0].body,
      userPrivateKey: hameedDevice.privateKey,
      authSecret: hameedDevice.auth,
    })
    : null;
  check('a CEO reply does not add a second push and the alert has no message text',
    ceoPushes.length === 1
    && ceoPushes[0].url === hameedDevice.endpoint
    && ceoPlain
    && !ceoPlain.toString().includes('secret-ceo-question-zebra')
    && !ceoPlain.toString().includes('Kits are active'));

  const extra = [];
  for (let i = 0; i < 5; i += 1) extra.push(device(`more-${i}`));
  for (const row of extra) {
    const saved = await post(HAMEED, {
      action: 'push-subscribe',
      subscription: row,
      csrf: lib.createCsrfToken(HAMEED),
    });
    check(`device ${row.endpoint} subscribed`, saved.statusCode === 200);
  }
  calls.length = 0;
  await send(OSMAN, 'cap-body-zebra');
  const capped = pushCalls(calls).map((call) => call.url);
  check('a founder keeps at most five devices and drops the oldest',
    capped.length === 5
    && !capped.includes(hameedDevice.endpoint)
    && extra.every((row) => capped.includes(row.endpoint)));

  calls.length = 0;
  pushStatus = 410;
  const gone = await send(OSMAN, 'gone-body-zebra');
  pushStatus = 201;
  calls.length = 0;
  await send(OSMAN, 'after-gone-body-zebra');
  check('a 410 removes that subscription and the send still succeeds',
    gone.statusCode === 200 && pushCalls(calls).length === 0);

  dm.resetFoundersDm();
  await post(HAMEED, {
    action: 'push-subscribe',
    subscription: hameedDevice,
    csrf: lib.createCsrfToken(HAMEED),
  });
  calls.length = 0;
  pushThrow = true;
  const thrown = await send(OSMAN, 'throw-body-zebra');
  pushThrow = false;
  check('a push failure does not fail the founder send',
    thrown.statusCode === 200
    && thrown.body.messages.some((row) => row.text === 'throw-body-zebra'));

  const off = await post(HAMEED, {
    action: 'push-unsubscribe',
    endpoint: hameedDevice.endpoint,
    csrf: lib.createCsrfToken(HAMEED),
  });
  calls.length = 0;
  await send(OSMAN, 'after-off-body-zebra');
  check('turn off removes the device', off.statusCode === 200 && pushCalls(calls).length === 0);

  clearPushEnv();
  const pageOff = mockRes();
  await ops(authed(OSMAN, { json: false, url: '/ops/founders' }), pageOff);
  setVapid(pair);
  const pageOn = mockRes();
  await ops(authed(OSMAN, { json: false, url: '/ops/founders' }), pageOn);
  const privateKey = pair.privateKey;
  check('the button and public key appear only when push is configured',
    !String(pageOff.raw).includes('Turn on notifications')
    && String(pageOn.raw).includes('Turn on notifications')
    && String(pageOn.raw).includes('Turn off')
    && String(pageOn.raw).includes(push.IOS_HINT)
    && String(pageOn.raw).includes(pair.publicKey)
    && !String(pageOn.raw).includes(privateKey)
    && String(pageOn.raw).includes('rel="manifest" href="/ops-manifest.webmanifest"'));
  const shell = fs.readFileSync(path.join(opsDir, '_shell.js'), 'utf8');
  check('the ops page CSP stays on this origin',
    shell.includes("default-src 'self'")
    && shell.includes("connect-src 'self'")
    && !shell.includes('fcm.googleapis.com')
    && !shell.includes('push.example'));

  const sw = mockRes();
  await ops({ method: 'GET', headers: {}, query: {}, url: '/ops-sw.js' }, sw);
  const manifest = mockRes();
  await ops({ method: 'GET', headers: {}, query: { area: 'ops-manifest' }, url: '/api/ops' }, manifest);
  const swText = String(sw.raw);
  const manifestJson = JSON.parse(String(manifest.raw));
  const vercel = JSON.parse(fs.readFileSync(path.join(__dirname, '../vercel.json'), 'utf8'));
  const swHeaders = vercel.headers.find((row) => row.source === '/ops-sw.js');
  check('the service worker is served at /ops-sw.js with scope and no-cache',
    sw.statusCode === 200
    && sw.headers['Content-Type'] === 'application/javascript; charset=utf-8'
    && sw.headers['Cache-Control'] === 'no-cache'
    && sw.headers['Service-Worker-Allowed'] === '/ops'
    && swText.includes('showNotification')
    && swText.includes('renotify: true')
    && swText.includes('https://www.lavaall.com/ops/founders')
    && swText.includes('notificationclick')
    && vercel.rewrites.some((row) => row.source === '/ops-sw.js' && row.destination === '/api/ops?area=ops-sw')
    && swHeaders.headers.some((row) => row.key === 'Cache-Control' && row.value === 'no-cache')
    && swHeaders.headers.some((row) => row.key === 'Service-Worker-Allowed' && row.value === '/ops'));
  check('the manifest is LAVAALL OS, standalone, and uses the existing logo',
    manifest.statusCode === 200
    && manifest.headers['Content-Type'] === 'application/manifest+json; charset=utf-8'
    && manifestJson.name === 'LAVAALL OS'
    && manifestJson.display === 'standalone'
    && manifestJson.start_url === '/ops'
    && manifestJson.scope === '/ops'
    && manifestJson.icons.some((icon) => icon.src === '/images/logo.png')
    && manifestJson.icons.some((icon) => icon.src === '/images/logo.webp'));

  const env = fs.readFileSync(path.join(__dirname, '../.env.example'), 'utf8');
  const threadSrc = fs.readFileSync(path.join(opsDir, '_founders_dm.js'), 'utf8');
  const pushSrc = fs.readFileSync(path.join(opsDir, '_founders_dm_push.js'), 'utf8');
  check('.env.example documents push as off and does not set VAPID keys',
    env.includes('FOUNDERS_DM_PUSH_ENABLED')
    && env.includes('FOUNDERS_DM_VAPID_PUBLIC_KEY')
    && env.includes('FOUNDERS_DM_VAPID_PRIVATE_KEY')
    && env.includes('FOUNDERS_DM_VAPID_SUBJECT')
    && env.includes('npx web-push generate-vapid-keys')
    && !env.includes('FOUNDERS_DM_NOTIFY_SLACK')
    && !env.includes('FOUNDERS_DM_SLACK_IDS')
    && !/^FOUNDERS_DM_PUSH_ENABLED=.+/m.test(env)
    && !/^FOUNDERS_DM_VAPID_PUBLIC_KEY=.+/m.test(env)
    && !/^FOUNDERS_DM_VAPID_PRIVATE_KEY=.+/m.test(env)
    && !/^FOUNDERS_DM_VAPID_SUBJECT=.+/m.test(env));
  check('founders code does not name Slack or the private store key from the push helper',
    !/slack/i.test(threadSrc)
    && !/slack/i.test(pushSrc)
    && !pushSrc.includes("require('./_founders_dm')")
    && !pushSrc.includes('lavaall-ops-founders-dm-v1')
    && !threadSrc.includes(privateKey));

  const client = fs.readFileSync(path.join(__dirname, '../assets/js/ops-founders-dm.js'), 'utf8');
  const permissionCalls = [];
  const form = { listeners: {}, addEventListener(name, fn) { this.listeners[name] = fn; } };
  const onBtn = { hidden: true, listeners: {}, addEventListener(name, fn) { this.listeners[name] = fn; } };
  const offBtn = { hidden: true, listeners: {}, addEventListener(name, fn) { this.listeners[name] = fn; } };
  const ios = { hidden: true };
  const box = { hidden: true };
  const doc = {
    hidden: true,
    focused: false,
    hasFocus() { return false; },
    listeners: {},
    getElementById(id) {
      if (id === 'founders-dm') return { id: 'founders-dm' };
      if (id === 'founders-dm-data') {
        return { textContent: JSON.stringify({ csrf: 'tok', pollMs: 4000, badgeMs: 8000, push: { publicKey: pair.publicKey } }) };
      }
      if (id === 'dm-form') return form;
      if (id === 'dm-text') return { value: '' };
      if (id === 'dm-status') return { textContent: '' };
      if (id === 'dm-thread') return { children: [], appendChild() {}, scrollHeight: 0, scrollTop: 0, clientHeight: 0 };
      if (id === 'dm-empty') return { hidden: true };
      if (id === 'dm-new') return { hidden: true, addEventListener() {} };
      if (id === 'dm-push') return box;
      if (id === 'dm-push-on') return onBtn;
      if (id === 'dm-push-off') return offBtn;
      if (id === 'dm-push-ios') return ios;
      return null;
    },
    querySelector() { return null; },
    addEventListener(name, fn) { this.listeners[name] = fn; },
    createElement() {
      return { className: '', attrs: {}, children: [], setAttribute() {}, appendChild() {} };
    },
  };
  const sandbox = {
    document: doc,
    navigator: {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      serviceWorker: { register() { return Promise.resolve({ pushManager: { getSubscription() { return Promise.resolve(null); }, subscribe() { return Promise.resolve(null); } } }); } },
      standalone: false,
    },
    Notification: function Notification() {},
    PushManager: function PushManager() {},
    fetch: () => Promise.resolve({ ok: true, json: async () => ({ messages: [], unread: 0 }) }),
    setInterval() { return 1; },
    addEventListener() {},
    matchMedia() { return { matches: false }; },
    atob(value) { return Buffer.from(value, 'base64').toString('binary'); },
  };
  sandbox.Notification.permission = 'default';
  sandbox.Notification.requestPermission = () => {
    permissionCalls.push('ask');
    return Promise.resolve('denied');
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(client, sandbox);
  doc.listeners.DOMContentLoaded();
  check('permission is not requested on load, and the iPhone hint is shown',
    permissionCalls.length === 0
    && box.hidden === false
    && ios.hidden === false
    && client.includes("scope: '/ops'")
    && client.includes('requestPermission'));
  onBtn.listeners.click();
  await new Promise((resolve) => { setTimeout(resolve, 0); });
  check('permission is requested from the button click', permissionCalls.length === 1);

  const leaked = [
    'flag-off-body-zebra',
    'private-osman-body-zebra',
    'private-hameed-body-zebra',
    'secret-ceo-question-zebra',
    hameedDevice.endpoint,
    osmanDevice.endpoint,
    privateKey,
    ENC_KEY,
  ];
  check('logs contain counts and status codes only',
    logs.every((line) => leaked.every((phrase) => !line.includes(phrase))));

  clearPushEnv();
  delete process.env.FOUNDERS_DM_ENABLED;
  delete process.env.FOUNDERS_DM_ENC_KEY;
  global.fetch = origFetch;
  console.log = origLog;
  dm.resetFoundersDm();

  let failed = 0;
  for (const row of results) {
    console.log(`${row.pass ? 'PASS' : 'FAIL'} - ${row.name}`);
    if (!row.pass) failed += 1;
  }
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
