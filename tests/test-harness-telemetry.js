// Pure parser tests: only provider-returned token fields, never estimated costs.
'use strict';
const assert = require('node:assert/strict');
const { normalizeUsage } = require('../api/ops/_harness_telemetry');

const openai = normalizeUsage('codex', {
  usage: { prompt_tokens: 100, completion_tokens: 40, prompt_tokens_details: { cached_tokens: 20 } }
});
assert.deepEqual(openai, {
  source: 'provider_response',
  inputTokens: 100,
  outputTokens: 40,
  cachedInputTokens: 20,
  billedUsd: null,
  billedUsdStatus: 'not_available',
});
assert.equal(normalizeUsage('deepseek', { usage: { prompt_tokens: 5, completion_tokens: 3 } }).outputTokens, 3);
assert.deepEqual(normalizeUsage('claude', {
  usage: { input_tokens: 25, output_tokens: 10, cache_read_input_tokens: 7 }
}), {
  source: 'provider_response',
  inputTokens: 25,
  outputTokens: 10,
  cachedInputTokens: 7,
  billedUsd: null,
  billedUsdStatus: 'not_available',
});
assert.equal(normalizeUsage('codex', { usage: { prompt_tokens: -1, completion_tokens: '8' } }), null);
assert.equal(normalizeUsage('codex', {}), null);
assert.equal(normalizeUsage('unknown', { usage: { prompt_tokens: 123 } }), null);
assert.equal(normalizeUsage('claude', { usage: { input_tokens: NaN, output_tokens: -1 } }), null);
console.log('7 provider-usage assertions passed');
