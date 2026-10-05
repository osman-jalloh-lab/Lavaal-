import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 900 } });
await p.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
await p.waitForTimeout(1500);
console.log(await p.evaluate(() => { const out = []; const kids = [...document.querySelectorAll('body > *, main > *')]; for (const k of kids) { const d = k.style.display; k.style.display = 'none'; out.push((k.id || k.className || k.tagName) + ':' + document.documentElement.scrollWidth); k.style.display = d; } return out; }));
await b.close();
