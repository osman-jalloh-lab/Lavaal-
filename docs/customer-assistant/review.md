# A1 SPEC and QUALITY review

This is a gated local mock implementation. Real vendor, durable storage and cost integrations remain A2 blockers. No production or Preview activation, paid call, live inquiry, commit, push or PR was performed by this subprocess. The coordinator retains the founder-authorized branch and draft PR workflow.

## SPEC review

- Exact `/` plus explicit loopback/test injection is required for mounting. Other routes, Preview and production remain inert. The homepage references only the local bootstrap; no vendor script or extra stylesheet loads when off.
- The local assistant has an AI-first conversation log, free text composer, ten suggested questions using the same injected text-turn adapter, EN/FR/PT copy, expandable correction fields, and provided/skipped summary. Only allowlisted, typed draft response fields update intake. A separate server review enables Send; edits invalidate review. Privacy links accompany collection and confirmation.
- Scoped styles use the existing brand fonts and sun/sky/ink/offwhite, visible focus, 44px controls and narrow-layout rules. These are source/mock-DOM checks, not a real 320px device acceptance result.
- The inert embed reference records the official element and script, dashboard text-only verification, maximum three first-message replies, opaque session linking and an authenticated draft-only tool. Ten questions belong outside the widget. Public-agent authentication versus signed-session support is unresolved; no assumed billing protection or vendor CSP exception was added.
- `env.example` is documentation only. Neither its flags nor any environment assertion enables the real exported handler. Dedicated storage, authenticated vendor session quotas, verified all-in billing and vendor hard limits still require implementation and evidence.
- Public contact validation remains protected. Chat uses a separate name/phone schema, browser-bound review/consent and the existing router payload contract. Success requires HTTP success plus JSON ok:true; ambiguous delivery remains uncertain and is never automatically retried.

Official reference inspected read-only during this review: [ElevenLabs widget documentation](https://elevenlabs.io/docs/agents-platform/customization/widget). It lists voice-only as the default, public agents with authentication disabled, a signed-url attribute, and at most three first-message replies. That documentation does not resolve enforceable authenticated sessions or hard spending controls for this application.

## QUALITY review

The backend state machine is split into named session/draft/review/confirmation/billing functions. The mock adapter serializes shared transactions, commits cloned state only after successful completion, rolls back throws and isolates returned or captured references. Opaque inputs are bounded lowercase 64-character hexadecimal strings; event IDs have an allowlisted alphabet and length. Configured origins are exact HTTPS origins, with HTTP loopback allowed only by the explicit local test option. No raw request text is included in public errors.

Security sweep categories inspected:

| Category | Reviewed boundary and result |
| --- | --- |
| Secrets | No real environment file was opened. Draft-tool and browser proofs stay separate; no credential or raw inquiry logging. Explicit changed-file secret scan results are in test-results.md. |
| Injection | Intake fields/enums and request action keys are allowlisted. Text messages and summaries use textContent. No eval, model-supplied endpoint, recipient, HTML or executable tool response is accepted. |
| Authentication | Timing-safe draft credential comparison; provider can draft only. Browser Origin, HttpOnly/SameSite cookie proof, CSRF, immutable-digest consent, expiry and atomic one-use submission remain separate. Input formats are validated before key lookup. |
| Configuration | Exported handler is disabled; mock factory is test-only. Origins fail closed on invalid configuration. No new vendor CSP or microphone permission. Public agent/session enforcement is unverified and blocks A2. |
| Dependencies | No framework, package manifest, installed package or new runtime dependency. Browser uses existing fonts and same-origin local CSS only after local eligibility. Official vendor script is inert review material. |
| AI | Only an injected synthetic text-turn adapter exists. No second model or paid call. Customer configuration is draft-only with no internal tools. Prompt policy is defense in depth, not an authorization mechanism. Real vendor policy/language behavior is untested. |
| Data | HMAC IP counters, bounded session/draft/consent TTL, isolated mock records, at-most-one transport attempt and conservative mock reservations. No production KV connection. Real TTL deletion, provider retention/deletion and all-in accounting are A2 blockers. |

Mobile device security testing: N/A for this code-only mocked checkpoint. Real device layout, browser compatibility, accessibility assistive technology, vendor behavior, live language switching and privacy approval are **NOT TESTED**. No voice acceptance is claimed.

## Remaining gates

A2: dedicated durable transactional provider with TTL/deletion, authenticated/enforceable vendor sessions without public-agent bypass, reviewed session-link protocol, hard vendor spending limits and all-in accounting, text-only dashboard evidence, and separately authorized synthetic staging acceptance. A3: approved and shipped privacy notice, verified vendor transcript retention/deletion, separate production approval, #75 and #74 dependency resolution and conflict review. Their branches are untouched.
