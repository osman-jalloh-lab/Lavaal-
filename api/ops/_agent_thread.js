// Talk-ALL desks — persistent KV threads + server xAI (Slice 1 reuse).
// _xai.js stays the only model adapter. B2 explicit-wake stays CEO-only
// (see _ceo_bridge.js). Other desks: xAI when XAI_API_KEY is set, else Waiting.
// KV SoT: ops:agent:thread:{agentId}:{id}. Never invent prices. CEO Assign lives in _assign.js.
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
  wantsJson,
} = require('./_lib');
const { notesSelectableForChat, readStore, unfinishedTasks } = require('./_store');
const { completeXai, xaiConfigured } = require('./_xai');
const { normalizeTalkAgentId, officeAgentById } = require('./_office');
const ceoBridge = require('./_ceo_bridge');
const assign = require('./_assign');

const CEO_DESK_ID = 'lavaall-ceo';
const THREAD_KEY_PREFIX = 'ops:agent:thread:';
const THREAD_ROLES = Object.freeze(['founder', 'assistant']);
const THREAD_STATUSES = Object.freeze(['pending', 'answered']);
const PROVENANCE = Object.freeze(['human', 'xai_runtime', 'grok_bot_bridge', 'system', 'tool']);
const RESPONSE_OWNERS = Object.freeze(['pending', 'xai_runtime']);
const MAX_MESSAGES = 40;
const MAX_ANSWERED = 40;
const MAX_TEXT = 2000;
const MARKETS_STUB = 'LAVAALL is a quote-first international product-sourcing marketplace. Category → brand → family → model → variant, then Request Quote. Never imply a live checkout price.';

const DESK_PROMPTS = Object.freeze({
  'lavaall-ceo': {
    name: 'LAVAALL CEO',
    lines: [
      'You are LAVAALL CEO. One voice in the Office.',
      'Quality gate for later routing. Researchy-first on sourcing; Technical only when validation is needed.',
    ],
  },
  sales: {
    name: 'LAVAALL Sales & Customer Success',
    lines: [
      'You are LAVAALL Sales & Customer Success. One voice at this desk.',
      'Help founders draft customer replies and quote-request framing. Do not close a price.',
    ],
  },
  technical: {
    name: 'LAVAALL Technical & QA',
    lines: [
      'You are LAVAALL Technical & QA. One voice at this desk.',
      'Validation and quality only when the founder asks to check a fact, spec, or defect. Do not invent certifications.',
    ],
  },
  growth: {
    name: 'LAVAALL Growth, UGC & Ads',
    lines: [
      'You are LAVAALL Growth, UGC & Ads. One voice at this desk.',
      'Draft campaign and UGC notes. Do not invent spend, ROAS, or live ad results.',
    ],
  },
  lifecycle: {
    name: 'LAVAALL Lifecycle & Klaviyo',
    lines: [
      'You are LAVAALL Lifecycle & Klaviyo. One voice at this desk.',
      'Draft journey and retention notes. Do not invent list sizes, open rates, or send mail.',
    ],
  },
  researchy: {
    name: 'Researchy',
    lines: [
      'You are Researchy. One voice at this desk.',
      'Researchy-first on sourcing: gather supplier and catalog research. Technical only when validation is needed.',
      'Do not invent suppliers, lead times, or landed costs.',
    ],
  },
});

let memory = emptyMemory();

function emptyMemory() {
  return { threads: {} };
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
  return typeof custom === 'string' && custom.trim() ? `${custom.trim()}.desk-talk.json` : '';
}

function storeMode() {
  if (kvConfigured()) return 'kv';
  if (filePath()) return 'file';
  return 'memory';
}

function normalizeAgentId(value) {
  return normalizeTalkAgentId(clean(value, 40));
}

function deskName(agentId) {
  const id = normalizeAgentId(agentId);
  const fromOffice = officeAgentById(id);
  if (fromOffice && fromOffice.name) return fromOffice.name;
  return (DESK_PROMPTS[id] && DESK_PROMPTS[id].name) || 'LAVAALL desk';
}

function waitingCopy(agentId) {
  return `Waiting on ${deskName(agentId)}…`;
}

function threadKey(agentId, id) {
  return `${THREAD_KEY_PREFIX}${normalizeAgentId(agentId)}:${clean(id, 40)}`;
}

