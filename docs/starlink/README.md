# LAVAALL Starlink — v4 page + backend (test mode, OFF on Production)

Status: draft PR, branch `starlink/v4-backend-test`. Not linked from lavaall.com.
Delivery is **test mode only**: nothing is ever sent.

## What it is
A copy of Osman's v4 Starlink page (source: `OneDrive\Desktop\startlink\v4`,
left untouched) plus a small backend that:

1. takes the 5 builder answers, validates them, and issues a unique setup code
   (`LV-XXXXX`) stored server-side with answers, recommendation, timestamps and status;
2. lets the page look a code up;
3. turns the yellow **Get connected** button into a lead: the visitor leaves a
   WhatsApp number and/or email, the server records it against the code
   (status `new` -> `lead`) and **records** what it would send (customer
   WhatsApp, customer email, team handoff) in a test outbox. The visitor also
   gets tap-to-send WhatsApp (`wa.me`) and email (Gmail compose / `mailto`) links.

## Where it lives
| Path | What |
|---|---|
| `api/starlink/index.js` | The one serverless function: page, assets and API (keeps the Hobby function count low). |
| `api/starlink/_lib/flag.js` | On/off switch. |
| `api/starlink/_lib/store.js` | Storage (memory / local file / existing KV, opt-in). |
| `api/starlink/_lib/delivery.js` | Switchable sender: email (Resend), WhatsApp (Cloud API), team (Customer Requests webhook). Test mode only. |
| `api/starlink/_lib/validate.js`, `codes.js`, `recommend.js` | Answer validation, phone/email normalising, code generation, recommendation rules. |
| `api/starlink/_site/` | `v4/` (the page) + `assets/product/` (images), same layout as OneDrive. Underscore folder: not a route, only served through the function. |
| `docs/starlink/V4-SOURCE.md` | SHA-256 manifest of the OneDrive snapshot + the list of integration edits. |
| `docs/starlink/HANDOFF-BACKEND.md` | Osman's frontend integration contract (copy). |
| `scripts/starlink/dev-server.js` | Local runner, no dependencies. |
| `tests/test-starlink.js` | Tests (`node tests/test-starlink.js`). |
| `vercel.json` | `/starlink` rewrites + `includeFiles` for `_site`. |

### Changes to the v4 copy
Source: Osman's `OneDrive\Desktop\startlink\v4` + `..\assets\product`, snapshot Fri Oct 2, 2026 ~7:30 PM CT
(v4 files last edited 7:10 PM; perk-cut images re-exported 7:03-7:06 PM). Contract: `HANDOFF-BACKEND.md` (copied here).
The `v4/` + `assets/product/` layout is kept, so every file except `v4/index.html`, `v4/app.js` and `v4/styles.css`
is byte-identical to OneDrive; `V4-SOURCE.md` lists the SHA-256 of each and the tests enforce it.

- **Serving:** `/starlink/` (and `/starlink/v4/`) return `_site/v4/index.html` with `<base href="/starlink/v4/">`, so v4's own `../assets/...` paths resolve to `/starlink/assets/...`. A one-line script moves the address bar to `/starlink/v4/` so in-page `#anchors` stay same-document. The server also injects `window.LV_CONFIG` (contact links + API base).
- `index.html`: absolute `og:image` (`https://lavaall.com/starlink/assets/product/fields/og.jpg`; on Preview/local the server swaps in the request origin); `noindex`; WhatsApp + Email fields, honeypot and a status line in the result panel; `?v=cp4c-be1` on `styles.css`/`app.js`. The inline `.is-pinned` script is unchanged: it already matches `narrow`/`reduce` in `motion.js`, and a test now fails if they drift.
- `app.js`: when the builder finishes it calls `POST api/setups` and shows the server's code (same `LV-` + `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` alphabet). If the API is unreachable it falls back to the original client `code()` and `wa.me` link. **Get connected** posts to `api/setups/:code/connect` and shows a busy, success ("Saved... Test mode: nothing was sent.") or error state (missing/invalid number or email, field marked `aria-invalid`). Return visits: a `?code=LV-XXXXX` link, or the code remembered in `localStorage` (`lv-setup-code`, code only), is restored with `GET api/setups/:code`. `sessionStorage` `lv-setup` and the `state.a` keys are unchanged. Shop `data-sku` enquiries unchanged.
- `styles.css`: one appended block (`.connect`, `.connect__status`) using existing tokens only; no gradients, no shadows; lime only as the success dot.
- `motion.js`, `globe.js`, all images: unchanged. The older `assets/product/cutout/` set is no longer used by v4 and was dropped.

### Contact links (server-configured, placeholders by default)
`GET /starlink/api/config` and the injected `window.LV_CONFIG` carry the WhatsApp / Call / Email destinations.
Nothing is set today, so the page keeps v4's placeholders. Optional env vars (not set by this PR; setting them is an L3 config change):

