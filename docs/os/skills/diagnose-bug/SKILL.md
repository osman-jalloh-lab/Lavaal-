---
name: diagnose-bug
description: >-
  When something on lavaall.com, booking/Apps Script, Sheet routing, or related
  systems is broken or flaky — run reproduce → minimize → hypothesize →
  instrument → fix → verify → regression → document; never shotgun production.
---
# Diagnose Bug (LAVAALL)

Disciplined debugging for lavaall.com, Apps Script, Sheet routers, and related systems. Never randomly change several production parts hoping the bug disappears.

**Inspiration:** Matt Pocock `diagnosing-bugs` (MIT) — adapted. Keep redaction mandatory.

## Sequence (do not skip without stating why)
1. **REPRODUCE** — confirm the user’s exact symptom
2. **MINIMIZE** — smallest scenario that still fails
3. **HYPOTHESIZE** — 3–5 ranked, falsifiable hypotheses (show list)
4. **INSTRUMENT** — add minimal signal; redact secrets (`<REDACTED>`)
5. **FIX** — smallest change that addresses the confirmed cause
6. **VERIFY** — repro loop goes green on the original symptom
7. **REGRESSION TEST** — leave a durable check (test, curl, QA note)
8. **DOCUMENT** — short note in OS/discovery or PR; update decision-log if policy changed

## Feedback loop first
Before deep theory, build a **tight red-capable loop** (curl, script, browser check, failing test). Prefer one command you have already run. If you cannot build a loop, stop, list attempts, and ask for access or a redacted artifact.

## LAVAALL focus areas
- Public site routes (including known fragile `/schedule`)
- Inquiry / booking APIs and Apps Script
- Customer Requests Sheet routing
- Meta/SEO and localization quirks
- Vercel deploy behavior (MCP may be blind — verify via live URL)

## Permission
- L0–L1 diagnose and draft fix
- Production deploy / secret changes = L3–L4 — stop for founder
- Redact tokens, cookies, auth headers always

## Completion criteria
- [ ] Symptom reproduced and minimized
- [ ] Hypotheses listed before shotgun fixes
- [ ] Fix verified against original symptom
- [ ] Regression check noted
- [ ] Secrets redacted
- [ ] No drive-by production edits
