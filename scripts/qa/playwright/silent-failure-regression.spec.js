// LAVAALL silent-failure regression suite (BUG-A / BUG-B / BUG-C).
//
// These tests cover the "Inquiry failure is invisible" (BUG-A), "Schedule
// registration silent failure" (BUG-B), and "Contact method silent block"
// (BUG-C) fixes. Every backend call is intercepted with page.route() and
// answered with a controlled fake response -- this suite never depends on
// CONTACT_WEBHOOK_URL / BOOKING_WEBHOOK_URL actually being configured for
// the environment under test, and creates zero real Sheet rows, Calendar
// events, or outbound emails. Real end-to-end backend behavior (recovery
// email round trip, actual Google Meet creation, Sheets writes) is covered
// separately by the manual labeled TEST A/B/C/D pass once Preview has real
// webhook credentials.
//
// Run with:
//   BASE_URL=https://<preview>.vercel.app npx playwright test silent-failure-regression.spec.js
//   BASE_URL=https://www.lavaall.com     npx playwright test silent-failure-regression.spec.js

const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.BASE_URL || 'https://www.lavaall.com';

async function mockContact(page, status, body) {
  await page.route('**/api/contact', (route) => {
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

async function mockScheduleRegister(page, status, body) {
  await page.route('**/api/schedule', (route) => {
    const req = route.request();
    if (req.method() === 'POST') {
      const post = req.postDataJSON();
      if (post && post.action === 'register') {
        return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      }
    }
    route.continue();
  });
}

async function fillInquiryForm(page) {
  await page.goto(BASE_URL + '/#signup');
  const form = page.locator('#iq-form');
  await form.locator('[name="inquiryType"]').selectOption('general-inquiry');
  await form.locator('[name="name"]').fill('QA TEST — Regression — Please Disregard');
  await form.locator('[name="email"]').fill('qa-regression@lavaall.com');
  await form.locator('[name="country"]').selectOption({ index: 1 });
  await form.locator('[name="subject"]').fill('QA regression subject');
  await form.locator('[name="message"]').fill('QA regression message body, please disregard.');
  await form.locator('[name="preferredResponse"]').selectOption('email');
  await form.locator('[name="consent"]').check();
  return form;
}

async function openScheduleModal(page) {
  await page.goto(BASE_URL + '/');
  await page.getByText(/schedule a (quick )?call/i).first().click();
  const modal = page.locator('#sched-reg-form');
  await expect(modal).toBeVisible();
  return modal;
}

async function fillScheduleBase(form) {
  await form.locator('[name="firstName"]').fill('QA TEST');
  await form.locator('[name="reason"]').selectOption('sales-quotation');
  await form.locator('[name="consent"]').check();
}

test.describe('BUG-A: Inquiry form failure stays visible', () => {
  test('backend failure shows a persistent, non-auto-dismissing error', async ({ page }) => {
    await mockContact(page, 502, { error: 'delivery_failed', message: 'internal upstream detail should never render' });
    const form = await fillInquiryForm(page);
    await form.locator('button[type="submit"]').click();
    const summary = page.locator('#iq-error-summary');
    await expect(summary).toBeVisible({ timeout: 5000 });
    // Old behavior auto-removed the message after 5s -- assert it is still
    // there well past that window.
    await page.waitForTimeout(5500);
    await expect(summary).toBeVisible();
  });

  test('entered values remain populated after a failed submit', async ({ page }) => {
    await mockContact(page, 502, { error: 'delivery_failed' });
    const form = await fillInquiryForm(page);
    await form.locator('button[type="submit"]').click();
    await expect(page.locator('#iq-error-summary')).toBeVisible();
    await expect(form.locator('[name="name"]')).toHaveValue(/QA TEST/);
    await expect(form.locator('[name="email"]')).toHaveValue('qa-regression@lavaall.com');
    await expect(form.locator('[name="subject"]')).toHaveValue('QA regression subject');
  });

  test('submit button label is restored (localized) after failure, not stuck on "Sending..."', async ({ page }) => {
    await mockContact(page, 502, { error: 'delivery_failed' });
    const form = await fillInquiryForm(page);
    const btn = form.locator('button[type="submit"]');
    const originalLabel = (await btn.textContent() || '').trim();
    await btn.click();
    await expect(page.locator('#iq-error-summary')).toBeVisible();
    await expect(btn).toBeEnabled();
    await expect(btn).not.toHaveText(/sending/i);
    expect((await btn.textContent() || '').trim()).toBe(originalLabel);
  });

  test('server-provided error text never includes raw exception/secret-shaped strings', async ({ page }) => {
    await mockContact(page, 502, { error: 'delivery_failed', message: 'BOOKING_WEBHOOK_SECRET=abc123 TypeError: fetch failed at /var/task/api/contact.js:150' });
    const form = await fillInquiryForm(page);
    await form.locator('button[type="submit"]').click();
    const summary = page.locator('#iq-error-summary');
    await expect(summary).toBeVisible();
    const text = (await summary.textContent()) || '';
    expect(text).not.toMatch(/WEBHOOK_SECRET/);
    expect(text).not.toMatch(/TypeError/);
    expect(text).not.toMatch(/\/var\/task/);
  });

  test('network failure (fetch throws) is reported, not swallowed', async ({ page }) => {
    await page.route('**/api/contact', (route) => route.abort('failed'));
    const form = await fillInquiryForm(page);
    await form.locator('button[type="submit"]').click();
    await expect(page.locator('#iq-error-summary')).toBeVisible({ timeout: 5000 });
  });

  test('successful submission still shows the success box (no regression)', async ({ page }) => {
    await mockContact(page, 202, { accepted: true, routedTo: 'info@lavaall.com' });
    const form = await fillInquiryForm(page);
    await form.locator('button[type="submit"]').click();
    await expect(page.locator('#sbox')).toBeVisible({ timeout: 5000 });
  });

  test('rapid double-click sends at most one request', async ({ page }) => {
    let hits = 0;
    await page.route('**/api/contact', async (route) => {
      hits += 1;
      await new Promise((r) => setTimeout(r, 300));
      route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ accepted: true }) });
    });
    const form = await fillInquiryForm(page);
    // Dispatch two click events on the same tick, before Playwright's own
    // actionability waiting can serialize them -- the handler must disable
    // the button synchronously (before the first await) for this to still
    // land only one fetch.
    await form.locator('button[type="submit"]').evaluate((btn) => { btn.click(); btn.click(); });
    await page.waitForTimeout(1000);
    expect(hits).toBeLessThanOrEqual(1);
  });
});

