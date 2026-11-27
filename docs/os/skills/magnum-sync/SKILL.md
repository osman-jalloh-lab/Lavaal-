---
name: magnum-sync
description: >-
  When MAGNUM, lavaall.com, and LAVAALL OS may disagree (catalog, markets,
  marketplace vs sourcing, claims, booking flows) — diff the three and report
  MATCH/DRIFT/CONFLICT with recommended fixes.
---
# Magnum Sync (LAVAALL)

Diff **MAGNUM.md** (repo product/architecture bible) vs **live lavaall.com** vs **LAVAALL OS** wording — catch drift before it confuses bots or customers.

## Compare axes
1. **Business model language** — OS + founder: quote-first supplier/sourcing; MAGNUM may still say “sourcing marketplace” (CONFLICT) 
2. **Catalog / product categories** — what’s listed vs what’s claimed
3. **Markets & languages** — SL / GN / GW / LR; EN / FR / Krio coverage
4. **Claims** — 200+ clients, 500+ projects, Since 2018 — only if still founder-verified
5. **Flows** — inquiry, quote, schedule/booking paths described vs live routes (e.g. `/schedule` health)
6. **Agent rules** — MAGNUM/AGENTS.md instructions vs current bot skills / permission charter

## Output
| Area | MAGNUM | Live site | OS | Status |
|------|--------|-----------|-----|--------|
| … | … | … | … | MATCH / DRIFT / CONFLICT / UNKNOWN |

Then: recommended fixes (copy PR, OS glossary update, or founder decision). Prefer [brand-check](sand-workflow:brand-check) for public copy and [decision-log](sand-workflow:decision-log) when founder picks a wording.

## Permission
- L0–L1 read/diff/report
- L2 OS doc updates when aligning confirmed policy
- Site copy/deploy changes need normal Technical + L3 gates

## Completion criteria
- [ ] Table of comparisons produced
- [ ] CONFLICT items called out (especially marketplace vs sourcing)
- [ ] Next actions named (skill + owner)
- [ ] No silent prod edits
