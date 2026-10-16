import { chromium } from 'playwright';
import fs from 'fs';
const axe = fs.readFileSync(process.env.AXE, 'utf8');
const b = await chromium.launch();
for (const w of [1440, 390]) {
  const p = await b.newPage({ viewport: { width: w, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('http://localhost:8080/showcase/salone-artists/', { waitUntil: 'networkidle' });
  await p.screenshot({ path: `../qa/cat-top-${w}.png` });
  await p.evaluate(() => document.getElementById('artists').scrollIntoView());
  await p.waitForTimeout(600);
  await p.screenshot({ path: `../qa/cat-grid-${w}.png` });
  await p.click('[data-f="gospel"]');
  const shown = await p.evaluate(() => [...document.querySelectorAll('[data-grid] > li')].filter(l => !l.hidden).length);
  await p.click('[data-f="all"]');
  await p.evaluate(axe);
  const r = await p.evaluate(() => axe.run(document, { runOnly: ['wcag2a','wcag2aa','wcag21aa','wcag22aa'] }));
  console.log(w, JSON.stringify({ errs, gospelShown: shown, axe: r.violations.map(v => v.id + ':' + v.nodes.length), overflow: await p.evaluate(() => document.documentElement.scrollWidth > innerWidth) }));
  await p.close();
}
await b.close();
