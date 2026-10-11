# /ops ranked support@ inbox feed

Draft, flag off. Option B from the Oct 11 2026 inbox review: **the box pushes, the site shows.**

The CEO desk box reads `support@lavaall.com` through its own Gmail connection, runs
`ops-rules/inbox-triage.py`, and POSTs a ranked list here. `/ops/inbox` then shows the
mail most-important-first, each with a phishing flag, an urgency and Jev's second opinion.
No Gmail token is stored on Vercel for this path, and nothing about the existing
`OPS_GMAIL_*` live-inbox / Confirm-send path changes.

## Switches

| Name | Kind | Default | Notes |
|---|---|---|---|
| `OPS_INBOX_TRIAGE_ENABLED` | flag | off | `1`, `true` or `on` turns it on. Off = endpoint 404 and the Inbox page is exactly as before. |
| `OPS_INBOX_FEED_SECRET` | secret (L4) | unset | Bearer the box sends. At least 24 characters, only used by this feed. Unset or short = every POST is 401. |

KV key: `lavaall-ops-inbox-triage-v1` (Preview/Development prefix it with `VERCEL_ENV:` like the routine health strip).
Without KV it falls back to `$OPS_STORE_FILE.inbox-triage.json` locally, or memory.

## Endpoint: `/ops/api/inbox-triage`

- `POST` — box only. `Authorization: Bearer $OPS_INBOX_FEED_SECRET`, `Content-Type: application/json`,
  body at most 65536 bytes. Replaces the whole feed. `200 {ok, stored, count}`.
  Errors: `401 unauthorized`, `400 invalid_json` / `invalid_shape`, `413 payload_too_large`, `503 store_unavailable`.
- `GET` — allowlisted founder session only (the feed bearer cannot read it back). Returns the ranked view.
- Anything else — `405`.

### Exact JSON (no extra or missing keys)

```json
{
  "generatedAt": "2026-10-11T09:30:00Z",
  "mailbox": "support@lavaall.com",
  "items": [
    {
      "id": "1a0e728d16db5c7f",
      "threadId": "1a0e728d16db5c7f",
      "receivedAt": "2026-09-28T08:36:41Z",
      "from": "Austin Foster <austin@nexusnode.co.uk>",
      "subject": "RFQ – NETGEAR APS1000W-100NES | Qty 10",
      "unread": true,
      "flag": "Real",
      "urgency": "Urgent",
      "category": "customer",
      "reason": "Customer quote request (revenue). Still unread.",
      "notes": ["sent Bcc to many vendors (To: is the sender himself), so speed decides who wins"],
      "checks": "SPF pass / DKIM pass / DMARC pass · no warning signs",
      "via": "sales@lavaall.com",
      "jev": { "status": "RUN", "legit": 0.57, "urgency": 0.69 }
    }
  ]
}
```

Rules: `generatedAt`/`receivedAt` UTC `...Z`, not more than 10 minutes in the future. `mailbox` must be
`support@lavaall.com`. At most 50 items, unique `id`. `id`/`threadId` are Gmail hex ids (8–32).
`flag` ∈ Real, Suspicious, Phishing. `urgency` ∈ Urgent, Soon, Low.
`category` ∈ customer, security, billing, request, phishing, promo, fyi. `from`, `subject`, `reason`,
notes ≤ 240 chars, `checks` ≤ 480, `via` ≤ 120 (empty when it came straight to support@), at most 3 notes,
no control characters. `jev.status` ∈ RUN, NOT_RUN; `legit`/`urgency` are 0–1 numbers when RUN, `null` when NOT_RUN.
No message bodies are sent or stored.

## What the page shows

- Flag on and a feed stored: counts (Urgent / Soon / Low / phishing-suspicious), then "Most important first".
  Order: urgency, then flag (Phishing, Suspicious, Real), then unread; ties keep the box's order. Low items are
  collapsed. Each row: urgency + flag + unread pills, subject, sender, time (CT), reason, warning notes, the
  checks line, the Jev pill and an "Open in Gmail" link to the support@ thread. Older than 6 hours = "stale".
- Flag on, no feed (or KV down): the current Inbox, unchanged.
- All mail text is untrusted and escaped.

## How the flag and urgency are decided (box side)

- **Flag** is deterministic only: Google's SPF/DKIM/DMARC (ARC inner results when mail was relayed through
  the sales@ group), From vs Reply-To vs Return-Path domain, link text vs real link domain, IP links,
  shorteners, punycode, lookalike domains, display-name brand impersonation.
- **Urgency** is a transparent heuristic: customer quote/order mail = Urgent; security notices and bills =
  Soon (Urgent when within 2–3 days); newsletters/tips = Low.
- **Jev** (`typesafe-ai/jev` via Vercel AI Gateway) adds `legit` (probability genuine) and `urgency` (0–1).
  Jev grades text and can't check facts, so it never overrides a failed check. Measured Oct 11 2026:
  ~560–1,260 input tokens per email, about $0.00004 per email ($0.042 per million input tokens).
  On real Google mail Jev's `legit` ran low (0.10–0.50), so it is shown as advisory only.

## Box routine

Procedure: `ops-rules/procedures/inbox-triage-feed.md` on the box. It reads only the support@ Gmail
connection, scores, and POSTs only when `~/.ops-inbox-feed-secret` exists. A missing secret or a 404 (flag
off) is a skip, not an error.

## Turning it on (founder)

1. L3: merge this PR.
2. L4: create a random secret (e.g. `openssl rand -hex 32`), set `OPS_INBOX_FEED_SECRET` on Vercel
   (Preview first, then Production) and write the same value to `~/.ops-inbox-feed-secret` (mode 600) on the box.
3. Set `OPS_INBOX_TRIAGE_ENABLED=1` on Preview, redeploy, let the box push once, check `/ops/inbox`.
4. Same on Production when happy.
