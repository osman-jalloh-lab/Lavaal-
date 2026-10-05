import { chromium } from 'playwright';
const b = await chromium.launch();
for (const w of [1440, 390]) {
  const p = await b.newPage({ viewport: { width: w, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
  await p.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
  for (const id of ['for', 'work']) {
    await p.evaluate(i => { document.getElementById(i).scrollIntoView(); document.querySelectorAll('#'+i+' .rv').forEach(e => e.classList.add('in')); }, id);
    await p.waitForTimeout(id === 'for' ? 4500 : 3500);
    await p.locator('#' + id).screenshot({ path: `../qa/v3-${id}-${w}.png` });
  }
  console.log(w, JSON.stringify({ errs, overflow: await p.evaluate(() => document.documentElement.scrollWidth > innerWidth) }));
  await p.close();
}
await b.close();
