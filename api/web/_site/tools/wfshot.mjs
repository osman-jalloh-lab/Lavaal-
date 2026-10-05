import { chromium } from 'playwright';
const b = await chromium.launch();
for (const w of [1440, 390]) {
  const p = await b.newPage({ viewport: { width: w, height: 900 } });
  await p.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
  await p.evaluate(() => { const s = document.querySelector('.wf'); s.scrollIntoView(); s.querySelectorAll('.rv').forEach(e => e.classList.add('in')); });
  await p.waitForTimeout(3000);
  await p.locator('.wf').screenshot({ path: `../qa/wf-${w}.png` });
  await p.close();
}
await b.close();
