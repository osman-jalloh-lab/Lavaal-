// Reviewed provider metadata; no provider credentials are returned to callers.
'use strict';
const registry = require('../../tools/lavaall-ai/providers.json');

function validateRegistry(reg) {
  const errors = [];
  if (!reg || typeof reg !== 'object' || Array.isArray(reg)) return ['registry must be an object'];
  const secretField = /secret|password|credential|token|api_key|private_key|authorization/i;
  const secretValue = /sk-(?:test|live|ant)|ghp_|github_pat_|xai-|\bbearer\s+\S+/i;
  function inspect(value, path) {
    if (typeof value === 'string' && secretValue.test(value)) errors.push('secret-like value: ' + path);
    else if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        if (secretField.test(key) && key !== 'env_key') errors.push('secret-like field: ' + path + '.' + key);
        inspect(child, path + '.' + key);
      }
    }
  }
  function fields(obj, allowed, path) {
    for (const key of Object.keys(obj)) if (!allowed.includes(key)) errors.push('unknown field: ' + path + '.' + key);
  }
  function strings(value) { return Array.isArray(value) && value.every(v => typeof v === 'string' && v.length > 0); }
  function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
  inspect(reg, 'registry');
  fields(reg, ['schema_version', 'reviewed', 'default_chat_provider', 'disabled_providers', 'providers', 'agents', 'skills'], 'registry');
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
    if (!object(p)) { errors.push('invalid provider'); continue; }
    fields(p, ['id', 'label', 'vendor', 'env_key', 'enabled', 'default_model', 'models'], 'provider');
    if (typeof p.env_key === 'string' && !/^[A-Z][A-Z0-9_]*$/.test(p.env_key)) errors.push('invalid env key name: ' + p.id);
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
      if (!object(m)) { errors.push('invalid model: ' + p.id); continue; }
      fields(m, ['id', 'alias', 'label', 'type', 'execution_environment', 'cost_tier', 'requires_approval', 'account_verified', 'notes'], 'model');
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
  const skillIds = ['codebase-inspection', 'frontend-design', 'github-code-review', 'test-driven-development', 'project-starter', 'repo-change-planner', 'build-validation-runner', 'skill-registry-maintenance', 'obsidian'];
  const skills = Array.isArray(reg.skills) ? reg.skills : [];
  const seenSkills = new Set();
  if (skills.length !== skillIds.length) errors.push('invalid skills count');
  for (const skill of skills) {
    if (!object(skill)) { errors.push('invalid skill'); continue; }
    fields(skill, ['id', 'name', 'purpose', 'source', 'source_path', 'source_sha', 'class', 'reviewed', 'execution_allowed'], 'skill');
    if (!skillIds.includes(skill.id) || seenSkills.has(skill.id)) errors.push('invalid or duplicate skill id');
    seenSkills.add(skill.id);
    if (!['name', 'purpose', 'source_path', 'source_sha'].every(k => typeof skill[k] === 'string' && skill[k])) errors.push('invalid skill fields: ' + skill.id);
    if (skill.source !== 'myos' || skill.class !== 'instructions_only' || skill.reviewed !== false || skill.execution_allowed !== false || !/^[0-9a-f]{40}$/.test(skill.source_sha)) errors.push('invalid skill policy: ' + skill.id);
  }
  const agentIds = ['codex-engineering', 'claude-engineering', 'deepseek-engineering', 'grok-engineering'];
  const agents = Array.isArray(reg.agents) ? reg.agents : [];
  const seenAgents = new Set();
  if (agents.length !== agentIds.length) errors.push('invalid agents count');
  for (const agent of agents) {
    if (!object(agent)) { errors.push('invalid agent'); continue; }
    fields(agent, ['id', 'label', 'role', 'providers', 'models', 'tools', 'skills', 'cost_class', 'approval_requirements', 'notes'], 'agent');
    if (!agentIds.includes(agent.id) || seenAgents.has(agent.id)) errors.push('invalid or duplicate agent id');
    seenAgents.add(agent.id);
    if (!['label', 'role'].every(k => typeof agent[k] === 'string' && agent[k].trim()) || typeof agent.notes !== 'string') errors.push('invalid agent fields: ' + agent.id);
    if (!['providers', 'models', 'tools', 'skills'].every(k => strings(agent[k]))) { errors.push('invalid agent arrays: ' + agent.id); continue; }
    const agentProviders = providers.filter(p => p && agent.providers.includes(p.id));
    if (agent.providers.some(id => !ids.has(id))) errors.push('unknown agent provider: ' + agent.id);
    if (agent.models.some(id => !agentProviders.some(p => Array.isArray(p.models) && p.models.some(m => m && m.id === id)))) errors.push('unknown agent model: ' + agent.id);
    if (agent.skills.some(id => !seenSkills.has(id))) errors.push('unknown agent skill: ' + agent.id);
    if (!['low', 'standard', 'high', 'model_specific'].includes(agent.cost_class)) errors.push('invalid agent cost class: ' + agent.id);
    const approval = agent.approval_requirements;
    if (!object(approval)) { errors.push('invalid agent approval: ' + agent.id); continue; }
    fields(approval, ['hosted_chat', 'coding_agent', 'cost_approval_models'], 'approval_requirements');
    if (typeof approval.hosted_chat !== 'boolean' || typeof approval.coding_agent !== 'boolean' || !strings(approval.cost_approval_models) || approval.cost_approval_models.some(id => !agent.models.includes(id))) errors.push('invalid agent approval: ' + agent.id);
    if (agent.id === 'codex-engineering' && approval.coding_agent !== true) errors.push('codex coding agent requires approval');
    if (agent.id === 'claude-engineering' && (!Array.isArray(approval.cost_approval_models) || ['claude-sonnet-4-5', 'claude-haiku-4-5', 'claude-opus-4-5'].some(id => !approval.cost_approval_models.includes(id)))) errors.push('claude models require cost approval');
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
