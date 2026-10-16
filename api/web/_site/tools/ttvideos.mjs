import { chromium } from 'playwright';
const OUT = '../qa/tt-videos/';
const b = await chromium.launch({ channel: 'chrome', headless: true });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.goto('http://localhost:8080/showcase/triple-t/', { waitUntil: 'load' });
async function state(match) {
  const fr = p.frames().find(f => f.url().includes(match));
  if (!fr) return { err: 'no player frame' };
  try {
    return await fr.evaluate(() => {
      const v = document.querySelector('video'), e = document.querySelector('.ytp-error');
      const errTxt = e && getComputedStyle(e).display !== 'none' ? e.innerText.replace(/\s+/g, ' ').slice(0, 120) : null;
      return { playing: v ? !v.paused : false, muted: v ? v.muted : null, t: v ? +v.currentTime.toFixed(1) : null, ytError: errTxt };
    });
  } catch (e) { return { err: String(e).slice(0, 80) }; }
}
const rows = [];
// 1. hero background
await p.waitForTimeout(5000);
rows.push(['00 hero background (silent loop)', await state('youtube-nocookie.com/embed/XgD9fmydrJ4?autoplay=1&mute=1')]);
await p.screenshot({ path: OUT + '00-hero.png' });
// 2. watch with sound
await p.click('[data-sound]'); await p.waitForTimeout(5000);
rows.push(['01 Watch with sound', await state('www.youtube.com/embed/XgD9fmydrJ4')]);
await p.screenshot({ path: OUT + '01-watch-with-sound.png' });
await p.click('[data-vm-close]'); await p.waitForTimeout(500);
// 3. each lite embed
const ids = await p.$$eval('button[data-yt]', bs => bs.map(b => [b.dataset.yt, b.getAttribute('aria-label')]));
let i = 2;
for (const [id, label] of ids) {
  const btn = p.locator(`button[data-yt="${id}"]`).first();
  await btn.scrollIntoViewIfNeeded(); await p.waitForTimeout(400);
  await btn.click(); await p.waitForTimeout(6000);
  const st = await state('embed/' + id);
  const n = String(i).padStart(2, '0');
  rows.push([`${n} ${label} (${id})`, st]);
  const box = await p.locator(`[data-yt="${id}"], iframe[src*="${id}"]`).last().boundingBox().catch(() => null);
  await p.screenshot({ path: OUT + `${n}-${id}.png`, clip: box ? { x: Math.max(0, box.x - 20), y: Math.max(0, box.y - 20), width: Math.min(1440, box.width + 40), height: box.height + 80 } : undefined });
  // pause it so the next one is heard alone
  const fr = p.frames().find(f => f.url().includes('embed/' + id));
  if (fr) await fr.evaluate(() => document.querySelector('video')?.pause()).catch(() => {});
  i++;
}
for (const [k, v] of rows) console.log(k.padEnd(52), JSON.stringify(v));
console.log('page errors:', JSON.stringify(errs));
await b.close();
