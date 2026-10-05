import { chromium } from 'playwright';
const OUT = process.env.OUT;
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const c = await b.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: { dir: OUT, size: { width: 1280, height: 800 } } });
const p = await c.newPage();
const t0 = Date.now();
await p.goto('http://localhost:8080/showcase/pour-play/', { waitUntil: 'load' });
await p.waitForFunction(() => document.querySelector('[data-loader]').classList.contains('done'), null, { timeout: 30000 });
await p.waitForTimeout(1200);
const start = (Date.now() - t0) / 1000;
await p.evaluate(async () => {
  const max = document.querySelector('[data-runway]').offsetHeight - innerHeight;
  const dur = 16000, s = performance.now();
  await new Promise(res => { (function step(now) { const t = Math.min(1, (now - s) / dur); scrollTo(0, max * t); t < 1 ? requestAnimationFrame(step) : res(); })(s); });
});
await p.waitForTimeout(1500);
await c.close(); await b.close();
console.log('start', start.toFixed(1));
