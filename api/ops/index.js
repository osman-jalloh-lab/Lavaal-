// api/ops/index.js — private /ops gate through calendar and saved routines.
// Session required. Public catalog routes are unchanged.

const { loginPage } = require('./_html');
const { NAV, dashboardPage } = require('./_shell');
const { calendarPage, chatPage, inboxPage, memoryPage, profilePage, routinesPage, tasksPage } = require('./_pages');
const { copyRoutinePrompt, runRoutine, updateRoutine } = require('./_routines');
const {
  describeCalendarSetup,
  refreshGoogleAgenda,
  removeCalendarEvent,
  saveCalendarEvent,
} = require('./_calendar');
const { describeChatSetup, sendChatTurn } = require('./_chat');
const {
  confirmInboxSend,
  pasteSnapshot,
  readyInboxSend,
  refreshLiveInbox,
  saveInboxDraft,
} = require('./_inbox');
const { describeGmailSetup } = require('./_gmail');
const {
  addNote,
  addProject,
  addTask,
  confirmChatProposal,
  dashboardSnapshot,
  deleteNote,
  dismissChatProposal,
  emptyStore,
  getSharedChat,
  isDurable,
  listEvents,
  listRoutines,
  readStore,
  saveGoal,
  saveProfile,
  searchNotes,
  updateNote,
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
  if (value === '/ops/profile' || value === '/ops/tasks' || value === '/ops/memory' || value === '/ops/chat' || value === '/ops/inbox' || value === '/ops/calendar' || value === '/ops/routines' || value === '/ops') return value;
  if (typeof value === 'string' && /^\/ops\/inbox\?thread=[a-zA-Z0-9_-]{6,40}$/.test(value)) return value;
  return '/ops';
}

async function payload(session, area, search) {
  const resolved = knownArea(area) ? area : 'dashboard';
  const query = typeof search === 'string' ? search : '';
  try {
    const store = await readStore();
    return {
      authenticated: true,
      email: session.email,
      area: resolved,
      store,
      snapshot: dashboardSnapshot(store),
      durable: isDurable(),
      search: query,
      visibleNotes: searchNotes(store, query),
      chat: getSharedChat(store),
      chatSetup: describeChatSetup(),
      inboxSetup: describeGmailSetup(),
      inboxItems: store.inbox || [],
      inboxAudit: store.mailAudit || [],
      calendarSetup: describeCalendarSetup(),
      events: listEvents(store),
      routines: listRoutines(store),
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
      search: query,
      visibleNotes: [],
      chat: getSharedChat(store),
      chatSetup: describeChatSetup(),
      inboxSetup: describeGmailSetup(),
      inboxItems: [],
      inboxAudit: [],
      calendarSetup: describeCalendarSetup(),
      events: [],
      routines: [],
      storeError: 'The store is unavailable. Check Vercel KV (KV_REST_API_URL + KV_REST_API_TOKEN).',
    };
  }
}

async function renderArea(req, res, session, extra) {
  const area = resolveArea(req);
  const search = firstQuery(queryOf(req), 'q') || '';
  const data = await payload(session, area, search);
  if (wantsJson(req)) return json(res, 200, data);

  const pageOpts = {
    email: session.email,
    store: data.store,
    snapshot: data.snapshot,
    notice: extra && extra.notice,
    error: (extra && extra.error) || data.storeError,
    search: data.search,
    chatSetup: data.chatSetup,
    inboxSetup: data.inboxSetup,
    calendarSetup: data.calendarSetup,
    openThread: firstQuery(queryOf(req), 'thread') || '',
  };

  switch (area) {
    case 'dashboard':
      return sendHtml(res, 200, dashboardPage(pageOpts));
    case 'profile':
      return sendHtml(res, 200, profilePage(pageOpts));
    case 'tasks':
      return sendHtml(res, 200, tasksPage(pageOpts));
    case 'memory':
      return sendHtml(res, 200, memoryPage(pageOpts));
    case 'chat':
      return sendHtml(res, 200, chatPage(pageOpts));
    case 'inbox':
      return sendHtml(res, 200, inboxPage(pageOpts));
    case 'calendar':
      return sendHtml(res, 200, calendarPage(pageOpts));
    case 'routines':
      return sendHtml(res, 200, routinesPage(pageOpts));
    default:
      return sendHtml(res, 200, dashboardPage(pageOpts));
  }
}

function writeStatus(error) {
  switch (error) {
    case 'task_not_found':
    case 'note_not_found':
      return 404;
    case 'store_unavailable':
      return 503;
    case 'invalid_profile':
    case 'invalid_goal':
    case 'invalid_project':
    case 'invalid_task':
    case 'invalid_note':
    case 'memory_review_required':
    case 'invalid_message':
    case 'invalid_proposal':
    case 'unknown_action':
      return 400;
    case 'proposal_not_found':
    case 'inbox_not_found':
      return 404;
    case 'invalid_inbox':
    case 'invalid_draft':
    case 'confirm_required':
    case 'support_not_connected':
      return 400;
    case 'gmail_reconnect':
    case 'calendar_reconnect':
      return 503;
    case 'invalid_event':
    case 'external_attendee':
      return 400;
    case 'event_not_found':
    case 'routine_not_found':
      return 404;
    case 'invalid_routine':
    case 'missing_input':
    case 'unconfigured':
      return 400;
    case 'helper_failed':
      return 503;
    default: {
      return 400;
    }
  }
}

