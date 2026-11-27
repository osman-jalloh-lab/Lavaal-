# Pick up here

Read this first. It points into the one shared memory; it is not a second memory. Every builder (Drake, Claude, Codex, the OS itself) reads this on start, then the files below, and changes them only through a draft PR.

Updated 26 Nov 2026, about 7:30 PM CT (America/Chicago), Phase 0 of `2026-11-26-os-one-shot-build-prompt.md`.

## Read next, in order

1. `docs/os/knowledge/` — business briefs and sourced facts. **Not created yet** (Core phase).
2. `docs/os/DECISIONS.md` — the decisions log. Extend it; never fork a second log.
3. `docs/os/knowledge/ACTIVITY.md` — what landed (sha, PR, time). **Not created yet** (Core phase).
4. `tools/lavaall-ai/RULES.md` — standing rules (Sonnet only, never Opus; no deploy, merge, send, post or spend without Osman).

Until the Core phase lands, `docs/os/HANDOFF-AGENTIC-OS.md` and `HANDOFF.md` are the older handoffs; treat them as history, not the source of truth.

## Last shipped (production, `main`)

| Sha | PR | What | Merged (CT) |
|---|---|---|---|
| `f804749` | #128 | Motion pass, four design skills (`.claude/skills/`), `docs/design/DESIGN.md` | 26 Nov 2026, 6:58 PM |
| `6286b9e` | #127 | Chat and Memory redesign, Visual cortex, sidebar agent card | 25 Nov 2026, 11:21 PM |
| `278acca` | #126 | Steady Google status, every model in chat, SaloneHire 1 Dec launch countdown, business overview | 25 Nov 2026 |

Source: `git log origin/main` on 26 Nov 2026. Hosted chat is the provider HTTP APIs in `api/ops/_harness_chat.js`, not the CLIs. The #102 Actions runner (`.github/workflows/os-code-task.yml`) only writes a patch artifact, is Preview-flagged, and stays off in production.

## Open drafts left untouched

Osman, 26 Nov 2026, 7:01 PM CT: do not rebase #103 or #105, do not close #107. Leave these as they are; do not merge them:

- #103 durable `/goal` records · #105 signed intake and session-minted approvals · #106 agent cards · #107 business pages asleep (would hide second-brain pages now on main; rewrite before any use) · #108, #110, #111 Codex box runner (default off) · #112 site QA.

Other open PRs exist (`gh pr list`); do not triage or close them unless Osman asks.

## Next action

Core phase: create `docs/os/knowledge/` and `ACTIVITY.md`, make OS Memory read from that git tree (KV only as a cache with its git sha), propose knowledge edits as draft PRs, and add the activity Action (opens a draft PR, never writes to `main`).

## Waiting on Osman

- **Box sources.** The knowledge folders and the 24 starter skills are sourced from `/workspace/...` and `/home/box/agent-data/workflows/...` on Drake's box. A cloud session cannot reach those paths. Run phases 1 and 2 on the box, or copy those files into a reachable place.
- **Activity Action write access.** It opens a draft PR per merge until Osman allows a bot commit of `ACTIVITY.md` to `main`.
- Anything on the build prompt's "Stop and ask" list: merges, deploys, DNS, Vercel or GitHub env and secrets (`OS_RUNNER_ENABLED`, `OS_BUILDER_MONTHLY_CAP_USD`, `OS_INTAKE_TOKEN`), paid calls, Opus, never-load skills, `reviewed: true`.
