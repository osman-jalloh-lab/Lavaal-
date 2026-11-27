---
name: astryx-design-system
description: >-
  Use when building or redesigning internal LAVAALL tools such as /ops and the
  Needs You dashboard UI with Meta's Astryx design system (React 19 components,
  theming, CLI, MCP docs), from any builder: desks, Codex, Cursor, or Claude.
  Not for the public lavaall.com site, which keeps MAGNUM brand fonts and
  colours.
---
# Astryx design system (internal tools only)

## Who can use it
Approved by Osman on 9 Nov 2026 for **every LAVAALL desk and every builder: Codex CLI, Cursor (IDE and cloud agents), and Claude (Claude Code, Claude Desktop, Anthropic API runs)**. When you hand a build to any of them, include this skill (or its key sections) in the brief; external builders do not load box skills automatically.

## When to use
- Building or polishing **internal** LAVAALL UI: `/ops`, the Needs You dashboard, and similar private tools.
- Any builder (Codex, Cursor, Claude) needs the official package names, theming method, CLI, or MCP pointers before writing Astryx UI.

## When not to use
- **Not for the public lavaall.com site.** That site keeps the MAGNUM brand (fonts, colours, voice). Do not restyle or rebuild marketing pages with Astryx.
- This skill is not permission to install packages into a repo, open a branch, merge, or deploy. Those stay behind founder approval and the usual build rules (isolated feature branch, draft PR, HANDOFF.md, no merge/deploy without Osman). Claude runs are paid and need Osman's OK with cost first; default builder is Codex on his subscription.

## What it is
Astryx is Meta's open-source design system (still marked **Beta**). Official sources:

