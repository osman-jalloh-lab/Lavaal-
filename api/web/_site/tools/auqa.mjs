import { chromium } from 'playwright';
const b = await chromium.launch();
for (const [w, motion] of [[1440, 'no-preference'], [390, 'no-preference'], [1440, 'reduce']]) {
  const p = await b.newPage({ viewport: { width: w, height: 1000 }, reducedMotion: motion });
  const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
  await p.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
  await p.evaluate(() => { document.getElementById('auto').scrollIntoView(); document.querySelectorAll('#auto .rv').forEach(e => e.classList.add('in')); });
  await p.waitForTimeout(motion === 'reduce' ? 800 : 5200);
  if (motion !== 'reduce') await p.locator('.au-app').screenshot({ path: `../qa/au-mid-${w}.png` });
  const results = [];
  const tabs = await p.locator('.au-list button').count();
  for (let i = 0; i < tabs; i++) {
    await p.locator('.au-list button').nth(i).click();
    const deadline = Date.now() + 40000;
    while (Date.now() < deadline) {
      const ok = p.locator('.au-approve .ok');
      if (await ok.count()) { await ok.click().catch(() => {}); }
      const st = await p.getAttribute('[data-au-status]', 'data-state');
      if (st === 'done') break;
      await p.waitForTimeout(400);
    }
    const st = await p.getAttribute('[data-au-status]', 'data-state');
    const logs = await p.locator('.au-log li').count();
    results.push(`${i}:${st}/${logs}`);
    if (i === 1 && motion !== 'reduce') await p.locator('.au-app').screenshot({ path: `../qa/au-done-${w}.png` });
  }
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  console.log(w, motion, JSON.stringify({ errs, overflow, results }));
  await p.close();
}
await b.close();
