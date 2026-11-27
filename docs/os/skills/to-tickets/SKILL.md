---
name: to-tickets
description: >-
  When an approved LAVAALL feature spec or plan must become executable work —
  split it into small vertical tickets with blockers, acceptance criteria, risk,
  and required skill; prefer local OS markdown first.
---
# To Tickets (LAVAALL)

Break an approved plan or feature spec into small **tracer-bullet** tickets — vertical slices of working behavior, not giant horizontal layers.

**Inspiration:** Matt Pocock `to-tickets` (MIT) — adapted. **Default tracker:** local markdown under LAVAALL-OS / discovery (e.g. `specs/<slug>/tickets/`). Use GitHub Issues only for `Lavaal-` code work when that is the agreed surface.

## Each ticket must include
- **objective** — end-to-end behavior delivered
- **dependency / blocked by** — other ticket ids or “none”
- **expected result** — how to demo/verify
- **acceptance criteria** — checkboxes
- **relevant files/systems** — high level (site route, Sheet, Apps Script, Vercel)
- **risk** — permission level, customer impact
- **required skill** — e.g. diagnose-bug, website-qa, brand-check

## Steps
1. Read the approved spec or plan (path/URL in the ask).
2. Draft vertical slices sized for one focused session each; prefacing refactors first if needed.
3. Show the founder/Technical a numbered breakdown (title, blocked-by, delivers) and adjust once if asked.
4. Publish one file per ticket in dependency order (`01-…`, `02-…`) under the local tickets folder — **not** one mega-file.
5. Work the frontier: tickets with no open blockers.
6. Do not invent scope beyond the spec; park unknowns as a research or grill ticket.

## Permission
- L2 write local ticket markdown
- Opening GitHub Issues on `Lavaal-` is fine for engineering tracking; merges/deploys still need Level 3+ / founder when required
- Never treat ticket creation as deploy authorization

## Completion criteria
- [ ] Tickets are vertical and demoable
- [ ] Each has objective, blockers, acceptance criteria, risk, required skill
- [ ] Published to local OS path (or GitHub if that was the ask)
- [ ] Frontier identified
- [ ] No secrets in tickets

## Reference: Taskmaster pattern (Scout, 13 Oct reels)
- From a PRD/spec, generate tasks each with id, title, dependencies, priority, details and a test strategy; score complexity and split any high-complexity task into subtasks; always pick the next task whose dependencies are done.
- Source idea: eyaltoledano/claude-task-master; reference only, nothing installed, no paid model calls.
