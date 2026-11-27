---
name: taste-build-floor
description: >-
  Use this when a LAVAALL desk builds or reviews a web page, landing page or
  client preview site (alongside the upstream taste-skill): it adds hard
  build-floor checks, copy and layout defaults, a pre-build process and
  done-when browser checks. Brand rules win over it.
---
# Taste build floor (LAVAALL addendum to taste-skill, HM-1)

A LAVAALL addendum to the upstream taste-skill, kept in a separate file so that upstream updates never overwrite it. The upstream taste-skill is left untouched.

Ideas paraphrased from the MIT-licensed Nutlope/hallmark project (commit 8f6969f, read-only review 2026-10-29). Text only; none of its scripts, hooks, image generation or photos are used. Brand rules (MAGNUM, the Option I palette, or the client's own researched brand) win over anything here. Where upstream taste-skill says `transition: all` (its 4-7 motion dial) or mandates dark mode, this addendum and the brand rules win: name the transition properties, and follow the brand's light or dark choice.

## Permission floor
L1, text guidance only. Installing or running any outside linter, hook or image tool, or any paid generation, needs Technical review and Osman's OK on the cost first.

## Floor (hard rules; a miss is a FAIL, not a style note)
- Stop sideways scroll with `overflow-x: clip` on `html` and `body`. Never use `overflow-x: hidden` there, and never size full-bleed blocks with `100vw`.
- Image and media grid tracks use `minmax(0, 1fr)`. Display headings get `min-width: 0` and `overflow-wrap: anywhere` (or `break-word`).
- Never write `transition: all`. Never animate `width`, `height`, `top` or `left`; animate `transform` and `opacity`.
- Core content and calls to action stay readable with scripting off. Motion and scroll effects are enhancements, not gates.
- Cap the content container at 1920px. On wider screens the gutters grow; the reading measure does not.
- At 1280x800, the hero headline, its supporting sentence and the main CTA are all visible without scrolling.
- Every colour and font comes from `:root` tokens. No raw hex or font names inside components.
- Every interactive element has a visible `:focus-visible` style.
- No invented numbers, testimonials, logo walls or case counts. Placeholder content is labelled as a placeholder.

## Reflex (defaults; breaking one needs a one-line written reason in the hand-off)
- Copy budget: about 80 words per screen, hero headline 7 words or fewer, hero sentence 12 words or fewer, 6-9 sections, about 450 words on a landing page.
- Small labels are sentence case without wide letter-spacing (this tightens taste-skill's eyebrow rule without replacing its 1-per-3 cap).
- No card inside a card. No hand-drawn fake browser or OS window frames.
- No single italic word dropped into an upright heading for decoration; italic emphasis is fine only when the whole phrase carries the meaning.

## Process (before and during the build)
1. Ask once, in one message, for four things: the material (what real assets exist), the audience, the use (what the page must get done) and the tone. List each asset as real, pictured-only or absent. Do not invent the absent ones.
2. Anatomy by job: pick sections from what real sites in this category do for this visitor's job (a booking page books, a café page gets the order). Check with Refero or similar references; don't start from a default features/steps/email-signup stack.
3. Mirror test: if a neighbouring brief would get this exact mix of layout, type and palette, change at least one deliberate decision.
4. Build and review the hero first, then the rest.

## Done when
- Every Floor item passes in a real browser check at 375px, 1280x800 and above 1920px.
- Each broken Reflex has its written reason.
- The process notes (asset list, anatomy choice, mirror-test change) are in the hand-off.
- A check you did not actually run is reported as unchecked, never as passed.

## Related skills
- Severity-graded audits belong in impeccable-design-checks (HM-2), not here.
- Motion craft: emil-design-eng and motion-library. Palette and type picks: ui-ux-pro-max.
