# Watch it work (demos), prefix `dm-`

Four code-native node-and-wire demos (Post for you, Write your listings, Answer customers, Weekly check-up). Copy is verbatim from `demos` in content/en.json. Poster and replies have a real Approve button the visitor presses; the run waits for it.

## Merge
- HTML: paste `section.html` into `index.html` (e.g. between Work and Contact). It has `id="demos"`; add a nav link if wanted. It reuses `.sec-head` and `.label` from styles.css and does not use `.rv`.
- CSS: append `section.css` to `styles.css` (or link it after it).
- JS: append `section.js` to `app.js` (IIFE) or load it with `<script src>` after the section.

## Behaviour
- Segmented control (buttons with aria-pressed), one demo plays at a time; Replay per demo.
- Plays only while the section is in view (IntersectionObserver), pauses off-screen, rests in the completed state (no looping).
- Reduced motion: completed state shown statically; Replay steps instantly to the approval and Approve completes it. No-JS also shows the completed state.
- Motion is transform/opacity only (payload, wire fill, fades). Screen reader updates via a polite live region.

## Tested (qa/run.mjs, qa/extra.mjs; test page qa/test.html)
1440, 1024, 390 px, motion on and reduced: no console errors, no horizontal overflow, tabs and Approve/Replay work by keyboard, demos reach the complete state, pausing off-screen works. Screenshots in qa/.

## Not verified
Real fonts (test page does not load Google Fonts, so mono/Inter fall back to system fonts). Screen reader output not tried. Not tested alongside app.js.
