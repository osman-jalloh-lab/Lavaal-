import { chromium } from 'playwright';
const b = await chromium.launch();
for (const name of ['hotel', 'shop']) {
  for (const [v, w, h] of [['', 1280, 720], ['&v=916', 720, 1280]]) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    const errs = []; p.on('pageerror', e => errs.push(String(e)));
    await p.goto(`http://localhost:8080/videos/${name}.html?rec${v}`, { waitUntil: 'load' }); await p.waitForTimeout(600);
    const T = v ? [10.9, 19.2] : [1.5, 5.9, 10.9, 15.9, 19.2, 24.5];
    for (const [i, t] of T.entries()) { await p.evaluate(x => window.render(x), t); await p.screenshot({ path: `../qa/sb-${name}${v ? '916' : ''}-${i}.png` }); }
    if (errs.length) console.log(name, v, errs);
    await p.close();
  }
}
await b.close(); console.log('ok');
