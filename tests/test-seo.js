// Dependency-free checks for canonical, crawlable Sierra Leone buying guides.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const origin = 'https://www.lavaall.com';
const categories = ['laptops', 'computers', 'networking-equipment', 'it-procurement', 'phones'];
const guidePaths = ['/sierra-leone/', ...categories.map(id => `/sierra-leone/${id}/`)];
const expected = ['/', ...guidePaths, '/privacy.html', '/terms.html'].map(p => origin + p);
let checks = 0;
function check(condition, message) { assert.ok(condition, message); checks++; }
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function attrs(tag) {
  const values = {};
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(["'])([\s\S]*?)\2/g)) values[match[1].toLowerCase()] = match[3].replace(/&amp;/g, '&');
  return values;
}
function tags(html, name) { return [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi'))].map(m => attrs(m[0])); }
function localFile(url) {
  const pathname = new URL(url, origin + '/').pathname;
  return path.join(root, decodeURIComponent(pathname), pathname.endsWith('/') ? 'index.html' : '');
}
function objects(value) {
  if (!value || typeof value !== 'object') return [];
  return [value, ...Object.values(value).flatMap(objects)];
}
try {
  const robots = read('robots.txt');
  check(/^Sitemap:\s*https:\/\/www\.lavaall\.com\/sitemap\.xml\s*$/m.test(robots), 'robots sitemap');
  for (const rule of ['User-agent: *', 'Allow: /', 'Disallow: /ops', 'Disallow: /os', 'Disallow: /api/']) check(robots.split(/\r?\n/).includes(rule), `robots ${rule}`);
  check(/^#.*crawl guidance.*not access control.*sign-in/im.test(robots), 'robots explains access control');
  const sitemap = read('sitemap.xml');
  check(/^\s*<\?xml[^?]*\?>\s*<urlset\s+xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">[\s\S]*<\/urlset>\s*$/.test(sitemap), 'sitemap XML envelope');
  const entries = [...sitemap.matchAll(/<url>\s*<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>\s*<\/url>/g)];
  const locs = entries.map(m => m[1]);
  check(entries.length === 9 && (sitemap.match(/<url>/g) || []).length === entries.length, 'nine well-formed URL entries');
  check(sitemap.replace(/^\s*<\?xml[^?]*\?>\s*<urlset[^>]*>/, '').replace(/<\/urlset>\s*$/, '').replace(/<url>\s*<loc>[^<]+<\/loc>\s*<lastmod>[^<]+<\/lastmod>\s*<\/url>/g, '').trim() === '', 'no unexpected sitemap markup');
  check(JSON.stringify([...locs].sort()) === JSON.stringify([...expected].sort()), 'exact canonical sitemap URLs');
  const titles = new Set();
  const descriptions = new Set();
  for (const entry of entries) {
    const loc = entry[1];
    check(loc.startsWith(origin + '/') && !/\/(?:ops|os|api|web|schedule)(?:\/|$)|#|\/index\.html(?:$|[?#])/.test(loc), `${loc}: indexable URL`);
    check(entry[2] === '2026-11-08', `${loc}: lastmod`);
    const file = localFile(loc);
    check(fs.existsSync(file) && fs.statSync(file).isFile(), `${loc}: file exists`);
    const html = fs.readFileSync(file, 'utf8');
    const canonicals = tags(html, 'link').filter(t => (t.rel || '').toLowerCase() === 'canonical');
    check(canonicals.length === 1 && canonicals[0].href === loc, `${loc}: exactly one matching canonical`);
    const metas = tags(html, 'meta');
    check(metas.some(t => t.name === 'robots' && t.content === 'index,follow'), `${loc}: index robots`);
    const titleMatches = [...html.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>/gi)];
    const title = titleMatches[0]?.[1].trim();
    check(titleMatches.length === 1 && title && !titles.has(title.toLowerCase()), `${loc}: unique nonempty title`);
    titles.add(title.toLowerCase());
    const descriptionTags = metas.filter(t => t.name === 'description');
    const description = descriptionTags[0]?.content.trim();
    check(descriptionTags.length === 1 && description && !descriptions.has(description.toLowerCase()), `${loc}: unique nonempty description`);
    descriptions.add(description.toLowerCase());
    check((html.match(/<h1\b/gi) || []).length === 1, `${loc}: exactly one h1`);
    const schema = [];
    for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (attrs(match[1]).type !== 'application/ld+json') continue;
      const value = JSON.parse(match[2]);
      check(true, `${loc}: JSON-LD parses`);
      schema.push(...objects(value));
    }
    check(schema.every(obj => Object.keys(obj).every(key => !/^(?:offers|price|aggregateRating|review|availability)$/i.test(key))), `${loc}: no commerce/review schema keys`);
    const pathname = new URL(loc).pathname;
    if (!guidePaths.includes(pathname)) continue;
    if (['/sierra-leone/computers/', '/sierra-leone/it-procurement/'].includes(pathname)) check(description.length <= 155, `${loc}: description at most 155 characters`);
    check(schema.every(obj => !obj['@type'] || [obj['@type']].flat().every(type => ['Organization', 'WebPage', 'CollectionPage', 'BreadcrumbList', 'ListItem'].includes(type))), `${loc}: permitted guide schema types`);
    check(schema.every(obj => !('address' in obj)), `${loc}: no guide address schema`);
    check(schema.every(obj => !('telephone' in obj) || obj.telephone === '+1-737-704-4182'), `${loc}: only founder-approved telephone (+1-737-704-4182)`);
    const breadcrumbs = schema.filter(obj => obj['@type'] === 'BreadcrumbList');
    check(breadcrumbs.length === 1 && breadcrumbs[0].itemListElement?.at(-1)?.item === loc, `${loc}: matching final breadcrumb`);
    const links = tags(html, 'a').map(t => t.href);
    check(links.includes('/sierra-leone/'), `${loc}: hub link`);
    const id = pathname.split('/')[2];
    if (id) check(links.includes('/#signup'), `${loc}: Request Quote CTA`);
    for (const ref of [...tags(html, 'a').map(t => t.href), ...tags(html, 'link').map(t => t.href), ...tags(html, 'img').map(t => t.src), ...tags(html, 'script').map(t => t.src), ...tags(html, 'source').map(t => t.srcset)].filter(Boolean)) {
      if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(ref)) continue;
      const target = new URL(ref, loc);
      const targetFile = localFile(target.href);
      check(fs.existsSync(targetFile) && fs.statSync(targetFile).isFile(), `${loc}: local reference ${ref}`);
    }
    const text = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const APPROVED_247 = 'We\u0027re reachable 24/7 on WhatsApp and email';
    check(!/\b(?:in stock|since 2018|24\/7|certified|authori[sz]ed (?:dealer|partner|reseller))\b|\b(?:200|500)\+/i.test(text.split(APPROVED_247).join(' ')), `${loc}: no unsupported claims (only founder-approved 24/7 line)`);
    check(!/\$\s*\d|\bLe\s+\d/i.test(text), `${loc}: no currency amounts`);
  }
  const homeHtml = read('index.html');
  check(!homeHtml.includes('+232-76-658-960'), 'homepage JSON-LD no longer uses superseded +232-76-658-960');
  check(homeHtml.includes('"telephone": "+1-737-704-4182"'), 'homepage JSON-LD uses founder-approved telephone');
  check(!/URLSearchParams\(window\.location\.search\)\.get\('sourcing'\)/.test(homeHtml), 'no quote-form changes in this PR');
  const homeLinks = tags(homeHtml, 'a').map(t => t.href);
  for (const guide of guidePaths) check(homeLinks.includes(guide), `homepage links to ${guide}`);
  console.log(`ok ${checks} checks`);
} catch (error) {
  console.error(`FAIL after ${checks} checks: ${error.message}`);
  process.exitCode = 1;
}
