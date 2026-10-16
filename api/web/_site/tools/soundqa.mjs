import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--autoplay-policy=user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.goto('http://localhost:8080/showcase/triple-t/', { waitUntil: 'load' });
await p.waitForSelector('[data-sound]:not([hidden])', { timeout: 20000 });
await p.waitForTimeout(1500);
await p.click('[data-sound]');
await p.waitForTimeout(2500);
const st = await p.evaluate(() => { const pl = window.YT && document.querySelector('[data-film] iframe'); return { pressed: document.querySelector('[data-sound]').getAttribute('aria-pressed') }; });
// read player state through the API object kept on the iframe
const muted = await p.evaluate(() => new Promise(r => { const f = document.querySelector('[data-film] iframe'); const pl = YT.get ? YT.get(f.id) : null; r(pl ? { muted: pl.isMuted(), state: pl.getPlayerState(), vol: pl.getVolume() } : 'no-handle'); }));
console.log(JSON.stringify({ errs, ...st, muted }));
await b.close();
