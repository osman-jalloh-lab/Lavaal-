import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto('http://localhost:8080/index.html'); await p.waitForTimeout(800);
const seen = [], bad = [];
for (let i = 0; i < 150; i++) {
  await p.keyboard.press('Tab');
  const r = await p.evaluate(() => {
    const e = document.activeElement; if (!e || e === document.body) return null;
    const cs = getComputedStyle(e), bb = e.getBoundingClientRect();
    const ring = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== 'none';
    const name = (e.getAttribute('aria-label') || e.textContent || e.name || '').trim().slice(0, 40);
    return { tag: e.tagName.toLowerCase(), name, ring, hidden: bb.width === 0 || bb.height === 0 || cs.visibility === 'hidden', small: bb.width < 24 || bb.height < 24, id: e.id + '@' + Math.round(bb.left + scrollX) + ',' + Math.round(bb.top + scrollY) };
  });
  if (!r) break;
  const key = r.tag + '|' + r.name + '|' + r.id;
  if (seen.includes(key)) break;
  seen.push(key);
  if (!r.ring) bad.push(['no focus ring', r.tag, r.name]);
  if (r.hidden) bad.push(['focus on hidden element', r.tag, r.name]);
  if (r.small) bad.push(['target < 24px', r.tag, r.name]);
}
console.log('tab stops:', seen.length); console.log(bad);
const s = await p.evaluate(() => ({
  lang: document.documentElement.lang,
  h1: document.querySelectorAll('h1').length,
  headings: [...document.querySelectorAll('h1,h2,h3,h4')].map(h => h.tagName + ':' + h.textContent.trim().slice(0, 30)),
  landmarks: ['header','nav','main','footer'].map(t => t + '=' + document.querySelectorAll(t).length),
  imgNoAlt: [...document.querySelectorAll('img:not([alt])')].length,
  videosNoTrack: [...document.querySelectorAll('video')].filter(v => !v.querySelector('track')).length,
  videoLabels: [...document.querySelectorAll('video')].filter(v => !v.getAttribute('aria-label')).length,
  autoplay: [...document.querySelectorAll('video[autoplay]')].length,
  skipTarget: !!document.querySelector(document.querySelector('.skip')?.getAttribute('href') || 'x'),
}));
console.log(JSON.stringify(s, null, 1));
await b.close();
