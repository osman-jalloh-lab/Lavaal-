// Tickets 12b–12c + Slice 1 A–D — CEO Talk: KV thread SoT + optional xAI complete.
// KV (ops:ceo:thread:{id}) is the single source of truth for messages/provenance.
// B2 pending (ops:ceo:pending) is a wake inbox only — never canonical.
// Explicit wake = founder/bridge-intent that should wake Grok Bot (flag or
// @grok / /wake prefix). Normal Office /ops/chat CEO Talk is owned by xAI
// when XAI_API_KEY is set. Never both answer the same founder message.
// Founder POST is allowlist session + CSRF. CEO poll/reply is bearer secret.
// Underscore prefix: not a Vercel function. No npm. Never log emails or secrets.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  createCsrfToken,
  header,
  isAllowlisted,
  json,
  looksLikeAgentRequest,
  normalizeEmail,
  payloadTooLarge,
  peekSessionEmail,
  queryOf,
  readBody,
  readCsrfToken,
  readSession,
  redirect,
  timingSafeEqualString,
  wantsJson,
} = require('./_lib');
const { notesSelectableForChat, readStore, unfinishedTasks } = require('./_store');
const { completeXai, xaiConfigured } = require('./_xai');

const CEO_DESK_ID = 'lavaall-ceo';
const PENDING_KEY = 'ops:ceo:pending';
const THREAD_KEY_PREFIX = 'ops:ceo:thread:';
const THREAD_ROLES = Object.freeze(['founder', 'ceo']);
const THREAD_STATUSES = Object.freeze(['pending', 'answered']);
const PROVENANCE = Object.freeze(['human', 'xai_runtime', 'grok_bot_bridge', 'system', 'tool']);
const RESPONSE_OWNERS = Object.freeze(['pending', 'xai_runtime', 'grok_bot_bridge']);
const MAX_MESSAGES = 40;
const MAX_PENDING = 40;
const MAX_ANSWERED = 40;
const MAX_TEXT = 2000;
const SLACK_FALLBACK = 'If this bridge is down, Slack #laval is the backup — not the usual path.';
const WAITING_COPY = 'Waiting on CEO…';

let memory = emptyMemory();

function emptyMemory() {
  return { threads: {}, pending: [] };
}

function clean(value, max) {
  return typeof value === 'string' ? value.trim().replace(/[<>]/g, '').slice(0, max) : '';
}

function newId() {
  return crypto.randomBytes(8).toString('hex');
}

function kvConfigured() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function filePath() {
  if (kvConfigured()) return '';
  if (process.env.VERCEL) return '';
  const custom = process.env.OPS_STORE_FILE;
  return typeof custom === 'string' && custom.trim() ? `${custom.trim()}.ceo-bridge.json` : '';
}

function storeMode() {
  if (kvConfigured()) return 'kv';
  if (filePath()) return 'file';
  return 'memory';
}

function threadKey(id) {
  return `${THREAD_KEY_PREFIX}${clean(id, 40)}`;
}

function threadIdFor(email) {
  const who = normalizeEmail(email);
  const digest = crypto.createHash('sha256').update(who || 'unknown').digest('hex').slice(0, 16);
  return `ceo-${digest}`;
}

function normalizeRole(value) {
  return THREAD_ROLES.includes(value) ? value : '';
}

function normalizeStatus(value) {
  return THREAD_STATUSES.includes(value) ? value : 'answered';
}

function normalizeProvenance(value, role) {
  if (PROVENANCE.includes(value)) return value;
  if (role === 'founder') return 'human';
  if (role === 'ceo') return 'system';
  return 'system';
}

function normalizeResponseOwner(value) {
  return RESPONSE_OWNERS.includes(value) ? value : 'pending';
}

function normalizeMessage(row) {
  const role = normalizeRole(row && row.role);
  const text = clean(row && row.text, MAX_TEXT);
  if (!role || !text) return null;
  const id = clean(row && row.id, 40) || newId();
  const correlationId = clean(row && row.correlationId, 40) || id;
  const message = {
    id,
    role,
    text,
    at: Number.isFinite(row && row.at) ? row.at : Date.now(),
    correlationId,
    provenance: normalizeProvenance(row && row.provenance, role),
  };
  if (role === 'founder') {
    message.responseOwner = normalizeResponseOwner(row && row.responseOwner);
  }
  return message;
}

function normalizeAnsweredId(value) {
  return clean(value, 40);
}

