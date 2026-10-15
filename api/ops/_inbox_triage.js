// Ranked support@ inbox feed for /ops/inbox (option B: the box pushes, the site shows).
// The box reads support@ through its own Gmail connector, runs
// ops-rules/inbox-triage.py (deterministic phishing checks + urgency + Jev second
// opinion) and POSTs the ranked list here with Authorization: Bearer
// $OPS_INBOX_FEED_SECRET. No Gmail token lives on Vercel for this path.
// Flag OPS_INBOX_TRIAGE_ENABLED is off by default (404 everywhere, page unchanged).
// Every text field is untrusted mail data: length-capped here, escaped on render.
// Underscore prefix: not a Vercel function. No npm. Never log feed text or the bearer.

const fs = require('fs');
const path = require('path');
const {
  escapeHtml,
  header,
  isAllowlisted,
  looksLikeAgentRequest,
  noStore,
  timingSafeEqualString,
} = require('./_lib');
const { readLiveSession } = require('./_signin_hardening');

const FEED_KEY = 'lavaall-ops-inbox-triage-v1';
const ENDPOINT = '/ops/api/inbox-triage';
const MAILBOX = 'support@lavaall.com';
const MAX_FEED_BYTES = 64 * 1024;
const MAX_ITEMS = 50;
const MAX_NOTES = 3;
const STALE_MS = 6 * 60 * 60 * 1000;
const SKEW_MS = 10 * 60 * 1000;
const MIN_SECRET = 24;
const CHICAGO = 'America/Chicago';
const FLAGS = Object.freeze(['Real', 'Suspicious', 'Phishing']);
const URGENCIES = Object.freeze(['Urgent', 'Soon', 'Low']);
const CATEGORIES = Object.freeze(['customer', 'security', 'billing', 'request', 'phishing', 'promo', 'fyi']);
const JEV_STATUSES = Object.freeze(['RUN', 'NOT_RUN']);
const TOP_KEYS = Object.freeze(['generatedAt', 'mailbox', 'items']);
const ITEM_KEYS = Object.freeze([
  'id', 'threadId', 'receivedAt', 'from', 'subject', 'unread', 'flag', 'urgency',
  'category', 'reason', 'notes', 'checks', 'via', 'jev',
]);
const JEV_KEYS = Object.freeze(['status', 'legit', 'urgency']);
const ID_RE = /^[a-f0-9]{8,32}$/;
const LIMITS = Object.freeze({ from: 240, subject: 240, reason: 240, note: 240, checks: 480, via: 120 });
const URGENCY_WEIGHT = Object.freeze({ Urgent: 300, Soon: 200, Low: 100 });
const FLAG_WEIGHT = Object.freeze({ Phishing: 50, Suspicious: 25, Real: 0 });

let memory = null;

function inboxTriageEnabled() {
  const flag = String(process.env.OPS_INBOX_TRIAGE_ENABLED || '').trim().toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'on';
}

function inboxTriageKey() {
  const env = String(process.env.VERCEL_ENV || '').trim().toLowerCase();
  const prefix = !env || env === 'production' ? '' : env.replace(/[^a-z0-9_-]/g, '').slice(0, 32);
  return prefix ? `${prefix}:${FEED_KEY}` : FEED_KEY;
}

function kvConfigured() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function filePath() {
  if (kvConfigured() || process.env.VERCEL) return '';
  const custom = process.env.OPS_STORE_FILE;
  return typeof custom === 'string' && custom.trim() ? `${custom.trim()}.inbox-triage.json` : '';
}

function sendJson(res, status, body) {
  noStore(res, 'application/json; charset=utf-8');
  res.status(status).send(JSON.stringify(body));
}

function getFeedSecret() {
  const secret = process.env.OPS_INBOX_FEED_SECRET;
  return typeof secret === 'string' && secret.length >= MIN_SECRET ? secret : '';
}

function readBearer(req) {
  const raw = String(header(req, 'authorization') || '');
  const match = raw.match(/^\s*Bearer\s+(\S+)\s*$/i);
  return match ? match[1] : '';
}

function verifyFeedSecret(req) {
  const expected = getFeedSecret();
  if (!expected) return false;
  const got = readBearer(req);
  return Boolean(got) && timingSafeEqualString(got, expected);
}

