import { chromium } from 'playwright';
const b = await chromium.launch();
for (const w of [1440, 390]) {
  const p = await b.newPage({ viewport: { width: w, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 140)); });
  await p.goto('http://localhost:8080/showcase/triple-t/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1200);
  await p.screenshot({ path: `../qa/tt-hero-${w}.png` });
  for (const id of ['affairs', 'kamdae', 'music', 'videos']) {
    await p.evaluate(i => { document.documentElement.style.scrollBehavior = 'auto'; document.getElementById(i).scrollIntoView(); }, id);
    await p.waitForTimeout(900);
    await p.screenshot({ path: `../qa/tt-${id}-${w}.png` });
  }
  await p.click('[data-yt="DprVtS6yAvQ"]'); await p.waitForTimeout(800);
  const iframe = await p.locator('iframe[src*="DprVtS6yAvQ"]').count();
  await p.fill('#wa', '076123456'); await p.click('[data-drop] button');
  const drop = await p.textContent('[data-drop-status]');
  console.log(w, JSON.stringify({ errs, iframe, drop, overflow: await p.evaluate(() => document.documentElement.scrollWidth > innerWidth) }));
  await p.close();
}
await b.close();
