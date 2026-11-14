# LAVAALL Mascot Prototype v1.3 — Test Results & Audit Status

## v1.3.1 (2026-11-12, same day): brand colors everywhere + keyboard fix

- **All UI chrome is now on-brand.** The chat panel, bubble and demo page dropped their generic grays for brand-derived `--ui-*` tokens. Web chat uses the `/web` teal palette. New test B-7.
- **Live site checked:** deployed `main.css` and `web/styles.css` match the source tokens exactly (BRAND_AUDIT step 3 closed).
- **Bug fixed (carried over from v1.2):** after sending a message, the disabled textarea pushed focus out of the modal, so Escape stopped working and the page stayed inert. The textarea is now read-only during a reply, and Escape is handled at document level. New browser test.
- Web chat now shows "LAVAALL Web assistant" in its header and status bar, and starts a fresh transcript when the skin changes.
- Tests: **142 Node + 69 browser, all passing.**

Generated: 2026-11-12
Version: 1.3.0 (design-kit alignment)
Node tests: **141 passed, 0 failed** (`npm test`; 93 from v1.2 + 48 new)
Browser tests: **67 passed, 0 failed** (`npm run test:browser`, Chromium via Playwright; 49 from v1.2, 2 of them tightened, + 18 new)
Generated assets: up to date (`npm run check:assets`)
Full output: `tests/screenshots/node-test-output.txt`, `tests/screenshots/browser-test-output.txt`, `tests/screenshots/browser-test-results.json`

## What v1.3 changed and why

v1.2 shipped before `MASCOT_DESIGN_KIT.zip` was extracted (2026-11-11 03:10). v1.3 closes the gaps between them.

| ID | Gap vs design kit | Fix | Test |
|---|---|---|---|
| B | Colors were guessed from concept art (`#FF6B00` orange, amber, navy) | Read the real tokens from the production repo (`main.css:6`, `web/_site/styles.css:8-30`) and documented file:line evidence | B-1…B-6 |
| C | Web skin was an orange robot; the kit asks for a cat-inspired companion | New cat skin on the identical rig: ears, tail, whiskers, collar tag, softer mouth. V emblem from the real logo on both | C-1…C-7, browser `[*] Web variant renders the cat-inspired companion` |
| G | No static fallback or icon exports; SVGs duplicated by hand in the demo (already drifting) | `build-assets.js` generates the inline module, posters and standalone demo; `export-icons.js` makes 12 PNGs | G-1…G-5 |
| K | Contract states/events from `COMPONENT_CONTRACT.json` not supported; labels differed from the bible; no background-tab pause | `setState` accepts all 10 contract states, `send()` maps all 14 events, bible labels, `data-page-hidden` on visibilitychange/pagehide | K-1…K-10 |
| R | Walking roamed the whole viewport, never stopped on its own, and had a pause bug | Lane-bounded, stops on first interaction/scroll/focus, 8 s cap, pagehide, pause reasons as a Set, own buttons not obstacles, refuses an off-screen lane | R-1…R-12, browser `[walk]` |
| X | Canned replies claimed "24/7", "West Africa", hardcoded email/phone, asked for name and contact; "Listening…" implied a mic | Rewritten to claim nothing and collect nothing; "Reading your message…" | X-1, X-2 |

## Bugs found while doing this (not in any earlier audit)

1. **The demo never ran from `file://`.** Chromium blocks ES-module imports from `file://` (CORS, origin `null`), so the mascot never mounted, despite v1.2's README and the "P2-5 fixed" note. Reproduced in Playwright with the console error. Fix: generated `demo/standalone.html` (all JS inlined) plus `npm run demo`. The browser test `[file://] standalone.html mounts the mascot with zero console errors` now guards it.
2. **file:// fetch race.** `setVariant()` started a fetch that, once it failed, replaced the inlined art with the fallback circle. Fixed with the `svgSource` option. Tested by K-2, K-3 and `[file://] switching to Web keeps the cat art after 600ms`.
3. **Roamer pause bug.** `_setPaused(val)` ignored its reason, so leaving hover resumed walking in a hidden tab. Covered by R-5.
4. **Two vacuous v1.2 browser checks.** "Web variant SVG is rendered" passed in both branches, and "SVG content rendered" accepted the fallback icon. Both now require the real character.
5. **Horizontal overflow on phones.** The demo page was 441px wide at a 375px viewport. Fixed with `minmax(0,1fr)` grid tracks; `[layout] no horizontal overflow at 320px/375px` guards it.