async function founderSession(req) {
  if (looksLikeAgentRequest(req)) return { status: 403, error: 'agent_denied' };
  const session = await readLiveSession(req);
  if (session && isAllowlisted(session.email)) return { session };
  return { status: 403, error: 'forbidden' };
}

function inboxTriageKind(req) {
  const query = req && req.query ? req.query : {};
  const rawArea = Array.isArray(query.area) ? query.area[0] : query.area;
  const area = String(rawArea || '').toLowerCase().replace(/\/+$/, '');
  const pathOnly = String((req && req.url) || '').split('?')[0].toLowerCase().replace(/\/+$/, '');
  if (area === 'api/inbox-triage' || /(?:^|\/)ops\/api\/inbox-triage$/.test(pathOnly)) return 'feed';
  return '';
}

function exactKeys(obj, keys) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  const got = Object.keys(obj);
  return got.length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(obj, key));
}

function parseUtc(value) {
  if (typeof value !== 'string') return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const frac = value.match(/\.(\d+)Z$/);
  const normalized = `${value.slice(0, 19)}.${frac ? frac[1].padEnd(3, '0') : '000'}Z`;
  return date.toISOString() === normalized ? date : null;
}

function cleanText(value, max, allowEmpty) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!allowEmpty && !text) return null;
  if (text.length > max) return null;
  if (/[\u0000-\u001F\u007F]/.test(text)) return null;
  return text;
}

function cleanProb(value) {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) return undefined;
  return Math.round(value * 1000) / 1000;
}

function normalizeJev(raw) {
  if (!exactKeys(raw, JEV_KEYS)) return null;
  if (!JEV_STATUSES.includes(raw.status)) return null;
  const legit = cleanProb(raw.legit);
  const urgency = cleanProb(raw.urgency);
  if (legit === undefined || urgency === undefined) return null;
  if (raw.status === 'NOT_RUN' && (legit !== null || urgency !== null)) return null;
  return { status: raw.status, legit, urgency };
}

function normalizeItem(row) {
  if (!exactKeys(row, ITEM_KEYS)) return null;
  if (typeof row.id !== 'string' || !ID_RE.test(row.id)) return null;
  if (typeof row.threadId !== 'string' || !ID_RE.test(row.threadId)) return null;
  if (!parseUtc(row.receivedAt)) return null;
  if (typeof row.unread !== 'boolean') return null;
  if (!FLAGS.includes(row.flag) || !URGENCIES.includes(row.urgency) || !CATEGORIES.includes(row.category)) return null;
  const from = cleanText(row.from, LIMITS.from, false);
  const subject = cleanText(row.subject, LIMITS.subject, true);
  const reason = cleanText(row.reason, LIMITS.reason, false);
  const checks = cleanText(row.checks, LIMITS.checks, true);
  const via = cleanText(row.via, LIMITS.via, true);
  if (from === null || subject === null || reason === null || checks === null || via === null) return null;
  if (!Array.isArray(row.notes) || row.notes.length > MAX_NOTES) return null;
  const notes = [];
  for (const note of row.notes) {
    const clean = cleanText(note, LIMITS.note, false);
    if (clean === null) return null;
    notes.push(clean);
  }
  const jev = normalizeJev(row.jev);
  if (!jev) return null;
  return {
    id: row.id,
    threadId: row.threadId,
    receivedAt: row.receivedAt,
    from,
    subject: subject || '(no subject)',
    unread: row.unread,
    flag: row.flag,
    urgency: row.urgency,
    category: row.category,
    reason,
    notes,
    checks,
    via,
    jev,
  };
}

function normalizeItems(list) {
  if (!Array.isArray(list) || list.length > MAX_ITEMS) return null;
  const items = [];
  const seen = new Set();
  for (const raw of list) {
    const clean = normalizeItem(raw);
    if (!clean || seen.has(clean.id)) return null;
    seen.add(clean.id);
    items.push(clean);
  }
  return items;
}

function validateFeed(body, now) {
  const clock = Number.isFinite(now) ? now : Date.now();
  if (!exactKeys(body, TOP_KEYS)) return { error: 'invalid_shape' };
  const generated = parseUtc(body.generatedAt);
  if (!generated || generated.getTime() > clock + SKEW_MS) return { error: 'invalid_shape' };
  if (body.mailbox !== MAILBOX) return { error: 'invalid_shape' };
  const items = normalizeItems(body.items);
  if (!items) return { error: 'invalid_shape' };
  return { ok: true, feed: { generatedAt: body.generatedAt, mailbox: MAILBOX, items } };
}

