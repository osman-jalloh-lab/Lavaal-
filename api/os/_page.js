// api/os/_page.js — server-rendered shell for LAVAALL OS (/os).
// Underscore-prefixed, so Vercel does not treat it as a function.
// Scripts are served from /os/app.js (script-src 'self'); data travels in an
// inline JSON block, which the CSP does not execute.

const { escapeHtml } = require('../ops/_lib');

const OS_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

function embedJson(value) {
  // Keep the JSON block inert: no "<" (closes script tags), no U+2028/2029 line separators.
  const bs = String.fromCharCode(92);
  return JSON.stringify(value)
    .split('<').join(bs + 'u003c')
    .split(String.fromCharCode(0x2028)).join(bs + 'u2028')
    .split(String.fromCharCode(0x2029)).join(bs + 'u2029');
}

function osPage({ email, data }) {
  const safeEmail = escapeHtml(email || '');
  const payload = Object.assign({ me: { email: email || '' } }, data);
  return `<!DOCTYPE html>
<html lang="en" class="os-root" data-theme="dark">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<meta name="robots" content="noindex,nofollow"/>
<meta name="color-scheme" content="dark light"/>
<title>LAVAALL OS</title>
<link rel="icon" href="/images/logo.png"/>
<link rel="preconnect" href="https://fonts.googleapis.com" crossorigin/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet"/>
<link rel="stylesheet" href="/os/app.css"/>
</head>
<body>
<aside class="side" id="side">
  <div class="brand">
    <picture>
      <source srcset="/images/logo.webp" type="image/webp"/>
      <img class="brand-logo" src="/images/logo.png" alt="LAVAALL" width="140" height="36"/>
    </picture>
    <small>OS</small>
  </div>
  <button class="search" id="side-search" type="button">${'<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>'}Search or jump to<kbd>&#8984;K</kbd></button>
  <nav class="nav" id="nav" aria-label="LAVAALL OS"></nav>
  <div class="me">
    <div class="av" id="me-av" aria-hidden="true"></div>
    <div class="me-id"><div class="me-email" title="${safeEmail}">${safeEmail}</div><div class="me-sub">Founder</div></div>
    <button class="ib" id="side-theme" type="button" title="Toggle theme (T)" aria-label="Toggle theme"></button>
  </div>
  <form class="signout" method="POST" action="/api/ops/auth"><input type="hidden" name="action" value="logout"/><button type="submit">Sign out</button></form>
</aside>
<main>
  <header>
    <div class="crumb">LAVAALL / <b id="crumb">Home</b></div>
    <div class="hdr-r">
      <span class="clock hide-m" id="clock"></span>
      <button class="ib" id="hdr-pal" type="button" title="Command palette" aria-label="Command palette"></button>
      <button class="ib" id="hdr-theme" type="button" title="Toggle theme" aria-label="Toggle theme"></button>
    </div>
  </header>
  <div id="view" tabindex="-1"></div>
</main>
<nav class="tabbar" id="tabbar" aria-label="Primary"></nav>
<div class="scrim" id="scrim"></div>
<aside class="drawer" id="drawer" aria-hidden="true"></aside>
<div class="pal" id="pal" role="dialog" aria-modal="true" aria-label="Command palette">
  <div class="pbox"><input id="pq" placeholder="Type a command or search..." autocomplete="off" aria-label="Command"/><div id="plist" class="plist"></div></div>
</div>
<div id="toasts" aria-live="polite"></div>
<noscript><p class="noscript">LAVAALL OS needs JavaScript.</p></noscript>
<script type="application/json" id="os-data">${embedJson(payload)}</script>
<script src="/os/app.js"></script>
</body>
</html>`;
}

module.exports = { OS_CSP, embedJson, osPage };
