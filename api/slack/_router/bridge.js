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
  return {
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

function founderAckText(classification, taskId) {
  const helpers = Array.isArray(classification.helperAgents) ? classification.helperAgents : [];
  const disconnected = helpers.filter((h) => String(h).includes('NOT CONNECTED') || String(h).includes('NOT_INVOKEABLE'));
  const base = `Routed to ${classification.leadAgent} · risk ${classification.risk} · task ${taskId}`;
  if (!disconnected.length) return base;
  return `${base} · ${disconnected.join(', ')}`;
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
  DEFAULT_HANDOFF_CHANNEL,
  SLACK_POST_MESSAGE,
  buildHandoffPayload,
  formatHandoffText,
  formatLavalTaskFence,
  founderAckText,
  handoffChannel,
  postLavalHandoff,
  replyInThread,
  replyViaResponseUrl,
  slackPostMessage,
};
