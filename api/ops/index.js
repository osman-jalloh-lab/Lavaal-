// api/ops/index.js — private /ops gate (Vercel serverless).
// Rewritten from /ops and /ops/* so the placeholder is never a public static file.
// Session required. Public catalog routes are unchanged.

const { loginPage, signedInPage } = require('./_html');
const {
  genericLinkFailure,
  json,
  noStore,
  queryOf,
  readSession,
} = require('./_lib');

function sendHtml(res, status, html) {
  noStore(res, 'text/html; charset=utf-8');
  res.status(status).send(html);
}

async function ops(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return json(res, 405, { error: 'method_not_allowed' });
  }

  const session = readSession(req);
  if (session) return sendHtml(res, 200, signedInPage(session.email));

  const query = queryOf(req);
  const sent = Array.isArray(query.sent) ? query.sent[0] : query.sent;
  const error = Array.isArray(query.error) ? query.error[0] : query.error;
  if (sent === '1') return sendHtml(res, 200, loginPage({ sent: true }));
  if (error) {
    const message = error === 'link' ? genericLinkFailure() : String(error);
    return sendHtml(res, 401, loginPage({ error: message }));
  }
  return sendHtml(res, 401, loginPage());
}

module.exports = ops;
