# Reference research (draft)

Source: live Firecrawl scrapes on 2026-10-03. **Not Refero style records.** The Refero MCP is configured in `~/.claude.json` but was not connected this session. Once it is authorised (`/mcp` in an interactive session), replace the "Extracted" columns below with `refero_get_style` records and record the IDs.

## Template gallery candidates (pick 5 or 6)

Each is a *style direction* shown applied to a sample business type, so visitors can picture their own site. All sample businesses are labelled "sample", never presented as real clients.

| # | Reference | Extracted traits | Primary job in the gallery | Sample business to show it on |
|---|---|---|---|---|
| 1 | Exo Ape (exoape.com) | Bg `#0D0E13`, text `#FFFFFF`, accent sand `#E0CCBB`, Lausanne sans, h1 ~333px, 0px radius. Monumental type, near-black canvas, warm accent used sparingly | Web v1 primary (already locked) | Hotel / guesthouse |
| 2 | OHZI (ohzi.io) | Bg `#111111`, Montserrat, periwinkle `#8395F2`, pill primary button (25px radius) next to square secondary, soft shadow. 3D, immersive | Immersive / brand showcase | Music or events brand |
| 3 | basement.studio | Bg `#000000`, text `#E6E6E6`, orange `#FF4D00`, Geist + Geist Mono, 0px radius, h1 ~98px, mono metadata. Bold, high energy | Technical / bold | Logistics or tech supplier |
| 4 | Lusion (lusion.co) | Light, bg `#FFFFFF`, Aeonik, dark `#2B2E3A` pill buttons (radius ~105px), soft inputs `#F0F1FA` (18px radius). Friendly, 3D | Light, approachable | Clinic or pharmacy |
| 5 | Locomotive (locomotive.ca) | Light, bg `#FFFFFF`, indigo `#312DFB`, crimson `#DC143C`, Helvetica Now / Avenir, 0px button radius, h1 ~79px. Clean, editorial | Light editorial | School or NGO |
| 6 | Active Theory (activetheory.net) | Captured in a real browser 2026-10-03. Pure black canvas, tiny techno-pixel type, frosted glass pill nav ("WORK ---- CONTACT") with a faint glow, cyan UI accents, ASCII-style loader with a counter, one metallic red 3D ribbon as the hero object, scroll-driven. Entire site is WebGL | Spatial restraint, one object per screen, glass pill nav | Needs a static fallback: it is heavy WebGL, so only borrow the nav, loader and restraint, not the 3D |

## Notes

- **Correction to the lab lock:** Exo Ape's actual canvas is near-black navy `#0D0E13` with a warm sand accent, not deep violet. The existing lock says violet is "only an interaction/focus signal", so I would keep that and use violet for focus states only. Confirm this is what you want.
- Active Theory is WebGL-heavy and slow to load (about 25 seconds in my capture). That conflicts with the low-bandwidth goal, so it is a style reference only, not a technique to copy.
- Font licences: Lausanne, Aeonik, nbarchitekt are commercial. Plan to substitute free equivalents (Geist, Inter Tight, Space Grotesk, etc.) for the mockup and note it.
- Screenshots exist at the Firecrawl URLs (they expire). I have not yet viewed them.

## Next
1. Authorise Refero and re-pull the 5 or 6 chosen references as proper style records.
2. Lock the final six, write the reference lock for this site.
