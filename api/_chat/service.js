'use strict';

const crypto = require('crypto');
const FIELDS = [
  'inquiryType', 'name', 'phone', 'email', 'country', 'company', 'subject',
  'message', 'preferredResponse', 'productOrService', 'model', 'quantity',
  'budget', 'deliveryLocation', 'timeline', 'orderNumber', 'issueDescription',
  'installationType', 'projectDescription',
];
const TYPES = [
  'sales-quotation', 'product-availability', 'equipment-procurement',
  'routers-networking', 'servers-infrastructure', 'computers-workstations',
  'fiber-optic', 'structured-cabling', 'installation-services',
  'customer-support', 'technical-support', 'existing-order', 'partnership',
  'general-inquiry', 'other',
];
const COUNTRIES = [
  'Sierra Leone', 'Guinea', 'Guinea-Bissau', 'Liberia', 'Other West Africa', 'Other',
];
const SESSION_TTL = 30 * 60 * 1000;
const CONSENT_TTL = 2 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function token() {
  return crypto.randomBytes(32).toString('hex');
}

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function equal(left, right) {
  return typeof left === 'string' && typeof right === 'string'
    && Buffer.byteLength(left) === Buffer.byteLength(right)
    && crypto.timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function requireOpaque(value, code) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail(code);
}

function requireEvent(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) fail('event');
}

function normalize(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
      || Object.keys(input).some(key => !FIELDS.includes(key))) fail('invalid_fields');
  const draft = {};
  for (const key of FIELDS) {
    const value = input[key] === undefined ? '' : input[key];
    const maxLength = key === 'message' ? 2000 : 300;
    if (typeof value !== 'string' || value.length > maxLength
        || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)) fail('invalid_fields');
    draft[key] = value.trim();
  }
  if (draft.name.length < 2 || draft.name.length > 100
      || !/^\+[1-9]\d{6,14}$/.test(draft.phone)) fail('invalid_contact');
  if (draft.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email)) fail('invalid_email');
  if (draft.inquiryType && !TYPES.includes(draft.inquiryType)) fail('invalid_type');
  if (draft.preferredResponse && !['email', 'phone'].includes(draft.preferredResponse)) fail('invalid_response');
  if (draft.country && !COUNTRIES.includes(draft.country)) fail('invalid_country');
  return draft;
}

function digestKey(draftId) {
  return hash('submission:' + draftId);
}

