// Gmail REST fallback for /ops magic-link mail.
// OAuth refresh + users.messages.send via fetch. No npm.
// Underscore prefix: not a Vercel function. Never log tokens.

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

function deliveryError(reason, status) {
  const err = new Error(reason);
  err.code = 'delivery_failed';
  err.reason = reason;
  err.status = status || 0;
  return err;
}

function buildRfc2822({ from, to, subject, text, html }) {
  const boundary = `lavaall_ops_${Date.now().toString(16)}`;
  return [
    `From: ${headerSafe(from)}`,
    `To: ${headerSafe(to)}`,
    `Subject: ${headerSafe(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
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
  ].join('\r\n');
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

module.exports = {
  gmailConfigured,
  sendGmailMessage,
};
