// api/slack/interactions.js — Slack interactivity endpoint (Vercel serverless).
// POST /api/slack/interactions
//
// Ticket 02: stub for Approve / Edit / Reject buttons. Verify signature,
// ack in ≤3s, record a log-only task. No message updates or AI work.

const { json, parseForm, recordTask, withVerifiedSlackRequest } = require('./_lib');

async function interactions(req, res) {
  return withVerifiedSlackRequest(req, res, (rawBody) => {
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

    recordTask({
      kind: 'interaction',
      type: typeof payload.type === 'string' ? payload.type : '',
      actionIds,
      userId: payload.user && typeof payload.user.id === 'string' ? payload.user.id : '',
      channelId: payload.channel && typeof payload.channel.id === 'string' ? payload.channel.id : '',
      callbackId: typeof payload.callback_id === 'string' ? payload.callback_id : '',
    });

    // Empty-ish 200: a richer body can be treated as a message replacement.
    return json(res, 200, { ok: true });
  });
}

interactions.config = { api: { bodyParser: false } };
module.exports = interactions;
