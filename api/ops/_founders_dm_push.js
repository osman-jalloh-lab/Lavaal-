// Native OS alerts for the founders thread. Web Push (RFC 8291) to the
// other founder's devices. No message text. The thread module owns the
// subscription store and passes already-loaded rows in.

const fs = require('fs');
const path = require('path');
const {
  b64urlEncode,
  sendWebPush,
  vapidKeysFromEnv,
} = require('./_web_push');

// Same gate as the office background work: only hand the promise to Vercel
// when @vercel/functions is a declared dependency. Otherwise the caller awaits.
let waitUntilImpl = null;
try {
  const vercelFunctions = require('@vercel/functions');
  if (vercelFunctions && typeof vercelFunctions.waitUntil === 'function') {
    waitUntilImpl = vercelFunctions.waitUntil.bind(vercelFunctions);
  }
} catch {
  waitUntilImpl = null;
}

function canUseWaitUntil() {
  const candidates = [
    path.join(process.cwd(), 'package.json'),
    path.join(__dirname, '../../package.json'),
  ];
  let pkg = null;
  for (const candidate of candidates) {
    try {
      pkg = JSON.parse(fs.readFileSync(candidate, 'utf8'));
      break;
    } catch {
      pkg = null;
    }
  }
  if (!pkg || typeof waitUntilImpl !== 'function') return false;
  const deps = Object.assign({}, pkg.dependencies, pkg.devDependencies);
  return Object.prototype.hasOwnProperty.call(deps, '@vercel/functions');
}

function scheduleWaitUntil(promise) {
  if (!canUseWaitUntil()) return false;
  waitUntilImpl(promise);
  return true;
}

const MAX_PUSH_SUBS = 5;
const IOS_HINT = 'On iPhone: Share, then Add to Home Screen, then open LAVAALL OS from there to enable alerts.';
const SW_FILE = path.join(__dirname, '../../ops-sw.js');
const MANIFEST_FILE = path.join(__dirname, '../../ops-manifest.webmanifest');

function envOn(name) {
  const flag = String(process.env[name] || '').trim().toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'on';
}

function foundersDmPushEnabled() {
  return envOn('FOUNDERS_DM_PUSH_ENABLED');
}

function vapidReady() {
  return Boolean(vapidKeysFromEnv());
}

function clientPublicKey() {
  const keys = vapidKeysFromEnv();
  return keys ? b64urlEncode(keys.publicKey) : '';
}

function buildPushPayload(senderLabel, sentAt) {
  const label = senderLabel === 'Hameed' ? 'Hameed' : 'Osman';
  return {
    title: 'LAVAALL',
    body: `New message from ${label}`,
    sentAt: String(sentAt || ''),
    tag: 'founders-chat',
  };
}

function normalizeSubscription(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const endpoint = typeof raw.endpoint === 'string' ? raw.endpoint.trim() : '';
  const keys = raw.keys && typeof raw.keys === 'object' ? raw.keys : {};
  const p256dh = typeof keys.p256dh === 'string' ? keys.p256dh.trim() : '';
  const auth = typeof keys.auth === 'string' ? keys.auth.trim() : '';
  if (!/^https:\/\//i.test(endpoint) || endpoint.length > 2000) return null;
  if (!/^[A-Za-z0-9_-]{80,200}$/.test(p256dh)) return null;
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(auth)) return null;
  return { endpoint, keys: { p256dh, auth } };
}

function upsertSubscriptions(list, sub) {
  const rows = (Array.isArray(list) ? list : []).filter((row) => row && row.endpoint !== sub.endpoint);
  return rows.concat([sub]).slice(-MAX_PUSH_SUBS);
}

function dropSubscription(list, endpoint) {
  const target = String(endpoint || '');
  return (Array.isArray(list) ? list : []).filter((row) => row && row.endpoint !== target);
}

function logPush(event, fields) {
  console.log(JSON.stringify(Object.assign({ type: 'OpsFoundersDm', event }, fields || {})));
}

async function notifyOtherFounder({ senderEmail, founders, labels, readSubscriptions, deleteSubscription }) {
  if (!foundersDmPushEnabled()) return;
  const keys = vapidKeysFromEnv();
  if (!keys) {
    logPush('push_skipped', { reason: 'vapid' });
    return;
  }
  const sender = String(senderEmail || '').trim().toLowerCase();
  const roster = Array.isArray(founders) ? founders : [];
  const other = roster.find((email) => email !== sender);
  if (!other || typeof readSubscriptions !== 'function') return;
  let subs = [];
  try {
    subs = await readSubscriptions(other);
  } catch {
    logPush('push_skipped', { reason: 'store' });
    return;
  }
  const nameMap = labels && typeof labels === 'object' ? labels : {};
  const payload = JSON.stringify(buildPushPayload(nameMap[sender] || 'Osman', new Date().toISOString()));
  const statuses = [];
  for (const sub of Array.isArray(subs) ? subs : []) {
    try {
      const result = await sendWebPush({
        endpoint: sub.endpoint,
        p256dh: sub.keys && sub.keys.p256dh,
        auth: sub.keys && sub.keys.auth,
        payload,
        vapid: keys,
        ttl: 86400,
        urgency: 'high',
      });
      statuses.push(result.status);
      if (!result.status && result.error) logPush('push_failed', { code: result.error });
      if ((result.status === 404 || result.status === 410) && typeof deleteSubscription === 'function') {
        try {
          await deleteSubscription(other, sub.endpoint);
        } catch {
          statuses.push(0);
        }
      }
    } catch (err) {
      statuses.push(0);
      logPush('push_failed', { code: err && err.code ? String(err.code) : 'throw' });
    }
  }
  logPush('push_notify', { count: subs.length, statuses });
}

async function settleFounderPush(args) {
  try {
    const work = notifyOtherFounder(args || {});
    if (canUseWaitUntil()) {
      scheduleWaitUntil(work);
      return;
    }
    await work;
  } catch {
    logPush('push_notify', { ok: false });
  }
}

function assetKind(req) {
  const query = req && req.query ? req.query : {};
  const raw = query.area;
  const area = String(Array.isArray(raw) ? raw[0] : (raw || ''));
  const pathOnly = String((req && req.url) || '').split('?')[0].replace(/\/+$/, '');
  if (pathOnly === '/ops-sw.js' || area === 'ops-sw') return 'sw';
  if (pathOnly === '/ops-manifest.webmanifest' || area === 'ops-manifest') return 'manifest';
  return '';
}

function handleOpsPushAsset(req, res) {
  const kind = assetKind(req);
  if (!kind) return false;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405);
    res.setHeader('Cache-Control', 'no-store');
    res.send('');
    return true;
  }
  const file = kind === 'sw' ? SW_FILE : MANIFEST_FILE;
  let text = '';
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    res.status(404);
    res.setHeader('Cache-Control', 'no-store');
    res.send('');
    return true;
  }
  res.status(200);
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (kind === 'sw') {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Service-Worker-Allowed', '/ops');
  } else {
    res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
  }
  res.send(req.method === 'HEAD' ? '' : text);
  return true;
}

module.exports = {
  IOS_HINT,
  MAX_PUSH_SUBS,
  buildPushPayload,
  clientPublicKey,
  dropSubscription,
  foundersDmPushEnabled,
  handleOpsPushAsset,
  normalizeSubscription,
  settleFounderPush,
  upsertSubscriptions,
  vapidReady,
};
