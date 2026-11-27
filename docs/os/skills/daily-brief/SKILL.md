---
name: daily-brief
description: >-
  When designing or running a LAVAALL CEO brief from connected sources —
  summarize requests, suppliers, site, blockers with no invented metrics; do not
  activate recurring cadence without founder.
---
# Daily Brief

CEO pulse from **connected sources only**. No invented metrics, revenues, or counts.

## Brief sections
1. **Inbound** — new/urgent Customer Requests or messages (facts only)
2. **Quotes / pipeline** — outlines waiting, clarifiers blocked
3. **Suppliers** — evaluations or drafts waiting on L3 send
4. **Site / technical** — open QA bugs, deploy waits
5. **Blockers** — founder decisions needed (money, contracts, send, deploy, ads)
6. **Recommended next** — one skill chain + bot

## Steps
1. permission-gate: brief compile = L1; sending the brief externally = L3; **creating a recurring routine/cadence = founder approval required**.
2. Pull only from connected tools and known OS/discovery docs; if a source is missing, say UNKNOWN — do not guess numbers.
3. Write plain short bullets under each section.
4. End with blockers and a single recommended next action.
5. If asked to “run this every morning,” design the cadence prompt but **do not** save/activate a routine until founder approves.
6. Follow `ops-rules/procedures/overnight-morning-brief.md` when this is the weekday morning brief.

## Same-run facts (Osman OK 20 Nov 8:57 AM CT)
- **Live status.** Every live status claim (env flags such as `CHAT_ENABLED`, PR merged/draft, deploy, routine on/off) must cite a check made in this same run, or be printed as `not re-checked since <date>`. Do not copy hot.md or yesterday's brief as proof.
- **Usage line.** Read usage in this run (CheckSubscriptionUsage or usage-review): usage %, reset time, bot-to-bot share versus last week. Name any FYI-only desk-to-desk ping as a breach of the 20 Nov 8:44 AM CT rule (batch updates, skip FYI pings). If usage cannot be read: `UNKNOWN: usage not re-checked`.
- **Stale files.** If `hot.md` or the vault Decision Log is older than the last midnight close-out, say `stale since <mtime CT>` at the top of the brief.
- **Jev.** Read status only from `P/decisions/jev-scores.log` (quote the latest line). Do not infer "Jev status unclear."

## Routine health in the brief (since 30 Oct 2026; tightened 20 Nov 2026)
Use `P/ops-rules/routine-check.py` output as it stands, with the exceptions below; do not re-judge double fires by hand.
- **Double fires are OK.** If a routine started twice and the extra run was skipped, it counts as one OK run, not FAILED, PARTIAL or "hygiene". Do not list it.
- **Collapse an outage.** If the ledger has a gap (no lines for a day, or many MISSING/FAILED from the same window), write one line: window, routines hit, which catch-ups still matter. Do not list every slot.
- **Same-day OK rerun.** If a routine later ended `ok` or `partial` the same day, do not list an earlier STARTED_NO_END or MISSING for that slug as a live miss, even if the script still prints it.
- **Inbox blocked.** If `support-ranked-inbox-push` has a same-day `skipped "blocked, no save path"` line, mention it once. Do not list later quiet slots that day as FAILED or MISSING.
- **Held bridge items:** an empty or missing `P/ops-rules/bridge-holds.log` means **0 holds**. Say nothing, write no UNKNOWN line, and do not mark the brief partial for it.
- **Covered routines** include `support-ranked-inbox-push` and `sl-daily-leads` (weekdays 7:00 AM CT). Read the live cadence from `routine-schedule.json`; do not assume the old every-30-minutes window (a 20 Nov 8:44 AM CT trim approved hourly daytime / no overnight runs; apply only once that schedule is actually changed). `sl-daily-leads` shows one NOT_WIRED line until its prompt writes start/end ledger lines. That is expected, not a blocker.
- **Jev scores** are labelled `method=jev-v3` from 30 Oct onward (older rows keep `jev-v2`). Both labels are real scores, so count both.

## Completion criteria
- [ ] Every metric/fact sourced or marked UNKNOWN
- [ ] Every live status claim cites a same-run check or says "not re-checked"
- [ ] Usage line present or marked UNKNOWN
- [ ] Blockers list is actionable for founder
- [ ] No cadence/routine activated without founder
- [ ] No external sends from this skill alone
- [ ] Skipped double fires, a collapsed outage, an inbox blocked-once line, and an empty/missing holds file did not turn the brief partial
