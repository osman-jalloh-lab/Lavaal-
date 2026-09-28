# Founders private messages

A single text thread inside LAVAALL OS (`/ops`) for Osman Jalloh and Abdulhamid Ba (Hameed) only. It lives in the same signed-in OS as the rest of the floor. Nobody else, including desks and agents, is given the thread.

The feature is off until `FOUNDERS_DM_ENABLED` is set to `1`, `true`, or `on`. This draft does not set that variable.

## Data model

One thread. Stored apart from the shared office blob (`lavaall-ops-v2`) so Talk, Assign, routines, and chat do not load it when they read the office store.

| | |
|---|---|
| Key | Production live thread: `lavaall-ops-founders-dm-v1` (message list), `lavaall-ops-founders-dm-v1:read` (per-founder read cursor), and `lavaall-ops-founders-dm-v1:legacy` (one-time blob rename). Production archive: `lavaall-ops-founders-docs-v1:YYYY-MM` (one append-only list per UTC month), `lavaall-ops-founders-docs-v1:months` (the set of months), and `lavaall-ops-founders-docs-v1:migrated` (the one-time copy marker). Preview and other non-production `VERCEL_ENV` values prefix every name with that environment (`preview:lavaall-ops-founders-dm-v1`, `preview:lavaall-ops-founders-docs-v1:YYYY-MM`, and the same prefix on `:read`, `:legacy`, `:months`, and `:migrated`) so a Preview deploy cannot write the keys Production reads. |
| Where | Existing Vercel KV (`KV_REST_API_URL` + `KV_REST_API_TOKEN`) when those are set. Otherwise the same local fallback as the rest of `/ops`: `OPS_STORE_FILE` plus `.founders-dm.json`, `.founders-dm.read.json`, and `.founders-docs.json`, or process memory when neither is set. No new vendor. |
| Live shape | Each live row is `{ id, from, createdAt, enc }`. `enc` is base64 of `{ v: 1, kid, iv, tag, ct }`. The message text (and any preview, draft, or attachment name) is inside the AES-256-GCM ciphertext. `id`, `from`, and `createdAt` stay plain on this short list so order and unread cursors work. |
| Archive shape | Each archive row is `{ id, month, enc }` on the list for that UTC month. The same AES-256-GCM helper encrypts the whole record: text, sender, timestamp, and any preview, draft, or attachment name. `id` and `month` stay plain so a month can be listed and paged. The authenticated data is `id` and `month`. A row that will not decrypt is not dropped; its previous ciphertext is wrapped inside the new record. |
| `from` | One of the two founder emails. Anything else is dropped on read. In the archive the address is only inside the ciphertext. |
| `text` | Plain text, trimmed, angle brackets removed, 2000 characters max, then encrypted. The 5000-character request limit is on the body before encryption. |
| Live cap | The open thread keeps the latest 400 messages (`RPUSH` then `LTRIM`). |
| Archive | Every accepted message is appended to that month's archive list in the same KV pipeline as the live push, archive first. The archive is not trimmed. |
| Retention | Archive lists are kept forever unless the founders decide otherwise. There is no TTL and no automatic delete. |
| Migration | The first read or send copies whatever is already on the live list into the archive, re-encrypted as full records. The copy checks message ids, so running it again does not duplicate rows. It does not delete or trim `lavaall-ops-founders-dm-v1`. The marker key is set only after the copy finishes. If the encryption key is missing, nothing is written. |
| Unread | Messages from the other founder whose `createdAt` is after that founder's read cursor. GET of the live thread never writes the cursor. Marking read is `POST` `{ action: "read", csrf }`. Opening history does not mark the thread read. |

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
| `GET /ops/api/founders-dm` | The live thread, oldest first, newest last, at most 400 messages. Does not write the read cursor. `after` returns only newer rows. `If-None-Match` can return 304. The first use can copy the existing list into the archive. |
| `GET /ops/api/founders-dm?scope=unread` | `{ ok, unread }` only. Does not return message text and does not write the cursor. |
| `GET /ops/api/founders-dm?scope=history` | Decrypted archive for one UTC month. `month=YYYY-MM` selects it. Omit `month` to use the latest month that has messages. `limit` defaults to 50 and caps at 100. With no cursor, the response is the newest page. `before` is an id and returns the older page. `after` is an id and returns the newer page. The body is `{ ok, month, months, messages, prev, next }`. Messages use the same You / Osman / Hameed shape as the live thread and do not include an email. This route does not mark the thread read and does not export anything. |
| `GET /ops/founders?view=history` | The same archive as a page, with a back link to the live thread. |
| `POST /ops/api/founders-dm` | `{ text, csrf }` sends. The archive write and the live push are one KV pipeline, archive first, then the live list is trimmed to 400. `{ action: "read", csrf }` marks read. Text only. |

