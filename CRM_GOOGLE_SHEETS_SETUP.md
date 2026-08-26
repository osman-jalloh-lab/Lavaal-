# LAVAALL Google Sheets CRM Setup

This setup keeps quote delivery truthful and server-to-server:

`browser -> POST /api/quote on Vercel -> authenticated Google Apps Script webhook -> LAVAALL CRM Google Sheet`

The browser never receives the CRM secret.

## 1. Create the CRM spreadsheet from Apps Script

1. Open Google Apps Script while signed into the Google account that should own the CRM.
2. Create a new standalone Apps Script project named `LAVAALL CRM`.
3. Copy the complete contents of `scripts/google-sheets/lavaall-crm.gs` into the project.
4. Save it.
5. Run `createOrSetupCRM()` once and authorize the requested Google Sheets permission.
6. Open the execution log. It returns:
   - `spreadsheetUrl`
   - `spreadsheetId`
   - `webhookSecret`
7. Keep `webhookSecret` private. Do not put it in the spreadsheet, client JavaScript, screenshots, GitHub, or chat.

The setup function creates these tabs:

- `Dashboard`
- `Leads`
- `Products`
- `Image Health`
- `QA Runs`

Verified exact-product leads can show the exact product image by looking up the product ID in the `Products` tab. Sourcing-only leads do not get a misleading exact product image.

## 2. Deploy Apps Script as a Web App

In Apps Script:

1. **Deploy -> New deployment**.
2. Type: **Web app**.
3. Execute as: **Me**.
4. Access: choose the option that permits the Vercel server to POST to the web app without a Google interactive login.
5. Deploy.
6. Copy the `/exec` Web App URL. Treat it as an integration endpoint, not a customer-facing URL.

A GET to the deployment should return a small JSON health response. Lead writes still require the server-side shared secret.

## 3. Configure Vercel production secrets

For the `lavaal` Vercel project, add these Production environment variables:

- `QUOTE_WEBHOOK_URL` = the Apps Script `/exec` URL
- `QUOTE_WEBHOOK_SECRET` = the `webhookSecret` returned by `createOrSetupCRM()`

Do not prefix the secret with `NEXT_PUBLIC_` or expose it in browser code.

Redeploy production after adding the variables.

## 4. Sync the verified product catalog into the CRM

On a trusted local machine, set either:

- `CRM_WEBHOOK_URL` and `CRM_WEBHOOK_SECRET`

or reuse:

- `QUOTE_WEBHOOK_URL` and `QUOTE_WEBHOOK_SECRET`

Then run:

```powershell
node scripts/crm/sync-google-sheet-products.mjs
```

This replaces the `Products` tab with the current verified generated catalog and its exact self-hosted primary-image URLs. The Sheet uses `IMAGE()` formulas for product previews.

## 5. Test end-to-end quote delivery

After Vercel redeploys:

1. Submit one clearly labeled synthetic verified-product quote from production.
2. Confirm `/api/quote` returns success only after Apps Script acknowledges the write.
3. Confirm a new row appears in `Leads`.
4. Confirm exact-product context includes the correct source product ID/MPN/GTIN and product image preview where the Products tab has been synced.
5. Submit one synthetic sourcing request and confirm it does not invent exact identifiers or exact product media.

The API still returns `503 delivery_not_configured` when the URL or shared secret is absent. It returns `502 delivery_failed` if the configured destination does not acknowledge the write. It never shows a false delivery success.

## Production image-health tracking

After running the browser audit, publish its current result to the CRM:

```powershell
node scripts/crm/publish-production-audit.mjs scripts/qa/reports/production-browser-audit.json
```

This appends a `QA Runs` row and refreshes `Image Health` with the latest gallery-level browser diagnostics. The site remains the source of truth; the Sheet is an operational dashboard, not a replacement for the release gate.

## Secret rotation

Run `rotateCRMWebhookSecret()` in Apps Script if the shared secret is ever exposed. Then immediately update the corresponding Vercel/GitHub secrets before sending new leads.
