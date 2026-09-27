# Routine health strip

Read-only founder view of box routine runs. The box keeps a routine ledger and posts the latest `routine-check.py --json` snapshot to `/ops`. The strip on `/ops` shows one dot per routine.

The flag defaults **off**. This does not add a secret. The box uses the existing CEO bridge bearer, `OPS_CEO_BRIDGE_SECRET` (the same value as `POST /ops/api/ceo-bridge/reply`). Keep that value in the box env only. Do not paste it into this file, git, a PR, or logs.

## Flag

`OPS_ROUTINE_HEALTH_ENABLED`

- Default off. Unset, empty, `0`, and any other value are off.
- On values: `1`, `true`, `on` (case-insensitive, surrounding space ignored).
- Set it only on a Preview you mean to try. Do not set Production until an L3 deploy.
- While off, the post and the founder read return 404, and `/ops` does not render the strip.

## What the box sends

`POST /ops/api/ceo-bridge/routine-health`

Header: `Authorization: Bearer $OPS_CEO_BRIDGE_SECRET`

The body is JSON, at most **20480 bytes** (20 KiB). The shape is strict: extra fields, a bad status, a duplicate slug, or a non-UTC timestamp are rejected with `400` and `{ "error": "invalid_shape" }`. Over the size cap: `413` and `{ "error": "payload_too_large" }`. A wrong or missing bearer: `401`. The response on success is `{ "ok": true, "stored": true, "count": N }`. It does not echo reasons.

Each routine needs:

| Field | Rule |
|---|---|
| `slug` | Lowercase letters, digits, single hyphens. Max 64 characters. |
| `status` | `OK`, `PARTIAL`, `FAILED`, `STARTED_NO_END`, `RUNNING`, `MISSING`, or `NOT_WIRED`. |
| `lastRunAt` | UTC instant with a `Z` suffix, or `null` when there is no run. |
| `reason` | One line, max 240 characters. May be empty. Treated as untrusted data. |

`generatedAt` is when the checker built the snapshot. UTC with a `Z` suffix. It must not be more than 10 minutes ahead of the server clock. Up to 40 routines.

Replace `ORIGIN` with the host you are posting to (the Preview host while the flag is on there). No trailing slash. The shell variable is the existing bridge secret. Do not inline the value.

```bash
curl -sS -X POST "$ORIGIN/ops/api/ceo-bridge/routine-health" \
  -H "Authorization: Bearer $OPS_CEO_BRIDGE_SECRET" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  --data-binary @- <<'JSON'
{
  "generatedAt": "2026-09-27T23:05:00Z",
  "routines": [
    {
      "slug": "kit-registry-eod-sync",
      "status": "NOT_WIRED",
      "lastRunAt": null,
      "reason": "no schedule wired for this slug"
    },
    {
      "slug": "ceo-talk-bridge-poll",
      "status": "OK",
      "lastRunAt": "2026-09-27T23:00:00Z",
      "reason": "polled"
    },
    {
      "slug": "researchy-assign-wake-poll",
      "status": "OK",
      "lastRunAt": "2026-09-27T23:00:04Z",
      "reason": "polled"
    },
    {
      "slug": "overnight-ops-fix-morning-brief",
      "status": "FAILED",
      "lastRunAt": "2026-09-25T11:00:00Z",
      "reason": "cause unknown"
    },
    {
      "slug": "jev-eod-decision-review",
      "status": "OK",
      "lastRunAt": "2026-09-27T05:00:12Z",
      "reason": "scored"
    },
    {
      "slug": "nightly-decision-flush-to-obsidian",
      "status": "RUNNING",
      "lastRunAt": "2026-09-27T22:00:00Z",
      "reason": "still going"
    },
    {
      "slug": "researchy-next-new-thing-daily-channel-check",
      "status": "PARTIAL",
      "lastRunAt": "2026-09-27T12:10:00Z",
      "reason": "one source skipped"
    },
    {
      "slug": "scout-weekly-minimal-x-scan",
      "status": "PARTIAL",
      "lastRunAt": "2026-09-27T12:10:00Z",
      "reason": "one source skipped"
    }
  ]
}
JSON
```

`routine-check.py --json` should emit this object (or the box should post this object built from that output, with no extra fields). A later post replaces the stored snapshot. Only the latest one is kept.

## Who can read

`GET /ops/api/ceo-bridge/routine-health` is the founder view. It requires a signed-in founder session (the same allowlist cookie as the rest of `/ops`). The bridge bearer can post and cannot read this view, even if the bearer is valid. A non-founder session cannot read it. No CSRF on the post: the bearer is the credential, same as reply.

The dashboard loads `/assets/js/ops-routine-health.js`, which fetches that GET and draws the strip. Server HTML is escaped before first paint. The script sets text with `textContent`.

## KV

Latest snapshot only.

| `VERCEL_ENV` | Key |
|---|---|
| Production, or unset | `lavaall-ops-routine-health-v1` |
| `preview` | `preview:lavaall-ops-routine-health-v1` |
| Any other non-production value | `{env}:lavaall-ops-routine-health-v1` |

Same prefix rule as the private founder thread: a Preview deploy does not write the key Production reads.

## Strip

Shown on the `/ops` dashboard when the flag is on and the viewer is a founder.

| Dot | Status |
|---|---|
| Green | `OK` |
| Amber | `PARTIAL`, `STARTED_NO_END`, `NOT_WIRED` |
| Sky | `RUNNING` |
| Red | `FAILED`, `MISSING` |

The status word is next to the dot. Times are America/Chicago, labeled `CT`. Tap a routine to open its reason.

- Nothing stored yet: **No data yet**
- `generatedAt` older than 26 hours: **stale** (the last dots stay on screen)
