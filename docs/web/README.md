# LAVAALL Web — front end in the umbrella (hidden, OFF on Production)

Status: local branch `web/umbrella-integration` (from `origin/main` f072d70, the same base as
`starlink/v4-backend-test`). Not pushed, not deployed, not linked from lavaall.com.

## What it is
A copy of Osman's LAVAALL Web front end (websites + AI automation for restaurants, hotels,
shops and marketers in Sierra Leone, Guinea and Liberia). Source: `OneDrive\Desktop\web building bz`,
left untouched. Plain static HTML/CSS/JS, no framework, **no backend** (the inquiry form shows
"Preview only: this form is not connected yet, so nothing was sent.").

## Where it lives (same pattern as Starlink)
| Path | What |
|---|---|
| `api/web/index.js` | The one serverless function: serves the page and its files. |
| `api/web/_lib/flag.js` | On/off switch (same rule as `api/starlink/_lib/flag.js`). |
| `api/web/_site/` | The whole OneDrive folder, layout kept (`index.html`, `styles.css`, `app.js`, `content/`, `sections/`, `templates/`, `showcase/`, `videos/`, `assets/`, `qa/`, `tools/`, plan docs). Underscore folder: not a route, only served through the function. |
| `docs/web/WEB-SOURCE.md` | SHA-256 manifest of the OneDrive snapshot + the integration edits. |
| `scripts/web/dev-server.js` | Local runner: umbrella static site + `/web` (+ `/starlink` when that branch is merged). |
| `tests/test-web.js` | Tests (`node tests/test-web.js`). |
| `vercel.json` | `/web` rewrites, `includeFiles` for `_site`, `X-Frame-Options: SAMEORIGIN` for `/web/*`. |
| `.vercelignore` | Keeps these docs, the dev runner and the test off the public site. |

### Serving
`/web` and `/web/` return `_site/index.html` with `<base href="/web/">`; `/web/<dir>/` returns that
folder's `index.html` (e.g. `/web/showcase/terra/`) with `<base href="/web/<dir>/">`. A one-line
script moves the address bar to the canonical path so `#anchors` stay same-document (same as
Starlink). Videos answer byte ranges (`206`), which Safari needs. Every response carries
`X-Robots-Tag: noindex, nofollow` and `X-Frame-Options: SAMEORIGIN` (the page shows `templates/`
and `showcase/triple-t/` in same-origin iframes; the site-wide `DENY` would blank them).
Only page file types are served (html, css, js, json, images, mp4/webm, woff2, glb). Markdown,
`.mjs`, dot files (`.env.example`, `.gitignore`, `.vscode/`) are never served.

### Deploy-optional folders (marked)
Osman asked to keep everything. These are committed but **marked** and **never served** by
`/web` (`WORK_FOLDERS` in `api/web/index.js`; the tests enforce it):

| Folder | Files | Size | Why |
|---|---|---|---|
| `assets/video/raw/` | 5 | 25.7 MB | Original Higgsfield clips. Osman's TODO: "Do not deploy". Each is 2.8-6.9 MB, above Vercel's 4.5 MB function response limit anyway. |
| `qa/` | 231 | 87.9 MB | QA screenshots and test videos. |
| `sections/*/qa/` | 74 | 4.5 MB | Per-section QA screenshots. |
| `tools/` | 63 | 0.1 MB | Playwright check scripts (no `node_modules`). |

They are still inside `includeFiles: "api/web/_site/**"`, so today they ride along in the
function bundle (about 152 MB unzipped, under Vercel's 250 MB). To leave them out of the deploy
later, either add these lines to `.vercelignore`:
```
api/web/_site/qa/
api/web/_site/assets/video/raw/
api/web/_site/sections/*/qa/
api/web/_site/tools/
```
(note: once Starlink is merged, `tests/test-starlink.js` checks that `.vercelignore` has no line
starting with `api`; that check would need a one-line exception), or narrow `includeFiles`.

`api/web/_site/.gitignore` is Osman's own file and ignores `qa/`. The snapshot's `qa/` files were
added with `git add -f`, so they are tracked; **new** files dropped into `qa/` later will not be
picked up by `git add` unless forced.

## Folder rules kept
- No fake clients, prices or metrics on the page (test). The showcase demos are labelled fictional
  ("POUR / PLAY is a fictional brand ... Sample prices.").
- WhatsApp button stays `hidden` while `WHATSAPP_NUMBER` in `app.js` and `whatsapp.number` in
  `content/en.json` are empty (test).
- Contact: every email on the page is `support@lavaall.com` (one LAVAALL mailbox, same as Starlink).

## On/off switch
| Where | Default | Override |
|---|---|---|
| Production (`VERCEL_ENV=production`) | **OFF**: every `/web` URL is a plain 404 | `WEB_ENABLED=1` (Osman's call, L3) |
| Preview deployments | on | `WEB_ENABLED=0` |
| Local (`node`) | on | `WEB_ENABLED=0` |

No nav link, menu item, card or sitemap entry on lavaall.com points at `/web` (a test checks the
public pages), the same as Starlink. Adding one is a separate, visible change (L3).

## Run it locally
```
node scripts/web/dev-server.js             # http://127.0.0.1:8788/web/  (umbrella at /)
PORT=8851 node scripts/web/dev-server.js
node tests/test-web.js
```

## Open items (from the folder's TODO.md plus integration)
- No backend: the inquiry form posts nowhere. WhatsApp number not set.
- SEO: canonical, `og:image`, favicon, sitemap, JSON-LD all missing (page is `noindex` while hidden).
- Weight: hero film 1.6 MB, `rec-terra.mp4` 2.6 MB, five 1.1-1.8 MB PNG photos (WebP versions exist
  and are what the page uses). Real throttled-phone and Safari/iOS tests not done.
- `showcase/*` pages load Google Fonts and YouTube thumbnails/embeds (external requests); the main page does not.
- Repo weight: `_site` adds ~152 MB (mostly `qa/` and raw video) to git history.
