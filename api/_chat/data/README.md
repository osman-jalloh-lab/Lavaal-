# Chat data: dialling codes

`dialcodes.v1.json` is the static table the chatbot uses to turn a numeric answer at the country step
(`232`, `+232`, `00232`, `+232 76 123456`) into a country, before any model call. It is read by
`api/_chat/dialcode.js`. There's no network access at runtime and no runtime npm dependency.

- **Source:** [libphonenumber-js](https://gitlab.com/catamphetamine/libphonenumber-js) 1.13.17, `metadata.max.json`.
  That metadata is derived from Google's [libphonenumber](https://github.com/google/libphonenumber).
- **Licences:** libphonenumber-js is MIT; the Google libphonenumber metadata is Apache-2.0. Both permit
  redistribution of this derived table; keep this notice with the file.
- **Contents:** every country calling code (206) mapped to its regions in metadata order (main region
  first), 245 English region names from ICU `Intl.DisplayNames` (small overrides in the generator), the 9
  non-geographic codes (+800, +808, +870, +878, +881, +882, +883, +888, +979), each region's general
  national-number pattern and possible lengths, and, for the 51 regions that share a code, the leading
  digits and per-type patterns needed to decide a full number the way libphonenumber does.
- **Shared codes:** when the digits do not decide (for example `+1` on its own, or a mobile range that
  Australia, Christmas Island and Cocos share), the chat shows chips; it never guesses. Unlike
  libphonenumber, which returns the first matching region, every matching region is offered.
- **Not covered:** zip/postal codes (follow-up), and national trunk prefixes typed after the code
  (`+44 (0)20…` is read as `020…`).

## Regenerate

```sh
mkdir -p /tmp/dialcode-gen && (cd /tmp/dialcode-gen && npm init -y >/dev/null && npm i libphonenumber-js@<version>)
node scripts/chat/build-dialcodes.js --lib /tmp/dialcode-gen/node_modules/libphonenumber-js --date YYYY-MM-DD
node scripts/chat/check-dialcodes.js --lib /tmp/dialcode-gen/node_modules/libphonenumber-js   # expect "mismatches": 0
node tests/test-chat-dialcode.js
```

Output is deterministic for a given library version and `--date`. Do not edit the JSON by hand.
