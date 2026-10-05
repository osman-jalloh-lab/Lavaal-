import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.goto('http://localhost:8080/videos/restaurant.html?rec', { waitUntil: 'load' });
await p.waitForTimeout(800);
const T = [1.5, 5.9, 10.9, 15.9, 19.2, 24.5];
for (const [i, t] of T.entries()) { await p.evaluate(x => window.render(x), t); await p.screenshot({ path: `../qa/sb-${i}.png` }); }
console.log(JSON.stringify({ errs })); await b.close();
