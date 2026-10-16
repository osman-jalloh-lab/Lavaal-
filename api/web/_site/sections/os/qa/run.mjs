import { createRequire } from 'module';
import http from 'http'; import fs from 'fs'; import path from 'path';
const require = createRequire('C:/Users/osman/OneDrive/Desktop/web building bz/tools/');
const { chromium } = require('playwright');
const ROOT = 'C:/Users/osman/OneDrive/Desktop/web building bz/';
const QA = ROOT + 'sections/os/qa/';
const frag = fs.readFileSync(ROOT + 'sections/os/section.html', 'utf8');
const page_html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>t</title>
<link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/sections/os/section.css"></head><body><main><div style="height:60vh"></div>${frag}<div style="height:30vh"></div></main><script src="/sections/os/section.js"></script></body></html>`;
const types = { '.css': 'text/css', '.js': 'text/javascript' };
const srv = http.createServer((q, s) => {
  const u = q.url.split('?')[0];
  if (u === '/') { s.setHeader('content-type', 'text/html'); return s.end(page_html); }
  fs.readFile(ROOT + u, (e, b) => { if (e) { s.statusCode = 404; return s.end(); } s.setHeader('content-type', types[path.extname(u)] || 'text/plain'); s.end(b); });
}).listen(5191);
const b = await chromium.launch();
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
for (const rm of ['no-preference', 'reduce']) for (const w of [1440, 1024, 390]) {
  const c = await b.newContext({ viewport: { width: w, height: 900 }, reducedMotion: rm });
  const p = await c.newPage(); const errs = [];
  p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:5191/'); await p.waitForTimeout(300);
  const tag = `${rm}-${w}`;
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  ok(!overflow, tag + ' no horizontal overflow');
  const sel = () => p.evaluate(() => document.querySelector('[role=tab][aria-selected=true]').textContent);
  await p.locator('#os').scrollIntoViewIfNeeded();
  if (rm === 'no-preference') {
    await p.waitForTimeout(3600);
    ok((await sel()).startsWith('Schedule'), tag + ' tour advanced to Schedule: ' + (await sel()));
    await p.locator('.os-bar-t').click(); await p.waitForTimeout(3500);
    ok((await sel()).startsWith('Schedule'), tag + ' tour stopped on interaction');
  } else {
    await p.waitForTimeout(3600);
    ok((await sel()).startsWith('Inbox'), tag + ' no tour with reduced motion');
  }
  // keyboard
  await p.locator('#os-tab-inbox').focus();
  await p.keyboard.press('Home');
  await p.keyboard.press('ArrowDown'); await p.keyboard.press('ArrowDown');
  ok((await sel()).startsWith('Daily brief'), tag + ' arrow keys move selection');
  await p.keyboard.press('End');
  ok((await sel()).startsWith('Builder') && await p.locator('#os-p-builder').isVisible(), tag + ' End -> Builder panel visible');
  // approve builder, decline inbox
  await p.locator('#os-p-builder [data-act=approve]').click();
  ok(/Approved/.test(await p.locator('#os-p-builder .os-result').innerText()), tag + ' builder approve resolves');
  await p.locator('#os-tab-inbox').click();
  await p.locator('#os-p-inbox [data-act=decline]').click();
  ok(/Declined/.test(await p.locator('#os-p-inbox .os-result').innerText()), tag + ' inbox decline resolves');
  ok((await p.locator('[data-os-count]').textContent()) === 'All clear', tag + ' queue count cleared');
  await p.locator('#os-p-inbox .os-result .os-btn').click();
  ok((await p.locator('[data-os-count]').textContent()) === '1 waiting', tag + ' reset restores queue');
  ok(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)), tag + ' no overflow after use');
  // screenshots of each module
  for (const id of ['inbox', 'schedule', 'money', 'builder']) {
    await p.locator('#os-tab-' + id).click(); await p.waitForTimeout(400);
    if (rm === 'no-preference' && id !== 'schedule' && id !== 'money') continue;
    await p.locator('#os').screenshot({ path: `${QA}${tag}-${id}.png` });
  }
  ok(errs.length === 0, tag + ' no console errors ' + errs.join('|'));
  await c.close();
}
await b.close(); srv.close();
console.log(fails ? 'FAILS ' + fails : 'ALL PASS');
