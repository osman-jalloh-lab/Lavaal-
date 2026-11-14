#!/usr/bin/env node
'use strict';
/*
 * Generates the public LAVAALL Assistant knowledge pack from sources that already exist.
 * Nothing in the pack is typed by hand: every fact is read from a public source file.
 *
 *   node scripts/build-assistant-knowledge.js          # write api/_chat/knowledge/pack.v1.json
 *   node scripts/build-assistant-knowledge.js --check  # exit 1 if the committed pack is stale
 *
 * Sources (all public / already customer-facing):
 *   index.html (English copy dictionary + coverage map), assets/js/catalog-data.js and
 *   assets/data/catalog-generated.json (via api/_chat/catalog.js), docs/customer-assistant/kb-technology.md,
 *   api/web/_site/content/en.json, and the policy strings exported by api/_chat/responder.js and llm-responder.js.
 * Optional cross-check: the "do-not-say" lists in /workspace/lavaall-chatbot-plan/kb-technology.md and kb-web.md
 *   (only the guardrail bullets are read; personas, voice ids and ops notes are ignored).
 *
 * Never read: docs/ops/souls/*, MAGNUM.md internals, lead sheets, OPS notes, unapproved pricing research.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'api/_chat/knowledge/pack.v1.json');
const PLAN_DIR = process.env.LAVAALL_PLAN_DIR || '/workspace/lavaall-chatbot-plan';
const FORBIDDEN_SOURCES = [/docs[\\/]ops[\\/]souls/i, /SOUL_/i, /_SHARED_CONTEXT/i, /leads?\b.*\.(xlsx|csv)$/i];

const sha = text => crypto.createHash('sha256').update(text).digest('hex');
const rel = file => path.relative(ROOT, file).split(path.sep).join('/');
const sources = [];
const isForbiddenSource = file => FORBIDDEN_SOURCES.some(re => re.test(String(file)));
function read(file, { optional = false } = {}) {
  if (isForbiddenSource(file)) throw new Error('forbidden knowledge source: ' + file);
  if (optional && !fs.existsSync(file)) return null;
  const text = fs.readFileSync(file, 'utf8');
  sources.push({ path: file.startsWith(ROOT) ? rel(file) : file.replace(PLAN_DIR, '<plan>'), sha256: sha(text) });
  return text;
}

function decode(html) {
  return String(html)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&#8594;/g, '→').replace(/&nbsp;/g, ' ')
    .replace(/\\'/g, "'")
    .replace(/\s+/g, ' ').trim();
}
function listItems(html) {
  return [...String(html).matchAll(/<li>(.*?)<\/li>/g)].map(m => decode(m[1]));
}
// Time promises are not allowed in the bot (kb-technology.md: "no timing promises").
const TIME_PROMISE = /\s*within \d+ hours/gi;
function noTimePromise(text) {
  return text.replace(/\s*[—-]\s*our team responds within \d+ hours/gi, '')
    .replace(TIME_PROMISE, '').replace(/\s+([.,])/g, '$1');
}

function englishDictionary(html) {
  const start = html.indexOf('\n  en:{', html.indexOf('/* HERO */') - 4000);
  const end = html.indexOf('\n  fr:{', start);
  if (start < 0 || end < 0) throw new Error('index.html English dictionary not found');
  const dict = {};
  for (const m of html.slice(start, end).matchAll(/'([a-z0-9.]+)':'((?:[^'\\]|\\.)*)'/gi)) dict[m[1]] = m[2];
  return dict;
}