function threadIdFor(agentId, email) {
  const who = normalizeEmail(email);
  const desk = normalizeAgentId(agentId) || 'desk';
  const digest = crypto.createHash('sha256').update(`${desk}:${who || 'unknown'}`).digest('hex').slice(0, 16);
  return `${desk}-${digest}`.slice(0, 40);
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
  const message = {
    id,
    role,
    text,
    at: Number.isFinite(row && row.at) ? row.at : Date.now(),
    correlationId: clean(row && row.correlationId, 40) || id,
    provenance: normalizeProvenance(row && row.provenance, role),
  };
  if (role === 'founder') message.responseOwner = normalizeResponseOwner(row && row.responseOwner);
  return message;
}

function normalizeThread(row, fallbackEmail, agentId) {
  const founderEmail = normalizeEmail((row && row.founderEmail) || fallbackEmail);
  const desk = normalizeAgentId((row && row.agentId) || agentId);
  const id = clean(row && row.id, 40) || (founderEmail && desk ? threadIdFor(desk, founderEmail) : '');
  const messages = Array.isArray(row && row.messages)
    ? row.messages.map(normalizeMessage).filter(Boolean).slice(-MAX_MESSAGES)
    : [];
  const answeredIds = Array.isArray(row && row.answeredIds)
    ? row.answeredIds.map((value) => clean(value, 40)).filter(Boolean).slice(-MAX_ANSWERED)
    : [];
  return {
    id,
    agentId: desk,
    founderEmail,
    messages,
    status: normalizeStatus(row && row.status),
    updatedAt: Number.isFinite(row && row.updatedAt) ? row.updatedAt : Date.now(),
    answeredIds,
  };
}

function emptyThread(agentId, email) {
  const desk = normalizeAgentId(agentId);
  const founderEmail = normalizeEmail(email);
  return {
    id: desk && founderEmail ? threadIdFor(desk, founderEmail) : '',
    agentId: desk,
    founderEmail,
    messages: [],
    status: 'answered',
    updatedAt: 0,
    answeredIds: [],
  };
}

function publicThread(thread) {
  const row = thread && thread.id ? thread : emptyThread('', '');
  return {
    id: row.id,
    agentId: row.agentId,
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

function lastThreadMessage(thread) {
  const messages = thread && Array.isArray(thread.messages) ? thread.messages : [];
  return messages.length ? messages[messages.length - 1] : null;
}

function lastAssistantText(thread) {
  const messages = thread && Array.isArray(thread.messages) ? thread.messages : [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i] && messages[i].role === 'assistant') return messages[i].text;
  }
  return '';
}

function threadIsWaiting(thread) {
  if (!thread) return false;
  const last = lastThreadMessage(thread);
  if (last && last.role === 'assistant') return false;
  return thread.status === 'pending';
}

function founderByCorrelation(thread, correlationId) {
  const id = clean(correlationId, 40);
  if (!id || !thread) return null;
  return (thread.messages || []).find((item) => (
    item.role === 'founder' && (item.correlationId === id || item.id === id)
  )) || null;
}

function hasAssistantForCorrelation(thread, correlationId) {
  const id = clean(correlationId, 40);
  if (!id || !thread) return false;
  return (thread.messages || []).some((item) => (
    item.role === 'assistant' && (item.correlationId === id || item.id === id)
  ));
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
      if (thread.id && thread.agentId) threads[`${thread.agentId}:${thread.id}`] = thread;
    });
    return { threads };
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

function memoryKey(agentId, threadId) {
  return `${normalizeAgentId(agentId)}:${clean(threadId, 40)}`;
}

async function readThread(agentId, id) {
  const desk = normalizeAgentId(agentId);
  const threadId = clean(id, 40);
  if (!desk || !threadId) return null;
  if (kvConfigured()) {
    const payload = await kvCommand(['GET', threadKey(desk, threadId)]);
    const raw = decodeJson(payload && payload.result, null);
    return raw ? normalizeThread(raw, '', desk) : null;
  }
  if (filePath()) memory = readFileBlob();
  const row = memory.threads[memoryKey(desk, threadId)];
  return row ? normalizeThread(row, '', desk) : null;
}

