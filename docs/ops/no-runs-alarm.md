# No-runs alarm

Draft, flag off. An hourly Vercel cron checks when the latest routine-health
snapshot and the latest support@ inbox push landed. If **neither** has landed
within the threshold (default 6 hours), it emails `support@lavaall.com` once
for that outage. The point is to notice when every agent stops at once, like
the 17–19 Nov 2026 usage blackout.

Merging this change does not turn the alarm on and does not set any
environment variables. The founder sets those after review.

## Switches

| Name | Kind | Default | Notes |
|---|---|---|---|
| `OPS_NO_RUNS_ALARM_ENABLED` | flag | off | `1`, `true` or `on` turns it on (case-insensitive, surrounding space ignored). Unset, empty, `0`, and any other value are off. While off, an authorized cron returns `{ ok, skipped, reason: "disabled" }` and no email is sent. |
| `OPS_NO_RUNS_ALARM_STALE_HOURS` | optional number | 6 | Positive hours, at most 168. Unset, zero, negative, or invalid values use 6. A signal is stale only when it is **older than** this window, not equal to it. |
| `CRON_SECRET` | secret (Vercel) | provided on Pro | Bearer the cron sends. The route checks `Authorization: Bearer $CRON_SECRET` with a timing-safe compare. Unset or a mismatch is `401`. Confirm the Vercel-provided value exists; do not invent or commit one. |

Email reuses the existing outbound path: Resend (`RESEND_API_KEY` + `OPS_FROM_EMAIL`) first, Gmail (`OPS_GMAIL_*`) as fallback. The store reuses `KV_REST_API_URL` and `KV_REST_API_TOKEN` (or `$OPS_STORE_FILE.no-runs-alarm.json` locally). Preview and Development prefix the KV key with `VERCEL_ENV:` the same way as the routine-health strip, so a Preview run cannot overwrite Production state.

## How "landed" is detected

| Signal | Written by | Endpoint | Timestamp used |
|---|---|---|---|
| Routine health | The box posts `routine-check.py --json` | `POST /ops/api/ceo-bridge/routine-health` | The stored record's `receivedAt` (server clock when the post was accepted). |
| Inbox push | The box posts the ranked support@ feed | `POST /ops/api/inbox-triage` | The stored feed's `receivedAt` (server clock when the post was accepted), not the `receivedAt` on individual mail items. |

A missing record counts as stale. If either store cannot be read, the cron does **not** email (`503 store_unavailable`). One fresh signal is enough to stay quiet.

## Endpoint: `/api/no-runs-alarm`

Vercel cron (hourly):

```json
{ "path": "/api/no-runs-alarm", "schedule": "0 * * * *" }
```

- `GET` (and `HEAD`) only. Header: `Authorization: Bearer $CRON_SECRET`.
- Success shapes: `{ ok, skipped, reason }` or `{ ok, alerted, reason, via }`. Reasons include `disabled`, `fresh`, `one_fresh`, `already_alerted`, and `stale`.
- Errors: `401 unauthorized`, `405 method_not_allowed`, `503 store_unavailable` / `delivery_failed` / `delivery_not_configured`.
- A failed send does not mark the outage as alerted, so the next hour can retry.

The email goes to `support@lavaall.com`. It names when each signal last landed (America/Chicago, labeled `CT`) and says it will not send again until at least one signal lands and then both go quiet again.

## Turning it on (founder)

1. Confirm this draft PR has had a second review.
2. Confirm `CRON_SECRET` is present on the Vercel project (Pro provides it) and that Resend or Gmail delivery is already configured.
3. Set `OPS_NO_RUNS_ALARM_ENABLED=1` on Preview first, redeploy, and wait for the hourly cron (or invoke the route with the bearer from a trusted shell). Do not put the bearer in git, a PR, or logs.
4. Set the same flag on Production only after the founder approves. Optional: `OPS_NO_RUNS_ALARM_STALE_HOURS` if 6 is not the window you want.
