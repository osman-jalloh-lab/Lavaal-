import { chromium } from 'playwright';
const b = await chromium.launch();
for (const w of [1440, 390]) {
  const p = await b.newPage({ viewport: { width: w, height: 1000 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
  await p.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
  await p.evaluate(() => { document.getElementById('os').scrollIntoView(); document.querySelectorAll('#os .rv').forEach(e => e.classList.add('in')); });
  await p.waitForTimeout(8000);
  const q = await p.locator('.of-q .ok').count();
  if (q) await p.locator('.of-q .ok').first().click();
  await p.waitForTimeout(600);
  await p.locator('#os').screenshot({ path: `../qa/of-${w}.png` });
  console.log(w, JSON.stringify({ errs, queued: q, overflow: await p.evaluate(() => document.documentElement.scrollWidth > innerWidth) }));
  await p.close();
}
await b.close();
