import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto('http://localhost:8080/showcase/triple-t/', { waitUntil: 'load' });
await p.waitForSelector('[data-sound]:not([hidden])', { timeout: 30000 });
await p.waitForTimeout(3000);
const st = () => p.evaluate(() => { const f = document.querySelector('[data-film] iframe'); const pl = window.YT && YT.get && f && YT.get(f.id); return pl && pl.getPlayerState ? { state: pl.getPlayerState(), muted: pl.isMuted(), vol: pl.getVolume(), t: Math.round(pl.getCurrentTime()) } : 'not ready'; });
console.log('before', JSON.stringify(await st()));
await p.click('[data-sound]');
for (let i = 0; i < 6; i++) { await p.waitForTimeout(1000); console.log('after ' + (i + 1) + 's', JSON.stringify(await st()), await p.getAttribute('[data-sound]', 'aria-pressed')); }
await p.click('[data-sound]'); await p.waitForTimeout(800);
console.log('off', JSON.stringify(await st()));
await b.close();
