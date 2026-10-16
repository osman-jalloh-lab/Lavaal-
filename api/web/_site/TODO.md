# Open to-dos

- [x] **Artists offer** (2026-10-03): Triple T approved (reported by Osman). Hub hero plays the Kam Dae studio session (YouTube, muted, Sound on button). Main site has a For artists section with the live Triple T hub in a phone frame, linked to Salone Sound. Payments, merch and early access are described as what we build; nothing is connected yet.
- [ ] Keep Triple T written approval on file; collect official photos, logo, artwork, bio, management contact, show dates, WhatsApp number.

- [x] **Round 3 (2026-10-03, Osman feedback):** Work = real recordings of Starlink v4, LAVAALL and Hermes OS (portfolio dropped, it records blank); Who it is for = bento with live UI moments per business; Templates = six real mini-sites in `templates/` running live in phone frames; Automations = 8-flow player with real wording, run log and approval; Business OS = animated agent office + working approval queue. Removed: morph (screenshots), old demos, Capabilities videos. Verified 1440/1024/390, reduced motion, axe 0.
- [x] **POUR / PLAY** (`showcase/pour-play/`): scroll-driven Three.js coffee journey + shop. 5 poly.pizza models (licences in CREDITS.md). Built from the prompt spec (original pour-play/ folder was not on this machine). Lighthouse 85+ not measured (needs a real GPU browser).
- [x] **TERRA** (`showcase/terra/`): candlelit 3D course journey, menu, cellar, gallery, reservations. Higgsfield: 7 dish stills, 7 cinemagraphs, 3 loops (2.4 MB video total). Built from Osman's summary; brand-guide.md / full menu / assets.md / prompt.md were not on this machine. Chef line-art morph skipped: needs a real chef portrait.
- [x] **Portfolio upgrade** (`Desktop/profolio`, working copy only, NOT committed): portrait line-art morph (Higgsfield), scroll reveals, stat chips + tilt, new banners, HERO_KICKER. Lint clean, build passes.
- [ ] Higgsfield spend this round: 102.25 credits (portfolio 40.5, TERRA 61.75). 129 left.
- [ ] `showcase/*` and `assets/work/rec-*.mp4` need a real-phone check; 3D pages were only tested with software rendering.

- [x] **Golden hour redesign** (2026-10-03, see `RESEARCH-v2.md`): full-bleed hero film, "Meet Lava" scripted WhatsApp demo (restaurant/hotel/shop, owner approval step), "Who it is for" video tiles, How it works + FAQ, teal/cream bands, sun CTA, Instrument Serif headlines. Verified at 1440/1024/390, motion and reduced motion, keyboard, axe 0 violations, no overflow, no console errors.
- [ ] Hero film is 1.6 MB and loads after the page (skipped on reduced motion and data saver). Measure on a real throttled phone.
- [ ] `assets/video/raw/` holds the original Higgsfield clips (about 17 MB). Do not deploy it.
- [ ] Remaining dark-era sections (Watch it work, Capabilities, Business OS) still use the old screen-recording look. Next pass: re-record videos with the self-hosted fonts and frame them as phone-in-hand over the new clips.
- [ ] Lava demo is scripted. Before promising real WhatsApp automation, confirm WhatsApp Business Platform setup and fees per client.

- [ ] **WhatsApp number**: Osman will provide later. `content/en.json` > `whatsapp.number` is empty; the site must hide the WhatsApp button until it is filled in.
- [ ] Refero MCP: add at user scope so it loads in this folder (see chat), then attach Refero style IDs to `REFERENCE-LOCK.md`.
- [ ] Mobile money: dropped from the copy. Revisit only if a payment option is actually offered.
- [ ] French copy (`content/fr.json`): later, same keys as `en.json`.
- [ ] Real-device test on a phone and a throttled connection before any launch claim.
- [x] **Template gallery** built 2026-10-03 (`#templates`, before Contact). Six looks on sample restaurants, hotel, shops and marketer; "Use this look" pre-fills the inquiry form. Verified at 1440/1024/390, motion and reduced motion, keyboard (arrows, buttons), axe 0 violations, no overflow, no console errors. Screenshots `qa/templates-*.png`.- [x] Fonts self-hosted (latin subsets in `assets/fonts/`, 81 KB), Google Fonts requests removed, OG tags added. Verified over HTTP at 1440 and 390: no external requests, no console errors.
- [ ] Videos use system fonts, not Geist Mono / Inter. Re-record now that fonts are self-hosted if exact match matters.
- [x] Photos converted to 800px WebP (18 to 56 KB each, from 1.1 to 1.7 MB PNGs). Used in the template gallery, lazy-loaded.
- [ ] SEO still missing: canonical URL, `og:image`, favicon, `robots.txt`, `sitemap.xml`, JSON-LD. These need the real domain, so they wait for a deploy decision.
- [x] Accessibility audit (2026-10-03): axe-core WCAG 2.2 AA + best-practice, 0 violations at 1440 and 390. Keyboard: 30 tab stops, all with visible focus. Fixed two small targets (brand link, "Open in mail app") to 44px. One h1, landmarks present, no autoplay.
- [ ] Videos are silent loops with only a short aria-label. WCAG 1.2.1 wants a text alternative for video-only content: confirm each card's visible text covers what the video shows, or add a hidden description.
- [ ] Not tested: Safari/iOS, a real slow connection, screen readers (axe cannot judge reading order or announcements).
- [ ] Decide whether the portfolio card stays (screenshot shows photo and "Open to opportunities").
