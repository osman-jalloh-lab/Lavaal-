# LAVAALL OS builder harness

Phase 4 of `2026-11-26-os-one-shot-build-prompt.md`. **Draft pull requests only.** The builder never merges, deploys, touches DNS, or writes to `main`, `master` or `production`.

## How a build happens

1. **Osman approves one build** on the /os **Build** page ("Start a build"), or by calling `POST /ops/os/builder/approve` with `{ repo, branch, objective, executor, model }`.
   - **Builder:** `codex`, or `claude` with `sonnet` or `opus`. Opus is for the builder only, when Osman picks it.
   - The repo must be `osman-jalloh-lab/Lavaal-` or `osman-jalloh-lab/saloneworks`.
   - The branch must start with `feature/` or `os-build/`. A branch with `main`, `master`, `production` or `prod` anywhere in its path is refused.
   - This mints a single-use approval (`api/ops/_approvals.js`, 15 minutes) bound to exactly that repo, branch and objective, takes it for one job, and queues the job. Nothing runs on Vercel.
2. **The box runner** (`node scripts/os-runner/index.js tick`) picks the oldest queued job. It refuses the job and records why unless all of these hold:
   - `OS_RUNNER_ENABLED` is exactly `1`, and the optional `OS_RUNNER_STOP_FILE` does not exist.
   - `OS_BUILDER_MONTHLY_CAP_USD` is set (50, per Osman on 26 Nov 2026, 6:58 PM CT), and this month's recorded spend plus one more run still fits under it. A missing cap means no run.
   - **How spend is counted.** The Codex CLI reports no dollar cost. So every run that reaches Codex is charged a flat `OS_BUILDER_RUN_ESTIMATE_USD` (default $2), even if it then fails. A $50 cap is therefore at most 25 Codex or Sonnet runs a month. An Opus run is charged `OS_BUILDER_OPUS_RUN_ESTIMATE_USD` (default $6). If a run ever reports a real cost above the estimate, the full amount is charged.
   - The approval was minted by the founder session, for this exact request, and its single-use marker belongs to this job.
