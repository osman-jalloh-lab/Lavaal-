'use strict';

// Cloudflare's public always-pass visible test sitekey keeps previews usable.
const TEST_SITE_KEY = '1x00000000000000000000AA';
module.exports = function turnstileConfig(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    siteKey: (process.env.TURNSTILE_SITE_KEY || '').trim() || TEST_SITE_KEY,
    enforced: Boolean((process.env.TURNSTILE_SECRET_KEY || '').trim()),
  });
};
