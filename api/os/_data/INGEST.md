# LAVAALL OS live feeds (ingest)

Six authenticated POST endpoints feed `/os`. `/os` itself stays read-only: it only reads what these write.

- **URL:** `https://www.lavaall.com/api/os/ingest/<feed>` (one function, `api/os/ingest/[feed].js`).
- **Auth:** `Authorization: Bearer $TOKEN`, where `$TOKEN` is the value of the existing `OPS_CEO_BRIDGE_SECRET` (the bearer the inbox push and routine health already use). No new env var. Without it the answer is `401 {"error":"unauthorized"}` and nothing is stored.
- **Body:** JSON, `Content-Type: application/json`, at most 20 KB (the `notes` feed: 900 KB).
- **Answers:** `200 {"ok":true,"feed":"…","received":n}`, `401`, `404` (unknown feed), `405` (not POST), `413` (too large), `400` (not JSON), `422 {"error":"invalid_shape","field":"[0].usd"}` (the field path only, never a value), `503` (store unavailable).
- **Strict shapes:** exactly the keys shown, no extra keys. Nothing is stored unless the whole payload is valid.
- **Storage:** each feed has its own new KV key, `lavaall-os-feed-<feed>-v1`. The existing store key is never touched. Preview deploys write to a `preview:`-prefixed key, so a preview never writes production data.
- **Never send** secrets, lead names, customer emails or addresses. Outreach is counts only.

Dates are `YYYY-MM-DD` (a real calendar day, not more than a day ahead). Times are UTC, `YYYY-MM-DDTHH:MM:SSZ`, not in the future. `/os` shows times in America/Chicago.

## 1. morning-brief

`{date, text}` becomes the Home Morning brief card. `text` is 1 to 6000 characters; line breaks are kept. The latest post is the brief.

```sh
curl -sS -X POST https://www.lavaall.com/api/os/ingest/morning-brief \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"date":"2026-10-23","text":"Good morning.\nThree things matter today."}'
```

## 2. routine-health

`[{id, lastRun, status}]`, 1 to 40 rows. `id` is the routine id from `routines.json` (lowercase, hyphens). `lastRun` is a UTC time, or `null` if it never ran. `status` is `ok`, `late`, `failed` or `skipped`. Each post replaces the whole snapshot, so send every routine you want shown. It fills Routines (Last run, Health) and the Home Routine health card. A routine you leave out shows a dash.

```sh
curl -sS -X POST https://www.lavaall.com/api/os/ingest/routine-health \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '[{"id":"sl-daily-leads","lastRun":"2026-10-23T12:00:00Z","status":"ok"},{"id":"midnight-closeout","lastRun":null,"status":"late"}]'
```

## 3. spend

`[{date, tool, usd, note}]`, 1 to 200 rows. `usd` is a number from 0 to 100000 (US dollars, never a string); it is stored in whole cents. `tool` is 1 to 60 characters, `note` is up to 200 (use `""` for none). **Posting a date replaces every row stored for that date**, so re-sending a day is safe and never duplicates. It fills the Spend tab and the Home AI spend tile (month to date, America/Chicago). Up to 500 rows are kept, newest dates first.

```sh
curl -sS -X POST https://www.lavaall.com/api/os/ingest/spend \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '[{"date":"2026-10-22","tool":"Claude API","usd":1.15,"note":"daily run"},{"date":"2026-10-22","tool":"Voice","usd":0.29,"note":""}]'
```

## 4. outreach-stats

`{date, drafted, approved, sent, replied, bounced}`: **counts only** (whole numbers 0 to 1,000,000). No names, no emails, no extra keys (any extra key is rejected). `bounced` cannot be more than `sent`. One record is kept per day (60 days); the latest day is shown. It fills the Outreach column counters and the Home Hotel bounce rate tile, where **bounce rate = bounced / sent** for the latest day (a dash when nothing was sent).

```sh
curl -sS -X POST https://www.lavaall.com/api/os/ingest/outreach-stats \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"date":"2026-10-22","drafted":12,"approved":10,"sent":20,"replied":3,"bounced":2}'
```

## 5. desk-status

`[{desk, now, updated}]`, 1 to 20 rows. `desk` is a desk id (`lavaall-ceo`, `sales`, `technical`, `growth`, `lifecycle`, `researchy`, `scout`; any other id is rejected). `now` is 1 to 200 characters on one line. `updated` is a UTC time. A desk you send is replaced; desks you do not send keep their last line (or the data pack line). It sets each desk's "now" line on Home, Desks and the desk drawer.

```sh
curl -sS -X POST https://www.lavaall.com/api/os/ingest/desk-status \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '[{"desk":"technical","now":"Shipping the live feeds","updated":"2026-10-23T14:00:00Z"}]'
```

## 6. notes

`[{id, type, folder, title, date, updated, desk, status, level, jev, tags, links, source, body}]`, 1 to 500 notes, up to **900 KB** (the only feed above 20 KB). Optional on a scout find: `urgent` (true or false) and `url`. `id` is `nt-` plus ten hex characters, `type` is `idea`, `scout-find`, `decision` or `note`, `folder` is `Ideas`, `Scout Finds`, `Research`, `Skills` or `Decisions`, `date` and `updated` are `YYYY-MM-DD` (`updated` may be `""`), `level` is `L0` to `L4` or `null`, `jev` is a number 0 to 1 or `"not run"`, `tags` is up to 12 short strings, `links` is up to 30 note ids, `body` is plain text up to 4000 characters. A note that mentions a blocked word, an `@` or a phone number is refused, and so is any unknown key. **Each push replaces the whole pack.** It fills the Notes tab and Home's Latest Scout finds.

Normally you do not write this by hand: `scripts/build-notes-pack.js --push` reads the private vault, drops anything sensitive and posts the pack with `$TOKEN` from the environment. The pack is also written to `api/os/_data/notes.local.json`, which is gitignored; notes content is never committed.

```sh
curl -sS -X POST https://www.lavaall.com/api/os/ingest/notes \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '[{"id":"nt-0123456789","type":"idea","folder":"Ideas","title":"A plain idea","date":"2026-10-20","updated":"2026-10-21","desk":"growth","status":"open","level":null,"jev":"not run","tags":["alpha"],"links":[],"source":"vault","body":"Plain text."}]'
```

## Notes

- Text is stored as data and escaped when shown; it is never run as HTML.
- Nothing is logged: not the payload, not the token.
- There is no rate limit beyond the 20 KB cap and the secret. Post once per run, not in a loop.
