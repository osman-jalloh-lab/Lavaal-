import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 900 } });
await p.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
await p.waitForTimeout(1500);
console.log(await p.evaluate(() => {
  const r = [document.documentElement.scrollWidth, getComputedStyle(document.getElementById('templates')).overflowX];
  document.querySelectorAll('.tp-live iframe').forEach(i => i.style.display = 'none'); r.push('noiframe:' + document.documentElement.scrollWidth);
  document.querySelectorAll('.tp-live iframe').forEach(i => i.style.display = '');
  document.querySelectorAll('.tp-live').forEach(i => i.style.display = 'none'); r.push('nolive:' + document.documentElement.scrollWidth);
  document.querySelectorAll('.tp-live').forEach(i => i.style.display = '');
  document.querySelectorAll('.tp-open').forEach(i => i.style.display = 'none'); r.push('noopen:' + document.documentElement.scrollWidth);
  return r; }));
await b.close();
