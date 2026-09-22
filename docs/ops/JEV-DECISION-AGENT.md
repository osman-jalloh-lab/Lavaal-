# Jev — decision-making agent (LAVAALL workstream)

**Status:** Docs lock for Preview / L2. Jev evaluates research quality only. Never merges to `main`, never L3/L4 from confidence. No secrets in this file.

**Related:** `docs/ops/DECISION-REGISTER-2026-09-22.md`, `docs/ops/JEV-PRODUCTION-READINESS.md` (when present), `docs/ops/ROUTING-DIRECT-GROK-OS.md`, `docs/OPS-CEO-BRIDGE.md`, PR #21 (`cursor/jev-research-quality-gate-fae2`).

## Founder intent (locked narrative)

LAVAALL is a quote-first West Africa IT **supplier / sourcing** business (not marketplace checkout). Markets: Sierra Leone first, then Guinea, Guinea-Bissau, Liberia.

**Apple reseller path (intent only):** explore authorized distribution via regional partners such as **ASBIS** and **MCI** (and similar public wholesale paths). Do **not** claim Apple authorization, invent prices/SKUs, scrape Apple/Amazon/Back Market media, or purchase Full Icecat / media rights without founder L3. Catalog Apple remains constrained by Icecat entitlement (see MAGNUM §17). Evidence-first supplier intros only; no outbound send until founder says go.

**Ops desks (six Talk agents):**

| Desk | Role |
|------|------|
| LAVAALL CEO | Orchestrator / OS owner — answers first, routes second |
| Sales & Customer Success | Requests, quote frames, bookings (drafts) |
| Technical & QA | Repo, site, validation / pass-fail |
| Growth, UGC & Ads | Ideas and prep (L1 until approved spend) |
| Lifecycle & Klaviyo | Journeys (parked routing until Klaviyo auth) |
| Researchy | Sourcing research — Found, then recommend |

**Talk ≠ Assign.** A normal Talk **Send** is never an auto-Assign to Researchy. Assign is explicit (button or NL “assign to researchy”).

**Risk ladder L0–L4:**

| Level | Meaning |
|-------|---------|
| L0 | Read / inspect |
| L1 | Prepare drafts / research (no send) |
| L2 | Internal OS / discovery docs |
| L3 | External send, publish, production deploy — **founder** |
| L4 | Money, contracts, secrets, destructive prod — **founder** |

Never self-elevate. Jev confidence never grants L3/L4.

**Research quality gate:** `accept_research` probability ≥ **0.75** → code may return `accept`; else `revise`. Wired only at `POST /ops/api/jev/evaluate` (PR #21). Talk and Assign do **not** auto-call Jev.

**Production `AI_GATEWAY_API_KEY`:** **unset** until separate Osman L3. Missing key → dark-safe `jev_not_configured`. Preview key only for smoke.

**Researchy wake:** lives in bot/docs (`docs/OPS-CEO-BRIDGE.md`, `docs/ops/ROUTING-DIRECT-GROK-OS.md`) — **not** in Talk `SOUL_researchy.md`. Talk Researchy = sourcing voice + Found/recommend only.

## Architecture (decision layer)

Shape: **operation → target-state → verify**.

Reference pipeline (docs / packs; not a license to auto-execute):

1. State Normalizer  
2. Valid Action Generator  
3. XAI Decision Controller (proposal)  
4. Approval Gate (founder for L3/L4)  
5. Execution Agents (CEO / desks / Grok poll)  
6. Independent Verifier  
7. Outcome Store → future calibration  

**Jev = evaluator / decision helper only.** It scores research quality. It does not deploy, send mail, spend, merge to `main`, or set production secrets. Never promote an action to L3/L4 because probability is high.

## Routing policy

Prefer **direct Grok Bot / CEO bridge → OS** (desk-talk pending/reply or CEO B2 pending/reply with `OPS_CEO_BRIDGE_SECRET` in bot env only).

Do **not** require a **Slack → email → OS** multi-hop when the direct bridge is equivalent. Slack handoff / `#laval` notes are optional fail-soft dual-run, not the SoT.

Verify Assign wakes with:

`GET https://www.lavaall.com/ops/api/desk-talk/researchy/pending`  
(Authorization: Bearer `$OPS_CEO_BRIDGE_SECRET` — env only).

Details: `docs/ops/ROUTING-DIRECT-GROK-OS.md`.

## QA gates

- No inventing specs, prices, SKUs, suppliers, or landed costs.  
- No infra / vendor / secret leaks in Talk (no `/ops` URLs, no bridge secret, no gateway keys in SOUL prompts).  
- Evidence-first: cite sources or mark UNKNOWN.  
- Starlink / Apple authorization: intent ≠ authorization.  
- No new category map, no paid purchase, no media-rights scrape in this workstream.

## Discovery packs (pointers)

Not required to live under `docs/ops/`. If present on the box or Drive, treat as draft L1–L2 input only:

- Box / workspace: `lavaall-os-discovery/` (SIMPLE-PLAN, CURRENT-STATE-AUDIT, skills audit)  
- Ops drafts: `lavaall-ops/WS1-products-suppliers-SL.md` and related WS packs  
- OS context: `LAVAALL-OS/context/`, `LAVAALL-OS/decisions/log.md`  
- Repo catalog discovery scripts: `scripts/catalog-import/discovery*` (import tooling — not Apple reseller authorization)

Prefer SIMPLE-PLAN tone over dense multi-doc packs when briefing the founder.

## Explicit non-goals

- Merge to `main` / production deploy without Osman L3  
- Wiring Talk or Assign to auto-call Jev  
- Setting Production `AI_GATEWAY_API_KEY` without L3  
- Claiming ASBIS/MCI/Apple partnership as done  
- Replacing direct OS poll with email hops  
