// Read-only CEO → desk queries. Stored on lavaall-ops-v2 as ceoDeskQueries.
// Researchy assign keys stay researchyPending. These items are not tasks.
// Bridge helpers are required lazily: _ceo_bridge calls this module from talkToCeo.

const {
  header,
  json,
  looksLikeAgentRequest,
  payloadTooLarge,
  queryOf,
  readBody,
  readCsrfToken,
} = require('./_lib');
const { readLiveSession } = require('./_signin_hardening');
const {
  enqueueCeoDeskQuery,
  listCeoDeskQueries,
  patchCeoDeskQuery,
  readStore,
} = require('./_store');
const { presentQueuedForAgent } = require('./_untrusted');
const { loadOfficeTrustedBundle } = require('./_office_context');
const {
  EXPIRE_MS,
  activeRoutingEnabled,
  answerCopy,
  deskLabel,
  expireCopy,
  researchyRoutingEnabled,
  routeCeoQuery,
  timeoutCopy,
  timeoutMs,
} = require('./_ceo_route');

const DESK_IDS = Object.freeze(['growth', 'technical', 'sales', 'researchy']);

function clean(value, max) {
  return typeof value === 'string' ? value.trim().replace(/[<>]/g, '').slice(0, max) : '';
}

function sendJson(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  return json(res, status, body);
}

function firstQuery(req, key) {
  const query = queryOf(req);
  const value = query[key];
  return Array.isArray(value) ? value[0] : value;
}

function statusFor(error) {
  switch (error) {
    case 'unauthorized':
      return 401;
    case 'forbidden':
    case 'csrf':
    case 'agent_denied':
      return 403;
    case 'pending_not_found':
      return 404;
    case 'query_expired':
      return 409;
    case 'store_unavailable':
      return 503;
    case 'method_not_allowed':
      return 405;
    case 'invalid_message':
      return 400;
    default: {
      const _never = error;
      void _never;
      return 400;
    }
  }
}

function noticeId(prefix, correlationId) {
  return `${prefix}${correlationId}`.slice(0, 40);
}

function lastCeoText(thread) {
  const messages = thread && Array.isArray(thread.messages) ? thread.messages : [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i] && messages[i].role === 'ceo') return messages[i].text;
  }
  return '';
}

function agentQueryView(item) {
  const wrapped = presentQueuedForAgent({
    text: item.question,
    source: 'ceo-query',
    sender: 'lavaall-ceo',
    founderAuthenticated: false,
  });
  return {
    kind: 'ceo-query',
    correlationId: item.correlationId,
    ceoThreadId: item.ceoThreadId,
    desk: item.desk,
    question: item.question,
    mayAct: false,
    instruction: 'data-only-query',
    createdAt: item.createdAt,
    status: item.status,
    untrusted: true,
    untrustedText: wrapped.text,
  };
}

function ceoQueryRoute(req) {
  const area = String(firstQuery(req, 'area') || '');
  const pathOnly = String((req && req.url) || '').split('?')[0].replace(/\/+$/, '');
  const hay = `${area} ${pathOnly}`.toLowerCase();
  const match = hay.match(/desk-talk\/(growth|technical|sales|researchy)\/ceo-(query|answer)(?:$|[^a-z0-9-])/);
  if (match) {
    return { kind: match[2] === 'query' ? 'list' : 'answer', desk: match[1] };
  }
  if (/(?:^|\s|\/)ceo-bridge\/desk-query(?:$|[^a-z0-9-])/.test(hay)) {
    return { kind: 'list', desk: clean(firstQuery(req, 'desk'), 40).toLowerCase() };
  }
  if (/(?:^|\s|\/)ceo-bridge\/desk-answer(?:$|[^a-z0-9-])/.test(hay)) {
    return { kind: 'answer', desk: clean(firstQuery(req, 'desk'), 40).toLowerCase() };
  }
  return null;
}

