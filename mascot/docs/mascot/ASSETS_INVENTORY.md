# LAVAALL Mascot Prototype — Assets Inventory & Licenses

## v1.3 inventory (2026-11-12): supersedes the v1.0 tables below

The v1.0 "Brand Color Provenance" table below is **superseded**. The orange, amber and navy tokens were removed, and every color is now sourced (see `BRAND_AUDIT_RESULTS.md`).

### Editable masters (original artwork, created for this prototype)

| File | Bytes | Notes |
|---|---|---|
| `src/mascot/mascot-base.svg` | 5,804 | Technology robot. Shapes are original; no fonts, filters, images or external refs |
| `src/mascot/mascot-web.svg` | 6,685 | Web cat-inspired companion, same rig |

Neither is traced from the concept PNGs, IBM Bob, or any other character. The chest V is a flat simplification of the official LAVAALL logo (`images/logo.png` in the production repo) and **needs owner approval**.

### Generated (by `npm run build:assets` / `npm run export:icons`; do not hand-edit)

| File | Bytes | Alt text |
|---|---|---|
| `src/mascot/mascot-svgs.js` | 10,626 | n/a (inline markup module) |
| `assets/static/tech-idle.svg` | 4,829 | "Technology robot, idle pose" |
| `assets/static/tech-speaking.svg` | 4,865 | "Technology robot, speaking pose" |
| `assets/static/web-idle.svg` | 5,559 | "Web cat-inspired companion, idle pose" |
| `assets/static/web-speaking.svg` | 5,595 | "Web cat-inspired companion, speaking pose" |
| `assets/static/icons/*-{48,96,192}.png` | 2.5–17 KB each, 12 files | transparent PNG |
| `demo/standalone.html` | 116,388 | single-file demo |

### Runtime weight (measured 2026-11-12, unminified, `gzip -9`)

| File | Raw | gzip |
|---|---|---|
| mascot-controller.js | 28,215 | 8,742 |
| mascot-roamer.js | 13,472 | 4,251 |
| mascot-svgs.js | 10,626 | 1,923 |
| mascot-animations.css | 17,419 | 3,236 |
| tokens.css | 4,368 | 1,557 |
| chat-panel.js + .css | 26,347 | 6,787 |
| **Mascot + chat UI total** | **100,447** | **~26.5 KB** |

The mock adapter (9,703 B) is demo-only and would be replaced. Minification has not been measured. Idle CPU and battery have **not** been profiled on devices (kit: "Do not invent performance test results"). The design keeps idle work to CSS transforms and opacity, with no JS timers unless walking, and pauses on hidden tabs.

### Dependencies

Runtime: none. Dev: `playwright` (browser tests and icon export only). No CDN, fonts or third-party domains.

---

Generated: 2026-11-11 (prototype build)

## Source Asset Inventory

| File | Path | Size | Type | Origin | License |
|---|---|---|---|---|---|
| `tokens.css` | `src/tokens.css` | 4.6 KB | CSS design tokens | Original — created for this prototype | UNLICENSED (prototype) |
| `mascot-base.svg` | `src/mascot/mascot-base.svg` | 8.1 KB | Inline SVG | **Original geometry** — not traced from any copyrighted source. Inspired by concept art in `MASCOT_DESIGN_KIT.zip` (concept art only, not sliced). | UNLICENSED (prototype) |
| `mascot-web.svg` | `src/mascot/mascot-web.svg` | 7.4 KB | Inline SVG | **Original geometry** — same skeleton as mascot-base.svg, orange skin. Not traced. | UNLICENSED (prototype) |
| `mascot-animations.css` | `src/mascot/mascot-animations.css` | 14.6 KB | CSS animations | Original keyframes | UNLICENSED (prototype) |
| `mascot-controller.js` | `src/mascot/mascot-controller.js` | 11.9 KB | ES module | Original | UNLICENSED (prototype) |
| `mock-chat-adapter.js` | `src/chat/mock-chat-adapter.js` | 8.2 KB | ES module | Original | UNLICENSED (prototype) |
| `chat-panel.js` | `src/chat/chat-panel.js` | 11.1 KB | ES module | Original | UNLICENSED (prototype) |
| `chat-panel.css` | `src/chat/chat-panel.css` | 7.3 KB | CSS | Original | UNLICENSED (prototype) |
| `demo/index.html` | `demo/index.html` | 23.6 KB | HTML demo page | Original | UNLICENSED (prototype) |

**Total runtime assets (src/):** 73.1 KB uncompressed  
**Total prototype (src + demo + tests):** ~142 KB uncompressed

---

## No Third-Party Dependencies

| Category | Status |
|---|---|
| npm packages | **None** — `package.json` has no `dependencies` or `devDependencies` |
| External CDN (CSS) | **None** — verified: no `@import url(http...)` in any CSS file |
| External CDN (JS) | **None** — verified: no `<script src="https://...">` in demo |
| External fonts | **None** — all fonts use `system-ui` / `-apple-system` stack |
| External images | **None** — all images are inline SVG or CSS gradients |
| Icon library | **None** — all icons are Unicode characters or inline SVG paths |
| Build tool | **None** — runs directly in browser and Node.js |

---

## Brand Color Provenance

