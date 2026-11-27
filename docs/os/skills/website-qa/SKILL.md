---
name: website-qa
description: >-
  Use this when checking lavaall.com quality (forms, locales, links, claims,
  booking) — run a reproducible QA checklist; file bugs clearly; do not deploy
  unless Level 3+ founder-approved.
---
# Website QA

Protect trust on lavaall.com for a quote-first EN/FR/(Krio) sourcing site.

## Checklist (tick what you ran)
- [ ] Home and key landing loads
- [ ] Locale paths (EN/FR; Krio if present) render without broken copy
- [ ] Primary CTAs (inquiry/quote/contact/schedule) reach expected forms
- [ ] Forms: submit path, validation, success/failure messaging (use test data clearly marked QA)
- [ ] Broken links / 404s on nav and footer
- [ ] **Regression:** `curl -sI https://www.lavaall.com/schedule` → **HTTP 200** (serves `index.html`; not Vercel NOT_FOUND). Fixed 2026-09-14 via PR #5 (`3e29c79`) vercel rewrite `/schedule` → `/index.html`. Resume-token UI (`?leadId=&token=`) still deferred.
- [ ] Claims vs Brand Brain / MAGNUM (sourcing not marketplace; no unauthorized reseller claims e.g. Starlink)
- [ ] Mobile viewport smoke
- [ ] **Slow network (West Africa buyers):** phone viewport + throttled slow network (DevTools "Slow 3G" or similar). Page usable, main CTA reachable, note load time and heavy assets.
- [ ] **Osman's real setting:** anything Osman opens or runs himself checked on Windows and/or his phone, not only the Linux box.
- [ ] **Trim pass:** "what would Osman delete?" List cuts; re-check the trimmed page against the same scope.
- [ ] Console errors and failed asset requests (broken image/CSS/JS URLs), desktop + phone
- [ ] Horizontal overflow on phone: page scroll width must not exceed the viewport; name the element that overflows
- [ ] Fonts loaded: the heading/display font actually renders, not a system fallback
- [ ] Video playback: every hero/section video loads and plays (or its poster shows) in real Chrome
- [ ] For new page builds: a written section plan + acceptance list exists before code, and a screenshot-fix loop ran (desktop + phone, fix the 3 weakest issues, re-shoot, max 3 rounds)
- [ ] Headers/security only as observable; no prod config changes here

## Bug report format
- Title, URL, locale, device/network setting, steps to reproduce, expected vs actual, severity, screenshot path if any

## Permission
- QA / read / screenshot = L0–L1
- Internal bug notes / discovery writeups = L2
- **Deploy / Apps Script redeploy / DNS / prod fix push = L3+ founder-approved** — stop and ask

## Steps
1. Define scope (full smoke vs single flow).
2. Run checklist; capture reproducible bugs only.
3. Separate site bugs from CRM/Sheet process issues (hand those to inquiry-triage).
4. Summarize pass/fail; list L3 deploy asks if fixes are ready elsewhere.
5. End with the receipt block from [verify-loop](sand-workflow:verify-loop) (Expected / Ran / Got / Assumed / Rule followed).
6. Do not deploy.

## Completion criteria
- [ ] Checklist results recorded, including the setting each was tested in
- [ ] Bugs reproducible or marked cannot-reproduce
- [ ] Receipt block attached
- [ ] No deploy performed without documented L3+ approval

## Reference: geometry self-check + low-end Android load (Scout, 13 Oct reels)
- Geometry self-check: before showing visual work, zoom to ~4× on every joint/overlap/edge (both themes) and fix gaps, wrong depth order and textures that stop mid-surface.
- Low-end Android load test: throttle to a slow 4G/3G profile and a low-end mobile CPU (e.g. 4–6× slowdown); record load time, LCP, total page weight and jank on scroll animations; flag pages that are not usable within a few seconds.
- Security/pentest tools (e.g. Strix): run only on our own sites, only with Osman's L3/L4 approval; never on anyone else's site. Do not install or run cloned code.

*Console/overflow/font/video checks and plan-first + screenshot-fix loop adapted from MotionSites README (repo later rejected, FakeGit audit 9 Nov), MS-1, 30 Oct 2026.*
