import { chromium } from 'playwright';
import fs from 'fs';
const axe = fs.readFileSync(process.env.AXE, 'utf8');
const b = await chromium.launch();
for (const w of [1440, 390]) {
  const p = await b.newPage({ viewport: { width: w, height: 900 }, reducedMotion: 'reduce' });
  await p.goto('http://localhost:8080/index.html'); await p.waitForTimeout(800);
  await p.evaluate(axe);
  const r = await p.evaluate(() => axe.run(document, { runOnly: ['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','best-practice'] }));
  console.log('== width', w, 'violations', r.violations.length);
  for (const v of r.violations) {
    console.log(`- [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length})`);
    for (const n of v.nodes.slice(0, 4)) console.log('    ', n.target.join(' '), '|', (n.failureSummary||'').split('\n')[1]||'');
  }
  await p.close();
}
await b.close();
