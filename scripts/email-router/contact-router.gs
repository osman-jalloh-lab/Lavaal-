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
    if (secret && payload.secret !== secret) {
      return jsonOut({ error: 'forbidden' }, 403);
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

    GmailApp.sendEmail(routeTo, subject, lines.join('\n'), {
      replyTo: payload.email || undefined,
      name: 'LAVAALL Website',
    });

    return jsonOut({ ok: true });
  } catch (err) {
    return jsonOut({ error: 'server_error', message: String(err) }, 500);
  }
}

function jsonOut(obj, code) {
  var out = ContentService.createTextOutput(JSON.stringify(obj));
  out.setMimeType(ContentService.MimeType.JSON);
  return out;
}
