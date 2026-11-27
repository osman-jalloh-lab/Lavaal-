---
name: inquiry-triage
description: >-
  When new Customer Requests rows, Gmail/WhatsApp/Messenger inbound, or social
  DMs need triage — classify state, owner, and next action; never auto-send
  customer email (L3).
---
# Inquiry Triage

Triage inbound demand for a quote-first West Africa IT sourcing business. Authoritative CRM is the Customer Requests sheet (use connected sources; do not create a parallel CRM).

## States (use plain labels)
- New / needs classify
- Quote path → clarifiers or quote-pack
- Scheduling / support / spam-QA noise
- Waiting on founder or supplier
- Closed / duplicate

## Channel notes
Gmail, WhatsApp, Messenger are live channels; Slack planned. Social DMs that are quote intent route to Sales — log to Customer Requests with source noted when writing is allowed (L2).

## Steps
1. Run permission-gate: read/classify = L0–L1; Sheet field updates = L2; **any customer email/WhatsApp send = L3 stop**.
2. Read the inbound item and existing Sheet context; separate QA/test noise from real leads.
3. Classify: intent (quote, support, schedule, spam), market if known (SL/GN/GW/LR), urgency.
4. Assign owner bot (usually Sales) and next skill (quote-pack, supplier-evaluation, plain-rephrase, handoff).
5. Draft internal next-action notes only. **Do not** auto-reply to the customer.
6. If reply needed: prepare draft at L1 and stop for founder/Sales send approval (L3).

## Completion criteria
- [ ] Item classified with state + owner + next action
- [ ] Noise vs real lead called out
- [ ] No customer-facing send performed
- [ ] L3 send flagged if a reply is recommended
