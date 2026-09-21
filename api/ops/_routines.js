// Ticket 08 — Saved routines. Manual run only. Drafts only. No mail. No schedules.
// Reuses ticket 05 helper path. Underscore prefix: not a Vercel function. No npm.

const { classify, CEO_ID } = require('../slack/_router/classify');
const {
  completeWithModel,
  describeChatSetup,
  extractDrafts,
  modelConfigured,
  setupMessage,
} = require('./_chat');
const {
  getRoutine,
  listRoutines,
  readStore,
  recordRoutineRun,
  resolveChatContext,
  updateRoutine,
} = require('./_store');

function missingRoutineInputs(routine, context) {
  const needs = routine && Array.isArray(routine.needs) ? routine.needs : [];
  const missing = [];
  needs.forEach((need) => {
    switch (need) {
      case 'goal':
        if (!context || !context.goal) missing.push('goal');
        break;
      case 'tasks':
        if (!context || !Array.isArray(context.tasks) || context.tasks.length === 0) missing.push('tasks');
        break;
      case 'notes':
        if (!context || !Array.isArray(context.notes) || context.notes.length === 0) missing.push('notes');
        break;
      default: {
        const _never = need;
        void _never;
      }
    }
  });
  return missing;
}

function missingInputMessage(routine, missing) {
  const needed = missing.join(', ');
  const hint = routine && routine.contextNote ? ` ${routine.contextNote}` : '';
  return `Missing inputs: ${needed}.${hint}`;
}

async function copyRoutinePrompt(id) {
  const storeData = await readStore();
  const routine = getRoutine(storeData, id);
  if (!routine) return { error: 'routine_not_found' };
  return { ok: true, id: routine.id, name: routine.name, prompt: routine.prompt };
}

async function runRoutine(id, { selection, createdBy } = {}) {
  const storeData = await readStore();
  const routine = getRoutine(storeData, id);
  if (!routine) return { error: 'routine_not_found' };

  const context = resolveChatContext(storeData, selection || {});
  const missing = missingRoutineInputs(routine, context);
  if (missing.length) {
    const message = missingInputMessage(routine, missing);
    await recordRoutineRun(routine.id, {
      result: message,
      status: 'missing_input',
      contextSummary: context.summary,
      createdBy,
    });
    return { error: 'missing_input', missing, message };
  }

  const route = classify({ text: routine.prompt, source: 'ops_routines' });
  if (!modelConfigured()) {
    const message = setupMessage(route);
    await recordRoutineRun(routine.id, {
      result: message,
      status: 'unconfigured',
      contextSummary: context.summary,
      createdBy,
    });
    return { error: 'unconfigured', message };
  }

  let model;
  try {
    model = await completeWithModel({ question: routine.prompt, context, route });
  } catch {
    model = { error: 'helper_failed', message: 'The connected helper failed (HTTP network). Slack remains available as secondary. No invented reply.' };
  }
  if (model.error) {
    const message = model.message || setupMessage(route);
    await recordRoutineRun(routine.id, {
      result: message,
      status: model.error === 'unconfigured' ? 'unconfigured' : 'helper_failed',
      contextSummary: context.summary,
      createdBy,
    });
    return { error: model.error === 'unconfigured' ? 'unconfigured' : 'helper_failed', message };
  }

  const extracted = extractDrafts(model.text);
  const result = extracted.text || 'Helper returned an empty draft. Nothing was applied.';
  const saved = await recordRoutineRun(routine.id, {
    result,
    status: 'ok',
    contextSummary: context.summary,
    createdBy,
  });
  if (saved.error) return saved;
  return {
    ok: true,
    usedModel: true,
    provider: model.provider,
    result,
    routine: saved.routine,
    run: saved.run,
    lead: CEO_ID,
  };
}

function routinesPayload(storeData) {
  return {
    routines: listRoutines(storeData),
    chatSetup: describeChatSetup(),
  };
}

module.exports = {
  copyRoutinePrompt,
  describeChatSetup,
  missingRoutineInputs,
  runRoutine,
  routinesPayload,
  updateRoutine,
};
