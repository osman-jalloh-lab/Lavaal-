// CEO Assign → Researchy child + Grok Bot wake.
// KV tasks in _store.js are the SoT. Default wake is the Researchy pending
// inbox (same secret as CEO B2). In-OS xAI is optional fallback only.
// Specialist done ≠ task done until CEO synthesizes / founder OK.
// Underscore prefix: not a Vercel function. No npm. L3: no outbound email.

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
const {
  addTask,
  enqueueResearchyPending,
  listResearchyPending,
  nextAssignSeq,
  notesSelectableForChat,
  readStore,
  takeResearchyPending,
  unfinishedTasks,
  updateTask,
} = require('./_store');
const { completeXai, xaiConfigured } = require('./_xai');
const { classify } = require('../slack/_router/classify');
const { postAssignWake } = require('../slack/_router/bridge');
const ceo = require('./_ceo_bridge');
const desks = require('./_agent_thread');

const RESEARCHY_ID = 'researchy';
const ACK_PREFIX = 'Assigned to Researchy.';
const LAVAALL_ASSIGN_CONTEXT = [
  'Locked LAVAALL company context (do not re-ask):',
  '- West Africa IT sourcing marketplace.',
  '- Markets: Sierra Leone, Guinea, Guinea-Bissau, Liberia.',
  '- Quote-first. Never invent prices, SKUs, suppliers, or landed costs.',
  '- Category → brand → family → model → variant, then Request Quote.',
].join('\n');

function clean(value, max) {
  return typeof value === 'string' ? value.trim().replace(/[<>]/g, '').slice(0, max) : '';
}

function looksLikeExplicitAssignText(input) {
  const text = String((input && (input.text || input.message || input.brief)) || '');
  if (/^\/assign\b/i.test(text)) return true;
  if (/\bassign(?:\s+this)?\s+to\s+researchy\b/i.test(text)) return true;
  if (/\bassign\s+researchy\b/i.test(text)) return true;
  return false;
}

function looksLikeAssignControl(input) {
  if (!input) return false;
  if (input.assign === true || input.assign === '1' || input.assign === 'researchy') return true;
  const assignee = String(input.assignee || input.ownerAgentId || '').toLowerCase();
  return assignee === 'researchy';
}

function looksLikeAssign(input) {
  if (!input) return false;
  return looksLikeAssignControl(input) || looksLikeExplicitAssignText(input);
}

function specialistSuggest(route) {
  const area = route && route.area;
  const lead = route && route.leadAgent;
  if (area === 'growth' || lead === 'growth') return 'growth';
  if (area === 'sales' || lead === 'sales') return 'sales';
  if (area === 'technical' || lead === 'technical') return 'technical';
  return '';
}

function routeCeoSend(input) {
  if (looksLikeExplicitAssignText(input)) {
    return {
      action: 'assign-researchy',
      reason: 'explicit',
      specialist: RESEARCHY_ID,
      suggest: '',
    };
  }
  const text = String((input && (input.text || input.message || input.brief)) || '').trim();
  const route = classify({ text, source: 'ops_ceo_send' });
  const verb = route && route.verb;
  const area = route && route.area;
  if ((verb === 'research' || verb === 'source') && (!area || area === 'ceo')) {
    return {
      action: 'assign-researchy',
      reason: 'route',
      specialist: RESEARCHY_ID,
      suggest: '',
      route,
    };
  }
  return {
    action: 'ceo',
    reason: 'answer',
    specialist: '',
    suggest: specialistSuggest(route),
    route,
  };
}

const TOPIC_MAX = 6;

const TOPIC_LEAD_FILLERS = [
  { re: /^(please\s+)+/i, intent: false },
  { re: /^(can|could|would|will)\s+you\s+(please\s+)?/i, intent: false },
  { re: /^(i|we)\s+(need|want|would like)(\s+you\s+to)?\s+/i, intent: false },
  { re: /^(help|ask)\s+me\s+(to\s+)?/i, intent: false },
  { re: /^(go\s+)+look(?:ing)?\s+for\s+/i, intent: true },
  { re: /^look(?:ing)?\s+for\s+/i, intent: true },
  { re: /^(go\s+)+find\s+/i, intent: true },
  { re: /^(go\s+)+/i, intent: false },
  { re: /^(just\s+)+/i, intent: false },
  { re: /^try\s+to\s+/i, intent: false },
];