function normalizeThread(row, fallbackEmail) {
  const founderEmail = normalizeEmail((row && row.founderEmail) || fallbackEmail);
  const id = clean(row && row.id, 40) || (founderEmail ? threadIdFor(founderEmail) : '');
  const messages = Array.isArray(row && row.messages)
    ? row.messages.map(normalizeMessage).filter(Boolean).slice(-MAX_MESSAGES)
    : [];
  const answeredIds = Array.isArray(row && row.answeredIds)
    ? row.answeredIds.map(normalizeAnsweredId).filter(Boolean).slice(-MAX_ANSWERED)
    : [];
  return {
    id,
    founderEmail,
    messages,
    status: normalizeStatus(row && row.status),
    updatedAt: Number.isFinite(row && row.updatedAt) ? row.updatedAt : Date.now(),
    answeredIds,
  };
}

function emptyThread(email) {
  const founderEmail = normalizeEmail(email);
  return {
    id: threadIdFor(founderEmail),
    founderEmail,
    messages: [],
    status: 'answered',
    updatedAt: 0,
    answeredIds: [],
  };
}

function publicThread(thread) {
  const row = thread && thread.id ? thread : emptyThread('');
  return {
    id: row.id,
    founderEmail: row.founderEmail,
    messages: (row.messages || []).map((item) => ({
      id: item.id,
      role: item.role,
      text: item.text,
      at: item.at,
    })),
    status: row.status,
    updatedAt: row.updatedAt,
  };
}

function lastCeoText(thread) {
  const messages = thread && Array.isArray(thread.messages) ? thread.messages : [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i] && messages[i].role === 'ceo') return messages[i].text;
  }
  return '';
}

function founderByCorrelation(thread, correlationId) {
  const id = clean(correlationId, 40);
  if (!id || !thread) return null;
  return (thread.messages || []).find((item) => (
    item.role === 'founder' && (item.correlationId === id || item.id === id)
  )) || null;
}

function hasCeoForCorrelation(thread, correlationId) {
  const id = clean(correlationId, 40);
  if (!id || !thread) return false;
  return (thread.messages || []).some((item) => (
    item.role === 'ceo' && (item.correlationId === id || item.id === id)
  ));
}

function isExplicitWake(input) {
  // Explicit wake: founder/bridge-intent that should wake Grok Bot vs normal
  // chat that xAI owns. B2 pending is that wake inbox — not a second SoT.
  if (!input) return false;
  if (input.explicitWake === true || input.explicitWake === '1' || input.explicitWake === 'true') return true;
  if (input.wake === true || input.wake === '1' || input.wake === 'true') return true;
  const text = String(input.text || input.message || '');
  return /^@grok\b/i.test(text) || /^\/wake\b/i.test(text);
}

function lastThreadMessage(thread) {
  const messages = thread && Array.isArray(thread.messages) ? thread.messages : [];
  return messages.length ? messages[messages.length - 1] : null;
}

function threadIsWaiting(thread) {
  if (!thread) return false;
  const last = lastThreadMessage(thread);
  if (last && last.role === 'ceo') return false;
  return thread.status === 'pending';
}

function sendJson(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  return json(res, status, body);
}

function normalizePendingItem(row) {
  const threadId = clean(row && row.threadId, 40);
  const text = clean(row && row.text, MAX_TEXT);
  const founderEmail = normalizeEmail(row && row.founderEmail);
  if (!threadId || !text || !founderEmail) return null;
  const messageId = clean(row && row.messageId, 40) || newId();
  return {
    threadId,
    founderEmail,
    messageId,
    correlationId: clean(row && row.correlationId, 40) || messageId,
    text,
    at: Number.isFinite(row && row.at) ? row.at : Date.now(),
    status: 'pending',
    wakeReason: clean(row && row.wakeReason, 40),
  };
}

function normalizePendingList(raw) {
  return (Array.isArray(raw) ? raw : []).map(normalizePendingItem).filter(Boolean).slice(-MAX_PENDING);
}

function decodeJson(raw, fallback) {
  if (raw == null) return fallback;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }
  return raw;
}

