# A1 test evidence — browser voice increment

All test submissions, speech recognition and TTS results were synthetic. No live ElevenLabs session, webhook, email, WhatsApp, paid model API, or real microphone/speaker was used. No real environment file was opened. No ElevenLabs agent was created.

## Actual latest verification

Executed after adding the default-off browser Web Speech option (Osman approved 10 November 2026, 9:39 PM America/Chicago):

- `node tests/run-safe-suite.js`: **TOTAL 46; PASS 46; FAIL 0**. Every `tests/test-*.js` file ran separately, including the previous 45 files and new `test-chat-browser-voice.js`.
- `test-chat-browser-voice.js`: **264 assertions passed**, using a mock DOM and injected SpeechRecognition / speechSynthesis stubs. Coverage includes feature detection, flag-off and `CHAT_VOICE_ENABLED`-only (no mic UI), language mapping (`en-US`, `fr-FR`, `pt-PT` with `pt-BR` alias), no auto-send, permission/start failures leaving text usable, opt-in TTS, the `createBrowserTtsAdapter` interface with no network, and homepage-only microphone Permissions-Policy on `/` with `/web`, `/ops` and `/os` left unchanged.
- `test-chat-inquiry.js`: **46/46 named checks passed**, including default-off `CHAT_ENABLED`, `CHAT_VOICE_ENABLED` and `CHAT_BROWSER_VOICE_ENABLED`.
- `test-chat-frontend.js`: **68 assertions passed**; existing composer/consent DOM selectors remain valid.
- `test-chat-quality.js`: **11/11 named tests passed**, including the new `CHAT_BROWSER_VOICE_ENABLED=false` env.example and agent-config assertions.
- `node --check`: **6/6 changed JavaScript files passed** (`assets/js/customer-assistant.js`, `api/chat-inquiry.js`, `tests/test-chat-browser-voice.js`, `tests/test-chat-inquiry.js`, `tests/test-chat-quality.js`, `tests/test-os-ingest.js`).
- `git diff --check`: **exit 0**.
- `gitleaks dir --redact --no-banner`: **exit 0, no leaks**, on an explicit temporary copy of the reviewable changed files listed below. The scanner used a normal PATH only. No `.env` or credential files were copied or opened.
- Protected `api/contact.js`: unchanged versus `48102ac` and versus A1 head `51492607`. Current and baseline Git blob hashes both **2d7d775b92b57c651bfeaa0deea607bf65019001**.
- `tests/test-os-ingest.js` was updated only so the existing vercel.json guard still passes: it now allows an exact `/` `microphone=(self)` Permissions-Policy while asserting `/os`, `/ops`, `/web`, global `/(.*)`, functions and rewrites stay unchanged. This is not an unrelated baseline fix.

The prior 45-file A1 result is superseded by this 46-file sweep. The same 42 original baseline files still pass. The full-suite runner still supplies only PATH, TZ, NODE_ENV and SAFE_TEST_NETWORK; it does not inherit provider/mail/ops credentials or NODE_OPTIONS, and it does not load `.env`.

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

Real vendor behavior, authenticated vendor session linking, prevention of public-agent bypass, text-only dashboard verification, live language switching and language quality, actual all-in vendor spending/hard limits, dedicated durable storage, actual TTL deletion, vendor retention/deletion, privacy approval, screen readers, real 320px browser/device layout and mobile Safari/Android acceptance are **NOT TESTED**. Browser Web Speech was exercised only through Node mocks. Real Chrome, Edge, Firefox and Safari (desktop and mobile) recognition/TTS, microphone permission prompts, vendor audio processing, and HTTPS behavior are **NOT TESTED**. Expected real-browser limitations, untested here: Firefox generally lacks SpeechRecognition; iOS Safari recognition is limited or inconsistent; Chrome/Edge desktop and Android Chrome are the usual working path; Chrome may send audio to Google; recognition typically needs a user gesture and may end after a pause; `speechSynthesis` voices and quality vary by device. No ElevenLabs voice acceptance is claimed. No claim of real device or vendor acceptance follows from mock success.

A2 and A3 gates, unmerged #74/#75 conflicts and rollback are in A1.md. The privacy.html browser-speech wording is still draft and requires Osman's approval; the effective date is unchanged. No production deployment, account changes, environment/secret changes, paid calls or ElevenLabs agent creation occurred in this increment.

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

## Browser-voice increment changed-file scan manifest

- `api/chat-inquiry.js`
- `assets/css/customer-assistant.css`
- `assets/js/customer-assistant.js`
- `docs/customer-assistant/A1.md`
- `docs/customer-assistant/agent-config.json`
- `docs/customer-assistant/agent-policy.md`
- `docs/customer-assistant/embed-template.html`
- `docs/customer-assistant/env.example`
- `docs/customer-assistant/review.md`
- `docs/customer-assistant/test-results.md`
- `netlify.toml`
- `privacy.html`
- `tests/test-chat-browser-voice.js`
- `tests/test-chat-inquiry.js`
- `tests/test-chat-quality.js`
- `tests/test-os-ingest.js`
- `vercel.json`
