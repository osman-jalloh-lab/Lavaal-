// Ticket 05 — Contextual chat bridge.
// CEO router (api/slack/_router/classify) stays lead.
// Anthropic/OpenAI are helpers only when env keys exist. No fake replies.
// Drafts only: never send mail, deploy, or mutate store without confirm.
// Underscore prefix: not a Vercel function. No npm.

const { classify, CEO_ID } = require('../slack/_router/classify');
const { talkToCeo } = require('./_ceo_bridge');
const { TALK_AGENT_IDS } = require('./_office');
const {
  addChatProposals,
  appendChatTurn,
  getSharedChat,
  notesSelectableForChat,
  readStore,
  resolveChatContext,
} = require('./_store');

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const SETUP_COPY = 'LAVAALL OS assistant is not connected. Set ANTHROPIC_API_KEY or OPENAI_API_KEY on the Vercel project (helpers only — lavaall-ceo remains lead). Slack Command Center stays secondary. No reply was invented.';

function hasKey(name) {
  const value = process.env[name];
  return typeof value === 'string' && value.trim() !== '';
}

function anthropicConfigured() {
  return hasKey('ANTHROPIC_API_KEY');
}

function openaiConfigured() {
  return hasKey('OPENAI_API_KEY');
}

function modelConfigured() {
  return anthropicConfigured() || openaiConfigured();
}

function describeChatSetup() {
  return {
    anthropic: anthropicConfigured(),
    openai: openaiConfigured(),
    modelConfigured: modelConfigured(),
    lead: CEO_ID,
    framing: 'LAVAALL OS assistant',
  };
}

function looksLikeNextStepAsk(text) {
  return /\bnext step\b|\bnext action\b|what should we do next/i.test(String(text || ''));
}

function groundedReply(question, context) {
  if (!looksLikeNextStepAsk(question)) return null;
  if (context && context.goal) {
    if (context.goal.nextStep) {
      return `From the selected goal “${context.goal.title}”: the next step is “${context.goal.nextStep}”.`;
    }
    return `The selected goal “${context.goal.title}” has no next step saved yet. Add one under You.`;
  }
  const task = context && Array.isArray(context.tasks)
    ? (context.tasks.find((item) => item.nextAction) || context.tasks[0])
    : null;
  if (task) {
    if (task.nextAction) {
      return `From the selected task “${task.title}”: the next action is “${task.nextAction}”.`;
    }
    return `The selected task “${task.title}” has no next action saved.`;
  }
  return 'No goal or task is selected, so there is no stored next step to read. Select a goal or task before sending, or save one first.';
}

function formatContextBlock(context) {
  const lines = ['Selected context (visible to the founder before send):'];
  if (!context || !context.selected) {
    lines.push('None selected.');
    return lines.join('\n');
  }
  if (context.goal) {
    lines.push(`Goal: ${context.goal.title}`);
    if (context.goal.definitionOfDone) lines.push(`Definition of done: ${context.goal.definitionOfDone}`);
    if (context.goal.nextStep) lines.push(`Next step: ${context.goal.nextStep}`);
    if (context.goal.targetDate) lines.push(`Target date: ${context.goal.targetDate}`);
  }
  (context.tasks || []).forEach((task) => {
    lines.push(`Task: ${task.title} (${task.status || 'todo'})`);
    if (task.nextAction) lines.push(`Task next action: ${task.nextAction}`);
  });
  (context.notes || []).forEach((note) => {
    lines.push(`Note: ${note.title}${note.body ? ` — ${note.body}` : ''}`);
  });
  return lines.join('\n');
}

function systemPrompt(route, context) {
  const helpers = Array.isArray(route && route.helperAgents) ? route.helperAgents.join(', ') : 'none';
  return [
    'You are the LAVAALL OS assistant, a helper to lead agent lavaall-ceo.',
    `CEO router: lead=${route && route.leadAgent || CEO_ID} verb=${route && route.verb || ''} risk=${route && route.risk || ''} helpers=${helpers}.`,
    'Use only the selected goal/task/note records. Do not invent prices, SKUs, legal positions, owners, or completions.',
    'Drafts only. Never send mail, never deploy, never claim a store write happened.',
    'If you propose a store change, append one fenced JSON block: ```LAVAALL_DRAFT\\n{"kind":"add-note","title":"...","body":"..."}\\n```',
    'Allowed draft kinds: save-goal, add-task, add-note, update-task. No send-mail or deploy kinds.',
    formatContextBlock(context),
  ].join('\n');
}

function extractDrafts(text) {
  const raw = String(text || '');
  const match = raw.match(/```LAVAALL_DRAFT\s*([\s\S]*?)```/);
  if (!match) return { text: raw.trim(), drafts: [] };
  let parsed;
  try {
    parsed = JSON.parse(match[1]);
  } catch {
    return { text: raw.replace(match[0], '').trim(), drafts: [] };
  }
  const list = Array.isArray(parsed) ? parsed : [parsed];
  const drafts = list.filter((item) => item && typeof item === 'object' && [
    'save-goal', 'add-task', 'add-note', 'update-task',
  ].includes(item.kind));
  return { text: raw.replace(match[0], '').trim(), drafts };
}

function setupMessage(route) {
  const lead = route && route.leadAgent ? route.leadAgent : CEO_ID;
  return `${SETUP_COPY} Router lead=${lead}.`;
}

function helperFailedMessage(status) {
  return `The connected helper failed (HTTP ${status || 'unknown'}). Slack remains available as secondary. No invented reply.`;
}

