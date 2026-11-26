// api/ops/_harness_chat.js — founder-only Harness chat, history, and usage.
// Underscore-prefixed, so Vercel does not treat it as a function.
// The /os page talks to /ops/harness/* . This runs on Vercel and can call
// provider HTTP APIs. It cannot run Codex/Claude CLIs or see the box filesystem.
// Never logs API keys. Usage uses free balance/usage endpoints only.

const fs = require('fs');
const path = require('path');

const {
  json,
  queryOf,
  readBody,
  looksLikeAgentRequest,
} = require('./_lib');
const { readLiveSession } = require('./_signin_hardening');
const { normalizeUsage } = require('./_harness_telemetry');
const coding = require('./_harness_execute');

const CATALOG = require('../../tools/lavaall-ai/projects.json');
const RULES_PATH = path.join(__dirname, '../../tools/lavaall-ai/RULES.md');
const HARNESS_STORE_KEY = 'lavaall-os-harness-v1';
const VISIBLE_HARNESSES = ['codex', 'claude', 'deepseek', 'grok'];
const MAX_MESSAGE = 8000;
const MAX_HISTORY = 40;
const MAX_LOG = 50;

// RULES.md: "Claude must use Sonnet only. Never use Opus." Opus is not offered.
const CLAUDE_MODELS = Object.freeze({
  sonnet: process.env.ANTHROPIC_SONNET_MODEL || 'claude-sonnet-4-5',
  haiku: process.env.ANTHROPIC_HAIKU_MODEL || 'claude-haiku-4-5',
});

// Token diet. Every run re-sends the prompt, so keep the per-run payload small:
// a short window of recent chat, each message clipped, and a short handoff log.
// Stable text (instructions, RULES, project context) goes first in the system
// prompt so provider prompt caching can reuse it between runs.
const RECENT_TURNS = 6;
const RECENT_MSG_CHARS = 1500;
const LOG_LINES = 5;
const MAX_OUTPUT_TOKENS = 2048;

function clip(text, max) {
  const s = String(text || '');
  return s.length > max ? `${s.slice(0, max)} [...clipped]` : s;
}

function firstQuery(req, key) {
  const value = queryOf(req)[key];
  return Array.isArray(value) ? value[0] : value;
}

function harnessKind(req) {
  const area = String(firstQuery(req, 'area') || '');
  const pathOnly = String(req.url || '').split('?')[0];
  const hay = `${area} ${pathOnly}`.toLowerCase();
  if (/harness\/chat(?:\/|$|\?)/.test(hay) || /harness\/chat$/.test(hay.trim())) return 'chat';
  if (/harness\/history/.test(hay)) return 'history';
  if (/harness\/usage/.test(hay)) return 'usage';
  if (/harness\/execute/.test(hay)) return 'execute';
  if (/harness\/runs/.test(hay)) return 'runs';
  if (/harness\/models/.test(hay)) return 'models';
  return '';
}

function catalogOf(pack) {
  const src = pack || CATALOG;
  const projects = Array.isArray(src.projects) ? src.projects : [];
  const byName = new Map();
  projects.forEach((p) => {
    if (p && p.name) byName.set(String(p.name), p);
  });
  return { src, projects, byName };
}

function findProject(name, pack) {
  const key = String(name || '').trim().toLowerCase();
  if (!key) return null;
  const { projects } = catalogOf(pack);
  return projects.find((p) => String(p.name).toLowerCase() === key || String(p.label).toLowerCase() === key) || null;
}

function present(env, name) {
  return Boolean(env && env[name] && String(env[name]).trim());
}

function redact(text, env) {
  let out = String(text || '');
  Object.keys(env || {}).forEach((key) => {
    const val = env[key];
    if (!val || String(val).length < 8) return;
    if (!/KEY|TOKEN|SECRET/i.test(key)) return;
    if (out.includes(val)) out = out.split(val).join('[redacted]');
  });
  return out;
}

