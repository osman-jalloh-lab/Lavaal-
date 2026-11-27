---
name: business-handoff
description: >-
  When switching bots, ending a discovery session, or passing work between
  LAVAALL agents — write a structured handoff with
  TASK/OBJECTIVE/COMPLETED/FINDINGS/DECISIONS/ARTIFACTS/OPEN/RISKS/NEXT/APPROVAL;
  redact secrets.
---
# Business Handoff

Compact continuity for five-bot LAVAALL ops. Prefer pointers to artifacts over pasting secrets or huge dumps.

**Inspiration:** Matt Pocock handoff (MIT) — adapted structure and LAVAALL permission fields.

## Output sections (use these headings)
1. **TASK** — what this thread was
2. **OBJECTIVE** — success looks like
3. **COMPLETED** — done items
4. **FINDINGS** — facts learned (cite sources)
5. **DECISIONS** — founder/bot decisions already made
6. **ARTIFACTS** — paths/URLs only (discovery docs, drafts, PRs)
7. **OPEN** — unresolved questions
8. **RISKS** — permission, legal, customer, site
9. **NEXT** — single recommended next skill + bot
10. **APPROVAL** — what still needs founder (L3–L4)

## Steps
1. Fill every section; use “none” rather than omitting.
2. Redact API keys, passwords, tokens, and unnecessary PII (`<REDACTED>`).
3. Do not duplicate full specs — link them.
4. Save under discovery/OS notes or temp as appropriate; L2 for internal OS writes.
5. Name suggested skills for the next agent (e.g. inquiry-triage, website-qa).

## Completion criteria
- [ ] All ten sections present
- [ ] Secrets/PII redacted
- [ ] NEXT names bot + skill
- [ ] APPROVAL lists any L3–L4 waits