async function kvCommand(args) {
  const base = process.env.KV_REST_API_URL.replace(/\/$/, '');
  const response = await fetch(base, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  if (!response.ok) throw new Error('kv_command_failed');
  return response.json();
}

function readFileBlob() {
  const target = filePath();
  if (!target || !fs.existsSync(target)) return emptyMemory();
  try {
    const parsed = JSON.parse(fs.readFileSync(target, 'utf8'));
    const threads = {};
    Object.keys(parsed && parsed.threads ? parsed.threads : {}).forEach((key) => {
      const thread = normalizeThread(parsed.threads[key]);
      if (thread.id) threads[thread.id] = thread;
    });
    return { threads, pending: normalizePendingList(parsed.pending) };
  } catch {
    return emptyMemory();
  }
}

function writeFileBlob(next) {
  const target = filePath();
  if (!target) return;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(next));
}

async function readPending() {
  if (kvConfigured()) {
    const payload = await kvCommand(['GET', PENDING_KEY]);
    return normalizePendingList(decodeJson(payload && payload.result, []));
  }
  if (filePath()) memory = readFileBlob();
  return normalizePendingList(memory.pending);
}

async function writePending(list) {
  const pending = normalizePendingList(list);
  if (kvConfigured()) {
    await kvCommand(['SET', PENDING_KEY, JSON.stringify(pending)]);
    return pending;
  }
  if (filePath()) {
    const blob = readFileBlob();
    blob.pending = pending;
    writeFileBlob(blob);
    memory = blob;
    return pending;
  }
  memory.pending = pending;
  return pending;
}

async function readThread(id) {
  const threadId = clean(id, 40);
  if (!threadId) return null;
  if (kvConfigured()) {
    const payload = await kvCommand(['GET', threadKey(threadId)]);
    const raw = decodeJson(payload && payload.result, null);
    return raw ? normalizeThread(raw) : null;
  }
  if (filePath()) memory = readFileBlob();
  return memory.threads[threadId] ? normalizeThread(memory.threads[threadId]) : null;
}

async function writeThread(thread) {
  const next = normalizeThread(thread);
  if (!next.id) throw new Error('invalid_thread');
  if (kvConfigured()) {
    await kvCommand(['SET', threadKey(next.id), JSON.stringify(next)]);
    return next;
  }
  if (filePath()) {
    const blob = readFileBlob();
    blob.threads[next.id] = next;
    writeFileBlob(blob);
    memory = blob;
    return next;
  }
  memory.threads[next.id] = next;
  return next;
}

async function mutate(work) {
  try {
    return await work();
  } catch {
    console.log(JSON.stringify({ type: 'OpsCeoBridge', event: 'store_unavailable', mode: storeMode() }));
    return { error: 'store_unavailable' };
  }
}

function getBridgeSecret() {
  const secret = process.env.OPS_CEO_BRIDGE_SECRET;
  return typeof secret === 'string' && secret.length >= 16 ? secret : '';
}

function bridgeSecretConfigured() {
  return Boolean(getBridgeSecret());
}

function readBearer(req) {
  const raw = String(header(req, 'authorization') || '');
  const match = raw.match(/^\s*Bearer\s+(\S+)\s*$/i);
  return match ? match[1] : '';
}

function verifyBridgeSecret(req) {
  const expected = getBridgeSecret();
  if (!expected) return { error: 'unauthorized' };
  const got = readBearer(req);
  if (!got || !timingSafeEqualString(got, expected)) return { error: 'unauthorized' };
  return { ok: true };
}

function founderGuard(req) {
  if (looksLikeAgentRequest(req)) return { status: 403, error: 'agent_denied' };
  const session = readSession(req);
  if (session) return { session };
  const claimed = peekSessionEmail(req) || normalizeEmail(header(req, 'x-ops-email') || '');
  if (claimed && !isAllowlisted(claimed)) return { status: 403, error: 'forbidden' };
  return { status: 403, error: 'forbidden' };
}

function csrfFrom(req, body) {
  return (body && body.csrf)
    || header(req, 'x-csrf-token')
    || header(req, 'x-csrf');
}

function verifyFounderCsrf(session, req, body) {
  return Boolean(readCsrfToken(csrfFrom(req, body), session.email));
}

function firstQuery(req, key) {
  const query = queryOf(req);
  const value = query[key];
  return Array.isArray(value) ? value[0] : value;
}

function ceoBridgeKind(req) {
  const area = String(firstQuery(req, 'area') || '');
  const pathOnly = String(req.url || '').split('?')[0].replace(/\/+$/, '');
  const hay = `${area} ${pathOnly}`.toLowerCase();
  if (hay.includes('api/ceo-bridge/message')) return 'message';
  if (hay.includes('api/ceo-bridge/pending')) return 'pending';
  if (hay.includes('api/ceo-bridge/reply')) return 'reply';
  if (hay.includes('api/ceo-bridge/thread')) return 'thread';
  return '';
}