- Repo: [meta/astryx](https://github.com/meta/astryx) (`facebook/astryx` redirects here). Official Meta GitHub org (`meta`, created 2 Apr 2009). MIT licence. Docs: [astryx.atmeta.com](https://astryx.atmeta.com).
- Built on **React 19+** and StyleX. Consumers import pre-built CSS and typed React components; no StyleX build plugin needed on the pre-built CSS path.
- 150+ accessible components, brand-level theming, dark mode, page templates, and a CLI built for people and coding agents.
- Meta says it powers 13,000+ internal Meta apps. Vendor context, not a LAVAALL claim.

Box copy (read-only, sparse, do not install or run): `/home/box/agent-data/projects/lavaall/research/astryx` at commit `b6b0c68ad570ca85c8028aa1d4e416ac76453023` (main, checked 9 Nov 2026). See `LAVAALL-FETCH.md` there. Never copy that tree to Osman's laptop.

## Verified package names
From the official README and `package.json` files at the commit above (version **0.7.12** unless noted). Always use the **scoped** names.

| Package | Role |
|---|---|
| `@astryxdesign/core` | Components, theme system, utilities. Peer: `react` and `react-dom` >= 19, plus `@stylexjs/stylex`. |
| `@astryxdesign/cli` | Dev CLI: component docs, templates, themes, swizzle, init, upgrade, `manifest --json`. |
| `@astryxdesign/theme-neutral` | Default starter theme (muted, Lucide icons). |
| `@astryxdesign/theme-butter`, `theme-chocolate`, `theme-matcha`, `theme-stone`, `theme-gothic`, `theme-y2k` | Other published ready-made themes. |
| `@astryxdesign/build` | Build plugins for StyleX **source** builds (not needed for pre-built CSS). |
| `@astryxdesign/richtext` | Published at 0.7.12; not in the README packages table. |

Not a stable public install: `@astryxdesign/lab`, `theme-probe`, `native` (all `private: true`); `@astryxdesign/vega` and `@astryxdesign/charts` (`@canary` only). Do not depend on them.

**Name clash:** the unscoped npm package `astryx` is **unrelated**. Use `npx @astryxdesign/cli ...`, never `npx astryx`.

Documented install (only inside an approved build branch):

```bash
npm install @astryxdesign/core @astryxdesign/theme-neutral @stylexjs/stylex
npm install -D @astryxdesign/cli
```

No global installs (`npm i -g`) on the shared box or Osman's machines without a separate founder OK.

## How a builder should use it (when a React 19 project exists)

Follow the official [@astryxdesign/core README](https://github.com/meta/astryx/blob/main/packages/core/README.md) and [Getting Started](https://astryx.atmeta.com/docs/getting-started):

1. **CSS imports, in order:** `@astryxdesign/core/reset.css`, `@astryxdesign/core/astryx.css`, then the theme file (e.g. `@astryxdesign/theme-neutral/theme.css`).
2. **Components:** import from scoped paths, e.g. `import {Button} from '@astryxdesign/core/Button'`. Look up props with the CLI or MCP rather than inventing them: `npx @astryxdesign/cli component Button` or `component --list`.
3. **Theming to match LAVAALL's light /ops look:** a theme is CSS custom property overrides plus a React `Theme` provider (e.g. `Theme` from `@astryxdesign/core/theme` wrapping `neutralTheme` from `@astryxdesign/theme-neutral/built`). Guides: `npx @astryxdesign/cli docs theme` and `docs tokens`. Prefer token overrides over forking components.
4. **Swizzle** only when tokens aren't enough: `npx @astryxdesign/cli swizzle <Component>`. Review the diff; never swizzle the whole library.
5. **Templates:** `npx @astryxdesign/cli template --list`, then `template <name>`; wrap in app chrome.
6. **Agent docs inside an Astryx project:** `npx @astryxdesign/cli init --features agents` with `--agent codex` (AGENTS.md) or the matching option for Cursor/Claude per the CLI help (`npx @astryxdesign/cli init --help`). Review what it writes before any agent loads it; `init --remove-agents` removes it.
7. **CLI script** once installed: add `"astryx": "node node_modules/@astryxdesign/cli/clients/cli/bin/astryx.mjs"` to `package.json` scripts; `npx @astryxdesign/cli manifest --json` lists commands.

A no-bundler **CDN / import-map** path exists (`npx @astryxdesign/cli template --cdn`). It still needs React 19 ESM. Pin versions.

### Current LAVAALL stack (read before proposing code)
`/ops` and `/os` in `osman-jalloh-lab/Lavaal-` are **vanilla** server-rendered HTML/CSS (`api/ops/_html.js`, `_shell.js`, `_pages.js`, `_needs_you.js`; `/os` vanilla JS client under `api/os/_client/`). **No root `package.json`, no React.** Draft PR #73 stays in that stack. Astryx is **not a drop-in**: adopting it means adding React 19 plus a bundler (or CDN ESM) in a separate isolated draft PR, mock-only, flag off.

## Connecting each builder to Astryx docs (MCP)

Official guide: [Working with AI](https://astryx.atmeta.com/docs/working-with-ai). Astryx runs a **remote** docs MCP server at `https://astryx.atmeta.com/mcp` (Streamable HTTP; tools `search(query)` and `get(name)` for components, doc topics, templates). It is read-only docs; no keys, no secrets. Osman approved connecting it for Codex, Cursor, and Claude on 9 Nov 2026.

**Cursor** (IDE or repo-level `.cursor/mcp.json`; remote servers take no `type` field):

```json
{
  "mcpServers": {
    "astryx": { "url": "https://astryx.atmeta.com/mcp" }
  }
}
```

For Cursor cloud agents, put the same block in the build branch's `.cursor/mcp.json` (never on `main` directly) and mention this skill in the agent prompt.

**Claude Code:** `claude mcp add --transport http astryx https://astryx.atmeta.com/mcp`
**Claude Desktop:** Settings, add a custom connector with the URL `https://astryx.atmeta.com/mcp`.
**Codex CLI:** add a remote MCP entry for the same URL in Codex's MCP config per the Codex docs, or use the CLI path (`npx @astryxdesign/cli ...`) which needs no MCP.

If an MCP connection isn't available, every builder can fall back to the CLI commands above or read the docs site directly.

## Beta caveat
APIs, CSS, and the MCP surface can change. Pin versions in any approved project and re-read the docs at the installed version.

## Sourcing verdict (Part E, 9 Nov 2026)
**Pass: official vendor repo.** Official Meta org, MIT, npm install path (no ZIP/release downloads), no `.bat/.cmd/.exe/.dll/.ps1/.vbs/.scr/.msi/.lnk` at `b6b0c68`; largest `.txt` is a readable CLI fixture. Shallow sparse clone on the box only; nothing run; nothing copied to the laptop. Recorded in `projects/lavaall/repos-for-skills/2026-10-03-repo-skill-requests.md`.
