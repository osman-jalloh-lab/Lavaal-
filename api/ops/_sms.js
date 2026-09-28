// Founders SMS line. Twilio toll-free, flag off until a founder turns it on.
// Outbound texts Osman, Hameed, or both. Inbound text is untrusted data.
// It never becomes a task, an assign, a send, a merge, or an approval.
// No SDK. No secrets in logs. Numbers in logs are masked to the last 2 digits.

const crypto = require('crypto');
const {
  escapeHtml,
  header,
  isAllowlisted,
  json,
  looksLikeAgentRequest,
  normalizeEmail,
  queryOf,
  readBody,
  readCsrfToken,
  timingSafeEqualString,
} = require('./_lib');
const { readLiveSession } = require('./_signin_hardening');
const { agentPendingItem, presentQueuedForAgent } = require('./_untrusted');

const FOUNDERS = Object.freeze([
  { key: 'osman', email: 'osmanjalloh104@gmail.com', label: 'Osman' },
  { key: 'hameed', email: 'abdulhbah55@gmail.com', label: 'Hameed' },
]);

const SMS_PREFIX = 'LAVAALL CEO: ';
const SMS_MORE = '…Open /ops for more';
const SMS_MAX = 320;
const INBOX_CAP = 200;
const QUEUE_CAP = 40;
const DAILY_CAP = 30;
const TEXT_CAP = 2000;

const memory = {
  inbox: [],
  optout: {},
  queue: [],
  rate: {},
};

let transport = null;

function foundersSmsEnabled() {
  const flag = String(process.env.FOUNDERS_SMS_ENABLED || '').trim().toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'on';
}

function autosendEnabled() {
  return String(process.env.FOUNDERS_SMS_AUTOSEND_ALERTS || '').trim().toLowerCase() === 'true';
}

function smsKeys() {
  const env = String(process.env.VERCEL_ENV || '').trim().toLowerCase();
  const prefix = env === 'preview' ? 'preview:' : '';
  return {
    inbox: `${prefix}sms:inbox`,
    optout: `${prefix}sms:optout`,
    queue: `${prefix}sms:queue`,
    rate: `${prefix}sms:rate`,
  };
}

