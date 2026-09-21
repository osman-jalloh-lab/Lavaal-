// Slice 2 — CEO Assign → Researchy child + CEO synthesize.
// KV tasks in _store.js are the SoT. Researchy runs via desk-talk / xAI,
// never ceo-bridge. B2 pending is not woken. Specialist done ≠ task done
// until CEO synthesizes. Research/sourcing → Researchy first; Technical
// is not auto-involved. Underscore prefix: not a Vercel function. No npm.
// Never log emails or secrets. L3: no outbound email/send.

const {
  createCsrfToken,
  header,
  isAllowlisted,
  json,
  looksLikeAgentRequest,
  normalizeEmail,
  payloadTooLarge,
  peekSessionEmail,
  queryOf,
  readBody,
  readCsrfToken,
  readSession,
  redirect,
  wantsJson,
} = require('./_lib');
const { addTask, notesSelectableForChat, readStore, unfinishedTasks, updateTask } = require('./_store');
const { completeXai, xaiConfigured } = require('./_xai');
const ceo = require('./_ceo_bridge');
const desks = require('./_agent_thread');

const RESEARCHY_ID = 'researchy';
const ACK_PREFIX = 'Assigned to Researchy.';

function clean(value, max) {
  return typeof value === 'string' ? value.trim().replace(/[<>]/g, '').slice(0, max) : '';
}

function looksLikeAssign(input) {
  if (!input) return false;
  if (input.assign === true || input.assign === '1' || input.assign === 'researchy') return true;
  const assignee = String(input.assignee || input.ownerAgentId || '').toLowerCase();
  if (assignee === 'researchy') return true;
  const text = String(input.text || input.message || input.brief || '');
  if (/^\/assign\b/i.test(text)) return true;
  if (/\bassign(?:\s+this)?\s+to\s+researchy\b/i.test(text)) return true;
  if (/\bassign\s+researchy\b/i.test(text)) return true;
  return false;
}

function parseAssignBrief(text) {
  const raw = typeof text === 'string' ? text.trim() : '';
  const stripped = raw
    .replace(/^\/assign\b[:\s-]*/i, '')
    .replace(/^assign(?:\s+this)?\s+to\s+researchy\b[:\s-]*/i, '')
    .replace(/^assign\s+researchy\b[:\s-]*/i, '')
    .trim();
  const brief = stripped || raw;
  const title = (brief.split(/\n/)[0] || '').trim().slice(0, 160) || 'Researchy assignment';
  return { brief, title };
}

function assigneeOf(input) {
  const named = String((input && (input.assignee || input.ownerAgentId || input.assign)) || '').toLowerCase();
  if (!named || named === '1' || named === 'true' || named === 'researchy') return RESEARCHY_ID;
  return '';
}

function lastByRole(thread, role) {
  const messages = thread && Array.isArray(thread.messages) ? thread.messages : [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i] && messages[i].role === role) return messages[i];
  }
  return null;
}

function formatTrustedContext(data) {
  const lines = ['Trusted LAVAALL OS records (KV). Use only these facts:'];
  const goal = data && data.goal ? data.goal : null;
  const tasks = data && Array.isArray(data.tasks) ? data.tasks : [];
  const notes = data && Array.isArray(data.notes) ? data.notes : [];
  if (!goal && !tasks.length && !notes.length) {
    lines.push('None loaded. Do not invent goals, tasks, notes, prices, SKUs, or legal positions.');
    return lines.join('\n');
  }
  if (goal) {
    lines.push(`Goal: ${goal.title}`);
    if (goal.definitionOfDone) lines.push(`Definition of done: ${goal.definitionOfDone}`);
    if (goal.nextStep) lines.push(`Next step: ${goal.nextStep}`);
  }
  tasks.forEach((task) => {
    lines.push(`Task: ${task.title} (${task.status || 'todo'})`);
    if (task.nextAction) lines.push(`Task next action: ${task.nextAction}`);
  });
  notes.forEach((note) => {
    lines.push(`Note: ${note.title}${note.body ? ` — ${note.body}` : ''}`);
  });
  return lines.join('\n');
}

