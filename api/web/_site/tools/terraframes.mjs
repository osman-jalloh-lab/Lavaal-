import { srv } from './serve.mjs';
import { chromium } from 'playwright';
import fs from 'fs';
const OUT = process.env.OUT; fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto('http://localhost:8080/showcase/terra/?rec', { waitUntil: 'load' });
await p.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo(0, document.getElementById('courses').offsetTop + 2); document.querySelectorAll('video').forEach(v => v.pause()); });
await p.waitForFunction(() => window.__terraFrame, null, { timeout: 30000 });
const N = 336; // 14s at 24fps
for (let i = 0; i < N; i++) {
  const x = i / (N - 1), e = x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
  await p.evaluate(([pp, t]) => window.__terraFrame(pp, t), [e * 0.6 + x * 0.4, i / 24]);
  await p.screenshot({ path: `${OUT}/f${String(i).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 88, timeout: 180000 });
}
await b.close(); srv.close(); console.log('frames', N);
