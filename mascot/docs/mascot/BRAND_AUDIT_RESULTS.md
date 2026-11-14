# Brand audit results (v1.3)

Answers `MASCOT_DESIGN_KIT/01_DESIGN/BRAND_AUDIT.md` steps 1, 2 and 4. Step 3 (deployed page vs source) and step 5 (owner sign-off) are still open; see the end of this file.

## Source

| Item | Value |
|---|---|
| Repository | `osman-jalloh-lab/Lavaal-` (local clone `Desktop/new lavaall/Lavaal-os`) |
| Ref read | `origin/main` @ `9317148abef9220f0f1691a3ff524ca2b87bec9f` (2026-10-23 20:39 -05:00), last fetched copy on this machine |
| Method | `git show origin/main:<path>`. Read-only; the working tree was not touched and nothing was fetched. |
| Date of audit | 2026-11-12 |

`origin/main` may be behind GitHub. Re-run the commands below after a `git fetch` before integration.

## Technology (main site)

`assets/css/main.css` line 6:

```css
:root{--sun:#FFE03D;--sky:#00C2FF;--lime:#00F5A0;--coral:#FF5C5C;--ink:#0A0A14;--white:#FFFFFF;--offwhite:#F4F9FF;--muted:#5A6A80;--r:18px;}
```

`MAGNUM.md` lines 125–130 list the same six core colors (sun, sky, lime, coral, ink, offwhite). Fonts per `MAGNUM.md` §3.1: Clash Display and Bricolage Grotesque. The mascot uses no fonts.

## Web division

`api/web/_site/styles.css`:

| Line | Token | Value | Mascot use |
|---|---|---|---|
| 1 | usage rule | "Teal = dark bands, cream = light bands, sun = CTA only, violet = focus only" | followed |
| 8 | `--bg` | `#0B252A` | joints, paws, badge plate |
| 9 | `--bg-2` | `#10323A` | collar, whiskers |
| 11 | `--text-2` | `#C7D3D1` | not used |
| 12 | `--accent` | `#E7D3BF` | eyes, mouth, inner ears, tail tip, emblem |
| 13 | `--sun` | `#F7E04A` | **not used** (CTA only) |
| 15 | `--focus` | `#8B7CFF` | **not used** (focus only) |
| 26 | `.light --bg` | `#F5ECE5` | shell (body, head, ears, tail) |
| 30 | `.light --accent` | `#8A4B2A` | not used |

The Web site's own assistant is called **Lava** (`api/web/_site/index.html` lines 24, 45, 60, 62, 79). The mascot does not rename it; its label is "Open LAVAALL Web assistant".

## Logo

`images/logo.png` (608,845 bytes; there is no SVG logo in the repo). It is a chrome-edged **V** filled with circuit traces, over the wordmark "Lavaall" in a sky-to-lime gradient. The "L" mark in the AI concept sheet is not the real logo.

The mascot's chest emblem is a flat, simplified V chevron. On Technology it uses a sky (`#00C2FF`) to lime (`#00F5A0`) gradient, the logo's two ends. On Web it uses sand (`#E7D3BF`) on teal. **Needs owner approval**, or a vector mark from the owner to replace it.

## Changes from v1.2

| v1.2 token | Value | Evidence | v1.3 |
|---|---|---|---|
| `--lavaall-web-orange` | `#FF6B00` | none (concept art only) | removed; Web uses sand `#E7D3BF` |
| `--lavaall-web-amber` | `#FFA500` | none | removed |
| `--mascot-web-panel` | `#2A1A00` | none | removed; `#10323A` |
| `--lavaall-tech-navy` | `#1B3A6B` | none | removed |
| SVG shell | `#E8EDF5` | none | `#F4F9FF` (Tech) / `#F5ECE5` (Web) |
| SVG joints | `#1A1A2E` | none | `#0A0A14` (Tech) / `#0B252A` (Web) |
| badge LEDs | `#00FF88`, `#FFE03D`, `#FF4444` | partial | badge replaced by the V emblem |

`tests/v13-design-kit.test.js` (B-1 to B-4) fails if any color outside these sourced lists comes back into the artwork or code.

## Yellow

The kit says "if site brand lacks yellow, do not introduce yellow". The site does have yellow: `--sun #FFE03D` on Technology, `--sun #F7E04A` on Web (CTA only). The mascot still leaves it out, because no source file assigns it to illustration and the Web file restricts it to CTAs. Adding it is an owner decision.

## UI chrome (v1.3.1)

The chat panel, speech bubble and demo page used generic Tailwind grays (`#111827`, `#1F2937`, `#374151`, `#9CA3AF` …) and off-brand green/red/amber. They now use `--ui-*` tokens in `src/tokens.css`, built only from brand colors: offwhite and sky mixed into ink for Technology, and the `/web` site's own `--bg`, `--bg-2`, `--text-2` and `--line` for Web. Status colors are lime, coral and sun. Test B-7 rejects any other color. Measured text contrast in Chromium: Tech chat 6.86–17.35:1, Web chat 7.14–15.12:1 (all pass AA).

## Still open

1. ~~Step 3~~ **Done 2026-11-12:** the live `https://www.lavaall.com/assets/css/main.css` and `https://www.lavaall.com/web/styles.css` match the source tokens above exactly (fetched for the audit only; the prototype itself still makes no network calls).
2. **Step 5.** Owner sign-off on the design board in `demo/index.html` (both characters, both poses, icons, palette).
3. A vector logo mark, if the owner wants the exact logo instead of the simplified V.
4. WCAG contrast, computed with the WCAG 2 relative-luminance formula: sand `#E7D3BF` on the ink face `#0A0A14` is 13.57:1, and sky `#00C2FF` on ink is 9.53:1 (both decorative, not text). The new Web send button, teal text `#0B252A` on sand `#E7D3BF`, is 11.02:1 and passes AA and AAA. The rest of the chat panel's text contrast is unchanged from v1.2 and should be checked again in the integration PR.