const TOPIC_INTENT_LEAD = /^(source|sources|sourcing|find|finding|research|search|searching|locate|get|getting)\s+/i;

const TOPIC_STOP = new Set([
  'please', 'go', 'look', 'looking', 'for', 'the', 'a', 'an', 'some', 'any',
  'our', 'your', 'their', 'this', 'that', 'those', 'these', 'to', 'of', 'in',
  'on', 'at', 'with', 'from', 'about', 'and', 'or', 'now', 'then', 'also',
  'just', 'can', 'you', 'we', 'i', 'me', 'us', 'my', 'it', 'its', 'as', 'is',
  'are', 'be', 'do', 'did', 'does', 'very', 'everything', 'brief', 'need',
  'want', 'help', 'try', 'quotes', 'quote', 'request', 'requests', 'enterprise',
  'wholesale', 'into', 'onto', 'toward', 'towards', 'across', 'among', 'via',
  'per',
]);

const TOPIC_NOUN_TAIL = /^(products?|docks?|hubs?|suppliers?|laptops?|computers?|monitors?|cables?|sourcing|research)$/i;

function topicWords(text) {
  let work = String(text || '')
    .replace(/^\/assign\b[:\s-]*/i, '')
    .replace(/^assign(?:\s+this)?\s+to\s+researchy\b[:\s-]*/i, '')
    .replace(/^assign\s+researchy\b[:\s-]*/i, '')
    .trim();

  let hadIntent = false;
  for (let i = 0; i < 8; i += 1) {
    let hit = false;
    for (const row of TOPIC_LEAD_FILLERS) {
      if (!row.re.test(work)) continue;
      work = work.replace(row.re, '').trim();
      if (row.intent) hadIntent = true;
      hit = true;
      break;
    }
    if (!hit) break;
  }

  const intentMatch = work.match(TOPIC_INTENT_LEAD);
  if (intentMatch) {
    hadIntent = true;
    work = work.slice(intentMatch[0].length).trim();
  }

  const tokens = work
    .replace(/[^A-Za-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  let kept = tokens.filter((word) => !TOPIC_STOP.has(word.toLowerCase()));
  if (!kept.length) {
    kept = tokens.filter((word) => word.toLowerCase() === 'wholesale');
  }
  if (!kept.length) return 'research';

  const nounAt = kept.findIndex((word) => TOPIC_NOUN_TAIL.test(word));
  if (nounAt >= 0) kept = kept.slice(0, nounAt + 1);
  kept = kept.slice(0, TOPIC_MAX);

  const hasNounTail = kept.some((word) => TOPIC_NOUN_TAIL.test(word));
  if (hadIntent && !hasNounTail && kept.length < TOPIC_MAX) {
    kept.push('sourcing');
  }
  return kept.slice(0, TOPIC_MAX).join(' ') || 'research';
}

function parseAssignBrief(text) {
  const raw = typeof text === 'string' ? text.trim() : '';
  const stripped = raw
    .replace(/^\/assign\b[:\s-]*/i, '')
    .replace(/^assign(?:\s+this)?\s+to\s+researchy\b[:\s-]*/i, '')
    .replace(/^assign\s+researchy\b[:\s-]*/i, '')
    .trim();
  const brief = stripped || raw;
  const topic = topicWords(brief);
  return { brief, topic, title: topic };
}

function formatAssignTitle(n, topic) {
  const seq = Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
  const short = topicWords(topic);
  return `Assign ${seq} — ${short}`.slice(0, 160);
}

function packAssignBrief(founderAsk, context) {
  const ask = clean(founderAsk, 1600) || 'Research request.';
  return [
    `Founder ask:\n${ask}`,
    LAVAALL_ASSIGN_CONTEXT,
    formatTrustedContext(context),
    'Return findings bullets only, then one recommend. No methodology, logs, or tool traces.',
  ].join('\n\n');
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

function isNoiseLine(line) {
  return /^(i will|let me|as an ai|methodology|i searched|step \d|here is my (plan|approach)|ok researchy|waiting on)/i.test(line)
    || /\/ops|xai|anthropic|openai|grok bot|stack trace|console\./i.test(line);
}

function formatResultsForFounder(text) {
  const raw = clean(text, 4000);
  if (!raw) {
    return 'Found:\n- No findings yet.\n\nBased on that, recommend we wait for Researchy. (awaiting your OK)';
  }
  if (/^found:/i.test(raw) && /based on that, recommend/i.test(raw)) {
    return raw.replace(/\s+$/, '') + (/\(awaiting your OK\)/i.test(raw) ? '' : ' (awaiting your OK)');
  }
  const lines = raw.split(/\n+/).map((line) => line.replace(/^[-*•]\s*/, '').trim()).filter((line) => line && !isNoiseLine(line));
  const bullets = (lines.length ? lines : [raw]).slice(0, 8).map((line) => `- ${line.slice(0, 220)}`);
  const recommend = (lines[lines.length - 1] || 'review these findings').slice(0, 180);
  return `Found:\n${bullets.join('\n')}\n\nBased on that, recommend ${recommend}. (awaiting your OK)`;
}

function assignXaiFallbackEnabled() {
  return String(process.env.OPS_ASSIGN_XAI_FALLBACK || '') === '1';
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
    'Write results only: Found bullets, then “Based on that, recommend … (awaiting your OK)”.',
    'Do not dump methodology, logs, or the specialist reply verbatim.',
    'Researchy-first. Do not involve Technical unless the founder asked for validation.',
    'Never mention /ops, Talk bridges, helpers, Anthropic, OpenAI, or xAI.',
    formatTrustedContext(context),
  ].join('\n');
}

function findAssignTask(storeData, pred) {
  return ((storeData && storeData.tasks) || []).find(pred) || null;
}

function uniqueIds(...values) {
  const ids = [];
  for (const value of values) {
    const id = clean(value, 40);
    if (id && ids.indexOf(id) === -1) ids.push(id);
  }
  return ids;
}

// Strict Assign match: pending.taskId and/or childCorrelationId / pendingId /
// messageId / correlationId. Never desk childThreadId alone — multiple Assigns
// can share one Researchy thread.
function matchAssignTask(storeData, { pending, replayId, correlationId }) {
  const taskId = pending && pending.taskId;
  if (taskId) {
    const byTask = findAssignTask(storeData, (row) => row.id === taskId);
    if (byTask) return byTask;
  }
  const corrIds = uniqueIds(
    replayId,
    correlationId,
    pending && pending.correlationId,
    pending && pending.messageId,
  );
  if (!corrIds.length) return null;
  return findAssignTask(storeData, (row) => corrIds.indexOf(row.childCorrelationId) !== -1);
}

async function wakeResearchy({ task, packedBrief, founderEmail, childThreadId, childCorrelationId }) {
  const queued = await enqueueResearchyPending({
    threadId: childThreadId,
    founderEmail,
    taskId: task && task.id,
    messageId: childCorrelationId,
    correlationId: childCorrelationId,
    text: packedBrief,
    wakeReason: 'assign',
  });
  if (queued && queued.ok && queued.pending) {
    const pending = queued.pending;
    try {
      await postAssignWake({
        taskId: (task && task.id) || pending.taskId,
        pendingId: pending.messageId,
        correlationId: pending.correlationId,
        threadId: pending.threadId || childThreadId,
        title: (task && task.title) || '',
        brief: packedBrief,
      });
    } catch (err) {
      console.error('[assign] researchy slack wake threw', {
        taskId: task && task.id ? task.id : null,
      });
      void err;
    }
  }
  return queued;
}

async function assignToResearchy(input) {
  const who = normalizeEmail(input && input.founderEmail);
  if (!who || !isAllowlisted(who)) return { error: 'forbidden' };
  const assignee = assigneeOf(input);
  if (assignee !== RESEARCHY_ID) return { error: 'invalid_assignee' };
  const parsed = parseAssignBrief(input && (input.text || input.message || input.brief));
  if (!parsed.brief) return { error: 'invalid_message' };

  const seq = await nextAssignSeq();
  if (seq.error) return seq;
  const title = formatAssignTitle(seq.n, parsed.topic);
  const context = await loadTrustedContext();
  const packedBrief = packAssignBrief(parsed.brief, context);

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
      title,
      nextAction: 'Researchy working',
      status: 'doing',
      createdBy: who,
      ownerAgentId: RESEARCHY_ID,
      parentThreadId: queued.thread && queued.thread.id,
      parentCorrelationId: queued.correlationId,
      assignStatus: 'assigned',
      brief: packedBrief,
    });
    if (created.error) return created;
    task = created.task;
  }

  if (!queued.replay) {
    await ceo.appendCeoNotice({
      threadId: queued.thread.id,
      text: `${ACK_PREFIX} ${title}. Full brief is on the task. Waiting on Researchy Grok Bot.`,
      provenance: 'tool',
      markAnsweredFor: queued.correlationId,
    });
  }

  const desk = await desks.talkToDesk({
    agentId: RESEARCHY_ID,
    text: `Assigned from LAVAALL CEO. Task ${task.id}. ${title}\n${packedBrief}`,
    founderEmail: who,
    threadId: task.childThreadId || undefined,
    source: 'ceo-assign',
    correlationId: task.childCorrelationId || undefined,
    completeXai: false,
  });
  if (desk.error) {
    return {
      ok: true,
      assigned: true,
      assignee: RESEARCHY_ID,
      task,
      thread: queued.thread,
      deskError: desk.error,
      waiting: true,
      wake: 'researchy-pending',
      correlationId: queued.correlationId,
    };
  }

  let usedFallback = false;
  if (
    desk.waiting
    && assignXaiFallbackEnabled()
    && !ceo.bridgeSecretConfigured()
    && xaiConfigured()
    && desk.thread
    && desk.correlationId
  ) {
    const completed = await desks.completeXaiDeskReply({
      agentId: RESEARCHY_ID,
      threadId: desk.thread.id,
      correlationId: desk.correlationId,
      maxTokens: 280,
      timeoutMs: 5500,
    });
    usedFallback = !completed.error && completed.usedModel === true && !completed.waiting && Boolean(completed.reply);
    if (usedFallback) {
      Object.assign(desk, completed);
    }
  }

  const wake = usedFallback
    ? { ok: true, skipped: true }
    : await wakeResearchy({
      task,
      packedBrief,
      founderEmail: who,
      childThreadId: desk.thread && desk.thread.id,
      childCorrelationId: desk.correlationId,
    });

  const patch = {
    childThreadId: desk.thread && desk.thread.id,
    childCorrelationId: desk.correlationId,
    nextAction: usedFallback && desk.reply ? 'Ready for review' : 'Researchy working',
  };
  if (usedFallback && desk.reply) {
    const formatted = formatResultsForFounder(desk.reply);
    patch.result = formatted;
    patch.assignStatus = 'ready_for_review';
    patch.status = 'doing';
    await ceo.appendCeoNotice({
      threadId: queued.thread.id,
      text: formatted,
      provenance: 'tool',
    });
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
    deskReply: usedFallback ? desk.reply : '',
    waiting: !usedFallback,
    wake: usedFallback ? 'xai-fallback' : 'researchy-pending',
    usedModel: Boolean(usedFallback),
    provider: usedFallback ? 'xai' : '',
    correlationId: queued.correlationId,
    childCorrelationId: desk.correlationId,
    pending: wake && wake.pending ? wake.pending : null,
    reply: (lastCeo && lastCeo.text) || `${ACK_PREFIX} ${title}`,
  };
}

