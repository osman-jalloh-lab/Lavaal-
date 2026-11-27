---
name: tdd
description: >-
  When building or fixing LAVAALL site/repo behavior test-first — run red
  (failing behavior check) → green (smallest fix) → leave refactor for
  code-review; test business behavior at agreed seams.
---
# TDD (LAVAALL)

For suitable engineering work on `Lavaal-` / site logic: **RED → GREEN → (refactor later in review)**.

**Inspiration:** Matt Pocock `tdd` (MIT) — adapted. Prefer testing **business behavior** over internal implementation details.

## Loop
1. **RED** — write one failing test (or curl/script assertion) that captures the desired behavior or bug symptom
2. **GREEN** — smallest change that makes it pass
3. Repeat one vertical slice at a time
4. **Refactor** belongs with [code-review](sand-workflow:code-review), not mid-red-green speculation

## Rules
- Confirm **seams** (public boundaries) before writing a pile of tests
- Use glossary terms (`Inquiry`, `Booking`, quote-first) in test names when relevant
- Anti-patterns: tautological tests, mocking internals, writing all tests then all code
- Prefer independent expected values (spec, known fixture), not recomputing the implementation

## When to skip / lighten
- Pure copy/CSS with no behavior — use brand-check / website-qa
- Exploratory diagnose — use diagnose-bug first, then add a regression test once cause is known

## Permission
- L1–L2 write tests and local fixes
- Production deploy still L3+

## Completion criteria
- [ ] Seams named
- [ ] At least one red→green cycle shown (or justified skip)
- [ ] Behavior-focused assertions
- [ ] No speculative generality “for later”
