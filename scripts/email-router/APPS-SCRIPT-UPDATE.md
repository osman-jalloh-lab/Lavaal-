# Update the existing contact router

1. Before changing anything, open the existing contact-router project in script.google.com (the project whose Web App URL is `CONTACT_WEBHOOK_URL`). In **Deploy → Manage deployments**, note the current deployment version number. Copy and back up the current `Code.gs` contents so the existing code can be restored.
2. Prefer pasting **only the changed send/label block** from `contact-router.gs`: replace the block starting at `GmailApp.sendEmail(...)` through `return jsonOut({ ok: true });` with the updated block below. The deployed script may not match the repository byte-for-byte. A full-file replacement is optional only if Osman confirms the project matches the repository.

   ```javascript
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
   ```

2b. **Secret check (fail closed, GRC F5).** First, in **Project Settings → Script Properties**, confirm a property named `CONTACT_WEBHOOK_SECRET` exists, is **at least 16 characters** (not counting leading/trailing spaces), and holds the same value as Vercel's `CONTACT_WEBHOOK_SECRET` (compare without pasting the value anywhere). **If it is missing, blank or shorter than 16 characters, every form submission will fail after this change.** If the current shared secret is shorter, set a new long random value in both places before redeploying. Then replace the block from `// Apps Script Web Apps cannot reliably read custom HTTP headers` through the closing `}` of the old `if (secret && payload.secret !== secret) { ... }` with:

   ```javascript
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
   ```

2c. **Generic error to the caller (GRC F5 follow-up).** Replace the outer `catch (err) { return jsonOut({ error: 'server_error', message: String(err) }, 500); }` at the end of `doPost` with the block below, so the caller never sees raw error text. Details go to **Executions** (console.error) with request values scrubbed.

   ```javascript
     } catch (err) {
       // Details go to the Apps Script log only, scrubbed of request values; the caller gets a generic error.
       logRouterError_(err, e, payload, secret);
       return jsonOut({ ok: false, error: 'internal_error' }, 500);
     }
   ```

   Then add this function at the end of the file (next to `jsonOut`):

   ```javascript
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
   ```

3. Select **Deploy → Manage deployments → edit the existing deployment → New version → Deploy**. **Never create a new deployment:** the existing `/exec` URL must stay the same so `CONTACT_WEBHOOK_URL` keeps working.
4. **Rollback:** select **Deploy → Manage deployments → edit the existing deployment → select the previous version noted in step 1 → Deploy**. This restores the previous deployed version at the same `/exec` URL. Keep the backed-up `Code.gs` contents available to restore the editor contents if needed.
5. Confirm authorization is valid for creating/sending drafts and moving/labeling threads; complete any required Google authorization prompt. Do not paste secret values into code, documentation, chat, or test output, and do not change the shared secret. Run one founder-approved **TEST** submission only after Vercel has the `api/contact.js` change **and** Osman has updated the script.
