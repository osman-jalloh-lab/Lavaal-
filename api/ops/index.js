// api/ops/index.js — private /ops gate, shell, dashboard, profile, tasks.
// Session required. Public catalog routes are unchanged.

const { loginPage } = require('./_html');
const { NAV, areaInfo, dashboardPage, stubPage } = require('./_shell');
const { profilePage, tasksPage } = require('./_pages');
const {
  addNote,
  addProject,
  addTask,
  dashboardSnapshot,
  emptyStore,
  isDurable,
  readStore,
  saveGoal,
  saveProfile,
  updateTask,
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

function safeReturnTo(value) {
  if (value === '/ops/profile' || value === '/ops/tasks' || value === '/ops') return value;
  return '/ops';
}

async function payload(session, area) {
  const resolved = knownArea(area) ? area : 'dashboard';
  try {
    const store = await readStore();
    return {
      authenticated: true,
      email: session.email,
      area: resolved,
      store,
      snapshot: dashboardSnapshot(store),
      durable: isDurable(),
    };
  } catch {
    const store = emptyStore();
    return {
      authenticated: true,
      email: session.email,
      area: resolved,
      store,
      snapshot: dashboardSnapshot(store),
      durable: isDurable(),
      storeError: 'The store is unavailable. Check Vercel KV (KV_REST_API_URL + KV_REST_API_TOKEN).',
    };
  }
}

async function renderArea(req, res, session, extra) {
  const area = resolveArea(req);
  const data = await payload(session, area);
  if (wantsJson(req)) return json(res, 200, data);

  const pageOpts = {
    email: session.email,
    store: data.store,
    snapshot: data.snapshot,
    notice: extra && extra.notice,
    error: (extra && extra.error) || data.storeError,
  };

  switch (area) {
    case 'dashboard':
      return sendHtml(res, 200, dashboardPage(pageOpts));
    case 'profile':
      return sendHtml(res, 200, profilePage(pageOpts));
    case 'tasks':
      return sendHtml(res, 200, tasksPage(pageOpts));
    case 'chat':
    case 'memory':
    case 'inbox':
    case 'calendar':
    case 'routines':
      return sendHtml(res, 200, stubPage({
        email: session.email,
        area: areaInfo(area).id,
        notice: extra && extra.notice,
        error: extra && extra.error,
      }));
    default:
      return sendHtml(res, 200, dashboardPage(pageOpts));
  }
}

function writeStatus(error) {
  switch (error) {
    case 'task_not_found':
      return 404;
    case 'store_unavailable':
      return 503;
    case 'invalid_profile':
    case 'invalid_goal':
    case 'invalid_project':
    case 'invalid_task':
    case 'invalid_note':
    case 'unknown_action':
      return 400;
    default: {
      return 400;
    }
  }
}

async function finishWrite(req, res, session, body, result, notice) {
  if (result.error) {
    const message = result.error === 'store_unavailable'
      ? 'The store is unavailable. Check Vercel KV (KV_REST_API_URL + KV_REST_API_TOKEN).'
      : notice.error;
    return wantsJson(req)
      ? json(res, writeStatus(result.error), { error: result.error })
      : renderArea(req, res, session, { error: message });
  }
  const data = await payload(session, resolveArea(req));
  if (wantsJson(req)) return json(res, 200, Object.assign({ ok: true }, result, data));
  return redirect(res, safeReturnTo(body.returnTo));
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
    case 'save-profile':
      return finishWrite(req, res, session, body, await saveProfile(session.email, {
        role: body.role,
        timezone: body.timezone,
        writingPreferences: body.writingPreferences,
      }), { error: 'Enter profile fields to save.' });
    case 'save-goal':
      return finishWrite(req, res, session, body, await saveGoal({
        title: body.title,
        definitionOfDone: body.definitionOfDone,
        nextStep: body.nextStep,
        targetDate: body.targetDate,
      }), { error: 'Enter a goal title.' });
    case 'add-project':
      return finishWrite(req, res, session, body, await addProject({
        name: body.name,
        finishLine: body.finishLine,
        createdBy: session.email,
      }), { error: 'Enter a project name.' });
    case 'add-task':
      return finishWrite(req, res, session, body, await addTask({
        title: body.title,
        nextAction: body.nextAction,
        status: body.status,
        due: body.due,
        projectId: body.projectId,
        createdBy: session.email,
      }), { error: 'Enter a task title.' });
    case 'update-task':
      return finishWrite(req, res, session, body, await updateTask(body.id, {
        status: body.status,
        nextAction: body.nextAction,
        due: body.due,
        projectId: body.projectId,
        title: body.title,
      }), { error: 'Could not update that task.' });
    case 'add-note':
      return finishWrite(req, res, session, body, await addNote({
        title: body.title,
        body: body.body,
        createdBy: session.email,
      }), { error: 'Enter a note title.' });
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
