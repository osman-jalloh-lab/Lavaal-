# Pick up here

Read this first. It points into the one shared memory; it is not a second memory. Every builder (Drake, Claude, Codex, the OS itself) reads this on start, then the files below, and changes them only through a draft PR.

Updated 27 Nov 2026 (America/Chicago), Core phase of `2026-11-26-os-one-shot-build-prompt.md` (draft PR on `feature/os-shared-memory-core`, stacked on Phase 0's #129).

## Read next, in order

1. `docs/os/knowledge/README.md` — how the shared memory works. Business folders arrive in Phase 1.
2. `docs/os/DECISIONS.md` — the decisions log. Extend it; never fork a second log.
3. `docs/os/knowledge/ACTIVITY.md` — what landed (sha, PR, time).
4. `tools/lavaall-ai/RULES.md` — standing rules (Sonnet only, never Opus; no deploy, merge, send, post or spend without Osman).

`docs/os/HANDOFF-AGENTIC-OS.md` and `HANDOFF.md` are older handoffs; treat them as history, not the source of truth.

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

## Core phase (draft, not merged)

- `docs/os/knowledge/` is the one tree. `scripts/build-knowledge-pack.js` compiles it to `api/os/_data/knowledge.json` (with a content hash); run it after any edit there, and `--check` fails if the pack is stale. The test `tests/test-os-knowledge.js` fails too.
- `api/ops/_os_knowledge.js`: `GET /ops/os/knowledge` (founder only). KV holds only a cache keyed to the git hash; a newer git hash wins and a KV-only fact is never served.
- Memory page: a "Shared memory" card reads the pack; each saved note has "Propose to shared memory", which opens GitHub's new-file page so the note becomes a pull request. Nothing writes to git from the OS.
- Chat: `composePrompt` adds `docs/os/knowledge/<group>/README.md` as a reference brief when a business folder has one.
- `.github/workflows/os-activity-log.yml` + `scripts/os-activity-line.js`: after a merge on `main`, one line in `ACTIVITY.md` on a new branch and a draft PR. Commits that only touch the log or the pack are skipped.

## Next action

Phase 1: business knowledge folders (`lavaall/`, `salonehire/`, `web/`, the private fourth line, and `saloneworks/` if sourced), each with `README.md` and `SOURCES.md`. Blocked on box sources (below).

## Waiting on Osman

- **Box sources.** The knowledge folders and the 24 starter skills are sourced from `/workspace/...` and `/home/box/agent-data/workflows/...` on Drake's box. A cloud session cannot reach those paths. Run phases 1 and 2 on the box, or copy those files into a reachable place.
- **Activity Action write access.** It opens a draft PR per merge until Osman allows a bot commit of `ACTIVITY.md` to `main`.
- Anything on the build prompt's "Stop and ask" list: merges, deploys, DNS, Vercel or GitHub env and secrets (`OS_RUNNER_ENABLED`, `OS_BUILDER_MONTHLY_CAP_USD`, `OS_INTAKE_TOKEN`), paid calls, Opus, never-load skills, `reviewed: true`.