async function sweepCeoDeskQueries(now) {
  const at = Number.isFinite(now) ? now : Date.now();
  const ceo = require('./_ceo_bridge');
  let storeData;
  try {
    storeData = await readStore();
  } catch {
    return { error: 'store_unavailable' };
  }
  const rows = listCeoDeskQueries(storeData);
  for (const row of rows) {
    if (!row || row.status !== 'open') continue;
    const age = at - row.createdAt;
    const label = deskLabel(row.desk);
    if (age >= EXPIRE_MS) {
      if (!row.expiredNotified) {
        const notice = await ceo.appendCeoNotice({
          threadId: row.ceoThreadId,
          text: expireCopy(label),
          provenance: 'system',
          correlationId: noticeId('e', row.correlationId),
        });
        if (notice && notice.error) continue;
      }
      await patchCeoDeskQuery(row.correlationId, { status: 'expired', expiredNotified: true });
      continue;
    }
    if (age >= timeoutMs() && !row.timeoutNotified) {
      const notice = await ceo.appendCeoNotice({
        threadId: row.ceoThreadId,
        text: timeoutCopy(label),
        provenance: 'system',
        correlationId: noticeId('w', row.correlationId),
      });
      if (notice && notice.error) continue;
      await patchCeoDeskQuery(row.correlationId, { timeoutNotified: true });
    }
  }
  return { ok: true };
}

async function completeRoutedCeoReply({ threadId, correlationId, text }) {
  if (!activeRoutingEnabled()) return null;
  const body = String(text || '');
  let records = null;
  try {
    records = await loadOfficeTrustedBundle();
  } catch {
    records = null;
  }
  const decision = routeCeoQuery(body, records);
  if (decision.decision !== 'route' && decision.decision !== 'offer') return null;
  const ceo = require('./_ceo_bridge');
  const claim = await ceo.claimResponseOwner({
    threadId,
    correlationId,
    owner: 'xai_runtime',
  });
  if (!claim || claim.error) return null;
  if (!claim.claimed) {
    return {
      ok: true,
      replay: true,
      waiting: ceo.threadIsWaiting(claim.thread),
      usedModel: false,
      provider: '',
      reply: lastCeoText(claim.thread) || ceo.WAITING_COPY,
      thread: ceo.publicThread(claim.thread),
      pending: null,
      correlationId,
      routed: decision.decision,
      desk: decision.desk,
    };
  }
  if (decision.decision === 'route') {
    const enqueued = await enqueueCeoDeskQuery({
      correlationId,
      ceoThreadId: threadId,
      desk: decision.desk,
      question: body,
    });
    if (!enqueued || enqueued.error) {
      await ceo.releaseResponseOwner({ threadId, correlationId, owner: 'xai_runtime' });
      return null;
    }
  }
  const replied = await ceo.appendOwnedCeoReply({
    threadId,
    correlationId,
    owner: 'xai_runtime',
    text: decision.reply,
  });
  if (!replied || replied.error) {
    await ceo.releaseResponseOwner({ threadId, correlationId, owner: 'xai_runtime' });
    return null;
  }
  return Object.assign({}, replied, {
    usedModel: false,
    provider: '',
    routed: decision.decision,
    desk: decision.desk,
  });
}

