import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { localImagePath, publicImagePath } from './lib/paths.mjs';

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'ignore' });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}.`)));
  });
}

export function mediaSkipReason(image, now = new Date()) {
  if (!image.sourceUrl) return 'invalid-image';
  if (image.isRich) return 'restricted-image';
  if (image.expirationDate && new Date(`${image.expirationDate}T23:59:59Z`) < now) return 'expired-image';
  return null;
}

export async function downloadPermittedImages(product, options) {
  const { rootDir, maxImages = 4, timeoutMs = 20_000, onSkipped } = options;
  const candidates = product._gallery.slice(0, maxImages); const localImages = [];
  for (const candidate of candidates) {
    const reason = mediaSkipReason(candidate);
    if (reason) { onSkipped?.(candidate, reason); continue; }
    const number = localImages.length + 1; const destination = localImagePath(rootDir, product, number);
    const temporary = `${destination}.source`; const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(candidate.sourceUrl, { headers: { 'User-Agent': 'LAVAALL-Icecat-Importer/1.0' }, signal: controller.signal });
      if (!response.ok) { onSkipped?.(candidate, 'invalid-image'); continue; }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.length) { onSkipped?.(candidate, 'invalid-image'); continue; }
      await fs.mkdir(path.dirname(destination), { recursive: true }); await fs.writeFile(temporary, bytes);
      await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', temporary, '-vf', 'scale=1600:1600:force_original_aspect_ratio=decrease', '-c:v', 'libwebp', '-q:v', '88', destination]);
      const dimensions = await imageDimensions(destination);
      if (!dimensions.width || !dimensions.height) { await fs.rm(destination, { force: true }); onSkipped?.(candidate, 'invalid-image'); continue; }
      localImages.push({ path: publicImagePath(product, number), sourceUrl: candidate.sourceUrl, isMain: candidate.isMain || number === 1, width: dimensions.width, height: dimensions.height, mediaUsageStatus: 'permitted' });
    } catch { onSkipped?.(candidate, 'invalid-image'); }
    finally { clearTimeout(timer); await fs.rm(temporary, { force: true }); }
  }
  product.images = localImages; product.primaryImage = localImages.find(image => image.isMain)?.path ?? null;
  product.mediaUsageStatus = localImages.length ? 'permitted' : product._gallery.some(image => image.isRich) ? 'restricted' : 'unavailable';
  delete product._gallery; return product;
}

export async function imageDimensions(filePath) {
  const { stdout } = await new Promise((resolve, reject) => {
    const child = spawn('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', filePath]); let stdout = '';
    child.stdout.on('data', chunk => { stdout += chunk; }); child.once('error', reject); child.once('exit', code => code === 0 ? resolve({ stdout }) : reject(new Error('ffprobe failed.')));
  });
  const stream = JSON.parse(stdout).streams?.[0] ?? {}; return { width: Number(stream.width ?? 0), height: Number(stream.height ?? 0) };
}
