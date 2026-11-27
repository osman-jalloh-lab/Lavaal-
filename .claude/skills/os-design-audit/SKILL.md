---
name: os-design-audit
description: Audit a LAVAALL page (the /os OS, the website, SaloneHire) against 20 web design rules with five read-only reviewers, then fix from one approved list. Use when asked to review, polish, QA or "make it look pro".
---

# OS design audit (20 rules, five jobs)

Adapted from the Claude Design Blueprint, hack 10 (source: github.com/ItsssssJack/power-design, principles/web-principles.md). Brand file: `docs/design/DESIGN.md`.

## How to run it
1. Five reviewers, one per job below. Reviewers only read; they never edit.
2. Each reports: rule number, where, how bad (high, medium, low), the fix in one line. Also flag dead buttons, broken links and leftover placeholder text.
3. Merge into one fix list. Show it to Osman. Change nothing until he says go (or the task already says go).
4. Fix everything in one pass. Re-run the failed checks. Screenshots before and after at 390px and 1280px.
5. Run `node tests/run-safe-suite.js` before any PR.

## Job 1: Layout and phone
1. Mobile first; 360px is the base; shell 1200 to 1440px max; text columns 75ch max.
2. Breakpoints follow content; test 320, 768, 1024, 1440; no sideways scroll.
3. Fluid type and space with clamp().
4. Body text 16px or more on phones; tap targets 44x44px with 8px between.

## Job 2: Type and rhythm
7. Body text left-aligned; headings start with the key word.
8. Line length 45 to 75 characters (max-width: 65ch).
9. Line height 1.5+ for body, 1.0 to 1.2 for big headings.
10. One spacing scale (4, 8, 12, 16, 24, 32, 48, 64, 96, 128) and one type scale.

## Job 3: Colour and states
11. Contrast 4.5:1 for text (3:1 large), 3:1 for icons, borders, focus rings. Colour is never the only signal.
12. Components use tokens (`--bg`, `--text`, `--accent`...), never raw hex. Dark mode changes tokens only.
13. Every control has default, hover, focus-visible, active and disabled. Focus ring 2px+.
14. Empty, loading and error states are designed and say what to do next.

## Job 4: Motion, speed and access
15. Motion 150 to 300ms, ease-out; prefers-reduced-motion respected; nothing flashes; no autoplay that cannot pause.
16. Space reserved for images and embeds; CLS under 0.1.
17. LCP under 2.5s, INP under 200ms; hero image 200KB max; two font families max.
18. Real header, nav, main; one h1; no skipped heading levels; works with keyboard only.

## Job 5: Message and action
5. One main action per screen (one filled accent button).
6. The first screen answers: what is this, who is it for, what do I do next.
19. Forms: visible labels, right input types, fewest fields.
20. Share layer: title 60 chars max, description 155 max, a 1200x630 share image, favicon, theme-color.

## LAVAALL rules that always apply
No invented prices, SKUs, suppliers, volumes, contacts, testimonials or law. The private business is never named in public copy or shipped client code. No deploy, merge, send, post or spend without Osman's yes.
