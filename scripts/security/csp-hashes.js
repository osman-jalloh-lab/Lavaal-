#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const pages = ['index.html', 'privacy.html', 'terms.html'];

function hashInline(text) {
  return "'sha256-" + crypto.createHash('sha256').update(text, 'utf8').digest('base64') + "'";
}

function decodeAttribute(value) {
  const entities = { quot: '"', amp: '&', '#39': "'", lt: '<', gt: '>' };
  // One pass: &amp;quot; decodes to &quot;, not a double quote.
  return value.replace(/&(quot|amp|#39|lt|gt);/g, (_, name) => entities[name]);
}

function collectInline(html) {
  const scripts = [];
  const handlers = [];
  // Consume script bodies and comments whole so their contents aren't read as tags.
  const tags = /<!--[\s\S]*?-->|<script\b((?:"[^"]*"|'[^']*'|[^'">])*)>([\s\S]*?)<\/script\s*>|<[a-z][a-z0-9:-]*\b(?:"[^"]*"|'[^']*'|[^'">])*>/gi;
  for (const match of html.matchAll(tags)) {
    if (match[0].startsWith('<!--')) continue;
    const attributes = match[1] === undefined ? match[0].replace(/^<[^\s>]+/, '') : match[1];
    const attrs = [...attributes.matchAll(/([^\s=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)];
    for (const attr of attrs) {
      if (/^on[a-z]+$/i.test(attr[1])) handlers.push(decodeAttribute(attr[2] ?? attr[3] ?? attr[4] ?? ''));
    }
    if (match[1] !== undefined) {
      const src = attrs.find((a) => a[1].toLowerCase() === 'src');
      const type = attrs.find((a) => a[1].toLowerCase() === 'type');
      const mime = type ? decodeAttribute(type[2] ?? type[3] ?? type[4] ?? '').trim().toLowerCase() : '';
      if (!src && (!mime || mime === 'module' || /^(?:text|application)\/(?:x-)?(?:java|ecma)script(?:;.*)?$/.test(mime))) scripts.push(match[2]);
    }
  }
  return { scripts, handlers };
}

function buildReportOnlyPolicy() {
  const collected = pages.map((file) => collectInline(fs.readFileSync(path.join(root, file), 'utf8')));
  const hashes = (key) => [...new Set(collected.flatMap((page) => page[key].map(hashInline)))].join(' ');
  return "default-src 'self'; script-src 'self' " + hashes('scripts') + " 'unsafe-hashes' " + hashes('handlers') + " https://cdn.jsdelivr.net https://fonts.googleapis.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' https://images.unsplash.com https://i.ytimg.com data: blob:; font-src 'self' https://fonts.gstatic.com; connect-src 'self'; frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com; object-src 'none'; base-uri 'self'; form-action 'self'";
}

if (require.main === module) {
  for (const file of pages) {
    const inline = collectInline(fs.readFileSync(path.join(root, file), 'utf8'));
    for (const key of ['scripts', 'handlers']) {
      inline[key].forEach((value, i) => console.log(`${file} ${key} ${i + 1}: ${hashInline(value)}`));
    }
  }
  console.log('\n' + buildReportOnlyPolicy());
}

module.exports = { buildReportOnlyPolicy, collectInline, hashInline };