async function postDeskAnswer({ correlationId, text, desk, threadId, founderEmail }) {
  const id = clean(correlationId, 40);
  const body = clean(text, 1700);
  if (!id) return { error: 'pending_not_found' };
  if (!body) return { error: 'invalid_message' };
  const storeData = await readStore();
  const query = listCeoDeskQueries(storeData).find((row) => row.correlationId === id);
  if (!query) return { error: 'pending_not_found' };
  if (desk && query.desk !== desk) return { error: 'forbidden' };
  const requestedThread = clean(threadId, 40);
  if (requestedThread && requestedThread !== query.ceoThreadId) return { error: 'forbidden' };
  if (query.status === 'expired') return { error: 'query_expired' };
  const ceo = require('./_ceo_bridge');
  if (founderEmail) {
    const loaded = await ceo.inspectCeoThread(query.ceoThreadId);
    const owner = loaded && loaded.thread && loaded.thread.founderEmail;
    if (owner && owner !== founderEmail) return { error: 'forbidden' };
  }
  const label = deskLabel(query.desk);
  const message = answerCopy(label, body);
  if (query.status === 'answered') {
    const loaded = await ceo.inspectCeoThread(query.ceoThreadId);
    return {
      ok: true,
      replay: true,
      query,
      thread: ceo.publicThread(loaded && loaded.thread),
      reply: message,
    };
  }
  const notice = await ceo.appendCeoNotice({
    threadId: query.ceoThreadId,
    text: message,
    provenance: 'desk_answer',
    correlationId: noticeId('a', query.correlationId),
  });
  if (!notice || notice.error) return notice || { error: 'store_unavailable' };
  const patched = await patchCeoDeskQuery(query.correlationId, {
    status: 'answered',
    answeredAt: Date.now(),
  });
  if (patched && patched.error) return patched;
  return {
    ok: true,
    replay: Boolean(notice.replay),
    query: (patched && patched.query) || query,
    thread: notice.thread,
    reply: message,
  };
}

async function authorizeAnswer(req, body) {
  const ceo = require('./_ceo_bridge');
  const secret = ceo.verifyBridgeSecret(req);
  if (secret && !secret.error) return { ok: true, via: 'bridge' };
  if (looksLikeAgentRequest(req)) return { error: 'unauthorized' };
  const session = await readLiveSession(req);
  if (!session) return { error: 'unauthorized' };
  const csrf = (body && body.csrf) || header(req, 'x-csrf-token') || header(req, 'x-csrf');
  if (!readCsrfToken(csrf, session.email)) return { error: 'csrf' };
  return { ok: true, via: 'founder', email: session.email };
}

async function handleList(req, res, desk) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendJson(res, 405, { error: 'method_not_allowed' });
  }
  const ceo = require('./_ceo_bridge');
  const auth = ceo.verifyBridgeSecret(req);
  if (!auth || auth.error) return sendJson(res, 401, { error: 'unauthorized' });
  if (desk && !DESK_IDS.includes(desk)) return sendJson(res, 400, { error: 'invalid_message' });
  await sweepCeoDeskQueries();
  const storeData = await readStore();
  const queries = listCeoDeskQueries(storeData, desk)
    .filter((row) => row.status === 'open')
    .map(agentQueryView);
  return sendJson(res, 200, { ok: true, queries });
}

async function handleAnswer(req, res, desk) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });
  if (payloadTooLarge(req)) return sendJson(res, 413, { error: 'payload_too_large' });
  const body = readBody(req);
  const auth = await authorizeAnswer(req, body);
  if (auth.error) return sendJson(res, statusFor(auth.error), { error: auth.error });
  const requestedDesk = clean(desk || body.desk, 40).toLowerCase();
  const result = await postDeskAnswer({
    correlationId: body.correlationId || body.pendingId || body.messageId,
    text: body.text || body.message || body.reply || body.answer,
    desk: requestedDesk,
    threadId: body.threadId || body.ceoThreadId,
    founderEmail: auth.via === 'founder' ? auth.email : '',
  });
  if (result.error) return sendJson(res, statusFor(result.error), { error: result.error });
  return sendJson(res, 200, {
    ok: true,
    replay: Boolean(result.replay),
    query: result.query ? agentQueryView(result.query) : null,
    thread: result.thread,
    reply: result.reply,
  });
}

async function handleCeoQueryRoute(req, res) {
  const route = ceoQueryRoute(req);
  if (!route) return false;
  if (route.kind === 'list') {
    await handleList(req, res, route.desk);
    return true;
  }
  if (route.kind === 'answer') {
    await handleAnswer(req, res, route.desk);
    return true;
  }
  return false;
}

module.exports = {
  activeRoutingEnabled,
  agentQueryView,
  authorizeAnswer,
  ceoQueryRoute,
  completeRoutedCeoReply,
  handleCeoQueryRoute,
  postDeskAnswer,
  researchyRoutingEnabled,
  sweepCeoDeskQueries,
};