async function noteDeskProgress({ agentId, threadId, correlationId, resultText, waiting }) {
  const desk = desks.normalizeAgentId(agentId);
  if (desk !== RESEARCHY_ID) return { ok: true, skipped: true };
  void threadId;
  const storeData = await readStore();
  const corr = clean(correlationId, 40);
  if (!corr) return { ok: true, skipped: true };
  const task = matchAssignTask(storeData, { correlationId: corr });
  if (!task || task.ownerAgentId !== RESEARCHY_ID) return { ok: true, skipped: true };
  if (task.assignStatus === 'synthesized' || task.assignStatus === 'synthesizing' || task.assignStatus === 'ready_for_review') {
    return { ok: true, task };
  }
  if (waiting || !resultText) return { ok: true, task };
  const formatted = formatResultsForFounder(resultText);
  const updated = await updateTask(task.id, {
    result: formatted,
    assignStatus: 'ready_for_review',
    nextAction: 'Ready for review',
    status: 'doing',
  });
  if (task.parentThreadId) {
    await ceo.appendCeoNotice({
      threadId: task.parentThreadId,
      text: formatted,
      provenance: 'grok_bot_bridge',
    });
  }
  return updated;
}

async function onDeskThreadPoll({ agentId, founderEmail }) {
  const desk = desks.normalizeAgentId(agentId);
  const who = normalizeEmail(founderEmail);
  if (desk !== RESEARCHY_ID || !who) {
    const loaded = desk && who ? await desks.getFounderDeskThread(desk, who) : { thread: null };
    return { ok: true, skipped: true, thread: loaded.thread };
  }
  const loaded = await desks.getFounderDeskThread(desk, who);
  return { ok: true, skipped: true, thread: loaded.thread };
}

