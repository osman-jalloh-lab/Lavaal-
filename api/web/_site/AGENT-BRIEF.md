# Shared brief for build agents (LAVAALL Web)

Project: static front-end mockup of LAVAALL Web, a sub-brand selling websites + AI automation to restaurants, hotels, shops and marketers in Sierra Leone, Guinea and Liberia. Folder: `C:\Users\osman\OneDrive\Desktop\web building bz`. Backend is out of scope (another tool builds it later).

## Read first
`REFERENCE-LOCK.md` (approved tokens and rules), `content/en.json` (approved copy, use it verbatim where it exists), `styles.css` and `app.js` (existing page: copy its conventions), `index.html` (see how sections are structured). `TODO.md` lists open items.

## Hard rules
- Plain static HTML, CSS, JS. No framework, no new npm packages. Playwright is already installed in `tools/` (use `cd tools && node yourscript.mjs`). ffmpeg is on PATH.
- **Do not edit `index.html`, `styles.css`, `app.js`, `content/en.json`, `PLAN.md`** or anything outside your own folder. The lead will merge your section. Put everything in your own folder (named below) and use unique class prefixes so nothing collides.
- **Do not touch** any folder outside `web building bz` (other projects on the Desktop are read-only).
- Tokens: use CSS variables from `styles.css` (`--bg #0D0E13`, `--bg-2`, `--text`, `--text-2`, `--accent` sand = emphasis only, `--focus` violet = focus/hover ring only, `--line`, fonts `--display`, `--body`, `--mono` = labels and demo UI only). 0px radius on content blocks.
- **No fake clients, testimonials, prices, or metrics.** Every automation demo shows an "Illustrative demo" badge. Sample data must be obviously generic.
- Agents draft, the owner approves. Never show an agent sending or paying without a visible approval step.
- Do not claim Facebook Marketplace automation. Say "Facebook Page", "Instagram" or "shop catalogue".
- No dashes as sentence punctuation in visible copy (use commas or full stops). No em dashes.
- Motion: transform and opacity only, 200 to 500ms, ease-out. Must respect `prefers-reduced-motion` (show the final state, no looping). Pause looping animation when off-screen.
- Accessibility: WCAG 2.2 AA, keyboard reachable controls, visible focus, text alternatives for any visual-only meaning, no colour-only signals.
- Performance: no external requests except what `index.html` already loads. Whole section budget under 150 KB excluding videos.
- Phone first: must work at 390, 1024 and 1440 px, no horizontal scroll.

## Deliverable shape
Your folder contains `section.html` (a `<section>` fragment, no `<html>`/`<body>`), `section.css`, `section.js` (an IIFE, no globals) and a short `README.md` with: what you built, how to merge (one line each for HTML, CSS, JS), what you tested, anything you could not verify.

## Verification (required before you report)
Write a Playwright script that serves a small test page (your fragment inside the real page chrome: link `../styles.css` plus your `section.css`), loads it at 1440, 1024 and 390 px with `reducedMotion: 'no-preference'` and again with `'reduce'`, and checks: no console errors, no horizontal overflow, controls work by keyboard. Take screenshots into your own folder under `qa/` and LOOK at them (open the images). Fix what you see. Report only what you actually verified.
