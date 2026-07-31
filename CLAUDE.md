# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository overview

LAVAALL is a single-page marketing/lead-gen site for a B2B enterprise IT hardware & installation company operating in Sierra Leone, Guinea, and West Africa. It is a static site with one serverless function, deployed on Netlify. There is no build system, no package manager, and no test suite — the entire front end is one HTML file.

Files:
- `index.html` — the entire site: all CSS (in a single `<style>` block) and all JS (in a single `<script>` block at the end of `<body>`) live in this one ~1,100-line file. There is no separate CSS/JS bundle and no templating.
- `netlify/functions/submit-form.js` — a Netlify serverless function that validates/sanitizes/rate-limits quote-request submissions. **Note:** the front-end form does not currently call this function (see "Known gotchas" below); it's presently dead code from the client's perspective.
- `netlify.toml` — Netlify build config: publish directory (`.`), security headers (CSP, HSTS, X-Frame-Options, etc.) applied to all routes, `/api/*` → `netlify/functions/:splat` redirect, static asset caching rules.

## Development workflow

There is no `package.json`, no bundler, and no test runner in this repo.

- **Preview locally:** open `index.html` directly in a browser, or serve the directory with any static file server (e.g. `python3 -m http.server`) for correct relative-path/fetch behavior.
- **Preview with Netlify features (forms, functions, headers):** use the Netlify CLI (`netlify dev`) from the repo root — it reads `netlify.toml` and serves `netlify/functions/*`.
- **No lint/build/test commands exist.** When making changes, manually verify in a browser: check both language toggles (EN/FR), form submission, product filters, and the country picker.
- Deployment is via Netlify's Git integration (`[build] publish = "."`), so anything pushed to the connected branch goes live as-is — there is no CI gate.

## Architecture

### Single-file structure
`index.html` is organized top-to-bottom as: `<head>` (meta/CSP/fonts/DOMPurify) → `<style>` (all CSS, using CSS custom properties in `:root` for the color palette: `--sun`, `--sky`, `--lime`, `--coral`, `--ink`, etc.) → page markup (`<nav>`, sections, `<footer>`) → `<script>` (all behavior). When editing, search within this one file rather than expecting separate assets.

### Page sections (in DOM order)
`nav` → `#home` (hero) → ticker → brands strip → `#services` → stats → `#products` → `#coverage` → industries → `#signup` (quote form) → `footer`.

### i18n system
- Translatable elements are marked with `data-i18n="key"` (innerHTML content) or `data-i18n-ph="key"` (placeholder text).
- All copy lives in the `translations` object (`en` / `fr`) near the bottom of the `<script>` block, keyed by short dotted names (`hero.h1`, `srv1.p`, `p3.h3`, `ft.copy`, etc.).
- `setLang(l)` swaps `currentLang`, updates the active language pill, and repopulates every `[data-i18n]`/`[data-i18n-ph]` element from the `translations` table, running HTML content through `DOMPurify.sanitize()`.
- **When adding new UI copy:** add the string to the DOM with a `data-i18n`/`data-i18n-ph` attribute, then add matching keys to *both* `translations.en` and `translations.fr`.

### Known gotchas
- **French translations are incomplete.** The `translations.fr` object (and much of `translations.en`) in the current `<script>` only contains a handful of `nav.*` keys, followed by a `// ... include all other translations from original file` comment — the bulk of the original EN/FR copy was lost in a prior edit. Most `data-i18n` elements will currently fall back to their hardcoded English HTML (since `setLang` only overwrites keys that exist in `translations[l]`). If asked to fix i18n, this is the place to restore full key coverage for both languages.
- **The quote form never calls the Netlify function.** `netlify/functions/submit-form.js` implements server-side validation/rate-limiting/CSRF/honeypot logic, and `netlify.toml` proxies `/api/*` to it, but the form (`#sform`) is a native Netlify Forms form (`data-netlify="true"`) and its JS handler (`SecureFormHandler`) submits via `fetch('/', ...)` — the Netlify Forms ingestion endpoint, not `/api/submit-form`. The two validation implementations (client `SecurityUtils` in `index.html` and server `Sanitizer` in `submit-form.js`) are near-duplicates that have drifted independently — keep this in mind before "fixing" one without checking the other, and confirm with the user which submission path is actually intended before wiring them together.
- **Security headers are defined in two places** and must be kept consistent: the CSP `<meta>` tag in `index.html`'s `<head>` and the `[[headers]]` block in `netlify.toml`. The meta tag cannot set `X-Frame-Options`/`frame-ancestors`, which is handled solely by `netlify.toml`.
- **DOMPurify is loaded from a CDN with a pinned SRI hash** (`integrity="sha384-..."` on the `<script src="https://cdn.jsdelivr.net/npm/dompurify@3.0.6/...">` tag). If the DOMPurify version is ever bumped, the `integrity` hash and the `script-src`/CSP allowlist must be updated together, or the script will silently fail to load (breaking `setLang`'s sanitized HTML path, which falls back to `textContent`).

### Client-side behavior map (all in the bottom `<script>` block)
- `SecurityUtils` — client-side input sanitization/validation helpers (text, email, phone, message, CSRF token generation).
- `RateLimiter` — client-side submission cooldown using `localStorage`.
- `SecureFormHandler` — wires up `#sform`: honeypot check, native HTML5 validation, rate limiting, sanitization, then `fetch`-based submission.
- `buildTicker()` — populates the scrolling brand/category ticker.
- `covData` / `pickCountry()` — country-coverage data and the click handler that updates `#cnote` using safe DOM methods (not `innerHTML`) to avoid XSS.
- `filterHw(brand)` — product grid category filter (`all`/`routers`/`servers`/`computers`/`fiber`), matched against each `.hw-item`'s class list.
- Order dropdowns (`.dd-togg` handler) — builds a per-product contact dropdown (WhatsApp/Telegram/Messenger/Email) with links generated from each button's `data-name` attribute.
- `IntersectionObserver` (`.reveal`/`.reveal-l`/`.reveal-r`) — scroll-triggered fade/slide-in animations.

### Adding a product
Products live inline in the `#products` grid (`.prod-card.hw-item`). Each card needs: a category class (`routers`/`servers`/`computers`/`fiber`) for `filterHw`, a `data-name` attribute (used to build WhatsApp/Telegram/email quote links), and `data-i18n` keys for its heading/description (added to `translations`).

### Adding a coverage country
Add an entry to `covData` (flag + `en`/`fr` name/text) and a corresponding `.ctry[data-code]` element in the `#coverage` markup calling `pickCountry(this, 'code')`.
