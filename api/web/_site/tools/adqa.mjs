import { chromium } from 'playwright';
import fs from 'fs';
const axe = fs.readFileSync(process.env.AXE, 'utf8');
const b = await chromium.launch();
for (const [w, h] of [[1440, 900], [390, 844]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
  await p.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; document.getElementById('os').scrollIntoView(); });
  await p.waitForTimeout(800);
  const out = {};
  for (const name of ['Argus', 'Lava', 'Iris', 'Kairos', 'Plutus', 'Mnemo', 'Mercury', 'Prometheus']) {
    await p.click(`[data-agent="${name}"]`);
    await p.waitForTimeout(300);
    let steps = await p.locator('.ad-rail li').count(), seen = [];
    for (let i = 0; i < steps; i++) {
      await p.click(`[data-go="${i}"]`); await p.waitForTimeout(1600);
      if (await p.locator('.ad .yes').count()) { await p.evaluate(() => { const y = document.querySelector('.ad .yes'); if (y) y.click(); }); await p.waitForTimeout(300); }
      seen.push(await p.textContent('[data-ad-t]'));
      if (name === 'Argus' && w === 1440) await p.locator('.ad').screenshot({ path: `../qa/ad-argus-${i}.png` });
    }
    if (name === 'Argus' && w === 390) await p.screenshot({ path: '../qa/ad-argus-390.png' });
    if (name === 'Argus' && w === 1440) { await p.evaluate(axe); const r = await p.evaluate(() => axe.run(document.querySelector('#ad'), { runOnly: ['wcag2a','wcag2aa','wcag21aa','wcag22aa'] })); out.axe = r.violations.map(v => v.id + ':' + v.nodes.length); }
    await p.keyboard.press('Escape'); await p.waitForTimeout(200);
    out[name] = steps + ' steps, open after Esc: ' + (await p.evaluate(() => document.getElementById('ad').open));
  }
  console.log(w, JSON.stringify({ errs, out, overflow: await p.evaluate(() => document.documentElement.scrollWidth > innerWidth) }, null, 0));
  await p.close();
}
await b.close();