async function writeThread(thread) {
  const next = normalizeThread(thread);
  if (!next.id || !next.agentId) throw new Error('invalid_thread');
  if (kvConfigured()) {
    await kvCommand(['SET', threadKey(next.agentId, next.id), JSON.stringify(next)]);
    return next;
  }
  if (filePath()) {
    const blob = readFileBlob();
    blob.threads[memoryKey(next.agentId, next.id)] = next;
    writeFileBlob(blob);
    memory = blob;
    return next;
  }
  memory.threads[memoryKey(next.agentId, next.id)] = next;
  return next;
}

async function mutate(work) {
  try {
    return await work();
  } catch {
    console.log(JSON.stringify({ type: 'OpsDeskTalk', event: 'store_unavailable', mode: storeMode() }));
    return { error: 'store_unavailable' };
  }
}

function formatStoreContext(data) {
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

async function loadTrustedContext() {
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

function deskSystemPrompt(agentId, context) {
  const desk = DESK_PROMPTS[normalizeAgentId(agentId)] || DESK_PROMPTS.sales;
  return [
    desk.lines.join(' '),
    MARKETS_STUB,
    'Use only the trusted KV records below. Do not invent prices, SKUs, legal positions, owners, or completions.',
    'Drafts only. Assigned research from LAVAALL CEO posts here.',
    'Never mention /ops, Talk bridges, helpers, Anthropic, OpenAI, or xAI.',
    formatStoreContext(context),
  ].join('\n');
}

function deskMessagesForXai(thread) {
  return (thread && Array.isArray(thread.messages) ? thread.messages : []).map((item) => ({
    role: item.role === 'assistant' ? 'assistant' : 'user',
    content: item.text,
  })).slice(-20);
}

function applyOwner(thread, correlationId, owner) {
  const founder = founderByCorrelation(thread, correlationId);
  if (!founder) return { ok: false, owner: '', thread };
  if (founder.responseOwner && founder.responseOwner !== 'pending' && founder.responseOwner !== owner) {
    return { ok: false, owner: founder.responseOwner, thread };
  }
  founder.responseOwner = owner;
  return { ok: true, owner, thread };
}

async function claimResponseOwner({ agentId, threadId, correlationId, owner }) {
  return mutate(async () => {
    const current = await readThread(agentId, threadId);
    if (!current) return { error: 'desk_thread_not_found' };
    if (hasAssistantForCorrelation(current, correlationId)) {
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

async function releaseResponseOwner({ agentId, threadId, correlationId, owner }) {
  return mutate(async () => {
    const current = await readThread(agentId, threadId);
    if (!current) return { error: 'desk_thread_not_found' };
    if (hasAssistantForCorrelation(current, correlationId)) return { ok: true, released: false, thread: current };
    const founder = founderByCorrelation(current, correlationId);
    if (!founder || founder.responseOwner !== owner) return { ok: true, released: false, thread: current };
    founder.responseOwner = 'pending';
    await writeThread(current);
    return { ok: true, released: true, thread: current };
  });
}

async function appendOwnedReply({ agentId, threadId, correlationId, owner, text }) {
  return mutate(async () => {
    const current = await readThread(agentId, threadId);
    if (!current) return { error: 'desk_thread_not_found' };
    const founder = founderByCorrelation(current, correlationId);
    if (!founder) return { error: 'desk_thread_not_found' };
    if (hasAssistantForCorrelation(current, correlationId) || current.answeredIds.includes(correlationId) || current.answeredIds.includes(founder.id)) {
      return {
        ok: true,
        replay: true,
        waiting: false,
        usedModel: founder.responseOwner === 'xai_runtime',
        provider: founder.responseOwner === 'xai_runtime' ? 'xai' : '',
        reply: lastAssistantText(current) || waitingCopy(agentId),
        thread: publicThread(current),
        correlationId,
        agentId: current.agentId,
      };
    }
    if (founder.responseOwner && founder.responseOwner !== 'pending' && founder.responseOwner !== owner) {
      return {
        ok: true,
        replay: true,
        waiting: threadIsWaiting(current),
        usedModel: false,
        provider: '',
        reply: lastAssistantText(current) || waitingCopy(agentId),
        thread: publicThread(current),
        correlationId,
        agentId: current.agentId,
      };
    }
    founder.responseOwner = owner;
    const message = normalizeMessage({
      role: 'assistant',
      text,
      at: Date.now(),
      correlationId: founder.correlationId,
      provenance: owner,
    });
    const thread = normalizeThread({
      id: current.id,
      agentId: current.agentId,
      founderEmail: current.founderEmail,
      messages: current.messages.concat([message]),
      status: 'answered',
      updatedAt: Date.now(),
      answeredIds: current.answeredIds.concat([founder.correlationId, founder.id]).filter(Boolean).slice(-MAX_ANSWERED),
    }, current.founderEmail, current.agentId);
    await writeThread(thread);
    return {
      ok: true,
      replay: false,
      waiting: false,
      usedModel: owner === 'xai_runtime',
      provider: owner === 'xai_runtime' ? 'xai' : '',
      reply: message.text,
      thread: publicThread(thread),
      correlationId: founder.correlationId,
      agentId: thread.agentId,
    };
  });
}

async function enqueueFounderMessage({ agentId, text, founderEmail, threadId, source, correlationId }) {
  return mutate(async () => {
    const desk = normalizeAgentId(agentId);
    const who = normalizeEmail(founderEmail);
    if (!desk) return { error: 'invalid_agent' };
    if (!who || !isAllowlisted(who)) return { error: 'forbidden' };
    const body = clean(text, MAX_TEXT);
    if (!body) return { error: 'invalid_message' };
    const requested = clean(threadId, 40);
    const id = requested || threadIdFor(desk, who);
    if (requested && requested !== threadIdFor(desk, who)) return { error: 'forbidden' };
    const current = (await readThread(desk, id)) || emptyThread(desk, who);
    if (current.founderEmail && current.founderEmail !== who) return { error: 'forbidden' };
    const reused = clean(correlationId, 40);
    const existing = reused ? founderByCorrelation(current, reused) : null;
    if (existing) {
      return {
        ok: true,
        replay: true,
        waiting: threadIsWaiting(current),
        reply: lastAssistantText(current) || waitingCopy(desk),
        usedModel: false,
        source: clean(source, 40) || 'ops-office',
        thread: publicThread(current),
        correlationId: existing.correlationId,
        messageId: existing.id,
        agentId: desk,
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
      agentId: desk,
      founderEmail: who,
      messages: current.messages.concat([message]),
      status: 'pending',
      updatedAt: Date.now(),
      answeredIds: current.answeredIds,
    }, who, desk);
    await writeThread(thread);
    return {
      ok: true,
      replay: false,
      waiting: true,
      reply: waitingCopy(desk),
      usedModel: false,
      source: clean(source, 40) || 'ops-office',
      thread: publicThread(thread),
      correlationId: message.correlationId,
      messageId: message.id,
      agentId: desk,
    };
  });
}

async function completeXaiDeskReply({ agentId, threadId, correlationId }) {
  const claim = await claimResponseOwner({
    agentId,
    threadId,
    correlationId,
    owner: 'xai_runtime',
  });
  if (claim.error) {
    const current = await readThread(agentId, threadId);
    return {
      ok: true,
      waiting: true,
      usedModel: false,
      provider: '',
      reply: waitingCopy(agentId),
      thread: publicThread(current || emptyThread(agentId, '')),
      correlationId,
      agentId,
    };
  }
  if (!claim.claimed) {
    return {
      ok: true,
      replay: true,
      waiting: threadIsWaiting(claim.thread) && !hasAssistantForCorrelation(claim.thread, correlationId),
      usedModel: claim.owner === 'xai_runtime' && hasAssistantForCorrelation(claim.thread, correlationId),
      provider: claim.owner === 'xai_runtime' ? 'xai' : '',
      reply: lastAssistantText(claim.thread) || waitingCopy(agentId),
      thread: publicThread(claim.thread),
      correlationId,
      agentId,
    };
  }
  try {
    const context = await loadTrustedContext();
    const result = await completeXai({
      system: deskSystemPrompt(agentId, context),
      messages: deskMessagesForXai(claim.thread),
    });
    if (result.error || !result.text) throw new Error('xai_failed');
    return await appendOwnedReply({
      agentId,
      threadId,
      correlationId,
      owner: 'xai_runtime',
      text: result.text,
    });
  } catch {
    await releaseResponseOwner({ agentId, threadId, correlationId, owner: 'xai_runtime' });
    const current = await readThread(agentId, threadId);
    return {
      ok: true,
      waiting: true,
      usedModel: false,
      provider: '',
      reply: waitingCopy(agentId),
      thread: publicThread(current || emptyThread(agentId, '')),
      correlationId,
      agentId,
    };
  }
}

async function talkToDesk(input) {
  const desk = normalizeAgentId(input && input.agentId);
  if (!desk) return { error: 'invalid_agent' };
  if (desk === CEO_DESK_ID) {
    return ceoBridge.talkToCeo(input);
  }
  const tryXai = xaiConfigured();
  const queued = await enqueueFounderMessage(Object.assign({}, input, { agentId: desk }));
  if (queued.error) return queued;
  if (queued.replay && (!tryXai || !threadIsWaiting(queued.thread))) {
    return Object.assign({}, queued, {
      waiting: threadIsWaiting(queued.thread),
      reply: lastAssistantText(queued.thread) || queued.reply || waitingCopy(desk),
    });
  }
  if (!tryXai) {
    return Object.assign({}, queued, {
      waiting: true,
      reply: waitingCopy(desk),
      usedModel: false,
      provider: '',
    });
  }
  return completeXaiDeskReply({
    agentId: desk,
    threadId: queued.thread.id,
    correlationId: queued.correlationId,
  });
}

async function getFounderDeskThread(agentId, email) {
  return mutate(async () => {
    const desk = normalizeAgentId(agentId);
    const who = normalizeEmail(email);
    if (!desk) return { error: 'invalid_agent' };
    if (!who || !isAllowlisted(who)) return { error: 'forbidden' };
    const existing = await readThread(desk, threadIdFor(desk, who));
    return { ok: true, thread: publicThread(existing || emptyThread(desk, who)) };
  });
}

async function inspectDeskThread(agentId, id) {
  return mutate(async () => {
    const thread = await readThread(agentId, id);
    return { ok: true, thread: thread || null };
  });
}

function sendJson(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  return json(res, status, body);
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

function firstQuery(req, key) {
  const query = queryOf(req);
  const value = query[key];
  return Array.isArray(value) ? value[0] : value;
}

function deskTalkKind(req) {
  const area = String(firstQuery(req, 'area') || '');
  const pathOnly = String(req.url || '').split('?')[0].replace(/\/+$/, '');
  const hay = `${area} ${pathOnly}`.toLowerCase();
  if (!hay.includes('desk-talk')) return '';
  if (hay.includes('message')) return 'message';
  if (hay.includes('thread')) return 'thread';
  return '';
}

function agentFromPath(req) {
  const area = String(firstQuery(req, 'area') || '');
  const pathOnly = String(req.url || '').split('?')[0];
  const match = `${area} ${pathOnly}`.match(/desk-talk\/([a-z0-9-]+)\/(?:thread|message)/i);
  return match ? normalizeAgentId(match[1]) : '';
}

function writeStatus(error) {
  switch (error) {
    case 'forbidden':
    case 'agent_denied':
    case 'csrf':
    case 'invalid_csrf':
      return 403;
    case 'desk_thread_not_found':
      return 404;
    case 'store_unavailable':
      return 503;
    case 'invalid_message':
    case 'invalid_agent':
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
      return 'The desk Talk store is unavailable. Check Vercel KV (KV_REST_API_URL + KV_REST_API_TOKEN).';
    case 'forbidden':
    case 'agent_denied':
      return 'That request is not allowed.';
    case 'csrf':
    case 'invalid_csrf':
      return 'Refresh was rejected. Reload Chat and try again.';
    case 'invalid_message':
      return 'Enter a message.';
    case 'invalid_agent':
      return 'That desk cannot Talk.';
    case 'desk_thread_not_found':
      return 'That desk thread was not found.';
    default:
      return 'Could not use desk Talk.';
  }
}

function sendDeskError(req, res, error, agentId) {
  const status = writeStatus(error);
  if (wantsJson(req)) return sendJson(res, status, { error, message: errorMessage(error) });
  if (error === 'store_unavailable' || error === 'invalid_message' || error === 'csrf' || error === 'invalid_csrf') {
    const desk = normalizeAgentId(agentId) || 'sales';
    return redirect(res, `/ops/chat?agent=${desk}`);
  }
  return sendJson(res, status, { error, message: errorMessage(error) });
}

async function handleMessage(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });
  const access = founderGuard(req);
  if (!access.session) return sendJson(res, access.status, { error: access.error });
  if (payloadTooLarge(req)) return sendJson(res, 413, { error: 'payload_too_large' });
  const body = readBody(req);
  // Use agentId, never body.agent — looksLikeAgentRequest treats body.agent as bot auth.
  const agentId = normalizeAgentId(body.agentId || agentFromPath(req) || firstQuery(req, 'agent') || firstQuery(req, 'agentId'));
  if (!agentId || agentId === CEO_DESK_ID) return sendDeskError(req, res, 'invalid_agent', agentId);
  if (!readCsrfToken(csrfFrom(req, body), access.session.email)) {
    return sendDeskError(req, res, 'csrf', agentId);
  }
  const result = await talkToDesk({
    agentId,
    text: body.text || body.message,
    founderEmail: access.session.email,
    threadId: body.threadId || body.id,
    source: body.source || 'ops-office',
    correlationId: body.correlationId,
  });
  if (result.error) return sendDeskError(req, res, result.error, agentId);
  await assign.noteDeskProgress({
    agentId,
    threadId: result.thread && result.thread.id,
    correlationId: result.correlationId,
    resultText: result.waiting ? '' : result.reply,
    waiting: result.waiting,
  });
  if (wantsJson(req)) {
    return sendJson(res, 200, Object.assign({ ok: true }, result, {
      csrf: createCsrfToken(access.session.email),
      waiting: threadIsWaiting(result.thread),
      waitingCopy: waitingCopy(agentId),
      agentId,
      agentName: deskName(agentId),
    }));
  }
  return redirect(res, `/ops/chat?agent=${agentId}`);
}

async function handleThread(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'method_not_allowed' });
  const access = founderGuard(req);
  if (!access.session) return sendJson(res, access.status, { error: access.error });
  const agentId = normalizeAgentId(agentFromPath(req) || firstQuery(req, 'agent') || firstQuery(req, 'agentId'));
  if (!agentId || agentId === CEO_DESK_ID) return sendDeskError(req, res, 'invalid_agent', agentId);
  const requested = clean(firstQuery(req, 'id') || firstQuery(req, 'threadId'), 40);
  const ownId = threadIdFor(agentId, access.session.email);
  if (requested && requested !== ownId) return sendJson(res, 403, { error: 'forbidden' });
  const loaded = await getFounderDeskThread(agentId, access.session.email);
  if (loaded.error) return sendDeskError(req, res, loaded.error, agentId);
  const progressed = await assign.onDeskThreadPoll({
    agentId,
    founderEmail: access.session.email,
  });
  const thread = (progressed && progressed.thread) || loaded.thread;
  return sendJson(res, 200, {
    ok: true,
    thread,
    waiting: threadIsWaiting(thread),
    waitingCopy: waitingCopy(agentId),
    agentId,
    agentName: deskName(agentId),
    csrf: createCsrfToken(access.session.email),
  });
}

async function handleDeskTalk(req, res) {
  const kind = deskTalkKind(req);
  if (!kind) return false;
  switch (kind) {
    case 'message':
      await handleMessage(req, res);
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

function resetDeskTalk(seed) {
  const next = emptyMemory();
  if (seed && seed.threads && typeof seed.threads === 'object') {
    Object.keys(seed.threads).forEach((key) => {
      const thread = normalizeThread(seed.threads[key]);
      if (thread.id && thread.agentId) next.threads[memoryKey(thread.agentId, thread.id)] = thread;
    });
  }
  memory = next;
}

Object.assign(module.exports, {
  CEO_DESK_ID,
  DESK_PROMPTS,
  MARKETS_STUB,
  PROVENANCE,
  THREAD_KEY_PREFIX,
  deskName,
  deskSystemPrompt,
  deskTalkKind,
  getFounderDeskThread,
  handleDeskTalk,
  inspectDeskThread,
  normalizeAgentId,
  publicThread,
  resetDeskTalk,
  storeMode,
  talkToDesk,
  threadIdFor,
  threadIsWaiting,
  threadKey,
  waitingCopy,
});
