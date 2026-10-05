- dm: mp4 112937 B, webm 230873 B, jpg 17528 B
- social: mp4 80878 B, webm 137254 B, jpg 11902 B
- leads: mp4 79489 B, webm 136696 B, jpg 12946 B
- seo: mp4 139025 B, webm 239148 B, jpg 14729 B
- inbox: mp4 89535 B, webm 166831 B, jpg 12343 B
- money: mp4 95494 B, webm 183514 B, jpg 15039 B
- watch: mp4 84164 B, webm 167767 B, jpg 15448 B
- hiring: mp4 78567 B, webm 147158 B, jpg 12740 B

Sources: `video-src/<id>.html` (+ `base.css`, `engine.js`): code-native timeline pages, every frame is a pure function of time, dark canvas, "Illustrative demo" corner badge, generic sample text, approval step shown wherever a send/post happens (dm uses owner-approved saved answers and an owner ping). Recorded with Playwright recordVideo (`tools/vrec.mjs`), loop trimmed and encoded by `tools/venc.mjs`, QA by `tools/cpqa.mjs`. Each loop fades from and to the dark canvas so it loops seamlessly. No AI video tools used.

## Tested (Chromium headless, Playwright, `qa/`)
1440, 1024, 390 px, motion no-preference and reduce: no console errors or failed requests, no horizontal overflow. Keyboard Tab reaches the buttons, Enter toggles; videos reach readyState 4 and currentTime advances (mp4 source used); hover plays and leaves pauses; off-screen pauses; tap plays at 390; reduce mode does not auto-play and loop is false. Screenshots and `qa-log.txt` in `qa/`. Posters and video frames viewed.

## Not verified
Safari/iOS playback, real 3G behaviour, screen-reader output, Geist Mono and Inter (test page had no web fonts, so fallback fonts shown; the videos use system mono/sans fonts). Videos were not re-checked on the merged index.html.
