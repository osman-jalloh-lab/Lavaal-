# LAVAALL Starlink backend: L3 / L4 approval pack (DRAFTS, nothing run)

_Prepared Fri Oct 2, 2026 (CT) for Osman. PR [#49](https://github.com/osman-jalloh-lab/Lavaal-/pull/49), branch `starlink/v4-backend-test`, draft._
_Every command below is a **draft. None of it has been run.** Each step needs its own "Osman OK"._

Levels: **L2** = branch-only work (done or doable without you). **L3** = merge, publish, send. **L4** = money, secrets/keys, production or storage changes.

| # | Step | Level | Summary |
|---|---|---|---|
| 1 | Pre-merge checklist | L2 → you check | Tests, conflict check, prod env check, and Preview reachability checks. |
| 2 | Merge PR #49 | L3 | Squash-merge. `vercel.json` gains 3 rewrites + 1 function entry, with no overlap with existing routes. |
| 3 | Post-merge smoke + revert | L3 | 12 curl checks, plus a one-command Vercel rollback. |
| 4 | Real email (Resend) | L3 | Small code change + 3 env vars. Test to yourself on Preview first. Free tier. |
| 5 | WhatsApp Cloud API | L4 | New Meta setup + 4 secrets + an approved template. About $0.004 per message in SL. |
| 6 | Storage | L4 | Recommend a separate free Upstash store, not the shared /ops KV. |
| 7 | Go-live `STARLINK_ENABLED=1` | L3 | Only after the NatCA answer, own photos, a real WhatsApp number and a country fix. |
| 8 | Preview off switch | L3 (env) | Optional `STARLINK_ENABLED=0` on Preview. |

---

## What the read-only checks found (Oct 2, 2026)

1. **Page files under `api/` are not public.**
   - Production already answers **404** for non-function files inside `api/`: `/api/slack/_router/agent-registry.json`, `/api/slack/_router/status.js` and `/api/ops/_lib.js`.
   - So `api/starlink/_site/*` and `api/starlink/_lib/*` are not static-served. They are only reachable through the function, which answers 404 while the switch is off.
   - `/api/starlink/_site/index.html` and `/starlink/` on production are 404 today (the code isn't on main yet).
   - The Preview itself sits behind Vercel Authentication, and my Vercel connection has no access to the `osman14` team (403). So the same check on the Preview is in step 1 for you to do.
2. **Docs, scripts and tests ARE public on lavaall.com.** Production serves:
   - `/docs/OPS-DESIGN.md`
   - `/docs/ops/souls/SOUL_sales.md`
   - `/MAGNUM.md`
   - `/AGENTS.md`
   - `/tests/test-public-contact.js`
   - `/scripts/catalog-import/README.md`

   (all 200). After a merge, `docs/starlink/` (this pack and the NatCA letter) would have been readable at www.lavaall.com/docs/starlink/…
   - **Fixed on the branch (L2):** a new `.vercelignore` with `docs/starlink/`, `scripts/starlink/` and `tests/test-starlink.js`. Step 1 has a Preview check that it works.
   - Vercel documents `.vercelignore`, but third-party notes disagree on whether Git-triggered deploys honour it. That's why the check is needed.
   - The existing exposure of MAGNUM.md, AGENTS.md, docs/ops, tests/ and scripts/ is a separate, pre-existing issue. I didn't change it.
3. **The GitHub repo is public.** Everything on this branch, including this pack and the NatCA draft, can already be read on github.com. Nothing in them is secret.
4. **Production env could not be read.** Both the Vercel connection and the laptop's Vercel CLI (logged in as `osman-jalloh-lab`) are denied the `osman14` scope. Whether Production has `STARLINK_ENABLED` is unverified; step 1 has the command.
5. **Main hasn't moved.**
   - `origin/main` is still `f072d70`, the PR base.
   - `git merge-tree` is clean.
   - The `vercel.json` diff is only the 7 added lines below.
6. **Function count:** 8 functions on main + 1 (`api/starlink/index.js`) = 9, under the Hobby limit of 12.
7. **Not ready for public (content):** the builder offers **Guinea** and **Guinea-Bissau**. Researchy's brief says Guinea's ARPT ordered Starlink sellers/installers to stop, and in Guinea-Bissau only Starlink itself may provide service. Fix before go-live (step 7).

---

## Step 1: Pre-merge checklist (L2, you verify)

| Check | Command / place | Expected | Status |
|---|---|---|---|
| PR still draft, base unchanged | `gh pr view 49 --repo osman-jalloh-lab/Lavaal- --json isDraft,baseRefOid` | `isDraft: true`, base `f072d70…` | done Oct 2 |
| No conflicts | `git fetch origin && git merge-tree --write-tree origin/main origin/starlink/v4-backend-test` | prints a tree id, no `CONFLICT` | clean Oct 2 |
| Tests | `node tests/test-starlink.js` · `node tests/test-public-contact.js` · `node tests/test-inquiry-and-schedule.js` | all pass (68/68, 12/12, 64/64) | pass Oct 2 |
| Prod has no `STARLINK_*` | from a folder linked to the `lavaal` project: `vercel env ls production --scope osman14` | no `STARLINK_ENABLED` row | **you run it**, because my access is denied |
| Preview page | open the [Preview](https://lavaal-l43jsxbb0-osman14.vercel.app/starlink/) while signed in to Vercel | v4 page renders, builder gives a code | you |
| Preview: page files not static | `…/api/starlink/_site/index.html` and `…/api/starlink/_lib/flag.js` | **404** | you |
| Preview: docs hidden | `…/docs/starlink/README.md` and `…/docs/starlink/L3-L4-APPROVAL-PACK.md` | **404** (proves `.vercelignore`) | you |
| Preview health | `…/starlink/api/health` | `"env":"preview"`, `"delivery":{"mode":"test","sends":false…}` | you |

- **If the docs return 200 on the Preview:** before merging, move `docs/starlink/` to `api/starlink/_docs/`. Files under `api/` are proven unreachable. (L2, I can do it.)
- **Touches:** nothing. **Risk:** none. **Rollback:** n/a.

Osman OK: [ ]

---

## Step 2: Merge plan for PR #49 (L3)

### `vercel.json` diff vs current main (`f072d70`)
```diff
     "api/ops/index.js": {
       "maxDuration": 30,
       "includeFiles": "docs/ops/souls/**"
+    },
+    "api/starlink/index.js": {
+      "maxDuration": 10,
+      "includeFiles": "api/starlink/_site/**"
     }
   },
@@ rewrites
     { "source": "/ops/:path*", "destination": "/api/ops?area=:path*" },
+    { "source": "/starlink", "destination": "/api/starlink?area=" },
+    { "source": "/starlink/", "destination": "/api/starlink?area=" },
+    { "source": "/starlink/:path*", "destination": "/api/starlink?area=:path*" },
     { "source": "/", "destination": "/index.html" },
     { "source": "/schedule", "destination": "/index.html" }
```
**Route review:**
- The existing sources are `/ops`, `/ops/…`, `/` and `/schedule`. None start with `/starlink`, so nothing is shadowed.
- Static files take precedence over rewrites on Vercel, and there is no `starlink` file or folder at the repo root.
- `headers` are unchanged, so the global security headers (X-Frame-Options DENY, HSTS…) also cover `/starlink`.
- No `redirects`, `cleanUrls` or `trailingSlash` changes.

### Draft commands (NOT run)
```bash
# 0. Record the current production deployment, so step 3 can roll back to it
vercel ls lavaal --prod --scope osman14        # copy the top URL -> PREV_PROD_URL

# 1. Mark ready and squash-merge (GitHub UI works too)
gh pr ready 49 --repo osman-jalloh-lab/Lavaal-
gh pr merge 49 --repo osman-jalloh-lab/Lavaal- --squash \
  --subject "starlink: v4 page + test-mode backend (off on Production)"
```
- **Touches:** `main`. That auto-deploys www.lavaall.com.
- `/starlink` stays 404 there because `STARLINK_ENABLED` is unset.
- New files: `api/starlink/**`, `docs/starlink/**`, `scripts/starlink/**`, `tests/test-starlink.js`, `.vercelignore`, plus small edits to `vercel.json` and `.env.example`.
- **Risk:**
  - A bad `vercel.json` would fail the whole production build. Mitigation: the identical file already built READY on the Preview, and Vercel keeps serving the old production deployment if a build fails.
  - `.vercelignore` is new for this project and lists only 3 Starlink paths.
- **Rollback:** step 3.

Osman OK: [ ]

---

## Step 3: Post-merge production smoke checklist + one-command revert (L3)

Run right after the production deployment shows READY. These are read-only GETs; none of them submits a form or sends mail.
```bash
B=https://www.lavaall.com
for p in / /schedule /privacy.html /terms.html; do echo "$(curl -s -o /dev/null -w '%{http_code}' $B$p) $p (expect 200)"; done
echo "$(curl -s -o /dev/null -w '%{http_code}' $B/ops) /ops (expect 200 sign-in page or 302)"
for p in /api/contact /api/quote; do echo "$(curl -s -o /dev/null -w '%{http_code}' $B$p) $p (expect 405: GET refused, form endpoint alive)"; done
for p in /starlink /starlink/ /starlink/api/health /api/starlink /api/starlink/_site/index.html /docs/starlink/README.md /docs/starlink/L3-L4-APPROVAL-PACK.md; do
  echo "$(curl -s -o /dev/null -w '%{http_code}' $B$p) $p (expect 404)"; done
```
Also by eye:
- The homepage loads with no new nav item.
- The Contact form renders. Don't submit it, because it really emails.
- `/ops` sign-in still works for you.

**One-command revert** (instant, no git; uses `PREV_PROD_URL` from step 2):
```bash
vercel rollback "$PREV_PROD_URL" --scope osman14
```
- After an instant rollback, new pushes don't auto-promote until you promote again (Vercel dashboard → Deployments → Promote).
- The git-level undo, which is itself a push to main (L3), is: `git revert <squash-sha> && git push origin main`.

- **Touches:** nothing for the checks. The rollback switches production back to the previous deployment.
- **Risk:** low.

Osman OK (to run checks / rollback if needed): [ ]

---

## Step 4: L3 real email via existing Resend + support@ (draft)

**Today:** every sender throws `live_delivery_not_enabled`. Turning email on needs a **small code change** (draft below, not committed) plus env vars. Recommended order: Preview, then a test to yourself, then Production.

**Prerequisites (verify, can't read them from here):**
- `RESEND_API_KEY` exists in the project. `.env.example` names it as the /ops primary sender.
- `lavaall.com` is a verified sending domain in Resend (SPF/DKIM).
- `support@lavaall.com` is allowed as From.

**Cost:** Resend Free is $0/mo for 3,000 emails/mo, max 100/day. Pro is $20/mo for 50,000. Source: https://resend.com/pricing, checked Oct 2, 2026.

### Draft code change (would go in `api/starlink/_lib/delivery.js`, gated, off by default)
```js
// email provider send(): only when STARLINK_EMAIL_LIVE is on, and (on Preview) only to allowlisted addresses
send: async (msg) => {
  const on = ['1', 'true', 'on'].includes(String(process.env.STARLINK_EMAIL_LIVE || '').toLowerCase());
  if (!on || !process.env.RESEND_API_KEY) return liveBlocked();
  const allow = String(process.env.STARLINK_EMAIL_ALLOWLIST || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
  if (allow.length && !allow.includes(msg.to.toLowerCase())) return liveBlocked();
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'LAVAALL <' + config().fromEmail + '>', to: [msg.to], reply_to: config().teamEmail, subject: msg.subject, text: msg.text }),
  });
  if (!r.ok) throw new Error('resend_failed_' + r.status);
  return { provider: 'resend', id: (await r.json()).id };
}
```
`prepare()` would call `send()` per channel, mark the outbox row `sent: true` / `status: "sent"` on success, and keep `recorded_test_mode` on failure. Tests are updated to mock `fetch`.

### Env vars (draft commands, NOT run)
```bash
# Preview, this branch only: test to yourself
vercel env add STARLINK_EMAIL_LIVE preview starlink/v4-backend-test --scope osman14       # value: 1
vercel env add STARLINK_EMAIL_ALLOWLIST preview starlink/v4-backend-test --scope osman14  # value: osmanjalloh104@gmail.com
vercel env add STARLINK_FROM_EMAIL preview starlink/v4-backend-test --scope osman14       # value: support@lavaall.com
# RESEND_API_KEY: reuse the existing variable (check it is enabled for Preview; do not create a new key)
```
**Test-to-self plan:**
1. Redeploy the Preview.
2. Do the builder and enter **your** email in Get connected.
3. Check that the email arrives from support@ (inbox, not spam).
4. Check that the Resend dashboard shows 1 delivered.
5. Check that `/starlink/api/outbox` shows `sent: true` for that row.
6. Try a non-allowlisted address and confirm it is **not** sent.
7. Remove `STARLINK_EMAIL_LIVE`.

Production later uses the same vars without the allowlist, and only after step 7.

### Draft customer email
> **Subject:** Your LAVAALL Starlink setup code LV-XXXXX
>
> Hi,
>
> Thanks for building your setup with LAVAALL. Your setup code is **LV-XXXXX**.
>
> Your setup: Complete Starlink setup (Starlink kit, Roof / pole mount, Professional installation, Ongoing support)
> Home · Freetown, Sierra Leone · Small space
>
> Our team will review your setup and confirm pricing and install timing. Just reply to this email if you have questions, and keep your code handy when you talk to us.
>
> LAVAALL · support@lavaall.com
> LAVAALL is independent and not affiliated with or endorsed by Starlink or SpaceX.

### Draft team handoff (to support@lavaall.com, via the existing Customer Requests webhook `CONTACT_WEBHOOK_URL`)
> **Subject:** [Lavaall Website - Starlink Setup] LV-XXXXX Complete Starlink setup
>
> Starlink setup code: LV-XXXXX
> Home · Freetown, Sierra Leone · Small space
> Need: New complete setup
> Priority: Lowest starting cost
> Recommended: Starlink kit, Roof / pole mount, Professional installation, Ongoing support
> WhatsApp: +232 76 123 456
> Email: customer@example.com
> Received: 2026-10-02T20:45:14Z

(The team handoff send uses the same pattern, gated by `STARLINK_TEAM_LIVE=1` and the existing `CONTACT_WEBHOOK_URL`/`SECRET`. No new secret.)

- **Touches:** the Preview env, then Production env; real emails to customers.
- **Risk:**
  - Mail to the wrong person.
  - Spam reputation of lavaall.com.
  - Free-tier 100/day cap.
- **Rollback:** remove `STARLINK_EMAIL_LIVE` and redeploy. Sending stops and the outbox keeps recording.

Osman OK: [ ]

---

## Step 5: L4 WhatsApp Cloud API (draft)

**Requirements:**
1. A Meta Business portfolio with **business verification**. Unverified accounts have low send limits.
2. A WhatsApp Business Account (WABA) and a **dedicated phone number**. It can't be in use on the WhatsApp app at the same time unless you migrate it. The display name must be approved.
3. A **payment method in Billing Hub**, required since Oct 1, 2026, or service messages stop after the free tier.
4. A System User with a **permanent token** (`whatsapp_business_messaging`, `whatsapp_business_management`).
5. An **approved template**, because a business can't start a chat with free text (only templates outside the 24h window).
6. **Opt-in.** WhatsApp policy needs the customer's permission before we message them. This needs a checkbox in Get connected: "Send my setup code on WhatsApp". That is a small UI change, L2 to draft.
7. Optional: a webhook for delivery status. This would be a route inside the existing Starlink function, so the function count doesn't grow.

**New secrets (names only, would be added to Vercel, never git):**
- `STARLINK_WHATSAPP_TOKEN`
- `STARLINK_WHATSAPP_PHONE_ID`
- `STARLINK_WHATSAPP_APP_SECRET` (webhook signature check)
- `STARLINK_WHATSAPP_VERIFY_TOKEN` (webhook handshake)

Non-secret:
- `STARLINK_WHATSAPP_WABA_ID`
- `STARLINK_WHATSAPP_TEMPLATE=lavaall_setup_code`
- `STARLINK_WHATSAPP_NUMBER` (also fixes the `wa.me/00000000000` placeholder)

### Draft template (submit in WhatsApp Manager → Message templates)
- **Name:** `lavaall_setup_code` · **Category:** Utility (Meta may re-classify it as Marketing, which costs more) · **Language:** English (`en`)
- **Body:**
  > Hello from LAVAALL. Your setup code is {{1}}. Our team will review your setup and confirm pricing and install timing with you here. Reply to this message with any questions. LAVAALL is independent and not affiliated with Starlink or SpaceX.
- **Sample for review:** {{1}} = `LV-5DLHT`
- **Footer:** `Reply STOP to stop messages`
- **Krio line, OSMAN TO CONFIRM wording (UNVERIFIED, written by me, not a native speaker):**
  > Tɛnki fɔ we yu bil yu setup wit LAVAALL. Yu setup kod na {{1}}. Wi go kɔntakt yu kwik.

  Meta has no Krio template language, so this would sit inside the English body or go in a second template only after you confirm the spelling.

### Pricing (Meta official, per **delivered message**, not per conversation since Jul 1, 2025)
Source: https://developers.facebook.com/docs/whatsapp/pricing ("Updated Sep 30, 2026", rates effective **Oct 1, 2026**, USD rate card; checked **Oct 2, 2026**).

| Market (Meta region) | Marketing | Utility | Authentication | Service |
|---|---|---|---|---|
| Sierra Leone, Liberia, Guinea-Bissau (**Rest of Africa**) | $0.0225 | **$0.004** | $0.004 | $0.004 |
| Guinea +224 (**Other**: not in the Rest of Africa list) | $0.0604 | $0.0077 | $0.0077 | $0.0077 |

- Free: the first **1,000 service messages per month** per business number. Service messages are free-text replies inside the 24h window.
- Also free: all messages in a 7-day free entry-point window after a click-to-WhatsApp **ad**.
- Customer messages to us are free.
- Since Oct 1, 2026, utility messages inside an open window are **charged again**.
- **Estimate (mine, not Meta's):** 100 setup-code messages/month to SL as Utility ≈ **$0.40/month**. As Marketing ≈ $2.25.

- **Touches:** Meta Business (verification, number, billing), 4 new Vercel secrets, a code change, and a small UI change for opt-in.
- **Risk:**
  - Spend (small).
  - Number quality rating and blocks if people didn't opt in.
  - Template rejection or re-categorisation.
  - Token leak. Mitigation: system-user token only in Vercel env, rotate on suspicion.
- **Rollback:** remove `STARLINK_WHATSAPP_TOKEN` (or the live flag) and redeploy. Sending stops and the outbox keeps recording. Revoke the system-user token in Meta Business settings.

Osman OK (Meta setup + spend): [ ]  ·  Osman OK (Krio line wording): [ ]

---

## Step 6: L4 storage (draft)

Today codes and leads are in memory on Vercel, so they're lost on a cold start. Pick one:

| Option | What | Cost | Risk |
|---|---|---|---|
| **A. Share the existing /ops KV** | `STARLINK_STORE=kv` (already coded). Keys `starlink:setup:*` (180-day TTL) and `starlink:outbox` (last 500). | $0, no new secret | Customer PII sits in the same database as founder /ops data. One token can read and write both. They share the free-tier quota. If Preview and Production share the KV, preview test leads land next to real ones. A bug can't touch other keys (Starlink code only uses the `starlink:` prefix), but the blast radius of a leaked token covers both. |
| **B. Separate free Upstash Redis (recommended)** | Vercel → Storage → Marketplace → Upstash Redis "lavaall-starlink", connected to `lavaal` with env prefix `STARLINK_KV` → `STARLINK_KV_REST_API_URL` / `_TOKEN`. One-line code change in `store.js` to read those names first. | Free tier (check the limits on the Upstash page at signup) | New store + 2 injected secrets (L4). Cleanly isolated, and can be deleted without touching /ops. |
| C. Customer Requests sheet only | Leads go to Sales through the existing contact webhook (step 4 team handoff); setup codes stay in memory. | $0 | Lookups of old codes fail after a cold start. OK for a pilot, not as the source of truth. |

**Recommendation:** B for codes and leads, plus C (team handoff) so Sales sees every lead in the sheet they already use. Connect it to Production and to this branch's Preview separately, so test leads never mix with real ones.

**Draft steps (NOT run):** Vercel dashboard → `lavaal` → Storage → Create → Upstash Redis → name `lavaall-starlink` → env prefix `STARLINK_KV` → environments: Preview (this branch) first → redeploy the Preview → `/starlink/api/health` shows `store.mode: "kv"`.

- **Rollback:** disconnect the store and unset `STARLINK_STORE`. It falls back to memory.

Osman OK (option): A [ ]  B [ ]  C [ ]

---

## Step 7: L3 go-live switch `STARLINK_ENABLED=1` on Production (draft)

**Prerequisites. All must be ticked before this step:**
- [ ] **NatCA written answer** on whether LAVAALL's Starlink sale/installation work needs a licence (letter: `NATCA-LETTER-DRAFT.md`). If the answer is "needs licence" or no answer comes, don't go live with install or sale offers.
- [ ] **Own kit photos** replace the Starlink/SpaceX renders in `api/starlink/_site/assets/product/`. The shot list still needs "kickstand alone".
- [ ] **Non-affiliation line** is present: the page footer already has it, and so does every customer message (a test checks both). Re-check after any copy change.
- [ ] **Real LAVAALL WhatsApp number** set as `STARLINK_WHATSAPP_NUMBER`. Today the links go to `wa.me/00000000000`.
- [ ] **Countries:** remove or relabel **Guinea** (Starlink not licensed, ARPT stop order) and **Guinea-Bissau** (only Starlink itself may provide service) in the builder, or route them to "not available yet". Liberia only with an authorized reseller partner. (L2 code change, I can draft it.)
- [ ] Copy check: "Get connected for less" is a comparative price claim. Confirm or soften it. No LAVAALL prices; SLE only if Starlink's published price is ever shown, with its check date.
- [ ] Steps 4–6 decided (at least C for leads), so a real lead can't be lost.
- [ ] Decide whether to keep `noindex`. It's on now; remove it only if you want search traffic.

**Draft commands (NOT run):**
```bash
vercel env add STARLINK_ENABLED production --scope osman14     # value: 1
vercel redeploy "$CURRENT_PROD_URL" --scope osman14            # env changes need a redeploy
curl -s https://www.lavaall.com/starlink/api/health             # expect "enabled":true,"env":"production"
```
- **Touches:** production. `/starlink` becomes reachable by anyone with the URL. There is still no nav link unless you add one later (separate L3).
- **Risk:** regulatory exposure before the NatCA answer, the SpaceX trademark/image issue, and leads lost if storage stays in memory.
- **Rollback:** `vercel env rm STARLINK_ENABLED production --scope osman14` (or set `0`), then redeploy. `/starlink` is 404 again.

Osman OK: [ ]

---

## Step 8: Optional `STARLINK_ENABLED=0` on Preview

Today every Preview deployment (any branch) shows `/starlink`, because the flag defaults on outside Production. Previews sit behind Vercel Authentication. To hide it there too:
```bash
vercel env add STARLINK_ENABLED preview --scope osman14                              # value: 0 (all previews)
# or only for one branch:
vercel env add STARLINK_ENABLED preview some-other-branch --scope osman14            # value: 0
```
Branch-specific values override the all-preview value. So `0` for all previews plus `1` for `starlink/v4-backend-test` keeps this branch testable.
- **Touches:** Preview env only.
- **Risk:** none for Production.
- **Rollback:** `vercel env rm STARLINK_ENABLED preview --scope osman14`.

Osman OK: [ ]

---

## Go / no-go recommendation

- **GO** for step 1 (your Preview checks), and then step 2 (merge while OFF) once step 1 passes. The section stays a 404 on lavaall.com, delivery stays in test mode, and rollback is one command.
- **NO-GO for now** on steps 4, 5 and 7 (real sends, WhatsApp spend, going live) until the NatCA written answer, own photos, the real number and the country fix are in.
- Step 6: pick an option before step 4, so real leads are durable.

**Jev (scored Oct 2, 2026, on this go/no-go):** `JEV score=0.88 confidence=0.82 verdict=PASS id=D-20261002-starlink-l3l4-pack reason="weakest=evidence (0.74)" parts=e0.74/s0.91/r0.99`. The weakest part is evidence, because production env and the Preview could not be read from here. Your step-1 checks close that gap.
