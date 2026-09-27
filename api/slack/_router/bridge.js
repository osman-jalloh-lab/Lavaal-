// Slack Web API helpers. Vercel cannot invoke Grok/Claude/ChatGPT bots
// directly; the bridge is chat.postMessage of a structured LAVAALL_TASK
// into the handoff channel using SLACK_BOT_TOKEN.
const { updateTask } = require('../_lib');
const { STATUSES } = require('./status');

const SLACK_POST_MESSAGE = 'https://slack.com/api/chat.postMessage';
const DEFAULT_HANDOFF_CHANNEL = 'C0C1V0HN3GA';

function handoffChannel() {
  const fromEnv = typeof process.env.LAVAALL_HANDOFF_CHANNEL === 'string'
    ? process.env.LAVAALL_HANDOFF_CHANNEL.trim()
    : '';
  return fromEnv || DEFAULT_HANDOFF_CHANNEL;
}

function buildHandoffPayload(taskLike) {
  const classification = taskLike.classification || {};
  const payload = {
    id: taskLike.id,
    text: taskLike.text || '',
    verb: taskLike.verb || classification.verb || '',
    risk: taskLike.risk || classification.risk || '',
    lead: taskLike.lead || taskLike.leadAgent || classification.leadAgent || '',
    helpers: taskLike.helpers || taskLike.helperAgents || classification.helperAgents || [],
    skills: taskLike.skills || classification.skills || [],
    channel: taskLike.channel || taskLike.channelId || '',
    thread_ts: taskLike.thread_ts || taskLike.ts || '',
    user: taskLike.user || taskLike.userId || '',
  };
  const mode = taskLike.mode || classification.mode;
  if (mode) payload.mode = mode;
  return payload;
}

function formatLavalTaskFence(payload) {
  return ['```LAVAALL_TASK', JSON.stringify(payload, null, 2), '```'].join('\n');
}

function formatHandoffText(payload) {
  return [
    `LAVAALL_TASK ${payload.id}`,
    `lead=${payload.lead} risk=${payload.risk} verb=${payload.verb}`,
    formatLavalTaskFence(payload),
  ].join('\n');
}

const ASSIGN_BRIEF_MAX = 3500;
const ASSIGN_ORIGIN = 'https://www.lavaall.com';
const ASSIGN_REPLY_PATH = '/ops/api/desk-talk/researchy/reply';

function assignOrigin() {
  const fromEnv = typeof process.env.LAVAALL_PUBLIC_ORIGIN === 'string'
    ? process.env.LAVAALL_PUBLIC_ORIGIN.trim().replace(/\/+$/, '')
    : '';
  return fromEnv || ASSIGN_ORIGIN;
}

const SECRET_ENV_NAMES = [
  'OPS_CEO_BRIDGE_SECRET',
  'SLACK_BOT_TOKEN',
  'SLACK_SIGNING_SECRET',
  'OPS_AUTH_SECRET',
];

function scrubSecrets(text) {
  let out = typeof text === 'string' ? text : '';
  for (const name of SECRET_ENV_NAMES) {
    const value = process.env[name];
    if (typeof value !== 'string' || value.length < 8) continue;
    if (out.indexOf(value) === -1) continue;
    out = out.split(value).join('[redacted]');
  }
  return out;
}

function asAssignText(value, max) {
  const text = scrubSecrets(value == null ? '' : String(value));
  return max ? text.slice(0, max) : text;
}

function buildAssignWakePayload(input) {
  const fullBrief = asAssignText(input && input.brief);
  const briefLen = fullBrief.length;
  const payload = {
    kind: 'assign',
    taskId: asAssignText(input && input.taskId),
    pendingId: asAssignText(input && input.pendingId),
    correlationId: asAssignText(input && input.correlationId),
    threadId: asAssignText(input && input.threadId),
    title: asAssignText(input && input.title, 200),
    brief: briefLen > ASSIGN_BRIEF_MAX ? fullBrief.slice(0, ASSIGN_BRIEF_MAX) : fullBrief,
    origin: assignOrigin(),
    replyPath: ASSIGN_REPLY_PATH,
  };
  if (briefLen > ASSIGN_BRIEF_MAX) payload.briefLen = briefLen;
  return payload;
}

function formatAssignWakeFence(payload) {
  return ['```LAVAALL_ASSIGN', JSON.stringify(payload, null, 2), '```'].join('\n');
}