function upsertPending(list, item) {
  const next = normalizePendingItem(item);
  if (!next) return normalizePendingList(list);
  const others = normalizePendingList(list).filter((row) => row.threadId !== next.threadId);
  return others.concat([next]).slice(-MAX_PENDING);
}

async function getFounderThread(email) {
  return mutate(async () => {
    const who = normalizeEmail(email);
    if (!who || !isAllowlisted(who)) return { error: 'forbidden' };
    const existing = await readThread(threadIdFor(who));
    return { ok: true, thread: publicThread(existing || emptyThread(who)) };
  });
}

async function enqueueFounderMessage({
  text,
  founderEmail,
  threadId,
  source,
  correlationId,
  explicitWake,
  wake,
  enqueuePending,
  wakeReason,
}) {
  return mutate(async () => {
    const who = normalizeEmail(founderEmail);
    if (!who || !isAllowlisted(who)) return { error: 'forbidden' };
    const body = clean(text, MAX_TEXT);
    if (!body) return { error: 'invalid_message' };
    const requested = clean(threadId, 40);
    const id = requested || threadIdFor(who);
    if (requested && requested !== threadIdFor(who)) return { error: 'forbidden' };
    const current = (await readThread(id)) || emptyThread(who);
    if (current.founderEmail && current.founderEmail !== who) return { error: 'forbidden' };
    const reused = clean(correlationId, 40);
    const existing = reused ? founderByCorrelation(current, reused) : null;
    if (existing) {
      const pending = await readPending();
      return {
        ok: true,
        replay: true,
        waiting: threadIsWaiting(current),
        reply: lastCeoText(current) || WAITING_COPY,
        usedModel: false,
        source: clean(source, 40) || 'ops-office',
        thread: publicThread(current),
        pending: pending.find((item) => item.threadId === current.id) || null,
        correlationId: existing.correlationId,
        messageId: existing.id,
      };
    }
    const message = normalizeMessage({
      role: 'founder',
      text: body,
      at: Date.now(),
      correlationId: reused,
      provenance: 'human',
      responseOwner: 'pending',
    });
    const thread = normalizeThread({
      id,
      founderEmail: who,
      messages: current.messages.concat([message]),
      status: 'pending',
      updatedAt: Date.now(),
      answeredIds: current.answeredIds,
    });
    await writeThread(thread);
    const shouldQueue = enqueuePending !== false;
    let pending = await readPending();
    if (shouldQueue) {
      pending = upsertPending(pending, {
        threadId: thread.id,
        founderEmail: who,
        messageId: message.id,
        correlationId: message.correlationId,
        text: message.text,
        at: message.at,
        wakeReason: clean(wakeReason, 40) || (isExplicitWake({ text: body, explicitWake, wake }) ? 'explicit' : 'xai_unavailable'),
      });
      await writePending(pending);
    }
    return {
      ok: true,
      replay: false,
      waiting: true,
      reply: WAITING_COPY,
      usedModel: false,
      source: clean(source, 40) || 'ops-office',
      thread: publicThread(thread),
      pending: pending.find((item) => item.threadId === thread.id) || null,
      correlationId: message.correlationId,
      messageId: message.id,
    };
  });
}

async function listPending() {
  return mutate(async () => {
    const pending = await readPending();
    return { ok: true, pending };
  });
}

