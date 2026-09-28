# Preview data isolation

Preview builds of `/ops` must not read or write real founder data. Production keeps the same database and the same key names it has today.

This note is for Osman and Hameed. Nothing here turns the separation on in Vercel. Nobody should set the new variables until a founder decides to create a second database.

## What is isolated

`/ops` keeps founder records in Vercel KV (Upstash Redis over its REST API). There is no Vercel Blob store and no Redis SDK. One helper, `api/ops/_store-env.js`, is the only module that opens that client or builds key names and local file paths.

| What | Where it lives | Production key |
| --- | --- | --- |
| Office blob: goals, tasks, notes, profiles, inbox state, calendar events, routines, kits mirror, issues, assign tasks | `api/ops/_store.js` | `lavaall-ops-v2` |
| Founders DM (Osman and Hameed) | `api/ops/_founders_dm.js` | `lavaall-ops-founders-dm-v1`, plus `:read` and `:legacy` |
| Sign-in history and “sign out all sessions” | `api/ops/_signin_hardening.js` | `lavaall-ops-signin-log-v1`, `lavaall-ops-session-gen-v1` |
| Routine health snapshot | `api/ops/_routine_health.js` | `lavaall-ops-routine-health-v1` |
| CEO bridge queue and threads | `api/ops/_ceo_bridge.js` | `ops:ceo:pending`, `ops:ceo:thread:{id}` |
| Desk Talk threads | `api/ops/_agent_thread.js` | `ops:agent:thread:{desk}:{id}` |
| Local file fallback | `OPS_STORE_FILE` | same path as today |

Auth sessions are signed cookies, not rows in KV. The generation counter above is the durable session record. Rate limits are process memory. On Preview and development their bucket names are prefixed too, so they do not share a production bucket inside one process.

These are not KV, and this change does not move them:

- Public contact, quote, and booking (`api/contact.js`, `api/quote.js`, `api/schedule.js`)
- Slack handlers
- Catalog import scripts and QA scripts
- Soul markdown files
- The Netlify form function (in-memory limit only)

## Two layers on Preview

1. Preferred: a separate database. If both `PREVIEW_KV_REST_API_URL` and `PREVIEW_KV_REST_API_TOKEN` are set, Preview uses that database.
2. Always: every key is prefixed with `preview:`. Development (`VERCEL_ENV=development`, including `vercel dev`) uses `dev:`. Production keys are unchanged, including when `VERCEL_ENV` is unset in local `node`.

If Preview is still pointed at the production database, the prefix means a Preview write cannot hit `lavaall-ops-v2` or the other production names.

If Preview code tries to send a key without that prefix, the helper throws and `/ops` returns 503. It does not write. The same happens when `VERCEL_ENV` is missing on Vercel, when it is some value other than production / preview / development, or when only one of the two Preview KV variables is set.

## Other founder systems

On Preview and development, `/ops` does not use the real Kit Registry spreadsheet or the real shared Google Calendar unless a founder sets a **different** id:

- `PREVIEW_KIT_REGISTRY_SHEET_ID` — a different spreadsheet. The known founder registry id is refused.
- `PREVIEW_OPS_GOOGLE_CALENDAR_ID` — a different calendar. `primary` is refused, and reusing `OPS_GOOGLE_CALENDAR_ID` is refused.

Live support@ mail (list, read, and confirm-send) stays off on Preview and development. Paste-a-snapshot still works, and that copy is stored under the Preview prefix. Magic-link mail can still go out through the existing `OPS_GMAIL_*` variables. That is a separate decision, listed in the pull request.

## Variables to set later

Do not set these now.

For a separate Preview database (Vercel → Project `lavaal` → Settings → Environment Variables → Preview only):

- `PREVIEW_KV_REST_API_URL`
- `PREVIEW_KV_REST_API_TOKEN`

Create the database first, then paste its REST URL and token into **Preview** only. Leave Production on `KV_REST_API_URL` and `KV_REST_API_TOKEN`.

Optional, also Preview only, and only if the id is a new empty resource:

- `PREVIEW_KIT_REGISTRY_SHEET_ID`
- `PREVIEW_OPS_GOOGLE_CALENDAR_ID`

## Migration

Do not copy production data into Preview.

Preview writes that already landed in the shared database under production key names (the office blob, CEO threads, desk Talk, assign tasks, and the rest of `lavaall-ops-v2`) cannot be told apart from founder records. Leave them. Start Preview empty.

Keys that already start with `preview:` keep working while Preview still uses the same database. That is the founders DM thread (`preview:lavaall-ops-founders-dm-v1` and its `:read` / `:legacy` keys), the sign-in log, the session generation counter, and the routine-health snapshot. Those prefixes were already in the code. They are not copied anywhere. If Preview later moves to its own database, those keys stay on the old one and the new database starts empty too.

`vercel dev` used to prefix only some keys with `development:`. It now uses `dev:` for every key. Old `development:` rows are not copied.

An optional seed script can write one clearly fake office goal. It is off unless both of these are true: `VERCEL_ENV=preview` and `SEED_PREVIEW_DEMO=1`.

```bash
SEED_PREVIEW_DEMO=1 VERCEL_ENV=preview node scripts/ops/seed-preview-demo.js
```

It refuses to run in production. It writes only `preview:lavaall-ops-v2` with a goal titled as demo data.