async function finishWrite(req, res, session, body, result, notice) {
  if (result.error) {
    const message = result.error === 'store_unavailable'
      ? 'The store is unavailable. Check Vercel KV (KV_REST_API_URL + KV_REST_API_TOKEN).'
      : result.error === 'memory_review_required'
        ? 'Proposed memories need review before save.'
        : result.error === 'support_not_connected'
          ? 'Live support@ is not connected. Paste still works; confirm-send needs a support@ refresh token.'
          : result.error === 'confirm_required'
            ? 'Save a draft and click Ready to send before Confirm send.'
            : result.error === 'gmail_reconnect'
              ? 'Gmail OAuth failed. Reconnect the support@ refresh token.'
              : result.error === 'external_attendee'
                ? 'Internal attendees only. Customer emails cannot be invited from /ops.'
                : result.error === 'invalid_event'
                  ? 'Enter a title, date, and valid start/end times (or mark the event all-day).'
                  : result.error === 'calendar_reconnect'
                    ? 'Google Calendar OAuth failed. Reconnect the refresh token. Manual events still work.'
                    : result.error === 'missing_input'
                      ? (result.message || 'Select the notes or goal this routine needs.')
                      : result.error === 'unconfigured'
                        ? (result.message || 'No Anthropic or OpenAI key. Run was not invented.')
                        : result.error === 'helper_failed'
                          ? (result.message || 'The helper failed. No invented result.')
                          : result.error === 'invalid_routine'
                            ? 'Enter a routine name and prompt.'
                            : notice.error;
    return wantsJson(req)
      ? json(res, writeStatus(result.error), {
        error: result.error,
        message: result.message || undefined,
        missing: result.missing || undefined,
      })
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
        source: body.source,
        createdBy: session.email,
      }), { error: 'Enter a note title.' });
    case 'update-note':
      return finishWrite(req, res, session, body, await updateNote(body.id, {
        title: body.title,
        body: body.body,
        source: body.source,
      }), { error: 'Could not update that note.' });
    case 'delete-note':
      return finishWrite(req, res, session, body, await deleteNote(body.id), { error: 'Could not delete that note.' });
    case 'send-chat':
      return finishWrite(req, res, session, body, await sendChatTurn({
        question: body.message,
        selection: {
          useGoal: body.useGoal,
          taskId: body.taskId,
          noteId: body.noteId,
          taskIds: body.taskIds,
          noteIds: body.noteIds,
        },
        createdBy: session.email,
      }), { error: 'Enter a message.' });
    case 'confirm-proposal':
      return finishWrite(req, res, session, body, await confirmChatProposal(body.id, {
        approvedBy: session.email,
      }), { error: 'Could not confirm that draft.' });
    case 'dismiss-proposal':
      return finishWrite(req, res, session, body, await dismissChatProposal(body.id), { error: 'Could not dismiss that draft.' });
    case 'paste-inbox':
      return finishWrite(req, res, session, body, await pasteSnapshot({
        from: body.from,
        subject: body.subject,
        body: body.body,
        createdBy: session.email,
      }), { error: 'Enter a subject for the snapshot.' });
    case 'save-inbox-draft':
      return finishWrite(req, res, session, body, await saveInboxDraft(body.id, {
        draft: body.draft,
        label: body.label,
        linkedTaskId: body.linkedTaskId,
      }), { error: 'Could not save that draft.' });
    case 'ready-inbox-send':
      return finishWrite(req, res, session, body, await readyInboxSend(body.id), { error: 'Save a draft before Ready to send.' });
    case 'confirm-inbox-send':
      return finishWrite(req, res, session, body, await confirmInboxSend(body.id, {
        token: body.token,
        confirmedBy: session.email,
      }), { error: 'Confirm send was rejected.' });
    case 'refresh-inbox':
      return finishWrite(req, res, session, body, await refreshLiveInbox(), { error: 'Could not refresh live mail.' });
    case 'save-event':
      return finishWrite(req, res, session, body, await saveCalendarEvent({
        title: body.title,
        date: body.date,
        start: body.start,
        end: body.end,
        timezone: body.timezone,
        allDay: body.allDay,
        attendees: body.attendees,
        notes: body.notes,
      }, { createdBy: session.email }), { error: 'Enter a title, date, and valid times.' });
    case 'update-event':
      return finishWrite(req, res, session, body, await saveCalendarEvent({
        id: body.id,
        title: body.title,
        date: body.date,
        start: body.start,
        end: body.end,
        timezone: body.timezone,
        allDay: body.allDay,
        attendees: body.attendees,
        notes: body.notes,
      }), { error: 'Could not update that event.' });
    case 'delete-event':
      return finishWrite(req, res, session, body, await removeCalendarEvent(body.id), { error: 'Could not delete that event.' });
    case 'refresh-calendar':
      return finishWrite(req, res, session, body, await refreshGoogleAgenda(), { error: 'Could not refresh the shared calendar.' });
    case 'update-routine':
      return finishWrite(req, res, session, body, await updateRoutine(body.id, {
        name: body.name,
        prompt: body.prompt,
        contextNote: body.contextNote,
      }), { error: 'Could not update that routine.' });
    case 'copy-prompt': {
      const copied = await copyRoutinePrompt(body.id);
      if (copied.ok && !wantsJson(req)) {
        return renderArea(req, res, session, { notice: 'Prompt is in the box — select it and copy.' });
      }
      return finishWrite(req, res, session, body, copied, { error: 'Could not copy that prompt.' });
    }
    case 'run-routine':
      return finishWrite(req, res, session, body, await runRoutine(body.id, {
        selection: {
          useGoal: body.useGoal,
          taskId: body.taskId,
          noteId: body.noteId,
          taskIds: body.taskIds,
          noteIds: body.noteIds,
        },
        createdBy: session.email,
      }), { error: 'Could not run that routine.' });
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