| Var | Used for | Default |
|---|---|---|
| `STARLINK_WHATSAPP_NUMBER` | `wa.me` links on the page and in Get connected links | `00000000000` |
| `STARLINK_CALL_NUMBER` | `tel:` link | `+00000000000` |
| `STARLINK_CONTACT_EMAIL` (else `STARLINK_TEAM_EMAIL`) | `mailto:` on the page | `hello@lavaall.com` |

Note: after Get connected, the result's Email button switches to the server's team address (`STARLINK_TEAM_EMAIL`, default `support@lavaall.com`), while the page default is v4's `hello@lavaall.com`. Osman to pick one.

## On/off switch
| Where | Default | Override |
|---|---|---|
| Production (`VERCEL_ENV=production`) | **OFF**: every `/starlink` URL is a plain 404 | `STARLINK_ENABLED=1` (Osman's call, L3) |
| Preview deployments | on | `STARLINK_ENABLED=0` |
| Local (`node`) | on | `STARLINK_ENABLED=0` |

There is no nav link, menu item, card or sitemap entry pointing at `/starlink` (a test checks the public pages).
`/starlink/api/outbox` is never served on Production, even when the switch is on.

## Run it locally
```
node scripts/starlink/dev-server.js           # http://127.0.0.1:8787/starlink/
PORT=8790 node scripts/starlink/dev-server.js # another port
node tests/test-starlink.js
```
Local data goes to `STARLINK_STORE_FILE` (default: a temp file, printed at start-up).

## API
All JSON. Base: `/starlink/api`.

| Method | Path | Body | Answer |
|---|---|---|---|
| GET | `/config` | | `{ api, contact:{whatsapp, call, email}, placeholders:{whatsapp, call, email} }` |
| GET | `/health` | | `{ enabled, env, store:{mode,durable}, delivery:{mode:"test", sends:false, channels} }` |
| POST | `/setups` | `{ place, country, city?, need, size, priority }` (exact v4 option labels) | `201 { code, status:"new", answers, recommendation, createdAt }` / `400 { error:"invalid_answers", fields }` |
| GET | `/setups/:code` | | `{ code, status, answers, recommendation, contact:{whatsapp:bool,email:bool} }` (no contact details) / 404 |
| POST | `/setups/:code/connect` | `{ whatsapp?, email?, name? }` (one of whatsapp/email required) | `{ ok, status:"lead", delivery:{mode:"test", sent:false, recorded:[…]}, links:{whatsapp, email, mailto} }` |
| GET | `/outbox?limit=50` | | Test outbox, customer contact masked. Never on Production. |

Phone numbers are normalised to E.164 using the chosen country (Sierra Leone 232, Liberia 231, Guinea 224, Guinea-Bissau 245), e.g. `076 123 456` -> `+23276123456`.
Rate limits (per IP, in memory): 30 setups / 10 min, 6 connects / 10 min; 5 connects per code. Honeypot field `website`.

## Storage
| Mode | When | Notes |
|---|---|---|
| memory | default (incl. Vercel) | Resets on cold start; separate per instance. Fine for testing. |
| file | local, `STARLINK_STORE_FILE` set | The dev server sets this. |
| kv | `STARLINK_STORE=kv` **and** the existing `KV_REST_API_URL`/`KV_REST_API_TOKEN` | Keys `starlink:setup:<CODE>` (180-day expiry) and list `starlink:outbox` (last 500). Opt-in because that KV may also hold Production /ops data. |

## Turning on real delivery (not in this PR — Osman's decision, L3/L4)
`send()` throws in every provider in this build. Going live needs a separate,
approved change that:
1. **Email (Resend)** — reuse the existing `RESEND_API_KEY` and a verified sender
   (e.g. `support@lavaall.com`, `STARLINK_FROM_EMAIL`). Cost: Resend free tier, then paid.
2. **WhatsApp Cloud API (Meta)** — new secrets `STARLINK_WHATSAPP_TOKEN`,
   `STARLINK_WHATSAPP_PHONE_ID`, a verified business number and an **approved
   message template** (a first message to a customer can't be free text). Meta
   charges per conversation.
3. **Team handoff** — POST the recorded payload to the existing `CONTACT_WEBHOOK_URL`
   (Apps Script `contact-router.gs`, Customer Requests path) with `CONTACT_WEBHOOK_SECRET`.
4. Set `STARLINK_WHATSAPP_NUMBER` (LAVAALL's real number; the `wa.me` link uses a
   `00000000000` placeholder until then) and `STARLINK_TEAM_EMAIL` if not `support@lavaall.com`.
5. Durable storage: `STARLINK_STORE=kv` (decide whether Starlink leads may share the /ops KV).

## Path to production (all L3/L4, Osman only)
1. Osman reviews the Preview. 2. Real photos replace the Starlink renders (SpaceX copyright).
3. Decide delivery + storage above. 4. Merge the PR (still OFF). 5. Set `STARLINK_ENABLED=1` on Production when he wants it visible.

## Brand rules kept
No LAVAALL prices anywhere (page, API or messages). Non-affiliation line in the footer and in every customer message. SLE (not SLL) if prices are ever added. Partner spelled Hameed.
