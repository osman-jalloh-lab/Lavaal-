# LAVAALL Web: Reference Lock (Phase 0)

Status: **approved by Osman 2026-10-03** (palette/type, six templates, English-first with French-ready structure). Sources: `REFERENCES.md` (live scrapes + Active Theory browser capture), the lab's Web v1 lock in `test lavaall/REFERENCE-LOCK.md`, and the Refero method. Refero style IDs are still to be attached once the MCP is authorised (`/mcp`); until then every trait below traces to a scrape or to your brief.

## 1. Brief

Designing the LAVAALL Web sub-site for restaurants, hotels, e-commerce shops and marketers in Sierra Leone, Guinea and Liberia, on desktop and phone (phone first).
Goal: a visitor sees real work, sees what automation would do for their business, and taps to contact LAVAALL.
Tone: confident, cinematic, unhurried. Not agency-slogan, not SaaS.
Main objection: "Is this real, and will it work on my phone and my data plan?"
Must remember: **an automation you can watch run**, next to a site that loads fast on 3G.
Constraints: static HTML/CSS/JS, no framework, no pricing, LAVAALL-style contact, mockup only (backend handled elsewhere), no fake clients or metrics.

## 2. Reference lock (main site)

| Field | Decision |
|---|---|
| Primary | **Exo Ape**: near-black canvas, monumental type, sparse chrome, long visual pacing |
| Preserve | (1) canvas `#0D0E13`; (2) display type scaled huge (hero up to ~20vw on desktop); (3) 0px radius on content blocks; (4) one warm accent used rarely; (5) project imagery carries the colour |
| Borrow only | **basement.studio**: Geist Mono metadata labels, used only on the automation demos and captions. **Active Theory**: frosted glass pill nav and the one-object-per-screen restraint |
| Role rules | Sand `#E0CCBB` = accent for links and key words only, never a background. Violet = keyboard focus and hover ring only (per the lab lock). Mono type = labels and demo UI only. Glass = nav pill only |
| Media strategy | Real: your four projects as screenshots (captured from the local builds). Generated: five photoreal scenes in `assets/photo/` (labelled illustrative). Code-native: automation demos and the 8 videos |
| Reject | WebGL / 3D hero (too heavy for the region), repeated 3-card grids, fake code rain, browser-frame clutter, decorative gradients, hollow slogans, pricing |

## 3. Token commitments

| Token | Value | Role |
|---|---|---|
| `--bg` | `#0D0E13` | page canvas |
| `--bg-2` | `#14161D` | raised panels (demos, nav pill) |
| `--text` | `#FFFFFF` | headings |
| `--text-2` | `#B8BBC6` | body, at least 7:1 on `--bg` |
| `--accent` | `#E0CCBB` | sparing emphasis, links |
| `--focus` | `#8B7CFF` | focus and hover ring only |
| `--line` | `rgba(255,255,255,.12)` | 1px dividers |
| Display font | **Inter Tight** (stand-in for paid Lausanne), 600, tight tracking | hero, section titles |
| Body font | **Inter**, 400/500 | paragraphs, UI |
| Mono font | **Geist Mono** | labels, demo UI |
| Scale | clamp()-based: hero `clamp(3.5rem, 16vw, 15rem)`, H2 `clamp(2rem, 6vw, 5rem)`, body `1.0625rem` | |
| Radius | 0 on blocks, full-round only on the glass nav pill and buttons | |
| Motion | 200 to 500ms, ease-out; transform/opacity only; `prefers-reduced-motion` shows the final state instantly | |
| Spacing | 4px base, sections 12 to 20vh apart | |

Fonts: self-host WOFF2 subsets (Latin + Latin Extended for French accents), preload only the display font, `font-display: swap`.

## 4. Template gallery lock (6 styles, each on a labelled sample business)

Each template is a small, fully static mock page shown in a horizontally scrollable strip. The label "Sample" is always visible; none claims to be a real client.