async function loadTrustedContext() {
  try {
    const data = await readStore();
    return {
      goal: data && data.goal ? data.goal : null,
      tasks: unfinishedTasks(data || {}).slice(0, 12),
      notes: notesSelectableForChat(data || {}).slice(0, 8),
    };
  } catch {
    return { goal: null, tasks: [], notes: [] };
  }
}

function synthesisSystem(context) {
  return [
    'You are LAVAALL CEO synthesizing Researchy specialist result for the founder.',
    desks.MARKETS_STUB,
    'Use only the trusted KV records and the Researchy result below. Do not invent company context, prices, SKUs, suppliers, owners, or completions.',
    'Do not dump the specialist reply verbatim. Summarize what Researchy found, what is still unknown, and the next decision.',
    'Researchy-first. Do not involve Technical unless the founder asked for validation.',
    'Never mention /ops, Talk bridges, helpers, Anthropic, OpenAI, or xAI.',
    formatTrustedContext(context),
  ].join('\n');
}

function findAssignTask(storeData, pred) {
  return ((storeData && storeData.tasks) || []).find(pred) || null;
}

async function assignToResearchy(input) {
  const who = normalizeEmail(input && input.founderEmail);
  if (!who || !isAllowlisted(who)) return { error: 'forbidden' };
  const assignee = assigneeOf(input);
  if (assignee !== RESEARCHY_ID) return { error: 'invalid_assignee' };
  const parsed = parseAssignBrief(input && (input.text || input.message || input.brief));
  if (!parsed.brief) return { error: 'invalid_message' };

  const queued = await ceo.enqueueFounderMessage({
    text: parsed.brief,
    founderEmail: who,
    threadId: input.threadId,
    source: input.source || 'ceo-assign',
    correlationId: input.correlationId,
    enqueuePending: false,
    explicitWake: false,
  });
  if (queued.error) return queued;

  const storeData = await readStore();
  let task = findAssignTask(storeData, (row) => row.parentCorrelationId === queued.correlationId);
  if (!task) {
    const created = await addTask({
      title: parsed.title,
      nextAction: 'Researchy researching',
      status: 'doing',
      createdBy: who,
      ownerAgentId: RESEARCHY_ID,
      parentThreadId: queued.thread && queued.thread.id,
      parentCorrelationId: queued.correlationId,
      assignStatus: 'assigned',
      brief: parsed.brief,
    });
    if (created.error) return created;
    task = created.task;
  }

  if (!queued.replay) {
    await ceo.appendCeoNotice({
      threadId: queued.thread.id,
      text: `${ACK_PREFIX} Child task ${task.id}. Researchy is on the brief. Specialist done is not task done until I synthesize.`,
      provenance: 'tool',
      markAnsweredFor: queued.correlationId,
    });
  }

  let desk = await desks.talkToDesk({
    agentId: RESEARCHY_ID,
    text: `Assigned from LAVAALL CEO. Task ${task.id}.\n${parsed.brief}`,
    founderEmail: who,
    threadId: task.childThreadId || undefined,
    source: 'ceo-assign',
    correlationId: task.childCorrelationId || undefined,
  });
  if (desk && !desk.error && desk.waiting && desk.thread && desk.correlationId && xaiConfigured()) {
    desk = await desks.completeXaiDeskReply({
      agentId: RESEARCHY_ID,
      threadId: desk.thread.id,
      correlationId: desk.correlationId,
      maxTokens: 280,
      timeoutMs: 5500,
    });
  }
  if (desk.error) {
    return {
      ok: true,
      assigned: true,
      assignee: RESEARCHY_ID,
      task,
      thread: queued.thread,
      deskError: desk.error,
      waiting: false,
      correlationId: queued.correlationId,
    };
  }

  const patch = {
    childThreadId: desk.thread && desk.thread.id,
    childCorrelationId: desk.correlationId,
    nextAction: desk.waiting ? 'Waiting on Researchy' : 'CEO synthesize',
  };
  if (!desk.waiting && desk.reply) {
    patch.result = desk.reply;
    patch.assignStatus = 'specialist_done';
    patch.status = 'doing';
  }
  const updated = await updateTask(task.id, patch);
  task = (updated && updated.task) || task;

  const latest = await ceo.getFounderThread(who);
  const lastCeo = lastByRole(latest.thread, 'ceo');
  return {
    ok: true,
    assigned: true,
    assignee: RESEARCHY_ID,
    task,
    thread: latest.thread || queued.thread,
    deskThread: desk.thread,
    deskReply: desk.reply,
    waiting: false,
    usedModel: desk.usedModel,
    provider: desk.provider,
    correlationId: queued.correlationId,
    childCorrelationId: desk.correlationId,
    reply: (lastCeo && lastCeo.text) || `${ACK_PREFIX}`,
  };
}

