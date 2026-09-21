// Public Email Us / contact CTAs: Gmail compose primary, optional mailto fallback.
// Link crawl of nav/footer local paths — no new 404s.
const fs = require('fs');
const path = require('path');
const { gmailComposeHref } = require('../assets/js/mail-compose.js');

const root = path.join(__dirname, '..');
const results = [];
function check(name, cond) { results.push({ name, pass: !!cond }); }

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function hrefs(html) {
  const out = [];
  const re = /href="([^"]+)"/gi;
  let match;
  while ((match = re.exec(html))) out.push(match[1].replace(/&amp;/g, '&'));
  return out;
}

function localPathExists(href) {
  if (!href || href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:')) return true;
  if (href.startsWith('#')) return true;
  if (href.startsWith('/#')) return true;
  const file = href.replace(/^\//, '').split('#')[0].split('?')[0];
  if (!file || file === 'ops' || file.startsWith('ops/') || file === 'schedule' || file.startsWith('api/')) return true;
  return fs.existsSync(path.join(root, file));
}

function primaryEmailHrefs(html) {
  return hrefs(html).filter((href) => /@lavaall\.com/.test(href) && !/Open in mail app/i.test(href));
}

function run() {
  check('gmailComposeHref builds view=cm compose URL',
    gmailComposeHref('sales@lavaall.com', 'Quote', 'Hello').startsWith('https://mail.google.com/mail/?view=cm&fs=1&to=sales%40lavaall.com'));

  const index = read('index.html');
  const catalog = read('assets/js/catalog.js');
  const privacy = read('privacy.html');
  const terms = read('terms.html');

  const emailUs = catalog.match(/text: 'Email Us'[\s\S]{0,200}|Email Us[\s\S]{0,80}/);
  check('catalog Email Us uses Gmail web compose, not a bare mailto',
    catalog.includes("text: 'Email Us'")
    && catalog.includes('mail.google.com/mail/?view=cm')
    && /text: 'Email Us'/.test(catalog)
    && !/href: 'mailto:sales@lavaall.com.*text: 'Email Us'/.test(catalog.replace(/\s+/g, ' ')));

  const contactPrimaries = hrefs(index).filter((href) => href.includes('to=support@lavaall.com')
    || href.includes('to=sales@lavaall.com')
    || href.includes('to=orders@lavaall.com')
    || href.includes('to=info@lavaall.com')
    || href.includes('to=contact@lavaall.com'));
  check('index contact CTAs use Gmail compose',
    contactPrimaries.length >= 5 && contactPrimaries.every((href) => href.includes('mail.google.com/mail/?view=cm')));
  check('index primary address text stays the plain mailbox',
    index.includes('>support@lavaall.com<') && index.includes('>sales@lavaall.com<') && index.includes('>info@lavaall.com<'));
  check('index keeps optional Open in mail app mailto',
    /class="ct-mail-app"[^>]+href="mailto:support@lavaall.com"/.test(index));
  check('index coverage / JS email CTA is Gmail compose',
    index.includes("gmailComposeHref('sales@lavaall.com'") || index.includes('mail.google.com/mail/?view=cm&fs=1&to=sales@lavaall.com'));

  check('privacy policy emails use Gmail compose',
    privacy.includes('mail.google.com/mail/?view=cm') && privacy.includes('support@lavaall.com') && privacy.includes('mailto:support@lavaall.com'));
  check('terms emails use Gmail compose',
    terms.includes('mail.google.com/mail/?view=cm') && terms.includes('info@lavaall.com'));

  const crawlFiles = [
    { name: 'index', html: index },
    { name: 'privacy', html: privacy },
    { name: 'terms', html: terms },
  ];
  for (const page of crawlFiles) {
    const navFooter = [];
    const nav = page.html.match(/<nav[\s\S]*?<\/nav>/i);
    const footer = page.html.match(/<footer[\s\S]*?<\/footer>/i);
    if (nav) navFooter.push(...hrefs(nav[0]));
    if (footer) navFooter.push(...hrefs(footer[0]));
    const missing = navFooter.filter((href) => !localPathExists(href));
    check(`${page.name} nav/footer link crawl has no new 404s`, missing.length === 0);
  }

  const leftoverPrimaryMailto = hrefs(index).filter((href) => href.startsWith('mailto:') && !/Open in mail app/i.test(index));
  void leftoverPrimaryMailto;
  check('index has no bare mailto on .ct-email address links',
    !/<a class="ct-email[^"]*" href="mailto:/.test(index));

  void emailUs;
  void primaryEmailHrefs;

  let failed = 0;
  for (const r of results) {
    console.log((r.pass ? 'PASS' : 'FAIL') + ' - ' + r.name);
    if (!r.pass) failed++;
  }
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}

run();
