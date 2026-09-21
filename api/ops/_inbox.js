// Ticket 06 — Inbox orchestration. Paste snapshots + optional live support@.
// Confirm-send is a second step. Chat never calls this module.
// Underscore prefix: not a Vercel function. No npm.

const crypto = require('crypto');
const {
  describeGmailSetup,
  htmlToReadableText,
  isUrlSoup,
  listGmailThreads,
  preferReadableMail,
  readGmailMessage,
  sendGmailReply,
  supportInboxConfigured,
} = require('./_gmail');
const {
  addInboxItem,
  addMailAudit,
  getInboxItem,
  listInboxItems,
  listMailAudit,
  readStore,
  updateInboxItem,
  upsertLiveInboxItem,
} = require('./_store');

function replyAddress(fromHeader) {
  const raw = String(fromHeader || '');
  const angled = raw.match(/<([^>]+)>/);
  return (angled ? angled[1] : raw).trim();
}

function mailHaystack(item) {
  return [
    item && item.from,
    item && item.to,
    item && item.subject,
    item && item.body,
    item && item.snippet,
  ].map((value) => String(value || '').toLowerCase()).join('\n');
}

function isInboxNoise(item) {
  const hay = mailHaystack(item);
  const from = String((item && item.from) || '').toLowerCase();
  const to = String((item && item.to) || '').toLowerCase();
  const subject = String((item && item.subject) || '').toLowerCase();
  if (/voicecal|voice[\s-]?cal/.test(hay)) return true;
  if (/mailer-daemon|postmaster@|delivery status notification|undeliverable|returned mail|failure notice/.test(hay)) return true;
  if (/example\.com/.test(`${from} ${to}`) && /delivery status|undeliverable|mailer-daemon|postmaster|dsn\b/.test(hay)) return true;
  if (/(google workspace|workspace billing|google payments|payments\.google|complete your workspace|verify your (bank|payment)|add a bank|gcp billing|google cloud billing)/.test(hay)) return true;
  if (/workspace-noreply|payments-noreply|no-reply@accounts\.google|noreply@google\.com/.test(from)) {
    if (/setup|payment|billing|bank|invoice|verify/.test(subject) || /setup|payment|billing|bank/.test(hay)) return true;
  }
  return false;
}

function looksLikeInquiry(item) {
  const hay = mailHaystack(item);
  if (/\?/.test(hay)) return true;
  return /\b(quote|quotation|order|help|please|need|request|follow.?up|stock|lead time|pricing|invoice|thinkpad|laptop)\b/.test(hay);
}

function suggestedInboxLabel(item) {
  if (isInboxNoise(item)) return 'reference';
  if (looksLikeInquiry(item)) return 'needs_reply';
  return 'reference';
}

function readableInboxBody(item) {
  const raw = String((item && (item.body || item.snippet)) || '');
  if (/<[a-z][\s\S]*>/i.test(raw)) {
    const fromHtml = htmlToReadableText(raw);
    if (fromHtml) return fromHtml;
  }
  return preferReadableMail(raw, '') || raw;
}

async function pasteSnapshot({ from, subject, body, createdBy }) {
  return addInboxItem({
    source: 'paste',
    live: false,
    from,
    subject,
    body,
    snippet: body,
    label: 'needs_reply',
    createdBy,
  });
}

async function saveInboxDraft(id, { draft, label, linkedTaskId }) {
  const storeData = await readStore();
  if (!getInboxItem(storeData, id)) return { error: 'inbox_not_found' };
  return updateInboxItem(id, {
    draft,
    label,
    linkedTaskId,
    pendingConfirm: false,
    confirmToken: '',
  });
}

async function setInboxLabel(id, label) {
  const storeData = await readStore();
  if (!getInboxItem(storeData, id)) return { error: 'inbox_not_found' };
  return updateInboxItem(id, { label });
}

async function readyInboxSend(id) {
  const storeData = await readStore();
  const item = getInboxItem(storeData, id);
  if (!item) return { error: 'inbox_not_found' };
  if (item.sentMessageId) return { ok: true, item, alreadySent: true };
  if (!item.draft) return { error: 'invalid_draft' };
  const token = crypto.randomBytes(12).toString('hex');
  return updateInboxItem(id, { pendingConfirm: true, confirmToken: token });
}

async function confirmInboxSend(id, { token, confirmedBy }) {
  if (!supportInboxConfigured()) return { error: 'support_not_connected' };
  const storeData = await readStore();
  const item = getInboxItem(storeData, id);
  if (!item) return { error: 'inbox_not_found' };
  if (item.sentMessageId) {
    const audit = listMailAudit(storeData).find((entry) => entry.inboxId === item.id && entry.messageId === item.sentMessageId);
    return { ok: true, idempotent: true, item, audit: audit || null };
  }
  if (!item.pendingConfirm || !item.confirmToken || item.confirmToken !== String(token || '')) {
    return { error: 'confirm_required' };
  }
  if (!item.draft) return { error: 'invalid_draft' };
  const to = replyAddress(item.from);
  if (!to) return { error: 'invalid_inbox' };

  let sent;
  try {
    sent = await sendGmailReply({
      to,
      subject: item.subject,
      text: item.draft,
      threadId: item.gmailThreadId,
      inReplyTo: item.gmailMessageId,
    });
  } catch {
    return { error: 'gmail_reconnect' };
  }

  const marked = await updateInboxItem(id, {
    sentAt: Date.now(),
    sentMessageId: sent.id || `sent-${item.id}`,
    pendingConfirm: false,
    label: 'done',
  });
  const audit = await addMailAudit({
    inboxId: item.id,
    email: confirmedBy,
    messageId: sent.id || marked.item.sentMessageId,
    subject: item.subject,
  });
  return { ok: true, sent, item: marked.item, audit: audit.audit };
}

async function refreshLiveInbox() {
  if (!supportInboxConfigured()) {
    return { ok: true, live: false, setup: describeGmailSetup() };
  }
  try {
    const threads = await listGmailThreads({ max: 12 });
    for (const thread of threads) {
      let body = thread.snippet || '';
      if (thread.gmailMessageId) {
        try {
          const full = await readGmailMessage(thread.gmailMessageId);
          body = full.body || body;
        } catch {
          body = thread.snippet || '';
        }
      }
      await upsertLiveInboxItem({
        gmailThreadId: thread.gmailThreadId,
        gmailMessageId: thread.gmailMessageId,
        from: thread.from,
        to: thread.to,
        subject: thread.subject,
        body,
        snippet: isUrlSoup(thread.snippet) ? (body || '').slice(0, 280) : thread.snippet,
        unread: thread.unread,
        receivedAt: thread.receivedAt,
        label: suggestedInboxLabel({
          from: thread.from,
          to: thread.to,
          subject: thread.subject,
          body,
          snippet: thread.snippet,
        }),
      });
    }
    return { ok: true, live: true, count: threads.length, setup: describeGmailSetup() };
  } catch {
    return { error: 'gmail_reconnect', setup: describeGmailSetup() };
  }
}

async function inboxPayload() {
  const storeData = await readStore();
  return {
    setup: describeGmailSetup(),
    items: listInboxItems(storeData),
    audit: listMailAudit(storeData).slice(0, 10),
  };
}

module.exports = {
  confirmInboxSend,
  inboxPayload,
  isInboxNoise,
  pasteSnapshot,
  readableInboxBody,
  readyInboxSend,
  refreshLiveInbox,
  saveInboxDraft,
  setInboxLabel,
  suggestedInboxLabel,
};