async function postCeoReply({ threadId, text, pendingId, messageId, correlationId }) {
  return mutate(async () => {
    const id = clean(threadId, 40);
    const body = clean(text, MAX_TEXT);
    if (!id) return { error: 'ceo_thread_not_found' };
    if (!body) return { error: 'invalid_message' };
    const current = await readThread(id);
    if (!current) return { error: 'ceo_thread_not_found' };
    const replayId = clean(pendingId, 40) || clean(messageId, 40) || clean(correlationId, 40);
    const founder = founderByCorrelation(current, replayId) || lastFounderMessage(current);
    const ownedBy = founder && founder.responseOwner ? founder.responseOwner : '';
    if (
      (replayId && current.answeredIds.includes(replayId))
      || (founder && hasCeoForCorrelation(current, founder.correlationId))
      || ownedBy === 'xai_runtime'
    ) {
      const open = await readPending();
      const pending = open.filter((item) => item.threadId !== current.id);
      if (pending.length !== open.length) await writePending(pending);
      return { ok: true, replay: true, thread: publicThread(current) };
    }
    const open = (await readPending()).find((item) => item.threadId === id);
    if (!open && current.status === 'answered') {
      return { ok: true, replay: true, thread: publicThread(current) };
    }
    const claimId = (founder && founder.correlationId) || replayId;
    const claimed = applyOwner(current, claimId, 'grok_bot_bridge');
    if (!claimed.ok) {
      return { ok: true, replay: true, thread: publicThread(current) };
    }
    const message = normalizeMessage({
      role: 'ceo',
      text: body,
      at: Date.now(),
      correlationId: claimId,
      provenance: 'grok_bot_bridge',
    });
    const answeredIds = claimId
      ? current.answeredIds.concat([claimId]).slice(-MAX_ANSWERED)
      : current.answeredIds;
    const thread = normalizeThread({
      id: current.id,
      founderEmail: current.founderEmail,
      messages: claimed.thread.messages.concat([message]),
      status: 'answered',
      updatedAt: Date.now(),
      answeredIds,
    });
    await writeThread(thread);
    const pending = (await readPending()).filter((item) => item.threadId !== thread.id);
    await writePending(pending);
    return { ok: true, replay: false, thread: publicThread(thread) };
  });
}

function lastFounderMessage(thread) {
  const messages = thread && Array.isArray(thread.messages) ? thread.messages : [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i] && messages[i].role === 'founder') return messages[i];
  }
  return null;
}

function applyOwner(thread, correlationId, owner) {
  const founder = founderByCorrelation(thread, correlationId) || lastFounderMessage(thread);
  if (!founder) return { ok: false, owner: '', thread };
  if (founder.responseOwner && founder.responseOwner !== 'pending' && founder.responseOwner !== owner) {
    return { ok: false, owner: founder.responseOwner, thread };
  }
  founder.responseOwner = owner;
  return { ok: true, owner, thread };
}

async function claimResponseOwner({ threadId, correlationId, owner }) {
  return mutate(async () => {
    const current = await readThread(threadId);
    if (!current) return { error: 'ceo_thread_not_found' };
    if (hasCeoForCorrelation(current, correlationId)) {
      const founder = founderByCorrelation(current, correlationId);
      return {
        ok: true,
        claimed: false,
        replay: true,
        owner: (founder && founder.responseOwner) || owner,
        thread: current,
      };
    }
    const result = applyOwner(current, correlationId, owner);
    if (!result.ok) {
      return { ok: true, claimed: false, replay: true, owner: result.owner, thread: current };
    }
    await writeThread(result.thread);
    return { ok: true, claimed: true, replay: false, owner, thread: result.thread };
  });
}

async function releaseResponseOwner({ threadId, correlationId, owner }) {
  return mutate(async () => {
    const current = await readThread(threadId);
    if (!current) return { error: 'ceo_thread_not_found' };
    if (hasCeoForCorrelation(current, correlationId)) return { ok: true, released: false, thread: current };
    const founder = founderByCorrelation(current, correlationId);
    if (!founder || founder.responseOwner !== owner) return { ok: true, released: false, thread: current };
    founder.responseOwner = 'pending';
    await writeThread(current);
    return { ok: true, released: true, thread: current };
  });
}

async function appendOwnedCeoReply({ threadId, correlationId, owner, text }) {
  return mutate(async () => {
    const current = await readThread(threadId);
    if (!current) return { error: 'ceo_thread_not_found' };
    const founder = founderByCorrelation(current, correlationId);
    if (!founder) return { error: 'ceo_thread_not_found' };
    if (hasCeoForCorrelation(current, correlationId) || current.answeredIds.includes(correlationId) || current.answeredIds.includes(founder.id)) {
      return {
        ok: true,
        replay: true,
        waiting: false,
        usedModel: founder.responseOwner === 'xai_runtime',
        provider: founder.responseOwner === 'xai_runtime' ? 'xai' : '',
        reply: lastCeoText(current) || WAITING_COPY,
        thread: publicThread(current),
        pending: null,
        correlationId,
      };
    }
    if (founder.responseOwner && founder.responseOwner !== 'pending' && founder.responseOwner !== owner) {
      return {
        ok: true,
        replay: true,
        waiting: threadIsWaiting(current),
        usedModel: false,
        provider: '',
        reply: lastCeoText(current) || WAITING_COPY,
        thread: publicThread(current),
        pending: null,
        correlationId,
      };
    }
    founder.responseOwner = owner;
    const message = normalizeMessage({
      role: 'ceo',
      text,
      at: Date.now(),
      correlationId: founder.correlationId,
      provenance: owner,
    });
    const thread = normalizeThread({
      id: current.id,
      founderEmail: current.founderEmail,
      messages: current.messages.concat([message]),
      status: 'answered',
      updatedAt: Date.now(),
      answeredIds: current.answeredIds.concat([founder.correlationId, founder.id]).filter(Boolean).slice(-MAX_ANSWERED),
    });
    await writeThread(thread);
    const pending = (await readPending()).filter((item) => item.threadId !== thread.id);
    await writePending(pending);
    return {
      ok: true,
      replay: false,
      waiting: false,
      usedModel: owner === 'xai_runtime',
      provider: owner === 'xai_runtime' ? 'xai' : '',
      reply: message.text,
      thread: publicThread(thread),
      pending: null,
      correlationId: founder.correlationId,
    };
  });
}

