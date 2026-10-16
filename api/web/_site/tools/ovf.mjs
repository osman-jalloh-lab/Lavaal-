import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 900 } });
await p.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
await p.waitForTimeout(1500);
console.log(await p.evaluate(() => { const W = innerWidth; return [document.documentElement.scrollWidth, ...[...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); if (r.right <= W + 1) return false; let a = e.parentElement; while (a && a !== document.body) { const o = getComputedStyle(a); if (o.overflowX !== 'visible' || o.overflow === 'hidden') return false; a = a.parentElement; } return true; }).slice(0, 12).map(e => e.tagName + '.' + (e.className && e.className.baseVal === undefined ? e.className : '') + ' ' + Math.round(e.getBoundingClientRect().right))]; }));
await b.close();
