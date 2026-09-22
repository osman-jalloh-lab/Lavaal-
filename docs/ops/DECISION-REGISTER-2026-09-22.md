# Ops decision register (2026-09-22)

Reference for Preview vs production and open L3 holds. No secrets.

## Decided (executed as far as L2 allows)

| Item | Decision | Status |
|------|----------|--------|
| Jev as decision helper | Evaluator only; operation→target-state→verify; never L3/L4 from confidence | Locked in `docs/ops/JEV-DECISION-AGENT.md` |
| Jev accept threshold | **0.75** (`accept_research`) | Locked in PR #21 code |
| Jev Talk / Assign | **Unwired** — explicit `POST /ops/api/jev/evaluate` only | PR #21 |
| Jev Production `AI_GATEWAY_API_KEY` | **Unset** until separate L3 | Preview key only |
| Jev `OPS_JEV_DEBUG` | **Off** after Preview smoke | Founder OK |
| Routing | Prefer **Grok/CEO bridge → OS**; Slack→email hop **not** required | `docs/ops/ROUTING-DIRECT-GROK-OS.md` |
| Researchy wake recipe | Bot/docs (`docs/OPS-CEO-BRIDGE.md`); Talk SOUL = sourcing + Found/recommend | PR #24 merged `d2be837` |
| Apple / ASBIS / MCI | West Africa Apple reseller **path intent** only; no claim, no scrape, no paid media rights | Founder intent in Jev doc |
| Talk ≠ Assign | Send is not Assign | Ops Talk + Assign code |
| PR #19 Assign Slack wake | Preview dual-run; **HOLD merge** for Osman L3 / poll-off | Open |
| PR #20 CEO Talk hi / quality | Preview; **HOLD merge** for founder smoke | Open draft |
| Office CEO hotspots | Shrink lead aisle CEO box; Talk chrome above map | `fix/office-love-aisle-hotspots` |

## Hard stop this turn

Merging #21 / #19 / #20 / this Preview office branch to `main` is an **L3 production deploy** unless Osman grants L3. Voice asked for production-*ready* / Preview work **without** L3 — keep draft.

## Where things stand

| Piece | Preview | Production |
|-------|---------|------------|
| Jev PR #21 | Spike live; threshold 0.75 | **Not merged**; no Production gateway key |
| Assign wake PR #19 | Preview dual-run Slack+poll | Not merged |
| Direct Grok→OS routing docs | This PR | Docs only until L3 |
| SOUL Talk #23 + Researchy strip #24 | Merged | On `main` @ `d2be837` |
| Office hotspot shrink | This PR | Not merged |

## Discovery pack pointers

See `docs/ops/JEV-DECISION-AGENT.md` § Discovery packs. Box paths: `lavaall-os-discovery/`, `lavaall-ops/WS*`, `LAVAALL-OS/`.

## Jev production enable checklist (when L3 granted)

1. Osman L3 to merge PR #21 (or successor rebase on `main`).  
2. Confirm threshold still 0.75; Talk/Assign still not auto-calling evaluate.  
3. Optionally set Production `AI_GATEWAY_API_KEY` (separate L3/secrets).  
4. Prod smoke: weak → revise; strong cited → accept only if ≥ 0.75; no key in responses.  
5. Leave `OPS_JEV_DEBUG` unset/0.