async function noteDeskProgress({ agentId, threadId, correlationId, resultText, waiting }) {
  const desk = desks.normalizeAgentId(agentId);
  if (desk !== RESEARCHY_ID) return { ok: true, skipped: true };
  const storeData = await readStore();
  const childId = clean(threadId, 40);
  const corr = clean(correlationId, 40);
  const task = findAssignTask(storeData, (row) => (
    row.ownerAgentId === RESEARCHY_ID
    && (
      (corr && row.childCorrelationId === corr)
      || (childId && row.childThreadId === childId && (row.assignStatus === 'assigned' || row.assignStatus === 'specialist_done'))
    )
  ));
  if (!task) return { ok: true, skipped: true };
  if (task.assignStatus === 'synthesized' || task.assignStatus === 'synthesizing') {
    return { ok: true, task };
  }
  if (waiting || !resultText) return { ok: true, task };
  return updateTask(task.id, {
    result: resultText,
    assignStatus: 'specialist_done',
    nextAction: 'CEO synthesize',
    status: 'doing',
  });
}

async function onDeskThreadPoll({ agentId, founderEmail }) {
  const desk = desks.normalizeAgentId(agentId);
  const who = normalizeEmail(founderEmail);
  if (desk !== RESEARCHY_ID || !who) {
    const loaded = desk && who ? await desks.getFounderDeskThread(desk, who) : { thread: null };
    return { ok: true, skipped: true, thread: loaded.thread };
  }
  const threadId = desks.threadIdFor(desk, who);
  const storeData = await readStore();
  const task = findAssignTask(storeData, (row) => (
    row.ownerAgentId === RESEARCHY_ID
    && row.createdBy === who
    && (row.assignStatus === 'assigned' || row.assignStatus === 'specialist_done')
    && (row.childThreadId === threadId || !row.childThreadId)
  ));
  const inspected = await desks.inspectDeskThread(desk, threadId);
  const full = inspected.thread;
  const founder = lastByRole(full, 'founder');
  const assignedWork = Boolean(founder && /Assigned from LAVAALL CEO/i.test(founder.text));
  if (!task && !assignedWork) {
    const loaded = await desks.getFounderDeskThread(desk, who);
    return { ok: true, skipped: true, thread: loaded.thread };
  }
  if (desks.threadIsWaiting(full) && founder && xaiConfigured()) {
    await desks.completeXaiDeskReply({
      agentId: desk,
      threadId,
      correlationId: founder.correlationId,
      maxTokens: 280,
      timeoutMs: 5500,
    });
  }
  const again = await desks.inspectDeskThread(desk, threadId);
  const assistant = lastByRole(again.thread, 'assistant');
  await noteDeskProgress({
    agentId: desk,
    threadId,
    correlationId: (task && task.childCorrelationId) || (founder && founder.correlationId),
    resultText: assistant ? assistant.text : '',
    waiting: desks.threadIsWaiting(again.thread),
  });
  return {
    ok: true,
    thread: desks.publicThread(again.thread || full),
  };
}

