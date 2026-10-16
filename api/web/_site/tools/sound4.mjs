import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.goto('http://localhost:8080/showcase/triple-t/', { waitUntil: 'load' });
await p.waitForTimeout(3000);
await p.click('[data-sound]');
await p.waitForTimeout(5000);
const fr = p.frames().find(f => f.url().includes('youtube.com/embed/XgD9fmydrJ4'));
let st = 'no frame';
if (fr) st = await fr.evaluate(() => { const v = document.querySelector('video'); return v ? { paused: v.paused, muted: v.muted, t: +v.currentTime.toFixed(1), vol: v.volume } : 'no video el'; });
console.log('modal open:', await p.evaluate(() => document.getElementById('vm').open), 'player:', JSON.stringify(st));
if (st && st.paused) {
  // simulate the one extra tap inside YouTube's player
  const box = await p.locator('.vm-frame').boundingBox(); await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await p.waitForTimeout(3000);
  st = await fr.evaluate(() => { const v = document.querySelector('video'); return { paused: v.paused, muted: v.muted, t: +v.currentTime.toFixed(1) }; });
  console.log('after tap in player:', JSON.stringify(st));
}
await p.screenshot({ path: '../qa/tt-vm.png' });
await p.keyboard.press('Escape'); await p.waitForTimeout(400);
console.log('closed:', !(await p.evaluate(() => document.getElementById('vm').open)), JSON.stringify(errs));
await b.close();