async function synthesizeOpenAssigns({ founderEmail }) {
  const who = normalizeEmail(founderEmail);
  if (!who || !isAllowlisted(who)) return { ok: true, synthesized: 0 };
  const storeData = await readStore();
  const open = (storeData.tasks || []).filter((row) => (
    row.createdBy === who
    && row.ownerAgentId === RESEARCHY_ID
    && row.assignStatus === 'specialist_done'
    && row.result
  ));
  let synthesized = 0;
  for (const task of open) {
    if (!xaiConfigured()) continue;
    await updateTask(task.id, { assignStatus: 'synthesizing' });
    try {
      const context = await loadTrustedContext();
      const result = await completeXai({
        system: synthesisSystem(context),
        messages: [{
          role: 'user',
          content: `Founder brief:\n${task.brief}\n\nResearchy result:\n${task.result}\n\nWrite Found / recommend only.`,
        }],
        maxTokens: 400,
      });
      if (result.error || !result.text) {
        await updateTask(task.id, { assignStatus: 'specialist_done' });
        continue;
      }
      const formatted = formatResultsForFounder(result.text);
      const threadId = task.parentThreadId || ceo.threadIdFor(who);
      await ceo.appendCeoNotice({
        threadId,
        text: formatted,
        provenance: 'xai_runtime',
      });
      await updateTask(task.id, {
        assignStatus: 'synthesized',
        synthesis: formatted,
        nextAction: 'Founder review',
        status: 'doing',
      });
      synthesized += 1;
      break;
    } catch {
      await updateTask(task.id, { assignStatus: 'specialist_done' });
    }
  }
  return { ok: true, synthesized };
}

