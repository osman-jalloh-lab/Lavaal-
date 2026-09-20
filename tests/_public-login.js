// Shared assertions for the discreet public Login → /ops control.
// Request Quote stays the primary marketing CTA; /ops must not join that row.

function attr(tag, name) {
  const match = new RegExp('\\b' + name + '="([^"]*)"', 'i').exec(tag);
  return match ? match[1] : '';
}

function anchors(html) {
  const tags = html.match(/<a\b[^>]*>[\s\S]*?<\/a>/gi) || [];
  return tags.map((tag) => {
    const open = tag.match(/<a\b[^>]*>/i)[0];
    return {
      href: attr(open, 'href'),
      className: attr(open, 'class'),
      i18n: attr(open, 'data-i18n'),
      text: tag.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    };
  });
}

function capture(html, pattern) {
  const match = html.match(pattern);
  return match ? match[0] : '';
}

function assertPublicLogin(check, html, label) {
  const prefix = label ? label + ': ' : '';
  const links = anchors(html);
  const loginLinks = links.filter((a) => a.href === '/ops');
  const quoteCtas = links.filter((a) => a.className.split(/\s+/).includes('nav-cta'));
  const hero = html.match(/<div class="btns">[\s\S]*?<\/div>/);
  const marketing = new Set(['nav-cta', 'drawer-cta', 'bp']);
  const navLinks = capture(html, /<ul class="nav-links">[\s\S]*?<\/ul>/);
  const navRight = capture(html, /<div class="nav-r">[\s\S]*?<\/div>\s*<\/nav>/);
  const drawer = capture(html, /<div class="nav-mobile-drawer"[\s\S]*?<\/div>/);
  const navOrder = anchors(navLinks).map((a) => a.text.replace(/ →/g, '').trim());
  const drawerOrder = anchors(drawer).map((a) => a.text.replace(/ →/g, '').trim());

  check(prefix + 'public catalog remains ungated', html.includes('Enterprise IT Hardware'));
  check(prefix + 'Login control links to /ops',
    loginLinks.length > 0
    && loginLinks.every((a) => a.i18n === 'nav.login' || /^Login$/i.test(a.text)));
  check(prefix + 'Login appears in header and footer',
    /class="nav-login"[^>]*href="\/ops"|href="\/ops"[^>]*class="nav-login"/.test(html)
    && /class="flegal"[\s\S]*href="\/ops"/.test(html));
  check(prefix + 'desktop Login sits in the quiet nav-link row',
    /href="\/ops"[^>]*class="nav-login"|class="nav-login"[^>]*href="\/ops"/.test(navLinks)
    && navOrder.join('|') === 'Services|Products|Coverage|Login|Contact'
    && !/href="\/ops"/.test(navRight)
    && !/\bnav-cta\b/.test(navLinks));
  check(prefix + 'mobile Login sits with drawer links, not as a second CTA',
    /class="drawer-login"[^>]*href="\/ops"|href="\/ops"[^>]*class="drawer-login"/.test(drawer)
    && drawerOrder.join('|') === 'Services|Products|Coverage|Login|Contact|Request Quote'
    && drawer.indexOf('drawer-login') < drawer.indexOf('drawer-cta'));
  check(prefix + 'Request Quote remains the primary nav CTA',
    quoteCtas.length > 0
    && quoteCtas.every((a) => /#signup$/.test(a.href))
    && quoteCtas.some((a) => /Request Quote/i.test(a.text)));
  check(prefix + '/ops is not a marketing CTA',
    loginLinks.every((a) => !a.className.split(/\s+/).some((c) => marketing.has(c)))
    && !(hero && /href="\/ops"/.test(hero[0])));
}

module.exports = { assertPublicLogin };
