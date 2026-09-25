// Preview-only research quality gate. Calls Jev through Vercel AI Gateway HTTP.
// Manual route: POST /ops/api/jev/evaluate (founder session + CSRF).
// Automatic score: Researchy desk-talk reply only (see _assign.postResearchyReply).
// Talk chat and Assign enqueue do not call this. No npm.
// AI_GATEWAY_API_KEY never leaves the server and is never logged.
// VERCEL_ENV=production ignores JEV_RESEARCH_QUALITY_PREVIEW and does not call Jev.

const {
  header,
  isAllowlisted,
  json,
  looksLikeAgentRequest,
  noStore,
  normalizeEmail,
  peekSessionEmail,
  queryOf,
  readBody,
  readCsrfToken,
  readSession,
} = require('./_lib');

const EVALUATE_URL = 'https://ai-gateway.vercel.sh/v1/evaluate';
const JEV_MODEL = 'typesafe-ai/jev';
const ACCEPT_THRESHOLD = 0.75;
const MAX_QUALITY_REVISES = 2;
const MAX_STATE_CHARS = 4000;
const MIN_KEY_LENGTH = 16;
// Short on purpose: typed eval, not a chat completion. Stay under ops maxDuration 30.
const DEFAULT_TIMEOUT_MS = 8000;

function gatewayKey() {
  const value = process.env.AI_GATEWAY_API_KEY;
  return typeof value === 'string' ? value.trim() : '';
}

function jevConfigured() {
  return gatewayKey().length >= MIN_KEY_LENGTH;
}

function productionEnv() {
  return String(process.env.VERCEL_ENV || '').trim().toLowerCase() === 'production';
}

function previewFlagOn() {
  const flag = String(process.env.JEV_RESEARCH_QUALITY_PREVIEW || '').trim().toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'on';
}

// Automatic Researchy scoring. Production never enables this, even if the flag is set.
function researchQualityAutoEnabled() {
  if (productionEnv()) return false;
  if (!previewFlagOn()) return false;
  return jevConfigured();
}

function researchQualityQuestions() {
  return {
    accept_research: {
      type: 'boolean',
      instructions: 'Is this research result sourced enough to show the founder?',
      criteria: {
        true: 'The claims a founder would rely on cite identifiable sources (names, URLs, documents, or quotations). Prices and supplier counts, if present, are attributed to a source.',
        false: 'The result is unsourced or vague, or it includes invented prices or supplier counts. Weak sourcing is not enough to show the founder.',
      },
    },
    strength: {
      type: 'score',
      instructions: 'How strong is the sourcing behind this research result?',
      criteria: [
        'weak: unsourced, or invented prices or supplier counts',
        'thin: a source is only hinted at, and the claims that matter are not attributed',
        'adequate: the main claims cite a source the founder can check, with no invented prices or counts',
        'strong: specific citations for the claims, and no invented prices or supplier counts',
      ],
    },
    needs_technical: {
      type: 'boolean',
      instructions: 'Does this need Technical validation before founder OK?',
      criteria: {
        true: 'Specs, compatibility, firmware, or implementation claims need a Technical check before a founder OK.',
        false: 'A founder can judge this sourcing result without a Technical check.',
      },
    },
  };
}

function asText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function truncateResearchState(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const rawBrief = asText(source.brief);
  const rawResult = asText(source.result);
  let brief = rawBrief;
  let result = rawResult;
  if (brief.length + result.length > MAX_STATE_CHARS) {
    if (!brief) {
      result = result.slice(0, MAX_STATE_CHARS);
    } else if (!result) {
      brief = brief.slice(0, MAX_STATE_CHARS);
    } else {
      const briefBudget = Math.min(brief.length, Math.floor(MAX_STATE_CHARS * 0.25));
      brief = brief.slice(0, briefBudget);
      result = result.slice(0, MAX_STATE_CHARS - brief.length);
    }
  }
  const state = {};
  if (brief) state.brief = brief;
  if (result) state.result = result;
  return {
    state,
    truncated: rawBrief.length + rawResult.length > brief.length + result.length,
    chars: brief.length + result.length,
  };
}