async function completeAnthropic({ question, context, route }) {
  const response = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPS_CHAT_ANTHROPIC_MODEL || 'claude-3-5-haiku-20241022',
      max_tokens: 600,
      system: systemPrompt(route, context),
      messages: [{ role: 'user', content: question }],
    }),
  });
  if (!response.ok) return { error: 'helper_failed', status: response.status, message: helperFailedMessage(response.status) };
  const payload = await response.json();
  const text = payload && Array.isArray(payload.content)
    ? payload.content.map((part) => part && part.text).filter(Boolean).join('\n')
    : '';
  if (!text.trim()) return { error: 'helper_failed', status: response.status, message: helperFailedMessage(response.status) };
  return { text: text.trim(), provider: 'anthropic' };
}

async function completeOpenAI({ question, context, route }) {
  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPS_CHAT_OPENAI_MODEL || 'gpt-4o-mini',
      max_tokens: 600,
      messages: [
        { role: 'system', content: systemPrompt(route, context) },
        { role: 'user', content: question },
      ],
    }),
  });
  if (!response.ok) return { error: 'helper_failed', status: response.status, message: helperFailedMessage(response.status) };
  const payload = await response.json();
  const text = payload && payload.choices && payload.choices[0] && payload.choices[0].message
    ? payload.choices[0].message.content
    : '';
  if (!String(text).trim()) return { error: 'helper_failed', status: response.status, message: helperFailedMessage(response.status) };
  return { text: String(text).trim(), provider: 'openai' };
}

async function completeWithModel(input) {
  if (anthropicConfigured()) return completeAnthropic(input);
  if (openaiConfigured()) return completeOpenAI(input);
  return { error: 'unconfigured', message: setupMessage(input.route) };
}

function trimQuestion(value) {
  return typeof value === 'string' ? value.trim().slice(0, 2000) : '';
}

function pinTalkAgent(route, agentId) {
  const id = String(agentId || '').trim();
  if (!TALK_AGENT_IDS.includes(id)) return route;
  const helpers = Array.isArray(route && route.helperAgents)
    ? route.helperAgents.filter((item) => item && item !== id)
    : [];
  return Object.assign({}, route, {
    leadAgent: id,
    helperAgents: helpers,
    mode: 'agent',
  });
}

async function sendChatTurn({ question, selection, createdBy, agentId }) {
  const text = trimQuestion(question);
  if (!text) return { error: 'invalid_message' };
  if (String(agentId || '').trim() === CEO_ID) {
    const queued = await talkToCeo({
      text,
      founderEmail: createdBy,
      source: 'ops-chat',
    });
    if (queued.error) return queued;
    return {
      ok: true,
      reply: queued.reply,
      setup: false,
      usedModel: Boolean(queued.usedModel),
      grounded: false,
      provider: queued.provider || '',
      ceoBridge: true,
      waiting: Boolean(queued.waiting),
      context: { selected: false, summary: 'CEO Talk' },
      route: {
        leadAgent: CEO_ID,
        helperAgents: [],
        verb: 'talk',
        risk: 'L2',
        mode: 'agent',
      },
      thread: queued.thread,
    };
  }

  const storeData = await readStore();
  const context = resolveChatContext(storeData, selection);
  const route = pinTalkAgent(classify({ text, source: 'ops_chat' }), agentId);
  const grounded = groundedReply(text, context);

  let replyText;
  let setup = false;
  let usedModel = false;
  let groundedUsed = false;
  let drafts = [];
  let provider = '';

  if (grounded) {
    replyText = grounded;
    groundedUsed = true;
  } else if (modelConfigured()) {
    let model;
    try {
      model = await completeWithModel({ question: text, context, route });
    } catch {
      model = { error: 'helper_failed', message: helperFailedMessage('network') };
    }
    if (model.error) {
      replyText = model.message;
      setup = true;
    } else {
      const extracted = extractDrafts(model.text);
      replyText = extracted.text || 'Helper returned an empty draft. Nothing was applied.';
      drafts = extracted.drafts;
      usedModel = true;
      provider = model.provider;
    }
  } else {
    replyText = setupMessage(route);
    setup = true;
  }

  await appendChatTurn({
    user: { text, createdBy, contextSummary: context.summary },
    assistant: {
      text: replyText,
      createdBy: 'lavaall-os',
      leadAgent: route.leadAgent,
      helperAgents: route.helperAgents,
      grounded: groundedUsed,
      setup,
      contextSummary: context.summary,
    },
  });
  if (drafts.length) await addChatProposals(drafts);

  const after = await readStore();
  return {
    ok: true,
    reply: replyText,
    setup,
    usedModel,
    grounded: groundedUsed,
    provider,
    context,
    route: {
      leadAgent: route.leadAgent,
      helperAgents: route.helperAgents,
      verb: route.verb,
      risk: route.risk,
      mode: route.mode,
    },
    chat: getSharedChat(after),
  };
}

function selectableContext(storeData) {
  return {
    goal: storeData && storeData.goal ? storeData.goal : null,
    tasks: storeData && Array.isArray(storeData.tasks) ? storeData.tasks : [],
    notes: notesSelectableForChat(storeData || {}),
  };
}

module.exports = {
  CEO_ID,
  SETUP_COPY,
  TALK_AGENT_IDS,
  completeWithModel,
  describeChatSetup,
  extractDrafts,
  formatContextBlock,
  groundedReply,
  looksLikeNextStepAsk,
  modelConfigured,
  pinTalkAgent,
  selectableContext,
  sendChatTurn,
  setupMessage,
  systemPrompt,
};