async function enqueuePendingWake({ thread, founder, wakeReason }) {
  return mutate(async () => {
    const pending = upsertPending(await readPending(), {
      threadId: thread.id,
      founderEmail: thread.founderEmail,
      messageId: founder.id,
      correlationId: founder.correlationId,
      text: founder.text,
      at: founder.at,
      wakeReason: clean(wakeReason, 40) || 'xai_unavailable',
    });
    await writePending(pending);
    return pending.find((item) => item.threadId === thread.id) || null;
  });
}

function formatCeoStoreContext(data) {
  const lines = ['Trusted LAVAALL OS records (KV). Use only these facts:'];
  const goal = data && data.goal ? data.goal : null;
  const tasks = data && Array.isArray(data.tasks) ? data.tasks : [];
  const notes = data && Array.isArray(data.notes) ? data.notes : [];
  if (!goal && !tasks.length && !notes.length) {
    lines.push('None loaded. Do not invent goals, tasks, notes, prices, SKUs, or legal positions.');
    return lines.join('\n');
  }
  if (goal) {
    lines.push(`Goal: ${goal.title}`);
    if (goal.definitionOfDone) lines.push(`Definition of done: ${goal.definitionOfDone}`);
    if (goal.nextStep) lines.push(`Next step: ${goal.nextStep}`);
    if (goal.targetDate) lines.push(`Target date: ${goal.targetDate}`);
  }
  tasks.forEach((task) => {
    lines.push(`Task: ${task.title} (${task.status || 'todo'})`);
    if (task.nextAction) lines.push(`Task next action: ${task.nextAction}`);
  });
  notes.forEach((note) => {
    lines.push(`Note: ${note.title}${note.body ? ` — ${note.body}` : ''}`);
  });
  return lines.join('\n');
}

async function loadCeoTrustedContext() {
  try {
    const data = await readStore();
    return {
      goal: data && data.goal ? data.goal : null,
      tasks: unfinishedTasks(data || {}).slice(0, 12),
      notes: notesSelectableForChat(data || {}).slice(0, 8),
    };
  } catch {
    return { goal: null, tasks: [], notes: [] };
  }
}

function ceoSystemPrompt(context) {
  return [
    'You are LAVAALL CEO.',
    'Researchy-first on sourcing; Technical only when validation is needed.',
    'Use only the trusted KV records below. Do not invent prices, SKUs, legal positions, owners, or completions.',
    'Drafts only. Talk is conversation — not Assign.',
    'Never mention /ops, Talk bridges, helpers, Anthropic, OpenAI, or xAI.',
    formatCeoStoreContext(context),
  ].join('\n');
}

function ceoMessagesForXai(thread) {
  return (thread && Array.isArray(thread.messages) ? thread.messages : []).map((item) => ({
    role: item.role === 'ceo' ? 'assistant' : 'user',
    content: item.text,
  })).slice(-20);
}

async function waitingFallback({ threadId, correlationId, wakeReason }) {
  const current = await readThread(threadId);
  const founder = current ? founderByCorrelation(current, correlationId) || lastFounderMessage(current) : null;
  const pending = current && founder
    ? await enqueuePendingWake({ thread: current, founder, wakeReason: wakeReason || 'xai_unavailable' })
    : null;
  return {
    ok: true,
    waiting: true,
    usedModel: false,
    provider: '',
    reply: WAITING_COPY,
    thread: publicThread(current || emptyThread('')),
    pending,
    correlationId,
  };
}

