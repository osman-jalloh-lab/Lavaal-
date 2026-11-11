'use strict';
// Preloaded by run-safe-suite.js. Tests may replace fetch with synthetic mocks.
const net = require('node:net');
const tls = require('node:tls');
const http = require('node:http');
const https = require('node:https');
function local(host) {
  return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(String(host).toLowerCase());
}
function check(args) {
  let host;
  const first = args[0];
  if (typeof first === 'string' && /^https?:/.test(first)) host = new URL(first).hostname;
  else if (first instanceof URL) host = first.hostname;
  else if (first && typeof first === 'object') {
    if (first.path && !first.host && !first.hostname && !first.port) throw new Error('SAFE_TEST: Unix sockets denied');
    host = first.hostname || first.host || 'localhost';
  } else if (typeof first === 'number') host = typeof args[1] === 'string' ? args[1] : 'localhost';
  else throw new Error('SAFE_TEST: unsupported network destination');
  if (!local(host)) throw new Error('SAFE_TEST: non-loopback network denied');
}
function wrap(object, name) {
  const original = object[name];
  object[name] = function (...args) { check(args); return original.apply(this, args); };
}
for (const name of ['connect', 'createConnection']) wrap(net, name);
wrap(net.Socket.prototype, 'connect');
wrap(tls, 'connect');
for (const mod of [http, https]) for (const name of ['request', 'get']) wrap(mod, name);
if (global.fetch) {
  const original = global.fetch;
  global.fetch = function (input, init) { check([typeof input === 'string' || input instanceof URL ? input : input.url]); return original(input, init); };
}
