import { chromium } from 'playwright';
const b = await chromium.launch();
for (const w of [1440, 390]) {
  const p = await b.newPage({ viewport: { width: w, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
  await p.evaluate(() => { const s = document.querySelector('.wf'); s.scrollIntoView(); s.querySelectorAll('.rv').forEach(e => e.classList.add('in')); });
  await p.waitForTimeout(1500);
  await p.focus('#wft-rest'); await p.keyboard.press('ArrowRight'); await p.waitForTimeout(1200);
  const st = await p.evaluate(() => ({ h: document.querySelector('[data-wf-h]').textContent, src: document.querySelector('[data-wf-video]').currentSrc, dl: document.querySelector('[data-wf-dl]').getAttribute('href'), sel: document.querySelector('#wft-hotel').getAttribute('aria-selected') }));
  await p.locator('.wf').screenshot({ path: `../qa/wftabs-${w}.png` });
  console.log(w, JSON.stringify({ errs, ...st, overflow: await p.evaluate(() => document.documentElement.scrollWidth > innerWidth) }));
  await p.close();
}
await b.close();
