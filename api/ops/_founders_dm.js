// Private thread between the two founder accounts only.
// Same session cookie and Vercel KV (or the local file/memory fallback) as the
// rest of /ops. A separate key so Office, Talk, Assign, routines, and chat
// never read these messages when they load the shared store.
// Underscore prefix: not a Vercel function. No npm. Never log message text.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { layout, loginPage } = require('./_html');
const {
  ALLOWLIST,
  createCsrfToken,
  escapeHtml,
  header,
  isAllowlisted,
  looksLikeAgentRequest,
  normalizeEmail,
  noStore,
  payloadTooLarge,
  peekSessionEmail,
  queryOf,
  readBody,
  readCsrfToken,
  readSession,
  redirect,
  wantsJson,
} = require('./_lib');
const { persistenceBanner, shellPage } = require('./_shell');

const DM_KEY = 'lavaall-ops-founders-dm-v1';
const READ_KEY = 'lavaall-ops-founders-dm-v1:read';
const LEGACY_KEY = 'lavaall-ops-founders-dm-v1:legacy';
const FOUNDERS = Object.freeze([
  'osmanjalloh104@gmail.com',
  'abdulhbah55@gmail.com',
]);
const LABELS = Object.freeze({
  'osmanjalloh104@gmail.com': 'Osman',
  'abdulhbah55@gmail.com': 'Hameed',
});
const MAX_MESSAGES = 400;
const MAX_TEXT = 2000;
const POLL_MS = 4000;
const BADGE_MS = 8000;

let memoryMessages = [];
let memoryRead = {};
let localHydrated = false;

function foundersDmEnabled() {
  const flag = String(process.env.FOUNDERS_DM_ENABLED || '').trim().toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'on';
}

function isFounderDmIdentity(email) {
  const who = normalizeEmail(email);
  if (!FOUNDERS.includes(who) || !isAllowlisted(who)) return false;
  if (ALLOWLIST.length !== FOUNDERS.length) return false;
  return FOUNDERS.every((item) => ALLOWLIST.includes(item));
}

function kvConfigured() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function filePath() {
  if (kvConfigured()) return '';
  if (process.env.VERCEL) return '';
  const custom = process.env.OPS_STORE_FILE;
  return typeof custom === 'string' && custom.trim() ? `${custom.trim()}.founders-dm.json` : '';
}

function cleanText(value) {
  return typeof value === 'string' ? value.trim().replace(/[<>]/g, '').slice(0, MAX_TEXT) : '';
}

function newId() {
  return crypto.randomBytes(8).toString('hex');
}

function authorLabel(email, viewer) {
  if (normalizeEmail(email) === normalizeEmail(viewer)) return 'You';
  return LABELS[normalizeEmail(email)] || 'Founder';
}

function normalizeMessage(row) {
  if (!row || typeof row !== 'object') return null;
  const from = normalizeEmail(row.from);
  const text = cleanText(row.text);
  if (!FOUNDERS.includes(from) || !text) return null;
  const createdAt = Number(row.createdAt);
  if (!Number.isFinite(createdAt)) return null;
  const id = typeof row.id === 'string' && /^[a-f0-9]{8,32}$/.test(row.id) ? row.id : newId();
  return { id, from, text, createdAt };
}

function normalizeThread(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const messages = (Array.isArray(src.messages) ? src.messages : [])
    .map(normalizeMessage)
    .filter(Boolean)
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(-MAX_MESSAGES);
  const readAt = {};
  FOUNDERS.forEach((email) => {
    const stamp = src.readAt && Number(src.readAt[email]);
    if (Number.isFinite(stamp) && stamp > 0) readAt[email] = stamp;
  });
  return { messages, readAt };
}

function unreadCount(thread, email) {
  const who = normalizeEmail(email);
  const seen = thread.readAt && Number(thread.readAt[who]);
  const cursor = Number.isFinite(seen) ? seen : 0;
  return thread.messages.filter((row) => row.from !== who && row.createdAt > cursor).length;
}

function publicMessage(row, viewer) {
  return {
    id: row.id,
    mine: row.from === normalizeEmail(viewer),
    author: authorLabel(row.from, viewer),
    text: row.text,
    createdAt: row.createdAt,
  };
}

