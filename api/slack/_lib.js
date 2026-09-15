// Shared Slack HTTP helpers for Vercel serverless routes under api/slack/.
// HMAC signature check and replay window are reused by events, commands,
// and interactions. No npm dependencies.
//
// Task records are in-memory (process-local). They evaporate on cold start
// and are not durable. Ticket 03–05 classify/gate/bridge on top of this log.
// SLACK_BOT_TOKEN is read by _router/bridge.js for chat.postMessage only.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const querystring = require('querystring');

const MAX_BODY = 256_000;
const MAX_SKEW_SECONDS = 5 * 60;
const MAX_TASKS = 50;
const tasks = [];

let waitUntilImpl = null;
try {
  const vercelFunctions = require('@vercel/functions');
  if (vercelFunctions && typeof vercelFunctions.waitUntil === 'function') {
    waitUntilImpl = vercelFunctions.waitUntil.bind(vercelFunctions);
  }
} catch {
  waitUntilImpl = null;
}

function readPackageJson() {
  const candidates = [
    path.join(process.cwd(), 'package.json'),
    path.join(__dirname, '../../package.json'),
  ];
  for (const candidate of candidates) {
    try {
      return JSON.parse(fs.readFileSync(candidate, 'utf8'));
    } catch {
      continue;
    }
  }
  return null;
}

// waitUntil is only safe when @vercel/functions is a real package.json
// dependency. A bare require() can succeed on Vercel even when Hobby Node
// still freezes the isolate after res.send — that dropped LAVAALL_TASK posts.
function hasDeclaredVercelFunctionsDependency() {
  const pkg = readPackageJson();
  if (!pkg || typeof pkg !== 'object') return false;
  const deps = Object.assign({}, pkg.dependencies, pkg.devDependencies);
  return Object.prototype.hasOwnProperty.call(deps, '@vercel/functions');
}

function canUseWaitUntil() {
  return typeof waitUntilImpl === 'function' && hasDeclaredVercelFunctionsDependency();
}

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json').send(JSON.stringify(body));
}

function header(req, name) {
  const value = req.headers[name] || req.headers[String(name).toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function timingSafeEqualString(a, b) {
  const left = Buffer.from(String(a), 'utf8');
  const right = Buffer.from(String(b), 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function computeSlackSignature(signingSecret, timestamp, rawBody) {
  const basestring = `v0:${timestamp}:${rawBody}`;
  const digest = crypto.createHmac('sha256', signingSecret).update(basestring, 'utf8').digest('hex');
  return `v0=${digest}`;
}

// Slack: https://api.slack.com/authentication/verifying-requests-from-slack
// basestring = "v0:{timestamp}:{raw_body}", HMAC-SHA256, compare to X-Slack-Signature.
function verifySlackRequest({ signingSecret, timestamp, signature, rawBody, nowSeconds }) {
  if (!signingSecret) return { ok: false, error: 'signing_secret_not_configured' };
  if (!signature) return { ok: false, error: 'missing_signature' };
  if (timestamp === undefined || timestamp === null || timestamp === '') {
    return { ok: false, error: 'missing_timestamp' };
  }

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { ok: false, error: 'invalid_timestamp' };

  const now = nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > MAX_SKEW_SECONDS) return { ok: false, error: 'replay_rejected' };

  const expected = computeSlackSignature(signingSecret, timestamp, rawBody);
  if (!timingSafeEqualString(expected, signature)) return { ok: false, error: 'invalid_signature' };

  return { ok: true };
}

function reconstructRawBody(req) {
  const type = String(header(req, 'content-type') || '');
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    if (type.includes('application/json')) return JSON.stringify(req.body);
    if (type.includes('application/x-www-form-urlencoded')) return querystring.stringify(req.body);
  }
  return null;
}

async function getRawBody(req) {
  if (typeof req.rawBody === 'string') return req.rawBody;
  if (Buffer.isBuffer(req.rawBody)) return req.rawBody.toString('utf8');

  // Read the unread stream before touching req.body. On Vercel, req.body is
  // often a lazy getter that consumes the stream and parses JSON/form data,
  // which would make HMAC comparison fail against Slack's original bytes.
  if (typeof req[Symbol.asyncIterator] === 'function' && req.readable !== false && !req.readableEnded) {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    if (chunks.length) return Buffer.concat(chunks).toString('utf8');
  }

  if (typeof req.body === 'string') return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');

  const reconstructed = reconstructRawBody(req);
  if (reconstructed !== null) return reconstructed;

  const err = new Error('raw_body_unavailable');
  err.code = 'raw_body_unavailable';
  throw err;
}

function parseForm(rawBody) {
  return querystring.parse(rawBody || '');
}

function recordTask(entry) {
  const task = {
    id: `slack-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`,
    receivedAt: new Date().toISOString(),
    ...entry,
  };
  tasks.push(task);
  while (tasks.length > MAX_TASKS) tasks.shift();
  console.log('[slack] task', task.id, task.kind, task.status || '');
  return task;
}

function getTask(id) {
  if (!id) return null;
  return tasks.find((task) => task.id === id) || null;
}

function updateTask(id, patch) {
  const task = getTask(id);
  if (!task || !patch || typeof patch !== 'object') return task;
  Object.assign(task, patch, { updatedAt: new Date().toISOString() });
  return task;
}

function getRecordedTasks() {
  return tasks.slice();
}

function resetRecordedTasks() {
  tasks.length = 0;
}

function scheduleWaitUntil(promise) {
  if (!canUseWaitUntil()) return false;
  waitUntilImpl(promise);
  return true;
}

async function runWork(work) {
  try {
    return await (typeof work === 'function' ? work() : work);
  } catch (err) {
    console.error('[slack] background work failed', err && err.message ? err.message : err);
    return null;
  }
}

// Proven waitUntil (declared @vercel/functions dep): ack first, then extend
// isolate lifetime. Otherwise always await work BEFORE res.send — Hobby Node
// freezes as soon as the response is sent, which dropped LAVAALL_TASK posts.
async function continueAfterAck(res, status, body, work) {
  if (!work) {
    json(res, status, body);
    return;
  }
  if (canUseWaitUntil()) {
    const promise = Promise.resolve().then(() => runWork(work));
    json(res, status, body);
    scheduleWaitUntil(promise);
    return;
  }
  await runWork(work);
  json(res, status, body);
}

async function withVerifiedSlackRequest(req, res, onVerified) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });

  let rawBody;
  try {
    rawBody = await getRawBody(req);
  } catch (err) {
    if (err && err.code === 'raw_body_unavailable') {
      return json(res, 500, { error: 'raw_body_unavailable' });
    }
    throw err;
  }

  if (rawBody.length > MAX_BODY) return json(res, 413, { error: 'payload_too_large' });

  const result = verifySlackRequest({
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    timestamp: header(req, 'x-slack-request-timestamp'),
    signature: header(req, 'x-slack-signature'),
    rawBody,
  });
  if (!result.ok) {
    const status = result.error === 'signing_secret_not_configured' ? 503 : 401;
    return json(res, status, { error: result.error });
  }

  return await onVerified(rawBody);
}

module.exports = {
  MAX_BODY,
  MAX_SKEW_SECONDS,
  computeSlackSignature,
  canUseWaitUntil,
  continueAfterAck,
  getRawBody,
  getRecordedTasks,
  getTask,
  json,
  parseForm,
  recordTask,
  resetRecordedTasks,
  scheduleWaitUntil,
  updateTask,
  verifySlackRequest,
  withVerifiedSlackRequest,
};
