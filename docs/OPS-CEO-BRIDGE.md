# LAVAALL OS — CEO Talk (Preview Slice 1 A–D)

**Status:** Preview only. Prod HOLD. Do not merge to `main`. Do not production-deploy.  
**Path:** KV thread is the single source of truth. Server xAI completes into that thread when `XAI_API_KEY` is set. B2 pending is an **explicit-wake inbox only**. Slack `#laval` is a fallback note.

Office CEO Talk and `/ops/chat?agent=lavaall-ceo` write founder turns into `ops:ceo:thread:{id}`. One logical LAVAALL CEO in the UI. Backend provenance is metadata only — do not show dual brains.

## Ownership (never both)

1. Founder enqueue creates a message with `correlationId`, `provenance: human`, `responseOwner: pending`.
2. **Default (xAI):** if `XAI_API_KEY` is set and the message is **not** an explicit wake, the server claims `xai_runtime` **before** writing the assistant turn. If the claim fails (already owned), skip — no second append.
3. **Explicit wake / xAI unavailable:** B2 pending is the wake inbox. Grok Bot `POST /reply` claims `grok_bot_bridge` only while that correlation is still unowned. If xAI already owned it → **200 replay**, no second append.
4. Refresh is GET-only. HTTP retry of the same `correlationId` does not duplicate founder or CEO turns.

**Explicit wake** means a founder/bridge-intent message that should wake Grok Bot (`wake=true` / `explicitWake=true`, or text starting with `@grok` / `/wake`). Normal chat is owned by xAI when the key is set.

Assign, Researchy jobs, Memory markets, voice, Calendar, and Inbox are **out of scope** for this slice. System prompt is Researchy-first for later Slice 2 — Talk ≠ Assign.

## KV schema

```
ops:ceo:thread:{id} = {
  id, founderEmail, status: pending|answered, updatedAt, answeredIds[],
  messages: [{
    id, role: founder|ceo, text, at,
    correlationId,
    provenance: human | xai_runtime | grok_bot_bridge | system | tool,
    responseOwner: pending | xai_runtime | grok_bot_bridge   // founder turns
  }]
}
ops:ceo:pending = wake inbox only (not canonical)
```

Public thread JSON for the UI strips provenance / owner (one LAVAALL CEO).

## Founder env (Preview only)

Set on Vercel Preview (names only in git — see `.env.example`):

- **`XAI_API_KEY`** — server-only. When set, CEO Talk completes via `POST https://api.x.ai/v1/chat/completions` (`grok-4.3` default, override `OPS_CHAT_XAI_MODEL`).
- **`OPS_CEO_BRIDGE_SECRET`** — 32+ random characters for Grok Bot pending/reply.

Never put values in the repo, PR text, or logs. Adapter: `api/ops/_xai.js`.

The CEO routine still sends `Authorization: Bearer <OPS_CEO_BRIDGE_SECRET>` to:

- `GET /ops/api/ceo-bridge/pending`
- `POST /ops/api/ceo-bridge/reply`

Founder Talk uses the existing allowlist session + CSRF. Agents cannot enqueue as a founder.

## Preview smoke (Osman)

### A. B2 BRIDGE-OK (no xAI, or explicit wake)

1. Sign in on Preview `/ops`.
2. Open **Office**. Desktop default camera is **Lead view**. Tap **Talk** on the LAVAALL CEO desk (or open `/ops/chat?agent=lavaall-ceo`).
3. Confirm one CEO voice — no helper card, no “xAI vs Grok” copy. Slack `#laval` backup one-liner stays.
4. With `XAI_API_KEY` **unset**, send a short message. The page shows **Waiting on CEO…**.
5. Secret client `GET /ops/api/ceo-bridge/pending` sees that text.
6. `POST /ops/api/ceo-bridge/reply` with the same bearer, `{ "threadId", "text", "pendingId" }`. Waiting clears and the reply shows without a hard-refresh. Pending clears.
7. Repeat the same reply POST — **200 replay**, still one CEO message.

### B. xAI into the same KV thread

1. Set Preview `XAI_API_KEY` (never paste the value in chat/PR). Redeploy Preview.
2. Send a normal CEO Talk message (no `@grok` / `/wake`).
3. The same thread should get one LAVAALL CEO reply. Waiting should clear. Pending should be empty.
4. Refresh `/ops/chat?agent=lavaall-ceo` — same messages, no extra turn.
5. Retry the same founder POST with the same `correlationId` — still one founder + one CEO.
6. `POST /reply` for that correlation — **200 replay**, no second CEO append.

### C. Explicit wake still reaches B2

1. With `XAI_API_KEY` set, send `@grok check the queue` (or `wake=true`).
2. Waiting stays. Pending lists that text. xAI must not also append.

### D. Other desks

Open `/ops/chat` with no agent, and Talk on Sales/Technical/Growth/Lifecycle — those still use the existing helper chat. Sign out: unauthenticated POST to `/ops/api/ceo-bridge/message` is 403. A wrong bearer on pending/reply is 401.

If KV is unbound, the page says the store is unavailable. If xAI fails or is unset, Waiting stays and B2 may pick up. No fake reply.

## CEO routine prompt (not limited to 9–17 CT)

Jobs are not limited to weekday 09:00–17:00. Poll when the founder may be working, including evenings. Replace `PREVIEW_ORIGIN` with the Preview host (no trailing slash). Keep the secret in the bot’s env — never in this note.

```
You are LAVAALL CEO. Poll the Preview CEO Talk bridge when woken (not limited to 9–17 CT).

1. GET {PREVIEW_ORIGIN}/ops/api/ceo-bridge/pending
   Header: Authorization: Bearer $OPS_CEO_BRIDGE_SECRET
2. If pending is empty, stop. Do not invent work. Pending is a wake inbox only.
   KV ops:ceo:thread:{id} is the source of truth. Do not treat Grok transcript as SoT.
3. For each pending item, answer the founder text. Drafts only.
   Do not send mail, deploy, spend, or change production.
   L0–L4 still apply: send/deploy/spend needs the founder.
   Do not paste kit emails or secrets unless the founder typed them.
   If the item was already answered by the Office CEO path, POST will replay — do not append again.
4. POST {PREVIEW_ORIGIN}/ops/api/ceo-bridge/reply
   Header: Authorization: Bearer $OPS_CEO_BRIDGE_SECRET
   Body JSON: { "threadId": "<item.threadId>", "text": "<your answer>", "pendingId": "<item.messageId>" }
5. If the POST is a replay (already answered / xAI already owned that correlation), ignore and continue.
6. Slack #laval is backup only. Do not post there for a successful bridge reply.

If pending or reply returns 401, stop — the secret is wrong. If 503, the store is down; retry later. Never invent a founder message.
```