function publicPayload(thread, email, csrf) {
  const who = normalizeEmail(email);
  return {
    ok: true,
    messages: thread.messages.map((row) => publicMessage(row, who)),
    unread: unreadCount(thread, who),
    csrf: csrf || createCsrfToken(who),
  };
}

async function kvCommand(args) {
  const base = process.env.KV_REST_API_URL.replace(/\/$/, '');
  const pipelined = Array.isArray(args[0]);
  const response = await fetch(pipelined ? `${base}/pipeline` : base, {
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

function readCursorPath() {
  const target = filePath();
  if (!target) return '';
  return target.replace(/\.json$/, '.read.json');
}

function currentThread() {
  return {
    messages: memoryMessages.slice(-MAX_MESSAGES),
    readAt: Object.assign({}, memoryRead),
  };
}

function persistMessages() {
  const target = filePath();
  if (!target) return;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(memoryMessages.slice(-MAX_MESSAGES)));
}

function persistRead() {
  const target = readCursorPath();
  if (!target) return;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(memoryRead));
}

function rememberReadMap(readAt) {
  memoryRead = {};
  FOUNDERS.forEach((email) => {
    const stamp = readAt && Number(readAt[email]);
    if (Number.isFinite(stamp) && stamp > 0) memoryRead[email] = stamp;
  });
}

function rememberMessages(rows) {
  memoryMessages = (Array.isArray(rows) ? rows : [])
    .map(normalizeMessage)
    .filter(Boolean)
    .slice(-MAX_MESSAGES);
}

function hydrateLocal() {
  if (localHydrated || kvConfigured()) return;
  localHydrated = true;
  const target = filePath();
  if (!target || !fs.existsSync(target)) return;
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(target, 'utf8'));
  } catch {
    memoryMessages = [];
    memoryRead = {};
    return;
  }
  if (Array.isArray(raw)) {
    rememberMessages(raw);
    const cursorFile = readCursorPath();
    if (cursorFile && fs.existsSync(cursorFile)) {
      try {
        rememberReadMap(JSON.parse(fs.readFileSync(cursorFile, 'utf8')));
      } catch {
        memoryRead = {};
      }
    }
    return;
  }
  const legacy = normalizeThread(raw);
  rememberMessages(legacy.messages);
  rememberReadMap(legacy.readAt);
  persistMessages();
  persistRead();
}

function decodeHash(result) {
  const readAt = {};
  if (Array.isArray(result)) {
    for (let i = 0; i < result.length; i += 2) {
      const email = normalizeEmail(result[i]);
      const stamp = Number(result[i + 1]);
      if (FOUNDERS.includes(email) && Number.isFinite(stamp) && stamp > 0) readAt[email] = stamp;
    }
    return readAt;
  }
  if (result && typeof result === 'object') {
    Object.keys(result).forEach((key) => {
      const email = normalizeEmail(key);
      const stamp = Number(result[key]);
      if (FOUNDERS.includes(email) && Number.isFinite(stamp) && stamp > 0) readAt[email] = stamp;
    });
  }
  return readAt;
}

function messagesFromList(result) {
  const rows = Array.isArray(result) ? result : [];
  return rows.map((item) => {
    if (typeof item === 'string') {
      try {
        return normalizeMessage(JSON.parse(item));
      } catch {
        return null;
      }
    }
    return normalizeMessage(item);
  }).filter(Boolean).slice(-MAX_MESSAGES);
}

async function kvList() {
  const payload = await kvCommand(['LRANGE', DM_KEY, '0', '-1']);
  return messagesFromList(payload && payload.result);
}

async function kvReadMap() {
  const payload = await kvCommand(['HGETALL', READ_KEY]);
  return decodeHash(payload && payload.result);
}

async function migrateLegacyBlob() {
  const payload = await kvCommand(['GET', DM_KEY]);
  const raw = payload && payload.result;
  if (typeof raw !== 'string' || !raw.trim().startsWith('{')) return;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return;
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.messages)) return;
  const thread = normalizeThread(parsed);
  await kvCommand(['RENAME', DM_KEY, LEGACY_KEY]);
  if (thread.messages.length) {
    await kvCommand(['RPUSH', DM_KEY].concat(thread.messages.map((row) => JSON.stringify(row))));
    await kvCommand(['LTRIM', DM_KEY, '-400', '-1']);
  }
  const fields = [];
  FOUNDERS.forEach((email) => {
    if (thread.readAt[email]) fields.push(email, String(thread.readAt[email]));
  });
  if (fields.length) await kvCommand(['HSET', READ_KEY].concat(fields));
  await kvCommand(['DEL', LEGACY_KEY]);
}

