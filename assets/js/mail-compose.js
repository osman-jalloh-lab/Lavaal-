// Shared Gmail web-compose URLs for public Email Us / contact CTAs.
// Primary: Gmail compose (works on desktop + phone when the visitor is signed in).
// Optional fallback: a plain mailto: "Open in mail app" link next to the address.

(function (root) {
  function gmailComposeHref(to, su, body) {
    const params = new URLSearchParams();
    params.set('view', 'cm');
    params.set('fs', '1');
    params.set('to', String(to || '').trim());
    if (su) params.set('su', String(su));
    if (body) params.set('body', String(body));
    return 'https://mail.google.com/mail/?' + params.toString();
  }

  root.gmailComposeHref = gmailComposeHref;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { gmailComposeHref };
  }
})(typeof window !== 'undefined' ? window : globalThis);
