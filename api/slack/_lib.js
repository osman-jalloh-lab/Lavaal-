// Shared Slack HTTP helpers for Vercel serverless routes under api/slack/.
// Ticket 02: verify + ack only. HMAC signature check and replay window are
// reused by events, commands, and interactions. No npm dependencies.
//
// Task records are in-memory (process-local). They evaporate on cold start
// and are a stand-in until ticket 03 persists a queue. Do not treat them as
// durable. SLACK_BOT_TOKEN is reserved for later outbound replies and is
// not read here.

const crypto = require('crypto');
const querystring = require('querystring');

const MAX_BODY = 256_000;
const MAX_SKEW_SECONDS = 5 * 60;
const MAX_TASKS = 50;
const tasks = [];

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
  console.log('[slack] task', task.id, task.kind);
  return task;
}

function getRecordedTasks() {
  return tasks.slice();
}

function resetRecordedTasks() {
  tasks.length = 0;
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

  return onVerified(rawBody);
}

module.exports = {
  MAX_BODY,
  MAX_SKEW_SECONDS,
  computeSlackSignature,
  getRawBody,
  getRecordedTasks,
  json,
  parseForm,
  recordTask,
  resetRecordedTasks,
  verifySlackRequest,
  withVerifiedSlackRequest,
};
