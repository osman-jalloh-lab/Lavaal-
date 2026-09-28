// POST /api/sms/inbound — Twilio Messaging webhook for the founders line.
// Signature required. Empty TwiML. No auto-reply text. Flag off returns 404.

const { handleSmsInbound } = require('../ops/_sms');

async function inbound(req, res) {
  return handleSmsInbound(req, res);
}

module.exports = inbound;
