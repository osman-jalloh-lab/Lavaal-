/**
 * LAVAALL contact-form email router — Google Apps Script Web App.
 *
 * WHY THIS EXISTS
 * api/contact.js (a Vercel serverless function) validates every Contact Us
 * submission server-side, resolves which lavaall.com mailbox it belongs to,
 * then POSTs one JSON payload to whatever URL is set as CONTACT_WEBHOOK_URL
 * in Vercel. This script IS that URL's destination: deployed under your own
 * Google Workspace account, it receives the payload and sends the email
 * with GmailApp, so the message is delivered by the real
 * support@ / sales@ / orders@ / contact@ / info@lavaall.com inboxes you
 * already have — no third-party email vendor, no new SPF/DKIM/DNS records,
 * no paid Google Workspace user, and no API key ever stored in Vercel.
 *
 * ONE-TIME SETUP (about 10 minutes)
 * 1. Sign in to script.google.com as an account that can send mail from
 *    your Workspace (e.g. as info@lavaall.com, or as an admin/delegate who
 *    can send-as each alias — see step 5).
 * 2. Create a new project, delete the boilerplate, paste this entire file.
 * 3. Edit ALLOWED_SENDER_ALIASES below if your sending identity differs.
 * 4. Set a shared secret: Project Settings -> Script Properties -> add
 *    CONTACT_WEBHOOK_SECRET with a long random value. Put the SAME value
 *    into Vercel's CONTACT_WEBHOOK_SECRET env var. This stops randoms who
 *    find the deployed URL from sending mail through your account.
 *    REQUIRED: without it, doPost refuses every request (ok:false, no send).
 * 5. Make sure the account you deploy as can actually send FROM each of
 *    support@ / sales@ / orders@ / contact@ / info@lavaall.com — either by
 *    deploying separately as each alias's own mailbox, or by adding each
 *    address as a "Send As" alias under that account's Gmail settings
 *    (Settings -> Accounts -> "Send mail as"), which Google Workspace
 *    allows for addresses on the same domain without extra paid seats.
 * 6. Deploy -> New deployment -> type "Web app" -> Execute as "Me" ->
 *    Who has access "Anyone". Copy the deployment URL.
 * 7. In Vercel: Project Settings -> Environment Variables -> add
 *    CONTACT_WEBHOOK_URL = <that deployment URL> and
 *    CONTACT_WEBHOOK_SECRET = <the same secret from step 4>. Redeploy.
 * 8. Submit one real test message from each inquiry type on the live
 *    Contact Us page and confirm it lands in the right inbox before
 *    calling this done.
 */

var ALLOWED_SENDER_ALIASES = [
  'support@lavaall.com',
  'sales@lavaall.com',
  'orders@lavaall.com',
  'contact@lavaall.com',
  'info@lavaall.com',
];

function doPost(e) {
  try {
    var secret = PropertiesService.getScriptProperties().getProperty('CONTACT_WEBHOOK_SECRET');
    var payload = JSON.parse(e.postData.contents);

    // Apps Script Web Apps cannot reliably read custom HTTP headers, so
    // api/contact.js sends the shared secret inside the JSON body instead.
    // Fail closed: with no CONTACT_WEBHOOK_SECRET Script Property, refuse every
    // request (anyone holding the /exec URL could otherwise send mail as us).
    // A blank, whitespace-only or short (< 16 chars after trimming) property counts as unset.
    if (!secret || String(secret).trim().length < 16) {
      return jsonOut({ ok: false, error: 'not_configured' }, 503);
    }
    if (typeof payload.secret !== 'string' || payload.secret !== secret) {
      return jsonOut({ ok: false, error: 'forbidden' }, 403);
    }

    var routeTo = String(payload.routeTo || '').trim();
    if (ALLOWED_SENDER_ALIASES.indexOf(routeTo) === -1) {
      return jsonOut({ error: 'invalid_route' }, 400);
    }

    var subject = String(payload.subject || 'LAVAALL Website Message').slice(0, 200);
    var lines = [
      'New message from the LAVAALL website contact form.',
      '',
      'Inquiry type: ' + (payload.inquiryType || ''),
      'Name: ' + (payload.name || ''),
      'Email: ' + (payload.email || ''),
      'Phone: ' + (payload.phone || '(not provided)'),
      'Country: ' + (payload.country || ''),
      'Company: ' + (payload.company || '(not provided)'),
      'Preferred contact method: ' + (payload.preferredContact || ''),
    ];
    if (payload.preferredCallback) lines.push('Preferred callback date/time: ' + payload.preferredCallback);
    lines.push('', 'Message:', payload.message || '', '', 'Received: ' + (payload.receivedAt || new Date().toISOString()));

    // Draft.send returns the exact sent message; no Sent search/index delay.
    // Keep send outside the labelling catch: a failed send must fail delivery.
    var draft = GmailApp.createDraft(routeTo, subject, lines.join('\n'), {
      replyTo: payload.email || undefined,
      name: 'LAVAALL Website',
    });
    var sentMsg = draft.send();
    var labeled = false;

    // Self-addressed mail is filed Sent-only; make website leads visible.
    try {
      var thread = sentMsg.getThread();
      thread.moveToInbox();
      thread.addLabel(GmailApp.getUserLabelByName('Website Leads') || GmailApp.createLabel('Website Leads'));
      labeled = true;
    } catch (labelErr) { /* delivery already succeeded; never fail the request on labelling */ }

    return jsonOut({ ok: true, labeled: labeled });
  } catch (err) {
    // Details go to the Apps Script log only, scrubbed of request values; the caller gets a generic error.
    logRouterError_(err, e, payload, secret);
    return jsonOut({ ok: false, error: 'internal_error' }, 500);
  }
}

// Logs error name, message and stack with every request value removed: payload strings, the raw body,
// the secret, and anything shaped like an email address, phone number or quoted text.
function logRouterError_(err, e, payload, secret) {
  try {
    var values = [];
    if (secret) values.push(String(secret));
    if (e && e.postData && e.postData.contents) values.push(String(e.postData.contents));
    if (payload && typeof payload === 'object') {
      Object.keys(payload).forEach(function (k) {
        var v = payload[k];
        if (v !== null && v !== undefined && typeof v !== 'object') values.push(String(v));
      });
    }
    var scrub = function (text) {
      var out = String(text || '');
      values.filter(function (v) { return v.trim().length >= 3; })
        .sort(function (a, b) { return b.length - a.length; })
        .forEach(function (v) { out = out.split(v).join('[redacted]'); });
      return out
        .replace(/[^\s@"'<>]+@[^\s@"'<>]+/g, '[redacted-email]')
        .replace(/\+?\d[\d\s().-]{6,}\d/g, '[redacted-number]')
        .replace(/"[^"\n]*"|'[^'\n]*'/g, '"[redacted]"')
        .slice(0, 2000);
    };
    console.error(JSON.stringify({
      evt: 'contact_router_error',
      name: scrub(err && err.name),
      message: scrub(err && err.message !== undefined ? err.message : err),
      stack: scrub(err && err.stack),
    }));
  } catch (logErr) { /* logging must never change the response */ }
}

function jsonOut(obj, code) {
  var out = ContentService.createTextOutput(JSON.stringify(obj));
  out.setMimeType(ContentService.MimeType.JSON);
  return out;
}
