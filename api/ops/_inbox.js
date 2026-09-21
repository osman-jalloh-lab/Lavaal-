// Ticket 06 — Inbox orchestration. Paste snapshots + optional live support@.
// Confirm-send is a second step. Chat never calls this module.
// Underscore prefix: not a Vercel function. No npm.

const crypto = require('crypto');
const {
  describeGmailSetup,
  listGmailThreads,
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
        snippet: thread.snippet,
        unread: thread.unread,
        receivedAt: thread.receivedAt,
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
  pasteSnapshot,
  readyInboxSend,
  refreshLiveInbox,
  saveInboxDraft,
  setInboxLabel,
};
