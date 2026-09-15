// Shared classify → record → L0–L4 gate for slash commands and mentions.
const { getTask, recordTask, updateTask } = require('../_lib');
const { classify } = require('./classify');
const { founderAckText, postLavalHandoff, replyInThread } = require('./bridge');
const { buildApprovalMessage } = require('./approval');
const { STATUSES, needsApproval } = require('./status');

function planRoute({
  kind,
  text,
  source,
  userId,
  channelId,
  threadTs,
  responseUrl,
  extra,
}) {
  const classification = classify({ text, source });
  const task = recordTask({
    kind,
    text,
    userId: userId || '',
    channelId: channelId || '',
    thread_ts: threadTs || '',
    responseUrl: responseUrl || '',
    source: source || '',
    status: STATUSES.RECEIVED,
    ...(extra || {}),
  });

  updateTask(task.id, {
    status: STATUSES.CLASSIFIED,
    classification,
    verb: classification.verb,
    area: classification.area,
    complexity: classification.complexity,
    risk: classification.risk,
    leadAgent: classification.leadAgent,
    helperAgents: classification.helperAgents,
    skills: classification.skills,
    reasons: classification.reasons,
    mode: classification.mode,
  });

  const recorded = getTask(task.id);
  const approval = needsApproval(classification.risk);
  if (approval) {
    updateTask(task.id, { status: STATUSES.AWAITING_APPROVAL });
    return {
      task: getTask(task.id),
      classification,
      needsApproval: true,
      founderText: founderAckText(classification, task.id),
      approvalMessage: buildApprovalMessage(getTask(task.id), classification),
    };
  }

  return {
    task: recorded,
    classification,
    needsApproval: false,
    founderText: founderAckText(classification, task.id),
    background: async () => postLavalHandoff(getTask(task.id) || recorded),
  };
}

async function postMentionFollowUp(plan) {
  const channel = plan.task.channelId;
  const thread_ts = plan.task.thread_ts;
  if (plan.needsApproval) {
    return replyInThread({
      channel,
      thread_ts,
      text: plan.approvalMessage.text,
      blocks: plan.approvalMessage.blocks,
    });
  }
  const ack = await replyInThread({
    channel,
    thread_ts,
    text: plan.founderText,
  });
  const bridged = await plan.background();
  return { ack, bridged };
}

module.exports = {
  planRoute,
  postMentionFollowUp,
};