function kvConfigured() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function newId() {
  return crypto.randomBytes(8).toString('hex');
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function resetSms() {
  memory.inbox = [];
  memory.optout = {};
  memory.queue = [];
  memory.rate = {};
  transport = null;
}

function setSmsTransport(fn) {
  transport = typeof fn === 'function' ? fn : null;
}

function getTransport() {
  return transport || global.fetch;
}

function envOn(name) {
  return String(process.env[name] || '').trim();
}

function normalizeE164(value) {
  const raw = String(value || '').trim().replace(/[\s()-]/g, '');
  if (!raw) return '';
  const withPlus = raw.startsWith('+') ? raw : `+${raw}`;
  return /^\+[1-9]\d{7,14}$/.test(withPlus) ? withPlus : '';
}

function maskNumber(value) {
  const digits = String(value || '').replace(/\D/g, '');
  const tail = digits.slice(-2);
  return tail ? `••${tail}` : '';
}

function numberMap() {
  const map = new Map();
  String(process.env.FOUNDERS_SMS_NUMBERS || '').split(',').forEach((part) => {
    const piece = part.trim();
    if (!piece) return;
    const idx = piece.lastIndexOf(':');
    if (idx < 1) return;
    const email = normalizeEmail(piece.slice(0, idx));
    const number = normalizeE164(piece.slice(idx + 1));
    if (!number || !isAllowlisted(email)) return;
    if (!FOUNDERS.some((row) => row.email === email)) return;
    map.set(email, number);
  });
  return map;
}

function founderByKey(key) {
  return FOUNDERS.find((row) => row.key === key) || null;
}

function founderByEmail(email) {
  const who = normalizeEmail(email);
  return FOUNDERS.find((row) => row.email === who) || null;
}

function founderByNumber(value) {
  const target = normalizeE164(value);
  if (!target) return null;
  const map = numberMap();
  return FOUNDERS.find((row) => map.get(row.email) === target) || null;
}

function resolveTargets(to) {
  const key = String(to || '').trim().toLowerCase();
  if (key === 'both') return FOUNDERS.slice();
  const founder = founderByKey(key);
  return founder ? [founder] : null;
}

function formatFounderSms(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const full = SMS_PREFIX + clean;
  if (full.length <= SMS_MAX) return full;
  const room = SMS_MAX - SMS_PREFIX.length - SMS_MORE.length;
  const cut = clean.slice(0, Math.max(0, room)).trimEnd();
  return (SMS_PREFIX + cut + SMS_MORE).slice(0, SMS_MAX);
}

function twilioCreds() {
  const sid = envOn('TWILIO_ACCOUNT_SID');
  const token = envOn('TWILIO_AUTH_TOKEN');
  const from = normalizeE164(process.env.TWILIO_FROM_NUMBER);
  if (!sid || !token || !from) return null;
  return { sid, token, from };
}

function logSms(event, fields) {
  const safe = { event };
  ['count', 'status', 'skipped', 'reason'].forEach((key) => {
    if (fields && fields[key] != null && fields[key] !== '') safe[key] = fields[key];
  });
  if (fields && typeof fields.mask === 'string' && /^••\d{2}(?:,••\d{2})*$/.test(fields.mask)) {
    safe.mask = fields.mask;
  }
  console.log(JSON.stringify({ sms: safe }));
}

function dayStamp(now) {
  return new Date(now || Date.now()).toISOString().slice(0, 10);
}

function rateCount(rate, email, now) {
  const row = rate && rate[email];
  if (!row || row.day !== dayStamp(now)) return 0;
  return Number.isFinite(row.count) ? row.count : 0;
}

function bumpRate(rate, email, now) {
  const day = dayStamp(now);
  const row = rate[email];
  const count = row && row.day === day ? (Number(row.count) || 0) : 0;
  rate[email] = { day, count: count + 1 };
}

async function kvCommand(args) {
  const base = process.env.KV_REST_API_URL.replace(/\/$/, '');
  const response = await getTransport()(base, {
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

function parseJson(raw, fallback) {
  if (raw == null || raw === '') return fallback;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function readPiece(name, fallback) {
  if (!kvConfigured()) return clone(memory[name] == null ? fallback : memory[name]);
  const payload = await kvCommand(['GET', smsKeys()[name]]);
  const parsed = parseJson(payload && payload.result, fallback);
  if (Array.isArray(fallback)) return Array.isArray(parsed) ? parsed : fallback;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fallback;
  return parsed;
}

async function writePiece(name, value) {
  const copy = clone(value);
  if (!kvConfigured()) {
    memory[name] = copy;
    return;
  }
  await kvCommand(['SET', smsKeys()[name], JSON.stringify(copy)]);
}

function keywordOf(text) {
  const word = String(text || '').trim().toUpperCase();
  if (word === 'STOP') return 'stop';
  if (word === 'START' || word === 'UNSTOP') return 'start';
  if (word === 'HELP') return 'help';
  return '';
}

function requestUrl(req) {
  const proto = String(header(req, 'x-forwarded-proto') || 'https').split(',')[0].trim();
  const host = String(header(req, 'x-forwarded-host') || header(req, 'host') || '').split(',')[0].trim();
  const raw = String((req && req.url) || '/api/sms/inbound');
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${proto}://${host}${raw.startsWith('/') ? raw : `/${raw}`}`;
}

function paramsOf(req) {
  const body = readBody(req);
  const params = {};
  Object.keys(body).forEach((key) => {
    const value = body[key];
    if (Array.isArray(value)) params[key] = value.length ? String(value[0]) : '';
    else if (value != null && typeof value !== 'object') params[key] = String(value);
  });
  return params;
}

function computeTwilioSignature(url, params, token) {
  const keys = Object.keys(params || {}).sort();
  let data = String(url || '');
  keys.forEach((key) => {
    data += key + params[key];
  });
  return crypto.createHmac('sha1', String(token || '')).update(data, 'utf8').digest('base64');
}

function verifyTwilioRequest(req) {
  const token = envOn('TWILIO_AUTH_TOKEN');
  if (!token) return false;
  const given = String(header(req, 'x-twilio-signature') || '');
  if (!given) return false;
  const expected = computeTwilioSignature(requestUrl(req), paramsOf(req), token);
  return timingSafeEqualString(given, expected);
}

function sendTwiml(res) {
  res.status(200);
  res.setHeader('Content-Type', 'text/xml; charset=utf-8');
  res.send('<Response/>');
}

function wrapInbound(row) {
  return presentQueuedForAgent({
    source: 'sms',
    sender: row.email,
    founderEmail: row.email,
    founderAuthenticated: false,
    text: row.text,
  });
}

async function postTwilio(creds, to, body) {
  const params = new URLSearchParams();
  params.set('To', to);
  params.set('From', creds.from);
  params.set('Body', body);
  const auth = Buffer.from(`${creds.sid}:${creds.token}`).toString('base64');
  try {
    const response = await getTransport()(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(creds.sid)}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      },
    );
    const status = response && Number.isFinite(response.status) ? response.status : 0;
    return { ok: status >= 200 && status < 300, status };
  } catch {
    return { ok: false, status: 0 };
  }
}

async function sendFounderSms({ to, text }) {
  if (!foundersSmsEnabled()) return { error: 'not_found' };
  const targets = resolveTargets(to);
  if (!targets) {
    logSms('send', { count: 0, status: 0, reason: 'not_allowlisted' });
    return { error: 'not_allowlisted' };
  }
  const creds = twilioCreds();
  if (!creds) return { error: 'sms_unconfigured' };
  const body = formatFounderSms(text);
  if (!body) return { error: 'invalid_message' };
  const map = numberMap();
  if (targets.some((founder) => !map.get(founder.email))) {
    logSms('send', { count: 0, status: 0, reason: 'not_allowlisted' });
    return { error: 'not_allowlisted' };
  }
  let optout;
  let rate;
  try {
    optout = await readPiece('optout', {});
    rate = await readPiece('rate', {});
  } catch {
    return { error: 'store_unavailable' };
  }
  let sent = 0;
  let skipped = 0;
  let status = 0;
  let reason = '';
  const masks = [];
  const now = Date.now();
  for (const founder of targets) {
    const number = map.get(founder.email);
    if (optout[founder.email] && optout[founder.email].stopped) {
      skipped += 1;
      reason = reason || 'opted_out';
      continue;
    }
    if (rateCount(rate, founder.email, now) >= DAILY_CAP) {
      skipped += 1;
      reason = reason || 'rate_limited';
      continue;
    }
    const result = await postTwilio(creds, number, body);
    status = result.status;
    if (result.ok) {
      sent += 1;
      bumpRate(rate, founder.email, now);
      masks.push(maskNumber(number));
    } else {
      skipped += 1;
      reason = reason || 'provider';
    }
  }
  try {
    await writePiece('rate', rate);
  } catch {
    return { error: 'store_unavailable' };
  }
  logSms('send', {
    count: sent,
    skipped,
    status,
    reason,
    mask: masks.length ? masks.join(',') : '',
  });
  return { ok: true, sent, skipped, reason, status };
}

async function queueOrSend({ to, text }) {
  if (!foundersSmsEnabled()) return { error: 'not_found' };
  if (!resolveTargets(to)) return { error: 'not_allowlisted' };
  if (!formatFounderSms(text)) return { error: 'invalid_message' };
  if (autosendEnabled()) return sendFounderSms({ to, text });
  const item = {
    id: newId(),
    to: String(to).trim().toLowerCase(),
    text: String(text).replace(/\s+/g, ' ').trim().slice(0, TEXT_CAP),
    status: 'needs_founder_confirm',
    at: new Date().toISOString(),
  };
  try {
    const queue = await readPiece('queue', []);
    queue.push(item);
    await writePiece('queue', queue.slice(-QUEUE_CAP));
  } catch {
    return { error: 'store_unavailable' };
  }
  logSms('queue', { count: 1, status: 202, reason: 'needs_founder_confirm' });
  return { ok: true, queued: true, id: item.id };
}

async function confirmQueued({ id }) {
  if (!foundersSmsEnabled()) return { error: 'not_found' };
  const cleanId = String(id || '').trim();
  if (!cleanId) return { error: 'queue_not_found' };
  let queue;
  try {
    queue = await readPiece('queue', []);
  } catch {
    return { error: 'store_unavailable' };
  }
  const item = queue.find((row) => row && row.id === cleanId);
  if (!item) return { error: 'queue_not_found' };
  if (item.status === 'sent' || item.status === 'skipped') {
    return { ok: true, replay: true, sent: 0, skipped: 0 };
  }
  const result = await sendFounderSms({ to: item.to, text: item.text });
  if (result.error) return result;
  item.status = result.sent > 0 ? 'sent' : 'skipped';
  try {
    await writePiece('queue', queue);
  } catch {
    return { error: 'store_unavailable' };
  }
  return Object.assign({ ok: true, replay: false }, result);
}

async function sendTestText({ email, confirmMask }) {
  if (!foundersSmsEnabled()) return { error: 'not_found' };
  const founder = founderByEmail(email);
  if (!founder) return { error: 'forbidden' };
  const number = numberMap().get(founder.email);
  if (!number) return { error: 'not_allowlisted' };
  const mask = maskNumber(number);
  if (!timingSafeEqualString(String(confirmMask || ''), mask)) return { error: 'confirm_mismatch' };
  return sendFounderSms({ to: founder.key, text: 'Test text from LAVAALL OS.' });
}

function csrfOk(req, body, email) {
  const token = (body && body.csrf) || header(req, 'x-csrf-token') || header(req, 'x-csrf');
  return Boolean(readCsrfToken(token, email));
}

function bridgeAuthorized(req) {
  const secret = envOn('OPS_CEO_BRIDGE_SECRET');
  if (secret.length < 16) return false;
  const raw = String(header(req, 'authorization') || '');
  const match = raw.match(/^\s*Bearer\s+(\S+)\s*$/i);
  if (!match) return false;
  return timingSafeEqualString(match[1], secret);
}

function smsHttpStatus(error) {
  if (error === 'not_found') return 404;
  if (error === 'forbidden' || error === 'csrf') return 403;
  if (error === 'sms_unconfigured' || error === 'store_unavailable') return 503;
  return 400;
}

function outcomeBody(outcome) {
  if (!outcome || outcome.error) return { error: (outcome && outcome.error) || 'invalid_message' };
  const body = { ok: true };
  ['queued', 'id', 'sent', 'skipped', 'reason', 'status', 'replay'].forEach((key) => {
    if (outcome[key] != null && outcome[key] !== '') body[key] = outcome[key];
  });
  return body;
}

function isSmsApi(req) {
  const query = queryOf(req);
  const areaValue = query.area;
  const area = String(Array.isArray(areaValue) ? areaValue[0] : areaValue || '').toLowerCase();
  const pathOnly = String((req && req.url) || '').split('?')[0].toLowerCase();
  return area === 'api/sms/send'
    || pathOnly.endsWith('/api/sms/send')
    || pathOnly.endsWith('/ops/api/sms/send');
}

async function runSmsFounderAction({ action, body, email, req }) {
  if (!foundersSmsEnabled()) return { error: 'not_found' };
  if (!isAllowlisted(email) || !founderByEmail(email)) return { error: 'forbidden' };
  if (looksLikeAgentRequest(req)) return { error: 'forbidden' };
  if (!csrfOk(req, body, email)) return { error: 'csrf' };
  if (action === 'sms-test') {
    return sendTestText({ email, confirmMask: body.confirmMask || body.confirm || '' });
  }
  if (action === 'sms-confirm') return confirmQueued({ id: body.id || '' });
  if (action === 'sms-send') return queueOrSend({ to: body.to, text: body.text || body.message || '' });
  return { error: 'invalid_message' };
}

async function handleSmsRoute(req, res) {
  if (!isSmsApi(req)) return false;
  if (!foundersSmsEnabled()) {
    json(res, 404, { error: 'not_found' });
    return true;
  }
  if (req.method !== 'POST') {
    json(res, 405, { error: 'method_not_allowed' });
    return true;
  }
  const body = readBody(req);
  let outcome;
  if (bridgeAuthorized(req)) {
    outcome = await queueOrSend({ to: body.to, text: body.text || body.message || '' });
  } else if (looksLikeAgentRequest(req)) {
    outcome = { error: 'forbidden' };
  } else {
    const session = await readLiveSession(req);
    if (!session) outcome = { error: 'forbidden' };
    else {
      outcome = await runSmsFounderAction({
        action: 'sms-send',
        body,
        email: session.email,
        req,
      });
    }
  }
  const status = outcome && outcome.error ? smsHttpStatus(outcome.error) : 200;
  json(res, status, outcomeBody(outcome));
  return true;
}

async function handleSmsAction(req, res, session, action, body, hooks) {
  const outcome = await runSmsFounderAction({
    action,
    body,
    email: session && session.email,
    req,
  });
  const reply = hooks || {};
  if (outcome.error) {
    if (reply.json) return reply.json(outcome.error === 'not_found' ? 404 : smsHttpStatus(outcome.error), outcomeBody(outcome));
    return outcome;
  }
  if (reply.json) return reply.json(200, outcomeBody(outcome));
  return outcome;
}

async function rememberInbound(founder, text) {
  const inbox = await readPiece('inbox', []);
  inbox.push({
    id: newId(),
    at: new Date().toISOString(),
    label: founder.label,
    email: founder.email,
    text: String(text || '').slice(0, TEXT_CAP),
  });
  await writePiece('inbox', inbox.slice(-INBOX_CAP));
}

async function setStopped(email, stopped) {
  const optout = await readPiece('optout', {});
  if (stopped) optout[email] = { stopped: true, at: new Date().toISOString() };
  else delete optout[email];
  await writePiece('optout', optout);
}

async function handleSmsInbound(req, res) {
  if (!foundersSmsEnabled()) {
    json(res, 404, { error: 'not_found' });
    return;
  }
  if (req.method !== 'POST') {
    json(res, 405, { error: 'method_not_allowed' });
    return;
  }
  if (!verifyTwilioRequest(req)) {
    logSms('inbound', { count: 1, status: 403, reason: 'signature' });
    json(res, 403, { error: 'forbidden' });
    return;
  }
  const params = paramsOf(req);
  const founder = founderByNumber(params.From || '');
  if (!founder) {
    logSms('inbound', { count: 1, status: 200, reason: 'rejected' });
    sendTwiml(res);
    return;
  }
  const text = params.Body || '';
  const keyword = keywordOf(text);
  try {
    if (keyword === 'stop') await setStopped(founder.email, true);
    else if (keyword === 'start') await setStopped(founder.email, false);
    else if (keyword !== 'help') await rememberInbound(founder, text);
  } catch {
    json(res, 503, { error: 'store_unavailable' });
    return;
  }
  logSms('inbound', {
    count: 1,
    status: 200,
    reason: keyword || 'stored',
    mask: maskNumber(numberMap().get(founder.email)),
  });
  sendTwiml(res);
}

async function listSmsInbox() {
  if (!foundersSmsEnabled()) return [];
  try {
    return await readPiece('inbox', []);
  } catch {
    return [];
  }
}

async function smsContextForCeo() {
  if (!foundersSmsEnabled()) return '';
  let inbox;
  try {
    inbox = await readPiece('inbox', []);
  } catch {
    return '';
  }
  const recent = inbox.slice(-8);
  if (!recent.length) return '';
  return recent.map((row) => {
    const view = wrapInbound(row);
    return `SMS from ${row.label}\n${view.text}`;
  }).join('\n\n');
}

async function smsPendingForBridge() {
  if (!foundersSmsEnabled()) return [];
  let inbox;
  try {
    inbox = await readPiece('inbox', []);
  } catch {
    return [];
  }
  return inbox.slice(-20).map((row) => agentPendingItem({
    threadId: `sms${row.id}`.slice(0, 40),
    founderEmail: row.email,
    messageId: row.id,
    correlationId: row.id,
    text: `SMS from ${row.label}\n${row.text}`,
    at: Date.parse(row.at) || Date.now(),
    source: 'sms',
    sender: row.email,
    founderAuthenticated: false,
    wakeReason: 'sms',
  }));
}

function renderFeed(rows) {
  if (!rows.length) return '<p class="empty">No texts yet.</p>';
  return `<ul class="list">${rows.slice(-20).reverse().map((row) => {
    const when = escapeHtml(row.at || '');
    return `<li><span class="tag">SMS from ${escapeHtml(row.label || '')}</span> <span class="tag">Untrusted</span><p>${escapeHtml(row.text || '')}</p><p>${when}</p></li>`;
  }).join('')}</ul>`;
}

function renderQueue(rows, csrf) {
  const open = rows.filter((row) => row && row.status === 'needs_founder_confirm');
  if (!open.length) return '';
  return open.map((row) => {
    const founder = founderByKey(row.to);
    const who = row.to === 'both' ? 'Osman and Hameed' : (founder ? founder.label : 'founder');
    const preview = formatFounderSms(row.text);
    return `<form method="POST" action="/ops/profile">
      <input type="hidden" name="action" value="sms-confirm"/>
      <input type="hidden" name="csrf" value="${escapeHtml(csrf || '')}"/>
      <input type="hidden" name="id" value="${escapeHtml(row.id)}"/>
      <input type="hidden" name="returnTo" value="/ops/profile"/>
      <p>To ${escapeHtml(who)}. Confirm before this text goes out.</p>
      <p>${escapeHtml(preview)}</p>
      <button class="btn btn-sm" type="submit">Confirm send</button>
    </form>`;
  }).join('');
}

async function smsPanels(email, csrf) {
  if (!foundersSmsEnabled()) return { settings: '', feed: '' };
  let inbox = [];
  let queue = [];
  try {
    inbox = await readPiece('inbox', []);
    queue = await readPiece('queue', []);
  } catch {
    inbox = [];
    queue = [];
  }
  const feed = `<section class="card" id="sms-feed"><div class="kicker">SMS</div><h2>SMS from Osman/Hameed</h2><p>Texts are information only. They do not run commands.</p>${renderFeed(inbox)}</section>`;
  const founder = founderByEmail(email);
  const number = founder ? numberMap().get(founder.email) : '';
  const mask = number ? maskNumber(number) : '';
  const testForm = mask
    ? `<form method="POST" action="/ops/profile">
        <input type="hidden" name="action" value="sms-test"/>
        <input type="hidden" name="csrf" value="${escapeHtml(csrf || '')}"/>
        <input type="hidden" name="returnTo" value="/ops/profile"/>
        <p>Number on file: ${escapeHtml(mask)}. Type that masked number to confirm a test text to yourself.</p>
        <label for="sms-confirm">Masked number</label>
        <input id="sms-confirm" name="confirmMask" maxlength="8" autocomplete="off"/>
        <button class="btn" type="submit">Test text</button>
      </form>`
    : '<p class="empty">No number on file for this founder.</p>';
  const settings = `<section class="card" id="sms-settings"><div class="kicker">Settings</div><h2>Text messages</h2>${testForm}${renderQueue(queue, csrf)}</section>${feed}`;
  return { settings, feed };
}

module.exports = {
  DAILY_CAP,
  FOUNDERS,
  INBOX_CAP,
  SMS_MAX,
  SMS_MORE,
  SMS_PREFIX,
  computeTwilioSignature,
  confirmQueued,
  formatFounderSms,
  foundersSmsEnabled,
  handleSmsAction,
  handleSmsInbound,
  handleSmsRoute,
  maskNumber,
  queueOrSend,
  resetSms,
  listSmsInbox,
  sendFounderSms,
  sendTestText,
  setSmsTransport,
  smsContextForCeo,
  smsHttpStatus,
  smsKeys,
  smsPanels,
  smsPendingForBridge,
  verifyTwilioRequest,
};
