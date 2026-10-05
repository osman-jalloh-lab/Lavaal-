import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const [w, h] of [[1440, 900], [390, 844]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text().slice(0, 160)); });
  await p.goto('http://localhost:8080/showcase/pour-play/', { waitUntil: 'load' });
  await p.waitForFunction(() => document.querySelector('[data-loader]').classList.contains('done'), null, { timeout: 30000 });
  const runway = await p.evaluate(() => { const r = document.querySelector('[data-runway]'); return r.offsetHeight - innerHeight; });
  for (const f of [0.02, 0.64, 0.84, 0.95, 1]) {
    await p.evaluate(y => scrollTo(0, y), Math.round(runway * f));
    await p.waitForTimeout(1600);
    await p.screenshot({ path: `../qa/pp-${Math.round(f * 100)}-${w}.png` });
  }
  await p.evaluate(() => document.getElementById('cups').scrollIntoView());
  await p.waitForTimeout(800);
  await p.click('[data-add="Ember"]');
  await p.screenshot({ path: `../qa/pp-cups-${w}.png` });
  console.log(w, JSON.stringify({ errs: errs.slice(0, 8), cart: await p.textContent('[data-cart]'), overflow: await p.evaluate(() => document.documentElement.scrollWidth > innerWidth) }));
  await p.close();
}
await b.close();
