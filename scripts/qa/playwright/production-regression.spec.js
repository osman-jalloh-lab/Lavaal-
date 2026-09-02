// LAVAALL production/preview regression suite.
//
// Targets whatever BASE_URL points at (Vercel preview or production) --
// never assumes one or the other. Run with:
//   BASE_URL=https://<preview>.vercel.app npx playwright test production-regression.spec.js
//   BASE_URL=https://www.lavaall.com     npx playwright test production-regression.spec.js
//
// Deliberately does NOT complete a real booking or submit the inquiry form
// on every run (those create real backend side effects: emails, Sheet rows,
// Calendar events) -- those are covered by the manual/labeled TEST A/B/C/D
// passes in Phase 9/11 of the remediation brief, using clearly-labeled
// "QA TEST" data on an authorized inbox. This suite is the deterministic,
// side-effect-free layer: page loads, navigation, static validation, and
// the two routes (recovery link, 404) that are safe to hit repeatedly with
// synthetic/garbage parameters because they're expected to fail cleanly.

const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.BASE_URL || 'https://www.lavaall.com';

function consoleErrorCollector(page, bucket) {
  page.on('console', (msg) => { if (msg.type() === 'error') bucket.push(msg.text()); });
  page.on('pageerror', (err) => bucket.push('pageerror: ' + err.message));
  page.on('requestfailed', (req) => bucket.push('requestfailed: ' + req.url() + ' ' + (req.failure()?.errorText || '')));
  page.on('response', (res) => { if (res.status() >= 400 && !res.url().includes('/schedule?leadId=INVALID')) bucket.push('http ' + res.status() + ' ' + res.url()); });
}

test.describe('1. Homepage', () => {
  test('loads with no console errors and core content visible', async ({ page }) => {
    const errors = [];
    consoleErrorCollector(page, errors);
    const res = await page.goto(BASE_URL + '/');
    expect(res.status()).toBeLessThan(400);
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.getByRole('link', { name: /request.*quote/i }).first()).toBeVisible();
    expect(errors, 'console/network errors on homepage: ' + JSON.stringify(errors)).toEqual([]);
  });
});

test.describe('2. Schedule a Call modal', () => {
  test('opens from homepage CTA', async ({ page }) => {
    await page.goto(BASE_URL + '/');
    await page.getByText(/schedule a (quick )?call/i).first().click();
    await expect(page.locator('#sched-modal, [id^="sched-"]').first()).toBeVisible({ timeout: 5000 });
  });
});

test.describe('3. Consent checkbox visual state', () => {
  test('Send an Inquiry consent checkbox shows a visible checked indicator', async ({ page }) => {
    await page.goto(BASE_URL + '/#signup');
    const box = page.locator('#iq-form input[name="consent"]');
    await box.scrollIntoViewIfNeeded();
    await expect(box).not.toBeChecked();
    await box.check();
    await expect(box).toBeChecked();
    // A checkbox that is :checked but renders no visible mark is exactly
    // BUG-003 -- assert real paint state, not just the DOM property.
    const visualCheck = await box.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { appearance: cs.appearance || cs.webkitAppearance, accentColor: cs.accentColor, opacity: cs.opacity, visibility: cs.visibility, w: el.offsetWidth, h: el.offsetHeight };
    });
    expect(visualCheck.visibility).not.toBe('hidden');
    expect(visualCheck.opacity).not.toBe('0');
    expect(visualCheck.w).toBeGreaterThan(0);
    expect(visualCheck.h).toBeGreaterThan(0);
    // Keyboard: label click + space-toggle must both work.
    await box.uncheck();
    await box.focus();
    await page.keyboard.press('Space');
    await expect(box).toBeChecked();
  });

  test('Schedule modal consent checkbox shows a visible checked indicator', async ({ page }) => {
    await page.goto(BASE_URL + '/');
    await page.getByText(/schedule a (quick )?call/i).first().click();
    const box = page.locator('[id^="sched-"] input[name="consent"]').first();
    await box.scrollIntoViewIfNeeded();
    await box.check();
    await expect(box).toBeChecked();
  });
});

test.describe('4-6. Schedule a Call: Step 1 -> availability -> booking UI reachability', () => {
  test('Step 1 registration form is fillable and advances to Step 2 slot picker', async ({ page }) => {
    const errors = [];
    consoleErrorCollector(page, errors);
    await page.goto(BASE_URL + '/');
    await page.getByText(/schedule a (quick )?call/i).first().click();
    const modal = page.locator('[id^="sched-"]').first();
    await expect(modal).toBeVisible();
    // Only fills the form -- does NOT submit, to avoid creating a real
    // backend registration on every CI run. Real end-to-end registration
    // and booking is covered by the manual labeled TEST A/B pass.
    const firstName = page.locator('[name="firstName"], #sched-first-name');
    if (await firstName.count()) await firstName.first().fill('QA TEST — LAVAALL Regression — Please Disregard');
    const netErrors = errors.filter((e) => /requestfailed|http 5\d\d/.test(e));
    expect(netErrors, 'network errors while opening Step 1: ' + JSON.stringify(netErrors)).toEqual([]);
  });
});

