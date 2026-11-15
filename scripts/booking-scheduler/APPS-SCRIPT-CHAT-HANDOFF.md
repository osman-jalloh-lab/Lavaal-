# Chatbot handoff: Osman-only Apps Script update

These are manual paste/deploy notes for Osman. This change has not been deployed.
Do not run a live webhook smoke test as part of the local PR B work.

1. Open the **existing LAVAALL booking Apps Script project** that owns
   `booking-router.gs`. Keep its current calendar and spreadsheet properties.
2. Replace its code with the reviewed `booking-router.gs`, including the new
   `chat-handoff` branch in `doPost`. Register, book, availability and lookup keep
   their existing routes. The chat route does not use the contact router.
3. In Project Settings → Script Properties, add
   `CHAT_HANDOFF_WEBHOOK_SECRET`. Use the same private value for the website's
   server-side property of that name. Do not paste values into Git, docs, client
   code or URLs. If this shared booking project deliberately reuses its existing
   secret, the script falls back to `BOOKING_WEBHOOK_SECRET` when its chat secret
   is absent; the website still needs `CHAT_HANDOFF_WEBHOOK_SECRET` configured
   with that shared value. A dedicated chat secret takes precedence.
4. When separately authorized to deploy, use **Deploy → Manage deployments →
   edit the existing Web app deployment → New version → Deploy**. Retain its
   existing `/exec` URL and execution/access settings. Do not create a new Web
   app deployment or `/exec` URL unless a separate sibling project is required.
   Preserve any existing booking URL configuration.
5. For a later authorized production rollout, the server uses only
   `CHAT_HANDOFF_WEBHOOK_URL` (the existing booking deployment's `/exec` URL) and
   `CHAT_HANDOFF_WEBHOOK_SECRET`. This document does not authorize changing any
   environment variables. Chat remains off until `CHAT_ENABLED` is set. Preview
   always uses the website test sink, even if URL and secret are present; missing
   URL or secret also keeps delivery in the test sink.

The default `createHandler()` intentionally has no live handoff transport. The
server's `handoffFetch` dependency is explicit and uses the fetch signature;
local tests inject a mock. A future authorized production composition must inject
its reviewed transport. Without that dependency, delivery stays in the test sink
even when both environment names are configured. No existing form transport or
contact-router is reused.

The authenticated JSON body contains `action: "chat-handoff"`, `secret`,
`name`, `email`, `whatsapp`, `country`, `city`, `organisation`, `topic`,
`ownWords`, `botSummary`, `transcript`, `timeCT`, `timeGMT`, `preferredChannel`,
`consent`, `pageUrl` and `sourcePage: "chatbot"`. The secret is in the body
because Apps Script Web apps do not reliably expose custom request headers.
Do not put it in a query parameter. The website validates page URL origins and
stamps CT/GMT times before delivery. The script rejects test payloads.

Each accepted delivery attempts one email to **support@lavaall.com** using
`GmailApp` through `safeSendEmail`, with sender name **LAVAALL Website**. It sets
Reply-To only when the visitor supplied an email. It sends no customer email.
It appends one **All Requests** row through `appendRow` / `sanitizeForSheet`,
with Source Page `chatbot`, Request Type `Chatbot handoff`, Assigned Team
`support@lavaall.com`, and Consent Recorded `Yes` only for a boolean `true`.
Until PR C supplies explicit consent, that flag defaults to false. Own words
go in Message; summary, transcript, CT/GMT timestamps, city, preferred channel
and accepted page URL go in Internal Notes. The response is `{ "ok": true }`
when email delivery succeeds; email failure is recorded and returns an error.

Local checks use mocked Apps Script services only:

```sh
node scripts/booking-scheduler/test-chat-handoff.js
node scripts/booking-scheduler/test-v2-additions.js
node scripts/booking-scheduler/test-slot-logic.js
```