function normalizeStored(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (!parseUtc(raw.generatedAt) || !Number.isFinite(raw.receivedAt) || raw.mailbox !== MAILBOX) return null;
  const items = normalizeItems(raw.items);
  if (!items) return null;
  return { generatedAt: raw.generatedAt, receivedAt: raw.receivedAt, mailbox: MAILBOX, items };
}

function rankScore(item) {
  return URGENCY_WEIGHT[item.urgency] + FLAG_WEIGHT[item.flag] + (item.unread ? 5 : 0);
}

// Urgency, then flag, then unread. Ties keep the box's order (it also weighs category:
// customer > security > billing > promo), so the site never reshuffles the box's judgement.
function rankItems(items) {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => (rankScore(b.item) - rankScore(a.item)) || (a.index - b.index))
    .map((entry) => entry.item);
}

function formatChicago(iso) {
  const date = parseUtc(iso);
  if (!date) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CHICAGO, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  }).formatToParts(date);
  const pick = (type) => {
    const part = parts.find((item) => item.type === type);
    return part ? part.value : '';
  };
  return `${pick('weekday')} ${pick('month')} ${pick('day')}, ${pick('hour')}:${pick('minute')} ${pick('dayPeriod').toUpperCase()} CT`;
}

function feedIsStale(generatedAt, now) {
  const generated = parseUtc(generatedAt);
  if (!generated) return false;
  const clock = Number.isFinite(now) ? now : Date.now();
  return clock - generated.getTime() > STALE_MS;
}

function toView(record, now) {
  const clean = record ? normalizeStored(record) : null;
  if (!clean) return { ok: true, empty: true, stale: false, items: [] };
  const items = rankItems(clean.items);
  const count = (key, value) => items.filter((item) => item[key] === value).length;
  return {
    ok: true,
    empty: false,
    stale: feedIsStale(clean.generatedAt, now),
    generatedAt: clean.generatedAt,
    updatedLabel: formatChicago(clean.generatedAt),
    mailbox: clean.mailbox,
    counts: {
      Urgent: count('urgency', 'Urgent'),
      Soon: count('urgency', 'Soon'),
      Low: count('urgency', 'Low'),
      flagged: count('flag', 'Phishing') + count('flag', 'Suspicious'),
    },
    items: items.map((item) => Object.assign({}, item, { receivedLabel: formatChicago(item.receivedAt) })),
  };
}

function senderParts(from) {
  const match = String(from).match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return match ? { name: match[1] || match[2], addr: match[2] } : { name: from, addr: '' };
}

function gmailThreadUrl(threadId) {
  if (!ID_RE.test(String(threadId || ''))) return '';
  return `https://mail.google.com/mail/?authuser=${encodeURIComponent(MAILBOX)}#all/${threadId}`;
}

function urgencyPillClass(value) {
  switch (value) {
    case 'Urgent': return 'tri-pill tri-p-urgent';
    case 'Soon': return 'tri-pill tri-p-soon';
    case 'Low': return 'tri-pill tri-p-low';
    default: { const _never = value; void _never; return 'tri-pill tri-p-low'; }
  }
}

function flagPill(value) {
  switch (value) {
    case 'Real': return '<span class="tri-pill tri-p-real">✓ Real sender</span>';
    case 'Suspicious': return '<span class="tri-pill tri-p-suspicious">Suspicious</span>';
    case 'Phishing': return '<span class="tri-pill tri-p-phishing">Phishing — don’t click</span>';
    default: { const _never = value; void _never; return ''; }
  }
}

function jevLabel(jev) {
  if (!jev || jev.status !== 'RUN') return 'Jev: not run';
  const parts = [];
  if (jev.legit !== null) parts.push(`legit ${jev.legit.toFixed(2)}`);
  if (jev.urgency !== null) parts.push(`urgency ${jev.urgency.toFixed(2)}`);
  return `Jev: ${parts.join(' · ') || 'no answer'}`;
}