function formatAssignWakeText(payload) {
  const taskId = payload && payload.taskId ? payload.taskId : '';
  return [
    `LAVAALL_ASSIGN ${taskId} wake=researchy`,
    formatAssignWakeFence(payload),
  ].join('\n');
}

async function postAssignWake(input) {
  const taskId = input && input.taskId ? String(input.taskId) : '';
  try {
    const token = typeof process.env.SLACK_BOT_TOKEN === 'string'
      ? process.env.SLACK_BOT_TOKEN.trim()
      : '';
    if (!token) return { ok: true, skipped: true };
    const payload = buildAssignWakePayload(input);
    const channel = handoffChannel();
    const result = await slackPostMessage({
      channel,
      text: scrubSecrets(formatAssignWakeText(payload)),
    });
    if (!result.ok) {
      console.error('[slack] postAssignWake failed', result.error, {
        taskId: payload.taskId || null,
        channel,
      });
      return { ok: false, error: result.error || 'slack_post_failed' };
    }
    return { ok: true, channel };
  } catch (err) {
    console.error('[slack] postAssignWake threw', { taskId: taskId || null });
    void err;
    return { ok: false, error: 'post_assign_wake_failed' };
  }
}

function founderAckText(classification, taskId) {
  const helpers = Array.isArray(classification.helperAgents) ? classification.helperAgents : [];
  const disconnected = helpers.filter((h) => String(h).includes('NOT CONNECTED') || String(h).includes('NOT_INVOKEABLE'));
  const parts = [`Routed to ${classification.leadAgent} · risk ${classification.risk} · task ${taskId}`];
  if (classification.mode === 'council') {
    const connected = helpers.filter((h) => !String(h).includes('NOT CONNECTED') && !String(h).includes('NOT_INVOKEABLE'));
    if (connected.length) parts.push(`helpers ${connected.join(', ')}`);
  }
  if (disconnected.length) parts.push(disconnected.join(', '));
  return parts.join(' · ');
}

async function slackPostMessage({ channel, text, thread_ts, blocks }) {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    return { ok: false, error: 'bot_token_not_configured' };
  }
  if (typeof fetch !== 'function') {
    return { ok: false, error: 'fetch_unavailable' };
  }

  const body = { channel, text };
  if (thread_ts) body.thread_ts = thread_ts;
  if (Array.isArray(blocks) && blocks.length) body.blocks = blocks;

  const response = await fetch(SLACK_POST_MESSAGE, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(body),
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok || !data || data.ok !== true) {
    const error = (data && data.error) || `http_${response.status}`;
    return { ok: false, error, data };
  }
  return { ok: true, data };
}

async function replyInThread({ channel, thread_ts, text, blocks }) {
  return slackPostMessage({ channel, thread_ts, text, blocks });
}

async function replyViaResponseUrl(responseUrl, payload) {
  if (!responseUrl || typeof fetch !== 'function') {
    return { ok: false, error: 'response_url_unavailable' };
  }
  const response = await fetch(responseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
  });
  return { ok: response.ok, status: response.status };
}

async function postLavalHandoff(taskLike) {
  const payload = buildHandoffPayload(taskLike);
  const channel = handoffChannel();
  const result = await slackPostMessage({
    channel,
    text: formatHandoffText(payload),
  });
  if (!result.ok) {
    console.error('[slack] postLavalHandoff failed', result.error, {
      id: taskLike && taskLike.id ? taskLike.id : null,
      channel,
    });
  }
  if (taskLike.id) {
    updateTask(taskLike.id, {
      status: result.ok ? STATUSES.BRIDGED : STATUSES.FAILED,
      bridgeError: result.ok ? undefined : result.error,
      handoffChannel: channel,
    });
  }
  return { ...result, payload, channel };
}

module.exports = {
  ASSIGN_BRIEF_MAX,
  ASSIGN_ORIGIN,
  ASSIGN_REPLY_PATH,
  assignOrigin,
  DEFAULT_HANDOFF_CHANNEL,
  SLACK_POST_MESSAGE,
  buildAssignWakePayload,
  buildHandoffPayload,
  formatAssignWakeText,
  formatHandoffText,
  formatLavalTaskFence,
  founderAckText,
  handoffChannel,
  postAssignWake,
  postLavalHandoff,
  replyInThread,
  replyViaResponseUrl,
  slackPostMessage,
};
