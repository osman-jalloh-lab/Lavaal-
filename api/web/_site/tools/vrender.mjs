// Frame-by-frame render of a code-native workflow video (window.render(t)), then ffmpeg.
import { chromium } from 'playwright';
import fs from 'fs';
const [url, out, w, h, dur] = [process.env.URL, process.env.OUT, +process.env.W, +process.env.H, +process.env.DUR];
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: w, height: h } });
await p.goto(url, { waitUntil: 'load' }); await p.waitForTimeout(600);
const N = Math.round(dur * 24);
for (let i = 0; i < N; i++) { await p.evaluate(t => window.render(t), i / 24); await p.screenshot({ path: `${out}/f${String(i).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 90 }); }
await b.close(); console.log('frames', N);
