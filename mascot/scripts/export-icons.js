/**
 * Rasterise the static SVG posters to transparent PNG icons (48/96/192 px)
 * using the Playwright Chromium already installed as a devDependency.
 *
 *   node scripts/export-icons.js
 *
 * Output: assets/static/icons/{tech,web}-{idle,speaking}-{48,96,192}.png
 * Local only: renders from disk via page.setContent, no network.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATIC = path.join(ROOT, 'assets', 'static');
const OUT = path.join(STATIC, 'icons');
const SIZES = [48, 96, 192];
const POSES = ['tech-idle', 'tech-speaking', 'web-idle', 'web-speaking'];

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
let count = 0;
for (const pose of POSES) {
  const svg = fs.readFileSync(path.join(STATIC, `${pose}.svg`), 'utf8')
    .replace('width="120" height="160"', 'width="100%" height="100%"');
  for (const size of SIZES) {
    // Square icon: the 120x160 artwork is letterboxed (preserveAspectRatio default).
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<html><body style="margin:0;background:transparent">` +
      `<div style="width:${size}px;height:${size}px">${svg}</div></body></html>`);
    const file = path.join(OUT, `${pose}-${size}.png`);
    await page.screenshot({ path: file, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    count++;
  }
}
await browser.close();
console.log(`exported ${count} icons to assets/static/icons/`);
