import { srv } from './serve.mjs';
import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const [w, h, motion] of [[1280, 800, 'no-preference'], [390, 844, 'no-preference'], [1280, 800, 'reduce']]) {
  const p = await b.newPage({ viewport: { width: w, height: h }, reducedMotion: motion });
  const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
  await p.goto('http://localhost:8080/showcase/terra/', { waitUntil: 'load' });
  await p.waitForTimeout(1500);
  const tag = `${w}${motion === 'reduce' ? '-rm' : ''}`;
  const shots = w === 390 ? ['#courses', '#menu', '#cellar', '#reserve'] : ['#fire', '#menu', '#cellar', '.gallery'];
  for (const sel of shots) {
    await p.evaluate(s => document.querySelector(s).scrollIntoView(), sel);
    await p.waitForTimeout(1800);
    await p.screenshot({ path: `../qa/terra-${sel.replace(/[#.]/g, '')}-${tag}.png`, timeout: 180000 });
  }
  await p.evaluate(() => document.querySelector('#reserve').scrollIntoView());
  await p.fill('[name=date]', '2026-10-24'); await p.fill('[name=name]', 'Aminata');
  await p.click('[data-res] button');
  const status = await p.textContent('[data-status]');
  const flat = await p.evaluate(() => document.documentElement.classList.contains('flat'));
  console.log(tag, JSON.stringify({ errs, flat, status: status.slice(0, 60), overflow: await p.evaluate(() => document.documentElement.scrollWidth > innerWidth) }));
  await p.close();
}
await b.close(); srv.close();
