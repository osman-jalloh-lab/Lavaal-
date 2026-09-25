# Routing — prefer direct Grok / CEO bridge → OS

**Status:** Preview / L2 docs. No secrets. Do not merge as a production behavior change by itself.

## Preferred path (SoT)

1. Founder acts in `/ops` (CEO Talk Send or **Assign to Researchy**).  
2. OS writes KV SoT (`ops:ceo:thread:*` or Researchy desk-talk pending).  
3. **Grok Bot polls OS directly** and replies with the bridge bearer:
   - Researchy Assign (production SoT):  
     `GET/POST https://www.lavaall.com/ops/api/desk-talk/researchy/pending|reply`  
   - CEO B2 explicit wake (Preview-oriented; Prod HOLD for standing CEO B2 poll):  
     `GET/POST {PREVIEW_ORIGIN}/ops/api/ceo-bridge/pending|reply`  
4. Secret stays in **bot env only** (`OPS_CEO_BRIDGE_SECRET`). Never in Slack, email, git, or Talk SOUL.

Slack `#laval` / handoff `LAVAALL_TASK` / optional `LAVAALL_ASSIGN` posts are **backup / dual-run**, fail-soft. They are **not** required for a correct Assign.

## Not required: Slack → email → OS multi-hop

Do **not** build or depend on: Slack wake → human/email relay → magic-link or inbox → OS, when the direct pending/reply poll is available and equivalent.

Reasons:

- Extra hops drop correlationIds / pendingIds.  
- Email paths risk secret paste and delayed wakes.  
- KV pending on `www.lavaall.com` is already the Assign SoT.

If Slack token is unset or `chat.postMessage` fails, Assign must still succeed and the poll row must remain (fail-soft). Dual-run flags (when present on a Preview branch) must default so **poll remains sufficient**.

## How to verify routing

### Researchy Assign (production SoT host)

1. On `https://www.lavaall.com/ops`, CEO Talk → **Assign to Researchy** with a short sourcing brief.  
2. `GET https://www.lavaall.com/ops/api/desk-talk/researchy/pending` with bearer → row lists `taskId` / `pendingId` / `correlationId`.  
3. Grok Bot `POST …/researchy/reply` with findings + those ids (never threadId alone).  
4. CEO Talk shows Found + recommend; task Ready for review.  
5. Slack handoff may or may not show `LAVAALL_ASSIGN` — **optional**. Absence must not block step 2–4.

### CEO Talk B2 (Preview)

1. Explicit wake (`@grok` / `wake=true`) or xAI unset → pending on Preview CEO bridge.  
2. Grok Bot polls Preview `…/ceo-bridge/pending` and `…/reply`.  
3. Replay POST does not double-append.

### Negative checks

- Wrong bearer → 401; stop (do not invent work).  
- Preview URL for Researchy Assign may **410** — use `www.lavaall.com` for Assign SoT.  
- No bridge secret in Slack/email/Talk.

## Dual-run notes

| Path | Role |
|------|------|
| Desk-talk / CEO-bridge HTTP poll | **Primary** SoT wake for Grok |
| Slack `LAVAALL_ASSIGN` / `LAVAALL_TASK` | Optional notify; fail-soft |
| Slack → email → OS | **Not required**; do not prefer |
| In-OS xAI “OK Researchy” | Not the real Assign work unless `OPS_ASSIGN_XAI_FALLBACK=1` |

Full recipes: `docs/OPS-CEO-BRIDGE.md`. Decision policy: `docs/ops/JEV-DECISION-AGENT.md`.
