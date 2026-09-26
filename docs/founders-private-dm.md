# Founders private messages

A single text thread inside LAVAALL OS (`/ops`) for Osman Jalloh and Abdulhamid Ba (Hameed) only. It lives in the same signed-in OS as the rest of the floor. Nobody else, including desks and agents, is given the thread.

The feature is off until `FOUNDERS_DM_ENABLED` is set to `1`, `true`, or `on`. This draft does not set that variable.

## Data model

One thread. Stored apart from the shared office blob (`lavaall-ops-v2`) so Talk, Assign, routines, and chat do not load it when they read the office store.

| | |
|---|---|
| Key | Production: `lavaall-ops-founders-dm-v1` (message list), `lavaall-ops-founders-dm-v1:read` (per-founder read cursor), and `lavaall-ops-founders-dm-v1:legacy` (one-time blob rename). Preview and other non-production `VERCEL_ENV` values prefix those names (`preview:lavaall-ops-founders-dm-v1`, and the same prefix on `:read` and `:legacy`) so a Preview deploy cannot write the keys Production reads. |
| Where | Existing Vercel KV (`KV_REST_API_URL` + `KV_REST_API_TOKEN`) when those are set. Otherwise the same local fallback as the rest of `/ops`: `OPS_STORE_FILE` plus `.founders-dm.json` and `.founders-dm.read.json`, or process memory when neither is set. No new vendor. |
| Shape | Each stored row is `{ id, from, createdAt, enc }`. `enc` is base64 of `{ v: 1, kid, iv, tag, ct }`. The message text (and any preview, draft, or attachment name) is inside the AES-256-GCM ciphertext. `id`, `from`, and `createdAt` stay plain so order and unread cursors work. A legacy plaintext blob is encrypted on the one-time migration. |
| `from` | One of the two founder emails. Anything else is dropped on read. |
| `text` | Plain text, trimmed, angle brackets removed, 2000 characters max, then encrypted. The 5000-character request limit is on the body before encryption. |
| Cap | The latest 400 messages are kept (`RPUSH` then `LTRIM`). Older ones are dropped. |
| Unread | Messages from the other founder whose `createdAt` is after that founder's read cursor. GET never writes. Marking read is `POST` `{ action: "read", csrf }`. |

## Access control

Every read and write goes through `handleFoundersDm` in `api/ops/_founders_dm.js`. Hiding the nav link is not the control.

The session must be a valid `/ops` cookie (`lavaall_ops`) whose email is one of the two identities already on the allowlist in `api/ops/_lib.js`: `osmanjalloh104@gmail.com` and `abdulhbah55@gmail.com`. The allowlist must still be exactly those two addresses. A larger allowlist does not inherit this thread; the route then refuses everyone.

| Request | Result |
|---|---|
| Flag unset, `0`, `false`, or `off` | 404. No thread body. |
| Agent or bot headers (`Authorization: Bearer` / `Bot`, `x-lavaall-agent`, Slack signature headers, `agent` / `botToken` fields), even with a founder cookie | 403 `agent_denied` |
| No session | 401 `sign_in_required` |
| Signed session or claimed email that is not one of the two founders | 403 `forbidden` |
| Founder session, flag on, key missing or not 32 bytes | 503 `encryption_not_configured`. Nothing is written. |
| Founder session, flag on, key valid | Read and send |

POST also needs the same CSRF token the other `/ops` forms use. There is no bearer-secret path and no agent poller.

## API routes

Existing rewrite: `/ops/:path*` → `/api/ops?area=:path*`. No new Vercel function.

| | |
|---|---|
| `GET /ops/founders` | The thread page. Does not mark the thread read. |
| `GET /ops/api/founders-dm` | Messages, oldest first, newest last. Does not write. `after` returns only newer rows. `If-None-Match` can return 304. |
| `GET /ops/api/founders-dm?scope=unread` | `{ ok, unread }` only. Does not return message text and does not write. |
| `POST /ops/api/founders-dm` | `{ text, csrf }` sends. `{ action: "read", csrf }` marks read. Text only. |

JSON responses use `You`, `Osman`, and `Hameed`. They do not include the sender email as its own field.

## UI entry point

When the flag is on, a founder session sees **Private** first under a **Founders only** heading, with Kits and Map, in the existing Option I cream shell. The heading stays when the flag is off; Private does not. Other sessions do not see Private. The phone layout uses the same wrapping nav as the rest of `/ops`, a 16px message box, and a composer that stays at the bottom of the screen. The Mic button is the same browser speech control Talk already uses. Spoken words land in the message box and are not sent until Send. The button stays hidden when the browser has no speech recognition.

The open thread polls `GET /ops/api/founders-dm` every 4 seconds. Other pages poll the unread count every 8 seconds and show a count on **Private**. No new realtime service.

## Out of scope

- Images, files, reactions, edit, delete, search, and more than one thread.
- Email, Slack, SMS, or any other notification when a message arrives.
- Showing the thread in Office, group chat, Talk, Assign, the CEO bridge, Researchy, routines, Memory, Inbox, or logs.
- Feeding message text into any model prompt.
- A Jev integration. This repository has no Jev code path.
- Turning the flag on, provisioning storage, or deploying.

## Privacy

Message text is encrypted in the application before it is written. The cipher is AES-256-GCM from Node `crypto`. The key is `FOUNDERS_DM_ENC_KEY` (32 bytes, base64). Each message gets a new 12-byte IV. `FOUNDERS_DM_ENC_KEY_PREV` decrypts older rows after a rotation and is never used to encrypt. If the flag is on and the key is missing or invalid, the route returns 503 and does not write. A row that will not decrypt is shown as “Message could not be decrypted”; the log line has the message id only.

The browser still receives the decrypted text after a founder signs in. HTTPS covers that response and the KV call. Someone with the encryption key, or with both the ciphertext and the key, can read the messages. The key is not in this repo.

Who else can read the ciphertext:

- Anyone with Vercel project access to this KV store, or with `KV_REST_API_TOKEN`.
- Anyone who can read a KV backup or the local `OPS_STORE_FILE.founders-dm.json` if that fallback is in use.

The two founders can read the decrypted thread in their own browsers after they sign in. Server logs for this route record `store_unavailable` or `decrypt_failed` plus a message id. They do not record message text, the key, or addresses.

The shared office store, CEO thread keys, and desk thread keys are separate. Those code paths do not import this module.

## Decisions that need founder OK

- The nav label is **Private**. Say if it should say **Founders** instead.
- The thread refreshes by polling (4 seconds while it is open, 8 seconds for the badge on other pages). Say if that is too chatty.
- Marking the thread read is a separate POST, sent only while the tab is visible and focused.
- Access stays locked to the two current allowlist addresses. If a third address is added to `/ops` later, this thread refuses everyone until the pair is updated on purpose.
- Message text is encrypted at rest. KV still stores ciphertext. Set `FOUNDERS_DM_ENC_KEY` with `openssl rand -base64 32` on the Preview that has the flag on. It is a secret.
- Messages are capped at 2000 characters, and only the latest 400 are kept. Angle brackets are stripped.
- Nothing is emailed or posted to Slack when a message arrives.
- Bubbles say You, Osman, and Hameed.
- The flag stays off until a founder sets `FOUNDERS_DM_ENABLED=1` on the Preview environment they want to try. Production stays off until a later decision.