function createService({ store, now = Date.now, salt, billing, alert = () => {}, transport }) {
  if (!store || typeof store.transaction !== 'function'
      || typeof salt !== 'string' || salt.length < 8 || salt.length > 256) fail('unconfigured');

  function transaction(operation) {
    return store.transaction(records => {
      const time = now();
      for (const [key, value] of records) {
        if (value.exp <= time) records.delete(key);
      }
      return operation(records, time);
    });
  }

  function increment(records, key, maximum, expires) {
    const counter = records.get(key) || { n: 0, exp: expires };
    if (counter.n >= maximum) fail('quota');
    counter.n++;
    records.set(key, counter);
  }

  function browserSession(records, id, proof, csrf, time) {
    requireOpaque(id, 'session');
    requireOpaque(proof, 'session');
    requireOpaque(csrf, 'csrf');
    const session = records.get('s:' + id);
    if (!session || session.exp <= time || !equal(session.proof, hash(proof))) fail('session');
    if (!equal(csrf, session.csrf)) fail('csrf');
    return session;
  }

  function currentDraft(records, session, id, draftId) {
    requireOpaque(draftId, 'draft');
    const draft = records.get('draft:' + draftId);
    if (!draft || draft.id !== id || session.draft !== draftId) fail('draft');
    return draft;
  }

  async function start(ip) {
    if (typeof ip !== 'string' || !ip.length || ip.length > 128) fail('invalid_ip');
    return transaction((records, time) => {
      const ipHash = crypto.createHmac('sha256', salt).update(ip).digest('hex');
      const hour = Math.floor(time / HOUR);
      const day = Math.floor(time / DAY);
      increment(records, 'h:' + ipHash + hour, 3, (hour + 1) * HOUR);
      increment(records, 'd:' + ipHash + day, 6, (day + 1) * DAY);
      const id = token();
      const proof = token();
      const csrf = token();
      records.set('s:' + id, { proof: hash(proof), csrf, turns: 0, exp: time + SESSION_TTL });
      return { sessionId: id, proof, csrf };
    });
  }

  async function draft(id, fields, eventId) {
    requireOpaque(id, 'session');
    requireEvent(eventId);
    const fieldsToStore = normalize(fields);
    return transaction((records, time) => {
      const session = records.get('s:' + id);
      if (!session) fail('session');
      const eventKey = 'event:' + id + ':' + eventId;
      const digest = hash(JSON.stringify(fieldsToStore));
      const previous = records.get(eventKey);
      if (previous) {
        if (previous.digest !== digest) fail('replay');
        return { draftId: previous.id };
      }
      if (session.draft && records.get('draft:' + session.draft)?.result) fail('already_consumed');
      const draftId = token();
      if (session.draft) records.delete('draft:' + session.draft);
      records.set('draft:' + draftId, {
        id, fields: fieldsToStore, digest, exp: Math.min(session.exp, time + SESSION_TTL),
      });
      session.draft = draftId;
      records.set(eventKey, { id: draftId, digest, exp: session.exp });
      return { draftId };
    });
  }

  async function review(id, proof, csrf, draftId) {
    return transaction((records, time) => {
      const session = browserSession(records, id, proof, csrf, time);
      const draft = currentDraft(records, session, id, draftId);
      if (draft.result) fail('draft');
      draft.consent = token();
      draft.consentExp = Math.min(time + CONSENT_TTL, session.exp);
      draft.bound = draft.digest;
      return {
        draftId, token: draft.consent, idempotencyKey: digestKey(draftId),
        summary: draft.fields, skipped: FIELDS.filter(key => !draft.fields[key]),
      };
    });
  }

  async function waitForConfirmation(draftId) {
    // Never retry transport. Briefly wait for an existing attempt; if it stalls,
    // freeze uncertain so a late acknowledgement cannot change its final result.
    for (let attempt = 0; attempt < 20; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 5));
      const state = await transaction(records => {
        const draft = records.get('draft:' + draftId);
        return draft ? { pending: draft.pending, result: draft.result } : null;
      });
      if (!state) return { status: 'uncertain' };
      if (!state.pending) return state.result;
    }
    return transaction(records => {
      const draft = records.get('draft:' + draftId);
      if (draft) draft.pending = false;
      return draft?.result || { status: 'uncertain' };
    });
  }

  async function confirm(id, proof, csrf, draftId, consent, key) {
    requireOpaque(consent, 'consent');
    requireOpaque(key, 'draft');
    const reservation = await transaction((records, time) => {
      const session = browserSession(records, id, proof, csrf, time);
      const draft = currentDraft(records, session, id, draftId);
      if (key !== digestKey(draftId)) fail('draft');
      if (draft.result) return { result: draft.result, pending: draft.pending };
      if (!equal(consent, draft.consent) || draft.consentExp <= time
          || draft.bound !== draft.digest) fail('consent');
      increment(records, 'sub:' + Math.floor(time / DAY), 20, (Math.floor(time / DAY) + 1) * DAY);
      // Commit before I/O: a crash can never authorize another send.
      draft.consent = '';
      draft.result = { status: 'uncertain' };
      draft.pending = true;
      return { fields: draft.fields };
    });
    if (reservation.result) {
      return reservation.pending ? waitForConfirmation(draftId) : reservation.result;
    }
    let result = { status: 'uncertain' };
    try {
      const response = await transport(reservation.fields, key);
      if (response.ok && (await response.json()).ok === true) result = { status: 'accepted' };
    } catch {
      // Delivery may already have happened. Keep uncertain, without an auto retry.
    }
    return transaction(records => {
      const draft = records.get('draft:' + draftId);
      if (!draft) return { status: 'uncertain' };
      if (draft.pending) {
        draft.result = result;
        draft.pending = false;
      }
      return draft.result;
    });
  }

  function verifiedBill(time) {
    const bill = billing && billing();
    const month = new Date(time).toISOString().slice(0, 7);
    if (!bill || bill.enforced !== true || !Number.isSafeInteger(bill.asOf)
        || bill.publicBypass !== false || !Number.isSafeInteger(bill.allInCents)
        || bill.allInCents < 0 || time - bill.asOf > 60000 || bill.asOf > time
        || bill.month !== month) fail('billing_unverified');
    return bill;
  }

  async function turn(id, proof, eventId, reserveCents, csrf) {
    requireEvent(eventId);
    if (!Number.isSafeInteger(reserveCents) || reserveCents <= 0) fail('cost');
    return transaction((records, time) => {
      const session = browserSession(records, id, proof, csrf, time);
      const eventKey = 'turn:' + id + ':' + eventId;
      if (records.has(eventKey)) return records.get(eventKey).result;
      if (session.turns >= 10) fail('quota');
      const bill = verifiedBill(time);
      const monthKey = 'cost:' + bill.month;
      const date = new Date(time);
      const ledger = records.get(monthKey) || {
        n: 0, exp: Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1),
      };
      const total = ledger.n + bill.allInCents + reserveCents;
      if (total > 2500) fail('cost_cap');
      // Retain reservations even when reported billing includes them. This may
      // stop early; the fake ledger is not evidence of vendor cap enforcement.
      ledger.n += reserveCents;
      records.set(monthKey, ledger);
      session.turns++;
      if (total >= 2000 && !ledger.alerted) {
        ledger.alerted = true;
        try { alert({ threshold: 80 }); } catch { /* No outbound alert in A1. */ }
      }
      const result = { allowed: true };
      records.set(eventKey, { result, exp: session.exp });
      return result;
    });
  }

  return { start, draft, review, confirm, turn };
}

module.exports = { createService, normalize, FIELDS, TYPES, equal, requireOpaque };
