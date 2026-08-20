import fs from 'node:fs';
import crypto from 'node:crypto';

const webhook = process.env.CRM_WEBHOOK_URL || process.env.QUOTE_WEBHOOK_URL;
const secret = process.env.CRM_WEBHOOK_SECRET || process.env.QUOTE_WEBHOOK_SECRET;
const reportPath = process.argv[2] || 'scripts/qa/reports/production-browser-audit.json';

if (!webhook || !secret) {
  console.error('Missing CRM_WEBHOOK_URL/CRM_WEBHOOK_SECRET (or QUOTE_WEBHOOK_URL/QUOTE_WEBHOOK_SECRET).');
  process.exit(2);
}
if (!fs.existsSync(reportPath)) {
  console.error(`Audit report not found: ${reportPath}`);
  process.exit(2);
}

const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const runId = `${Date.now()}-${crypto.randomUUID()}`;
const criticalFailures =
  (report.brokenImages?.length || 0) +
  (report.wrongImages?.length || 0) +
  (report.blankRoutes?.length || 0) +
  (report.deadButtons?.length || 0) +
  (report.consoleErrors?.length || 0) +
  (report.networkErrors?.length || 0) +
  (report.routingFailures?.length || 0) +
  (report.searchFailures?.length || 0) +
  (report.quoteFailures?.length || 0) +
  (report.quarantinedVisible?.length || 0) +
  (report.generatedCatalogMissing ? 1 : 0);

const imageChecks = (report.galleryImageChecks || []).map((check) => {
  const final = check.attempts?.[check.attempts.length - 1] || check.final || {};
  return {
    productId: check.id || '',
    route: check.route || '',
    url: check.url || '',
    result: check.outcome || 'UNKNOWN',
    httpStatus: check.network?.status || '',
    contentType: check.network?.contentType || '',
    naturalWidth: final.naturalWidth || 0,
    naturalHeight: final.naturalHeight || 0,
    renderedWidth: final.renderedWidth || 0,
    renderedHeight: final.renderedHeight || 0,
    attempts: check.attempts?.length || 0
  };
});

const payload = {
  runId,
  checkedAt: new Date().toISOString(),
  environment: 'production',
  viewport: report.mobile ? '390x844' : '1440x900',
  result: criticalFailures === 0 ? 'PASS' : 'FAIL',
  verifiedSkus: report.listingCounts?.verified || 0,
  sourcingListings: report.listingCounts?.sourcing || 0,
  routes: report.routesVisited?.length || 0,
  productsOpened: report.productsOpened?.length || 0,
  thumbnailClicks: report.galleryThumbnailsClicked || 0,
  brokenImages: report.brokenImages?.length || 0,
  wrongImages: report.wrongImages?.length || 0,
  blankRoutes: report.blankRoutes?.length || 0,
  deadControls: report.deadButtons?.length || 0,
  consoleErrors: report.consoleErrors?.length || 0,
  networkFailures: report.networkErrors?.length || 0,
  commit: process.env.GITHUB_SHA || process.env.VERCEL_GIT_COMMIT_SHA || '',
  imageChecks
};

const response = await fetch(webhook, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ secret, eventType: 'qa-run', payload })
});
const text = await response.text();
let body;
try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 500) }; }
if (!response.ok || body.ok !== true) {
  console.error('CRM QA publish failed:', response.status, body);
  process.exit(1);
}
console.log(`Published ${payload.result} QA run ${runId} with ${imageChecks.length} image checks.`);
