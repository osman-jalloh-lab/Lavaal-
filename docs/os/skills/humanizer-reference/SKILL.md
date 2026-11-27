---
name: humanizer-reference
description: >-
  Use this as the final de-AI pass on any LAVAALL customer-facing copy, after
  content-brief and plain-rephrase, to strip AI-sounding phrasing without
  changing meaning.
---
# Humanizer final pass (reference)

Source, read-only: `/home/box/agent-data/projects/lavaall/tools/humanizer/SKILL.md` (github.com/blader/humanizer @ 8c307f3, MIT). Read it; do not install or run anything.

## When
Last step for copy, after content-brief, then plain-rephrase, then this.

## Steps
1. Read the source file's list of AI tells and its before/after examples.
2. Scan the draft for those tells, for example: "not X but Y" framing, forced groups of three, stock words (delve, pivotal, seamless, landscape, testament), heavy dashes, bold label lines, filler openers and closers, and inflated or vague claims.
3. Rewrite only the flagged spans in plain, specific words. Keep the meaning, facts, names and numbers exactly as given.
4. Never add stats, prices, quotes or claims that aren't in the source. Never add Starlink mentions.
5. Return the cleaned copy plus a short list of what changed.

Owner: Growth, UGC & Ads. Brand-check still applies after this pass.
