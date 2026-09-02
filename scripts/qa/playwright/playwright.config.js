// Minimal Playwright config for production-regression.spec.js.
// Run from repo root with:
//   BASE_URL=https://www.lavaall.com npx playwright test --config=scripts/qa/playwright/playwright.config.js
// Requires `npx playwright install chromium` once (needs network access to
// cdn.playwright.dev -- this sandbox's device shell has that blocked by its
// egress allowlist, so this suite has NOT been executed in this environment;
// verification this session was done via a live, human-driven Chromium
// session instead. See LAVAALL_POST_FIX_QA_REPORT for details.
module.exports = {
  testDir: '.',
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: process.env.BASE_URL || 'https://www.lavaall.com',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
    { name: 'mobile-chromium', use: { browserName: 'chromium', viewport: { width: 390, height: 844 } } },
  ],
};
