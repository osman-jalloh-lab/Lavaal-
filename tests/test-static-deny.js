'use strict';
// Local deployment-input and routing regression checks; no network or build upload.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const denied = [
  'MAGNUM.md', 'AGENTS.md', 'HANDOFF.md', 'OTHER_REPORT.md', 'PRODUCTION_EXAMPLE.md', 'future.md',
  'docs/OPS-CEO-BRIDGE.md', 'docs/other/nested.txt', 'docs/ops/private.txt',
  'tests/test-ops-auth.js', 'tests/nested/fixture.json',
  'scripts/booking-scheduler/booking-router.gs', 'scripts/email-router/contact-router.gs', 'scripts/other/tool.js'
];
const allowed = [
  'index.html', 'privacy.html', 'terms.html', 'sitemap.xml', 'robots.txt', 'vercel.json', 'netlify.toml',
  'assets/js/catalog.js', 'images/products/example.webp', 'sierra-leone/index.html',
  'api/ops/index.js', 'api/chat-inquiry.js', 'api/web/_site/index.html', 'mascot/src/index.js',
  'docs/ops/souls/ceo.md', 'docs/ops/souls/nested/future.md'
];
for (const file of [...denied, ...allowed]) {
  const result = spawnSync('git', ['-c', `core.excludesFile=${path.join(root, '.vercelignore')}`,
    'check-ignore', '--no-index', '--quiet', '--', file], { cwd: root, encoding: 'utf8' });
  assert.ok(result.status === 0 || result.status === 1, result.stderr);
  assert.equal(result.status === 0, denied.includes(file), file);
}
const cfg = JSON.parse(read('vercel.json'));
const base = JSON.parse(execFileSync('git', ['show', 'origin/main:vercel.json'], { cwd: root, encoding: 'utf8' }));
assert.deepEqual(cfg.rewrites, base.rewrites);
assert.deepEqual(cfg.redirects, base.redirects);
assert.equal(cfg.functions['api/ops/index.js'].includeFiles, 'docs/ops/souls/**');
for (const source of ['/(.*)', '/', '/ops(.*)']) {
  const policy = cfg.headers.find(h => h.source === source).headers.find(h => h.key === 'Permissions-Policy').value;
  assert.equal(policy, `camera=(), microphone=${source === '/ops(.*)' ? '(self)' : '()'}, geolocation=()`);
}
(async () => {
  // Load the dependency-free ESM middleware without changing this CommonJS repo.
  const middleware = await import(`data:text/javascript;base64,${Buffer.from(read('middleware.js')).toString('base64')}`);
  assert.deepEqual(middleware.config.matcher, ['/docs/:path*', '/tests/:path*', '/scripts/:path*', '/:file([^/]+\\.md)']);
  // Exercise the supported matcher subset against denied and public paths.
  const matches = url => middleware.config.matcher.some(pattern => {
    if (pattern.endsWith('/:path*')) {
      const prefix = pattern.slice(0, -'/:path*'.length);
      return url === prefix || url.startsWith(prefix + '/');
    }
    return new RegExp('^/' + pattern.slice('/:file('.length, -1) + '$').test(url);
  });
  for (const url of ['/docs', '/tests', '/scripts', ...denied.map(f => '/' + f), '/docs/ops/souls/ceo.md']) {
    assert.ok(matches(url), url);
    const response = middleware.default(new Request('https://example.invalid' + url));
    assert.equal(response.status, 404);
    assert.equal(response.headers.get('location'), null);
  }
  for (const url of ['/', '/privacy.html', '/terms.html', '/sitemap.xml', '/robots.txt', '/sierra-leone/',
    '/assets/main.js', '/images/photo.webp', '/api/ops', '/ops', '/os', '/web', '/schedule', '/docs-other']) {
    assert.equal(matches(url), false, url);
  }
  console.log('Static upload exclusions, scoped 404 middleware, policies and preserved routes: PASS');
})().catch(error => { console.error(error); process.exitCode = 1; });
