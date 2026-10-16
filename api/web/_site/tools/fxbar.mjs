import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
await p.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; const s = document.getElementById('flow'); scrollTo(0, s.offsetTop + (s.offsetHeight - innerHeight) * 0.3); });
await p.waitForTimeout(600);
console.log(await p.evaluate(() => { const i = document.querySelector('[data-fx-bar]'); return [i.style.transform, getComputedStyle(i).transform, i.getBoundingClientRect().width, getComputedStyle(i.parentNode).display]; }));
await b.close();
