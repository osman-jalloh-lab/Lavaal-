import { chromium } from 'playwright';
import fs from 'fs';
const OUT = process.env.OUT; fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto('http://localhost:8080/showcase/pour-play/?rec', { waitUntil: 'load' });
await p.waitForFunction(() => document.querySelector('[data-loader]').classList.contains('done') && window.__ppFrame, null, { timeout: 30000 });
await p.evaluate(() => { window.ScrollTrigger && ScrollTrigger.getAll().forEach(t => t.kill()); });
const N = 456; // 19s at 24fps
for (let i = +(process.env.FROM || 0); i < N; i++) {
  const x = i / (N - 1), prog = x < .05 ? 0 : Math.min(1, (x - .05) / .9);
  const eased = prog < .5 ? 2 * prog * prog : 1 - Math.pow(-2 * prog + 2, 2) / 2;
  await p.evaluate(([pp, t]) => window.__ppFrame(pp, t), [eased * 0.5 + prog * 0.5, i / 24]);
  await p.screenshot({ path: `${OUT}/f${String(i).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 88 });
}
await b.close(); console.log('frames', N);
