# LAVAALL OS — CEO Talk bridge (Preview MVP, tickets 12b–12e)

**Status:** Preview only. Prod HOLD. Do not merge to `main`. Do not production-deploy.  
**Path:** B2 queue + LAVAALL CEO routine. B1 skipped. Slack `#laval` is a fallback note only.

Office CEO Talk and `/ops/chat?agent=lavaall-ceo` write to a private queue. The real Grok Bot **LAVAALL CEO** polls pending items and posts replies. Other desks still use `/ops/chat?agent=…` with the Anthropic/OpenAI helper. Researchy Talk stays off.

## Founder env (Preview only)

Set **`OPS_CEO_BRIDGE_SECRET`** on the Vercel Preview environment (32+ random characters). Name only in git — see `.env.example`. Never put the value in the repo, PR text, or logs.

The CEO routine sends `Authorization: Bearer <that secret>` to:

- `GET /ops/api/ceo-bridge/pending`
- `POST /ops/api/ceo-bridge/reply`

Founder Talk uses the existing allowlist session + CSRF. Agents cannot enqueue as a founder.

## Preview smoke (Osman)

1. Sign in on Preview `/ops`.
2. Open **Office**. Tap **Talk** on the LAVAALL CEO desk (or open `/ops/chat?agent=lavaall-ceo`).
3. Confirm the helper card is gone. You should see the CEO thread and the Slack `#laval` backup one-liner — not Anthropic/OpenAI setup copy.
4. Send a short message. The page shows **Waiting on CEO…** and does not invent a reply.
5. With `OPS_CEO_BRIDGE_SECRET` set, a secret client `GET /ops/api/ceo-bridge/pending` sees that text.
6. `POST /ops/api/ceo-bridge/reply` with the same bearer, `{ "threadId", "text", "pendingId" }`. The Chat poll should drop **Waiting on CEO…** and show the reply without a hard-refresh. Pending clears.
7. Open `/ops/chat` with no agent, and Talk on Sales/Technical/Growth/Lifecycle — those still use the existing helper chat.
8. Sign out. Unauthenticated POST to `/ops/api/ceo-bridge/message` is 403. A wrong bearer on pending/reply is 401.

If KV is unbound, the page says the store is unavailable. If the CEO bot is offline, the waiting line stays. No fake reply.

## CEO routine prompt (weekday daytime)

Paste this on the LAVAALL CEO bot as a weekday daytime routine (approx. 09:00–18:00 founder local time). Replace `PREVIEW_ORIGIN` with the Preview host (no trailing slash). Keep the secret in the bot’s env — never in this note.

```
You are LAVAALL CEO. On weekday daytime, poll the Preview CEO Talk bridge.

1. GET {PREVIEW_ORIGIN}/ops/api/ceo-bridge/pending
   Header: Authorization: Bearer $OPS_CEO_BRIDGE_SECRET
2. If pending is empty, stop. Do not invent work.
3. For each pending item, answer the founder text. Drafts only.
   Do not send mail, deploy, spend, or change production.
   L0–L4 still apply: send/deploy/spend needs the founder.
   Do not paste kit emails or secrets unless the founder typed them.
4. POST {PREVIEW_ORIGIN}/ops/api/ceo-bridge/reply
   Header: Authorization: Bearer $OPS_CEO_BRIDGE_SECRET
   Body JSON: { "threadId": "<item.threadId>", "text": "<your answer>", "pendingId": "<item.messageId>" }
5. If the POST is a replay (already answered), ignore and continue.
6. Slack #laval is backup only. Do not post there for a successful bridge reply.

If pending or reply returns 401, stop — the secret is wrong. If 503, the store is down; retry later. Never invent a founder message.
```
