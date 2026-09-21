// Server-only xAI chat-completions adapter. Reusable by other desks later.
// XAI_API_KEY never leaves the server. Underscore prefix: not a Vercel function.
// No npm. Never log the key or response payloads that might echo secrets.
// Default model grok-4.3: current non-retiring slug, modest Hobby latency.
// Override with OPS_CHAT_XAI_MODEL. Endpoint: POST https://api.x.ai/v1/chat/completions

const XAI_URL = 'https://api.x.ai/v1/chat/completions';
const DEFAULT_XAI_MODEL = 'grok-4.3';
const DEFAULT_MAX_TOKENS = 600;
// 22s: grok-4.3 on cold Hobby is slower than 8s. Stay under the ops
// function budget (vercel.json maxDuration 30; Hobby Fluid max 60).
const DEFAULT_TIMEOUT_MS = 22000;

function hasKey(name) {
  const value = process.env[name];
  return typeof value === 'string' && value.trim() !== '';
}

function xaiConfigured() {
  return hasKey('XAI_API_KEY');
}

function xaiModel() {
  const named = process.env.OPS_CHAT_XAI_MODEL;
  return typeof named === 'string' && named.trim() ? named.trim() : DEFAULT_XAI_MODEL;
}

function helperFailedMessage(status) {
  return `The connected xAI runtime failed (HTTP ${status || 'unknown'}). No invented reply.`;
}

function asMessages(messages) {
  return (Array.isArray(messages) ? messages : [])
    .map((row) => {
      const role = row && (row.role === 'assistant' || row.role === 'system') ? row.role : 'user';
      const content = typeof row === 'string' ? row : String((row && row.content) || '');
      return { role, content };
    })
    .filter((row) => row.content.trim());
}

async function completeXai({ system, messages, maxTokens, timeoutMs }) {
  if (!xaiConfigured()) return { error: 'unconfigured', message: 'XAI_API_KEY is not set.' };
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const wait = Number.isFinite(timeoutMs) ? timeoutMs : DEFAULT_TIMEOUT_MS;
  const timer = controller ? setTimeout(() => controller.abort(), wait) : null;
  try {
    const response = await fetch(XAI_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.XAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: xaiModel(),
        max_tokens: Number.isFinite(maxTokens) ? maxTokens : DEFAULT_MAX_TOKENS,
        stream: false,
        messages: [{ role: 'system', content: String(system || '') }].concat(asMessages(messages)),
      }),
      signal: controller ? controller.signal : undefined,
    });
    if (!response.ok) {
      return { error: 'helper_failed', status: response.status, message: helperFailedMessage(response.status) };
    }
    const payload = await response.json();
    const text = payload && payload.choices && payload.choices[0] && payload.choices[0].message
      ? payload.choices[0].message.content
      : '';
    if (!String(text).trim()) {
      return { error: 'helper_failed', status: response.status, message: helperFailedMessage(response.status) };
    }
    return { text: String(text).trim(), provider: 'xai', model: xaiModel() };
  } catch (err) {
    const aborted = err && (err.name === 'AbortError' || err.code === 'ABORT_ERR');
    return { error: 'helper_failed', status: aborted ? 'timeout' : 'network', message: helperFailedMessage(aborted ? 'timeout' : 'network') };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  DEFAULT_XAI_MODEL,
  XAI_URL,
  completeXai,
  xaiConfigured,
  xaiModel,
};
