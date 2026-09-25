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

## Not fixed yet

Phases 2–10 of the 2026-09-21 fix plan are still open. This PR does not claim the 44 rows pass.

- Phase 2 — stale responses on real Preview Talk (shadow still returns the production goal dump)
- Phase 3 — routing and tool misuse
- Phase 4 — weak research and source quality
- Phase 5 — approval bypass beyond the blocked send/purchase/delete stub
- Phase 6 — hallucination and fact availability
- Phase 7 — context loss and active-entity tracking
- Phase 8 — unsafe state mutation
- Phase 9 — duplicate and idempotency protection
- Phase 10 — independent verification

Phases 11–15 (response contract, tool permissions, regression gates, acceptance rerun, later PRs) are also out of this slice.
