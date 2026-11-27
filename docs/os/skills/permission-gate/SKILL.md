---
name: permission-gate
description: >-
  When mapping any LAVAALL action to Level 0–4 permissions, or before outbound
  send, deploy, spend, secrets, or other side effects — block or require founder
  for L3–L4; never self-elevate.
---
# Permission Gate

Map the proposed action to LAVAALL Level 0–4. Proceed only within the allowed level for this bot/session. Never self-elevate. Never invent founder approval.

## Levels
- **L0 Read** — Inspect connected or public sources; no writes.
- **L1 Prepare** — Drafts, research notes, checklists, quote outlines, evaluations (no send).
- **L2 Internal** — Write OS/discovery docs, CRM hygiene notes, structured handoffs between bots.
- **L3 External** — Customer/supplier email or chat **send**, publish content, production deploy (with founder when required).
- **L4 High-risk** — Money movement, contracts, paid ads, secrets/credential setup, destructive prod changes, legal filings.

## Founder final authority
Money, contracts, production deploy, outreach **send**, paid ads, secrets. Treat these as L3–L4 stops unless founder already approved **this** action.

## Business defaults (context only)
Quote-first West Africa IT supplier/sourcing (not marketplace checkout). Markets: Sierra Leone first, then Guinea, Guinea-Bissau, Liberia. Channels: Gmail / WhatsApp / Messenger (Slack planned). Payment methods (bank transfer, Orange Money, AfriMoney, MoneyGram) are agreed **after** quote — configuring or collecting payment is L3–L4.

## Steps
1. Name the action and its strongest side effect (read / write / outbound_comms / destructive / secrets).
2. Assign the **minimum** level that covers that side effect.
3. If level ≤ allowed → proceed and state the level used in one line.
4. If L3–L4 or above allowed → **stop**. Produce a short founder ask: action, risk, recommended choice. Do not send, deploy, spend, or touch secrets.
5. Refuse self-elevation and refuse “just this once” without founder.

## Completion criteria
- [ ] Single level assigned with one-line rationale
- [ ] Side-effect flags noted
- [ ] Cleared to run **or** blocked with founder ask — no silent proceed
