# Exact brand audit before drawing final assets

The website check (2026-11-10) found main site `https://www.lavaall.com/` and division `https://www.lavaall.com/web`; Web currently uses public name **Lava** for its sample assistant. Both are served from one documented repo according to the supplied `PLAN.md`.

**Required Grok checklist**
1. Inspect `MAGNUM.md`, HTML style tags, CSS custom properties, linked CSS, favicon, header/footer logos, SVGs and `/web`'s own site assets.
2. Extract exact colors, typography, radius, shadow, logos, constraints, responsive breakpoints and prohibited use. Report as source paths + actual line numbers.
3. Compare deployed page to source and document differences. Treat source as potentially changed since supplied plan (dated 2026-11-10).
4. Produce token map `--lavaall-technology-*`, `--lavaall-web-*`, `--mascot-*` that references existing CSS variables first.
5. Ask for owner signoff of a single design board showing both *real-source-color* characters before final asset generation.
6. If site brand lacks yellow, do not introduce yellow into the mascot. Do not inherit oranges, blues or yellows from earlier generated examples without checking official assets.

**Do not claim** hex colors in any AI-generated reference are authoritative.
