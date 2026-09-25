# Jev production readiness (PR #21)

## What shipped on Preview

- Route: `POST /ops/api/jev/evaluate` (founder session + CSRF).
- Model via Vercel AI Gateway: TypeSafe Jev evaluate HTTP.
- Code decision: `accept` if `accept_research` probability ≥ **0.75**, else `revise`.
- Talk and Assign **do not** call this route.
- Missing/short `AI_GATEWAY_API_KEY` → **503** `jev_not_configured` (safe dark deploy).

PR: https://github.com/osman-jalloh-lab/Lavaal-/pull/21  
Branch: `cursor/jev-research-quality-gate-fae2`

## Founder decisions (2026-09-22)

1. Keep threshold **0.75**.
2. Leave **Production** `AI_GATEWAY_API_KEY` unset until explicit go.
3. Turn off `OPS_JEV_DEBUG` after Preview logs.
4. Preview-only until L3 merge approval.

## Smoke expectations

| Case | Expect |
|------|--------|
| Weak / unsourced | `action: revise`, probability ≪ 0.75 |
| Strong cited | probability reported; accept only if ≥ 0.75 |
| No key | 503 `jev_not_configured` |
| Response body | No API key / gateway secret |

## Not done without L3

- Merge to `main` / production deploy.
- Setting Production gateway key.
- Wiring Talk or Assign to auto-evaluate.

Full policy: `docs/ops/JEV-DECISION-AGENT.md`.
