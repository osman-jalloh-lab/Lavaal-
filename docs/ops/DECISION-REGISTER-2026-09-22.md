# Ops decision register (2026-09-22)

Reference for Preview vs production and open L3 holds. No secrets.

## Decided (executed as far as L2 allows)

| Item | Decision | Status |
|------|----------|--------|
| Jev accept threshold | **0.75** (`accept_research`) | Locked in PR #21 code |
| Jev Talk / Assign | **Unwired** — explicit `POST /ops/api/jev/evaluate` only | PR #21 |
| Jev Production `AI_GATEWAY_API_KEY` | **Unset** until separate L3 | Preview key only |
| Jev `OPS_JEV_DEBUG` | **Off** after Preview smoke | Founder OK |
| Decision architecture | Operation → target state → verify; Jev = **evaluator only**; never L3/L4 from confidence | Spec below |
| Researchy wake recipe | Bot/docs (`docs/OPS-CEO-BRIDGE.md`); Talk SOUL = sourcing + Found/recommend | PR #24 merged `d2be837` |
| PR #19 Assign Slack wake | Preview dual-run; **HOLD merge** for Osman L3 / poll-off | Open |
| PR #20 CEO Talk hi / quality | Preview; **HOLD merge** for founder smoke + suite v1.1 | Open draft |

## Hard stop this turn

Merging #21 / #19 / #20 to `main` is an **L3 production deploy**. Voice asked for production-*ready* work **without** L3 — so readiness stays on Preview + this register until Osman L3.

## Where things stand

| Piece | Preview | Production |
|-------|---------|------------|
| Jev PR #21 | Spike live; smoke evidence in PR / Technical notes | **Not merged**; no Production gateway key |
| Assign wake PR #19 | Preview ready; awaiting Osman L3 | Not merged |
| Talk hi PR #20 | Preview draft; awaiting smoke | Not merged |
| SOUL Talk #23 + Researchy strip #24 | Merged | On `main` @ `d2be837` |
| Decision-layer controller | Architecture recorded; **no new runtime PR** until Jev merge policy clears | N/A |

## Jev production enable checklist (when L3 granted)

1. Osman L3 to merge PR #21 (or successor rebase on `main`).
2. Confirm threshold still 0.75; Talk/Assign still not auto-calling evaluate.
3. Optionally set Production `AI_GATEWAY_API_KEY` (separate L3/secrets) — code returns `jev_not_configured` if unset (dark-safe).
4. Prod smoke: weak → revise; strong cited → accept or revise with logged probability; no key in responses.
5. Leave `OPS_JEV_DEBUG` unset/0.

## Decision-layer shape (reference)

State Normalizer → Valid Action Generator → XAI Decision Controller → Approval Gate → Execution Agents → Independent Verifier → Outcome Store → Future Calibration.

Pack / proposal paths (box / discovery): business controller docs + JSON contracts; TypeSafe Jev remains evaluator only.
