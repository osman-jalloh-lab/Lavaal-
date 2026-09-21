// Gmail REST for /ops magic-link mail and ticket 06 support@ inbox.
// OAuth refresh + users.messages.list/get/send via fetch. No npm.
// Underscore prefix: not a Vercel function. Never log tokens.

const SUPPORT_MAILBOX = 'support@lavaall.com';
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

function headerSafe(value) {
  return String(value || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 240);
}

function gmailConfigured() {
  return Boolean(
    process.env.OPS_GMAIL_CLIENT_ID
    && process.env.OPS_GMAIL_CLIENT_SECRET
    && process.env.OPS_GMAIL_REFRESH_TOKEN
    && process.env.OPS_GMAIL_FROM
  );
}

function gmailFromAddress() {
  return String(process.env.OPS_GMAIL_FROM || '').trim().toLowerCase();
}

function supportInboxConfigured() {
  return gmailConfigured() && gmailFromAddress() === SUPPORT_MAILBOX;
}

function describeGmailSetup() {
  return {
    gmailConfigured: gmailConfigured(),
    supportConnected: supportInboxConfigured(),
    supportMailbox: SUPPORT_MAILBOX,
  };
}

function deliveryError(reason, status) {
  const err = new Error(reason);
  err.code = 'delivery_failed';
  err.reason = reason;
  err.status = status || 0;
  return err;
}

function buildRfc2822({ from, to, subject, text, html, inReplyTo, references }) {
  const boundary = `lavaall_ops_${Date.now().toString(16)}`;
  const lines = [
    `From: ${headerSafe(from)}`,
    `To: ${headerSafe(to)}`,
    `Subject: ${headerSafe(subject)}`,
  ];
  if (inReplyTo) lines.push(`In-Reply-To: ${headerSafe(inReplyTo)}`);
  if (references) lines.push(`References: ${headerSafe(references)}`);
  lines.push(
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
  );
  return lines.concat([
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    text,
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    html,
    `--${boundary}--`,
    '',
  ]).join('\r\n');
}

function headerFrom(headers, name) {
  const found = (headers || []).find((item) => String(item.name || '').toLowerCase() === name);
  return found && found.value ? String(found.value) : '';
}

function decodeEntities(text) {
  return String(text || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return Number.isFinite(code) ? String.fromCharCode(code) : '';
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => {
      const code = parseInt(n, 16);
      return Number.isFinite(code) ? String.fromCharCode(code) : '';
    });
}

function htmlToReadableText(html) {
  let text = String(html || '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  text = text.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  text = text.replace(/<head[\s\S]*?<\/head>/gi, ' ');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/(p|div|tr|h[1-6]|li|table|blockquote)>/gi, '\n');
  text = text.replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, (_, inner) => {
    const label = String(inner).replace(/<[^>]+>/g, '').trim();
    if (!label || /^https?:\/\//i.test(label) || label.length > 80) return ' ';
    return ` ${label} `;
  });
  text = text.replace(/<[^>]+>/g, ' ');
  text = decodeEntities(text);
  text = text.replace(/https?:\/\/\S+/g, ' ');
  text = text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  text = text.replace(/[ \t]{2,}/g, ' ').trim();
  return text;
}

function isUrlSoup(text) {
  const raw = String(text || '');
  if (!raw) return false;
  const urls = raw.match(/https?:\/\/\S+/g) || [];
  const without = raw.replace(/https?:\/\/\S+/g, ' ').replace(/\s+/g, ' ').trim();
  return urls.length >= 3 && without.length < 80;
}

function collectMailParts(part, bucket) {
  if (!part) return;
  if (part.body && part.body.data) {
    const decoded = Buffer.from(part.body.data, 'base64url').toString('utf8');
    if (part.mimeType === 'text/plain') bucket.plain.push(decoded);
    if (part.mimeType === 'text/html') bucket.html.push(decoded);
  }
  if (Array.isArray(part.parts)) {
    part.parts.forEach((child) => collectMailParts(child, bucket));
  }
}

function preferReadableMail(plain, htmlText) {
  const plainRaw = String(plain || '').trim();
  const htmlRaw = String(htmlText || '').trim();
  if (plainRaw && !isUrlSoup(plainRaw)) return plainRaw;
  if (htmlRaw) return htmlRaw;
  if (plainRaw) return plainRaw.replace(/https?:\/\/\S+/g, ' ').replace(/\s+/g, ' ').trim();
  return '';
}

function decodeGmailBody(part) {
  const bucket = { plain: [], html: [] };
  collectMailParts(part, bucket);
  const plain = bucket.plain.join('\n').trim();
  const fromHtml = htmlToReadableText(bucket.html.join('\n'));
  return preferReadableMail(plain, fromHtml).slice(0, 4000);
}

async function gmailRequest(path, { method, body } = {}) {
  const accessToken = await refreshGmailAccessToken();
  const response = await fetch(`${GMAIL_API}/${path.replace(/^\//, '')}`, {
    method: method || 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return response;
}

async function refreshGmailAccessToken() {
  const body = new URLSearchParams({
    client_id: process.env.OPS_GMAIL_CLIENT_ID,
    client_secret: process.env.OPS_GMAIL_CLIENT_SECRET,
    refresh_token: process.env.OPS_GMAIL_REFRESH_TOKEN,
    grant_type: 'refresh_token',
  });
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!response.ok) throw deliveryError('oauth', response.status);
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw deliveryError('oauth_parse', response.status);
  }
  if (!payload || typeof payload.access_token !== 'string' || !payload.access_token) {
    throw deliveryError('oauth_token', response.status);
  }
  return payload.access_token;
}

async function sendGmailMessage({ to, subject, text, html }) {
  const accessToken = await refreshGmailAccessToken();
  const raw = Buffer.from(buildRfc2822({
    from: process.env.OPS_GMAIL_FROM,
    to,
    subject,
    text,
    html,
  }), 'utf8').toString('base64url');
  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  });
  if (!response.ok) throw deliveryError('send', response.status);
  return { via: 'gmail', status: response.status };
}