async function listAssignPending() {
  try {
    const storeData = await readStore();
    return { ok: true, pending: listResearchyPending(storeData) };
  } catch {
    return { error: 'store_unavailable' };
  }
}

async function postResearchyReply({ threadId, text, pendingId, messageId, correlationId }) {
  const replayId = clean(pendingId, 40) || clean(messageId, 40) || clean(correlationId, 40);
  const body = clean(text, 4000);
  if (!body) return { error: 'invalid_message' };
  const taken = replayId ? await takeResearchyPending(replayId) : { pending: null };
  const storeData = await readStore();
  const pending = taken.pending || null;
  const task = matchAssignTask(storeData, { pending, replayId });
  if (task && (task.assignStatus === 'ready_for_review' || task.assignStatus === 'synthesized') && task.result) {
    return { ok: true, replay: true, task };
  }
  if (!task) return { error: 'assign_not_found' };
  const deskThreadId = clean(threadId, 40) || task.childThreadId;
  const corr = replayId || task.childCorrelationId;
  let desk = { replay: false };
  if (deskThreadId && corr) {
    desk = await desks.appendOwnedReply({
      agentId: RESEARCHY_ID,
      threadId: deskThreadId,
      correlationId: corr,
      owner: 'grok_bot_bridge',
      text: body,
    });
    if (desk.error && desk.error !== 'desk_thread_not_found') return desk;
  }
  if (desk.replay && task.result) return { ok: true, replay: true, task, thread: desk.thread };
  const formatted = formatResultsForFounder(body);
  const updated = await updateTask(task.id, {
    result: formatted,
    assignStatus: 'ready_for_review',
    nextAction: 'Ready for review',
    status: 'doing',
    childThreadId: deskThreadId || task.childThreadId,
    childCorrelationId: corr || task.childCorrelationId,
  });
  if (task.parentThreadId) {
    await ceo.appendCeoNotice({
      threadId: task.parentThreadId,
      text: formatted,
      provenance: 'grok_bot_bridge',
    });
  }
  return {
    ok: true,
    replay: false,
    task: (updated && updated.task) || task,
    thread: desk.thread,
  };
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

function researchyWakeKind(req) {
  const hay = hayOf(req);
  if (!hay.includes('desk-talk') || !hay.includes('researchy')) return '';
  if (hay.includes('/pending') || hay.endsWith('pending')) return 'pending';
  if (hay.includes('/reply') || hay.endsWith('reply')) return 'reply';
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
    case 'unauthorized':
      return 401;
    case 'forbidden':
    case 'agent_denied':
    case 'csrf':
    case 'invalid_csrf':
      return 403;
    case 'ceo_thread_not_found':
    case 'assign_not_found':
      return 404;
    case 'store_unavailable':
      return 503;
    case 'invalid_message':
    case 'invalid_assignee':
    case 'invalid_pending':
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
    case 'unauthorized':
      return 'Researchy bridge secret was rejected.';
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
    case 'assign_not_found':
      return 'That assign was not found.';
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
      waiting: result.waiting !== false,
      waitingCopy: ceo.WAITING_COPY,
      agentId: 'lavaall-ceo',
      agentName: 'LAVAALL CEO',
    }));
  }
  return redirect(res, '/ops/chat/lavaall-ceo');
}

