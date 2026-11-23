# LAVAALL OS Coding Harness: Release and Acceptance Guide

## What is actually implemented

This branch extends draft PR #100 and PR #101. Hosted Harness chat still uses provider HTTP APIs. **The new "Run code task" flow is distinct from chat.** It requests a real GitHub Actions `workflow_dispatch` that uses OpenAI's official Codex GitHub Action to edit a disposable LAVAALL checkout, exports a patch artifact, and tests it in a separate job without provider credentials.

The workflow **does not create commits, push code, merge PRs or deploy**. The generated patch must be inspected and applied in a separately approved review step.

## Architecture

- Frontend: `api/os/_client/harness.js`, one explicit action and status check.
- API: `/ops/harness/execute` (POST) and `/ops/harness/runs?request_id=<id>` (GET).
- Authorization: founder session via existing `handleHarnessChat` gate; authenticated browser origin checked on POST.
- Configuration: `OS_CODE_RUNS_ENABLED=true`, `OS_GITHUB_RUNNER_TOKEN`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`. Missing configuration fails closed with 503.
- Limits: 2 dispatch attempts/day globally through Redis INCR. Failed dispatch consumes quota rather than risking unbounded retries.
- Scope: only the LAVAALL umbrella project; workflow is limited to the same LAVAALL repository on `main`.
- Workflow: `.github/workflows/os-code-task.yml`, `workflow_dispatch`, Codex action `:workspace` permission profile and `drop-sudo`, read-only repo token, checkout credentials not persisted.
- Outputs: downloadable binary patch artifact (7-day retention) and independent `test-patch` job status.

## Setup requirements and credentials

1. In GitHub, add repository Actions secret `OPENAI_API_KEY` with a funded and appropriately restricted API key. **ChatGPT/Codex subscription credits are not interchangeable with usage billed to this API key.**
2. In Vercel, set `OS_GITHUB_RUNNER_TOKEN` to a fine-grained GitHub token for **only** `osman-jalloh-lab/Lavaal-`, with Actions: Read and write (for workflow dispatch / run listing), no Contents write or Pull requests write. Do not put token values in messages or the repository.
3. Keep `OS_CODE_RUNS_ENABLED=false` or unset until successful reviewer-approved staging tests. Enable it explicitly only after verifying endpoint authorization, rate limits, and actual workflow execution.
4. Ensure `KV_REST_API_URL` and `KV_REST_API_TOKEN` are bound to a non-production test KV instance in Preview so test activity cannot alter production counters.
5. For Preview, configure the GitHub workflow on the default branch or test a dedicated fork. GitHub workflow dispatch requires a workflow registered on the default branch. Do not falsely claim the unmerged workflow can execute on GitHub.
6. Limit GitHub Actions expenditure and OpenAI API billing at account/provider level. The 2-per-day rate limit is a request limit, **not** a dollar spending cap.

## How to prove execution really happened

1. Open the authenticated OS Harness, choose the **LAVAALL** project and enter: `Create docs/os/EXECUTION_PROBE.md with the text "runner executed" and add a Node assertion for the probe, without changing protected files.`
2. Tick the explicit approval checkbox, click Run code task.
3. Verify HTTP 202 returns `requestId` and a GitHub Actions workflow URL. A 202 proves dispatch acceptance, NOT code execution.
4. Open the workflow run with the same `requestId`. Confirm the Codex step started and succeeded in GitHub Actions.
5. Confirm the patch artifact exists and contains `docs/os/EXECUTION_PROBE.md`, with no changes to `.github`, authentication, `.env`, or deployment configuration.
6. Confirm `test-patch` actually applied the patch in a clean second runner and executed `node tests/run-safe-suite.js`. Record output and conclusion.
7. Verify the status endpoint shows the GitHub conclusion and links to the real run.
8. Verify non-founder requests return 401/403, missing origin 403, invalid project 400, three attempts in one day 429, missing config 503, and spoofed/malformed IDs 400.
9. Test OpenAI provider failure: workflow must report failure; OS must not say files were changed or tests passed.
10. Confirm no secrets appear in the logs or patch. Inspect code changes and apply via a separate reviewed PR.

## Code review concerns before production enablement

- Workflow step references include `openai/codex-action@v1` and `actions/upload-artifact@v4`; pin to reviewed full commit SHAs before enabling in environments with secrets.
- Ensure any protection on the default branch prevents accidental workflow edits and PR bypass.
- Verify the stop/error path with restricted or absent `OPENAI_API_KEY`, and that the key is accessible only inside the Codex Action step.
- GitHub Actions runner patches can contain malicious code. The second test job has no provider secret, but it executes patched code. Do not run it on a privileged self-hosted runner.
- A single workflow dispatch may require spend. Add provider-side billing caps; API token usage is not a Codex subscription balance.
- UI currently supports only the LAVAALL repository. Do not claim it edits other grouped projects yet.
- Current chat persistence still uses a shared KV document and can lose concurrent turns; separate scoped append-only storage is recommended.
- There is no automatic PR creation, background retry worker, or per-dollar budget ledger yet.
- The workflow input is a prompt, not a command. Never interpolate it into shell source.
- Test status lookup only sees 50 recent workflow runs and can display pending_discovery if a run ages out; expand to workflow-run ID persistence later.

## Required validation before merge/deploy

```sh
node tests/run-safe-suite.js
node tests/test-harness-chat.js
node tests/test-harness-telemetry.js
node tests/test-os-code-runner.js
git diff --check
```

Run a browser QA of chat-first Harness, Usage, execute approval, error states, mobile layout, and accessible controls. Check CI and Vercel Preview logs, then review changes and protect production configuration.

This document is an implementation handoff and **not** a claim of live runner execution.
