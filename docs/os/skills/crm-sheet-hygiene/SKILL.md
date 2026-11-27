---
name: crm-sheet-hygiene
description: >-
  When the LAVAALL Customer Requests Sheet needs cleanup or QA — classify real
  inquiries vs noise, note missing fields, propose norms; never auto-email
  customers or invent leads.
---
# CRM Sheet Hygiene (LAVAALL)

Keep the Customer Requests Sheet usable: separate real demand from QA noise, normalize fields, and never auto-email customers from cleanup.

## Scope
Google Sheet CRM **LAVAALL Customer Requests** (and related booking/contact tabs when accessible). If Drive is disconnected, document the blocker and stop — do not invent row contents.

## Steps
1. Confirm Sheet access (Drive connector). If blocked, report and hand off.
2. Classify recent rows: **Real inquiry** | **Booking** | **QA/test** | **Spam/noise** | **Unknown**.
3. Note missing critical fields (name, contact, market, product ask) without fabricating them.
4. Propose field norms (what each column means) aligned with `context/GLOSSARY.md`.
5. Produce a short hygiene report: counts by class, top gaps, recommended owner actions.
6. Optional L2: annotate internal notes / OS hygiene log — **no customer-facing sends**.

## Hard rules
- No auto-replies, no bulk deletes without founder
- Do not invent leads or prices
- PII: minimize copying into chat; redact when handing off

## Permission
- L1 read + report
- L2 internal annotations when Sheet writable and appropriate
- L3 outbound from Sheet tooling — founder required
- Destructive cleanup (mass delete) — L4 / founder

## Completion criteria
- [ ] Access status clear
- [ ] Rows classified or sample method stated
- [ ] Gaps listed without invented data
- [ ] No customer sends
- [ ] Report path or summary delivered