async function readThread() {
  if (kvConfigured()) {
    let messages;
    try {
      messages = await kvList();
    } catch {
      await migrateLegacyBlob();
      messages = await kvList();
    }
    const readAt = await kvReadMap();
    return { messages, readAt };
  }
  hydrateLocal();
  return currentThread();
}

async function appendMessage(message) {
  if (kvConfigured()) {
    const pipe = [
      ['RPUSH', DM_KEY, JSON.stringify(message)],
      ['LTRIM', DM_KEY, '-400', '-1'],
    ];
    try {
      await kvCommand(pipe);
    } catch {
      await migrateLegacyBlob();
      await kvCommand(pipe);
    }
    await kvCommand(['HSET', READ_KEY, message.from, String(message.createdAt)]);
    return readThread();
  }
  hydrateLocal();
  memoryMessages.push(message);
  if (memoryMessages.length > MAX_MESSAGES) {
    memoryMessages = memoryMessages.slice(-MAX_MESSAGES);
  }
  memoryRead[message.from] = message.createdAt;
  persistMessages();
  persistRead();
  return currentThread();
}

async function mutate(work) {
  try {
    return await work();
  } catch {
    console.log(JSON.stringify({ type: 'OpsFoundersDm', event: 'store_unavailable' }));
    return { error: 'store_unavailable' };
  }
}

async function countUnread(email) {
  return mutate(async () => {
    const thread = await readThread();
    return { ok: true, unread: unreadCount(thread, email) };
  });
}

async function listMessages(email) {
  return mutate(async () => publicPayload(await readThread(), email));
}

async function markRead(email) {
  const who = normalizeEmail(email);
  if (!isFounderDmIdentity(who)) return { error: 'forbidden' };
  const now = Date.now();
  return mutate(async () => {
    if (kvConfigured()) {
      await kvCommand(['HSET', READ_KEY, who, String(now)]);
    } else {
      hydrateLocal();
      memoryRead[who] = now;
      persistRead();
    }
    const thread = await readThread();
    return { ok: true, unread: unreadCount(thread, who) };
  });
}

async function sendMessage(email, text) {
  if (!foundersDmEnabled()) return { error: 'not_found' };
  const who = normalizeEmail(email);
  if (!isFounderDmIdentity(who)) return { error: 'forbidden' };
  const body = cleanText(text);
  if (!body) return { error: 'invalid_message' };
  return mutate(async () => {
    const message = {
      id: newId(),
      from: who,
      text: body,
      createdAt: Date.now(),
    };
    const thread = await appendMessage(message);
    return publicPayload(thread, who);
  });
}

function resetFoundersDm() {
  memoryMessages = [];
  memoryRead = {};
  localHydrated = false;
}

function firstQuery(req, key) {
  const query = queryOf(req);
  const value = query[key];
  return Array.isArray(value) ? value[0] : value;
}

function foundersDmKind(req) {
  const area = String(firstQuery(req, 'area') || '').toLowerCase();
  const pathOnly = String(req.url || '').split('?')[0].replace(/\/+$/, '').toLowerCase();
  const scope = `${area} ${pathOnly}`;
  if (scope.includes('api/founders-dm')) return 'api';
  if (area === 'founders' || pathOnly === '/ops/founders' || pathOnly === '/founders') return 'page';
  return '';
}

function guard(req) {
  if (!foundersDmEnabled()) return { status: 404, error: 'not_found' };
  if (looksLikeAgentRequest(req)) return { status: 403, error: 'agent_denied' };
  const session = readSession(req);
  if (session && isFounderDmIdentity(session.email)) return { session };
  const claimed = peekSessionEmail(req) || normalizeEmail(header(req, 'x-ops-email') || '');
  if ((session && !isFounderDmIdentity(session.email)) || (claimed && !isFounderDmIdentity(claimed))) {
    return { status: 403, error: 'forbidden' };
  }
  return { status: 401, error: 'sign_in_required' };
}

