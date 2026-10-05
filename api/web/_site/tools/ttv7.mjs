import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'chrome', headless: true });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.goto('http://localhost:8080/showcase/triple-t/', { waitUntil: 'load' });
await p.waitForTimeout(2000);
const live = () => p.$$eval('button[data-yt] iframe', fs => fs.map(f => f.src.split('/embed/')[1].slice(0, 11)));
const play = async id => { const x = p.locator(`button[data-yt="${id}"]`); await x.scrollIntoViewIfNeeded(); await x.click(); await p.waitForTimeout(5000); };
async function st(id) { const fr = p.frames().find(f => f.url().includes(id + '?autoplay=1&rel=0')); return fr ? fr.evaluate(() => { const v = document.querySelector('video'); return { playing: !v.paused, muted: v.muted }; }) : 'gone'; }
await play('Mt9FoWaDl_I'); console.log('after Session 1:', await live(), JSON.stringify(await st('Mt9FoWaDl_I')));
await play('U84m20BLcmk'); console.log('after Lover   :', await live(), 'Session 1 =', JSON.stringify(await st('Mt9FoWaDl_I')), 'Lover =', JSON.stringify(await st('U84m20BLcmk')));
await p.screenshot({ path: '../qa/tt-videos/14-one-at-a-time.png' });
await p.evaluate(() => scrollTo(0, 0)); await p.click('[data-sound]'); await p.waitForTimeout(3000);
console.log('after Watch with sound:', await live());
console.log('errors:', JSON.stringify(errs));
await b.close();
