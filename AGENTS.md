# LAVAALL Repository Instructions

Before any non-trivial task in this repository:

1. Read `/MAGNUM.md` completely.
2. Treat MAGNUM.md as the project's product, visual, catalog, sourcing, media, and architecture source of truth.
3. Inspect the actual implementation before editing.
4. Report material MAGNUM/repository discrepancies before changing production architecture.
5. Complete safe authorized work autonomously.
6. Use parallel agents where work is independent and no two agents write the same file.
7. Respect MAGNUM hard-stop gates.
8. Run relevant tests after changes.
9. Never expose secrets or commit `.env`.

## Running & testing locally

This repo is a static site (`index.html` + `assets/`) plus Vercel serverless
functions under `api/` (the public `/api/quote`, `/api/contact`, `/api/schedule`
endpoints and the private `/ops` LAVAALL OS). There is no `package.json`, no
build step, and no dependencies to install — everything runs on Node (18+; 22 is
used in CI/dev) with only the standard library. `@vercel/functions` is an
optional runtime nicety guarded by try/catch.

- Run the test suite (plain Node scripts that mock `req`/`res`, no server needed):
  `for t in tests/test-*.js; do node "$t" || exit 1; done`
- Serve the whole app locally (static files + `api/**` handlers + `vercel.json`
  rewrites, no Vercel CLI required): `node scripts/dev-server.js 3000`
  then open `http://localhost:3000/` (public marketplace) or
  `http://localhost:3000/ops` (sign-in).
- To demo the private `/ops` OS without email, start the dev server with a
  local throwaway signing secret and instant login enabled (never a real
  production secret): `OPS_AUTH_SECRET=local-dev-secret-32-characters-min
  OPS_INSTANT_LOGIN=1 OPS_AUTH_COOKIE_SECURE=0 node scripts/dev-server.js 3000`,
  then sign in with an allowlisted founder email. Real secrets live only in
  Vercel env vars, never in the repo.
