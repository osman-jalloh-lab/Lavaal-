# Business OS section (`os-`)

Interactive mock "business operating system" dashboard: left rail of 7 agents (tablist, arrow/Home/End keys), a main panel per module, approval queue strip, Illustrative demo badge, working Approve/Decline (with Reset demo) in Inbox and Builder, and a one-time first-view auto-tour (3s per module, stops on any interaction, skipped with reduced motion). On phone the rail becomes a horizontally scrolling tab strip. Copy comes from `content/en.json` `os`; all sample data is generic (no numbers).

## Merge
- HTML: paste `section.html` into `index.html` where the section belongs.
- CSS: append `section.css` to `styles.css` (or link it after it).
- JS: append `section.js` (an IIFE) to `app.js`, or load it with `<script defer>`.

## Tested
`qa/run.mjs` (Playwright): 1440, 1024 and 390 px, motion and reduced motion. Checks console errors, horizontal overflow, keyboard tab navigation, approve/decline, tour start and stop. Screenshots in `qa/`.

## Not verified
Real devices, screen readers, the real web fonts (test page may fall back).
