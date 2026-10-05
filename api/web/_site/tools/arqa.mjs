import { chromium } from 'playwright';
const b = await chromium.launch();
for (const w of [1440, 390]) {
  const p = await b.newPage({ viewport: { width: w, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 140)); });
  await p.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
  await p.evaluate(() => { const s = document.getElementById('artists'); s.scrollIntoView(); s.querySelectorAll('.rv').forEach(e => e.classList.add('in')); });
  await p.waitForTimeout(5000);
  await p.locator('#artists').screenshot({ path: `../qa/ar-${w}.png` });
  const nav = await p.evaluate(() => { const n = document.querySelector('.nav'); return n.scrollWidth > n.clientWidth + 1; });
  console.log(w, JSON.stringify({ errs, nav, overflow: await p.evaluate(() => document.documentElement.scrollWidth > innerWidth) }));
  await p.close();
}
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.goto('http://localhost:8080/showcase/triple-t/', { waitUntil: 'load' });
await p.waitForTimeout(6000);
const st = await p.evaluate(() => ({ film: !!document.querySelector('[data-film] iframe'), on: document.querySelector('[data-film]').classList.contains('on'), btn: !document.querySelector('[data-sound]').hidden }));
if (st.btn) { await p.click('[data-sound]'); }
const pressed = await p.getAttribute('[data-sound]', 'aria-pressed');
await p.screenshot({ path: '../qa/tt-hero-film.png' });
console.log('hub', JSON.stringify({ errs, ...st, pressed }));
await b.close();