function nowCt(at) {
  const d = at ? new Date(at) : new Date();
  try {
    const parts = {};
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).formatToParts(d).forEach((p) => { parts[p.type] = p.value; });
    return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute} ${String(parts.dayPeriod || '').toUpperCase()} CT (America/Chicago)`;
  } catch {
    return d.toISOString();
  }
}

function readRules() {
  try {
    return fs.readFileSync(RULES_PATH, 'utf8');
  } catch {
    return '';
  }
}

function readSnapshot(rel) {
  if (rel === 'handoffs/salonehire.md') {
    try {
      return fs.readFileSync(path.join(__dirname, '../../tools/lavaall-ai/handoffs/salonehire.md'), 'utf8');
    } catch {
      return '';
    }
  }
  return '';
}

function projectContext(project) {
  const bits = [];
  if (project.label) bits.push(`Project: ${project.label}`);
  if (project.category) bits.push(`Category: ${project.category}`);
  if (project.summary) bits.push(project.summary);
  if (project.status) bits.push(`Status: ${project.status}`);
  const snap = readSnapshot(project.handoff_snapshot);
  if (snap) bits.push(snap);
  return bits.join('\n');
}

function composePrompt(project, history, message, extraLog) {
  const rules = readRules();
  const recent = (history || []).slice(-RECENT_TURNS)
    .map((m) => `${m.role}: ${clip(m.text, RECENT_MSG_CHARS)}`).join('\n');
  const log = (extraLog || []).slice(-LOG_LINES).join('\n');
  return {
    system: [
      'You are helping Osman work on a LAVAALL project from the founder-only Harness chat.',
      'You are running as a hosted API call, not as the Codex or Claude CLI, and you cannot edit files on his computer or the private box.',
      'Follow the rules and the project handoff. Do not deploy, merge, send, or spend. Synthetic data only. Do not invent prices, stock, or testimonials.',
      'Do not ask for or repeat API keys. If you cannot do something from here, say so plainly and say what he can run locally.',
      'Be concise. Answer the request directly; skip restating the context.',
      rules ? `--- RULES.md ---\n${rules}` : '',
      `--- PROJECT ---\n${projectContext(project)}`,
    ].filter(Boolean).join('\n\n'),
    user: [
      log ? `--- HANDOFF LOG ---\n${log}` : '',
      recent ? `--- RECENT CHAT ---\n${recent}` : '',
      '--- REQUEST ---',
      String(message || '').trim(),
    ].filter(Boolean).join('\n\n'),
  };
}

function kvOn(env) {
  return Boolean(env.KV_REST_API_URL && env.KV_REST_API_TOKEN);
}

async function kvCall(args, env, fetchImpl) {
  const response = await fetchImpl(String(env.KV_REST_API_URL).replace(/\/$/, ''), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.KV_REST_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  const data = await response.json().catch(() => null);
  return { ok: response.ok, data };
}

async function loadStore(env, fetchImpl) {
  if (!kvOn(env) || !fetchImpl) return { persist: false, data: { projects: {} } };
  try {
    const res = await kvCall(['GET', HARNESS_STORE_KEY], env, fetchImpl);
    const raw = res && res.data && (res.data.result || res.data);
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (parsed && typeof parsed === 'object' && parsed.projects) {
      return { persist: true, data: parsed };
    }
  } catch {
    // Fall through to empty. History is best-effort.
  }
  return { persist: kvOn(env), data: { projects: {} } };
}

async function saveStore(env, fetchImpl, data) {
  if (!kvOn(env) || !fetchImpl) return false;
  try {
    const res = await kvCall(['SET', HARNESS_STORE_KEY, JSON.stringify(data)], env, fetchImpl);
    return Boolean(res && res.ok);
  } catch {
    return false;
  }
}

function projectState(store, name) {
  const cur = store.data.projects[name] || { messages: [], log: [] };
  return {
    messages: Array.isArray(cur.messages) ? cur.messages : [],
    log: Array.isArray(cur.log) ? cur.log : [],
  };
}

async function appendTurn(env, fetchImpl, name, userMsg, assistantMsg, logLine) {
  const store = await loadStore(env, fetchImpl);
  const cur = projectState(store, name);
  cur.messages = cur.messages.concat([userMsg, assistantMsg]).slice(-MAX_HISTORY);
  if (logLine) cur.log = cur.log.concat([logLine]).slice(-MAX_LOG);
  store.data.projects[name] = cur;
  const saved = await saveStore(env, fetchImpl, store.data);
  return { persist: store.persist && saved, state: cur };
}

function keyFor(harness, env) {
  if (harness === 'codex') return present(env, 'OPENAI_API_KEY') ? env.OPENAI_API_KEY : '';
  if (harness === 'claude') return present(env, 'ANTHROPIC_API_KEY') ? env.ANTHROPIC_API_KEY : '';
  if (harness === 'deepseek') return present(env, 'DEEPSEEK_API_KEY') ? env.DEEPSEEK_API_KEY : '';
  if (harness === 'grok') return present(env, 'XAI_API_KEY') ? env.XAI_API_KEY : '';
  return '';
}

// ---- Every model each provider offers, read live from its /models endpoint (cached 30 minutes per instance).
// Chat-capable models only. Claude Opus stays off: RULES.md says "Claude must use Sonnet only. Never use Opus."
const MODEL_LIST_TTL_MS = 30 * 60 * 1000;
const MODEL_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{1,99}$/;
const MODEL_SOURCES = Object.freeze({
  codex: { url: 'https://api.openai.com/v1/models', auth: (k) => ({ Authorization: `Bearer ${k}` }) },
  claude: { url: 'https://api.anthropic.com/v1/models?limit=100', auth: (k) => ({ 'x-api-key': k, 'anthropic-version': '2023-06-01' }) },
  deepseek: { url: 'https://api.deepseek.com/models', auth: (k) => ({ Authorization: `Bearer ${k}` }) },
  grok: { url: 'https://api.x.ai/v1/models', auth: (k) => ({ Authorization: `Bearer ${k}` }) },
});
const modelCache = {};

function chatModel(harness, id) {
  if (!MODEL_ID_RE.test(id)) return false;
  const low = id.toLowerCase();
  if (harness === 'claude') return /^claude-/.test(low) && !/opus/.test(low);
  if (harness === 'codex') {
    return /^(gpt-|o\d|chatgpt-)/.test(low) && !/(audio|realtime|tts|transcribe|image|search|embedding|instruct|moderation|whisper|dall-e|codex-mini|computer-use)/.test(low);
  }
  if (harness === 'grok') return /^grok-/.test(low) && !/(image|vision-beta|imagine)/.test(low);
  if (harness === 'deepseek') return /^deepseek-/.test(low);
  return false;
}

async function listModels(harness, env, fetchImpl, now) {
  const at = Number.isFinite(now) ? now : Date.now();
  const hit = modelCache[harness];
  if (hit && at - hit.at < MODEL_LIST_TTL_MS) return hit.ids;
  const key = keyFor(harness, env);
  const src = MODEL_SOURCES[harness];
  if (!key || !src) return null;
  try {
    const res = await httpJson(fetchImpl, src.url, { method: 'GET', headers: src.auth(key) });
    if (!res.ok || !res.body) return hit ? hit.ids : null;
    const rows = Array.isArray(res.body.data) ? res.body.data : Array.isArray(res.body.models) ? res.body.models : [];
    const ids = Array.from(new Set(rows.map((r) => String((r && (r.id || r.name)) || '')).filter((id) => chatModel(harness, id)))).sort().reverse().slice(0, 80);
    modelCache[harness] = { at, ids };
    return ids;
  } catch {
    return hit ? hit.ids : null;
  }
}

function resetModelCache() { Object.keys(modelCache).forEach((k) => { delete modelCache[k]; }); }

// The model a run uses: the one Osman picked when the provider lists it, else the configured default.
async function pickModel(harness, requested, env, fetchImpl) {
  const fallback = modelFor(harness, CLAUDE_MODELS[String(requested || '').toLowerCase()] ? requested : '', env);
  const want = String(requested || '').trim();
  if (!want || CLAUDE_MODELS[want.toLowerCase()]) return fallback;
  if (!chatModel(harness, want)) return { error: 'unknown_model' };
  const ids = await listModels(harness, env, fetchImpl);
  if (!ids) return want === fallback ? fallback : { error: 'models_unavailable' };
  return ids.includes(want) || want === fallback ? want : { error: 'unknown_model' };
}

async function handleModels(req, res, env, fetchImpl) {
  if (req.method !== 'GET' && req.method !== 'HEAD') { json(res, 405, { error: 'method_not_allowed' }); return true; }
  const impl = fetchImpl || globalThis.fetch;
  const out = {};
  await Promise.all(VISIBLE_HARNESSES.map(async (h) => {
    const ids = await listModels(h, env, impl);
    const def = modelFor(h, '', env);
    const list = ids ? ids.slice() : [];
    if (def && !list.includes(def)) list.unshift(def);
    out[h] = { default: def, models: list, live: Boolean(ids) };
  }));
  json(res, 200, { harnesses: out, note: 'Claude Opus is not offered (RULES.md: Sonnet only, never Opus).' });
  return true;
}

function modelFor(harness, requested, env) {
  if (harness === 'codex') return (env.OPENAI_HARNESS_MODEL || 'gpt-4.1').trim();
  if (harness === 'deepseek') return (env.DEEPSEEK_MODEL || 'deepseek-flash').trim();
  if (harness === 'grok') return (env.XAI_MODEL || 'grok-4.7').trim();
  if (harness === 'claude') {
    const pick = String(requested || 'sonnet').toLowerCase();
    if (!CLAUDE_MODELS[pick]) return { error: 'unknown_model' };
    return CLAUDE_MODELS[pick];
  }
  return '';
}

async function httpJson(fetchImpl, url, init) {
  // A single upper bound includes fetching headers and reading the response body.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    const bodyText = await response.text();
    let body = null;
    try { body = JSON.parse(bodyText); } catch { body = null; }
    return { status: response.status, ok: response.ok, body };
  } finally {
    clearTimeout(timeout);
  }
}

function openaiMessages(prompt) {
  return [
    { role: 'system', content: prompt.system },
    { role: 'user', content: prompt.user },
  ];
}

async function callOpenAICompatible(fetchImpl, env, url, key, model, prompt) {
  const res = await httpJson(fetchImpl, url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(Object.assign(
      { model, messages: openaiMessages(prompt) },
      // OpenAI's newer and reasoning models take max_completion_tokens and only the default temperature.
      url.includes('openai.com')
        ? Object.assign({ max_completion_tokens: MAX_OUTPUT_TOKENS }, /^(o\d|gpt-5)/i.test(model) ? {} : { temperature: 0.2 })
        : { temperature: 0.2, max_tokens: MAX_OUTPUT_TOKENS },
    )),
  });
  if (!res.ok) {
    const err = typeof res.body === 'object' ? JSON.stringify(res.body).slice(0, 400) : String(res.body).slice(0, 400);
    return { error: `provider_http_${res.status}`, detail: 'The provider rejected this request. Check the configured model, permissions, and provider status.' };
  }
  try {
    const text = res.body.choices[0].message.content;
    return { text: String(text || ''), model, usage: normalizeUsage(url.includes('openai.com') ? 'codex' : url.includes('api.x.ai') ? 'grok' : 'deepseek', res.body) };
  } catch {
    return { error: 'provider_empty', detail: 'The provider returned no message text.' };
  }
}

async function callClaude(fetchImpl, env, key, model, prompt) {
  const res = await httpJson(fetchImpl, 'https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: MAX_OUTPUT_TOKENS,
      temperature: 0.2,
      // The system prompt is the stable part of every run: cache it.
      system: [{ type: 'text', text: prompt.system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: prompt.user }],
    }),
  });
  if (!res.ok) {
    const err = typeof res.body === 'object' ? JSON.stringify(res.body).slice(0, 400) : String(res.body).slice(0, 400);
    return { error: `provider_http_${res.status}`, detail: 'The provider rejected this request. Check the configured model, permissions, and provider status.' };
  }
  try {
    const text = (res.body.content || []).map((p) => p.text || '').join('');
    return { text, model, usage: normalizeUsage('claude', res.body) };
  } catch {
    return { error: 'provider_empty', detail: 'The provider returned no message text.' };
  }
}

async function runHarness(harness, model, prompt, env, fetchImpl) {
  const key = keyFor(harness, env);
  if (!key) return { error: 'key_missing' };
  if (harness === 'codex') {
    return callOpenAICompatible(fetchImpl, env, 'https://api.openai.com/v1/chat/completions', key, model, prompt);
  }
  if (harness === 'deepseek') {
    return callOpenAICompatible(fetchImpl, env, 'https://api.deepseek.com/chat/completions', key, model, prompt);
  }
  if (harness === 'grok') {
    return callOpenAICompatible(fetchImpl, env, 'https://api.x.ai/v1/chat/completions', key, model, prompt);
  }
  if (harness === 'claude') {
    return callClaude(fetchImpl, env, key, model, prompt);
  }
  return { error: 'unknown_harness' };
}

async function deepseekUsage(env, fetchImpl) {
  if (!present(env, 'DEEPSEEK_API_KEY')) {
    return { id: 'deepseek', label: 'DeepSeek', available: false, reason: 'key missing' };
  }
  try {
    const res = await httpJson(fetchImpl, 'https://api.deepseek.com/user/balance', {
      method: 'GET',
      headers: { Authorization: `Bearer ${env.DEEPSEEK_API_KEY}` },
    });
    if (!res.ok) {
      return { id: 'deepseek', label: 'DeepSeek', available: false, reason: `balance endpoint HTTP ${res.status}` };
    }
    const infos = (res.body && res.body.balance_infos) || [];
    const usd = infos.find((i) => String(i.currency || '').toUpperCase() === 'USD') || infos[0];
    if (!usd || usd.total_balance == null) {
      return { id: 'deepseek', label: 'DeepSeek', available: false, reason: 'balance endpoint returned no total' };
    }
    return {
      id: 'deepseek',
      label: 'DeepSeek',
      available: true,
      currency: String(usd.currency || 'USD'),
      total: String(usd.total_balance),
      granted: usd.granted_balance != null ? String(usd.granted_balance) : null,
      toppedUp: usd.topped_up_balance != null ? String(usd.topped_up_balance) : null,
    };
  } catch {
    return { id: 'deepseek', label: 'DeepSeek', available: false, reason: 'balance endpoint failed' };
  }
}

async function openaiUsage(env, fetchImpl) {
  if (!present(env, 'OPENAI_API_KEY')) {
    return { id: 'codex', label: 'Codex (OpenAI API)', available: false, reason: 'key missing' };
  }
  // Regular API keys usually cannot read organization usage. Try once; never invent a number.
  const url = 'https://api.openai.com/v1/organization/usage/completions?start_time=0';
  try {
    const res = await httpJson(fetchImpl, url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    });
    if (!res.ok) {
      return {
        id: 'codex',
        label: 'Codex (OpenAI API)',
        available: false,
        reason: res.status === 401 || res.status === 403
          ? 'not available (this key cannot read usage)'
          : `usage endpoint HTTP ${res.status}`,
      };
    }
    return { id: 'codex', label: 'Codex (OpenAI API)', available: false, reason: 'not available (no usable total in the usage response)' };
  } catch {
    return { id: 'codex', label: 'Codex (OpenAI API)', available: false, reason: 'not available' };
  }
}

async function claudeUsage(env) {
  // Anthropic usage is on the Admin API and needs a separate admin key.
  if (!present(env, 'ANTHROPIC_API_KEY') && !present(env, 'ANTHROPIC_ADMIN_API_KEY')) {
    return { id: 'claude', label: 'Claude', available: false, reason: 'key missing' };
  }
  if (!present(env, 'ANTHROPIC_ADMIN_API_KEY')) {
    return { id: 'claude', label: 'Claude', available: false, reason: 'not available (needs an Anthropic admin key, not the regular API key)' };
  }
  return { id: 'claude', label: 'Claude', available: false, reason: 'not available (admin usage is not wired in this version)' };
}

async function usageSnapshot(env, fetchImpl) {
  const [codex, claude, deepseek] = await Promise.all([
    openaiUsage(env, fetchImpl),
    claudeUsage(env),
    deepseekUsage(env, fetchImpl),
  ]);
  const grok = { id: 'grok', label: 'Grok (xAI)', available: false,
    reason: present(env, 'XAI_API_KEY') ? 'provider billing/usage total not connected' : 'key missing' };
  return { providers: [codex, claude, deepseek, grok], note: 'Provider-reported balances only; subscription quotas and API costs are separate. Missing totals are not available.' };
}

async function deny(req, res) {
  if (looksLikeAgentRequest(req)) {
    json(res, 403, { error: 'agent_denied' });
    return true;
  }
  const session = await readLiveSession(req);
  if (!session || !session.email) {
    json(res, 401, { error: 'sign_in_required' });
    return true;
  }
  return session;
}

async function handleUsage(req, res, env, fetchImpl) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    json(res, 405, { error: 'method_not_allowed' });
    return true;
  }
  const data = await usageSnapshot(env, fetchImpl || globalThis.fetch);
  json(res, 200, data);
  return true;
}

async function handleHistory(req, res, env, fetchImpl) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    json(res, 405, { error: 'method_not_allowed' });
    return true;
  }
  const name = String(firstQuery(req, 'project') || '').trim();
  const project = findProject(name, CATALOG);
  if (!project) {
    json(res, 404, { error: 'unknown_project' });
    return true;
  }
  const store = await loadStore(env, fetchImpl || globalThis.fetch);
  const state = projectState(store, project.name);
  json(res, 200, {
    project: project.name,
    persist: store.persist,
    messages: state.messages,
    log: state.log,
  });
  return true;
}

async function handleChat(req, res, env, fetchImpl) {
  if (req.method !== 'POST') {
    json(res, 405, { error: 'method_not_allowed' });
    return true;
  }
  const body = readBody(req) || {};
  const harness = String(body.harness || '').trim().toLowerCase();
  if (harness === 'gemini') {
    json(res, 400, { error: 'harness_disabled', message: 'Gemini is turned off on this page.' });
    return true;
  }
  if (!VISIBLE_HARNESSES.includes(harness)) {
    json(res, 400, { error: 'unknown_harness' });
    return true;
  }
  const project = findProject(body.project, CATALOG);
  if (!project) {
    json(res, 400, { error: 'unknown_project' });
    return true;
  }
  const message = String(body.message || '').trim();
  if (!message) {
    json(res, 400, { error: 'missing_message' });
    return true;
  }
  if (message.length > MAX_MESSAGE) {
    json(res, 400, { error: 'message_too_long' });
    return true;
  }
  const modelPick = await pickModel(harness, body.model, env, fetchImpl || globalThis.fetch);
  if (modelPick && modelPick.error) {
    json(res, 400, { error: modelPick.error, message: modelPick.error === 'models_unavailable' ? 'The model list could not be checked. Try again, or pick the default model.' : 'Pick a model from the list.' });
    return true;
  }
  if (!keyFor(harness, env)) {
    const needed = harness === 'codex' ? 'OPENAI_API_KEY' : harness === 'claude' ? 'ANTHROPIC_API_KEY' : harness === 'grok' ? 'XAI_API_KEY' : 'DEEPSEEK_API_KEY';
    json(res, 409, {
      error: 'key_missing',
      harness,
      message: `${needed} is not set on this deployment. Add it in Vercel project settings. Values are not stored in the repo.`,
    });
    return true;
  }
  const impl = fetchImpl || globalThis.fetch;
  const store = await loadStore(env, impl);
  const state = projectState(store, project.name);
  const prompt = composePrompt(project, state.messages, message, state.log);
  let result;
  try {
    result = await runHarness(harness, modelPick, prompt, env, impl);
  } catch (err) {
    const timedOut = err && (err.name === 'AbortError' || err.name === 'TimeoutError');
    json(res, timedOut ? 504 : 502, {
      error: timedOut ? 'provider_timeout' : 'provider_unavailable',
      detail: timedOut ? 'The model request timed out. Try again.' : 'The model request failed. Try again later.',
    });
    return true;
  }
  if (result.error) {
    json(res, result.error === 'key_missing' ? 409 : 502, {
      error: result.error,
      detail: result.detail || '',
    });
    return true;
  }
  const at = Date.now();
  const userMsg = { role: 'user', text: message, harness, model: modelPick, at };
  const assistantMsg = { role: 'assistant', text: result.text, harness, model: result.model || modelPick, usage: result.usage || null, at };
  const logLine = `- ${nowCt(at)} — harness: ${harness} — project: ${project.name} — task: ${message.replace(/\s+/g, ' ').slice(0, 200)} — changes: chat reply (hosted API, no local checkout edits)`;
  const saved = await appendTurn(env, impl, project.name, userMsg, assistantMsg, logLine);
  json(res, 200, {
    ok: true,
    project: project.name,
    harness,
    model: result.model || modelPick,
    reply: result.text,
    usage: result.usage || null,
    billedUsd: null,
    persist: saved.persist,
    logLine,
    messages: saved.state.messages,
  });
  return true;
}

async function handleHarnessChat(req, res, opts) {
  const kind = harnessKind(req);
  if (!kind) return false;
  const env = (opts && opts.env) || process.env;
  const fetchImpl = (opts && opts.fetchImpl) || globalThis.fetch;
  const access = await deny(req, res);
  if (access === true) return true;
  if (kind === 'execute') {
    const result = await coding.dispatch({ ...req, body: readBody(req) }, env, fetchImpl);
    json(res, result.status, result.body);
    return true;
  }
  if (kind === 'runs') {
    const result = await coding.status({ ...req, query: queryOf(req) }, env, fetchImpl);
    json(res, result.status, result.body);
    return true;
  }
  if (kind === 'usage') return handleUsage(req, res, env, fetchImpl);
  if (kind === 'history') return handleHistory(req, res, env, fetchImpl);
  if (kind === 'chat') return handleChat(req, res, env, fetchImpl);
  if (kind === 'models') return handleModels(req, res, env, fetchImpl);
  json(res, 404, { error: 'not_found' });
  return true;
}

module.exports = {
  CLAUDE_MODELS,
  chatModel,
  listModels,
  pickModel,
  resetModelCache,
  VISIBLE_HARNESSES,
  composePrompt,
  findProject,
  handleHarnessChat,
  harnessKind,
  modelFor,
  usageSnapshot,
};
