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

function assertPublicLogin(check, html, label) {
  const prefix = label ? label + ': ' : '';
  const links = anchors(html);
  const loginLinks = links.filter((a) => a.href === '/ops');
  const quoteCtas = links.filter((a) => a.className.split(/\s+/).includes('nav-cta'));
  const hero = html.match(/<div class="btns">[\s\S]*?<\/div>/);
  const marketing = new Set(['nav-cta', 'drawer-cta', 'bp']);

  check(prefix + 'public catalog remains ungated', html.includes('Enterprise IT Hardware'));
  check(prefix + 'Login control links to /ops',
    loginLinks.length > 0
    && loginLinks.every((a) => a.i18n === 'nav.login' || /^Login$/i.test(a.text)));
  check(prefix + 'Login appears in header and footer',
    /class="nav-login"[^>]*href="\/ops"|href="\/ops"[^>]*class="nav-login"/.test(html)
    && /class="flegal"[\s\S]*href="\/ops"/.test(html));
  check(prefix + 'Request Quote remains the primary nav CTA',
    quoteCtas.length > 0
    && quoteCtas.every((a) => /#signup$/.test(a.href))
    && quoteCtas.some((a) => /Request Quote/i.test(a.text)));
  check(prefix + '/ops is not a marketing CTA',
    loginLinks.every((a) => !a.className.split(/\s+/).some((c) => marketing.has(c)))
    && !(hero && /href="\/ops"/.test(hero[0])));
}

module.exports = { assertPublicLogin };