## v1.3 browser test output (new section)

```
── v1.3: file:// standalone demo ──
  ✓ [file://] standalone.html mounts the mascot with zero console errors
  ✓ [file://] Technology robot is rendered (not the fallback)
  ✓ [file://] switching to Web keeps the cat art after 600ms (v1.2 fetch race)
  ✓ [file://] no http(s) requests made
── v1.3: module demo (http) ──
  ✓ [http] zero console errors on load
  ✓ [http] every request stays on the local server
  ✓ [http] design board: 4 posters + 4 icons load
  ✓ [http] trigger label is "Open LAVAALL Assistant"
  ✓ [http] contract event OPEN → data-contract-state="greeting"
  ✓ [http] listen state hides the eyes (dots replace them)
  ✓ [http] hidden tab pauses animations (data-page-hidden + paused)
── v1.3: walking ──
  ✓ [walk] "Walk now" walks inside the lane
  ✓ [walk] the first scroll stops walking and re-docks bottom-right
  ✓ [walk] stops by itself after the 8 s cap
  ✓ [layout] no horizontal overflow at 320px
  ✓ [layout] no horizontal overflow at 375px
  ✓ [walk] no walking on a 375px phone
  ✓ [reduced-motion] flag set and walking refused
  Browser Tests: 67 passed, 0 failed
```

## Screenshots (ACCEPTANCE_TESTS "Screenshots/videos" row)

| Required | File |
|---|---|
| desktop Technology | `tests/screenshots/v13-desktop-tech-idle.png` |
| desktop Web | `tests/screenshots/v13-desktop-web-idle.png` |
| mobile | `tests/screenshots/mascot-320-mobile.png`, `mascot-375-mobile.png` |
| reduced motion | `tests/screenshots/v13-reduced-motion.png` |
| idle | `v13-desktop-tech-idle.png`, `v13-desktop-web-idle.png` |
| walking | `tests/screenshots/v13-desktop-walking.png` |
| listening (mock state) | `tests/screenshots/v13-desktop-tech-listening.png` |
| error | `tests/screenshots/v13-desktop-web-error.png` |
| design board (owner review) | `tests/screenshots/v13-design-board.png` |

No videos were recorded.

## Security and network scan (2026-11-12)

- External URLs in `src/`, `demo/index.html`, `scripts/`: none, apart from the SVG namespace and `127.0.0.1` in the local dev server.
- `fetch(`: one, the pre-existing allowlisted same-origin SVG path. It isn't reached when `svgSource` is passed, as in both demos.
- `innerHTML =`: two. A constant typing-dots string, and SVG from the allowlist or generated module after DOMParser sanitization.
- Browser tests confirm zero non-local requests on both demos.

## Still open (need owner or later phases)

