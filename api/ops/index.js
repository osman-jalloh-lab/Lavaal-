// api/ops/index.js — private /ops gate, shell, and dashboard (Vercel serverless).
// Rewritten from /ops and /ops/* so ops HTML is never a public static file.
// Session required. Public catalog routes are unchanged.

const { loginPage } = require('./_html');
const { NAV, areaInfo, dashboardPage, stubPage } = require('./_shell');
const {
  addNote,
  addTask,
  dashboardSnapshot,
  isDurable,
  readStore,
} = require('./_store');
const {
  genericLinkFailure,
  json,
  noStore,
  payloadTooLarge,
  queryOf,
  readBody,
  readSession,
  redirect,
  wantsJson,
} = require('./_lib');

function sendHtml(res, status, html) {
  noStore(res, 'text/html; charset=utf-8');
  res.status(status).send(html);
}

function firstQuery(query, key) {
  const value = query[key];
  return Array.isArray(value) ? value[0] : value;
}

function resolveArea(req) {
  const query = queryOf(req);
  const fromQuery = firstQuery(query, 'area');
  if (fromQuery) return String(fromQuery).split('/')[0].toLowerCase();
  const pathOnly = String(req.url || '').split('?')[0];
  const match = pathOnly.match(/\/ops\/([^/]+)/);
  if (match && match[1] !== 'auth') return match[1].toLowerCase();
  return 'dashboard';
}

function knownArea(area) {
  return NAV.some((item) => item.id === area);
}

async function renderArea(req, res, session, extra) {
  const area = resolveArea(req);
  const store = await readStore();
  const snapshot = dashboardSnapshot(store);
  if (wantsJson(req)) {
    return json(res, 200, {
      authenticated: true,
      email: session.email,
      area: knownArea(area) ? area : 'dashboard',
      snapshot,
      durable: isDurable(),
    });
  }
  if (!knownArea(area) || area === 'dashboard') {
    return sendHtml(res, 200, dashboardPage({
      email: session.email,
      snapshot,
      notice: extra && extra.notice,
      error: extra && extra.error,
    }));
  }
  return sendHtml(res, 200, stubPage({
    email: session.email,
    area: areaInfo(area).id,
    notice: extra && extra.notice,
    error: extra && extra.error,
  }));
}

async function handleWrite(req, res, session) {
  if (payloadTooLarge(req)) {
    return wantsJson(req)
      ? json(res, 413, { error: 'payload_too_large' })
      : renderArea(req, res, session, { error: 'Request is too large.' });
  }
  const body = readBody(req);
  const action = String(body.action || '');
  switch (action) {
    case 'add-task': {
      const result = await addTask({
        title: body.title,
        nextAction: body.nextAction,
        createdBy: session.email,
      });
      if (result.error) {
        return wantsJson(req)
          ? json(res, 400, { error: result.error })
          : renderArea(req, res, session, { error: 'Enter a task title.' });
      }
      if (wantsJson(req)) return json(res, 200, { ok: true, task: result.task, snapshot: dashboardSnapshot(await readStore()) });
      return redirect(res, '/ops');
    }
    case 'add-note': {
      const result = await addNote({
        title: body.title,
        body: body.body,
        createdBy: session.email,
      });
      if (result.error) {
        return wantsJson(req)
          ? json(res, 400, { error: result.error })
          : renderArea(req, res, session, { error: 'Enter a note title.' });
      }
      if (wantsJson(req)) return json(res, 200, { ok: true, note: result.note, snapshot: dashboardSnapshot(await readStore()) });
      return redirect(res, '/ops');
    }
    default:
      return wantsJson(req)
        ? json(res, 400, { error: 'unknown_action' })
        : renderArea(req, res, session, { error: 'Unknown action.' });
  }
}

async function ops(req, res) {
  const session = readSession(req);

  if (req.method === 'POST') {
    if (!session) {
      return wantsJson(req)
        ? json(res, 401, { error: 'sign_in_required' })
        : sendHtml(res, 401, loginPage({ error: 'Sign in required.' }));
    }
    return handleWrite(req, res, session);
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return json(res, 405, { error: 'method_not_allowed' });
  }

  if (session) return renderArea(req, res, session);

  const query = queryOf(req);
  const sent = firstQuery(query, 'sent');
  const error = firstQuery(query, 'error');
  if (sent === '1') return sendHtml(res, 200, loginPage({ sent: true }));
  if (error) {
    const message = error === 'link' ? genericLinkFailure() : String(error);
    return sendHtml(res, 401, loginPage({ error: message }));
  }
  return sendHtml(res, 401, loginPage());
}

module.exports = ops;