JSON responses use `You`, `Osman`, and `Hameed`. They do not include the sender email as its own field.

## UI entry point

When the flag is on, a founder session sees **Private** first under a **Founders only** heading, with Kits and Map, in the existing Option I cream shell. The heading stays when the flag is off; Private does not. Other sessions do not see Private. The phone layout uses the same wrapping nav as the rest of `/ops`, a 16px message box, and a composer that stays at the bottom of the screen. The Mic button is the same browser speech control Talk already uses. Spoken words land in the message box and are not sent until Send. The button stays hidden when the browser has no speech recognition. The Private page has a **History** link to the archive. History is read-only and says the messages stay in the founders archive.

The open thread polls `GET /ops/api/founders-dm` every 4 seconds. Other pages poll the unread count every 8 seconds and show a count on **Private**. No new realtime service.

## Out of scope

- Images, files, reactions, edit, delete, search, and more than one thread.
- Email, Slack, SMS, export, or any other copy of the archive leaving `/ops`.
- Showing the thread or the archive in Office, group chat, Talk, Assign, the CEO bridge, Researchy, routines, Memory, Inbox, or logs.
- Feeding message text into any model prompt.
- A Jev integration. This repository has no Jev code path.
- Turning the flag on, provisioning storage, or deploying.

## Privacy

Message text is encrypted in the application before it is written. The archive also encrypts the sender and the timestamp. The cipher is AES-256-GCM from Node `crypto`. The key is `FOUNDERS_DM_ENC_KEY` (32 bytes, base64). There is no separate archive key. Each message gets a new 12-byte IV. `FOUNDERS_DM_ENC_KEY_PREV` decrypts older rows after a rotation and is never used to encrypt. If the flag is on and the key is missing or invalid, the route returns 503 `encryption_not_configured` and does not write the live list or the archive. A row that will not decrypt is shown as “Message could not be decrypted”; the log line has the message id only.

The browser still receives the decrypted text after a founder signs in. HTTPS covers that response and the KV call. Someone with the encryption key, or with both the ciphertext and the key, can read the messages. The key is not in this repo.

Who else can read the ciphertext:

- Anyone with Vercel project access to this KV store, or with `KV_REST_API_TOKEN`.
- Anyone who can read a KV backup or the local `OPS_STORE_FILE.founders-dm.json` and `.founders-docs.json` if that fallback is in use.

The two founders can read the decrypted thread in their own browsers after they sign in. Server logs for this route record `store_unavailable` or `decrypt_failed` plus a message id. They do not record message text, the key, or addresses.

The shared office store, CEO thread keys, and desk thread keys are separate. Those code paths do not import this module.

## Decisions that need founder OK

- The nav label is **Private**. Say if it should say **Founders** instead.
- The thread refreshes by polling (4 seconds while it is open, 8 seconds for the badge on other pages). Say if that is too chatty.
- Marking the thread read is a separate POST, sent only while the tab is visible and focused.
- Access stays locked to the two current allowlist addresses. If a third address is added to `/ops` later, this thread refuses everyone until the pair is updated on purpose.
- Message text is encrypted at rest. KV still stores ciphertext. Set `FOUNDERS_DM_ENC_KEY` with `openssl rand -base64 32` on the Preview that has the flag on. It is a secret.
- Messages are capped at 2000 characters. The open thread shows the latest 400. The archive keeps every message forever unless the founders decide otherwise. Angle brackets are stripped.
- Nothing is emailed, exported, or posted to Slack when a message arrives. History stays inside `/ops`.
- Archive months use UTC. Say if they should follow a founder's local timezone instead.
- The live list still stores sender and timestamp in the clear so unread counts work. The archive encrypts both.
- Bubbles say You, Osman, and Hameed.
- The flag stays off until a founder sets `FOUNDERS_DM_ENABLED=1` on the Preview environment they want to try. Production stays off until a later decision.
