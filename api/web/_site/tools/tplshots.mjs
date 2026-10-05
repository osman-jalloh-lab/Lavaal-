import { chromium } from 'playwright';
const b = await chromium.launch();
for (let i = 1; i <= 6; i++) {
  for (const [w, h] of [[390, 844], [1440, 900]]) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
    await p.goto(`http://localhost:8080/templates/t${i}.html`, { waitUntil: 'load' });
    await p.evaluate(() => document.querySelectorAll('.rv').forEach(e => e.classList.add('in')));
    await p.waitForTimeout(1800);
    await p.screenshot({ path: `../qa/t${i}-${w}.png`, fullPage: w === 390 });
    const ov = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    if (errs.length || ov) console.log('t' + i, w, JSON.stringify({ errs, ov }));
    await p.close();
  }
}
console.log('done'); await b.close();
