// Provider-reported usage only. No fabricated dollar amounts or subscription equivalence.
'use strict';

function nonnegative(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function normalizeUsage(harness, body) {
  const raw = body && body.usage;
  if (!raw || typeof raw !== 'object') return null;
  let input = null, output = null, cached = null;
  if (harness === 'claude') {
    input = nonnegative(raw.input_tokens);
    output = nonnegative(raw.output_tokens);
    cached = nonnegative(raw.cache_read_input_tokens);
    // Anthropic splits cached reads from uncached input; don't sum these into input.
  } else if (harness === 'codex' || harness === 'deepseek' || harness === 'grok') {
    input = nonnegative(raw.prompt_tokens);
    output = nonnegative(raw.completion_tokens);
    cached = nonnegative(raw.prompt_tokens_details && raw.prompt_tokens_details.cached_tokens);
  } else {
    return null;
  }
  if (input === null && output === null && cached === null) return null;
  return {
    source: 'provider_response',
    inputTokens: input,
    outputTokens: output,
    cachedInputTokens: cached,
    // This is intentionally null: a provider usage count does not prove billed cost.
    billedUsd: null,
    billedUsdStatus: 'not_available',
  };
}

module.exports = { normalizeUsage };