3. **The run.** The runner:
   - makes a fresh clone and an isolated worktree on the feature branch;
   - runs the builder in an empty home. **Codex** runs with `exec --json --sandbox workspace-write`. **Claude Code** runs with `-p --model sonnet|opus --permission-mode default --input-format stream-json --output-format stream-json --verbose --permission-prompt-tool stdio`, with file tools only and no shell or web. No tool is pre-allowed, so every edit goes through the worktree check first; anything else it wants becomes a card (see "Cards"). Their event output feeds the live progress below. Only its login (`~/.claude/.credentials.json`, or `OS_RUNNER_CLAUDE_AUTH_FILE`) is copied in.
   - Codex details: Only the Codex login (`auth.json`, from `OS_RUNNER_CODEX_AUTH_FILE` or the box's `~/.codex`) is copied in, with mode 0600. If there is no login, the job fails before Codex starts, and nothing is charged. The environment has no GitHub or KV credentials, and the objective is wrapped as untrusted text;
   - runs the repo's tests (`node tests/run-safe-suite.js` or pytest) and commits;
   - pushes the branch and opens a **draft** PR.
4. **Verify, then record.** GitHub must show an open draft PR from that branch whose head is exactly the commit sha. Only then is the sha and PR URL written to the job record, and an "opened" line added to `docs/os/knowledge/ACTIVITY.md` on the same draft branch.

## Live progress

While a build runs, the Build page shows what the builder is doing, under the job (or under the build step of a plan).
- The builders print one JSON event per line: Claude Code with `--output-format stream-json --verbose`, Codex with `codex exec --json`. Permissions and tools are unchanged.
- `scripts/os-runner/progress.js` turns each event into one short line: the stage ("Running the tests"), the tool and a path relative to the worktree ("Editing api/os/_client/build.js"), or the first line of a note. It never shows file contents, command text or command output. Anything shaped like a key or token is replaced with `[redacted]`, and every line is clipped to 160 characters. Unknown events are skipped.
- Lines go to KV at `builder-jobs:<id>:progress`, in batches every few seconds. Only the last 40 are kept, for 7 days. Repeats in a row are folded ("Reading a.js (x3)").
- The last line says how the run ended: draft PR opened and checked on GitHub, no changes, or "Stopped:" with the reason.
- Progress is best effort. A KV error while writing progress never fails or slows a build.
- `GET /ops/os/builder` returns `progress` for jobs that ran. The page refreshes every 6 seconds while a job is queued or running and the tab is visible.

## Cards: Claude asks, Osman answers

A Claude build can stop and ask instead of guessing or failing. Codex is unchanged: `codex exec` has no way to ask.
- Claude runs with `--input-format stream-json --permission-prompt-tool stdio` (`scripts/os-runner/claude-session.js`). The task goes in on stdin. Any tool call that is not already allowed comes to the runner as a permission request.
- The runner decides first (`permissionFor` in `scripts/os-runner/index.js`):
  - **Refused, never asked:** shell and web (Bash, WebFetch, WebSearch), and any path outside the worktree. Paths are checked where they really point (a symlink inside the checkout that leads outside is refused), `~` paths are refused, and Glob patterns or Grep file filters that start at `/` or climb with `..` are refused.
  - **Allowed:** the file tools inside the worktree, and Claude's own task list.
  - **Question card:** Claude asks Osman something (`AskUserQuestion`, up to four questions).
  - **Approval card:** any other tool (a sub-agent, a skill, an MCP tool). Its input is shown clipped and redacted. Osman can allow it once or say no.
- While a card waits, the job is `needs_you` and carries `job.ask`. The Build page shows the card under the job or plan step.
- Osman answers with `POST /ops/os/builder/answer` `{ job_id, rid, decision, answers? }`. Only his signed-in session can, and only for the card that is waiting. It mints a single-use `builder_answer` approval bound to the job, the card, the decision and the exact answer text, uses it at once, and writes the answer once.
- The runner checks that approval before acting. An answer without a valid approval is a no.
- **No answer in 15 minutes is a no.** So is the run ending. At most 5 cards per run; after that Claude must make the safest choice and say so in its summary.
- A question's answer goes back to Claude as text, and nothing runs. "Allow once" lets that one call through, not later ones.
- Waiting does not count against the 20-minute work timer, and the builder lock is kept alive while a card waits.

## Budget: pause and ask, not a wall

Osman, 27 Nov 2026: the $50 is the monthly budget to use. It is not a hard stop.
- Every step is counted: Codex or Sonnet $2, Opus $6, and a research, design or draft step $0.25.
- **At 80%** of this month's allowance, the Build page warns.
- **When the next step would pass the allowance**, that step pauses. Builds stay queued and plan steps stay waiting. The Build page shows "Paused: budget reached", how much is used, and what is waiting.
- **Continue** (Osman's session only) adds $50 to this month's allowance (`POST /ops/os/builder/budget`, up to $500 at a time) and the paused work goes on. Osman tops up his API credits himself.
- A **missing or invalid** `OS_BUILDER_MONTHLY_CAP_USD` still stops everything, because that is a setup mistake, not a budget.

## Project manager (Phase 6)

On /os → Build → **Project manager**, Osman types up to five goals, one per line. For each goal the PM (`api/ops/_os_pm.js`) writes a plan and gives each step to the agent best at it:

| Step | Agent | Why |
|---|---|---|
| Research | Grok (DeepSeek when there is no xAI key) | live web and X |
| Design / spec | DeepSeek (Codex chat when there is no DeepSeek key) | cheap, good at specs |
| Draft (text only) | DeepSeek | copy, emails, posts; nothing is built |
| Build | Claude Opus for big builds (a website, an app), Codex for small fixes, Claude Sonnet otherwise | if that builder already has work, the next free one (Codex or Sonnet) takes it; Opus only when the PM picked it |

- **Plan** is a free preview: nothing is saved or spent.
- **Approve and run** happens in Osman's session only. It saves the plans and mints one single-use `code_run` approval per build step, bound to its task, branch, builder and model. Each build is held until its design step is done.
- **While the page is open**, every unfinished plan moves one step forward at the same time.
  - Research, design and draft steps run here through the provider APIs. Each one is charged `OS_PM_CHAT_STEP_ESTIMATE_USD` (default $0.25) against the same $50 cap.
  - A finished design releases its build to the box runner, with the design notes attached and wrapped as untrusted.
- **The runner works on several builds at once:** one per builder (Codex, Claude Sonnet, Claude Opus), each under its own lock. Run `tick` every minute, more than once if needed; each tick takes the oldest queued job whose builder is free.
- Builds open **draft PRs only**, and the plan shows the PR link. Nothing merges, deploys or sends.

## What stays off

- `OS_RUNNER_ENABLED` and `OS_BUILDER_MONTHLY_CAP_USD` live on the box only. They are not written to Vercel.
- The #102 workflow (`.github/workflows/os-code-task.yml`) is still the Preview patch-artifact path. It does not open PRs.
- Claude Code runs on the box next to Codex. There is no Claude GitHub App and no GitHub secret, and `anthropics/claude-code-action` is not used.
- Box setup step by step: `docs/os/BOX-SETUP.md`.
- A ChatGPT or Codex subscription is not the OpenAI API key. The 2-dispatches-a-day limit on #102 is not a dollar cap.

## Before turning it on (Osman)

1. Run `codex login` on the box.
2. Do a local Codex dry run on a throwaway `os-build/` branch: `codex exec --sandbox workspace-write "…"`, then `node tests/run-safe-suite.js` and `git diff`. Push nothing.
3. Set `OS_RUNNER_ENABLED=1` and `OS_BUILDER_MONTHLY_CAP_USD=50` on the box only, and leave `VERCEL_ENV` unset so the box reads the same approvals as the live OS.
4. Approve one small job, then run one `node scripts/os-runner/index.js tick` by hand.
