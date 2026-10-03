// Setup-code delivery. TEST MODE ONLY in this build.
//
// Three channels, one interface each: { name, configured(), buildRequest(msg), send() }.
//   email    -> Resend (the provider /ops already uses: RESEND_API_KEY + a
//               verified sender). Customer gets their setup code.
//   whatsapp -> WhatsApp Cloud API (Meta). Customer gets their setup code.
//   team     -> the existing Customer Requests path (CONTACT_WEBHOOK_URL ->
//               scripts/email-router/contact-router.gs), same payload shape
//               as api/contact.js, routed to the Starlink team inbox.
//
// Nothing is ever sent from here. prepare() records the exact message each
// channel WOULD send into the outbox (status "recorded_test_mode",
// sent:false) and returns tap-to-send links the visitor can use themselves.
// send() always throws. Turning on real delivery is a separate, approved
// change (see docs/starlink/README.md, "Turning on real delivery").
const crypto = require('crypto');
const store = require('./store');
const { summary } = require('./recommend');

const DISCLAIMER = 'LAVAALL is not affiliated with or endorsed by Starlink or SpaceX.';
const PLACEHOLDER_WA = '00000000000';

function config() {
  const wa = String(process.env.STARLINK_WHATSAPP_NUMBER || '').replace(/[^0-9]/g, '');
  return {
    teamEmail: String(process.env.STARLINK_TEAM_EMAIL || 'support@lavaall.com').trim(),
    fromEmail: String(process.env.STARLINK_FROM_EMAIL || 'support@lavaall.com').trim(),
    businessWhatsapp: wa || PLACEHOLDER_WA,
    businessWhatsappIsPlaceholder: !wa,
  };
}

// Contact destinations the page uses for its WhatsApp / Call / Email links.
// Server-configured (optional env vars, none required); the v4 placeholders
// stay as the defaults so nothing changes until real numbers are set.
const PLACEHOLDER_CALL = '+00000000000';
const PLACEHOLDER_EMAIL = 'hello@lavaall.com';
function publicContact() {
  const c = config();
  const call = String(process.env.STARLINK_CALL_NUMBER || '').replace(/[^0-9]/g, '');
  const email = String(process.env.STARLINK_CONTACT_EMAIL || process.env.STARLINK_TEAM_EMAIL || '').trim();
  const okEmail = /^[^\s@<>"'`]+@[^\s@<>"'`]+\.[^\s@<>"'`]{2,}$/.test(email);
  return {
    whatsapp: 'https://wa.me/' + c.businessWhatsapp,
    call: 'tel:' + (call ? '+' + call : PLACEHOLDER_CALL),
    email: okEmail ? email : PLACEHOLDER_EMAIL,
    placeholders: { whatsapp: c.businessWhatsappIsPlaceholder, call: !call, email: !okEmail },
  };
}

function liveBlocked() {
  const e = new Error('live_delivery_not_enabled');
  e.code = 'live_delivery_not_enabled';
  throw e;
}

const providers = {
  email: {
    name: 'resend',
    configured: () => Boolean(process.env.RESEND_API_KEY),
    buildRequest: (msg) => ({
      method: 'POST',
      url: 'https://api.resend.com/emails',
      headers: { Authorization: 'Bearer <RESEND_API_KEY>', 'Content-Type': 'application/json' },
      body: { from: config().fromEmail, to: [msg.to], reply_to: config().teamEmail, subject: msg.subject, text: msg.text },
    }),
    send: liveBlocked,
  },
  whatsapp: {
    name: 'whatsapp-cloud',
    configured: () => Boolean(process.env.STARLINK_WHATSAPP_TOKEN && process.env.STARLINK_WHATSAPP_PHONE_ID),
    buildRequest: (msg) => ({
      method: 'POST',
      url: 'https://graph.facebook.com/v20.0/<STARLINK_WHATSAPP_PHONE_ID>/messages',
      headers: { Authorization: 'Bearer <STARLINK_WHATSAPP_TOKEN>', 'Content-Type': 'application/json' },
      // Note: WhatsApp only allows free-form text inside a 24h customer
      // window. A first message needs an approved template; see README.
      body: { messaging_product: 'whatsapp', to: msg.to.replace(/^\+/, ''), type: 'text', text: { body: msg.text } },
    }),
    send: liveBlocked,
  },
  team: {
    name: 'contact-webhook',
    configured: () => Boolean(process.env.CONTACT_WEBHOOK_URL),
    buildRequest: (msg) => ({
      method: 'POST',
      url: '<CONTACT_WEBHOOK_URL>',
      headers: { 'Content-Type': 'application/json' },
      body: msg.payload,
    }),
    send: liveBlocked,
  },
};

function mode() {
  return 'test';
}

function status() {
  return {
    mode: mode(),
    sends: false,
    channels: Object.fromEntries(Object.entries(providers).map(([k, p]) => [k, { provider: p.name, configured: p.configured(), live: false }])),
  };
}

function itemsLine(record) {
  return (record.recommendation && record.recommendation.labels || []).join(', ');
}

function customerText(record) {
  return [
    'Hi from LAVAALL.',
    `Your Starlink setup code is ${record.code}.`,
    `${record.recommendation.title}: ${itemsLine(record)}`,
    summary(record.answers),
    "We'll confirm pricing and install timing after we review your setup. Reply here with any questions.",
    DISCLAIMER,
  ].join('\n');
}

function visitorToLavaallText(record) {
  return [
    "Hi LAVAALL, I'd like to get connected.",
    `Setup code: ${record.code}`,
    summary(record.answers),
    `Need: ${record.answers.need}`,
    `Priority: ${record.answers.priority}`,
    `Recommended: ${itemsLine(record)}`,
  ].join('\n');
}

function gmailCompose(to, su, body) {
  const p = new URLSearchParams();
  p.set('view', 'cm'); p.set('fs', '1'); p.set('to', to);
  if (su) p.set('su', su);
  if (body) p.set('body', body);
  return 'https://mail.google.com/mail/?' + p.toString();
}

function links(record) {
  const c = config();
  const text = visitorToLavaallText(record);
  const subject = `Starlink setup ${record.code}`;
  return {
    whatsapp: `https://wa.me/${c.businessWhatsapp}?text=${encodeURIComponent(text)}`,
    whatsappIsPlaceholder: c.businessWhatsappIsPlaceholder,
    email: gmailCompose(c.teamEmail, subject, text),
    mailto: `mailto:${c.teamEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`,
  };
}

