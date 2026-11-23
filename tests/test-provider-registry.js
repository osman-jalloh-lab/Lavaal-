// Provider metadata is static and contains no credential values.
'use strict';
const assert = require('node:assert/strict');
const registry = require('../tools/lavaall-ai/providers.json');
const { validateRegistry, publicRegistry, findModel } = require('../api/ops/_provider_registry');
const { harnessKind, handleHarnessChat, modelFor, CLAUDE_MODELS } = require('../api/ops/_harness_chat');

(async () => {
  assert.deepEqual(validateRegistry(registry), []);
  assert.deepEqual(registry.providers.map(p => p.id).sort(), ['claude', 'codex', 'deepseek', 'grok']);
  for (const alias of ['sonnet', 'haiku', 'opus']) assert(findModel('claude', alias));
  assert.equal(findModel('claude', 'opus').cost_tier, 'high');
  assert.equal(findModel('claude', 'opus').requires_approval, true);
  assert(registry.disabled_providers.includes('gemini'));
  assert(!registry.providers.some(p => p.id === 'gemini'));
  const runner = findModel('codex', 'github-actions-codex-runner');
  assert.equal(runner.execution_environment, 'github_actions_codex');
  assert.equal(runner.requires_approval, true);
  for (const p of registry.providers) assert(findModel(p.id, modelFor(p.id, '', {})));
  // Every Claude model the live picker can send (default env) is in the registry under the same alias.
  for (const [alias, id] of Object.entries(CLAUDE_MODELS)) assert.equal(findModel('claude', alias).id, id);
  const result = publicRegistry({ OPENAI_API_KEY: 'fake-provider-key-value' });
  assert.equal(result.providers.find(p => p.id === 'codex').configured, true);
  assert.equal(result.providers.find(p => p.id === 'grok').configured, false);
  assert(!JSON.stringify(result).includes('fake-provider-key-value'));
  const bad = JSON.parse(JSON.stringify(registry));
  bad.providers.find(p => p.id === 'claude').models.find(m => m.alias === 'opus').requires_approval = false;
  bad.providers = bad.providers.filter(p => p.id !== 'grok');
  assert(validateRegistry(bad).some(e => e.includes('high cost')));
  assert(validateRegistry(bad).some(e => e.includes('missing provider: grok')));
  assert.equal(harnessKind({url:'/ops/harness/providers'}), 'providers');
  const res = { setHeader() { return this; }, status(code) { this.statusCode = code; return this; }, send(body) { this.body = body; } };
  assert.equal(await handleHarnessChat({method:'GET',url:'/ops/harness/providers',headers:{}}, res, {env:{}}), true);
  assert([401, 403].includes(res.statusCode));
  console.log('test-provider-registry: PASS');
})().catch(e => { console.error(e); process.exitCode = 1; });