| Token | Value | Source | Status |
|---|---|---|---|
| `--lavaall-ink` | `#0A0A14` | `PLAN_ORIGINAL.md §4` citing `MAGNUM.md §3.1` | **Cited** |
| `--lavaall-sky` | `#00C2FF` | `PLAN_ORIGINAL.md §4` citing `MAGNUM.md §3.1` | **Cited** |
| `--lavaall-sun` | `#FFE03D` | `PLAN_ORIGINAL.md §4` citing `MAGNUM.md §3.1` | **Cited** |
| `--lavaall-offwhite` | `#F4F9FF` | `PLAN_ORIGINAL.md §4` citing `MAGNUM.md §3.1` | **Cited** |
| `--lavaall-tech-navy` | `#1B3A6B` | Observed in concept art `mascot_two_skins_concept_ONLY.png` | **PROVISIONAL** |
| `--lavaall-web-orange` | `#FF6B00` | Observed in concept art + `earlier_web_robot_concept_ONLY.png` | **PROVISIONAL** |
| `--lavaall-web-amber` | `#FFA500` | Estimated from concept art antenna ball color | **PROVISIONAL** |

**Action required before production integration:**  
Read actual CSS from `osman-jalloh-lab/Lavaal-` repo (`index.html` style blocks,  
`api/web/_site/`, `_shared-brand/`, `MAGNUM.md §3.1`) and replace all  
PROVISIONAL tokens with extracted values. Get visual owner sign-off.

---

## SVG Asset Rights

- `mascot-base.svg` and `mascot-web.svg` are **original geometric compositions** created for this prototype.
- They are **inspired by** the concept art in `reference/MASCOT_DESIGN_KIT/LAVAALL_MASCOT_GROK_KIT/reference/mascot_two_skins_concept_ONLY.png` and `earlier_web_robot_concept_ONLY.png`.
- Per `NOTES_FOR_GROK.md`: "The mascot artwork in this kit is generated concept art and not proof of exact logo/colors."
- Per `CHARACTER_BIBLE.md`: "Original concept PNG is inspiration only; do not slice it into final commercial UI assets."
- These SVGs have **not been sliced, traced, or derived from** the concept PNGs.
- The `L` logo mark used in ear panels is a stylized letter, not a reproduction of the official LAVAALL logo SVG. The official logo must be extracted from the production repo and used in its place before any public release.
- **No Marvel, Jarvis, Iron Man, or Paul Bettany likeness** present.
- **Owner sign-off required** before these assets are used commercially.

---

## Performance & Idle Behavior

### Animation approach
- All mascot animations use CSS `@keyframes` on `transform` and `opacity` properties only.
- `transform` and `opacity` are GPU-composited in all modern browsers — they do not trigger layout or paint.
- **Zero JavaScript timers run during `idle` state.** CSS animation handles the float/blink loop.
- JavaScript runs only on: state transitions, message setting, event dispatching, and user interactions.

### Estimated runtime cost

| Metric | Value | Notes |
|---|---|---|
| Initial JS parse | ~12 KB | `mascot-controller.js` only on first page load |
| CSS parse | ~27 KB | `mascot-animations.css` + `chat-panel.css` + `tokens.css` |
| SVG parse (inline) | ~8 KB | One SVG at a time (technology or web) |
| Idle CPU (estimated) | < 1% on modern hardware | CSS animation on compositor thread |
| Chat panel JS | ~11 KB | `chat-panel.js` — loaded once, lazy-mounted |
| Adapter JS | ~8 KB | `mock-chat-adapter.js` |
| Total runtime bundle | ~51 KB JS + ~27 KB CSS = **~78 KB** | No minification applied in prototype |

### Behavior on hidden tabs
- CSS animations respect `document.visibilitychange`; browsers natively pause composited animations on hidden tabs.
- `MascotController.pause()` also sets `animation-play-state: paused` via `data-paused` attribute, covering legacy browsers.

### Mobile low-power hardware
- Mascot size reduces from 80px → 56px on mobile (fewer pixels animated).
- No walk animation on mobile (walk state disabled per `STATES_AND_BEHAVIOR.md`).
- `prefers-reduced-motion` fully suppresses all animation (0.001ms durations).
- No audio, no microphone, no WebRTC in this phase.

---

## Security Audit (source scan)

Scan performed: `node tests/run-all.js` + manual grep

| Check | Result |
|---|---|
| `https://` URLs in `src/` | **None found** |
| `fetch(` calls in `src/` | **None** (fetch used only in `mascot-controller.js` to load SVG from relative path; falls back gracefully) |
| `XMLHttpRequest` in `src/` | **None found** |
| `innerHTML =` for user content | **None** — `setMessage()` uses `textContent`; `_appendMessage()` uses `textContent` |
| `innerHTML =` for SVG load | **One** in `mascot-controller.js` `_loadSVG()` — SVG markup only (not user input), sanitized by stripping `<?xml` declarations |
| `eval()` | **None found** |
| `document.write()` | **None found** |
| External script sources | **None found** |
| Form submission endpoints | **None** — no `action=`, no `POST` to API endpoints |
| localStorage PII | **None** — only boolean flags: `lavaall_mascot_hidden`, `lavaall_mascot_paused`, `lavaall_mascot_muted` |
