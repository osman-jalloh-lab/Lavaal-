import { srv } from './serve.mjs';
import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
await p.goto('http://localhost:8080/showcase/terra/?rec', { waitUntil: 'load' });
await p.waitForTimeout(2500);
await p.screenshot({ path: '../qa/terra-hero.png' });
await p.waitForFunction(() => window.__terraFrame, null, { timeout: 20000 });
await p.evaluate(() => document.getElementById('courses').scrollIntoView());
for (const f of [0.9, 1]) {
  await p.evaluate(([pp]) => window.__terraFrame(pp, 3.2), [f]);
  const t0 = Date.now(); await p.screenshot({ path: `../qa/terra-${Math.round(f * 100)}.png`, timeout: 180000 }); console.log('frame', f, Date.now() - t0, 'ms');
}
console.log(JSON.stringify({ errs }));
await b.close(); srv.close();
