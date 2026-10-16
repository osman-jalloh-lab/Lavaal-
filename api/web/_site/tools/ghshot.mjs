import { chromium } from 'playwright';
const b = await chromium.launch();
for (const w of [1440, 390]) {
  const p = await b.newPage({ viewport: { width: w, height: 900 } });
  const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `../qa/gh-hero-${w}.png` });
  for (const id of ['lava', 'for', 'work', 'how']) {
    await p.evaluate(i => { document.getElementById(i).scrollIntoView(); document.querySelectorAll('#' + i + ' .rv').forEach(e => e.classList.add('in')); }, id);
    await p.waitForTimeout(1200);
    await p.screenshot({ path: `../qa/gh-${id}-${w}.png` });
  }
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  const vid = await p.evaluate(() => { const v = document.querySelector('.hero-video'); return [!!v.src, v.classList.contains('on'), v.paused]; });
  console.log(w, JSON.stringify({ errs, overflow, vid }));
  await p.close();
}
await b.close();
