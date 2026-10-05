import { chromium } from 'playwright';
const b = await chromium.launch();
const sites = [['terra', '/showcase/terra/', '[data-journey]', 4], ['pp', '/showcase/pour-play/', '[data-runway]', 3]];
for (const [name, url, sel, n] of sites) {
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 140)); });
    await p.goto('http://localhost:8080' + url, { waitUntil: 'load' });
    await p.waitForTimeout(1500);
    const playing = [];
    for (let i = 0; i < n; i++) {
      await p.evaluate(([s, i, n]) => { document.documentElement.style.scrollBehavior = 'auto'; const r = document.querySelector(s); const top = r.offsetTop, len = r.offsetHeight - innerHeight; scrollTo(0, top + len * (i + 0.5) / n); }, [sel, i, n]);
      await p.waitForTimeout(2200);
      playing.push(await p.evaluate(() => { const v = document.querySelector('[data-film] video.on'); return v ? (v.paused ? 'paused' : 'play') + ':' + v.currentSrc.split('/').pop() : 'none'; }));
      await p.screenshot({ path: `../qa/film-${name}-${i}-${w}.png` });
    }
    console.log(name, w, JSON.stringify({ errs, playing, overflow: await p.evaluate(() => document.documentElement.scrollWidth > innerWidth) }));
    await p.close();
  }
}
await b.close();
