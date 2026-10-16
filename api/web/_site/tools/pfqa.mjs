import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';
const ROOT = process.env.D;
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.pdf': 'application/pdf', '.mp4': 'video/mp4', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const srv = http.createServer((q, s) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(ROOT, 'index.html'); const st = fs.statSync(f); const type = T[path.extname(f)] || 'application/octet-stream'; const r = q.headers.range; if (r && type === 'video/mp4') { const [a, b] = r.replace('bytes=', '').split('-'); const s0 = +a, e = b ? +b : st.size - 1; s.writeHead(206, { 'Content-Range': `bytes ${s0}-${e}/${st.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': e - s0 + 1, 'Content-Type': type }); return fs.createReadStream(f, { start: s0, end: e }).pipe(s); } s.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size }); fs.createReadStream(f).pipe(s); }).listen(5190);
const b = await chromium.launch();
for (const [w, motion] of [[1440, 'no-preference'], [390, 'no-preference'], [1440, 'reduce']]) {
  const p = await b.newPage({ viewport: { width: w, height: 900 }, reducedMotion: motion });
  const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 150)); });
  await p.goto('http://localhost:5190/', { waitUntil: 'load' });
  await p.waitForTimeout(7000);
  const hero = await p.evaluate(() => { const v = document.querySelector('.video-panel--hero video'); const i = document.querySelector('.video-panel--hero img'); return v ? { video: true, ended: v.ended, t: +v.currentTime.toFixed(1), loop: v.loop } : { video: false, img: !!i }; });
  const tag = `${w}${motion === 'reduce' ? '-rm' : ''}`;
  await p.screenshot({ path: `../qa/pf-hero-${tag}.png` });
  for (const sel of ['#credentials', '#work']) {
    await p.evaluate(s => document.querySelector(s).scrollIntoView(), sel);
    await p.waitForTimeout(2200);
    if (sel === '#work' && w === 1440 && motion !== 'reduce') { const c = p.locator('.proj').nth(1); const bb = await c.boundingBox(); await p.mouse.move(bb.x + bb.width * 0.85, bb.y + bb.height * 0.2); await p.waitForTimeout(500); }
    await p.screenshot({ path: `../qa/pf-${sel.slice(1)}-${tag}.png` });
  }
  const vis = await p.evaluate(() => [document.querySelectorAll('.reveal').length, document.querySelectorAll('.reveal.is-visible').length]);
  console.log(tag, JSON.stringify({ errs, hero, reveals: vis, overflow: await p.evaluate(() => document.documentElement.scrollWidth > innerWidth) }));
  await p.close();
}
await b.close(); srv.close();