function answerProbs(answers) {
  const probs = {};
  if (!answers || typeof answers !== 'object') return probs;
  Object.keys(answers).forEach((key) => {
    const row = answers[key];
    if (!row || typeof row !== 'object') return;
    if (typeof row.probability === 'number') {
      probs[key] = row.probability;
      return;
    }
    if (row.probabilities && typeof row.probabilities === 'object') {
      probs[key] = row.probabilities;
    }
  });
  return probs;
}

function logJev(event, questions, answers) {
  console.log(JSON.stringify({
    type: 'OpsJev',
    event,
    keys: questions && typeof questions === 'object' ? Object.keys(questions) : [],
    probs: answerProbs(answers),
  }));
}

function debugEnabled() {
  return process.env.OPS_JEV_DEBUG === '1';
}

function decideResearchQuality(answers) {
  const row = answers && answers.accept_research;
  const probability = row && typeof row.probability === 'number' ? row.probability : NaN;
  if (!Number.isFinite(probability)) return { ok: false };
  return {
    ok: true,
    action: probability >= ACCEPT_THRESHOLD ? 'accept' : 'revise',
    thresholds: { accept_research: ACCEPT_THRESHOLD },
    answers,
  };
}

async function scoreResearchResult({ brief, result, fetchImpl }) {
  if (!researchQualityAutoEnabled()) return { ok: true, skipped: true, reason: 'gate_off' };
  const packed = truncateResearchState({ brief, result });
  if (!packed.state.result) return { ok: true, skipped: true, reason: 'invalid_state' };
  let evaluated;
  try {
    evaluated = await evaluate({
      state: packed.state,
      questions: researchQualityQuestions(),
      fetchImpl,
    });
  } catch {
    return { ok: true, skipped: true, reason: 'jev_failed' };
  }
  if (!evaluated || evaluated.error) {
    const reason = evaluated && evaluated.error === 'jev_not_configured' ? 'gate_off' : 'jev_failed';
    return { ok: true, skipped: true, reason };
  }
  const decision = decideResearchQuality(evaluated.answers);
  if (!decision.ok) return { ok: true, skipped: true, reason: 'jev_failed' };
  const row = evaluated.answers.accept_research;
  return {
    ok: true,
    skipped: false,
    action: decision.action,
    probability: row.probability,
    thresholds: decision.thresholds,
  };
}

