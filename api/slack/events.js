// api/slack/events.js — Slack Events API endpoint (Vercel serverless).
// POST /api/slack/events
//
// Tickets 03–05: url_verification unchanged. app_mention classifies,
// gates L3+, then awaits thread ack + handoff before returning { ok: true }.

const { continueAfterAck, json, recordTask, withVerifiedSlackRequest } = require('./_lib');
const { planRoute, postMentionFollowUp } = require('./_router/route-task');

async function events(req, res) {
  return withVerifiedSlackRequest(req, res, async (rawBody) => {
    let payload;
    try {
      payload = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      return json(res, 400, { error: 'invalid_json' });
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return json(res, 400, { error: 'invalid_json' });
    }

    switch (payload.type) {
      case 'url_verification': {
        if (typeof payload.challenge !== 'string' || !payload.challenge) {
          return json(res, 400, { error: 'missing_challenge' });
        }
        return json(res, 200, { challenge: payload.challenge });
      }
      case 'event_callback': {
        const event = payload.event && typeof payload.event === 'object' ? payload.event : {};
        if (event.type === 'app_mention') {
          const plan = planRoute({
            kind: 'app_mention',
            text: typeof event.text === 'string' ? event.text : '',
            source: 'app_mention',
            userId: event.user || '',
            channelId: event.channel || '',
            threadTs: event.ts || event.thread_ts || event.event_ts || '',
            extra: { eventId: payload.event_id || '', ts: event.ts || event.event_ts || '' },
          });
          return continueAfterAck(res, 200, { ok: true }, () => postMentionFollowUp(plan));
        }
        recordTask({
          kind: 'event_callback',
          eventType: event.type || 'unknown',
          eventId: payload.event_id || '',
        });
        return json(res, 200, { ok: true });
      }
      default:
        return json(res, 200, { ok: true, ignored: true });
    }
  });
}

events.config = { api: { bodyParser: false } };
module.exports = events;
