// Records real scroll-throughs of Osman's built sites (read-only sources) for the Work section.
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';
const D = 'C:/Users/osman/OneDrive/Desktop/';
const roots = { lav: D + 'new lavaall/Lavaal--main', star: D + 'startlink', port: D + 'profolio/dist' };
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.svg': 'image/svg+xml', '.json': 'application/json', '.mp4': 'video/mp4', '.webm': 'video/webm', '.woff2': 'font/woff2', '.woff': 'font/woff', '.glb': 'model/gltf-binary' };
const srv = http.createServer((q, s) => {
  const [k, ...r] = decodeURIComponent(q.url.split('?')[0]).split('/').filter(Boolean);
  const root = roots[k]; if (!root) { s.statusCode = 404; return s.end(); }
  let f = path.join(root, ...r); if (!path.extname(f)) f = path.join(f, 'index.html');
  fs.readFile(f, (e, b) => { if (e) { s.statusCode = 404; return s.end(); } s.setHeader('content-type', types[path.extname(f).toLowerCase()] || 'application/octet-stream'); s.end(b); });
}).listen(5177);
const OUT = process.env.OUT;
const W = 1280, H = 800;
const sites = (process.env.SITES || 'lav,star,hermes,port').split(',');
const urls = { lav: 'http://localhost:5177/lav/', star: 'http://localhost:5177/star/v4/', hermes: 'https://parawi.com', port: 'http://localhost:5177/port/' };
const b = await chromium.launch();
for (const id of sites) {
  const c = await b.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: OUT + id, size: { width: W, height: H } } });
  const p = await c.newPage();
  const t0 = Date.now();
  try { await p.goto(urls[id], { waitUntil: 'load', timeout: 45000 }); } catch (e) { console.log('goto', id, e.message); }
  await p.waitForTimeout(3000);
  const loadedAt = (Date.now() - t0) / 1000;
  // Smooth eased scroll with pauses, like a person browsing.
  await p.evaluate(async () => {
    const max = Math.min(document.documentElement.scrollHeight - innerHeight, innerHeight * 5);
    const stops = [0.22, 0.45, 0.7, 1].map(f => f * max);
    const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    let from = 0;
    for (const to of stops) {
      const dur = 1600, start = performance.now();
      await new Promise(res => { (function step(now) { const t = Math.min(1, (now - start) / dur); scrollTo(0, from + (to - from) * ease(t)); t < 1 ? requestAnimationFrame(step) : res(); })(start); });
      from = to;
      await new Promise(r => setTimeout(r, 1100));
    }
  });
  await p.waitForTimeout(800);
  fs.writeFileSync(OUT + id + '/start.txt', String(loadedAt));
  await c.close();
  console.log('recorded', id, 'content starts ~', loadedAt.toFixed(1), 's');
}
await b.close(); srv.close();
