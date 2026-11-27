---
name: domain-glossary
description: >-
  When LAVAALL agents disagree on terms, a new business concept appears, or
  CONTEXT/GLOSSARY needs sharpening — update the shared glossary from real
  operations; do not invent definitions.
---
# Domain Glossary (LAVAALL)

Keep one shared vocabulary so every bot uses the same words. Active skill: challenge fuzzy terms and write them down when they crystallize.

**Inspiration:** Matt Pocock `domain-modeling` (MIT) — adapted to a single `context/GLOSSARY.md` (founder-preferred), not multi-context maps unless later needed.

## Authority
- Canonical glossary: LAVAALL-OS `context/GLOSSARY.md`
- Supporting facts: `context/*.md`, `brand/voice-and-tone.md`, founder decisions in `decisions/log.md`
- Do **not** invent definitions. If usage is unclear, mark UNKNOWN or ask founder via [grill-founder](sand-workflow:grill-founder).

## When to run
- Two bots (or founder + bot) use the same word differently
- A new commercial object appears (e.g. Approved Supplier, Landed Cost)
- Site/MAGNUM wording conflicts with OS policy (e.g. marketplace vs sourcing)

## Steps
1. Name the contested or new term.
2. Check existing GLOSSARY + company context + live site wording.
3. Propose a precise definition grounded in how LAVAALL actually works (quote-first sourcing, Sheet CRM, etc.).
4. Tag status: CONFIRMED | LIKELY | CONFLICT | UNKNOWN.
5. Update `GLOSSARY.md` only when definition is grounded; leave UNKNOWN rather than guessing.
6. If the change is a founder policy call, also run [decision-log](sand-workflow:decision-log).

## Permission
- L2 update glossary / context docs
- No outbound, deploy, or CRM mutation from this skill

## Completion criteria
- [ ] Term named and conflict (if any) stated
- [ ] Definition grounded or marked UNKNOWN
- [ ] GLOSSARY.md updated when appropriate
- [ ] No invented business rules passed off as confirmed
