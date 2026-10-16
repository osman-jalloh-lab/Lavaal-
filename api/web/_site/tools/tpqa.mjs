import { chromium } from 'playwright';
const b = await chromium.launch();
for (const motion of ['no-preference', 'reduce']) {
  for (const w of [1440, 1024, 390]) {
    const p = await b.newPage({ viewport: { width: w, height: 900 }, reducedMotion: motion });
    const errs = [];
    p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    p.on('pageerror', e => errs.push(String(e)));
    await p.goto('http://localhost:8080/index.html');
    await p.locator('#templates').scrollIntoViewIfNeeded();
    await p.evaluate(() => document.querySelectorAll('#templates .rv').forEach(e => e.classList.add('in')));
    await p.evaluate(() => Promise.all([...document.querySelectorAll('#templates img')].map(i => { i.loading = 'eager'; return i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; }); })));
    await p.waitForTimeout(500);
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    const navOverflow = await p.evaluate(() => { const n = document.querySelector('.nav'); return n.scrollWidth > n.clientWidth + 1; });
    // keyboard: focus strip, arrow right twice
    await p.focus('#tp-strip');
    await p.keyboard.press('ArrowRight'); await p.waitForTimeout(700);
    await p.keyboard.press('ArrowRight'); await p.waitForTimeout(700);
    const countAfterKeys = await p.textContent('[data-tp-count]');
    await p.click('[data-tp-prev]'); await p.waitForTimeout(700);
    const countAfterPrev = await p.textContent('[data-tp-count]');
    await p.evaluate(() => { document.getElementById('tp-strip').scrollLeft = 0; });
    await p.waitForTimeout(300);
    const sec = p.locator('#templates');
    if (motion === 'no-preference') await sec.screenshot({ path: `../qa/templates-${w}.png` });
    // scroll to end for a second shot
    await p.evaluate(() => { const s = document.getElementById('tp-strip'); s.scrollLeft = s.scrollWidth; });
    await p.waitForTimeout(400);
    if (motion === 'no-preference') await sec.screenshot({ path: `../qa/templates-end-${w}.png` });
    const endState = await p.evaluate(() => [document.querySelector('[data-tp-count]').textContent, document.querySelector('[data-tp-next]').disabled]);
    // Use this look
    await p.locator('[data-tp-use]').nth(5).click(); await p.waitForTimeout(800);
    const form = await p.evaluate(() => { const f = document.getElementById('web-inquiry'); return [f.elements.type.value, f.elements.message.value, document.activeElement.name]; });
    console.log(motion, w, JSON.stringify({ errs, overflow, navOverflow, countAfterKeys, countAfterPrev, endState, form }));
    await p.close();
  }
}
await b.close();
