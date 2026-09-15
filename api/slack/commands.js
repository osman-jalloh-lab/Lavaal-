// api/slack/commands.js — Slack slash-command endpoint (Vercel serverless).
// POST /api/slack/commands
//
// Ticket 02: /lavaall acks with RECEIVED immediately. Do not block on AI
// work. Signature + replay checks live in ./_lib.js.

const { json, parseForm, recordTask, withVerifiedSlackRequest } = require('./_lib');

async function commands(req, res) {
  return withVerifiedSlackRequest(req, res, (rawBody) => {
    const form = parseForm(rawBody);
    const command = typeof form.command === 'string' ? form.command.trim() : '';
    const text = typeof form.text === 'string' ? form.text : '';

    recordTask({
      kind: 'slash_command',
      command,
      text,
      userId: typeof form.user_id === 'string' ? form.user_id : '',
      channelId: typeof form.channel_id === 'string' ? form.channel_id : '',
      responseUrl: typeof form.response_url === 'string' ? form.response_url : '',
      triggerId: typeof form.trigger_id === 'string' ? form.trigger_id : '',
    });

    return json(res, 200, { response_type: 'ephemeral', text: 'RECEIVED' });
  });
}

commands.config = { api: { bodyParser: false } };
module.exports = commands;
