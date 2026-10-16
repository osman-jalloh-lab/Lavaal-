import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';
const ROOT = 'C:/Users/osman/OneDrive/Desktop/web building bz/';
const SEC = ROOT + 'sections/capabilities/';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.webm': 'video/webm', '.json': 'application/json' };
const idx = fs.readFileSync(ROOT + 'index.html', 'utf8');
const BASE = '<base href="/sections/capabilities/">';
const head = idx.slice(0, idx.indexOf('</head>')).replace(/<link[^>]*(fonts\.g)[^>]*>/g, '').replace('href="styles.css"', 'href="/styles.css"') + '<link rel="stylesheet" href="/sections/capabilities/section.css">' + BASE + '</head>';
const nav = idx.slice(idx.indexOf('<a class="skip"'), idx.indexOf('<main'));
const page = () => `${head}<body>${nav}<main><div style="height:30vh"></div>${fs.readFileSync(SEC + 'section.html', 'utf8')}<div style="height:60vh"></div></main><script src="/sections/capabilities/section.js"></script></body></html>`;
const srv = http.createServer((q, s) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/test.html') { s.setHeader('content-type', 'text/html'); return s.end(page()); }
  const f = path.join(ROOT, u);
  fs.stat(f, (e, st) => {
    if (e) { s.statusCode = 404; return s.end(); }
    const t = types[path.extname(f)] || 'application/octet-stream';
    const rng = q.headers.range;
    s.setHeader('content-type', t); s.setHeader('accept-ranges', 'bytes');
    if (rng) { const m = /bytes=(\d*)-(\d*)/.exec(rng); const a = +m[1] || 0, b = m[2] ? +m[2] : st.size - 1; s.statusCode = 206; s.setHeader('content-range', `bytes ${a}-${b}/${st.size}`); s.setHeader('content-length', b - a + 1); return fs.createReadStream(f, { start: a, end: b }).pipe(s); }
    s.setHeader('content-length', st.size); fs.createReadStream(f).pipe(s);
  });
}).listen(5188);
const b = await chromium.launch();
const out = [];
const log = (...a) => { console.log(...a); out.push(a.join(' ')); };
for (const motion of ['no-preference', 'reduce']) for (const w of [1440, 1024, 390]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 }, reducedMotion: motion, hasTouch: w === 390 });
  const p = await ctx.newPage();
  const errs = []; p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); p.on('pageerror', e => errs.push(e.message));
  p.on('requestfailed', r => errs.push('reqfail ' + r.url()));
  await p.goto('http://localhost:5188/test.html'); await p.waitForTimeout(400);
  const ov = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const nvid = await p.evaluate(() => document.querySelectorAll('video').length);
  const sec = p.locator('#capabilities');
  await sec.scrollIntoViewIfNeeded();
  await p.waitForTimeout(300);
  await sec.screenshot({ path: SEC + `qa/cp-${w}-${motion}.png` });
  log(`[${motion} ${w}] overflow=${ov} videos=${nvid} consoleErrors=${JSON.stringify(errs)}`);
  if (w === 1440 || w === 390) {
    // keyboard: tab to first play button
    const first = p.locator('.cp-play').first();
    await first.scrollIntoViewIfNeeded(); await p.waitForTimeout(300);
    await p.evaluate(() => document.activeElement && document.activeElement.blur());
    let n = 0; while (n++ < 40) { await p.keyboard.press('Tab'); if (await first.evaluate(el => el === document.activeElement)) break; }
    const st1 = await p.evaluate(() => { const v = document.querySelector('.cp-vid video'); return { paused: v.paused, loop: v.loop, rs: v.readyState }; });
    log(`  focus on first button after ${n} tabs; after-focus paused=${st1.paused} loop=${st1.loop}`);
    await p.keyboard.press('Enter'); await p.waitForTimeout(1500);
    const a = await p.evaluate(() => { const v = document.querySelector('.cp-vid video'); return { paused: v.paused, t: v.currentTime, rs: v.readyState, src: v.currentSrc.split('/').pop(), label: document.querySelector('.cp-play').getAttribute('aria-label'), txt: document.querySelector('.cp-pt').textContent }; });
    await p.waitForTimeout(1200);
    const t2 = await p.evaluate(() => document.querySelector('.cp-vid video').currentTime);
    log(`  Enter -> paused=${a.paused} t=${a.t.toFixed(2)} -> ${t2.toFixed(2)} readyState=${a.rs} src=${a.src} button="${a.txt}" aria="${a.label}"`);
    await first.screenshot({ path: SEC + `qa/cp-btn-${w}-${motion}.png` }).catch(() => {});
    await p.locator('.cp-vid').first().screenshot({ path: SEC + `qa/cp-playing-${w}-${motion}.png` });
    await p.keyboard.press('Enter'); await p.waitForTimeout(300);
    const paused = await p.evaluate(() => document.querySelector('.cp-vid video').paused);
    log(`  Enter again -> paused=${paused}`);
    if (w === 1440) {
      // hover on second video
      const f2 = p.locator('.cp-vid').nth(1); await f2.scrollIntoViewIfNeeded(); await f2.hover(); await p.waitForTimeout(1200);
      const h = await p.evaluate(() => { const v = document.querySelectorAll('.cp-vid video')[1]; return { paused: v.paused, t: v.currentTime }; });
      await p.mouse.move(5, 5); await p.waitForTimeout(300);
      const h2 = await p.evaluate(() => document.querySelectorAll('.cp-vid video')[1].paused);
      log(`  hover second: playing=${!h.paused} t=${h.t.toFixed(2)}; after leave paused=${h2}`);
      // scroll away pauses
      await p.locator('.cp-play').nth(2).click(); await p.waitForTimeout(500);
      await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(600);
      const off = await p.evaluate(() => document.querySelectorAll('.cp-vid video')[2].paused);
      log(`  scrolled off-screen -> third paused=${off}`);
    }
    if (w === 390) {
      await p.locator('.cp-play').nth(3).tap(); await p.waitForTimeout(1200);
      const tp = await p.evaluate(() => { const v = document.querySelectorAll('.cp-vid video')[3]; return { paused: v.paused, t: v.currentTime }; });
      log(`  tap fourth: playing=${!tp.paused} t=${tp.t.toFixed(2)}`);
    }
  }
  await ctx.close();
}
fs.writeFileSync(SEC + 'qa/qa-log.txt', out.join('\n'));
await b.close(); srv.close();
