# LAVAALL OS builder harness

Phase 4 of `2026-11-26-os-one-shot-build-prompt.md`. **Draft pull requests only.** The builder never merges, deploys, touches DNS, or writes to `main`, `master` or `production`.

## How a build happens

1. **Osman approves one build** from his signed-in session: `POST /ops/os/builder/approve` with `{ repo, branch, objective }`.
   - The repo must be `osman-jalloh-lab/Lavaal-` or `osman-jalloh-lab/saloneworks`.
   - The branch must start with `feature/` or `os-build/`. A branch with `main`, `master`, `production` or `prod` anywhere in its path is refused.
   - This mints a single-use approval (`api/ops/_approvals.js`, 15 minutes) bound to exactly that repo, branch and objective, takes it for one job, and queues the job. Nothing runs on Vercel.
2. **The box runner** (`node scripts/os-runner/index.js tick`) picks the oldest queued job. It refuses the job and records why unless all of these hold:
   - `OS_RUNNER_ENABLED` is exactly `1`, and the optional `OS_RUNNER_STOP_FILE` does not exist.
   - `OS_BUILDER_MONTHLY_CAP_USD` is set (50, per Osman on 26 Nov 2026, 6:58 PM CT), and this month's recorded spend plus one more run still fits under it. A missing cap means no run.
   - **How spend is counted.** The Codex CLI reports no dollar cost. So every run that reaches Codex is charged a flat `OS_BUILDER_RUN_ESTIMATE_USD` (default $2), even if it then fails. A $50 cap is therefore at most 25 runs a month. If a run ever reports a real cost above the estimate, the full amount is charged.
   - The approval was minted by the founder session, for this exact request, and its single-use marker belongs to this job.
3. **The run.** The runner:
   - makes a fresh clone and an isolated worktree on the feature branch;
   - runs Codex with `--sandbox workspace-write` in an empty home. Only the Codex login (`auth.json`, from `OS_RUNNER_CODEX_AUTH_FILE` or the box's `~/.codex`) is copied in, with mode 0600. If there is no login, the job fails before Codex starts, and nothing is charged. The environment has no GitHub or KV credentials, and the objective is wrapped as untrusted text;
   - runs the repo's tests (`node tests/run-safe-suite.js` or pytest) and commits;
   - pushes the branch and opens a **draft** PR.
4. **Verify, then record.** GitHub must show an open draft PR from that branch whose head is exactly the commit sha. Only then is the sha and PR URL written to the job record, and an "opened" line added to `docs/os/knowledge/ACTIVITY.md` on the same draft branch.

## What stays off

- `OS_RUNNER_ENABLED` and `OS_BUILDER_MONTHLY_CAP_USD` live on the box only. They are not written to Vercel.
- The #102 workflow (`.github/workflows/os-code-task.yml`) is still the Preview patch-artifact path. It does not open PRs.
- The Claude Code builder (`anthropics/claude-code-action`, Sonnet only, draft PRs only) comes after a local Codex dry run. It is not added here: no Claude GitHub App, no new secrets.
- A ChatGPT or Codex subscription is not the OpenAI API key. The 2-dispatches-a-day limit on #102 is not a dollar cap.

## Before turning it on (Osman)

1. Run `codex login` on the box.
2. Do a local Codex dry run on a throwaway `os-build/` branch: `codex exec --sandbox workspace-write "…"`, then `node tests/run-safe-suite.js` and `git diff`. Push nothing.
3. Set `OS_RUNNER_ENABLED=1` and `OS_BUILDER_MONTHLY_CAP_USD=50` on the box only, and leave `VERCEL_ENV` unset so the box reads the same approvals as the live OS.
4. Approve one small job, then run one `node scripts/os-runner/index.js tick` by hand.
