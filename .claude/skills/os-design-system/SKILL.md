---
name: os-design-system
description: Build or restyle any LAVAALL OS screen in the house look (calm agentic-OS shell, tokens, elevation, small-caps captions, agent identity colours, designed wait states). Use when adding a page or component to /os, or when Osman says a screen "doesn't match" or "looks off".
---

# OS design system

The source of truth is `docs/design/DESIGN.md`. The code lives at the end of `api/os/_client/os.css` in the "Design system v2" block. Read both before writing any styles.

## Steps
1. **Tokens only.** Use `--bg --panel --hover --line --edge --text --muted --cap --accent --accent-ink --accent-soft --ok --warn --bad`, `--elev-0..3`, `--r-sm --r-ctl --r-card --r-lg`. If you need a new value, add a token to DESIGN.md and os.css first.
2. **Surfaces.** The page and sidebar share `--bg`. Cards use `--panel` plus `box-shadow: var(--elev-1)` and no border. Hover goes up to `--elev-2`. Menus and dialogs use `--elev-3`.
3. **Page header.** Use `.ph`: an `h1` title, one muted `p`, actions in `.r`. The rule under it comes from the system.
4. **Labels.** Section and stat labels are captions: 10.5px, uppercase, 0.09em, weight 600, `--cap`. Values are tabular.
5. **Agents.** Any element about one agent gets `data-agent="grok|deepseek|codex|codex-chat|claude-sonnet|claude-opus"` and reads `var(--ag)` for a wash (`color-mix(in srgb, var(--ag) 10-14%, transparent)`), a small square or the agent name. Never use it as a full fill.
6. **Selected state.** Use the accent wash (`--accent-soft`) with `--accent-ink` text. Never a side bar or bold.
7. **Waiting.** Show a shimmer in the agent colour (see `.px-step.s-running::after`), never a spinner. Guard it with `prefers-reduced-motion`.
8. **Motion.** 180 to 260ms with `--ease-out`. Animate transform and opacity only.
9. **Check.** Run the dev server (`OS_DEV_BYPASS=1 PORT=3200 node scripts/os-dev-server.js`) and take Playwright screenshots at 1440x900 and 390x844 in dark and light. Measure the contrast of any new text colour (4.5:1 for text, 3:1 for edges). Run `node tests/run-safe-suite.js`.

## Don'ts
- No new fonts, no gradients behind text, no second accent.
- No borders and shadows together on the same card.
- Don't copy another product's colours, logo or wording. Borrow only the patterns.