| # | Style source | Sample business | Palette | Type | Signature move |
|---|---|---|---|---|---|
| T1 | Exo Ape | Guesthouse ("Harbour House") | `#0D0E13` + sand | Inter Tight XL | Full-bleed room photo, huge name |
| T2 | OHZI | Marketing studio ("kora/studio") | `#111111` + periwinkle `#8395F2` | Inter Tight | Pill CTA beside square CTA, soft glow, content calendar tiles |
| T3 | basement.studio | Online electronics shop ("Volt Supply") | `#000` + orange `#FF4D00` | Inter Tight + Geist Mono | Mono stock strip, order tracker |
| T4 | Lusion | Bakery and caf&eacute; ("Morning Bakery") | white + `#2B2E3A` | Inter | Soft inputs, pill buttons, code-drawn loaf |
| T5 | Locomotive | Fashion boutique ("Lappa & Co.") | white + indigo `#312DFB` + crimson | Inter Tight | Editorial big type, square buttons, numbered collections |
| T6 | Active Theory | Restaurant, night menu ("Night Kitchen") | `#000` + cyan | Geist Mono | Glass pill nav, one centred dish photo |

**Updated 2026-10-03 (Osman: "based on who I'm trying to reach"):** sample businesses re-mapped from logistics, clinic, school and events to the four target audiences (restaurants x2, hotel, shops x2, marketer). Style sources unchanged. All names are invented and labelled "Sample business". Montserrat swapped for the self-hosted Inter Tight (no extra font downloads).

Images (800px WebP, 18 to 56 KB, lazy-loaded): T1 `hotel.webp`, T2 `marketer.webp`, T3 `ecommerce.webp`, T5 `shopfront.webp`, T6 `restaurant.webp`. T4 is fully code-drawn.

## 5. Decision ledger

| Decision | Source | Role preserved | Why |
|---|---|---|---|
| Near-black canvas, huge type | Exo Ape scrape + lab lock | canvas/type | Locked Web v1 direction, cheap to render (no images needed for the hero) |
| Sand accent, rare | Exo Ape `#E0CCBB` | accent only | Avoids the lab's banned "decorative violet" |
| Violet only for focus | Lab lock | focus ring | Keeps accessibility cue distinct |
| Mono labels on demos | basement.studio | labels only | Makes automations read as "system", not decoration |
| Glass pill nav | Active Theory capture | nav only | Single memorable chrome element, no WebGL |
| No 3D | Active Theory ~25s load measured | rejected | Low-bandwidth markets |
| Code-native videos | Higgsfield cannot render exact UI text | n/a | Crisp, editable, free |
| Photoreal stills for scenery only | Higgsfield, 0.25 credit each | scenery | Realism where text isn't needed |
| Phone-first layout | Brief | n/a | Primary device in the region |
| No pricing | Your decision 2026-10-03 | n/a | Per brief |
| LAVAALL-style contact | `Lavaal--main/index.html` | pattern | Per brief |

## 6. Content map (Phase 1 will write the copy)

1. **Hero:** one huge statement; one line naming the region and who it is for; Contact pill.
2. **Work:** four real projects (LAVAALL site, Starlink concept, Hermes OS, portfolio), one full-bleed frame each; device-morph on one.
3. **Automation demos:** 4 animated workflows (poster, listings, replies, weekly check-up), each labelled "illustrative demo".
4. **Capabilities:** the 10-item catalogue with 8 looping videos on the top eight.
5. **Business OS:** the 7-module map (Inbox, Schedule, Daily brief, Money, Memory, Market watch, Builder).
6. **Templates:** the 6-style strip.
7. **Built for the region:** low-bandwidth proof with measured numbers (page weight, 3G load) once built; WhatsApp and mobile-money friendly design.
8. **Contact:** LAVAALL-style role cards plus inquiry form (non-functional placeholder).

## 7. Performance and accessibility budget

- First load: under 1 MB transferred (hero is text and CSS), under 3 s on throttled Fast 3G.
- Photos: AVIF/WebP at 1600w and 800w with `srcset`, lazy-loaded below the fold. The current PNGs (1.1 to 1.6 MB each) must be converted before use.
- Videos: MP4 H.264 plus WebM, 720p max, each under 400 KB, muted loops, `preload="none"`, poster frame; paused under reduced-motion.
- WCAG 2.2 AA: contrast, focus visible, keyboard path through every demo, captions as text.
- Verify at 1440, 1024 and 390 px with screenshots before any "done" claim.

## 8. Approvals (all three granted 2026-10-03)

1. Palette and type above (including the Inter Tight stand-in for Lausanne).
2. The six template styles and sample businesses.
3. Whether the French toggle waits (default: English first, copy structure i18n-ready).
