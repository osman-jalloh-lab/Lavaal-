# Implementation architecture (static HTML + vanilla JavaScript + Vercel Functions)

The uploaded plan describes a static HTML/vanilla JS repo with Vercel Serverless Functions, **not Next.js**. Verify current main first. Reuse existing patterns.

Recommended filesystem shape (adapt only after examining project):
```
assets/mascot/
  technology/{idle,speaking,thinking,walking}.svg
  web/{idle,speaking,thinking,walking}.svg
assets/css/lavaall-mascot.css
assets/js/lavaall-mascot.js
assets/js/lavaall-mascot-controller.js
```
- Use one semantic, mount-once widget per page. Config resolves explicit `site='technology'|'web'` from the trusted route, never a client-provided field for backend authorization.
- CSS variables + a `data-mascot-theme` attribute choose skin; avoid duplicate code and global CSS pollution.
- Prefer CSS transform animations for lightness; keep no extra framework/build system unless existing stack proves worthwhile. If rigged animations are wanted, propose a small original sprite sheet or SVG state assets with weighted comparison.
- Independent presentation state machine; connection to the chatbot is a narrow adapter receiving events: `onReady, onOpen, onClose, onUserTurn, onAssistantTurn, onListeningStart, onListeningEnd, onError, onHandoff`.
- On initial demo, fake adapter emits canned lines locally. Do not wire model or microphone to enable the visual demo.
- Eventually `api/chat.js` (if built and verified) remains backend authority. Mascot does not control consent, request submission, spend caps, Origin validation, rate limiting or recipients. Never let visual events trigger backend submission.
- For future chat integration, use separate `prepareInquiry` + server-generated one-time code + explicit user Send control + server-side verification + idempotency key. Confirm delivery success before shown as submitted.
- No client-side hard cap masquerading as a budget cap; backend must have reliable blocking gate, Preview-isolated storage and a verified fail-closed policy.
- CSP: local-only image/svg/css/js demo should need no external network domains. Revisit CSP/Permissions-Policy only for separately approved voice phase; don't loosen global CSP for aesthetic effects.
- Performance: load static avatar poster first; lazy-load heavier animation when visible/idle; avoid layout shift; pause when hidden.
- Errors: graceful fallback to static icon and existing contact paths, never a permanently spinning mascot.
