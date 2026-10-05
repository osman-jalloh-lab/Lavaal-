import { chromium } from 'playwright';
import fs from 'fs';
const axe = fs.readFileSync(process.env.AXE, 'utf8');
const b = await chromium.launch();
async function runFlow(p, picks) {
  for (const label of picks) {
    const btn = p.locator('[data-lava-replies] button', { hasText: label });
    await btn.waitFor({ timeout: 8000 });
    await btn.focus(); await p.keyboard.press('Enter');
  }
  const ok = p.locator('.lp-owner .ok');
  await ok.waitFor({ timeout: 8000 });
  const focused = await p.evaluate(() => document.activeElement.className);
  await p.keyboard.press('Enter');
  await p.locator('.lp-sys', { hasText: 'Owner approved' }).waitFor({ timeout: 8000 });
  return focused;
}
for (const motion of ['no-preference', 'reduce']) {
  for (const w of [1440, 1024, 390]) {
    const p = await b.newPage({ viewport: { width: w, height: 900 }, reducedMotion: motion });
    const errs = [];
    p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    p.on('pageerror', e => errs.push(String(e)));
    await p.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
    await p.evaluate(() => { document.getElementById('lava').scrollIntoView(); document.querySelectorAll('.rv').forEach(e => e.classList.add('in')); });
    const r = await runFlow(p, ['Hi, are you open tonight?', 'See the menu', 'Book a table', '4 people at 7pm']);
    if (motion === 'no-preference') await p.locator('.lava-stage').screenshot({ path: `../qa/lava-restaurant-${w}.png` });
    // keyboard tab switch to hotel via arrow
    await p.focus('#lt-restaurant'); await p.keyboard.press('ArrowRight');
    const hotelSel = await p.getAttribute('#lt-hotel', 'aria-selected');
    const r2 = await runFlow(p, ['Do you have a room this Friday?', 'Is breakfast included?', 'Yes, hold it', 'Fatmata']);
    await p.click('#lt-shop');
    const r3 = await runFlow(p, ['Do you have phone chargers?', 'USB-C', 'Delivery', 'Lumley']);
    if (motion === 'no-preference') await p.locator('.lava-stage').screenshot({ path: `../qa/lava-shop-${w}.png` });
    // "Not now" path
    await p.click('[data-lava-replies] button.restart');
    await runFlowNo(p);
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    let axeV = [];
    if (motion === 'no-preference' && w !== 1024) {
      await p.evaluate(axe);
      const res = await p.evaluate(() => axe.run(document, { runOnly: ['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','best-practice'] }));
      axeV = res.violations.map(v => `${v.id} (${v.nodes.length}): ${v.nodes.slice(0,3).map(n => n.target.join(' ')).join(' | ')}`);
    }
    console.log(motion, w, JSON.stringify({ errs, overflow, focusOnApprove: [r, r2, r3], hotelSel, axeV }));
    await p.close();
  }
}
async function runFlowNo(p) {
  const picks = ['Do you have phone chargers?', 'iPhone', 'Pick up'];
  for (const label of picks) {
    const btn = p.locator('[data-lava-replies] button', { hasText: label });
    await btn.waitFor({ timeout: 8000 }); await btn.click();
  }
  await p.locator('.lp-owner .no').waitFor({ timeout: 8000 });
  await p.click('.lp-owner .no');
  await p.locator('.lp-owner', { hasText: 'Nothing was sent' }).waitFor({ timeout: 8000 });
}
await b.close();
