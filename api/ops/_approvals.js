// api/ops/_approvals.js — single-use founder approvals for LAVAALL OS (Phase 4: code_run).
// New code on main, following the session-mint pattern from draft #105 (that PR is left as it is).
// Only Osman's signed-in session can mint (the caller passes the live session). A record binds
// { action, requestHash } with an expiry; a consumer must match both, and the single-use marker can be set once.
// Keys: <root>approvals:<id> (audit record) and <root>approvals-used:<id> (single-use marker). KV only.
'use strict';
const crypto = require('node:crypto');

const APPROVERS = Object.freeze(['osmanjalloh104@gmail.com']);
const ACTIONS = Object.freeze(['code_run']);
const TTL_MS = 15 * 60 * 1000;
const ID_RE = /^appr-[a-f0-9-]{36}$/;
const HASH_RE = /^[a-f0-9]{64}$/;

function isApprover(email) { return typeof email === 'string' && APPROVERS.includes(email.trim().toLowerCase()); }

function rootFor(env) {
  const e = String((env && env.VERCEL_ENV) || '').trim().toLowerCase();
  const prefix = !e || e === 'production' ? '' : e.replace(/[^a-z0-9_-]/g, '').slice(0, 32) + ':';
  return prefix + 'lavaall-os:';
}

async function command(env, fetchImpl, args) {
  if (!env || !env.KV_REST_API_URL || !env.KV_REST_API_TOKEN || typeof fetchImpl !== 'function') throw new Error('store_unavailable');
  const res = await fetchImpl(String(env.KV_REST_API_URL).replace(/\/$/, ''), {
    method: 'POST', headers: { Authorization: `Bearer ${env.KV_REST_API_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error('store_unavailable');
  const out = await res.json();
  if (out && out.error) throw new Error('store_unavailable');
  return out ? out.result : null;
}

// Stable hash of what is being approved, so an approval cannot be reused for a different repo, branch or task.
function requestHash(payload) {
  const p = payload || {};
  const canon = JSON.stringify({ repo: String(p.repo || ''), branch: String(p.branch || ''), objective: String(p.objective || ''), baseSha: String(p.baseSha || '') });
  return crypto.createHash('sha256').update(canon).digest('hex');
}

const recordKey = (env, id) => rootFor(env) + 'approvals:' + id;
const usedKey = (env, id) => rootFor(env) + 'approvals-used:' + id;

async function mintApproval(env, fetchImpl, session, input, now = Date.now()) {
  if (!session || !isApprover(session.email)) return { status: 403, body: { error: 'approver_not_allowed' } };
  if (!ACTIONS.includes(input && input.action) || !HASH_RE.test(String(input && input.requestHash))) return { status: 400, body: { error: 'invalid_approval_request' } };
  const id = 'appr-' + crypto.randomUUID();
  const record = {
    id, action: input.action, requestHash: input.requestHash, summary: String(input.summary || '').slice(0, 200),
    approver: session.email.trim().toLowerCase(), createdVia: 'founder_session',
    createdAt: new Date(now).toISOString(), expiresAt: new Date(now + TTL_MS).toISOString(),
  };
  if (await command(env, fetchImpl, ['SET', recordKey(env, id), JSON.stringify(record), 'NX']) !== 'OK') throw new Error('store_unavailable');
  return { status: 201, body: { approval_id: id, action: record.action, request_hash: record.requestHash, expires_at: record.expiresAt } };
}

// { ok: true, record } or { ok: false, status, error }. Fails closed on any mismatch.
async function consumeApproval(env, fetchImpl, { id, action, requestHash: hash, consumer }, now = Date.now()) {
  if (!ID_RE.test(String(id || ''))) return { ok: false, status: 403, error: 'approval_not_found' };
  const raw = await command(env, fetchImpl, ['GET', recordKey(env, id)]);
  let rec = null; try { rec = raw ? JSON.parse(raw) : null; } catch { rec = null; }
  if (!rec || rec.createdVia !== 'founder_session' || !isApprover(rec.approver)) return { ok: false, status: 403, error: 'approval_not_found' };
  if (rec.action !== action || rec.requestHash !== hash) return { ok: false, status: 403, error: 'approval_mismatch' };
  if (!(Date.parse(rec.expiresAt) > now)) return { ok: false, status: 403, error: 'approval_expired' };
  const used = { id, consumer: String(consumer || ''), at: new Date(now).toISOString() };
  if (await command(env, fetchImpl, ['SET', usedKey(env, id), JSON.stringify(used), 'NX']) !== 'OK') return { ok: false, status: 409, error: 'approval_reused' };
  return { ok: true, record: rec };
}

// Read-only check for the runner: the approval exists, was minted by the founder session for exactly this request,
// and its single-use marker was taken by exactly this job. Never consumes or extends anything.
async function verifyConsumed(env, fetchImpl, { id, action, requestHash: hash, consumer }) {
  if (!ID_RE.test(String(id || ''))) return false;
  let rec = null; let used = null;
  try { rec = JSON.parse(await command(env, fetchImpl, ['GET', recordKey(env, id)]) || 'null'); } catch { rec = null; }
  try { used = JSON.parse(await command(env, fetchImpl, ['GET', usedKey(env, id)]) || 'null'); } catch { used = null; }
  return Boolean(rec && used && rec.createdVia === 'founder_session' && isApprover(rec.approver) && rec.action === action
    && rec.requestHash === hash && used.consumer === consumer && used.id === id);
}

module.exports = { APPROVERS, ACTIONS, TTL_MS, command, consumeApproval, isApprover, mintApproval, requestHash, rootFor, verifyConsumed };
