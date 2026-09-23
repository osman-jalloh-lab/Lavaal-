# Decision engine (shadow)

Preview Talk now builds a decision request before the model runs. The production reply path stays in charge.

Regression list: [`qa/regression/2026-09-21-failures.json`](../../qa/regression/2026-09-21-failures.json) (44 rows from 2026-09-21, 42 failed and 2 blocked/partial). Historical `discovery/qa-2026-09-21/` sources are not rewritten by this note.

## Flag

`DECISION_ENGINE_SHADOW_MODE`

- Unset, empty, or `true`: shadow mode. This is the Preview default.
- `false`: the phatic, stale, and blocked-external overrides below may replace the model reply.

Do not set this flag on Production. Do not turn it off to "finish" the 2026-09-21 pack. This slice does not merge to main and does not perform an L3 deploy.

## What runs

Module: `api/ops/_decision.js`.

Wired from `talkToCeo` and `talkToDesk` after the founder turn is stored and before `completeXai`.

Flow: state fingerprint, allowed operations, allowed targets, decision, policy gate. Execution and verification stay on the existing Talk path while shadow mode is on.

The fingerprint hashes:

- thread id
- latest message id
- latest message timestamp
- active entity type and id, when the request carries one
- business-state version (goal, task, and note content the Talk prompt can see)

If the fingerprint changes before the decision is used, the first decision is discarded and the engine re-decides once. If it still does not match, the decision is stale and is not applied. In shadow mode the existing Talk reply is still returned.

A reply bound to message A is not treated as valid for message B, even when both texts are `hi`.

## Why `hi` dumps Goal and Tasks

`ceoSystemPrompt` / `deskSystemPrompt` always append `formatCeoStoreContext` / `formatStoreContext` (goal, open tasks, notes) onto the desk soul. A greeting is not a separate path, so the model sees that store block on `hi` and often echoes it. That matches THREAD-001, STALE-002, THREAD-006, and the Phase G greeting rows.

In shadow mode the engine records `PHATIC_ACK` with `omitStoreContext: true` and `applied: false`. The system prompt sent to xAI is still the production prompt, including the store block.

With the flag explicitly `false`, a whole-message greeting (`hi`, `hello`, `hey`, and the same with light punctuation) skips the model and returns `Hi. What should we look at?` The goal and task block is not copied into that reply. A fingerprint that is still moving returns `That turn moved before I could answer. Send it again.` Send, purchase, and delete stay blocked: `externalActionsPermitted` is false, and those verbs are not allowed operations. No new external action is executed.

## Capability menu

Desk capabilities, tools, and the operation/target menu are in [`capability-matrix.md`](capability-matrix.md).

Before `completeXai`, the engine sets `allowedOperations`, `allowedTools`, and `allowedTargets` from the current desk and text. Route targets are registered Talk desks only. Research targets are that desk's research sources plus a task id for the current prompt. Follow-up targets are eligible lead ids passed into the request. Send, purchase, and delete are not operations the menu can execute.

Delegated Researchy work stores parent request id, parent thread id, child task id, delegated goal, and originating entity on the task, the Researchy pending row, and the desk-talk message. A child result whose lineage disagrees is not written onto the parent thread.

Routing and capability decisions are compared in the shadow log (`operation`, `routeTo`, `targetId`, `shadowDisagreement`). With the shadow default they do not replace the Talk reply.

`DECISION_ENGINE_ROUTING_PREVIEW` is a separate Preview-only flag, default unset. Set it to `true` to let route, delegate, blocked, and clarify decisions replace the model text with an in-thread note. It does not open Assign tasks and does not send, purchase, or delete. `VERCEL_ENV=production` ignores the flag. Leave it unset on Production.

## Not fixed yet

This slice does not claim the 44 rows pass. Live Preview Talk still returns production text while shadow is on.

- Phase 2 — stale responses on real Preview Talk (shadow still returns the production goal dump). STALE-004 Researchy runtime reachability is still a runtime failure.
- Phase 4 — weak research and source quality
- Phase 5 — approval bypass beyond the blocked send/purchase/delete stub
- Phase 6 — hallucination and fact availability. A revenue sentence is capability-blocked here. That is not the UNKNOWN fact contract.
- Phase 7 — context loss and active-entity tracking
- Phase 8 — unsafe state mutation
- Phase 9 — duplicate and idempotency protection
- Phase 10 — independent verification

Phases 11–15 (response contract, full tool-permission rollout, regression gates, acceptance rerun, later PRs) are also out of this slice. Phase 3 covers the registry, the operation/target menu, and delegation ids. It does not by itself make ROUTE-002, ROUTE-004, ROUTE-005, ROUTE-006, CEO-001, or the Growth/Researchy tool rows pass in the browser.
