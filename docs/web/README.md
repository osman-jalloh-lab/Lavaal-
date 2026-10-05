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

## v2 (Oct 4, 2026): shorter main page, Our work page, inquiry, phone data

- **Main page `/web/`** keeps the hero, Meet Lava (WhatsApp demo plus the workflow film), Who it is for, a short "See what we have built" teaser, How it works with the FAQ, and Contact. At 1440 the height went from 22,908 px to 6,679 px.
- **Our work `/web/work/`** (`_site/work/index.html`) holds the moved showcase: POUR / PLAY, TERRA, LAVAALL Starlink, LAVAALL and Hermes OS recordings, the automations player, Business OS (with the "Table for 4?" walk-through), Salone / Triple T and the templates gallery. It uses `../styles.css` and `../app.js`, and `<html data-root="../">` tells the script where assets live. It is served by `api/web/index.js` through the existing `/web/:path*` rewrite, so `vercel.json` did not change.
- **Inquiry API** `POST /web/api/inquiry` (`api/web/_lib/inquiry.js`) reuses the main site's server-side path: `CONTACT_WEBHOOK_URL` with `CONTACT_WEBHOOK_SECRET`, which goes to `scripts/email-router/contact-router.gs` (GmailApp). `routeTo` is always support@lavaall.com. It has a honeypot, validation, a rate limit of 5 per 10 minutes per IP, and an 8 KB body limit. It is not mailto-only and does not use Outlook.
  - `WEB_INQUIRY_ENABLED` is off on Production by default, and the form then answers 503 and shows "Online inquiries are not switched on yet." with the Gmail fallback. It is on in Preview and locally.
  - `WEB_INQUIRY_TRANSPORT=mock` records to an in-memory outbox (`GET /web/api/outbox`) and never sends. It is ignored on Production. Tests mock the transport and `fetch`; no real sends.
  - `GET /web/api/health` reports the flags. No secrets are in code.
- **WhatsApp CTAs** (hero, contact, work page) read `content/en.json` `whatsapp.number`, which the function injects as `window.LV_WEB.whatsapp`. They stay hidden while the number is empty.
- **Phone data:** the hero film is fetched after load plus idle time. It is skipped on reduced motion, save-data, 2g/3g or slow links, and the poster stays. At 760px or narrower it uses `hero-sm.mp4` (523 KB), otherwise `hero-lite.mp4` (834 KB). Recordings and clips are served as `-lite` re-encodes (ffmpeg H.264, CRF 30 to 33, faststart). The originals stay in the repo but are no longer referenced. Images are WebP and below the fold is lazy.
- **Fix:** the Business OS "From Table for 4? to booked" heading no longer overlaps the step cards on short desktop windows.
- **Run locally with mock sends:** `WEB_INQUIRY_TRANSPORT=mock PORT=8852 node scripts/web/dev-server.js`.

## Open items (from the folder's TODO.md plus integration)
- No backend: the inquiry form posts nowhere. WhatsApp number not set.
- SEO: canonical, `og:image`, favicon, sitemap, JSON-LD all missing (page is `noindex` while hidden).
- Weight: hero film 1.6 MB, `rec-terra.mp4` 2.6 MB, five 1.1-1.8 MB PNG photos (WebP versions exist
  and are what the page uses). Real throttled-phone and Safari/iOS tests not done.
- `showcase/*` pages load Google Fonts and YouTube thumbnails/embeds (external requests); the main page does not.
- Repo weight: `_site` adds ~152 MB (mostly `qa/` and raw video) to git history.
