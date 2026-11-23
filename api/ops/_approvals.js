// api/ops/_approvals.js — one founder-approval record type for LAVAALL OS (intake now; plans and runs later).
// Only Osman's signed-in session can mint (the caller passes the session from the existing deny() gate).
// A record binds { action, requestHash } with an expiry; consumers must match both and consume it once.
// Keys live under rootFor(env): approvals:<id> (audit record) and approvals-used:<id> (single-use marker).
'use strict';
const crypto = require('node:crypto');
const { command, rootFor } = require('./_harness_goals');

// Dedicated approver list (Osman, 22 Nov 2026 11:15 PM CT). Separate from the sign-in ALLOWLIST in _lib.js.
const APPROVERS = Object.freeze(['osmanjalloh104@gmail.com']);
const ACTIONS = Object.freeze(['intake_create']); // add 'plan_approve', 'code_run' when those consumers exist
const TTL_MS = 15 * 60 * 1000;
const ID_RE = /^appr-[a-f0-9-]{36}$/;
const HASH_RE = /^[a-f0-9]{64}$/;
const isApprover = email => typeof email === 'string' && APPROVERS.includes(email.trim().toLowerCase());
const recordKey = (env, id) => rootFor(env) + 'approvals:' + id;
const usedKey = (env, id) => rootFor(env) + 'approvals-used:' + id;

async function mintApproval(env, fetchImpl, session, input, now = Date.now()) {
  if (!session || !isApprover(session.email)) return { status: 403, body: { error: 'approver_not_allowed' } };
  if (!ACTIONS.includes(input && input.action) || !HASH_RE.test(String(input && input.requestHash)))
    return { status: 400, body: { error: 'invalid_approval_request' } };
  const id = 'appr-' + crypto.randomUUID();
  const record = { id, action: input.action, requestHash: input.requestHash, summary: String(input.summary || '').slice(0, 200),
    approver: session.email.trim().toLowerCase(), createdVia: 'founder_session',
    createdAt: new Date(now).toISOString(), expiresAt: new Date(now + TTL_MS).toISOString() };
  if (await command(env, fetchImpl, ['SET', recordKey(env, id), JSON.stringify(record), 'NX']) !== 'OK') throw new Error('store_unavailable');
  return { status: 201, body: { approval_id: id, action: record.action, request_hash: record.requestHash, expires_at: record.expiresAt } };
}

// Returns { ok: true, record } or { ok: false, status, error }. Fails closed on any mismatch.
async function consumeApproval(env, fetchImpl, { id, action, requestHash, consumer }, now = Date.now()) {
  if (!ID_RE.test(String(id || ''))) return { ok: false, status: 403, error: 'approval_not_found' };
  const raw = await command(env, fetchImpl, ['GET', recordKey(env, id)]);
  let rec = null; try { rec = raw ? JSON.parse(raw) : null; } catch { rec = null; }
  if (!rec || rec.createdVia !== 'founder_session' || !isApprover(rec.approver)) return { ok: false, status: 403, error: 'approval_not_found' };
  if (rec.action !== action || rec.requestHash !== requestHash) return { ok: false, status: 403, error: 'approval_mismatch' };
  if (!(Date.parse(rec.expiresAt) > now)) return { ok: false, status: 403, error: 'approval_expired' };
  const used = { id, consumer: String(consumer || ''), at: new Date(now).toISOString() };
  if (await command(env, fetchImpl, ['SET', usedKey(env, id), JSON.stringify(used), 'NX']) !== 'OK') return { ok: false, status: 409, error: 'approval_reused' };
  return { ok: true, record: rec };
}
// Undo a consumption when nothing durable was written yet, so the same approval can be retried.
async function releaseApproval(env, fetchImpl, id) { await command(env, fetchImpl, ['DEL', usedKey(env, id)]); }

module.exports = { APPROVERS, ACTIONS, TTL_MS, isApprover, mintApproval, consumeApproval, releaseApproval };
