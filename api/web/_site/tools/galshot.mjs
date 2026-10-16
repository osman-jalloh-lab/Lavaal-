import { chromium } from 'playwright';
const b = await chromium.launch();
for (const w of [1440, 390]) {
  const p = await b.newPage({ viewport: { width: w, height: 1000 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
  await p.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
  await p.evaluate(() => { document.getElementById('templates').scrollIntoView(); document.querySelectorAll('#templates .rv').forEach(e => e.classList.add('in')); });
  await p.waitForTimeout(6000);
  await p.locator('#templates').screenshot({ path: `../qa/gal-${w}.png` });
  console.log(w, JSON.stringify({ errs, overflow: await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), loaded: await p.evaluate(() => [...document.querySelectorAll('[data-tp-live] iframe')].map(i => i.getAttribute('src') !== 'about:blank').join('')) }));
  await p.close();
}
await b.close();
