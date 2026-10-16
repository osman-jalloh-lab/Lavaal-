import { chromium } from 'playwright';
const b = await chromium.launch();
for (const w of [1440, 390]) {
const p = await b.newPage({ viewport: { width: w, height: 900 } });
await p.goto('http://localhost:8080/index.html');
console.log(w, await p.evaluate(() => [...document.querySelectorAll('.brand, a')].filter(a => /LAVAALL Web|Open in mail app/.test(a.textContent) && a.textContent.length < 30).map(a => { const r = a.getBoundingClientRect(); return [a.textContent.trim(), Math.round(r.width), Math.round(r.height), getComputedStyle(a).display]; })));
}
await b.close();
