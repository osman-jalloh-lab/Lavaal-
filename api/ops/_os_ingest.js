// api/ops/_os_ingest.js — the POST handler behind api/os/ingest/[feed].js.
// Underscore-prefixed, so Vercel does not treat it as a function.
//
// Auth is the same bearer the inbox push and routine health already use (OPS_CEO_BRIDGE_SECRET, at least 16
// characters, constant-time compare). No new env var. Without it the answer is 401 and nothing else is
// revealed. Never logs a payload, a token or a header.

const { header, noStore, timingSafeEqualString } = require('./_lib');
const { FEEDS, MAX_BYTES, applyPayload, readFeed, validate, writeFeed } = require('./_os_feeds');
const DATA_PACK = require('../os/_data/index.js');

function deskIds() {
  const d = DATA_PACK.desks || {};
  return (Array.isArray(d.desks) ? d.desks : []).concat(Array.isArray(d.extraDesks) ? d.extraDesks : [])
    .map((row) => String(row && row.id || '')).filter(Boolean);
}

function secret(env) {
  const s = (env || process.env).OPS_CEO_BRIDGE_SECRET;
  return typeof s === 'string' && s.length >= 16 ? s : '';
}

function bearer(req) {
  const m = String(header(req, 'authorization') || '').match(/^\s*Bearer\s+(\S+)\s*$/i);
  return m ? m[1] : '';
}

function authorized(req, env) {
  const expected = secret(env);
  const got = bearer(req);
  return Boolean(expected && got && timingSafeEqualString(got, expected));
}

function send(res, status, body, headers) {
  noStore(res, 'application/json; charset=utf-8');
  Object.keys(headers || {}).forEach((k) => res.setHeader(k, headers[k]));
  res.status(status).send(JSON.stringify(body));
}

function feedName(req) {
  const q = req.query && typeof req.query === 'object' ? req.query.feed : '';
  const fromQuery = Array.isArray(q) ? q[0] : q;
  if (fromQuery) return String(fromQuery);
  const p = String(req.url || '').split('?')[0].replace(/\/+$/, '');
  return p.slice(p.lastIndexOf('/') + 1);
}

function bodyBytes(req) {
  if (typeof req.body === 'string') return Buffer.byteLength(req.body, 'utf8');
  if (Buffer.isBuffer(req.body)) return req.body.length;
  if (req.body && typeof req.body === 'object') return Buffer.byteLength(JSON.stringify(req.body), 'utf8');
  return 0;
}

function parseBody(req) {
  let raw = req.body;
  if (Buffer.isBuffer(raw)) raw = raw.toString('utf8');
  if (typeof raw === 'string') {
    if (!raw.trim()) return { error: 'invalid_json' };
    try { return { value: JSON.parse(raw) }; } catch { return { error: 'invalid_json' }; }
  }
  if (raw && typeof raw === 'object') return { value: raw };
  return { error: 'invalid_json' };
}

async function handleIngest(req, res, opts) {
  const env = (opts && opts.env) || process.env;
  const now = opts && Number.isFinite(opts.now) ? opts.now : Date.now();

  // 1. Auth first, before the method, the feed name or the body are looked at.
  if (!authorized(req, env)) return send(res, 401, { error: 'unauthorized' });

  // 2. Method and feed.
  if (String(req.method || 'GET').toUpperCase() !== 'POST') {
    return send(res, 405, { error: 'method_not_allowed' }, { Allow: 'POST' });
  }
  const feed = feedName(req);
  if (!FEEDS.includes(feed)) return send(res, 404, { error: 'not_found' });

  // 3. Size cap, declared and actual.
  const declared = Number(String(header(req, 'content-length') || '').trim());
  if ((Number.isFinite(declared) && declared > MAX_BYTES) || bodyBytes(req) > MAX_BYTES) {
    return send(res, 413, { error: 'payload_too_large' });
  }
  const type = String(header(req, 'content-type') || '');
  if (type && !/^\s*application\/json\b/i.test(type)) return send(res, 400, { error: 'invalid_json' });
  const parsed = parseBody(req);
  if (parsed.error) return send(res, 400, { error: parsed.error });

  // 4. Shape.
  const checked = validate(feed, parsed.value, { now, deskIds: deskIds() });
  if (!checked.ok) return send(res, 422, { error: 'invalid_shape', field: checked.reason });

  // 5. Merge and write to this feed's own key.
  try {
    const existing = await readFeed(feed, opts);
    const record = applyPayload(feed, existing, checked.value, now);
    await writeFeed(feed, record, opts);
    return send(res, 200, { ok: true, feed, received: Array.isArray(checked.value) ? checked.value.length : 1 });
  } catch {
    console.log(JSON.stringify({ type: 'OsIngest', event: 'store_unavailable', feed }));
    return send(res, 503, { error: 'store_unavailable' });
  }
}

module.exports = { handleIngest };
