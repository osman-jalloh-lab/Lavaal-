---
name: code-review
description: >-
  When reviewing a LAVAALL website or repo change before it is considered
  finished — run separate Spec and Quality reviews (security, a11y, locales,
  tests, secrets, sourcing wording); do not merge axes into one score.
---
# Code Review (LAVAALL)

Before important website or repo changes are finished, run **two reviews** (keep them separate — never merge into one mushy score):

1. **SPEC REVIEW** — Did we build what was requested (feature-spec / tickets / PR description)?
2. **QUALITY REVIEW** — Is it safe, maintainable, and consistent with `Lavaal-` + LAVAALL OS?

**Inspiration:** Matt Pocock `code-review` (MIT) — adapted; lighter smell checklist; LAVAALL-specific checks.

## Pin the change
Compare against a fixed point (`main`, merge-base, PR base). Empty or invalid diffs fail here.

## Always inspect
- Security (no secrets in client, safe redirects)
- Deeper security pass: use [security-sweep-checklist](sand-workflow:security-sweep-checklist)
- Accessibility basics (labels, focus, contrast where obvious)
- Error handling and empty states
- Responsiveness / mobile
- Localization (EN/FR/Krio) — no broken locale paths
- Performance smell (huge images, blocking scripts) when visible
- Tests present or noted why not
- Config / env — no hardcoded secrets
- Business wording: supplier/sourcing, not marketplace checkout; no unauthorized Starlink reseller claim

## Steps
1. Identify fixed point + spec source (LAVAALL-OS `specs/`, PR body, tickets).
2. Produce SPEC findings: missing, partial, wrong, or scope creep (quote the spec).
3. Produce QUALITY findings: hard issues vs judgment calls.
4. Verdict: **Ready** / **Ready with notes** / **Block** — Block if secrets, broken booking/inquiry, or L3 deploy risk unaddressed.
5. Do not merge/deploy from this skill alone; founder/Level gates still apply.

## Permission
- L1 review
- Merge/deploy = separate L3+ approval

## Completion criteria
- [ ] Spec axis and quality axis both reported
- [ ] Fixed point named
- [ ] Verdict stated
- [ ] Secrets/redaction checked
- [ ] No deploy performed here

## Reference: Trail of Bits review items (Scout, 13 Oct reels)
- Risk-first differential review: review auth, secrets, payments and external calls first; size depth to the change; state blast radius, coverage and confidence.
- Check insecure defaults and sharp edges (empty/null/negative inputs, swappable params) in changed code.
- Optional second model review (Trail of Bits second-opinion) makes paid Codex calls: only with Osman's OK on the cost first. Do not install or run cloned code.
Credit: checklist items adapted from Trail of Bits Skills (github.com/trailofbits/skills), CC-BY-SA-4.0; this section is shared under the same licence.
