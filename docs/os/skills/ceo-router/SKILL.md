---
name: ceo-router
description: >-
  When a task is unclear, crosses desks, or needs routing to the right LAVAALL
  bot and skill chain; also when a task seems to need a new tool or skill (check
  existing first).
---
# CEO Router

This is the front door for LAVAALL work. Classify the task, choose a skill chain, and assign the primary bot. Run permission-gate first for anything with side effects.

## Bot owners
- **CEO**: strategy, routing, grilling, briefs, decisions, OS
- **Sales**: inquiries, suppliers, quotes, CRM triage
- **Lifecycle**: email journeys (draft-only until approved)
- **Growth**: brand, social drafts (publishing is gated)
- **Technical**: site, repo, deliverability, diagnosis
- **CFO / Decision Council**: reviews decisions and problems before they reach the founder

## Routing table (through wave 2b)
| Task type | Skill chain | Bot |
|-----------|-------------|-----|
| Unclear / what next | ceo-router → grill-founder or assign | CEO |
| Founder plan sharpen | grill-founder | CEO |
| Founder decision made | decision-log | CEO |
| Term conflict / new concept | domain-glossary | CEO |
| External facts / APIs | research-primary | CEO / Sales / Technical |
| Import / reseller / payment legality | regulatory-research → founder brief | CEO |
| Confusing message/doc | plain-rephrase | Any |
| Bot/session switch | business-handoff | Any |
| Inbound lead / Sheet row | inquiry-triage → quote-pack | Sales |
| Sheet messy / QA noise | crm-sheet-hygiene | Sales |
| Vet suppliers | research-primary → supplier-evaluation | Sales |
| First supplier contact | supplier-outreach (**stop before send**) | Sales |
| Customer quote | quote-pack | Sales |
| Customer-facing copy check | brand-check | Growth / CEO |
| MAGNUM vs site vs OS drift | magnum-sync | Technical / CEO |
| Major new feature | feature-spec → (founder) → to-tickets → tdd → code-review | Technical / CEO |
| Site / booking bug | diagnose-bug → tdd → code-review → website-qa | Technical |
| Pre-merge review | code-review | Technical |
| Behavior build test-first | tdd | Technical |
| Site QA pass | website-qa | Technical |
| Morning pulse | daily-brief | CEO |
| Need a tool/skill we may not have | Check existing first (below) | CEO → Technical |
| New skill needed | skill-author | CEO/Technical |
| Any outbound/deploy/spend | permission-gate first | Shared |
| Decision to make / problem or blocker | Decision Council (CFO) review → Jev line → founder | CEO → CFO |

## Steps
0. **Check existing first.** Before reaching for anything new, check the skills we already have, our connected connectors and installable plugins. Use what fits.
1. Restate the ask in one plain sentence.
2. Pick the task type from the table, or the nearest match.
3. Name the skill chain and primary bot, and note the permission level and any L3–L4 stops.
4. Hand off with business-handoff if another bot owns the work.
5. Don't start L3–L4 side effects from the router alone.
6. **Decisions and problems go to the Decision Council (founder rule, 8 Nov 2026).** Whenever the CEO has a decision to make or hits a problem, consult the CFO / Decision Council first, then bring the founder the call with the council's view and a Jev line. The council's view is advice. It is never the founder's approval.
7. **Batch updates, no FYI pings (Osman, 20 Nov 8:44 AM CT).** Cut bot-to-bot and desk-to-desk FYI-only pings. Batch status updates. An FYI-only ping is a breach of that rule. When Osman approves something, write the `decisions/log.md` row in the same turn (decision-log skill); do not wait for close-out.

## Check existing first: new skill process (founder-approved 28 Oct 2026)
1. Check our own skills library, connectors and plugins.
2. Only if nothing fits, search skills.sh or find-skills (vercel-labs/skills) read-only, as a reference. Shortlist at most 3.
3. Technical & QA vets each one: SKILL.md and every script, source repo, licence, maintainer, install count and last update. Look for network calls or attempts to override instructions, like the AGENTS.md attack.
4. The founder OKs each specific skill (L3).
5. Copy it into our library as a reviewed snapshot pinned to a commit. Never auto-install, and never run `npx skills add` live without review.
No sign-ups, paid tools or spend.

## Completion criteria
- [ ] Existing skills and connectors checked
- [ ] Ask classified
- [ ] Skill chain and bot named
- [ ] Permission and founder stops called out
- [ ] Next action is a single clear hop
- [ ] No FYI-only desk ping; founder approvals logged the same turn

## Reference: role-review pass (Scout, 13 Oct reels)
- Before a plan or L3/L4 ask reaches Osman, run short role reviews in turn (gstack pattern, MIT). CEO review: is this the right problem and scope? Engineering review: architecture, edge cases, tests. QA review: how we prove it works. Ship review: rollback, and what changes live.
- If every review agrees at once, have one argue the other side before deciding. This is reference only; nothing is installed.
