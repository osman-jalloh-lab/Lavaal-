# LAVAALL Mascot Prototype — Implementation Plan

## v1.3 update (2026-11-12): design-kit alignment

v1.2 was built before `MASCOT_DESIGN_KIT.zip` had been extracted. v1.3 brings the prototype into line with it. **These decisions replace the v1.0 "Key Decisions" 1–4 and "Known Limitations" 1, 3 and 7 below.**

| # | Decision | Kit source |
|---|---|---|
| 1 | Web skin is a **cat-inspired companion** (ears, tail, whiskers, collar tag, softer mouth) on the robot's exact rig, face panel and eye shapes | CHARACTER_BIBLE "Web character" |
| 2 | **Colors come from the production repo**, not concept art. Orange/amber/navy removed. Evidence: `BRAND_AUDIT_RESULTS.md` | BRAND_AUDIT steps 1, 2, 4 |
| 3 | Chest emblem is a simplified **V** from the official logo; the concept art's "L" mark isn't the real logo | CHARACTER_BIBLE "Detail cues" |
| 4 | SVG masters → `scripts/build-assets.js` → inline module + static posters + standalone demo. Single source, a drift test, and no fetch race | ANIMATION_EXPORT 1–3, 6 |
| 5 | Controller accepts all 10 **contract states** and 14 **contract events** (`send()`), presentation only | COMPONENT_CONTRACT.json |
| 6 | Walking: bounded **lane**, stops on first pointer/key/wheel/scroll/focus, **8 s cap**, pagehide, no mobile, no reduced motion, refuses an off-screen lane | STATES_AND_BEHAVIOR |
| 7 | Animations pause in background tabs (`visibilitychange`, `pagehide`) | STATES_AND_BEHAVIOR |
| 8 | Static fallback: posters (idle/speaking × 2 skins), PNG icons 48/96/192, `<noscript>` | CHARACTER_BIBLE, ARCHITECTURE "Errors" |
| 9 | Copy: bible labels; canned replies make no hours, region, stock, price or delivery claims; chat says "Reading your message…" not "Listening…" | CHARACTER_BIBLE "Content", APPROVAL_AND_SCOPE |

**Correction to v1.0–v1.2:** `demo/index.html` never worked from `file://`, because Chromium blocks module imports there. Use `demo/standalone.html` (generated, all JS inlined) or `npm run demo`.

### Contract mapping

| Contract state | Internal state | Notes |
|---|---|---|
| closed | idle | initial |
| idle | idle | |
| walking | walk | refused under reduced motion |
| greeting | wave | `OPEN` |
| listening | listen | animation only, no mic |
| thinking | think | `USER_MESSAGE` |
| speaking | speak | `ASSISTANT_START` |
| handoff | wave | "wave + direct contact options" |
| error | error | |
| hidden | (hide()) | `HIDE`; `show()` restores the prior state |

### Still owner decisions
1. Sign off on the design board (both characters, poses, palette).
2. Approve the simplified V or supply a vector logo mark.
3. Whether yellow (`--sun`, a real brand color) should appear anywhere on the mascot. Currently it doesn't.

---

**Prototype version:** 1.0.0  
**Date:** 2026-11-11  
**Status:** Standalone prototype — awaiting independent audit before integration  
**Authorization:** Isolated workspace only. No production access. No API spend. No deployments.

---

## Architecture Diagram (ASCII)

```
┌─────────────────────────────────────────────────────────────────┐
│                     demo/index.html                              │
│  (opens via file:// — no server, no network, MASCOT_ENABLED=true)│
└──────────────┬─────────────────────────┬────────────────────────┘
               │                         │
               ▼                         ▼
┌──────────────────────┐   ┌──────────────────────────────────────┐
│   MascotController   │   │            ChatPanel                  │
│  mascot-controller.js│   │          chat-panel.js                │
│                      │   │                                       │
│ • setVariant()       │   │ • Renders dialog (role="dialog")      │
│ • setState()         │◄──│ • Focus trap / keyboard nav           │
│ • setMessage()       │   │ • textContent-only message render     │
│ • show()/hide()      │   │ • Listens for mascot:open-chat        │
│ • pause()/resume()   │   └───────────────┬───────────────────────┘
│ • destroy()          │                   │
│                      │                   ▼
│ Events dispatched:   │   ┌──────────────────────────────────────┐
│ mascot:open-chat     │   │          MockChatAdapter              │
│ mascot:close-chat    │   │       mock-chat-adapter.js            │
│ mascot:request-help  │   │                                       │
└──────────┬───────────┘   │  Events fired:                        │
           │               │  chat:open, chat:close                │
           ▼               │  chat:listening, chat:thinking        │
┌──────────────────────┐   │  chat:speaking, chat:idle             │
│   SVG Characters     │   │  chat:error, chat:handoff             │
│  mascot-base.svg     │   │  turn:start, turn:thinking            │
│  mascot-web.svg      │   │  turn:response, turn:error            │
└──────────────────────┘   │  request:confirmed                    │
           │               │                                       │
           ▼               │  // ADAPTER BOUNDARY                  │
┌──────────────────────┐   │  // Replace with RealChatAdapter      │
│  CSS Animations      │   └──────────────────────────────────────┘
│  mascot-anim.css     │
│  • 9 states          │   ┌──────────────────────────────────────┐
│  • reduced-motion    │   │           Test Suite                  │
│  • data-paused       │   │  node tests/run-all.js               │
│  • mobile layout     │   │  48 tests / 0 failures               │
└──────────────────────┘   └──────────────────────────────────────┘
           │
           ▼
┌──────────────────────┐
│  src/tokens.css      │
│  (PROVISIONAL brand  │
│   tokens — see note) │
└──────────────────────┘
```