async function completeXaiCeoReply({ threadId, correlationId }) {
  const claim = await claimResponseOwner({ threadId, correlationId, owner: 'xai_runtime' });
  if (claim.error) return waitingFallback({ threadId, correlationId, wakeReason: 'xai_unavailable' });
  if (!claim.claimed) {
    return {
      ok: true,
      replay: true,
      waiting: threadIsWaiting(claim.thread) && !hasCeoForCorrelation(claim.thread, correlationId),
      usedModel: claim.owner === 'xai_runtime' && hasCeoForCorrelation(claim.thread, correlationId),
      provider: claim.owner === 'xai_runtime' ? 'xai' : '',
      reply: lastCeoText(claim.thread) || WAITING_COPY,
      thread: publicThread(claim.thread),
      pending: null,
      correlationId,
    };
  }
  try {
    const context = await loadCeoTrustedContext();
    const result = await completeXai({
      system: ceoSystemPrompt(context),
      messages: ceoMessagesForXai(claim.thread),
    });
    if (result.error || !result.text) throw new Error('xai_failed');
    return await appendOwnedCeoReply({
      threadId,
      correlationId,
      owner: 'xai_runtime',
      text: result.text,
    });
  } catch {
    await releaseResponseOwner({ threadId, correlationId, owner: 'xai_runtime' });
    return waitingFallback({ threadId, correlationId, wakeReason: 'xai_unavailable' });
  }
}

async function talkToCeo(input) {
  const explicitWake = isExplicitWake(input);
  const tryXai = xaiConfigured() && !explicitWake;
  const queued = await enqueueFounderMessage(Object.assign({}, input, {
    explicitWake,
    enqueuePending: !tryXai,
    wakeReason: explicitWake ? 'explicit' : (xaiConfigured() ? '' : 'xai_unavailable'),
  }));
  if (queued.error) return queued;
  if (queued.replay && (!tryXai || !threadIsWaiting(queued.thread))) {
    return Object.assign({}, queued, {
      waiting: threadIsWaiting(queued.thread),
      reply: lastCeoText(queued.thread) || queued.reply || WAITING_COPY,
    });
  }
  if (!tryXai) {
    return Object.assign({}, queued, {
      waiting: true,
      reply: WAITING_COPY,
      usedModel: false,
      provider: '',
    });
  }
  return completeXaiCeoReply({
    threadId: queued.thread.id,
    correlationId: queued.correlationId,
  });
}

async function inspectCeoThread(id) {
  return mutate(async () => {
    const thread = await readThread(id);
    return { ok: true, thread: thread || null };
  });
}

function writeStatus(error) {
  switch (error) {
    case 'unauthorized':
      return 401;
    case 'forbidden':
    case 'agent_denied':
    case 'csrf':
    case 'invalid_csrf':
      return 403;
    case 'ceo_thread_not_found':
      return 404;
    case 'store_unavailable':
      return 503;
    case 'invalid_message':
    case 'method_not_allowed':
      return error === 'method_not_allowed' ? 405 : 400;
    default: {
      const _never = error;
      void _never;
      return 400;
    }
  }
}

function errorMessage(error) {
  switch (error) {
    case 'store_unavailable':
      return 'The CEO bridge store is unavailable. Check Vercel KV (KV_REST_API_URL + KV_REST_API_TOKEN).';
    case 'unauthorized':
      return 'CEO bridge secret was rejected.';
    case 'forbidden':
    case 'agent_denied':
      return 'That request is not allowed.';
    case 'csrf':
    case 'invalid_csrf':
      return 'Refresh was rejected. Reload Chat and try again.';
    case 'invalid_message':
      return 'Enter a message.';
    case 'ceo_thread_not_found':
      return 'That CEO thread was not found.';
    default: {
      return 'Could not use the CEO bridge.';
    }
  }
}

function sendBridgeError(req, res, error) {
  const status = writeStatus(error);
  if (wantsJson(req)) return sendJson(res, status, { error, message: errorMessage(error) });
  if (error === 'store_unavailable' || error === 'invalid_message' || error === 'csrf' || error === 'invalid_csrf') {
    return redirect(res, '/ops/chat?agent=lavaall-ceo');
  }
  return sendJson(res, status, { error, message: errorMessage(error) });
}

