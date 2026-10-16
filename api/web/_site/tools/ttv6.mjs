import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'chrome', headless: true });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto('http://localhost:8080/showcase/triple-t/', { waitUntil: 'load' });
await p.waitForTimeout(2000);
const btn = p.locator('button[data-yt="XgD9fmydrJ4"]'); await btn.scrollIntoViewIfNeeded(); await btn.click(); await p.waitForTimeout(6000);
const fr = p.frames().find(f => f.url().includes('XgD9fmydrJ4?autoplay=1&rel=0'));
console.log(fr ? JSON.stringify(await fr.evaluate(() => { const v = document.querySelector('video'); return { playing: !v.paused, muted: v.muted, t: +v.currentTime.toFixed(1) }; })) : 'no frame');
await b.close();