async function synthesizeOpenAssigns({ founderEmail }) {
  const who = normalizeEmail(founderEmail);
  if (!who || !isAllowlisted(who)) return { ok: true, synthesized: 0 };
  const storeData = await readStore();
  const open = (storeData.tasks || []).filter((row) => (
    row.createdBy === who
    && row.ownerAgentId === RESEARCHY_ID
    && (row.assignStatus === 'assigned' || row.assignStatus === 'specialist_done')
  ));
  let synthesized = 0;
  for (const task of open) {
    let current = task;
    if (current.assignStatus === 'assigned' && current.childThreadId) {
      const inspected = await desks.inspectDeskThread(RESEARCHY_ID, current.childThreadId);
      const assistant = lastByRole(inspected.thread, 'assistant');
      if (assistant && assistant.text) {
        const pulled = await updateTask(current.id, {
          result: assistant.text,
          assignStatus: 'specialist_done',
          nextAction: 'CEO synthesize',
          status: 'doing',
        });
        current = (pulled && pulled.task) || current;
      }
    }
    if (current.assignStatus !== 'specialist_done' || !current.result) continue;
    if (!xaiConfigured()) continue;
    await updateTask(current.id, { assignStatus: 'synthesizing' });
    try {
      const context = await loadTrustedContext();
      const result = await completeXai({
        system: synthesisSystem(context),
        messages: [{
          role: 'user',
          content: `Founder brief:\n${current.brief}\n\nResearchy result:\n${current.result}\n\nWrite the CEO synthesis. Not a raw dump.`,
        }],
        maxTokens: 500,
      });
      if (result.error || !result.text) {
        await updateTask(current.id, { assignStatus: 'specialist_done' });
        continue;
      }
      const threadId = current.parentThreadId || ceo.threadIdFor(who);
      await ceo.appendCeoNotice({
        threadId,
        text: result.text,
        provenance: 'xai_runtime',
      });
      await updateTask(current.id, {
        assignStatus: 'synthesized',
        synthesis: result.text,
        nextAction: 'Founder review',
        status: 'doing',
      });
      synthesized += 1;
      break;
    } catch {
      await updateTask(current.id, { assignStatus: 'specialist_done' });
    }
  }
  return { ok: true, synthesized };
}

function sendJson(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  return json(res, status, body);
}

function founderGuard(req) {
  if (looksLikeAgentRequest(req)) return { status: 403, error: 'agent_denied' };
  const session = readSession(req);
  if (session) return { session };
  const claimed = peekSessionEmail(req) || normalizeEmail(header(req, 'x-ops-email') || '');
  if (claimed && !isAllowlisted(claimed)) return { status: 403, error: 'forbidden' };
  return { status: 403, error: 'forbidden' };
}

function csrfFrom(req, body) {
  return (body && body.csrf)
    || header(req, 'x-csrf-token')
    || header(req, 'x-csrf');
}

function firstQuery(req, key) {
  const query = queryOf(req);
  const value = query[key];
  return Array.isArray(value) ? value[0] : value;
}

function hayOf(req) {
  const area = String(firstQuery(req, 'area') || '');
  const pathOnly = String(req.url || '').split('?')[0].replace(/\/+$/, '');
  return `${area} ${pathOnly}`.toLowerCase();
}

function ceoAssignKind(req) {
  const hay = hayOf(req);
  if (!hay.includes('ceo-assign')) return '';
  if (hay.includes('message')) return 'message';
  return '';
}

function isCeoBridgeMessage(req) {
  const hay = hayOf(req);
  return hay.includes('ceo-bridge/message');
}

function isCeoBridgeThread(req) {
  const hay = hayOf(req);
  return hay.includes('ceo-bridge/thread');
}

