// Ticket 05 Block Kit: Approve / Edit / Reject gate for L3+.
const ACTION_IDS = Object.freeze({
  approve: 'approve_task',
  edit: 'edit_task',
  reject: 'reject_task',
});

function compactActionValue(payload) {
  const raw = JSON.stringify(payload);
  if (raw.length <= 2000) return raw;
  const trimmed = Object.assign({}, payload, { text: String(payload.text || '').slice(0, 240) });
  const again = JSON.stringify(trimmed);
  if (again.length <= 2000) return again;
  return JSON.stringify({
    id: payload.id,
    verb: payload.verb,
    risk: payload.risk,
    lead: payload.lead,
    channel: payload.channel,
    thread_ts: payload.thread_ts,
    user: payload.user,
  });
}

function parseActionValue(value) {
  if (!value || typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !parsed.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

function fieldMrkdwn(classification, task) {
  const why = Array.isArray(classification.reasons) && classification.reasons.length
    ? classification.reasons.slice(0, 4).join('; ')
    : 'L3+ risk gate';
  const expected = classification.risk === 'L4'
    ? 'Founder Approve required before any handoff. Reject stops the task.'
    : 'Bridge LAVAALL_TASK to the handoff channel after Approve.';
  return [
    `*ACTION:* ${classification.verb || 'handoff'}`,
    `*AGENT:* ${classification.leadAgent || 'lavaall-ceo'}`,
    `*WHY:* ${why}`,
    '*SYSTEM:* LAVAALL Slack Command Center',
    `*RISK:* ${classification.risk}`,
    `*EXPECTED RESULT:* ${expected}`,
    `task \`${task.id}\``,
  ].join('\n');
}

function buildApprovalBlocks(task, classification) {
  const value = compactActionValue({
    id: task.id,
    text: String(task.text || '').slice(0, 500),
    verb: classification.verb,
    risk: classification.risk,
    lead: classification.leadAgent,
    helpers: classification.helperAgents || [],
    skills: classification.skills || [],
    channel: task.channelId || task.channel || '',
    thread_ts: task.thread_ts || task.ts || '',
    user: task.userId || task.user || '',
  });

  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: 'Approval required', emoji: true },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: fieldMrkdwn(classification, task) },
    },
    {
      type: 'actions',
      block_id: `lavaall_gate_${task.id}`.slice(0, 255),
      elements: [
        {
          type: 'button',
          action_id: ACTION_IDS.approve,
          text: { type: 'plain_text', text: 'Approve', emoji: true },
          style: 'primary',
          value,
        },
        {
          type: 'button',
          action_id: ACTION_IDS.edit,
          text: { type: 'plain_text', text: 'Edit', emoji: true },
          value,
        },
        {
          type: 'button',
          action_id: ACTION_IDS.reject,
          text: { type: 'plain_text', text: 'Reject', emoji: true },
          style: 'danger',
          value,
        },
      ],
    },
  ];
}

function buildApprovalMessage(task, classification) {
  return {
    response_type: 'ephemeral',
    text: `Approval required · ${classification.risk} · task ${task.id}`,
    blocks: buildApprovalBlocks(task, classification),
  };
}

function logAuditEvent(event) {
  console.log(JSON.stringify({
    type: 'AuditEvent',
    at: new Date().toISOString(),
    ...event,
  }));
}

module.exports = {
  ACTION_IDS,
  buildApprovalBlocks,
  buildApprovalMessage,
  compactActionValue,
  logAuditEvent,
  parseActionValue,
};
