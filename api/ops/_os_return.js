// api/ops/_os_return.js — send a founder back to /os after signing in through /ops.
// Underscore-prefixed, so Vercel does not treat it as a function.
//
// /os redirects a signed-out visitor to the existing /ops login and sets this short-lived cookie.
// After a successful sign-in, auth.js asks postSignInPath() where to go. The cookie never carries a
// URL: it must equal the fixed value "os", and the answer is one of two fixed paths, so there is
// nothing for a request to inject and no open redirect. No cookie means /ops, exactly as before.

const { buildCookie, parseCookies } = require('./_lib');

const OS_RETURN_COOKIE = 'lavaall-os-return';
const OS_RETURN_VALUE = 'os';
const OS_RETURN_TTL_SEC = 600;

function postSignInPath(req) {
  const cookies = parseCookies(req);
  return cookies[OS_RETURN_COOKIE] === OS_RETURN_VALUE ? '/os' : '/ops';
}

function osReturnCookie(req) {
  return buildCookie(OS_RETURN_COOKIE, OS_RETURN_VALUE, req, OS_RETURN_TTL_SEC);
}

function clearOsReturnCookie(req) {
  return buildCookie(OS_RETURN_COOKIE, '', req, 0);
}

module.exports = {
  OS_RETURN_COOKIE,
  OS_RETURN_TTL_SEC,
  clearOsReturnCookie,
  osReturnCookie,
  postSignInPath,
};