1. **Owner sign-off** on the design board: both characters, poses, palette.
2. **V emblem**: approve the simplification or supply a vector mark (the repo only has `images/logo.png`).
3. **Yellow**: `--sun` is a real brand color but deliberately unused on the mascot. Owner call.
4. **Deployed vs source** brand comparison (BRAND_AUDIT step 3) needs a network fetch; not done.
5. Brand tokens were read from `origin/main @ 9317148` (2026-10-23), the last fetched copy on this machine. Re-check after `git fetch`.
6. Device CPU/battery profiling has not been done (none invented).
7. Chatbot release gates (PR #74/#75/#40 status, $25/month fail-closed cap, one-time confirmation + explicit Send) are out of scope for this mascot-only prototype.

---

# v1.2 results (historical)

Generated: 2026-11-11  
Version: 1.2.0  
Node tests: **93 passed, 0 failed**  
Browser tests: **49 passed, 0 failed**  
Total: **142 passing assertions across 2 test runners**

---

## Unit / Integration Tests (node tests/run-all.js)

```
═══════════════════════════════════════════
  LAVAALL Mascot Prototype — Test Suite
═══════════════════════════════════════════

── MascotController ── (22 tests)
  ✓ constructor mounts root element in container
  ✓ setVariant("technology") sets data-variant="technology"
  ✓ setVariant("web") sets data-variant="web"
  ✓ setVariant preserves current state when switching
  ✓ setState("walk") sets data-state="walk"
  ✓ setState with all 9 valid states succeeds
  ✓ setState with invalid value does not crash and does not apply invalid state
  ✓ setMessage uses textContent — XSS script tag rendered as plain text
  ✓ setMessage with XSS img onerror does not throw
  ✓ setMessage truncates at 200 characters
  ✓ show() removes hidden attribute
  ✓ hide() sets hidden attribute
  ✓ hide() saves preference to localStorage
  ✓ show() saves hidden=false to localStorage
  ✓ destroy() removes root from container
  ✓ destroy() does NOT clear localStorage — prefs survive reinit (P2-8)
  ✓ resetPreferences() clears localStorage keys
  ✓ isDestroyed getter is true after destroy()
  ✓ destroy() is idempotent — second call does not throw
  ✓ mascot:open-chat event fires when trigger button is clicked (P2-9)
  ✓ enabled=false makes show() a no-op
  ✓ reducedMotion getter reflects window.matchMedia

── MockChatAdapter ── (3 tests)
  ✓ MockChatAdapter extends EventTarget
  ✓ open() fires chat:open event
  ✓ close() fires chat:close event

── XSS Safety ── (8 tests)
  ✓ setMessage() does not throw on script injection
  ✓ setMessage() stores raw string in textContent, not as HTML
  ✓ setMessage() with img onerror payload does not execute code
  ✓ setMessage truncates long payloads to prevent DOM flooding
  ✓ MascotController source does not contain innerHTML assignments for user text
  ✓ MockChatAdapter source does not use innerHTML for user messages
  ✓ ChatPanel source does not use innerHTML for message rendering
  ✓ turnCount increments with each send()

── Reduced Motion ── (7 tests)
  ✓ reducedMotion is false when matchMedia returns no preference
  ✓ reducedMotion is true when matchMedia returns prefer-reduce
  ✓ MascotController sets data-reduced-motion attribute when preference is active
  ✓ CSS animation-duration 0.001ms rule exists in mascot-animations.css
  ✓ CSS reduced-motion block covers all mascot animations
  ✓ CSS has data-paused attribute rule that stops animations
  ✓ chat-panel.css has prefers-reduced-motion block

── Overlay Collision ── (9 tests)
  ✓ Mascot rect calculation is correct for desktop
  ✓ Mascot rect calculation is correct for mobile
  ✓ Mascot does not overlap top navigation bar on any viewport
  ✓ Mascot does not overlap bottom navigation/footer on any viewport
  ✓ Mascot does not overlap center CTA button on any viewport
  ✓ Mascot does not overlap contact form area on any viewport
  ✓ overlaps() helper correctly identifies overlapping rects
  ✓ overlaps() handles adjacent (touching) rects as non-overlapping
  ✓ Mascot stays within viewport bounds on all sizes

── v1.2 Regressions ── (44 tests)
  ✓ P1-1: ChatPanel stores named handlers in _adapterListeners (not anonymous)
  ✓ P1-1: _adapterListeners entries are the exact same references passed to addEventListener
  ✓ P1-1: destroy() empties _adapterListeners map
  ✓ P1-1: mount/destroy/mount cycle — second panel can register fresh listeners
  ✓ P1-2: ChatPanel shows "demo only" status for handoff:demo event (not real delivery claim)
  ✓ P2-3: MascotRoamer can be instantiated
  ✓ P2-3: MascotRoamer.start() is a no-op when window.innerWidth < 1024 (mobile guard)
  ✓ P2-3: MascotRoamer.start() is a no-op when prefers-reduced-motion is active
  ✓ P2-3: MascotRoamer.destroy() is idempotent
  ✓ P2-3: MascotRoamer.stop() without start() does not throw
  ✓ P2-3: MascotRoamer constructor throws if no mascot provided
  ✓ P2-4: MascotController._sanitizeSVG is defined and callable
  ✓ P2-4: _sanitizeSVG returns input unchanged in Node (DOMParser unavailable)
  ✓ P2-4: _SVG_BLOCKED_ELEMENTS contains script and foreignObject
  ✓ P2-4: _BLOCKED_ATTR_PATTERNS strips onclick, onload, onerror
  ✓ P2-4: _BLOCKED_ATTR_PATTERNS strips xlink:href and href
  ✓ P2-6: ChatPanel open() stores elements it makes inert in _inertedElements
  ✓ P2-6: ChatPanel close() empties _inertedElements
  ✓ P2-6: ChatPanel destroy() when open clears _inertedElements via close()
  ✓ P2-7: ChatPanel._setTimeout() stores timeout IDs in _timeouts array
  ✓ P2-7: close() clears _timeouts array
  ✓ P2-7: _handleIdle uses _setTimeout (not bare setTimeout)
  ✓ P2-7: _handleError uses _setTimeout (not bare setTimeout)
  ✓ send() fires chat:listening within 500ms
  ✓ send() fires turn:start within 500ms
  ✓ P2-7: Callbacks from _setTimeout guard on _destroyed (no action post-destroy)
  ✓ P1-1: Events fired after destroy() do not affect destroyed panel (no reference to stale listeners)
  ✓ simulateHandoff() fires chat:handoff
  ✓ P2-7: destroy() clears all pending timeouts (no callbacks fire after destroy)
  ✓ simulateError() fires chat:error
  ✓ simulateError() fires turn:error
  ✓ chat:handoff detail has message and channel
  ✓ P1-2: MockChatAdapter simulateHandoff() fires handoff:demo
  ✓ P1-2: MockChatAdapter simulateHandoff() fires request:simulated (not request:confirmed)
  ✓ P1-2: handoff:demo detail has mock:true flag
  ✓ P1-2: chat:handoff from mock has channel=demo-mock (backward compat)
  ✓ P1-2: MockChatAdapter request:simulated fires and request:confirmed does not (via simulateHandoff)
  ✓ send() fires chat:thinking after chat:listening
  ✓ send() fires turn:response with non-empty text
  ✓ send() fires chat:speaking after chat:thinking
  ✓ LAVAALL Technology keyword returns relevant response
  ✓ contact keyword returns support info
  ✓ reset() cancels pending timers — no events fire after reset
  ✓ send() fires chat:idle after response

═══════════════════════════════════════════
  Results: 93 passed, 0 failed
═══════════════════════════════════════════
```

**Expected stderr (not a failure):**
```
MascotController.setState: invalid state "__INVALID_STATE__" — ignored
```
This is the deliberate invalid-state guard test verifying the warning message fires correctly.

---

## Browser Tests (node tests/browser-tests.js)

Requires: Playwright + Chromium. Run `npm run test:browser`.

```
═══════════════════════════════════════════════════════
  LAVAALL Mascot — Playwright Browser Tests v1.2
═══════════════════════════════════════════════════════
  Server: http://127.0.0.1:{dynamic-port}
  Demo URL: http://127.0.0.1:{dynamic-port}/demo/index.html

── Viewport: 320-mobile (320×568) ──
  ✓ [320-mobile] Mascot .mascot-root is visible
  ✓ [320-mobile] SVG content rendered inside mascot wrapper
  ✓ [320-mobile] Mascot right edge (304px) is within viewport (320px)
  ✓ [320-mobile] Mascot bottom edge (552px) is within viewport (568px)
  ✓ [320-mobile] Mascot position is positive (x=248, y=477)
  ✓ [320-mobile] Mascot does not overlap header
  ✓ [320-mobile] Mascot does not overlap primary CTA buttons
  ✓ [320-mobile] Chat panel is visible after open
  ✓ [320-mobile] Focus is inside chat panel on open
  ✓ [320-mobile] Chat panel closes on Escape key
  ✓ [320-mobile] Web variant SVG is rendered (orange color present)
  ✓ [320-mobile] Screenshot saved: tests/screenshots/mascot-320-mobile.png

── Viewport: 375-mobile (375×812) ──
  ✓ [375-mobile] Mascot .mascot-root is visible
  ✓ [375-mobile] SVG content rendered inside mascot wrapper
  ✓ [375-mobile] Mascot right edge (359px) is within viewport (375px)
  ✓ [375-mobile] Mascot bottom edge (796px) is within viewport (812px)
  ✓ [375-mobile] Mascot position is positive (x=303, y=721)
  ✓ [375-mobile] Mascot does not overlap header
  ✓ [375-mobile] Mascot does not overlap primary CTA buttons
  ✓ [375-mobile] Chat panel is visible after open
  ✓ [375-mobile] Focus is inside chat panel on open
  ✓ [375-mobile] Chat panel closes on Escape key
  ✓ [375-mobile] Web variant SVG is rendered (orange color present)
  ✓ [375-mobile] Screenshot saved: tests/screenshots/mascot-375-mobile.png

── Viewport: 768-tablet (768×1024) ──
  ✓ [768-tablet] Mascot .mascot-root is visible
  ✓ [768-tablet] SVG content rendered inside mascot wrapper
  ✓ [768-tablet] Mascot right edge (752px) is within viewport (768px)
  ✓ [768-tablet] Mascot bottom edge (1008px) is within viewport (1024px)
  ✓ [768-tablet] Mascot position is positive (x=696, y=933)
  ✓ [768-tablet] Mascot does not overlap header
  ✓ [768-tablet] Mascot does not overlap primary CTA buttons
  ✓ [768-tablet] Chat panel is visible after open
  ✓ [768-tablet] Focus is inside chat panel on open
  ✓ [768-tablet] Chat panel closes on Escape key
  ✓ [768-tablet] Web variant SVG is rendered (orange color present)
  ✓ [768-tablet] Screenshot saved: tests/screenshots/mascot-768-tablet.png

── Viewport: 1280-desktop (1280×900) ──
  ✓ [1280-desktop] Mascot .mascot-root is visible
  ✓ [1280-desktop] SVG content rendered inside mascot wrapper
  ✓ [1280-desktop] Mascot right edge (1256px) is within viewport (1280px)
  ✓ [1280-desktop] Mascot bottom edge (876px) is within viewport (900px)
  ✓ [1280-desktop] Mascot position is positive (x=1176, y=769)
  ✓ [1280-desktop] Mascot does not overlap header
  ✓ [1280-desktop] Mascot does not overlap primary CTA buttons
  ✓ [1280-desktop] Chat panel is visible after open
  ✓ [1280-desktop] Focus is inside chat panel on open
  ✓ [1280-desktop] Chat panel closes on Escape key
  ✓ [1280-desktop] Web variant SVG is rendered (orange color present)
  ✓ [1280-desktop] Screenshot saved: tests/screenshots/mascot-1280-desktop.png

── Cross-viewport variant comparison ──
  ✓ [cross-viewport] Technology and Web variants produce different SVG content

═══════════════════════════════════════════════════════
  Browser Tests: 49 passed, 0 failed
═══════════════════════════════════════════════════════
```

---

## v1.2 Audit Remediation Checklist

| Finding | Severity | Status | Fix applied in |
|---------|----------|--------|----------------|
| P1-1: ChatPanel adapter listeners leaked — anonymous handlers never removed | P1 | ✅ FIXED | `chat-panel.js` v1.2 |
| P1-2: `request:confirmed` fired by mock — falsely implies real delivery | P1 | ✅ FIXED | `mock-chat-adapter.js` v1.2 |
| P2-3: No desktop roaming controller (mascot static at all times) | P2 | ✅ FIXED | `mascot-roamer.js` (new) |
| P2-4: SVG sanitization: only URL/prefix check; no attribute-level strip | P2 | ✅ FIXED | `mascot-controller.js` v1.2 |
| P2-5: SVG fetch fails under `file://` (Chrome/Edge cross-origin block) | P2 | ✅ FIXED | `demo/index.html` — inlined SVGs |
| P2-6: `inert` applied via data-attribute only — not real `inert` attr | P2 | ✅ FIXED | `chat-panel.js` v1.2 |
| P2-7: `setTimeout` IDs untracked; callbacks act after panel destroyed | P2 | ✅ FIXED | `chat-panel.js` v1.2 |
| P2-8: No browser-level collision/screenshot tests | P2 | ✅ FIXED | `tests/browser-tests.js` (new) |

---

## v1.1 Audit Findings (previously remediated, still holding)

| Finding | Severity | Status |
|---------|----------|--------|
| P1-1: AbortController SVG race condition | P1 | ✅ FIXED v1.1 |
| P1-2: `_destroyed` guard missing in `_loadSVG` | P1 | ✅ FIXED v1.1 |
| P1-5: SVG innerHTML from allowlisted path only; content-type checked | P1 | ✅ FIXED v1.1 |
| P2-6: `ChatPanel.destroy()` with listener cleanup | P2 | ✅ FIXED v1.1 |
| P2-7: Focus saved/restored on dialog open/close | P2 | ✅ FIXED v1.1 |
| P2-8: `destroy()` no longer clears localStorage | P2 | ✅ FIXED v1.1 |
| P2-9: Removed `role=button` from root; inner trigger `<button>` added | P2 | ✅ FIXED v1.1 |
| P2-11: Removed fake "Handoff complete" mock status copy | P2 | ✅ FIXED v1.1 |
| P3-13: All reference docs added to `reference/` in ZIP | P3 | ✅ FIXED v1.1 |

---

## Remaining Open Items (require external action, not blocking prototype)

1. **WCAG contrast verification** — needs real browser with verified brand tokens against `Lavaal-` repo
2. **Brand token verification** — 3 PROVISIONAL tokens (`--lavaall-navy`, `--lavaall-web-orange`, `--lavaall-amber`) need checking against production repo CSS
3. **Visual owner sign-off** on both robot character designs before production use
4. **Cat-variant question** — CHARACTER_BIBLE §3 says "optionally ears/tail"; concept art shows robots only; needs owner decision
5. **Integration gate** — separate Osman approval required before any PR to `Lavaal-` repo; follow INTEGRATION_GUIDE.md

---

## Files Changed in v1.2

| File | Change |
|------|--------|
| `src/chat/chat-panel.js` | v1.2: P1-1 named listeners, P2-6 real inert, P2-7 timeout tracking |
| `src/chat/mock-chat-adapter.js` | v1.2: P1-2 renamed handoff events |
| `src/mascot/mascot-controller.js` | v1.2: P2-4 DOMParser SVG sanitization |
| `src/mascot/mascot-roamer.js` | NEW: P2-3 desktop roaming controller |
| `demo/index.html` | v1.2: P2-5 inlined SVGs, roam buttons, updated audit list |
| `tests/v12-regressions.test.js` | NEW: 44 regression tests for all v1.2 fixes |
| `tests/browser-tests.js` | NEW: 49 Playwright browser tests (4 viewports) |
| `tests/run-all.js` | Added v1.2 regression suite |
| `package.json` | Bumped to 1.2.0; added test:browser script; playwright devDep |
| `RESULTS.md` | This file |