async function listGmailThreads({ max } = {}) {
  const limit = Number.isFinite(max) ? Math.min(max, 20) : 12;
  const list = await gmailRequest(`threads?maxResults=${limit}&q=${encodeURIComponent('in:inbox')}`);
  if (!list.ok) throw deliveryError('list', list.status);
  const payload = await list.json();
  const threads = Array.isArray(payload.threads) ? payload.threads.slice(0, limit) : [];
  const out = [];
  for (const thread of threads) {
    const detail = await gmailRequest(`threads/${encodeURIComponent(thread.id)}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`);
    if (!detail.ok) throw deliveryError('thread', detail.status);
    const data = await detail.json();
    const messages = Array.isArray(data.messages) ? data.messages : [];
    const last = messages[messages.length - 1] || {};
    const headers = last.payload && last.payload.headers ? last.payload.headers : [];
    const unread = messages.some((msg) => Array.isArray(msg.labelIds) && msg.labelIds.includes('UNREAD'));
    const parsedDate = Date.parse(headerFrom(headers, 'date'));
    const receivedAt = Number(last.internalDate) || (Number.isFinite(parsedDate) ? parsedDate : 0);
    out.push({
      gmailThreadId: data.id || thread.id,
      gmailMessageId: last.id || '',
      from: headerFrom(headers, 'from'),
      to: headerFrom(headers, 'to'),
      subject: headerFrom(headers, 'subject') || '(no subject)',
      snippet: data.snippet || last.snippet || '',
      unread,
      receivedAt,
    });
  }
  return out;
}

async function readGmailMessage(id) {
  const response = await gmailRequest(`messages/${encodeURIComponent(id)}?format=full`);
  if (!response.ok) throw deliveryError('read', response.status);
  const data = await response.json();
  const headers = data.payload && data.payload.headers ? data.payload.headers : [];
  return {
    gmailMessageId: data.id || id,
    gmailThreadId: data.threadId || '',
    from: headerFrom(headers, 'from'),
    to: headerFrom(headers, 'to'),
    subject: headerFrom(headers, 'subject') || '(no subject)',
    body: decodeGmailBody(data.payload).slice(0, 4000),
    snippet: data.snippet || '',
  };
}

async function sendGmailReply({ to, subject, text, threadId, inReplyTo }) {
  const accessToken = await refreshGmailAccessToken();
  const replySubject = /^re:/i.test(String(subject || '')) ? subject : `Re: ${subject || ''}`.trim();
  const html = `<p>${String(text || '').replace(/[<>]/g, '').replace(/\n/g, '<br/>')}</p>`;
  const raw = Buffer.from(buildRfc2822({
    from: process.env.OPS_GMAIL_FROM,
    to,
    subject: replySubject,
    text,
    html,
    inReplyTo,
    references: inReplyTo,
  }), 'utf8').toString('base64url');
  const body = { raw };
  if (threadId) body.threadId = threadId;
  const response = await fetch(`${GMAIL_API}/messages/send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw deliveryError('send', response.status);
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }
  return {
    via: 'gmail',
    status: response.status,
    id: payload && payload.id ? String(payload.id) : '',
    threadId: payload && payload.threadId ? String(payload.threadId) : (threadId || ''),
  };
}

module.exports = {
  SUPPORT_MAILBOX,
  describeGmailSetup,
  gmailConfigured,
  gmailFromAddress,
  htmlToReadableText,
  isUrlSoup,
  listGmailThreads,
  preferReadableMail,
  readGmailMessage,
  refreshGmailAccessToken,
  sendGmailMessage,
  sendGmailReply,
  supportInboxConfigured,
};
