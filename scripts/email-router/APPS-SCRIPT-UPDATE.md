# Update the existing contact router

1. Open the existing contact-router project in script.google.com: the project whose Web App URL is `CONTACT_WEBHOOK_URL`.
2. Replace its `Code.gs` contents with the updated `contact-router.gs` from this PR, or paste the changed block after `GmailApp.sendEmail`.
3. Select **Deploy → Manage deployments**, edit the **existing** deployment, select **New version**, then **Deploy**. **Do not create a new deployment:** that would change the `/exec` URL and break `CONTACT_WEBHOOK_URL`.
4. Confirm authorization is still valid. Do not paste secret values.
5. After Vercel Preview/Production has the `api/contact.js` change and Osman has updated the script, run one **TEST** submission with founder approval.
