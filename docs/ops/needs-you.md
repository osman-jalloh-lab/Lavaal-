# Needs You dashboard

The merged `/ops` dashboard puts proposals, open L3/L4 decisions and routine health in one inbox, followed by goals, tasks and notes. It uses the light Option I palette. Other `/ops` areas and `/os` keep their existing behavior.

`OPS_NEEDS_YOU_ENABLED` defaults to off. Only `1`, `true` and `on` (case-insensitive) enable it, from the server environment only. Enable it on Preview only. Founder sign-in and the existing allowlist still apply.

Stage 1 is mock-only: every displayed item is synthetic, with a visible sample banner and sample labels. The page reads no store, feeds or network. Approve, Dismiss, Add a task and Add a note verify CSRF and show a sample notice without saving anything. Decisions and routines link to their existing views.

Authentication is unchanged: if existing sign-in hardening is enabled, its session-generation check may still access its auth storage before rendering. The mock dashboard does not load live application data or the private-message badge.

For authenticated founders outside production, `?mock=empty` and `?mock=error` select synthetic verification states while the flag is enabled. They cannot enable the flag, and production ignores the selector.

Later stages will connect and verify live data and actions before the Stage 4 cutover. Stage 1 does not implement those stages or change the live `/os` theme.

Nothing needs JavaScript in Stage 1. Navigation, the inbox and all forms are server-rendered HTML and work with JavaScript disabled.

The phone menu uses native `details`/`summary`, with no JavaScript.
Both logos use the existing `/images/logo.webp|png` assets.
Clash Display loads through the Fontshare API under the ITF Free Font License; it is not self-hosted because the FFL forbids making font files available via publicly accessible repositories.
