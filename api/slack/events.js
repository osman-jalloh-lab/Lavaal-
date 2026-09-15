// api/slack/events.js — Slack Events API endpoint (Vercel serverless).
// POST /api/slack/events
//
// Ticket 02: url_verification challenge + app_mention ack in ≤3s.
// Signature + replay checks live in ./_lib.js. No Grok/council work here.

const { json, recordTask, withVerifiedSlackRequest } = require('./_lib');

async function events(req, res) {
  return withVerifiedSlackRequest(req, res, (rawBody) => {
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
          recordTask({
            kind: 'app_mention',
            eventId: payload.event_id || '',
            userId: event.user || '',
            channelId: event.channel || '',
            text: typeof event.text === 'string' ? event.text : '',
            ts: event.ts || event.event_ts || '',
          });
        } else {
          recordTask({
            kind: 'event_callback',
            eventType: event.type || 'unknown',
            eventId: payload.event_id || '',
          });
        }
        return json(res, 200, { ok: true });
      }
      default:
        return json(res, 200, { ok: true, ignored: true });
    }
  });
}

events.config = { api: { bodyParser: false } };
module.exports = events;
