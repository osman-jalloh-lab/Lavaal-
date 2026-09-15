// api/slack/interactions.js — Slack interactivity endpoint (Vercel serverless).
// POST /api/slack/interactions
//
// Ticket 05: Approve / Edit / Reject (action_ids approve_task, edit_task,
// reject_task). AuditEvent is console.log JSON. approve → bridge.

const { continueAfterAck, getTask, json, parseForm, recordTask, updateTask, withVerifiedSlackRequest } = require('./_lib');
const { ACTION_IDS, logAuditEvent, parseActionValue } = require('./_router/approval');
const { postLavalHandoff } = require('./_router/bridge');
const { STATUSES } = require('./_router/status');

function actionUserId(payload) {
  return payload.user && typeof payload.user.id === 'string' ? payload.user.id : '';
}

function actionChannelId(payload) {
  return payload.channel && typeof payload.channel.id === 'string' ? payload.channel.id : '';
}

function resolveTaskFromAction(action, payload) {
  const fromValue = parseActionValue(action && action.value);
  if (fromValue) {
    const existing = getTask(fromValue.id);
    if (existing) {
      return Object.assign({}, existing, fromValue, {
        classification: existing.classification || {
          verb: fromValue.verb,
          risk: fromValue.risk,
          leadAgent: fromValue.lead,
          helperAgents: fromValue.helpers || [],
          skills: fromValue.skills || [],
        },
      });
    }
    return {
      id: fromValue.id,
      text: fromValue.text || '',
      verb: fromValue.verb,
      risk: fromValue.risk,
      leadAgent: fromValue.lead,
      helperAgents: fromValue.helpers || [],
      skills: fromValue.skills || [],
      channelId: fromValue.channel || actionChannelId(payload),
      thread_ts: fromValue.thread_ts || '',
      userId: fromValue.user || actionUserId(payload),
      classification: {
        verb: fromValue.verb,
        risk: fromValue.risk,
        leadAgent: fromValue.lead,
        helperAgents: fromValue.helpers || [],
        skills: fromValue.skills || [],
      },
    };
  }
  return null;
}

async function interactions(req, res) {
  return withVerifiedSlackRequest(req, res, async (rawBody) => {
    const form = parseForm(rawBody);
    if (typeof form.payload !== 'string' || !form.payload) {
      return json(res, 400, { error: 'missing_payload' });
    }

    let payload;
    try {
      payload = JSON.parse(form.payload);
    } catch {
      return json(res, 400, { error: 'invalid_payload' });
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return json(res, 400, { error: 'invalid_payload' });
    }

    const actions = Array.isArray(payload.actions) ? payload.actions : [];
    const actionIds = actions
      .map((action) => (action && typeof action.action_id === 'string' ? action.action_id : ''))
      .filter(Boolean);
    const primary = actions[0] || {};
    const actionId = typeof primary.action_id === 'string' ? primary.action_id : '';
    const userId = actionUserId(payload);
    const channelId = actionChannelId(payload);
    const taskLike = resolveTaskFromAction(primary, payload);

    recordTask({
      kind: 'interaction',
      type: typeof payload.type === 'string' ? payload.type : '',
      actionIds,
      userId,
      channelId,
      callbackId: typeof payload.callback_id === 'string' ? payload.callback_id : '',
      relatedTaskId: taskLike ? taskLike.id : '',
    });

    switch (actionId) {
      case ACTION_IDS.approve: {
        const taskId = taskLike ? taskLike.id : '(unknown)';
        logAuditEvent({
          action: ACTION_IDS.approve,
          taskId,
          userId,
          risk: taskLike && taskLike.risk,
          result: 'approve_bridge',
        });
        if (taskLike && taskLike.id) {
          updateTask(taskLike.id, { status: STATUSES.CLASSIFIED, approvedBy: userId });
        }
        return continueAfterAck(
          res,
          200,
          { response_type: 'ephemeral', text: `Approved · bridging task ${taskId}` },
          () => postLavalHandoff(taskLike || { id: taskId, text: '', userId, channelId }),
        );
      }
      case ACTION_IDS.reject: {
        const taskId = taskLike ? taskLike.id : '(unknown)';
        logAuditEvent({
          action: ACTION_IDS.reject,
          taskId,
          userId,
          risk: taskLike && taskLike.risk,
          result: 'rejected',
        });
        if (taskLike && taskLike.id) updateTask(taskLike.id, { status: STATUSES.DONE, outcome: 'rejected', rejectedBy: userId });
        return json(res, 200, {
          response_type: 'ephemeral',
          text: `Rejected task ${taskId}. No handoff posted.`,
        });
      }
      case ACTION_IDS.edit: {
        const taskId = taskLike ? taskLike.id : '(unknown)';
        logAuditEvent({
          action: ACTION_IDS.edit,
          taskId,
          userId,
          risk: taskLike && taskLike.risk,
          result: 'edit_resubmit',
        });
        if (taskLike && taskLike.id) {
          updateTask(taskLike.id, { status: STATUSES.DONE, outcome: 'edit_requested', editedBy: userId });
        }
        return json(res, 200, {
          response_type: 'ephemeral',
          text: `Edit requested for task ${taskId}. Resubmit with /lavaall and the revised text.`,
        });
      }
      default:
        return json(res, 200, { ok: true });
    }
  });
}

interactions.config = { api: { bodyParser: false } };
module.exports = interactions;
