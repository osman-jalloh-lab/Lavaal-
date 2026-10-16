import { chromium } from 'playwright';
import { pathToFileURL } from 'url';
import path from 'path';
const url = 'http://localhost:8765/index.html';
const b = await chromium.launch();
for (const w of [1440, 390]) {
  const p = await b.newPage({ viewport: { width: w, height: 900 } });
  const ext = [], errs = [];
  p.on('request', r => { const u = r.url(); if (!u.startsWith('data:') && !u.startsWith('http://localhost:8765')) ext.push(u); });
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(url); await p.waitForTimeout(800);
  const fonts = await p.evaluate(async () => { await document.fonts.ready; return [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family + ' ' + f.weight); });
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  console.log(w, { fonts, external: ext, errors: errs, overflow });
  await p.close();
}
await b.close();
