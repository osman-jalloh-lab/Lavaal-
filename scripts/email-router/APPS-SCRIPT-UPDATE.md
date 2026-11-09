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

2b. **Secret check (fail closed, GRC F5).** First, in **Project Settings → Script Properties**, confirm a property named `CONTACT_WEBHOOK_SECRET` exists and holds the same value as Vercel's `CONTACT_WEBHOOK_SECRET` (compare without pasting the value anywhere). **If it is missing, every form submission will fail after this change.** Then replace the block from `// Apps Script Web Apps cannot reliably read custom HTTP headers` through the closing `}` of the old `if (secret && payload.secret !== secret) { ... }` with:

   ```javascript
   // Apps Script Web Apps cannot reliably read custom HTTP headers, so
   // api/contact.js sends the shared secret inside the JSON body instead.
   // Fail closed: with no CONTACT_WEBHOOK_SECRET Script Property, refuse every
   // request (anyone holding the /exec URL could otherwise send mail as us).
   if (!secret) {
     return jsonOut({ ok: false, error: 'not_configured' }, 503);
   }
   if (typeof payload.secret !== 'string' || payload.secret !== secret) {
     return jsonOut({ ok: false, error: 'forbidden' }, 403);
   }
   ```

3. Select **Deploy → Manage deployments → edit the existing deployment → New version → Deploy**. **Never create a new deployment:** the existing `/exec` URL must stay the same so `CONTACT_WEBHOOK_URL` keeps working.
4. **Rollback:** select **Deploy → Manage deployments → edit the existing deployment → select the previous version noted in step 1 → Deploy**. This restores the previous deployed version at the same `/exec` URL. Keep the backed-up `Code.gs` contents available to restore the editor contents if needed.
5. Confirm authorization is valid for creating/sending drafts and moving/labeling threads; complete any required Google authorization prompt. Do not paste secret values into code, documentation, chat, or test output, and do not change the shared secret. Run one founder-approved **TEST** submission only after Vercel has the `api/contact.js` change **and** Osman has updated the script.