function renderRow(item, index) {
  const who = senderParts(item.from);
  const url = gmailThreadUrl(item.threadId);
  const rowClass = item.urgency === 'Urgent' ? 'tri-row tri-u-urgent' : item.urgency === 'Soon' ? 'tri-row tri-u-soon' : 'tri-row tri-u-low';
  return `<li class="${rowClass}" data-id="${escapeHtml(item.id)}">
    <div class="tri-n">${index + 1}</div>
    <div>
      <div><span class="${urgencyPillClass(item.urgency)}">${escapeHtml(item.urgency)}</span>${flagPill(item.flag)}${item.unread ? '<span class="tri-pill tri-p-unread">Unread</span>' : ''}</div>
      <div class="tri-subj">${escapeHtml(item.subject)}</div>
      <div class="tri-meta">${escapeHtml(who.name)}${who.addr ? ` &lt;${escapeHtml(who.addr)}&gt;` : ''} · <time datetime="${escapeHtml(item.receivedAt)}">${escapeHtml(item.receivedLabel || '')}</time>${item.via ? ` · came in via ${escapeHtml(item.via)}` : ''}</div>
      <div class="tri-why">${escapeHtml(item.reason)}</div>
      ${item.notes.length ? `<div class="tri-note">⚠ ${escapeHtml(item.notes.join('; '))}</div>` : ''}
      ${item.checks ? `<div class="tri-sig">Checks: ${escapeHtml(item.checks)}</div>` : ''}
    </div>
    <div class="tri-side">
      <span class="tri-pill tri-p-jev">${escapeHtml(jevLabel(item.jev))}</span>
      ${url ? `<br/><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Open in Gmail</a>` : ''}
    </div>
  </li>`;
}

function renderInboxTriage(view) {
  if (!view || view.empty || view.error) return '';
  const top = view.items.filter((item) => item.urgency !== 'Low');
  const low = view.items.filter((item) => item.urgency === 'Low');
  return `<section class="tri-feed" id="inbox-triage" data-endpoint="${ENDPOINT}" aria-label="Ranked support mail">
  <p class="tri-updated">Ranked by the CEO desk · updated ${escapeHtml(view.updatedLabel || '')}${view.stale ? ' · <span class="tri-stale">stale</span>' : ''}</p>
  <div class="tri-stats">
    <div class="tri-stat tri-s-urgent"><b>${view.counts.Urgent}</b><span>Urgent</span></div>
    <div class="tri-stat tri-s-soon"><b>${view.counts.Soon}</b><span>Soon</span></div>
    <div class="tri-stat"><b>${view.counts.Low}</b><span>Low</span></div>
    <div class="tri-stat ${view.counts.flagged ? 'tri-s-bad' : 'tri-s-safe'}"><b>${view.counts.flagged}</b><span>Phishing / suspicious</span></div>
  </div>
  <section class="card">
    <div class="kicker">Needs you</div>
    <h2>Most important first</h2>
    ${top.length ? `<ul class="tri-list">${top.map((item, i) => renderRow(item, i)).join('')}</ul>` : '<p class="empty">Nothing urgent or due soon.</p>'}
    ${low.length ? `<details class="tri-low"><summary>${low.length} low-priority (tips, promos, FYI)</summary>
      <ul class="tri-list">${low.map((item, i) => renderRow(item, top.length + i)).join('')}</ul>
    </details>` : ''}
  </section>
  <details class="soft">
    <summary>How this is scored</summary>
    <ul class="tri-how">
      <li><strong>Real / Suspicious / Phishing</strong> comes only from checks a machine can prove: Google's SPF, DKIM and DMARC results, whether From, Reply-To and Return-Path match, whether links go where their text says, and lookalike domains.</li>
      <li><strong>Urgency</strong>: customer quote requests are Urgent; security alerts and bills are Soon (Urgent when close); newsletters are Low.</li>
      <li><strong>Jev</strong> is a second opinion (legit 0–1, urgency 0–1). Jev can't check facts, so it never overrides a failed check.</li>
    </ul>
  </details>
</section>`;
}

function decodeJson(raw) {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return null; }
  }
  return raw;
}

async function kvCommand(args) {
  const base = process.env.KV_REST_API_URL.replace(/\/$/, '');
  const response = await fetch(base, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!response.ok) throw new Error('kv_command_failed');
  return response.json();
}

async function readRecord() {
  if (kvConfigured()) {
    const payload = await kvCommand(['GET', inboxTriageKey()]);
    return normalizeStored(decodeJson(payload && payload.result));
  }
  const target = filePath();
  if (target) {
    if (!fs.existsSync(target)) return null;
    try { return normalizeStored(JSON.parse(fs.readFileSync(target, 'utf8'))); } catch { return null; }
  }
  return memory ? normalizeStored(memory) : null;
}

