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

Slice 2 **Assign** (CEO → Researchy child → CEO synthesize) is in scope on this Preview PR. Voice, calendar invites, inbox polish, Office Lead View, a full multi-assignee board, and waking Grok Bot via B2 for Assign stay out of scope.

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
2. Open **Office**. Desktop default camera is **Lead view**. Tap **Talk** on the LAVAALL CEO desk (or open `/ops/chat/lavaall-ceo`).
3. Confirm one CEO voice — desk name only, no helper card, no “xAI vs Grok” copy.
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

## Talk-ALL desks (this push)

All six Office Talk agents use a persistent KV thread + server xAI. `_xai.js` is the only model adapter.

## Slice 2 — Assign (CEO → Researchy → synthesize)

KV tasks in `_store.js` are the SoT. `_assign.js` creates a **child task** owned by **Researchy**, linked to the parent CEO thread + `correlationId`. Researchy runs through existing desk-talk / xAI (`ops:agent:thread:researchy:{id}`) — **never** ceo-bridge. CEO posts a tool ack, then synthesizes the specialist result into the parent CEO thread (`provenance: tool` then `xai_runtime`). Specialist done is not task done until CEO synthesizes. Research/sourcing → Researchy first. Technical is not auto-involved.

HTTP: `POST /ops/ceo-assign/message` (also NL `/assign` or “assign to researchy” on the CEO message path). B2 pending is **not** woken (`enqueuePending: false`).

### Slice 2 Preview smoke (one redeploy)

1. Hard-refresh Preview. Office → CEO **Talk** (`/ops/chat/lavaall-ceo`). First paint must show **Assign to Researchy** under Send — no extra navigation.
2. Type a sourcing brief. Click **Assign to Researchy** (or send `/assign find ThinkPad docks`). CEO thread shows an assign ack. Network: `POST /ops/ceo-assign/message` (200). **No** new row on `GET /ops/api/ceo-bridge/pending`.
3. Open `/ops/tasks`. Child task: owner **researchy**, parent CEO thread id, status doing (not done), assign status assigned / specialist done / synthesized.
4. Open Researchy Talk (`/ops/chat/researchy`). Assigned brief **and** a Researchy reply are already there — Waiting must clear. Do not send another Researchy message. Network: only `/ops/desk-talk/researchy/thread` (200). Zero `/ops/ceo-bridge/thread` and zero `/ops/api/ceo-bridge/thread`.
5. Return to CEO Talk (or wait for the poll). CEO posts a **synthesis** (decision + unknowns), not a raw Researchy dump. Task assign status becomes **synthesized**; task status stays doing until you mark done.
6. Repeat with NL only: `assign to researchy: source USB-C hubs` via Send. Same child + Researchy + synthesis path. Do not involve Technical unless you explicitly ask for validation.

| Desk | Talk route | KV key |
|------|------------|--------|
| LAVAALL CEO | `/ops/chat/lavaall-ceo` | `ops:ceo:thread:{id}` (+ B2 wake inbox) |
| Sales | `/ops/chat/sales` | `ops:agent:thread:sales:{id}` |
| Technical | `/ops/chat/technical` | `ops:agent:thread:technical:{id}` |
| Growth | `/ops/chat/growth` | `ops:agent:thread:growth:{id}` |
| Lifecycle | `/ops/chat/lifecycle` | `ops:agent:thread:lifecycle:{id}` |
| Researchy | `/ops/chat/researchy` | `ops:agent:thread:researchy:{id}` |

`?agent=` still works. `?agent=ceo` is `lavaall-ceo` — never the everyone helper.

Non-CEO desks: xAI when `XAI_API_KEY` is set; otherwise **Waiting on {desk}…** — no invented reply, no B2 poll. UI shows the desk name only (no xAI / Grok labels).

Shared HTTP for non-CEO: `POST /ops/api/desk-talk/message`, `GET /ops/api/desk-talk/thread?agent=`.

### Per-desk Preview smoke

1. Sign in on Preview `/ops`. Open **Office**. Confirm **Researchy** has Talk (six Talk buttons).
2. For **each** desk — CEO, Sales, Technical, Growth, Lifecycle, Researchy:
   1. Tap Talk (or open `/ops/chat/{id}`).
   2. Confirm the heading is that desk’s name — not “Chat”, not “Helper”, not xAI/Grok. No “This desk uses Office Talk” lead.
   3. Send a short message. With `XAI_API_KEY` set, one reply lands in that desk’s thread. The bubble kicker is **that desk**, never “LAVAALL CEO” on a non-CEO desk.
   4. Network tab: desk Talk polls `/ops/desk-talk/{id}/thread` (200). Do not request `/ops/ceo-bridge/thread` or `/ops/api/ceo-bridge/thread` from a non-CEO desk.
   5. Open a **different** desk — threads must not mix.
3. CEO-only: `@grok` / B2 pending / `POST /reply` still BRIDGE-OK. Sales pending must stay empty.
4. Chat with **no** agent still uses the everyone / helper path.
