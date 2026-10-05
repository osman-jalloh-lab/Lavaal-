import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 720, height: 1280 } });
await p.goto('http://localhost:8080/videos/restaurant.html?rec&v=916', { waitUntil: 'load' }); await p.waitForTimeout(600);
for (const [i, t] of [1.5, 10.9, 15.9, 24.5].entries()) { await p.evaluate(x => window.render(x), t); await p.screenshot({ path: `../qa/sb916-${i}.png` }); }
await b.close();