async function evaluate({ state, questions, timeoutMs, fetchImpl }) {
  if (!jevConfigured()) return { error: 'jev_not_configured' };
  const asked = questions && typeof questions === 'object' ? questions : null;
  if (!asked || !Object.keys(asked).length) return { error: 'jev_failed', status: 'invalid_questions' };
  const doFetch = typeof fetchImpl === 'function' ? fetchImpl : fetch;
  if (typeof doFetch !== 'function') {
    logJev('network', asked, null);
    return { error: 'jev_failed', status: 'network' };
  }
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const wait = Number.isFinite(timeoutMs) ? timeoutMs : DEFAULT_TIMEOUT_MS;
  const timer = controller ? setTimeout(() => controller.abort(), wait) : null;
  try {
    const response = await doFetch(EVALUATE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${gatewayKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: JEV_MODEL,
        state,
        questions: asked,
      }),
      signal: controller ? controller.signal : undefined,
    });
    if (!response.ok) {
      if (typeof response.text === 'function') {
        await response.text().catch(() => '');
      }
      logJev('helper_failed', asked, null);
      return { error: 'jev_failed', status: response.status };
    }
    const payload = await response.json();
    const answers = payload && payload.answers && typeof payload.answers === 'object' ? payload.answers : null;
    if (!answers) {
      logJev('bad_payload', asked, null);
      return { error: 'jev_failed', status: response.status };
    }
    if (debugEnabled()) logJev('debug', asked, answers);
    return { answers, model: JEV_MODEL };
  } catch (err) {
    const aborted = err && (err.name === 'AbortError' || err.code === 'ABORT_ERR');
    logJev(aborted ? 'timeout' : 'network', asked, null);
    return { error: 'jev_failed', status: aborted ? 'timeout' : 'network' };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function sendJson(res, status, body) {
  noStore(res, 'application/json');
  return json(res, status, body);
}

function founderGuard(req) {
  if (looksLikeAgentRequest(req)) return { status: 403, error: 'agent_denied' };
  const session = readSession(req);
  if (session) return { session };
  const claimed = peekSessionEmail(req) || normalizeEmail(header(req, 'x-ops-email') || '');
  if (claimed && !isAllowlisted(claimed)) return { status: 403, error: 'forbidden' };
  return { status: 401, error: 'sign_in_required' };
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

function isJevEvaluateRequest(req) {
  const area = String(firstQuery(req, 'area') || '');
  const pathOnly = String(req.url || '').split('?')[0].replace(/\/+$/, '');
  const hay = `${area} ${pathOnly}`.toLowerCase();
  return hay.includes('api/jev/evaluate');
}

function notConfiguredBody() {
  return {
    error: 'jev_not_configured',
    message: 'AI_GATEWAY_API_KEY is missing or too short.',
  };
}

function failedBody() {
  return {
    error: 'jev_failed',
    message: 'Jev evaluate failed. No research decision was invented.',
  };
}

async function handleJevEvaluate(req, res) {
  if (!isJevEvaluateRequest(req)) return false;
  const access = founderGuard(req);
  if (!access.session) {
    sendJson(res, access.status, { error: access.error });
    return true;
  }
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'method_not_allowed' });
    return true;
  }
  const body = readBody(req);
  if (!readCsrfToken(csrfFrom(req, body), access.session.email)) {
    sendJson(res, 403, { error: 'csrf' });
    return true;
  }
  if (productionEnv()) {
    sendJson(res, 503, {
      error: 'jev_disabled',
      message: 'Jev research quality is Preview-only.',
    });
    return true;
  }
  if (!jevConfigured()) {
    sendJson(res, 503, notConfiguredBody());
    return true;
  }
  if (body.purpose !== 'research_quality') {
    sendJson(res, 400, {
      error: 'invalid_purpose',
      message: 'purpose must be research_quality.',
    });
    return true;
  }
  const packed = truncateResearchState(body.state);
  if (!packed.state.result) {
    sendJson(res, 400, {
      error: 'invalid_state',
      message: 'state.result is required.',
    });
    return true;
  }
  const questions = researchQualityQuestions();
  const result = await evaluate({ state: packed.state, questions });
  if (result.error === 'jev_not_configured') {
    sendJson(res, 503, notConfiguredBody());
    return true;
  }
  if (result.error) {
    sendJson(res, 502, failedBody());
    return true;
  }
  const decision = decideResearchQuality(result.answers);
  if (!decision.ok) {
    sendJson(res, 502, failedBody());
    return true;
  }
  sendJson(res, 200, {
    ok: true,
    purpose: 'research_quality',
    action: decision.action,
    thresholds: decision.thresholds,
    answers: decision.answers,
    model: JEV_MODEL,
    truncated: packed.truncated,
  });
  return true;
}

module.exports = {
  ACCEPT_THRESHOLD,
  DEFAULT_TIMEOUT_MS,
  EVALUATE_URL,
  JEV_MODEL,
  MAX_QUALITY_REVISES,
  MAX_STATE_CHARS,
  MIN_KEY_LENGTH,
  answerProbs,
  decideResearchQuality,
  evaluate,
  handleJevEvaluate,
  jevConfigured,
  researchQualityAutoEnabled,
  researchQualityQuestions,
  scoreResearchResult,
  truncateResearchState,
};
