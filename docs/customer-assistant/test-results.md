# A1 test evidence — latest SPEC / QUALITY revision

All test submissions and transport responses were synthetic. No live ElevenLabs session, webhook, email, WhatsApp or paid model API was called. Public vendor documentation was read without starting a session. No real environment file was opened.

## Actual latest verification

Executed in this subprocess after the SPEC / QUALITY code changes:

- `node tests/run-safe-suite.js`: **TOTAL 45; PASS 45; FAIL 0**. Every `tests/test-*.js` file ran separately, including all 42 original files and three chat files.
- `test-chat-inquiry.js`: **46/46 named checks passed** (additional assertions are not separately counted).
- `test-chat-frontend.js`: **68 assertions passed**, using a mock DOM and injected local text-turn/review/confirmation adapter.
- `test-chat-quality.js`: **11/11 named tests passed**, including rollback, serialization, reference isolation, malformed inputs/origins, inert artifacts and unchanged public phone-only rejection.
- `node --check`: **10/10 changed JavaScript files passed**, plus Apps Script source checked through stdin: **1/1 passed**.
- `git diff --check`: **exit 0**.
- `gitleaks dir --redact --no-banner`: **exit 0, no leaks**, on an explicit temporary copy of the **22 reviewable changed files** listed below. The scanner used a minimal environment. No `.env` or credential files were copied or opened.
- Protected `api/contact.js`: unchanged versus `48102ac`. Current and baseline Git blob hashes both **2d7d775b92b57c651bfeaa0deea607bf65019001**. Its new mocked regression test rejects phone-only input with HTTP 400, requires email, and observes zero transport calls.

The full-suite runner supplies only PATH, TZ, NODE_ENV and SAFE_TEST_NETWORK to each child; it does not inherit provider/mail/ops credentials or NODE_OPTIONS. A preload blocks real non-loopback fetch/http/https/net/tls connections while tests may inject synthetic mocks. Each file has a 120-second timeout. The runner does not load `.env`.

## Baseline comparison

Before chat test additions, the observed baseline was **TOTAL 42; PASS 42; FAIL 0**. No preexisting failures were observed. The latest 45-file sweep includes those same 42 baseline files; no unrelated baseline test was repaired. Earlier 44-file results are superseded by the latest 45-file result above.

Actual baseline files:

- `tests/test-inquiry-and-schedule.js`
- `tests/test-ops-assign.js`
- `tests/test-ops-auth.js`
- `tests/test-ops-calendar.js`
- `tests/test-ops-ceo-bridge.js`
- `tests/test-ops-chat.js`
- `tests/test-ops-classify.js`
- `tests/test-ops-desk-talk.js`
- `tests/test-ops-founder-polish.js`
- `tests/test-ops-founders-dm.js`
- `tests/test-ops-google-hint.js`
- `tests/test-ops-inbox-triage.js`
- `tests/test-ops-inbox.js`
- `tests/test-ops-issues.js`
- `tests/test-ops-kits.js`
- `tests/test-ops-map.js`
- `tests/test-ops-memory.js`
- `tests/test-ops-office.js`
- `tests/test-ops-routine-health.js`
- `tests/test-ops-routines.js`
- `tests/test-ops-shell.js`
- `tests/test-ops-signin-hardening.js`
- `tests/test-ops-store.js`
- `tests/test-ops-untrusted.js`
- `tests/test-os-brain.js`
- `tests/test-os-council-spend.js`
- `tests/test-os-council.js`
- `tests/test-os-data.js`
- `tests/test-os-desk-names.js`
- `tests/test-os-dev-bypass.js`
- `tests/test-os-home.js`
- `tests/test-os-ingest.js`
- `tests/test-os-mobile.js`
- `tests/test-os-notes.js`
- `tests/test-os-pack.js`
- `tests/test-os-return.js`
- `tests/test-os-routines.js`
- `tests/test-os-shell.js`
- `tests/test-os-talk.js`
- `tests/test-os-views.js`
- `tests/test-public-contact.js`
- `tests/test-web.js`

## SPEC review

See [review.md](review.md). Mock tests cover free text and question chips using the same turn route, first AI disclosure, allowlisted partial drafting, full provided/skipped review, separate confirmation, edit invalidation and safe text rendering. Keyboard events, correction focus, scoped styles, 44px controls and narrow-width CSS are structurally tested. The inert vendor template/config and documented default-off environment example remain review artifacts, not completed vendor integration.

## QUALITY and security review

See [review.md](review.md) for all seven categories: secrets, injection, authentication, configuration, dependencies, AI and data. Tests cover transaction rollback and reference isolation, cross-handler atomic quotas, opaque ID validation, exact trusted origins, consent forgery/expiry/session binding/replay/mutation, concurrent idempotency, failed/ambiguous delivery, router HTTP plus JSON acknowledgement, mock billing freshness/cap and 80% hook. Mobile device security testing is N/A for this code-only checkpoint.

## NOT TESTED / blockers

Real vendor behavior, authenticated vendor session linking, prevention of public-agent bypass, text-only dashboard verification, live language switching and language quality, actual all-in vendor spending/hard limits, dedicated durable storage, actual TTL deletion, vendor retention/deletion, privacy approval, screen readers, real 320px browser/device layout and mobile Safari/Android acceptance are **NOT TESTED**. Voice is excluded. No claim of real device or vendor acceptance follows from mock success.

A2 and A3 gates, unmerged #74/#75 conflicts and rollback are in A1.md. No commit, push, PR creation, deployment, account changes, environment changes or activation occurred in this subprocess. The coordinator owns the founder-authorized feature-branch/draft-PR workflow.

## Explicit changed-file scan manifest

- `api/_chat/contact.js`
- `api/_chat/service.js`
- `api/_chat/store.js`
- `api/chat-inquiry.js`
- `assets/css/customer-assistant.css`
- `assets/js/customer-assistant.js`
- `docs/customer-assistant/A1.md`
- `docs/customer-assistant/agent-config.json`
- `docs/customer-assistant/agent-policy.md`
- `docs/customer-assistant/embed-template.html`
- `docs/customer-assistant/env.example`
- `docs/customer-assistant/kb-technology.md`
- `docs/customer-assistant/review.md`
- `docs/customer-assistant/test-results.md`
- `index.html`
- `privacy.html`
- `scripts/email-router/contact-router.gs`
- `tests/network-guard.js`
- `tests/run-safe-suite.js`
- `tests/test-chat-frontend.js`
- `tests/test-chat-inquiry.js`
- `tests/test-chat-quality.js`