function teamPayload(record) {
  const lead = record.lead || {};
  return {
    routeTo: config().teamEmail,
    subject: `[Lavaall Website - Starlink Setup] ${record.code} ${record.recommendation.title}`.slice(0, 180),
    inquiryType: 'installation-services',
    name: lead.name || '',
    email: lead.email || '',
    phone: lead.whatsapp || '',
    country: record.answers.country,
    company: '',
    preferredContact: lead.whatsapp ? 'whatsapp' : 'email',
    preferredCallback: '',
    message: [
      `Starlink setup code: ${record.code}`,
      summary(record.answers),
      `Need: ${record.answers.need}`,
      `Priority: ${record.answers.priority}`,
      `Recommended: ${itemsLine(record)}`,
      `WhatsApp: ${lead.whatsapp || '-'}`,
      `Email: ${lead.email || '-'}`,
    ].join('\n'),
    receivedAt: lead.at || new Date().toISOString(),
  };
}

async function record(entry) {
  const row = {
    id: 'ob_' + crypto.randomBytes(6).toString('hex'),
    at: new Date().toISOString(),
    mode: 'test',
    sent: false,
    status: 'recorded_test_mode',
    ...entry,
  };
  await store.appendOutbox(row);
  return row;
}

// Records what would be sent for this lead. Never sends.
async function prepare(rec) {
  const lead = rec.lead || {};
  const subject = `Your LAVAALL Starlink setup code ${rec.code}`;
  const text = customerText(rec);
  const recorded = [];
  if (lead.whatsapp) {
    const msg = { to: lead.whatsapp, text };
    recorded.push(await record({ code: rec.code, channel: 'whatsapp', provider: providers.whatsapp.name, to: lead.whatsapp, text, request: providers.whatsapp.buildRequest(msg) }));
  }
  if (lead.email) {
    const msg = { to: lead.email, subject, text };
    recorded.push(await record({ code: rec.code, channel: 'email', provider: providers.email.name, to: lead.email, subject, text, request: providers.email.buildRequest(msg) }));
  }
  const payload = teamPayload(rec);
  recorded.push(await record({ code: rec.code, channel: 'team', provider: providers.team.name, to: payload.routeTo, subject: payload.subject, text: payload.message, request: providers.team.buildRequest({ payload }) }));
  return {
    mode: 'test',
    sent: false,
    recorded: recorded.map((r) => ({ id: r.id, channel: r.channel, provider: r.provider })),
    links: links(rec),
  };
}

function maskEmail(e) {
  const [u, d] = String(e).split('@');
  return d ? (u.slice(0, 1) + '***@' + d) : '***';
}
function maskPhone(p) {
  const s = String(p);
  return s.length > 4 ? s.slice(0, 4) + '****' + s.slice(-3) : '***';
}
function maskText(t) {
  return String(t || '')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, (m) => (/@lavaall\.com$/i.test(m) ? m : maskEmail(m)))
    .replace(/\+?\b[0-9]{8,15}\b/g, (m) => maskPhone(m));
}

// Outbox rows with customer contact details masked (for the test viewer).
function masked(row) {
  const out = JSON.parse(JSON.stringify(row));
  if (out.channel === 'email') out.to = maskEmail(out.to);
  if (out.channel === 'whatsapp') out.to = maskPhone(out.to);
  out.text = maskText(out.text);
  if (out.request) out.request = JSON.parse(maskText(JSON.stringify(out.request)));
  return out;
}

module.exports = { providers, mode, status, prepare, links, masked, maskEmail, maskPhone, publicContact, DISCLAIMER };
