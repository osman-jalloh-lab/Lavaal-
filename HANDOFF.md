# HANDOFF — security/hardening-2026-11-09

No secrets in this file. Branch is off `main` @ 9317148 (current production build). Draft PR only: do not merge or deploy without Osman's approval.

## Done (one commit per finding)
| Commit | Finding | Change |
|---|---|---|
| F1 | Process-local rate limits (api/quote.js, api/ops/_lib.js) | `api/_shared_limits.js` shared fixed-window limiter on the EXISTING KV, behind `SECURITY_SHARED_LIMITS=1` (default OFF → bounded in-memory, same as today). Keys hashed + env-prefixed. KV error → memory fallback. |
| F3 | Process-local OAuth state replay set (api/ops/_google_signin.js) | `consumeOAuthState` async; uses shared `once()` (SET NX PX) under the same flag. Map bounded. |
| F2 | Homepage CSP has 'unsafe-inline' | Enforced CSPs unchanged. New `Content-Security-Policy-Report-Only` (hash-based, no 'unsafe-inline' in script-src) on /, /index.html, /privacy.html, /terms.html. `scripts/security/csp-hashes.js` regenerates hashes; test fails on drift. |
| F4 | Quote webhook + customer data | Context allowlist + caps, https-only URL, 10s timeout, honest delivery (2xx + JSON ok:true), optional `QUOTE_WEBHOOK_SECRET` HMAC headers + body secret, no PII logs. |
| M6 | Internal files publicly served | `.vercelignore` drops root internal .md, tests/, scripts/, netlify/, docs/* except docs/ops/souls/. |
| M1 | No CSRF check on /ops handleWrite | `sameOriginRequest()` (Sec-Fetch-Site / Origin) before handleWrite. |
| test | tests/test-os-ingest.js scope guard | Guard only applies to diffs touching ingest modules. |

## Tests run (node, local, synthetic data, mocked fetch)
- Baseline main: 42 files, 2191/2195 checks; only tests/test-slack-handlers.js fails (108/112, pre-existing).
- This branch: 48 files, 2700/2704 checks; only the same 4 pre-existing Slack checks fail.
- New: test-security-shared-limits 27/27, -oauth-replay 15/15, -csp 13/13, -quote-webhook 38/38, -ops-csrf 38/38, -vercelignore 378/378.
- Headless Chrome against a local static server with the Report-Only header: 0 inline-script violations; 24 inline-handler reports, all from the `onerror` attribute that assets/js/catalog.js generates (expected; must be refactored before enforcing).

## Needs founder approval (not done)
1. Turn on `SECURITY_SHARED_LIMITS=1` (uses existing KV; extra KV commands per sign-in/quote; Preview shares prod KV until PR #40).
2. Set `QUOTE_WEBHOOK_SECRET` + update the receiver to verify it, before setting `QUOTE_WEBHOOK_URL`.
3. Merge / Preview check of `.vercelignore` (confirm /ops souls still load on Preview).
4. Slack approver allowlist (prior H1) — needs founder Slack user IDs.
5. Rotate OPS_CEO_BRIDGE_SECRET / move it out of box `.bashrc` (prior M7).

## Next step
Review the draft PR on Preview (SSO-protected): homepage, privacy, terms, /ops Google sign-in, Kits, add-task. Then decide items above. Full report: /workspace/share/SECURITY-REPORT-2026-11-09.md (box).
