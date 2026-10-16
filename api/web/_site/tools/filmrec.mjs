import { chromium } from 'playwright';
const OUT = process.env.OUT;
const b = await chromium.launch();
for (const [id, url, sel] of [['terra', '/showcase/terra/', '[data-journey]'], ['pourplay', '/showcase/pour-play/', '[data-runway]']]) {
  const c = await b.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: { dir: OUT + id, size: { width: 1280, height: 800 } } });
  const p = await c.newPage();
  await p.goto('http://localhost:8080' + url, { waitUntil: 'load' });
  await p.evaluate(s => { document.documentElement.style.scrollBehavior = 'auto'; const r = document.querySelector(s); scrollTo(0, r.offsetTop); }, sel);
  await p.waitForTimeout(3500);
  const t0 = Date.now();
  await p.evaluate(async s => {
    const r = document.querySelector(s), top = r.offsetTop, len = r.offsetHeight - innerHeight;
    const n = s === '[data-journey]' ? 4 : 3;
    for (let i = 0; i < n; i++) {
      const target = top + len * (i + 0.5) / n, from = scrollY, dur = 900, st = performance.now();
      await new Promise(res => { (function step(now) { const t = Math.min(1, (now - st) / dur); scrollTo(0, from + (target - from) * (t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)); t < 1 ? requestAnimationFrame(step) : res(); })(st); });
      await new Promise(r2 => setTimeout(r2, 3800));
    }
  }, sel);
  await c.close();
  console.log(id, 'recorded', ((Date.now() - t0) / 1000).toFixed(1) + 's');
}
await b.close();
