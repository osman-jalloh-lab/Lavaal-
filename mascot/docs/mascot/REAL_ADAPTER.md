# RealChatAdapter (mascot ↔ LAVAALL backend)

Status: local branch `feature/mascot-real-adapter`, Preview-only design, **flag off by default**. Not linked from any site page.

## What it does

`src/chat/real-chat-adapter.js` replaces `MockChatAdapter` with the same interface (`send`, `open`, `close`, `reset`, `simulateError`, `simulateHandoff`) and the same animation events, so `ChatPanel` and `MascotController` work unchanged:

| Adapter event | Mascot / panel |
|---|---|
| `chat:listening` | listen pose, "Reading your message…" |
| `chat:thinking` | think pose, typing dots |
| `chat:speaking { text }` | speak pose, reply bubble |
| `chat:idle` | back to idle after 1.5 s |
| `chat:error { message }` | error pose, safe copy with support@ and WhatsApp |

It calls only `/api/chat-inquiry` (`config`, `session`, `turn`) with the HttpOnly session cookie. It never calls `draft`/`review`/`confirm`, `api/contact` or `api/web/inquiry`, and no key reaches the browser. Spend cap and rate limits stay on the server (429 `cost_cap`/`quota` show "temporarily busy").

## Handoff confirmation

- `request:review` fires when the server shows a summary with **Confirm** and **Cancel** chips.
- `request:confirmed` fires **only** when the visitor pressed Confirm on that summary **and** the server answered with `handoff: { status: 'received' }`. The detail carries no personal data (`{ route, test, channel }`).
- A server that writes without a Confirm step gets `request:unconfirmed`, never `request:confirmed`.
- The server-side Confirm/Cancel gate is Mark's #83 work; this branch adds only the PII-free `handoff` acknowledgement field in `api/_chat/service.js` where the test record is written.

## Panel behaviour added (no CSS, no layout changes)

- Uses the adapter's greeting ("Hi, I'm the LAVAALL Assistant. How can I help you today?") and footer instead of the demo copy when the adapter provides them. The mock keeps the demo copy.
- Renders `**bold**` from the backend as `<strong>` text nodes (XSS-safe).
- Renders server chips as plain `<button class="chat-chip">` in a `div.chat-chips` group, hidden when empty. **No styles were added; the look is Osman's call.**
- On a server topic `reset`, keeps the greeting and the latest question.
- A real `chat:handoff` with an empty message adds no second bubble (the server's thank-you line is already shown).

## Turning it on (later, with Osman's yes)

```js
import { selectChatAdapter } from './src/chat/adapter-select.js';
const { adapter, mode, reason } = await selectChatAdapter({
  flags: { MASCOT_REAL_ADAPTER: true },   // default false
  location: window.location, fetch: window.fetch.bind(window), crypto: window.crypto,
});
```

Real mode needs all three: the flag, the trusted Technology route `/` (`/web` stays mock until A4), and the server's public config reporting `CHAT_ENABLED` on `preview`. Anything else falls back to the mock.

## Tests

- `node tests/run-all.js` (this folder): Bob's 142 tests + 19 adapter/flag/panel tests.
- `node tests/test-mascot-real-adapter.js` (repo root): the adapter against the real `api/chat-inquiry` handler on loopback, with stubbed model and transport.
