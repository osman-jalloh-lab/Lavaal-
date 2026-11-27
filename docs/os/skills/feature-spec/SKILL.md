---
name: feature-spec
description: >-
  When LAVAALL needs a major website or internal feature built — write a
  complete feature spec (problem, stories, rules, security, tests, out of scope,
  approvals) before implementation.
---
# Feature Spec (LAVAALL)

Produce a written specification before major website or internal feature work. Do **not** start major implementation until the spec is sufficiently defined and founder-approved when required.

**Inspiration:** Matt Pocock `to-spec` (MIT) — adapted for LAVAALL OS markdown first (not GitHub Issues by default). Use glossary terms from `context/GLOSSARY.md`.

## When
Major site features, booking/CRM changes, new integrations, payment-related UX, multi-session builds. Skip for tiny one-line copy fixes (use brand-check / website-qa instead).

## Spec sections (required headings)
1. **PROBLEM** — user/business problem
2. **SOLUTION** — proposed outcome in plain language
3. **USER STORIES** — numbered; “As a … I want … so that …”
4. **BUSINESS RULES** — quote-first sourcing, markets, permissions, claims
5. **IMPLEMENTATION DECISIONS** — modules/APIs/schemas (no fragile file-path lists unless essential)
6. **DATA REQUIREMENTS** — fields, Sheet columns, PII handling
7. **INTEGRATIONS** — Gmail, Calendar, Sheet, Vercel, WhatsApp, etc.
8. **SECURITY CONSIDERATIONS** — secrets, auth, Level 0–4 side effects
9. **TESTING REQUIREMENTS** — behavior to verify (prefer external behavior)
10. **FAILURE CASES** — what breaks and how we handle it
11. **OUT OF SCOPE**
12. **APPROVAL REQUIREMENTS** — what needs founder before build/deploy/send

## Steps
1. Pull context from conversation, glossary, and relevant OS/repo docs. Prefer synthesis over re-interviewing; use [grill-founder](sand-workflow:grill-founder) only for unresolved founder decisions.
2. Draft the full spec under LAVAALL-OS or discovery notes (e.g. `specs/<slug>.md`).
3. Flag UNKNOWN items explicitly — do not invent prices, legal positions, or entity names.
4. Stop for founder approval when the feature is L3+ (production behavior, payments, outbound, new markets).
5. After approval, hand to [to-tickets](sand-workflow:to-tickets).

## Permission
- L1–L2 write specs / OS docs
- Implementation and production deploy remain separate gated steps

## Completion criteria
- [ ] All twelve sections present (use “none” / UNKNOWN where needed)
- [ ] Glossary-aligned wording (supplier/sourcing, not marketplace checkout)
- [ ] Spec path reported
- [ ] APPROVAL REQUIREMENTS clear
- [ ] No secrets in the spec

## Reference: Spec Kit pattern (Scout, 13 Oct reels)
- Spec first, then plan, then tasks: write what and why (users, outcomes, acceptance criteria) with no tech choices; then a separate technical plan; then break into tasks; implement only after the spec is agreed.
- Mark open questions as [NEEDS CLARIFICATION] instead of guessing. Source idea: github/spec-kit (MIT); reference only, nothing installed.
