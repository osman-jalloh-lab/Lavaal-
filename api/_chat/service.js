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

function normalizeFields(input) {
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
  return draft;
}

function normalize(input) {
  const draft = normalizeFields(input);
  if (draft.name.length < 2 || draft.name.length > 100
      || !/^\+[1-9]\d{6,14}$/.test(draft.phone)) fail('invalid_contact');
  if (draft.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email)) fail('invalid_email');
  if (draft.inquiryType && !TYPES.includes(draft.inquiryType)) fail('invalid_type');
  if (draft.preferredResponse && !['email', 'phone'].includes(draft.preferredResponse)) fail('invalid_response');
  if (draft.country && !COUNTRIES.includes(draft.country)) fail('invalid_country');
  return draft;
}

function handoffPayload(input, time) {
  const fields = normalizeFields(input.fields);
  if (!fields.name || fields.name.length > 100
      || !/[\p{L}]/u.test(fields.name)
      || !['customer-support', 'quote-request'].includes(fields.inquiryType)
      || !fields.productOrService || !fields.message) fail('invalid_fields');
  if (fields.preferredResponse === 'email') {
    if (fields.phone || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) fail('invalid_contact');
  } else if (fields.preferredResponse === 'phone') {
    if (fields.email || !/^\+?\d{7,15}$/.test(fields.phone)) fail('invalid_contact');
  } else fail('invalid_response');
  return {
    kind: 'chat-handoff', test: true, route: 'customer-success', owner: 'Alison',
    flag: fields.inquiryType === 'quote-request' ? 'Someone reached out wanting a quote for ' + fields.productOrService + '.' : 'Someone reached out wanting to talk to you about ' + fields.productOrService + '.',
    fields, summary: fields.message, createdAt: new Date(time).toISOString(),
    topicKnownFromChat: Boolean(input.topicKnownFromChat),
  };
}

function digestKey(draftId) {
  return hash('submission:' + draftId);
}

function compactProducts(products) {
  if (!Array.isArray(products)) return [];
  return products.slice(0, 24).map(product => ({
    id: product.id,
    name: product.name,
    brand: product.brand,
    family: product.family,
    categoryId: product.categoryId,
    options: product.options || [],
  }));
}

function compactNarrow(narrow) {
  if (!narrow || typeof narrow !== 'object') return null;
  const scope = {};
  for (const key of ['categoryId', 'brand', 'family', 'term', 'modelId']) {
    if (typeof narrow.scope?.[key] === 'string') scope[key] = narrow.scope[key];
  }
  const state = {
    level: narrow.level,
    scope,
    labels: Array.isArray(narrow.labels) ? narrow.labels.slice(0, 24) : [],
  };
  // Large slices are reconstructed from scope on the next turn. Truncating IDs
  // would silently restrict the catalogue choices to an arbitrary first page.
  if (Array.isArray(narrow.ids) && narrow.ids.length <= 200) state.ids = narrow.ids;
  return state;
}