async function writeRecord(record) {
  const clean = normalizeStored(record);
  if (!clean) throw new Error('invalid_feed');
  if (kvConfigured()) {
    await kvCommand(['SET', inboxTriageKey(), JSON.stringify(clean)]);
    return clean;
  }
  const target = filePath();
  if (target) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(clean));
  }
  memory = clean;
  return clean;
}

async function readInboxTriageView(now) {
  try {
    return toView(await readRecord(), now);
  } catch {
    console.log(JSON.stringify({ type: 'OpsInboxTriage', event: 'store_unavailable' }));
    return { ok: false, error: 'store_unavailable', empty: true, stale: false, items: [] };
  }
}

function payloadBytes(req) {
  if (typeof req.body === 'string') return Buffer.byteLength(req.body, 'utf8');
  if (Buffer.isBuffer(req.body)) return req.body.length;
  if (req.body && typeof req.body === 'object') return Buffer.byteLength(JSON.stringify(req.body), 'utf8');
  return 0;
}

function declaredTooLarge(req) {
  const raw = header(req, 'content-length');
  if (raw == null || raw === '') return false;
  const size = Number(String(raw).trim());
  return Number.isFinite(size) && size > MAX_FEED_BYTES;
}

function parsePayload(req) {
  let raw = req.body;
  if (Buffer.isBuffer(raw)) raw = raw.toString('utf8');
  if (typeof raw === 'string') {
    if (!raw.trim()) return { error: 'invalid_json' };
    try { return { parsed: JSON.parse(raw) }; } catch { return { error: 'invalid_json' }; }
  }
  if (raw && typeof raw === 'object') return { parsed: raw };
  return { error: 'invalid_json' };
}

async function handleInboxTriage(req, res) {
  if (!inboxTriageKind(req)) return false;
  if (!inboxTriageEnabled()) {
    sendJson(res, 404, { error: 'not_found' });
    return true;
  }
  const method = String(req.method || 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD') {
    const access = await founderSession(req);
    if (!access.session) {
      sendJson(res, access.status, { error: access.error });
      return true;
    }
    const view = await readInboxTriageView();
    if (view.error) sendJson(res, 503, { error: 'store_unavailable' });
    else sendJson(res, 200, view);
    return true;
  }
  if (method !== 'POST') {
    sendJson(res, 405, { error: 'method_not_allowed' });
    return true;
  }
  if (!verifyFeedSecret(req)) {
    sendJson(res, 401, { error: 'unauthorized' });
    return true;
  }
  if (declaredTooLarge(req) || payloadBytes(req) > MAX_FEED_BYTES) {
    sendJson(res, 413, { error: 'payload_too_large' });
    return true;
  }
  const contentType = String(header(req, 'content-type') || '');
  if (contentType && !/^\s*application\/json\b/i.test(contentType)) {
    sendJson(res, 400, { error: 'invalid_json' });
    return true;
  }
  const parsed = parsePayload(req);
  if (parsed.error) {
    sendJson(res, 400, { error: parsed.error });
    return true;
  }
  const validated = validateFeed(parsed.parsed);
  if (validated.error) {
    sendJson(res, 400, { error: validated.error });
    return true;
  }
  try {
    const record = await writeRecord(Object.assign({}, validated.feed, { receivedAt: Date.now() }));
    sendJson(res, 200, { ok: true, stored: true, count: record.items.length });
  } catch {
    console.log(JSON.stringify({ type: 'OpsInboxTriage', event: 'store_unavailable' }));
    sendJson(res, 503, { error: 'store_unavailable' });
  }
  return true;
}

function resetInboxTriage() {
  memory = null;
}

module.exports = {
  ENDPOINT,
  FEED_KEY,
  MAILBOX,
  MAX_FEED_BYTES,
  MAX_ITEMS,
  MIN_SECRET,
  STALE_MS,
  feedIsStale,
  formatChicago,
  gmailThreadUrl,
  handleInboxTriage,
  inboxTriageEnabled,
  inboxTriageKey,
  inboxTriageKind,
  rankItems,
  readInboxTriageView,
  renderInboxTriage,
  resetInboxTriage,
  validateFeed,
};
