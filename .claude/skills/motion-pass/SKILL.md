---
name: motion-pass
description: Add small premium motion to a page (hover lift, button press, staggered entry, count-up numbers, easing focus ring) without jank. Use when a page "looks flat" or Osman asks for it to feel expensive.
---

# Motion pass (five details, nothing more)

From the Claude Design Blueprint, hack 03. Already applied to /os in `api/os/_client/os.css` (Motion pass block) and `core.js` (`motionPass`).

1. Cards lift 4px on hover (`@media (hover:hover)` only).
2. Buttons press to scale(.97) on :active.
3. Cards enter with a 40ms stagger (opacity and translateY 12px, 300ms).
4. Whole numbers count up once, under 1 second, ease-out.
5. The focus ring eases in.

Rules: only transform and opacity move. 150 to 300ms, ease-out. No more than three things move at once. Never move text while people read it. Always keep the `prefers-reduced-motion: reduce` block that turns it all off. Test at 390px.
