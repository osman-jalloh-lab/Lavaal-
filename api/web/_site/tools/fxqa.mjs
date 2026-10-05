import { chromium } from 'playwright';
const b = await chromium.launch();
for (const [w, h] of [[1440, 900], [390, 844]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
  const res = [];
  for (const f of [0.02, 0.3, 0.55, 0.85, 1]) {
    await p.evaluate(f => { document.documentElement.style.scrollBehavior = 'auto'; const s = document.getElementById('flow'); scrollTo(0, s.offsetTop + (s.offsetHeight - innerHeight) * f); }, f);
    await p.waitForTimeout(900);
    res.push(await p.evaluate(() => document.querySelector('[data-fx-pk]').textContent));
    await p.screenshot({ path: `../qa/fx-${Math.round(f * 100)}-${w}.png` });
  }
  console.log(w, JSON.stringify({ errs, res, overflow: await p.evaluate(() => document.documentElement.scrollWidth > innerWidth) }));
  await p.close();
}
await b.close();
