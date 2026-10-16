import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
await p.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; document.getElementById('templates').scrollIntoView(); document.querySelectorAll('#templates .rv').forEach(e => e.classList.add('in')); });
await p.waitForTimeout(4000);
console.log(await p.evaluate(() => [...document.querySelectorAll('#templates [data-tp-live] iframe')].map(f => f.getAttribute('src')).join(' | ')));
// jump each template preview halfway down to mimic the auto-scroll
await p.evaluate(() => document.querySelectorAll('#templates [data-tp-live] iframe').forEach(f => { try { f.contentWindow.scrollTo(0, f.contentDocument.documentElement.scrollHeight * 0.45); } catch (e) {} }));
await p.waitForTimeout(1500);
await p.locator('#templates .tp-strip').screenshot({ path: '../qa/tpdeep.png' });
await b.close();
