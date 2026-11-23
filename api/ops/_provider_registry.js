// Reviewed provider metadata; no provider credentials are returned to callers.
'use strict';
const registry = require('../../tools/lavaall-ai/providers.json');

function validateRegistry(reg) {
  const errors = [];
  if (!reg || typeof reg !== 'object') return ['registry must be an object'];
  if (reg.schema_version !== 1) errors.push('invalid schema_version');
  if (typeof reg.reviewed !== 'string' || !reg.reviewed) errors.push('invalid reviewed');
  if (reg.default_chat_provider !== 'codex') errors.push('invalid default chat provider');
  if (!Array.isArray(reg.disabled_providers) || !reg.disabled_providers.includes('gemini')) errors.push('gemini must be disabled');
  const providers = Array.isArray(reg.providers) ? reg.providers : [];
  const ids = new Set();
  for (const required of ['codex', 'claude', 'deepseek', 'grok']) {
    if (!providers.some(p => p && p.id === required)) errors.push('missing provider: ' + required);
  }
  for (const p of providers) {
    if (!p || typeof p !== 'object') { errors.push('invalid provider'); continue; }
    if (typeof p.id !== 'string' || !p.id || ids.has(p.id)) errors.push('invalid or duplicate provider id');
    ids.add(p.id);
    if (p.id === 'gemini') errors.push('gemini must not be a provider');
    if (!['codex', 'claude', 'deepseek', 'grok'].includes(p.id)) errors.push('unknown provider: ' + p.id);
    if (!['label', 'vendor', 'env_key', 'default_model'].every(k => typeof p[k] === 'string' && p[k])) errors.push('invalid provider fields: ' + p.id);
    if (p.enabled !== true) errors.push('provider must be enabled: ' + p.id);
    const models = Array.isArray(p.models) ? p.models : [];
    if (!models.some(m => m && m.id === p.default_model)) errors.push('invalid default model: ' + p.id);
    const modelIds = new Set();
    const aliases = new Set();
    for (const m of models) {
      if (!m || typeof m !== 'object') { errors.push('invalid model: ' + p.id); continue; }
      if (typeof m.id !== 'string' || !m.id || modelIds.has(m.id)) errors.push('invalid or duplicate model id: ' + p.id);
      modelIds.add(m.id);
      if (m.alias !== undefined && (typeof m.alias !== 'string' || !m.alias || aliases.has(m.alias))) errors.push('invalid or duplicate model alias: ' + p.id);
      if (m.alias) aliases.add(m.alias);
      if (typeof m.label !== 'string' || !m.label || typeof m.notes !== 'string' || typeof m.requires_approval !== 'boolean' || typeof m.account_verified !== 'boolean') errors.push('invalid model fields: ' + p.id);
      if (!['low', 'standard', 'high'].includes(m.cost_tier)) errors.push('invalid cost tier: ' + p.id);
      if (!['hosted_chat', 'coding_agent'].includes(m.type)) errors.push('invalid model type: ' + p.id);
      if (!['hosted_chat_api', 'github_actions_codex'].includes(m.execution_environment)) errors.push('invalid execution environment: ' + p.id);
      if (m.cost_tier === 'high' && m.requires_approval !== true) errors.push('high cost requires approval: ' + p.id);
      if (m.type === 'coding_agent' && (m.requires_approval !== true || m.execution_environment === 'hosted_chat_api')) errors.push('coding agent requires approval and runner: ' + p.id);
      if (m.type === 'hosted_chat' && m.execution_environment !== 'hosted_chat_api') errors.push('hosted chat requires chat API: ' + p.id);
    }
  }
  return errors;
}

function publicRegistry(env) {
  const copy = JSON.parse(JSON.stringify(registry));
  for (const p of copy.providers) p.configured = Boolean((env || {})[p.env_key]);
  return copy;
}

function findModel(providerId, idOrAlias) {
  const provider = registry.providers.find(p => p.id === providerId);
  return provider && provider.models.find(m => m.id === idOrAlias || m.alias === idOrAlias) || null;
}

module.exports = { validateRegistry, publicRegistry, findModel };
