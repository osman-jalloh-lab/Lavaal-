// api/slack/commands.js — Slack slash-command endpoint (Vercel serverless).
// POST /api/slack/commands
//
// Tickets 03–05: verify → classify → L0–L4 gate → bridge or approval.
// Ack ≤3s: ephemeral founder summary immediately; waitUntil(bridge) when
// Vercel provides it.

const { continueAfterAck, json, parseForm, withVerifiedSlackRequest } = require('./_lib');
const { planRoute } = require('./router/route-task');

async function commands(req, res) {
  return withVerifiedSlackRequest(req, res, async (rawBody) => {
    const form = parseForm(rawBody);
    const command = typeof form.command === 'string' ? form.command.trim() : '';
    const text = typeof form.text === 'string' ? form.text : '';

    const plan = planRoute({
      kind: 'slash_command',
      text,
      source: 'slash_command',
      userId: typeof form.user_id === 'string' ? form.user_id : '',
      channelId: typeof form.channel_id === 'string' ? form.channel_id : '',
      threadTs: typeof form.thread_ts === 'string' ? form.thread_ts : '',
      responseUrl: typeof form.response_url === 'string' ? form.response_url : '',
      extra: {
        command,
        triggerId: typeof form.trigger_id === 'string' ? form.trigger_id : '',
      },
    });

    if (plan.needsApproval) {
      return json(res, 200, plan.approvalMessage);
    }

    return continueAfterAck(
      res,
      200,
      { response_type: 'ephemeral', text: plan.founderText },
      plan.background,
    );
  });
}

commands.config = { api: { bodyParser: false } };
module.exports = commands;
