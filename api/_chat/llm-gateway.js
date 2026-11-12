'use strict';

const https = require('https');

// Official DeepSeek pricing, USD per token (2026-11-10).
// https://api-docs.deepseek.com/quick_start/pricing/
const DEEPSEEK_PRICES = {
  'deepseek-flash': {
    offPeak: { miss: 0.15 / 1e6, hit: 0.003 / 1e6, output: 0.60 / 1e6 },
    peak: { miss: 0.30 / 1e6, hit: 0.006 / 1e6, output: 1.20 / 1e6 },
  },
};
// Conservative Gateway estimate includes a margin over gpt-4o-mini token rates.
const GATEWAY_PRICES = { input: 0.30 / 1e6, output: 1.20 / 1e6 };
const MAX_TOKENS = 480;

class SpendCapError extends Error {
  constructor(message = 'Monthly chat budget reached') {
    super(message);
    this.name = 'SpendCapError';
    this.code = 'cost_cap';
  }
}

function isPeakUtc(date = new Date()) {
  const day = date.getUTCDay();
  const minutes = date.getUTCHours() * 60 + date.getUTCMinutes();
  return day >= 1 && day <= 5 && ((minutes >= 60 && minutes < 240) || (minutes >= 360 && minutes < 600));
}
function pricesFor(model = 'deepseek-flash', when = new Date()) {
  return DEEPSEEK_PRICES[model][isPeakUtc(when) ? 'peak' : 'offPeak'];
}
function computeDirectCost(model, usage = {}, when = new Date()) {
  const prices = pricesFor(model, when);
  const prompt = Number(usage.prompt_tokens || 0);
  const hit = Number(usage.prompt_cache_hit_tokens || (usage.prompt_tokens_details || {}).cached_tokens || 0);
  const miss = usage.prompt_cache_miss_tokens == null ? Math.max(0, prompt - hit) : Number(usage.prompt_cache_miss_tokens);
  return hit * prices.hit + miss * prices.miss + Number(usage.completion_tokens || 0) * prices.output;
}
function estimateCost(model, promptTokens, maxTokens = MAX_TOKENS) {
  const prices = DEEPSEEK_PRICES[model].peak;
  return promptTokens * prices.miss + maxTokens * prices.output;
}
function promptBound(messages) {
  // A token cannot consume less than one UTF-8 byte. Include generous protocol overhead.
  return Buffer.byteLength(JSON.stringify(messages || []), 'utf8') + 2048;
}
function estimates(messages) {
  const input = promptBound(messages);
  return {
    deepseek: estimateCost('deepseek-flash', input),
    gateway: input * GATEWAY_PRICES.input + MAX_TOKENS * GATEWAY_PRICES.output,
  };
}
function reservationCents(messages) {
  const costs = estimates(messages);
  return Math.ceil((costs.deepseek + costs.gateway) * 100);
}

function httpsJson({ hostname, apiPath, key, body, timeoutMs }) {
  const payload = Buffer.from(JSON.stringify(body));
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, path: apiPath, method: 'POST', signal: AbortSignal.timeout(timeoutMs), headers: {
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json',
      'Content-Length': payload.length,
    } }, res => {
      const chunks = [];
      let size = 0;
      res.on('data', chunk => {
        size += chunk.length;
        if (size > 256 * 1024) { req.destroy(new Error('Response too large')); return; }
        chunks.push(chunk);
      });
      res.on('error', reject);
      res.on('end', () => {
        let json = {};
        try { json = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (_) { /* Invalid responses fail closed below. */ }
        resolve({ status: res.statusCode, json });
      });
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error('Vendor timeout')));
    req.on('error', reject);
    req.end(payload);
  });
}

async function chat({ messages, env = process.env, request = httpsJson, timeoutMs = 7500 } = {}) {
  const costs = estimates(messages);
  let incurred = 0;
  async function call(provider) {
    const direct = provider === 'deepseek';
    const key = direct ? env.DEEPSEEK_API_KEY : env.AI_GATEWAY_API_KEY;
    if (!key) { const error = new Error('Chat provider is not configured'); error.noRetry = true; throw error; }
    const model = direct ? 'deepseek-flash' : 'openai/gpt-4o-mini';
    const started = new Date();
    let response;
    try {
      response = await request({
        hostname: direct ? 'api.deepseek.com' : 'ai-gateway.vercel.sh',
        apiPath: direct ? '/chat/completions' : '/v1/chat/completions', key, timeoutMs,
        body: { model, messages, max_tokens: MAX_TOKENS, temperature: 0, stream: false,
          ...(direct ? { thinking: { type: 'disabled' } } : {}) },
      });
    } catch (_) {
      incurred += costs[provider]; // Timeout/network may have consumed vendor tokens.
      throw new Error('Chat provider network failure');
    }
    const { status, json = {} } = response;
    const usage = json.usage;
    const validUsage = usage && Number.isFinite(usage.prompt_tokens) && usage.prompt_tokens >= 0
      && Number.isFinite(usage.completion_tokens) && usage.completion_tokens >= 0;
    incurred += validUsage
      ? (direct ? computeDirectCost(model, usage, started) : usage.prompt_tokens * GATEWAY_PRICES.input + usage.completion_tokens * GATEWAY_PRICES.output)
      : costs[provider];
    if (status !== 200) {
      const error = new Error('Chat provider HTTP ' + status);
      error.noRetry = !(status === 429 || status >= 500);
      throw error;
    }
    const content = (((json.choices || [])[0] || {}).message || {}).content;
    if (typeof content !== 'string' || !content.trim()) {
      const error = new Error('Chat provider returned an invalid completion'); error.noRetry = true; throw error;
    }
    return { content: content.trim(), model, provider, usage, costUsd: incurred };
  }
  try { return await call('deepseek'); }
  catch (error) {
    if (!error.noRetry && env.AI_GATEWAY_API_KEY) {
      try { return await call('gateway'); }
      catch (fallbackError) { fallbackError.costUsd = incurred; throw fallbackError; }
    }
    error.costUsd = incurred;
    throw error;
  }
}

module.exports = { chat, SpendCapError, MAX_TOKENS, DEEPSEEK_PRICES, GATEWAY_PRICES, isPeakUtc, pricesFor, computeDirectCost, estimateCost, reservationCents, promptBound };