async function handleMessage(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });
  const access = founderGuard(req);
  if (!access.session) return sendJson(res, access.status, { error: access.error });
  if (payloadTooLarge(req)) return sendJson(res, 413, { error: 'payload_too_large' });
  const body = readBody(req);
  if (!verifyFounderCsrf(access.session, req, body)) {
    return sendBridgeError(req, res, 'csrf');
  }
  const result = await talkToCeo({
    text: body.text || body.message,
    founderEmail: access.session.email,
    threadId: body.threadId || body.id,
    source: body.source || 'ops-office',
    correlationId: body.correlationId,
    explicitWake: body.explicitWake || body.wake,
    wake: body.wake,
  });
  if (result.error) return sendBridgeError(req, res, result.error);
  if (wantsJson(req)) {
    return sendJson(res, 200, Object.assign({ ok: true }, result, {
      csrf: createCsrfToken(access.session.email),
      waiting: threadIsWaiting(result.thread),
      waitingCopy: WAITING_COPY,
      agentId: 'lavaall-ceo',
      agentName: 'LAVAALL CEO',
    }));
  }
  return redirect(res, '/ops/chat?agent=lavaall-ceo');
}

async function handleThread(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'method_not_allowed' });
  const access = founderGuard(req);
  if (!access.session) return sendJson(res, access.status, { error: access.error });
  const requested = clean(firstQuery(req, 'id') || firstQuery(req, 'threadId'), 40);
  const ownId = threadIdFor(access.session.email);
  if (requested && requested !== ownId) return sendJson(res, 403, { error: 'forbidden' });
  const loaded = await getFounderThread(access.session.email);
  if (loaded.error) return sendBridgeError(req, res, loaded.error);
  return sendJson(res, 200, {
    ok: true,
    thread: loaded.thread,
    waiting: threadIsWaiting(loaded.thread),
    waitingCopy: WAITING_COPY,
    agentId: 'lavaall-ceo',
    agentName: 'LAVAALL CEO',
    csrf: createCsrfToken(access.session.email),
  });
}

async function handlePending(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'method_not_allowed' });
  const auth = verifyBridgeSecret(req);
  if (auth.error) return sendJson(res, 401, { error: 'unauthorized' });
  const result = await listPending();
  if (result.error) return sendBridgeError(req, res, result.error);
  return sendJson(res, 200, { ok: true, pending: result.pending });
}

async function handleReply(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });
  const auth = verifyBridgeSecret(req);
  if (auth.error) return sendJson(res, 401, { error: 'unauthorized' });
  if (payloadTooLarge(req)) return sendJson(res, 413, { error: 'payload_too_large' });
  const body = readBody(req);
  const result = await postCeoReply({
    threadId: body.threadId || body.id,
    text: body.text || body.message || body.reply,
    pendingId: body.pendingId,
    messageId: body.messageId,
    correlationId: body.correlationId,
  });
  if (result.error) return sendBridgeError(req, res, result.error);
  return sendJson(res, 200, {
    ok: true,
    replay: result.replay,
    thread: result.thread,
    waiting: threadIsWaiting(result.thread),
  });
}

async function handleCeoBridge(req, res) {
  const kind = ceoBridgeKind(req);
  if (!kind) return false;
  switch (kind) {
    case 'message':
      await handleMessage(req, res);
      return true;
    case 'pending':
      await handlePending(req, res);
      return true;
    case 'reply':
      await handleReply(req, res);
      return true;
    case 'thread':
      await handleThread(req, res);
      return true;
    default: {
      const _never = kind;
      void _never;
      return false;
    }
  }
}

function resetCeoBridge(seed) {
  const next = emptyMemory();
  if (seed && seed.threads && typeof seed.threads === 'object') {
    Object.keys(seed.threads).forEach((key) => {
      const thread = normalizeThread(seed.threads[key]);
      if (thread.id) next.threads[thread.id] = thread;
    });
  }
  if (seed && Array.isArray(seed.pending)) next.pending = normalizePendingList(seed.pending);
  memory = next;
}

module.exports = {
  CEO_DESK_ID,
  PENDING_KEY,
  PROVENANCE,
  RESPONSE_OWNERS,
  SLACK_FALLBACK,
  THREAD_KEY_PREFIX,
  WAITING_COPY,
  bridgeSecretConfigured,
  ceoBridgeKind,
  ceoSystemPrompt,
  claimResponseOwner,
  emptyThread,
  enqueueFounderMessage,
  getFounderThread,
  handleCeoBridge,
  inspectCeoThread,
  isExplicitWake,
  listPending,
  postCeoReply,
  publicThread,
  resetCeoBridge,
  storeMode,
  talkToCeo,
  threadIdFor,
  threadIsWaiting,
  threadKey,
  verifyBridgeSecret,
};