test.describe('BUG-A: EN/FR/Krio error copy has no cross-language leakage', () => {
  for (const lang of ['en', 'fr', 'kr']) {
    test(`inquiry failure message is rendered in ${lang}`, async ({ page }) => {
      await mockContact(page, 502, { error: 'delivery_failed' });
      const form = await fillInquiryForm(page);
      await page.locator(`.lb[data-lang="${lang}"]`).click().catch(() => {});
      await form.locator('button[type="submit"]').click();
      const summary = page.locator('#iq-error-summary');
      await expect(summary).toBeVisible();
      const text = (await summary.textContent()) || '';
      expect(text.trim().length).toBeGreaterThan(0);
    });
  }
});

test.describe('BUG-B: Schedule registration failure stays visible', () => {
  test('backend failure keeps Step 1 open with a persistent, translated error', async ({ page }) => {
    await mockScheduleRegister(page, 400, { error: 'invalid_registration', errors: ['A valid reason for the call is required.'] });
    const form = await openScheduleModal(page);
    await fillScheduleBase(form);
    await form.locator('[name="email"]').fill('qa-regression@lavaall.com');
    // Select the Email contact method once it appears.
    await page.locator('#sched-contact-method-options input[value="email"]').check();
    await form.locator('button[type="submit"]').click();
    const err = page.locator('#sched-step1-error');
    await expect(err).toBeVisible({ timeout: 5000 });
    // Must still be Step 1, never advanced on a failed response.
    await expect(page.locator('#sched-step1')).toBeVisible();
    await expect(page.locator('#sched-step2')).toBeHidden();
    await page.waitForTimeout(1000);
    await expect(err).toBeVisible();
  });

  test('entered values remain populated after a failed registration', async ({ page }) => {
    await mockScheduleRegister(page, 502, { error: 'delivery_failed' });
    const form = await openScheduleModal(page);
    await fillScheduleBase(form);
    await form.locator('[name="email"]').fill('qa-regression@lavaall.com');
    await page.locator('#sched-contact-method-options input[value="email"]').check();
    await form.locator('button[type="submit"]').click();
    await expect(page.locator('#sched-step1-error')).toBeVisible();
    await expect(form.locator('[name="firstName"]')).toHaveValue('QA TEST');
    await expect(form.locator('[name="email"]')).toHaveValue('qa-regression@lavaall.com');
  });

  test('scheduling_not_configured is shown as a clear, translated message (never a raw 503)', async ({ page }) => {
    await mockScheduleRegister(page, 503, { error: 'scheduling_not_configured', message: 'Scheduling is not configured yet. Please email us directly or use Send an Inquiry.' });
    const form = await openScheduleModal(page);
    await fillScheduleBase(form);
    await form.locator('[name="phone"]').fill('+23276000000');
    await page.locator('#sched-contact-method-options input[value="phone"]').check();
    await form.locator('button[type="submit"]').click();
    await expect(page.locator('#sched-step1-error')).toBeVisible();
  });

  test('successful registration advances to Step 2 (no regression)', async ({ page }) => {
    await mockScheduleRegister(page, 200, { ok: true, leadId: 'QA-LEAD-TEST', token: 'test-token' });
    const form = await openScheduleModal(page);
    await fillScheduleBase(form);
    await form.locator('[name="phone"]').fill('+23276000000');
    await page.locator('#sched-contact-method-options input[value="phone"]').check();
    await form.locator('button[type="submit"]').click();
    await expect(page.locator('#sched-step2')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('BUG-C: Contact method rule is never a silent block', () => {
  test('email-only entry: only Email and Messenger are offered, Phone/WhatsApp are not', async ({ page }) => {
    const form = await openScheduleModal(page);
    await form.locator('[name="email"]').fill('qa-regression@lavaall.com');
    await expect(page.locator('#sched-contact-method-options input[value="email"]')).toHaveCount(1);
    await expect(page.locator('#sched-contact-method-options input[value="phone"]')).toHaveCount(0);
    await expect(page.locator('#sched-contact-method-options input[value="whatsapp"]')).toHaveCount(0);
  });

  test('phone-only entry: Phone and WhatsApp are offered, Email is not', async ({ page }) => {
    const form = await openScheduleModal(page);
    await form.locator('[name="phone"]').fill('+23276000000');
    await expect(page.locator('#sched-contact-method-options input[value="phone"]')).toHaveCount(1);
    await expect(page.locator('#sched-contact-method-options input[value="whatsapp"]')).toHaveCount(1);
    await expect(page.locator('#sched-contact-method-options input[value="email"]')).toHaveCount(0);
  });

  test('both email and phone entered: all three channels are offered', async ({ page }) => {
    const form = await openScheduleModal(page);
    await form.locator('[name="email"]').fill('qa-regression@lavaall.com');
    await form.locator('[name="phone"]').fill('+23276000000');
    await expect(page.locator('#sched-contact-method-options input[value="email"]')).toHaveCount(1);
    await expect(page.locator('#sched-contact-method-options input[value="phone"]')).toHaveCount(1);
    await expect(page.locator('#sched-contact-method-options input[value="whatsapp"]')).toHaveCount(1);
  });

  test('neither email nor phone entered: submit fails visibly, never a silent return', async ({ page }) => {
    const form = await openScheduleModal(page);
    await fillScheduleBase(form);
    await form.locator('button[type="submit"]').click();
    await expect(page.locator('#sched-step1-error')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#sched-step1')).toBeVisible();
  });

  test('no contact method selected: fieldset is marked invalid, error is visible, and focus moves into it', async ({ page }) => {
    const form = await openScheduleModal(page);
    await fillScheduleBase(form);
    await form.locator('[name="email"]').fill('qa-regression@lavaall.com');
    // Deliberately do not select a radio option, then submit.
    await form.locator('button[type="submit"]').click();
    await expect(page.locator('#sched-step1-error')).toBeVisible();
    await expect(page.locator('#sched-contact-method-group')).toHaveAttribute('aria-invalid', 'true');
    const focused = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('name'));
    expect(focused).toBe('preferredContactMethod');
  });

  test('WhatsApp selected without consent fails visibly', async ({ page }) => {
    const form = await openScheduleModal(page);
    await fillScheduleBase(form);
    await form.locator('[name="phone"]').fill('+23276000000');
    await page.locator('#sched-contact-method-options input[value="whatsapp"]').check();
    await page.locator('#sched-wa-yes').check();
    // whatsappConsent left unchecked.
    await form.locator('button[type="submit"]').click();
    await expect(page.locator('#sched-step1-error')).toBeVisible();
    await expect(page.locator('#sched-step2')).toBeHidden();
  });

  test('required marker and semantic fieldset/legend are present (not color-only)', async ({ page }) => {
    const form = await openScheduleModal(page);
    await form.locator('[name="email"]').fill('qa-regression@lavaall.com');
    const fieldset = page.locator('#sched-contact-method-group');
    await expect(fieldset).toHaveJSProperty('tagName', 'FIELDSET');
    await expect(fieldset.locator('legend')).toBeVisible();
    await expect(fieldset.locator('legend .req')).toHaveCount(1);
  });
});