---

## Files Created

```
prototype/
├── README.md                               — How to preview locally
├── RESULTS.md                              — Test results + audit checklist
├── package.json                            — "type":"module" for Node ESM
├── demo/
│   └── index.html                         — Self-contained local demo
├── docs/
│   └── mascot/
│       ├── IMPLEMENTATION_PLAN.md          — This file
│       ├── INTEGRATION_GUIDE.md            — How to wire to real LAVAALL repo
│       └── ASSETS_INVENTORY.md            — Asset sizes, licenses, security scan
├── src/
│   ├── tokens.css                          — CSS custom properties (PROVISIONAL)
│   ├── mascot/
│   │   ├── mascot-base.svg                — Technology robot character
│   │   ├── mascot-web.svg                 — Web/automation robot (orange skin)
│   │   ├── mascot-controller.js           — MascotController ES module
│   │   └── mascot-animations.css          — 9-state keyframe animation system
│   └── chat/
│       ├── mock-chat-adapter.js           — Simulated chatbot adapter
│       ├── chat-panel.js                  — Accessible chat dialog controller
│       └── chat-panel.css                 — Chat panel styles
└── tests/
    ├── run-all.js                          — Test entry point
    ├── mascot-controller.test.js          — 19 MascotController tests
    ├── chat-adapter.test.js               — 14 MockChatAdapter tests
    ├── xss-safety.test.js                 — 7 XSS safety tests
    ├── reduced-motion.test.js             — 7 reduced-motion tests
    └── overlay-collision.test.js          — 9 overlay collision geometry tests
```

---

## Key Decisions

### 1. Both variants are robots (not cat-eared)
The `STATES_AND_BEHAVIOR.md` and concept art (`mascot_two_skins_concept_ONLY.png`) show both Technology and Web variants as the same robot skeleton with different color skins. The "cat ears / tail" option in the original brief was not shown in the approved concept art. This prototype implements the concept-art-aligned robot + color-skin approach. Cat ears can be added as a layer if owner requests it.

### 2. Brand colors — provisional
Four colors come from `PLAN_ORIGINAL.md §4` (citing `MAGNUM.md §3.1`): `#0A0A14`, `#00C2FF`, `#FFE03D`, `#F4F9FF`. The orange accent `#FF6B00` and tech navy `#1B3A6B` are observed from concept art and marked PROVISIONAL. All tokens are in `src/tokens.css` for a single-file correction at integration time.

### 3. SVG loading via fetch with fallback
The controller loads SVGs via `fetch()` from relative paths (works on `file://` in Chrome/Edge; Firefox may require `--allow-file-access-from-files`). A static inline fallback renders a simple robot placeholder if fetch fails. For production integration, SVGs should be inlined at build time.

### 4. No cat-variant skeleton divergence
Both SVGs share identical `id` naming patterns (prefix `tech-` vs `web-`). The animation CSS targets both via grouped selectors. Adding a third variant requires: (a) new SVG with `[variant]-*` IDs, (b) `setVariant()` recognizes the new name, (c) CSS variant theme override.

### 5. Node ESM + mock DOM for tests
MascotController requires a DOM. Tests inject a minimal mock DOM shim. MockChatAdapter uses Node's built-in `EventTarget` (Node 18+) with a compatibility shim for `CustomEvent`. All 48 tests pass without any npm test framework.

### 6. localStorage keys
Three keys stored — all booleans, no PII:
- `lavaall_mascot_hidden`
- `lavaall_mascot_paused`  
- `lavaall_mascot_muted` (reserved for future audio phase)

### 7. Walk state is in-place animation
Per `STATES_AND_BEHAVIOR.md`: "Walking follows a capped region near the hero, and stops on first user interaction." In this prototype, walk plays the arm/leg swing animation in-place (fixed position). Actual positional traversal requires the real page's layout knowledge and is marked as a production integration step.

---

## Known Limitations & Unresolved Issues

1. **SVG loading on `file://`:** Firefox requires `--allow-file-access-from-files` flag or a local server. Chrome and Edge work directly from `file://`.

2. **SVG assets are provisional:** `mascot-base.svg` and `mascot-web.svg` are original geometric compositions for prototyping. They must receive visual owner sign-off before any public release or production use.

3. **Brand token verification pending:** PROVISIONAL tokens in `tokens.css` must be verified against the actual `osman-jalloh-lab/Lavaal-` repo CSS before integration.

4. **No walk path traversal:** Walk animation is in-place only. A bounded lane traversal system requires access to the real page layout (hero section boundaries, scroll position).

5. **Async adapter tests run sequentially:** Some async chat adapter tests (e.g. `send() fires chat:thinking after listening`) require 2–5 second waits. These pass but extend total test runtime to ~15 seconds.

6. **No visual screenshots automated:** The demo must be opened in a browser manually; automated screenshot capture would require a headless browser (Playwright/Puppeteer) not included in this prototype.

7. **Chat panel on `file://` in some browsers:** The `fetch()` call for SVG loading may be blocked by some browsers on `file://`. The fallback SVG renders correctly in all cases.

8. **Dismissal preference is session-scoped in incognito:** `localStorage` is not persisted across incognito sessions. The mascot reappears on each new private window. This is expected browser behavior.

9. **No walk animation on mobile (by design):** Per `STATES_AND_BEHAVIOR.md`, walk is disabled on mobile. Setting `setState('walk')` on mobile still applies the CSS class but the walk-specific animation rules can be suppressed with an additional `@media (max-width: 768px)` override if needed.