async function handleResearchyPending(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'method_not_allowed' });
  const auth = ceo.verifyBridgeSecret(req);
  if (auth.error) return sendJson(res, 401, { error: 'unauthorized' });
  const result = await listAssignPending();
  if (result.error) return sendAssignError(req, res, result.error);
  return sendJson(res, 200, { ok: true, pending: result.pending, lead: RESEARCHY_ID });
}

async function handleResearchyReply(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });
  const auth = ceo.verifyBridgeSecret(req);
  if (auth.error) return sendJson(res, 401, { error: 'unauthorized' });
  if (payloadTooLarge(req)) return sendJson(res, 413, { error: 'payload_too_large' });
  const body = readBody(req);
  const result = await postResearchyReply({
    threadId: body.threadId || body.id,
    text: body.text || body.message || body.reply,
    pendingId: body.pendingId,
    messageId: body.messageId,
    correlationId: body.correlationId,
  });
  if (result.error) return sendAssignError(req, res, result.error);
  return sendJson(res, 200, {
    ok: true,
    replay: result.replay,
    task: result.task,
    lead: RESEARCHY_ID,
  });
}

async function handleCeoAssign(req, res) {
  const wakeKind = researchyWakeKind(req);
  if (wakeKind === 'pending') {
    await handleResearchyPending(req, res);
    return true;
  }
  if (wakeKind === 'reply') {
    await handleResearchyReply(req, res);
    return true;
  }
  const kind = ceoAssignKind(req);
  const body = req.method === 'POST' ? readBody(req) : {};
  if (!kind && isCeoBridgeThread(req) && (req.method === 'GET' || req.method === 'HEAD')) {
    const access = founderGuard(req);
    if (access.session) await synthesizeOpenAssigns({ founderEmail: access.session.email });
    return false;
  }
  const viaBridge = !kind && isCeoBridgeMessage(req) && !ceo.isExplicitWake(body)
    && routeCeoSend(body).action === 'assign-researchy';
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
  LAVAALL_ASSIGN_CONTEXT,
  RESEARCHY_ID,
  assignToResearchy,
  ceoAssignKind,
  formatAssignTitle,
  formatResultsForFounder,
  handleCeoAssign,
  looksLikeAssign,
  looksLikeExplicitAssignText,
  noteDeskProgress,
  routeCeoSend,
  onDeskThreadPoll,
  parseAssignBrief,
  postResearchyReply,
  researchyWakeKind,
  synthesizeOpenAssigns,
  topicWords,
});
