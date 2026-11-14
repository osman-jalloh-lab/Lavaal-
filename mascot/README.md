# LAVAALL Mascot Prototype (v1.3)

**Status:** standalone prototype in an isolated workspace. No production access, no network calls, no spend.
**Updated:** 2026-11-12 (v1.3, design-kit alignment)

Two original characters, one family ("LAVAALL Companions"):

- **Technology**: compact robot, sky/lime accents, antenna. Label: "Open LAVAALL Assistant".
- **Web**: cat-inspired companion on the same rig (ears, tail, whiskers, collar tag), sand on teal. Label: "Open LAVAALL Web assistant". The Web site's existing assistant **Lava** is not renamed.

## Preview

**No install, double-click:** open `demo/standalone.html`. Every script is inlined, so it works from `file://`.

**Module version** (the source as it would be integrated):

```bash
cd prototype
npm run demo          # http://127.0.0.1:5173/demo/index.html
```

> v1.2's README said `demo/index.html` opens straight from `file://` in Chrome and Edge. It doesn't: Chromium blocks ES-module imports from `file://` (CORS, origin `null`), so the mascot never mounted. v1.3 adds `standalone.html` and `npm run demo`, and a browser test now checks the `file://` path.

## Tests

```bash
npm test               # 141 Node tests (no browser needed)
npm run test:browser   # 67 Playwright/Chromium tests + screenshots in tests/screenshots/
npm run check:assets   # fails if generated files are stale
```

## Editing the characters

Edit only the SVG masters (`src/mascot/mascot-base.svg`, `src/mascot/mascot-web.svg`), then:

```bash
npm run build:assets   # → src/mascot/mascot-svgs.js, assets/static/*.svg, demo/standalone.html
npm run export:icons   # → assets/static/icons/*.png (48/96/192, uses Playwright Chromium)
```

## What's in the demo

| Feature | Where |
|---|---|
| Robot / cat-inspired switch (keeps state and prefs) | Character Variant |
| 9 internal animation states | Animation States |
| Design-kit contract events (OPEN, USER_MESSAGE, HANDOFF …) | Contract events |
| Walking in a bounded lane; stops on any interaction, scroll or focus, or after 8 s | Walk now / Walk if idle |
| Mock chat (canned, no claims, nothing sent) | Open Chat |
| Design board for owner sign-off (posters, icons, sourced palette) | Design board |
| Static `<noscript>` fallback | View with JS disabled |

## Layout

```
prototype/
├── demo/index.html            module demo (npm run demo)
├── demo/standalone.html       GENERATED single-file demo (file://)
├── assets/static/             GENERATED posters + icons/ (PNG 48/96/192)
├── docs/mascot/
│   ├── BRAND_AUDIT_RESULTS.md sourced palette with file:line evidence
│   ├── IMPLEMENTATION_PLAN.md
│   ├── INTEGRATION_GUIDE.md
│   └── ASSETS_INVENTORY.md
├── scripts/                   build-assets, export-icons, serve
├── src/
│   ├── tokens.css             sourced brand tokens
│   ├── mascot/                masters, controller, roamer, animations, generated svgs module
│   └── chat/                  mock adapter + accessible chat panel
├── tests/                     run-all.js (Node) + browser-tests.js (Playwright)
└── RESULTS.md                 test output + audit status
```

## Constraints (unchanged)

- No network calls, paid APIs, microphone or voice. `listen` is labelled "demo only, no mic".
- The mascot never submits anything. Contract events change pose only.
- No PR, Preview or Production work without separate owner approval (`INTEGRATION_LATER.md`).
- Characters and the simplified "V" emblem still need **owner sign-off** (see the design board).