function createService({ store, now = Date.now, salt, billing, alert = () => {}, transport, chat, previewDebug = false, previewLimits = false, handoffSink = 'test-store' }) {
  if (!store || typeof store.transaction !== 'function'
      || typeof salt !== 'string' || salt.length < 8 || salt.length > 256) fail('unconfigured');

  const hourMax = previewLimits ? 20 : 3;
  const dayMax = previewLimits ? 30 : 6;
  const turnMax = previewLimits ? 20 : 10;

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
      increment(records, 'h:' + ipHash + hour, hourMax, (hour + 1) * HOUR);
      increment(records, 'd:' + ipHash + day, dayMax, (day + 1) * DAY);
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

  async function turn(id, proof, eventId, reserveCents, csrf, text) {
    if (text !== undefined) return chatTurn(id, proof, eventId, csrf, text);
    // Retain A1 reservation-only semantics solely for the existing mock tests.
    if (store.kind !== 'mock') fail('fields');
    requireEvent(eventId);
    if (!Number.isSafeInteger(reserveCents) || reserveCents <= 0) fail('cost');
    return transaction((records, time) => {
      const session = browserSession(records, id, proof, csrf, time);
      const eventKey = 'turn:' + id + ':' + eventId;
      if (records.has(eventKey)) return records.get(eventKey).result;
      if (session.turns >= turnMax) fail('quota');
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

  async function chatTurn(id, proof, eventId, csrf, text) {
    requireEvent(eventId);
    if (typeof text !== 'string' || !text.trim() || text.length > 2000) fail('fields');
    const { respond } = require('./responder');
    const { shouldSkipModel, buildMessages, respondWithLlm } = require('./llm-responder');
    const { reservationCents } = require('./llm-gateway');
    const eventKey = 'turn:' + id + ':' + eventId;
    const digest = hash(text);
    const reservation = await transaction((records, time) => {
      const session = browserSession(records, id, proof, csrf, time);
      const previous = records.get(eventKey);
      if (previous) {
        if (previous.digest !== digest) fail('replay');
        if (!previous.result) fail('turn_pending');
        return { result: previous.result };
      }
      if (session.turns >= turnMax) fail('quota');
      const context = session.context || {};
      const rule = respond(text, context);
      const skip = shouldSkipModel(rule);
      if (!skip && typeof chat !== 'function') fail('unconfigured');
      const estimate = skip ? 0 : reservationCents(buildMessages(text, rule, context));
      const date = new Date(time);
      const monthKey = 'cost:' + date.toISOString().slice(0, 7);
      const ledger = records.get(monthKey) || { n: 0, exp: Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 2, 1) };
      if (ledger.n + estimate > 2500 || ledger.n >= 2500) fail('cost_cap');
      ledger.n += estimate;
      records.set(monthKey, ledger);
      session.turns++;
      records.set(eventKey, { digest, exp: session.exp });
      return { rule, skip, context, estimate, monthKey };
    });
    if (reservation.result) return reservation.result;
    let response;
    try {
      response = reservation.skip ? reservation.rule : await respondWithLlm(text, { session: reservation.context, chat });
    } catch (error) {
      // Gateway accounts for every attempt; unknown failures keep the reservation.
      response = { costUsd: error.costUsd, text: "I couldn't complete that reply. We're reachable 24/7 on WhatsApp and email: support@lavaall.com or WhatsApp +1 (737) 704-4182." };
    }
    const result = { text: response.text };
    if (Array.isArray(response.chips)) result.chips = response.chips.slice(0, 6);
    if (response.reset) result.reset = true;
    if (previewDebug && process.env.VERCEL_ENV !== 'production') result.debug = {
      model: ['deepseek-flash', 'openai/gpt-4o-mini'].includes(response.llmModel) ? response.llmModel : null,
      provider: ['deepseek', 'gateway'].includes(response.llmProvider) ? response.llmProvider : null,
      skipped: reservation.skip || response.llmSkipped || null,
    };
    const completed = await transaction((records, time) => {
      const event = records.get(eventKey);
      if (!event) fail('session');
      if (response.handoffPayload && handoffSink === 'test-store' && process.env.VERCEL_ENV !== 'production') {
        const payload = handoffPayload(response.handoffPayload, time);
        const sink = 'test-handoff:' + token();
        records.set(sink, { payload, exp: time + DAY });
        // Public, PII-free receipt for UI adapters (e.g. the mascot): only after Confirm wrote the test sink.
        result.handoff = { status: 'received', test: true, route: payload.route };
        if (previewDebug) {
          result.debug.handoff = { sink, payload };
        }
      }
      const ledger = records.get(reservation.monthKey);
      if (!reservation.skip && Number.isFinite(response.costUsd) && response.costUsd >= 0) {
        const actual = Math.ceil(response.costUsd * 100 * 1000000) / 1000000;
        // Replace the reservation with usage cost (or conservative uncertain cost).
        ledger.n = Math.ceil((ledger.n - reservation.estimate + actual) * 1000000) / 1000000;
      }
      event.result = result;
      const session = records.get('s:' + id);
      if (session) {
        const blockedHandoff = (response.events || []).includes('handoff-intake')
          && (response.events || []).some(event => event === 'refused-injection' || event.startsWith('blocked-sensitive:'));
        const safeUserText = blockedHandoff ? '' : text;
        const model = response.lastModel && { name: response.lastModel.name, options: response.lastModel.options || [], family: response.lastModel.family, id: response.lastModel.id };
        session.context = {
          lastUser: safeUserText,
          lastLanguage: response.language,
          lastQty: response.fields && response.fields.quantity,
          lastProducts: compactProducts(Array.isArray(response.lastProducts) ? response.lastProducts : (!response.reset && session.context && session.context.lastProducts) || []),
          lastFamily: response.lastFamily || (!response.reset && session.context && session.context.lastFamily) || null,
          lastModel: model || (response.awaiting === null ? null : (!response.reset && session.context && session.context.lastModel) || null),
          awaiting: response.awaiting || null,
          narrow: compactNarrow(response.narrow),
          lastTopic: response.lastTopic || null,
          formDraft: response.formDraft || null,
          handoffDraft: response.handoffDraft || null,
          selectedVariant: response.selectedVariant || null,
          history: [{ role: 'user', text: safeUserText }, { role: 'assistant', text: result.text }],
        };
      }
      return result;
    });
    if (completed.debug?.handoff) {
      const { sink, payload } = completed.debug.handoff;
      console.info('TEST_HANDOFF', JSON.stringify({
        id: sink, route: payload.route, topicKnownFromChat: Boolean(payload.topicKnownFromChat),
        hasPhone: Boolean(payload.fields.phone), hasEmail: Boolean(payload.fields.email),
      }));
    }
    return completed;
  }

  return { start, draft, review, confirm, turn };
}

module.exports = { createService, normalize, FIELDS, TYPES, equal, requireOpaque };