function writeStatus(error) {
  switch (error) {
    case 'forbidden':
    case 'agent_denied':
    case 'csrf':
    case 'invalid_csrf':
      return 403;
    case 'ceo_thread_not_found':
      return 404;
    case 'store_unavailable':
      return 503;
    case 'invalid_message':
    case 'invalid_assignee':
    case 'method_not_allowed':
      return error === 'method_not_allowed' ? 405 : 400;
    default: {
      const _never = error;
      void _never;
      return 400;
    }
  }
}

function errorMessage(error) {
  switch (error) {
    case 'store_unavailable':
      return 'The assign store is unavailable. Check Vercel KV (KV_REST_API_URL + KV_REST_API_TOKEN).';
    case 'forbidden':
    case 'agent_denied':
      return 'That request is not allowed.';
    case 'csrf':
    case 'invalid_csrf':
      return 'Refresh was rejected. Reload Chat and try again.';
    case 'invalid_message':
      return 'Enter a research brief to assign.';
    case 'invalid_assignee':
      return 'This slice assigns Researchy only.';
    case 'ceo_thread_not_found':
      return 'That CEO thread was not found.';
    default:
      return 'Could not assign that work.';
  }
}

function sendAssignError(req, res, error) {
  const status = writeStatus(error);
  if (wantsJson(req)) return sendJson(res, status, { error, message: errorMessage(error) });
  if (error === 'store_unavailable' || error === 'invalid_message' || error === 'csrf' || error === 'invalid_csrf') {
    return redirect(res, '/ops/chat/lavaall-ceo');
  }
  return sendJson(res, status, { error, message: errorMessage(error) });
}

async function handleAssignMessage(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });
  const access = founderGuard(req);
  if (!access.session) return sendJson(res, access.status, { error: access.error });
  if (payloadTooLarge(req)) return sendJson(res, 413, { error: 'payload_too_large' });
  const body = readBody(req);
  if (!readCsrfToken(csrfFrom(req, body), access.session.email)) {
    return sendAssignError(req, res, 'csrf');
  }
  const result = await assignToResearchy({
    text: body.text || body.message || body.brief,
    founderEmail: access.session.email,
    threadId: body.threadId || body.id,
    source: body.source || 'ceo-assign',
    correlationId: body.correlationId,
    assign: body.assign,
    assignee: body.assignee,
    ownerAgentId: body.ownerAgentId,
  });
  if (result.error) return sendAssignError(req, res, result.error);
  if (wantsJson(req)) {
    return sendJson(res, 200, Object.assign({ ok: true }, result, {
      csrf: createCsrfToken(access.session.email),
      waiting: false,
      waitingCopy: ceo.WAITING_COPY,
      agentId: 'lavaall-ceo',
      agentName: 'LAVAALL CEO',
    }));
  }
  return redirect(res, '/ops/chat/lavaall-ceo');
}

async function handleCeoAssign(req, res) {
  const kind = ceoAssignKind(req);
  const body = req.method === 'POST' ? readBody(req) : {};
  if (!kind && isCeoBridgeThread(req) && (req.method === 'GET' || req.method === 'HEAD')) {
    const access = founderGuard(req);
    if (access.session) await synthesizeOpenAssigns({ founderEmail: access.session.email });
    return false;
  }
  const viaBridge = !kind && isCeoBridgeMessage(req) && !ceo.isExplicitWake(body) && looksLikeAssign(body);
  if (!kind && !viaBridge) return false;
  switch (kind || 'message') {
    case 'message':
      await handleAssignMessage(req, res);
      return true;
    default: {
      const _never = kind;
      void _never;
      return false;
    }
  }
}

Object.assign(module.exports, {
  ACK_PREFIX,
  RESEARCHY_ID,
  assignToResearchy,
  ceoAssignKind,
  handleCeoAssign,
  looksLikeAssign,
  noteDeskProgress,
  onDeskThreadPoll,
  parseAssignBrief,
  synthesizeOpenAssigns,
});