function csrfFrom(req, body) {
  return (body && body.csrf)
    || header(req, 'x-csrf-token')
    || header(req, 'x-csrf');
}

function sendJson(res, status, body) {
  noStore(res, 'application/json; charset=utf-8');
  res.status(status).send(JSON.stringify(body));
}

function sendHtml(res, status, html) {
  noStore(res, 'text/html; charset=utf-8');
  res.status(status).send(html);
}

function notFoundPage() {
  return layout({
    title: 'LAVAALL OS',
    body: `
      <h1>Not found</h1>
      <p><a href="/ops">Back</a></p>
    `,
  });
}

function deniedPage() {
  return layout({
    title: 'LAVAALL OS — Access denied',
    body: `
      <div class="kicker"><span class="dot" aria-hidden="true"></span> Internal</div>
      <h1>Access denied</h1>
      <p>This area is founder-only.</p>
    `,
  });
}

function deny(req, res, access, kind) {
  const asJson = kind === 'api' || wantsJson(req);
  if (asJson) {
    sendJson(res, access.status, { error: access.error });
    return;
  }
  if (access.status === 401) {
    sendHtml(res, 401, loginPage({ error: 'Sign in required.' }));
    return;
  }
  if (access.status === 404) {
    sendHtml(res, 404, notFoundPage());
    return;
  }
  sendHtml(res, access.status, deniedPage());
}

function messageListHtml(messages) {
  if (!messages.length) return '';
  return messages.map((item) => (
    `<li class="bubble ${item.mine ? 'user' : 'assistant'}" data-id="${escapeHtml(item.id)}">
      <div class="kicker">${escapeHtml(item.author)}</div>
      <p>${escapeHtml(item.text)}</p>
    </li>`
  )).join('');
}

function pageHtml(session, payload, extra) {
  const messages = payload && Array.isArray(payload.messages) ? payload.messages : [];
  const csrf = (payload && payload.csrf) || createCsrfToken(session.email);
  const island = JSON.stringify({ csrf, pollMs: POLL_MS, badgeMs: BADGE_MS }).replace(/</g, '\\u003c');
  const emptyHidden = messages.length ? ' hidden' : '';
  const durable = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)
    || Boolean(filePath());
  return shellPage({
    title: 'LAVAALL OS — Private',
    email: session.email,
    area: 'founders',
    notice: extra && extra.notice,
    error: extra && extra.error,
    privateNav: { href: '/ops/founders', label: 'Private', unread: 0 },
    body: `
      ${persistenceBanner(durable)}
      <h1>Private</h1>
      <p class="lead">Messages between Osman and Hameed only. Text only. They stay in this thread and are not sent to the office or any assistant.</p>
      <section class="card" id="founders-dm">
        <div class="kicker">Thread</div>
        <h2>Osman and Hameed</h2>
        <p class="empty" id="dm-empty"${emptyHidden}>No messages yet. Write the first one below.</p>
        <ol class="thread dm-thread" id="dm-thread">${messageListHtml(messages)}</ol>
        <button type="button" id="dm-new" class="dm-new" hidden>New messages</button>
        <form id="dm-form" class="dm-compose" method="POST" action="/ops/api/founders-dm">
          <input type="hidden" name="csrf" value="${escapeHtml(csrf)}"/>
          <label for="dm-text">Message</label>
          <textarea id="dm-text" name="text" maxlength="${MAX_TEXT}" required placeholder="Write a message"></textarea>
          <p id="dm-mic-status" class="empty" hidden></p>
          <div class="dm-actions">
            <button type="button" class="btn btn-mic" id="dm-mic" aria-pressed="false">Mic</button>
            <button class="btn" type="submit">Send</button>
          </div>
          <p id="dm-status" role="status"></p>
        </form>
      </section>
      <script type="application/json" id="founders-dm-data">${island}</script>
    `,
  });
}

