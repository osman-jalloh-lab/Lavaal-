---
name: skill-author
description: >-
  When creating or editing a LAVAALL-owned skill (SKILL recipe via
  update_state), or when a reusable multi-step ops pattern should be saved for
  bots to reuse.
---
# Skill Author (LAVAALL)

Write LAVAALL-owned skills that bots can reuse. Prefer progressive disclosure, checkable completion criteria, and sharp WHEN descriptions.

**Attribution:** Writing patterns adapted from Matt Pocock’s `writing-for-agents` / skills kit (MIT License, Copyright 2026 Matt Pocock). LAVAALL owns the adapted recipes; do **not** install the mattpocock/skills plugin into the live library.

## What a skill is
- YAML-style fields: **name**, **description** (WHEN to use — required), **body** (generic reusable steps).
- Persist with `update_state` target `skill` action `write`. Ids are kebab-case slugs from the name.
- Keep assistant-specific IDs (which Slack channel, which sheet fileId, whose inbox) **out** of the recipe; put those in routines or live context.

## Doctrine
1. **Description = pointer** — say WHEN it applies; front-load the trigger; one branch per distinct case.
2. **Progressive disclosure** — thin steps in the body; push long reference behind pointers to companion docs under discovery/OS notes when needed.
3. **Completion criteria** — every phase ends when a checkable bound is met (done vs not-done).
4. **Permission levels** — declare floor and side-effect level; call permission-gate mentally for ≥ L2; never teach self-elevation.
5. **No secrets** — no API keys, tokens, passwords, or private PII in skill bodies.
6. **Positive instructions** — state what to do; use prohibitions only as hard guardrails paired with the positive target.
7. **Generic business facts OK** — quote-first West Africa sourcing; markets SL→GN/GW/LR; channels Gmail/WhatsApp/Messenger; payments after quote — without binding to one bot identity.

## Steps to author
1. Confirm the pattern is multi-step and reusable (not a one-off).
2. Draft name (human), description (WHEN), body (steps + completion criteria + permission notes).
3. Strip secrets and assistant-specific IDs.
4. Write via `update_state` (target skill, action write); note returned slug/id.
5. **Skill must beat a no-skill run** (method borrowed as text from Gjusev/skill-issue, MIT; nothing installed). Before a new or borrowed skill goes on a desk:
   1. Frame one real, bounded task with an observable pass/fail check the agent cannot fake (exact file content, a script that exits 0, a test that passes). Subjective checks ("better copy") are not allowed; agree a checkable one first.
   2. Freeze the starting files and keep the checker outside the agent's workspace; hash it before and after. A changed checker, different starting files, or a different model/prompt/limits between runs = invalid comparison, proves nothing.
   3. Run the same prompt twice under identical settings: **baseline (no skill)** and **with skill**. The only difference is the skill being available.
   4. Record three facts separately: skill installed, skill observed read, task passed (by the checker, never the agent's own opinion). Missing token/cost numbers = "not measured", never 0 or an estimate. A harness/provider error is not a task failure.
   5. Verdict: keep the skill only if the with-skill run passes where baseline fails, or passes with clearly less time/tokens. If baseline already passes equally, the skill does not earn its context: park it. One repetition is descriptive only; never call a skill "better" from fewer than ~3 runs per side.
   6. **Cost gate:** dry or offline checks (spec/fixture validation, simulated runs) are free and need no approval. A live paid run costs about **$0.20 per side** (≈$0.40 per baseline+skill pair; Skill Issue README sample, Sonnet-class) and **each paid run needs Osman's OK with the cost stated first**. Never default to Opus; no paid Claude/Anthropic/Codex call without that OK.
   7. File the result (task, checker, both outcomes, cost or "not measured", verdict) with the registry entry, then the Jev line.
6. Add or update the Skill Registry entry (id, purpose, permission floor, status, beat-baseline result or "not tested - <reason>").

## Completion criteria
- [ ] Description states WHEN clearly
- [ ] Body is generic, has steps + completion criteria + permission floor
- [ ] No secrets / no assistant-specific IDs
- [ ] Beat-baseline test done (or marked "not tested - <reason>"); any paid run had Osman's OK with cost first
- [ ] Saved via update_state and registry updated