function coverage(html) {
  const start = html.indexOf('const covData={');
  const block = html.slice(start, html.indexOf('\n};', start));
  const countries = [];
  for (const code of ['sl', 'gn', 'gw']) {
    const m = block.match(new RegExp('\\b' + code + ":\\{flag:'[^']*',en:\\{name:'([^']+)',text:'([^']+)'\\}"));
    if (m) countries.push({ code, name: m[1], text: m[2] });
  }
  const branches = [...block.matchAll(/\{city:'([^']+)',address:'([^']+)'/g)].map(m => ({ city: m[1], address: m[2] }));
  return { countries, branches };
}

function kbTechnology(md) {
  const [intro] = md.split('## Ten suggested questions');
  const paragraphs = intro.split(/\n\s*\n/).map(p => p.trim())
    .filter(p => p && !p.startsWith('#') && !/^Sanitized A1 review artifact/.test(p));
  const qa = [...md.matchAll(/^\d+\.\s+\*\*(.+?)\*\*\s+(.+)$/gm)].map(m => ({ q: m[1].trim(), a: m[2].trim() }));
  return { paragraphs, qa };
}

function planGuardrails(md) {
  if (!md) return [];
  const section = md.split(/^## \d+\. Gaps and do-not-say list/m)[1];
  if (!section) return [];
  return section.split('\n').filter(line => /^- /.test(line)).map(line => line.slice(2).replace(/`/g, '').trim())
    // Internal flags/env names are not customer copy.
    .filter(line => !/[A-Z_]{6,}_[A-Z]+/.test(line) && !/\bFR-\d+/.test(line));
}

const { terms: keywords } = require(path.join(ROOT, 'api/_chat/knowledge/terms.js'));
function fact(id, topic, text, extra = {}) {
  return { id, topic, text, keywords: keywords(topic, text, extra.alias || ''), source: extra.source };
}

function build() {
  sources.length = 0;
  const html = read(path.join(ROOT, 'index.html'));
  const en = englishDictionary(html);
  const cov = coverage(html);
  const kb = kbTechnology(read(path.join(ROOT, 'docs/customer-assistant/kb-technology.md')));
  read(path.join(ROOT, 'assets/js/catalog-data.js'));
  read(path.join(ROOT, 'assets/data/catalog-generated.json'));
  const webCopy = JSON.parse(read(path.join(ROOT, 'api/web/_site/content/en.json')));
  read(path.join(ROOT, 'api/_chat/responder.js'));
  read(path.join(ROOT, 'api/_chat/llm-responder.js'));
  const { REACHABILITY, EMAIL, WHATSAPP } = require(path.join(ROOT, 'api/_chat/responder.js'));
  const { PHRASES } = require(path.join(ROOT, 'api/_chat/llm-responder.js'));
  const { loadCatalog } = require(path.join(ROOT, 'api/_chat/catalog.js'));
  const planTech = read(path.join(PLAN_DIR, 'kb-technology.md'), { optional: true });
  const planWeb = read(path.join(PLAN_DIR, 'kb-web.md'), { optional: true });

  const contact = { email: EMAIL, whatsapp: WHATSAPP, reachability: REACHABILITY };
  const contactLine = REACHABILITY + ': **' + EMAIL + '** or WhatsApp **' + WHATSAPP + '**.';
  const missing = {
    technology: "I don't have that information. I can pass your question to our team with a quick form, or you can reach us on " + 'email **' + EMAIL + '** or WhatsApp **' + WHATSAPP + '**.',
    web: "I don't have that information about LAVAALL Web. You can reach the team on email **" + EMAIL + '** or WhatsApp **' + WHATSAPP + '**.',
  };

  // ── Technology facts ─────────────────────────────────────────────
  const tech = [];
  const S_INDEX = 'index.html';
  tech.push(fact('about', 'about LAVAALL who we are what do you do', decode(en['hero.p']), { source: S_INDEX }));
  tech.push(fact('about-b2b', 'business customers B2B enterprise', decode(en['hero.badge']) + '.', { source: S_INDEX }));
  for (let i = 1; i <= 6; i++) {
    const title = decode(en['srv' + i + '.h3']);
    tech.push(fact('service-' + i, title, '**' + title + '**: ' + decode(en['srv' + i + '.p']) + ' Includes: ' + listItems(en['srv' + i + '.ul']).join('; ') + '.', { source: S_INDEX }));
  }
  for (const c of cov.countries) tech.push(fact('coverage-' + c.code, 'coverage where operate country ' + c.name, '**' + c.name + '**: ' + c.text, { source: S_INDEX }));
  if (cov.branches.length) {
    tech.push(fact('branches', 'branches branch office location near me address Sierra Leone',
      'Sierra Leone branches: ' + cov.branches.map(b => b.city + ' (' + b.address + ')').join(', ') + '.', { source: S_INDEX }));
  }
  const industries = Object.keys(en).filter(k => /^ind\d+$/.test(k)).sort().map(k => decode(en[k]));
  tech.push(fact('industries', 'industries sectors who we serve', 'Industries we serve: ' + industries.join(', ') + '.', { source: S_INDEX }));
  for (let i = 1; en['faq.q' + i]; i++) {
    tech.push(fact('faq-' + i, decode(en['faq.q' + i]), noTimePromise(decode(en['faq.a' + i])), { source: S_INDEX }));
  }
  kb.paragraphs.forEach((p, i) => tech.push(fact('policy-' + (i + 1), '', p.replace(/“|”/g, '"'), { source: 'docs/customer-assistant/kb-technology.md' })));
  kb.qa.forEach((item, i) => tech.push(fact('qa-' + (i + 1), item.q, item.a, { source: 'docs/customer-assistant/kb-technology.md' })));

  // Catalogue summary: categories, counts and brands only. No prices exist in the catalogue and none are added.
  const catalog = loadCatalog();
  const byCategory = new Map();
  for (const p of catalog.products) {
    const entry = byCategory.get(p.categoryId) || { categoryId: p.categoryId, category: p.category, count: 0, brands: new Map() };
    entry.count++;
    const brand = String(p.brand || '').trim();
    if (brand && !/^various$/i.test(brand)) {
      // Merge case variants (DELL / Dell) under the first spelling seen.
      const known = [...entry.brands.keys()].find(b => b.toLowerCase() === brand.toLowerCase()) || brand;
      entry.brands.set(known, (entry.brands.get(known) || 0) + 1);
    }
    byCategory.set(p.categoryId, entry);
  }
  const categories = [...byCategory.values()].sort((a, b) => b.count - a.count || a.categoryId.localeCompare(b.categoryId)).map(c => ({
    categoryId: c.categoryId, category: c.category, products: c.count,
    brands: [...c.brands.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8).map(([b]) => b),
  }));
  for (const c of categories) {
    tech.push(fact('catalog-' + c.categoryId, c.category + ' catalogue brands',
      'Our public catalogue has ' + c.products + ' entries under **' + c.category + '**' + (c.brands.length ? ', from brands including ' + c.brands.join(', ') : '') + '. A listing is not a stock or price confirmation.',
      { source: 'api/_chat/catalog.js (catalog-data.js + catalog-generated.json)', alias: c.categoryId }));
  }

  // ── Web facts (stub: not mounted until A4 is approved) ─────────────
  const web = [];
  const S_WEB = 'api/web/_site/content/en.json';
  web.push(fact('web-about', 'about LAVAALL Web', webCopy.meta.description + ' ' + webCopy.footer.line, { source: S_WEB }));
  web.push(fact('web-hero', 'what LAVAALL Web does', webCopy.hero.sub, { source: S_WEB }));
  for (const item of webCopy.capabilities.items || []) web.push(fact('web-cap-' + item.id, item.title, '**' + item.title + '**: ' + item.text, { source: S_WEB }));
  for (const item of webCopy.work.items || []) web.push(fact('web-work-' + item.id, item.name + ' ' + item.kind, '**' + item.name + '** (' + item.kind + '): ' + item.text, { source: S_WEB }));
  web.push(fact('web-trust', 'approval agents draft', webCopy.demos.trust, { source: S_WEB }));
  web.push(fact('web-demos', 'demos illustrative', webCopy.demos.sub, { source: S_WEB }));
  for (const point of webCopy.region.points || []) web.push(fact('web-region-' + keywords(point.title)[0], point.title, point.title + ': ' + point.text, { source: S_WEB }));
  web.push(fact('web-contact', 'contact email', 'LAVAALL Web projects, support and general questions: ' + [...new Set(webCopy.contact.roles.map(r => r.email))].join(', ') + '.', { source: S_WEB }));

  const pack = {
    name: 'lavaall-assistant-public-knowledge',
    version: 1,
    note: 'GENERATED by scripts/build-assistant-knowledge.js. Do not edit by hand. Public facts only; no prices, stock, timing promises, internal notes or customer data.',
    contact,
    contactLine,
    missing,
    behaviour: [
      'Answer directly in 1-3 short sentences, then ask one natural follow-up question.',
      'Narrow every product line by family, then model, then color, one question at a time.',
      'Put the key words (product, model, color, contact) in **bold**.',
      'Do not carry an earlier topic into a new question.',
      'Krio means Sierra Leone Krio. Never use Haitian Creole.',
      'Use only the verified facts and catalogue entries. If the answer is not there, say so plainly and offer the form or contact.',
      'Never invent prices, stock, delivery dates, customers or claims.',
    ],
    policy: {
      noPrice: PHRASES.noPrice.en,
      noConfirm: PHRASES.noConfirm.en,
      notListed: PHRASES.notListed.en,
      bulk: PHRASES.bulk.en,
      hours: PHRASES.hours.en,
      offTopic: PHRASES.offTopic.en,
    },
    sections: {
      technology: { site: 'technology', route: '/', mounted: true, categories, facts: tech },
      web: { site: 'web', route: '/web', mounted: false, stub: true, reason: 'LAVAALL Web assistant (A4) not approved; section is generated but not served.', facts: web },
    },
    guardrails: {
      excluded: ['homepage statistics (200+ clients, 500+ projects, 4 countries, since 2018) until Osman confirms', 'response-time promises such as "within 24 hours"', 'prices, discounts, stock counts, delivery dates', 'docs/ops/souls and any internal notes'],
      technology: planGuardrails(planTech),
      web: planGuardrails(planWeb),
    },
    sources: sources.slice().sort((a, b) => a.path.localeCompare(b.path)),
  };
  pack.contentHash = sha(JSON.stringify({ ...pack, sources: undefined }));
  return pack;
}

function serialize(pack) { return JSON.stringify(pack, null, 2) + '\n'; }

if (require.main === module) {
  const text = serialize(build());
  if (process.argv.includes('--check')) {
    const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (current !== text) { console.error('knowledge pack is stale: run node scripts/build-assistant-knowledge.js'); process.exit(1); }
    console.log('knowledge pack is up to date');
  } else {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, text);
    const pack = JSON.parse(text);
    console.log('wrote', rel(OUT), 'tech facts', pack.sections.technology.facts.length, 'web facts', pack.sections.web.facts.length);
  }
}

module.exports = { build, serialize, OUT, PLAN_DIR, noTimePromise, isForbiddenSource };
