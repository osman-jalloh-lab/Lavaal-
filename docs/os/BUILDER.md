# LAVAALL OS builder harness

Phase 4 of `2026-11-26-os-one-shot-build-prompt.md`. **Draft pull requests only.** The builder never merges, deploys, touches DNS, or writes to `main`, `master` or `production`.

## How a build happens

1. **Osman approves one build** from his signed-in session: `POST /ops/os/builder/approve` with `{ repo, branch, objective }`.
   - The repo must be `osman-jalloh-lab/Lavaal-` or `osman-jalloh-lab/saloneworks`.
   - The branch must start with `feature/` or `os-build/`. A branch with `main`, `master`, `production` or `prod` anywhere in its path is refused.
   - This mints a single-use approval (`api/ops/_approvals.js`, 15 minutes) bound to exactly that repo, branch and objective, takes it for one job, and queues the job. Nothing runs on Vercel.
2. **The box runner** (`node scripts/os-runner/index.js tick`) picks the oldest queued job. It refuses the job and records why unless all of these hold:
   - `OS_RUNNER_ENABLED` is exactly `1`, and the optional `OS_RUNNER_STOP_FILE` does not exist.
   - `OS_BUILDER_MONTHLY_CAP_USD` is set (50, per Osman on 26 Nov 2026, 6:58 PM CT), and this month's recorded spend is below it. A missing cap means no run.
   - The approval was minted by the founder session, for this exact request, and its single-use marker belongs to this job.
3. **The run.** The runner:
   - makes a fresh clone and an isolated worktree on the feature branch;
   - runs Codex with `--sandbox workspace-write`. Its environment has no GitHub or KV credentials, and the objective is wrapped as untrusted text;
   - runs the repo's tests (`node tests/run-safe-suite.js` or pytest) and commits;
   - pushes the branch and opens a **draft** PR.
4. **Verify, then record.** GitHub must show an open draft PR from that branch whose head is exactly the commit sha. Only then is the sha and PR URL written to the job record, and an "opened" line added to `docs/os/knowledge/ACTIVITY.md` on the same draft branch.

## What stays off

- `OS_RUNNER_ENABLED` and `OS_BUILDER_MONTHLY_CAP_USD` live on the box only. They are not written to Vercel.
- The #102 workflow (`.github/workflows/os-code-task.yml`) is still the Preview patch-artifact path. It does not open PRs.
- The Claude Code builder (`anthropics/claude-code-action`, Sonnet only, draft PRs only) comes after a local Codex dry run. It is not added here: no Claude GitHub App, no new secrets.
- A ChatGPT or Codex subscription is not the OpenAI API key. The 2-dispatches-a-day limit on #102 is not a dollar cap.

## Before turning it on (Osman)

Do a local Codex dry run on a throwaway `os-build/` branch. Then set `OS_RUNNER_ENABLED=1` on the box only, and run one `tick` by hand.
