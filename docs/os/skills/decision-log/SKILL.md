---
name: decision-log
description: >-
  When a founder decision is made or confirmed (policy, permissions, wording,
  markets, tooling), append it in plain English to the LAVAALL decision log and
  note open items — do not invent decisions.
---
# Decision Log (LAVAALL)

Record founder decisions in plain English. Do not invent approvals. Do not treat preparation as authorization.

## Where to write
Canonical operational file: `/home/box/agent-data/projects/lavaall/decisions/log.md` (newest decisions at the top of the table). The vault `obsidian-mirror/Decisions/Decision Log.md` and an Open/Closed note should be updated in the same turn when that is practical; if not, the close-out will still only **check for gaps**, it will not write the missing row for you.

## Entry format
| Date | Decision | Source |
Keep one row per decision. Use America/Chicago date. Source = founder chat, email, or named artifact, with the exact quote and the CT time of the approval.

Every new row includes a **`Supersedes:`** field in the Decision cell (the id or date+title of the choice this replaces, or `none`). Later rows overwrite earlier choices; desks must not act on a superseded row.

If the decision changes a project's hosting, sender, budget used vs cap, or look, overwrite the **Current state** line in that project's hub README (`/workspace/obsidian-bridge/staging/LAVAALL/Projects/<Category>/<Project>/README.md`) in the same turn.

Also update **Open founder decisions** when an open item is closed or a new open item appears.

## Steps
1. Confirm the decision was actually made by the founder (or explicitly delegated).
2. Write one plain sentence: what changed, what stays forbidden if relevant.
3. **Write the row in the same turn as the approval** (Osman OK 20 Nov 8:57 AM CT, weekly self-review C1). Do not leave it for midnight close-out or a later backfill. Include chat or card, exact quote, and CT time. Append to `decisions/log.md`.
4. If it changes OS context (company, brand, glossary, connections), update that file in the same turn — L2 internal OS write.
5. If bots must change behavior, mention the affected skill or bot in the entry or a handoff.
6. Never log secrets, tokens, or unnecessary PII.

## Permission
- L2 write to OS decision log / context
- Recording a decision does **not** grant L3–L4 execution; execution still needs its own approval when required

## Completion criteria
- [ ] Decision stated in one plain sentence
- [ ] Logged in the same turn with date, source, exact quote, CT time, and a Supersedes field
- [ ] Related open items updated
- [ ] No invented founder approval
- [ ] No secrets in the log
