// api/ops/_os_inbox.js — the /os Inbox: the business Gmail inbox (OPS_GMAIL_FROM), sorted into piles. Read-only.
// Underscore-prefixed, so Vercel does not treat it as a function.
//
// GET /ops/os/inbox (founder sign-in, agents refused) lists recent inbox threads through the existing
// OPS_GMAIL_* refresh token and sorts each one into a pile by plain, visible rules. Nothing is sent, labelled,
// archived or marked read. Mail text is untrusted: it is length-capped here and escaped by the client.
// Cached for 60 seconds per instance so reloading /os does not hammer Gmail. Never logs mail or tokens.

const { json, looksLikeAgentRequest, queryOf } = require('./_lib');
const { readLiveSession } = require('./_signin_hardening');
const gmail = require('./_gmail');

const CACHE_MS = 60 * 1000;
const MAX_THREADS = 20;
const PILES = Object.freeze([
  { id: 'reply', label: 'Reply today' },
  { id: 'sales', label: 'Sales and quotes' },
  { id: 'hiring', label: 'Hiring' },
  { id: 'security', label: 'Security' },
  { id: 'updates', label: 'Updates' },
  { id: 'other', label: 'Everything else' },
]);

let cache = null;

function isOsInboxRequest(req) {
  const q = queryOf(req);
  const area = String((Array.isArray(q.area) ? q.area[0] : q.area) || '');
  const pathOnly = String(req.url || '').split('?')[0];
  return /(^|\/)os\/inbox\/?$/.test(area) || /\/ops\/os\/inbox\/?$/.test(pathOnly);
}

function clip(value, max) {
  return String(value || '').replace(/[\u0000-\u001F\u007F]+/g, ' ').trim().slice(0, max);
}

// First matching rule wins. Order matters: security alerts before updates, real people before newsletters.
function pileFor(t) {
  const from = String(t.from || '').toLowerCase();
  const text = `${t.subject || ''} ${t.snippet || ''}`.toLowerCase();
  const automated = /no-?reply|do-?not-?reply|notifications?@|newsletter|mailer|updates?@|news@|marketing@|info@.*(mailchimp|hubspot)/.test(from);
  if (/security alert|sign-?in|new device|verification code|password|2-step|suspicious|unusual activity/.test(text)) return 'security';
  if (/\b(rfq|quote|quotation|price|pricing|order|purchase|invoice|proforma|po\b|supplier|stock|delivery)\b/.test(text)) return 'sales';
  if (/\b(cv|resume|résumé|application|applicant|job|vacancy|interview|salonehire|saloneworks|hiring)\b/.test(text)) return 'hiring';
  if (automated) return 'updates';
  if (t.unread) return 'reply';
  return 'other';
}

function toItem(t) {
  return {
    id: clip(t.gmailThreadId, 40),
    from: clip(t.from, 160),
    subject: clip(t.subject, 200) || '(no subject)',
    snippet: clip(t.snippet, 240),
    unread: Boolean(t.unread),
    receivedAt: Number(t.receivedAt) || 0,
    pile: pileFor(t),
  };
}

async function loadInbox(opts) {
  const now = (opts && opts.now) || Date.now();
  const configured = opts && opts.configured !== undefined ? opts.configured : gmail.gmailConfigured();
  if (!configured) {
    return { connected: false, mailbox: '', piles: PILES, items: [], message: 'Gmail is not connected on this deployment (OPS_GMAIL_* are not all set).' };
  }
  if (cache && now - cache.at < CACHE_MS && !(opts && opts.fresh)) return cache.value;
  const list = (opts && opts.listThreads) || gmail.listGmailThreads;
  const threads = await list({ max: MAX_THREADS });
  const value = {
    connected: true,
    mailbox: clip(gmail.gmailFromAddress(), 120),
    piles: PILES,
    items: threads.map(toItem).sort((a, b) => b.receivedAt - a.receivedAt),
    fetchedAt: now,
  };
  cache = { at: now, value };
  return value;
}

async function handleOsInbox(req, res, opts) {
  if (!isOsInboxRequest(req)) return false;
  if (looksLikeAgentRequest(req)) { json(res, 403, { error: 'agent_denied' }); return true; }
  const session = opts && opts.session !== undefined ? opts.session : await readLiveSession(req);
  if (!session || !session.email) { json(res, 401, { error: 'sign_in_required' }); return true; }
  if (req.method !== 'GET' && req.method !== 'HEAD') { json(res, 405, { error: 'method_not_allowed' }); return true; }
  try {
    const q = queryOf(req);
    json(res, 200, await loadInbox(Object.assign({ fresh: q.fresh === '1' }, opts || {})));
  } catch {
    json(res, 502, { error: 'gmail_unavailable', message: 'Gmail did not answer. Try again in a minute.' });
  }
  return true;
}

function resetOsInbox() { cache = null; }

module.exports = { PILES, handleOsInbox, isOsInboxRequest, loadInbox, pileFor, resetOsInbox, toItem };
