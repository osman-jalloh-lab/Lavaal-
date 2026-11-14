# LAVAALL Mascot Prototype — Integration Guide

**Read first:** `instructions/INTEGRATION_LATER.md` — integration requires a **separate approval gate**.  
**This guide is for planning only.** Do not proceed until Osman explicitly approves integration.

---

## Phase 0 — Pre-Conditions (all required before any integration work)

- [ ] Standalone prototype passes independent audit (see `RESULTS.md`)
- [ ] Visual owner sign-off on both mascot variants (design board review)
- [ ] Brand tokens verified against actual repo source files (see `ASSETS_INVENTORY.md`)
- [ ] Osman explicitly approves integration (`INTEGRATION_LATER.md` gate)

---

## Phase 1 — Repository Setup

```bash
# Clone the real LAVAALL repo into a separate checkout
git clone https://github.com/osman-jalloh-lab/Lavaal- Lavaal-mascot-integration
cd Lavaal-mascot-integration

# Create feature branch from a reviewed, current base
git checkout origin/main -b feature/lavaall-mascot

# Verify you are NOT on main
git branch
```

---

## Phase 2 — Token Verification

> **v1.3:** done against `origin/main @ 9317148` (2026-10-23). See `BRAND_AUDIT_RESULTS.md`. At integration time, `git fetch` and re-run the checks below. If `assets/css/main.css:6` or `api/web/_site/styles.css:8-30` changed, update `src/tokens.css` **and** the two SVG masters, then `npm run build:assets`. Test B-1/B-2 lists the allowed colors.

> **v1.3 integration notes:**
> - Pass `svgSource: MASCOT_SVGS` (from `mascot-svgs.js`) so no SVG fetch happens, or serve the two masters same-origin and omit it.
> - Pick the skin from the trusted route (`/` → technology, `/web` → web), never from query or user input (COMPONENT_CONTRACT `routeThemes`).
> - A real adapter should drive the mascot with `mascot.send('USER_MESSAGE' | 'ASSISTANT_START' | ...)`. `send()` only changes pose; consent, Send, delivery and spend gates stay in the backend.
> - Give the roamer a real non-interactive hero area as `lane`, or don't start it. Prefer `startWhenIdle()` over `start()`.

Before copying any file, read actual CSS from the repo:

```bash
# Extract brand colors from main index.html
grep -n "var(--\|#[0-9a-fA-F]" index.html | head -40

# Check MAGNUM.md for token definitions
cat MAGNUM.md | grep -A 20 "tokens\|colors\|--sun\|--sky\|--ink"

# Check web variant styles
cat api/web/_site/index.html | grep "var(--\|#[0-9a-fA-F]" | head -40
```

Update `src/tokens.css` PROVISIONAL values with verified hex values.  
Get owner sign-off on a design board before proceeding.

---

## Phase 3 — File Integration

Copy **only** the audited runtime assets (not demo scripts, not test files):

```
From prototype/src/          →  Into assets/mascot/ (create if not present)
─────────────────────────────────────────────────────────────────────────────
src/tokens.css               →  assets/mascot/tokens.css
src/mascot/mascot-base.svg   →  assets/mascot/technology/idle.svg
src/mascot/mascot-web.svg    →  assets/mascot/web/idle.svg
src/mascot/mascot-controller.js  →  assets/js/lavaall-mascot-controller.js
src/mascot/mascot-animations.css →  assets/css/lavaall-mascot.css
src/chat/mock-chat-adapter.js    →  assets/js/lavaall-mascot-adapter-mock.js
src/chat/chat-panel.js           →  assets/js/lavaall-mascot-chat.js
src/chat/chat-panel.css          →  assets/css/lavaall-mascot-chat.css
src/mascot/mascot-roamer.js      →  assets/js/lavaall-mascot-roamer.js        (v1.3)
src/mascot/mascot-svgs.js        →  assets/js/lavaall-mascot-svgs.js          (v1.3, generated)
assets/static/*.svg, icons/*.png →  assets/mascot/static/                     (v1.3, posters/fallback)
```

**Do not copy:**
- `demo/index.html` (demo-only page)
- `tests/` directory
- `docs/` directory

---

## Phase 4 — Feature Flag

The mascot must default **OFF** in production. The existing LAVAALL repo uses Vercel  
environment variables. Add to `.env.example`:

```
# Mascot feature flag — default OFF
# Set to "true" only on Preview after Osman approves
PUBLIC_MASCOT_ENABLED=
```

In the page script:

```html
<script type="module">
  // Feature flag — reads from Vercel env via meta tag or window global
  // In production, this defaults to false unless flag is explicitly set
  const MASCOT_ENABLED = (window.__LAVAALL_FLAGS && window.__LAVAALL_FLAGS.mascot === true);

  if (MASCOT_ENABLED) {
    const { MascotController } = await import('/assets/js/lavaall-mascot-controller.js');
    // ... mount mascot
  }
</script>
```

---

## Phase 5 — Page Insertion

Insert the mascot mount point in `index.html` **outside** all nav, forms, and CTAs:

```html
<!-- Mascot widget — placed just before </body>, outside all interactive elements -->
<div id="lavaall-mascot" aria-label="LAVAALL Assistant widget"></div>

<!-- Mascot CSS — load in <head> -->
<link rel="stylesheet" href="/assets/mascot/tokens.css"/>
<link rel="stylesheet" href="/assets/css/lavaall-mascot.css"/>
<link rel="stylesheet" href="/assets/css/lavaall-mascot-chat.css"/>
```

For LAVAALL Technology (`/`): `setVariant('technology')`  
For LAVAALL Web (`/web`): `setVariant('web')`

---

## Phase 6 — Adapter Boundary (ADAPTER BOUNDARY)

The `MockChatAdapter` must be replaced with a `RealChatAdapter` that fires the same events.

The interface contract:

```javascript
// RealChatAdapter — must implement this interface
class RealChatAdapter extends EventTarget {
  send(userText)    // trigger a real chatbot turn
  open()            // fire chat:open
  close()           // fire chat:close, cancel pending ops
  reset()           // cancel all pending operations

  // Events this adapter must fire:
  // chat:open, chat:close, chat:listening, chat:thinking,
  // chat:speaking, chat:idle, chat:error, chat:handoff
  // turn:start, turn:thinking, turn:response, turn:error
  // request:confirmed
}
```

The `ChatPanel` and `MascotController` listen for these events only.  
They do not care whether the adapter is mock or real.

**SECURITY:** The adapter must never directly call `api/contact` or `api/web/inquiry`.  
Only the separately secured chatbot workflow (server-generated one-time proof +  
explicit user Send control + server-side verification) may trigger form submission.  
See `ARCHITECTURE.md` and `PLAN_ORIGINAL.md §3` for the correct submission path.

---

## Phase 7 — Verification (before any PR)

Run all required checks per `ACCEPTANCE_TESTS.md`:

```bash
# Verify no external network domains added
grep -rn "https://" assets/mascot/ assets/js/lavaall-mascot* assets/css/lavaall-mascot*

# Verify no innerHTML for user content
grep -n "innerHTML" assets/js/lavaall-mascot-controller.js

# Run prototype tests (from prototype/ dir)
node tests/run-all.js

# Check responsive widths (manual or Playwright):
# 320px, 375px, 768px, desktop

# Check accessibility:
# - WCAG contrast with verified brand tokens
# - Screen reader test (NVDA/JAWS on Windows, VoiceOver on Mac)
# - Keyboard navigation: Tab → mascot focused → Enter → chat opens
# - Escape → chat closes → focus returns
# - prefers-reduced-motion active → no animation

# Check overlay (manual):
# - Mascot does not cover inquiry form #iq-form
# - Mascot does not cover #web-inquiry form
# - Mascot does not cover footer links
# - Mascot does not cover nav links
```

---

## Phase 8 — Draft PR

Only after Osman approves, create a **draft PR**:

```bash
git push origin feature/lavaall-mascot

# Create PR via GitHub UI — mark as DRAFT
# Title: "feat: LAVAALL mascot widget (feature flag OFF, mock adapter)"
# Body: reference this guide, RESULTS.md, and AUDIT_CHECKLIST.md
```

**Do NOT:**
- Merge to `main`
- Enable on Production
- Set `PUBLIC_MASCOT_ENABLED=true` on Production Vercel
- Touch `api/contact.js` or `api/web/_lib/inquiry.js` in this PR
- Wire any real chatbot API (PR #74/#75) without separate review

---

## Phase 9 — Future: Real Chatbot Wiring

When `api/chat.js` (the real chatbot API) is built and its safety gates have passed:

1. Implement `RealChatAdapter` that calls `POST /api/chat`
2. Wire `chat:handoff` to trigger `POST /api/contact` (existing path) via the  
   `prepareInquiry` + one-time-proof + explicit Send flow
3. Update `privacy.html` to disclose chat data collection before any production flag-on
4. Get Osman's L3 approval for Production `AI_GATEWAY_API_KEY` and flag-on
5. Run full regression: accessibility, performance, security, mobile

See `PLAN_ORIGINAL.md §3` for the complete inquiry submission flow.