async function renderPage(req, res, session, extra) {
  const listed = await listMessages(session.email);
  if (listed.error) {
    const message = listed.error === 'store_unavailable'
      ? 'The store is unavailable. Check Vercel KV (KV_REST_API_URL + KV_REST_API_TOKEN).'
      : 'Could not open the thread.';
    sendHtml(res, listed.error === 'store_unavailable' ? 503 : 400, pageHtml(session, null, {
      error: (extra && extra.error) || message,
    }));
    return true;
  }
  sendHtml(res, 200, pageHtml(session, listed, extra));
  return true;
}

async function handleApi(req, res, session) {
  if (req.method === 'GET' || req.method === 'HEAD') {
    const scope = String(firstQuery(req, 'scope') || '');
    if (scope === 'unread') {
      const counted = await countUnread(session.email);
      if (counted.error) {
        sendJson(res, 503, { error: counted.error });
        return true;
      }
      sendJson(res, 200, { ok: true, unread: counted.unread });
      return true;
    }
    const listed = await listMessages(session.email);
    if (listed.error) {
      sendJson(res, listed.error === 'store_unavailable' ? 503 : 400, { error: listed.error });
      return true;
    }
    sendJson(res, 200, listed);
    return true;
  }
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'method_not_allowed' });
    return true;
  }
  if (payloadTooLarge(req)) {
    sendJson(res, 413, { error: 'payload_too_large' });
    return true;
  }
  const body = readBody(req);
  if (!readCsrfToken(csrfFrom(req, body), session.email)) {
    if (wantsJson(req)) sendJson(res, 403, { error: 'csrf' });
    else await renderPage(req, res, session, { error: 'Refresh was rejected. Reload Private and try again.' });
    return true;
  }
  if (String(body.action || '').toLowerCase() === 'read') {
    const marked = await markRead(session.email);
    if (marked.error) {
      const status = marked.error === 'store_unavailable' ? 503 : 400;
      if (wantsJson(req)) sendJson(res, status, { error: marked.error });
      else await renderPage(req, res, session, { error: 'Could not update the thread.' });
      return true;
    }
    if (wantsJson(req)) sendJson(res, 200, marked);
    else redirect(res, '/ops/founders');
    return true;
  }
  const sent = await sendMessage(session.email, body.text || body.message || '');
  if (sent.error) {
    const status = sent.error === 'store_unavailable' ? 503 : sent.error === 'forbidden' ? 403 : sent.error === 'not_found' ? 404 : 400;
    if (wantsJson(req)) sendJson(res, status, { error: sent.error });
    else {
      await renderPage(req, res, session, {
        error: sent.error === 'invalid_message' ? 'Enter a message.' : 'Could not send that message.',
      });
    }
    return true;
  }
  if (wantsJson(req)) {
    sendJson(res, 200, sent);
    return true;
  }
  redirect(res, '/ops/founders');
  return true;
}

async function handlePage(req, res, session) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    if (wantsJson(req)) sendJson(res, 405, { error: 'method_not_allowed' });
    else sendHtml(res, 405, notFoundPage());
    return true;
  }
  return renderPage(req, res, session);
}

async function foundersNavFor(req) {
  if (!foundersDmEnabled() || looksLikeAgentRequest(req)) return null;
  const session = readSession(req);
  if (!session || !isFounderDmIdentity(session.email)) return null;
  if (foundersDmKind(req) === 'page') {
    return { href: '/ops/founders', label: 'Private', unread: 0 };
  }
  const counted = await countUnread(session.email);
  return {
    href: '/ops/founders',
    label: 'Private',
    unread: counted && counted.ok ? counted.unread : 0,
  };
}

async function handleFoundersDm(req, res) {
  const kind = foundersDmKind(req);
  if (!kind) return false;
  const access = guard(req);
  if (!access.session) {
    deny(req, res, access, kind);
    return true;
  }
  switch (kind) {
    case 'api':
      return handleApi(req, res, access.session);
    case 'page':
      return handlePage(req, res, access.session);
    default: {
      const _never = kind;
      void _never;
      return false;
    }
  }
}

module.exports = {
  BADGE_MS,
  DM_KEY,
  READ_KEY,
  FOUNDERS,
  MAX_TEXT,
  POLL_MS,
  foundersDmEnabled,
  foundersDmKind,
  foundersNavFor,
  handleFoundersDm,
  isFounderDmIdentity,
  resetFoundersDm,
};
