# LAVAALL OS: harness reliability, real usage, and chat-first redesign

## Scope
Stacked development branch off `feature/os-harness-chat` (draft PR #100). This branch deliberately makes **no deployment, billing, model-provider connection, or credential changes**. The production `main` remains untouched.

## Verified starting point
- `api/os/index.js` hosts a founder-only, Vercel JavaScript OS shell.
- Draft PR #100 adds authenticated `/ops/harness/chat`, `history` and `usage` routes.
- Hosted `codex` adapter in this draft uses **OpenAI Chat Completions**, not Codex CLI, cloud coding execution, or ChatGPT subscription billing.
- Claude and DeepSeek call provider APIs using server-side keys.
- Chat records use a KV read-modify-write of a single shared document, which can lose concurrent updates.
- Existing `Spend` is fed by stored spend records, not verified provider invoices.

## Implemented in this branch
1. `api/ops/_harness_telemetry.js`: normalize provider-reported input, output and cached token counts. Never invent a cost. Distinguish token usage from paid charges.
2. `api/ops/_harness_chat.js`: bounded provider network request (45-second AbortController), safe handling of provider timeouts and transport failures, no raw provider response body in client error, include usage in assistant message and returned API payload.
3. `api/os/_client/harness.js`: chat opens first; usage is secondary; display `OpenAI API` rather than implying the hosted adapter executes Codex CLI; show per-reply provider-reported tokens with explicit `Cost not available`. Retain a user's draft on unsuccessful responses; Ctrl/Cmd+Enter submits.
4. `tests/test-harness-telemetry.js`: isolated provider-usage parsing regression checks.

## Tests actually run
- A local isolated copy of the telemetry module and test ran in Node 22: **7 assertions passed**.
- The complete repository `node tests/run-safe-suite.js` was **not run** in the current container because the GitHub repository cannot be cloned from this sandbox (external shell DNS unavailable). The suite must run in CI or on a checked-out repository.
- The new provider error and UI paths need integration verification with existing test fakes and a browser smoke test.

## Remaining high-priority work: true repository-editing Harness
**Do not claim the hosted model replies are file edits.** Implement a separate, private coding runner with:
- A durable `runs` table and states `queued/running/awaiting_approval/completed/failed/cancelled`.
- An explicit repository allowlist and branch policy (never work on protected branches directly).
- An authenticated action that requests a coding run with project, repo, task, model, budget and permissions.
- Isolated temporary checkout, no untrusted shell execution on Vercel web functions.
- The chosen Codex / coding-agent execution adapter, verified to support the requested operation.
- Secure tool capability scopes, command allowlists, secrets isolation, and strict run timeouts.
- Streaming/polling progress, diff review, test artifacts and links to draft PRs.
- Approval before merging, deployment, external messages, billing or modifying production.
- Idempotent task IDs, concurrency control, cancellation and retry safety.
- Explicitly separate OpenAI API token usage from Codex subscription quotas and billing.

## Spending and budgeting next steps
- Build an append-only `harness_usage_events` ledger per request, with provider, actual model, project, run ID, returned tokens and request timestamp. **No cost field should be treated as actual billing unless the billable source supports it.**
- Add a pricing-version table and an **estimated** usage charge where official model token rates are verified; never call it actual charged spend.
- Ingest provider statements / reports with explicit source, currency and timestamp; reconcile duplicate events with idempotency keys.
- Budget warnings and enforceable pre-call checks must be server-side. In-flight operations can still incur costs.
- Codex subscription usage cannot be inferred from OpenAI API token costs.

## Security and reliability review gates
1. Existing single-document KV history is subject to lost updates when two requests call `appendTurn` simultaneously. Replace it with atomic, per-project conversation lists or an append-only store before production-scale chat.
2. The 45-second timeout bounds the fetch only when the runtime honors AbortSignal. Confirm it in real Vercel hosting and provider mocks.
3. Add conservative rate limiting, spend limits and request deduplication before enabling paid provider keys in Preview or Production.
4. Verify the founder guard/CSRF/origin policies for the new authenticated POST route.
5. Verify no API keys or raw provider errors leak into browser data or logs.
6. Check old branch tests for expected text changes, browser behavior and navigation accessibility.
7. Re-run safe suite, lint/security scans and no-network tests on a fresh checkout.

## Recommended implementation sequence
- **PR A (this branch):** honest hosted-chat foundation and telemetry, safety/UX improvements.
- **PR B:** append-only usage records + coherent spend dashboard and budget rules.
- **PR C:** durable coding-run engine / isolated worker + GitHub draft-PR handoff.
- **PR D:** UI unification: simplify primary nav, model selection and runs screen, accessibility and mobile polish.

All branches remain drafts until reviewed. No automatic merge/deploy.