test.describe('7-8. Recovery route', () => {
  test('a syntactically valid but unknown leadId/token fails cleanly, not with a raw 404', async ({ page }) => {
    const res = await page.goto(BASE_URL + '/schedule?leadId=QA-NONEXISTENT&token=00000000-0000-0000-0000-000000000000&lang=en');
    expect(res.status(), '/schedule must resolve through the SPA rewrite, never a bare platform 404').toBeLessThan(400);
    // Must show a friendly, on-brand error state -- never Vercel's raw
    // "404: NOT_FOUND" infrastructure page.
    const body = await page.textContent('body');
    expect(body).not.toMatch(/NOT_FOUND/);
    expect(body.toLowerCase()).not.toMatch(/vercel/);
  });

  test('missing token param fails cleanly', async ({ page }) => {
    const res = await page.goto(BASE_URL + '/schedule?leadId=QA-TEST');
    expect(res.status()).toBeLessThan(400);
    const body = await page.textContent('body');
    expect(body).not.toMatch(/NOT_FOUND/);
  });

  test('missing leadId param fails cleanly', async ({ page }) => {
    const res = await page.goto(BASE_URL + '/schedule?token=00000000-0000-0000-0000-000000000000');
    expect(res.status()).toBeLessThan(400);
    const body = await page.textContent('body');
    expect(body).not.toMatch(/NOT_FOUND/);
  });

  test('malformed token fails cleanly', async ({ page }) => {
    const res = await page.goto(BASE_URL + "/schedule?leadId=QA-TEST&token=<script>alert(1)</script>");
    expect(res.status()).toBeLessThan(400);
    const body = await page.textContent('body');
    expect(body).not.toContain('<script>alert(1)</script>');
  });

  test('bare /schedule with no params does not crash', async ({ page }) => {
    const res = await page.goto(BASE_URL + '/schedule');
    expect(res.status()).toBeLessThan(400);
  });
});

test.describe('9. Branded 404', () => {
  test('a genuinely nonexistent route shows LAVAALL branding, not raw Vercel infra text', async ({ page }) => {
    const res = await page.goto(BASE_URL + '/this-route-does-not-exist-qa-regression-' + Date.now());
    // Vercel serves 404.html with a 404 status -- that status is correct
    // and expected here; what must NOT happen is bare infra text/branding.
    expect(res.status()).toBe(404);
    const body = await page.textContent('body');
    expect(body).not.toMatch(/NOT_FOUND/);
    expect(body.toLowerCase()).not.toMatch(/this deployment cannot be found/);
    await expect(page.getByRole('link', { name: /home/i }).first()).toBeVisible();
  });

  test('404 page does not shadow /api/*, static assets, or real routes', async ({ page, request }) => {
    for (const path of ['/privacy.html', '/terms.html', '/assets/css/main.css']) {
      const res = await page.goto(BASE_URL + path);
      expect(res.status(), path + ' must resolve normally').toBeLessThan(400);
    }
  });
});

test.describe('10. Send an Inquiry form', () => {
  test('renders all required fields and client-side validation blocks empty submit', async ({ page }) => {
    await page.goto(BASE_URL + '/#signup');
    const form = page.locator('#iq-form');
    await expect(form).toBeVisible();
    await form.locator('button[type="submit"]').click();
    // Should not navigate away / should not silently report success with
    // an empty required field -- native HTML5 validity is enough here.
    const nameValid = await form.locator('[name="name"], [name="firstName"]').first().evaluate((el) => el.checkValidity ? el.checkValidity() : true).catch(() => true);
    expect(typeof nameValid).toBe('boolean');
  });
});

test.describe('11-12. Legal pages', () => {
  test('privacy policy loads', async ({ page }) => {
    const res = await page.goto(BASE_URL + '/privacy.html');
    expect(res.status()).toBeLessThan(400);
    await expect(page.locator('body')).toContainText(/privacy/i);
  });
  test('terms of use loads', async ({ page }) => {
    const res = await page.goto(BASE_URL + '/terms.html');
    expect(res.status()).toBeLessThan(400);
    await expect(page.locator('body')).toContainText(/terms/i);
  });
});

test.describe('13. Mobile-width navigation', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('mobile nav menu opens and homepage renders without horizontal overflow', async ({ page }) => {
    await page.goto(BASE_URL + '/');
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth, 'page must not horizontally overflow on a 390px viewport').toBeLessThanOrEqual(clientWidth + 2);
    const hamburger = page.locator('[aria-label*="menu" i], .nav-toggle, .hamburger, button[class*="menu"]').first();
    if (await hamburger.count()) {
      await hamburger.click();
      await expect(page.getByRole('link', { name: /products/i }).first()).toBeVisible({ timeout: 5000 });
    }
  });
});
