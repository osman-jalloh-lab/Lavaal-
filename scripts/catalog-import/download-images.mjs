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

// The cap applies to approved, successfully processed images, not their
// position in Icecat's source gallery. ProductPicture ordering frequently
// includes restricted or expired assets before the usable product views.
export async function collectApprovedGalleryImages(gallery, options = {}) {
  const { maxImages = 4, onSkipped, download } = options;
  if (typeof download !== 'function') throw new TypeError('missing-image-downloader');
  const localImages = [];
  for (const candidate of gallery ?? []) {
    if (localImages.length >= maxImages) break;
    const reason = mediaSkipReason(candidate);
    if (reason) { onSkipped?.(candidate, reason); continue; }
    try {
      const image = await download(candidate, localImages.length + 1);
      if (!image) { onSkipped?.(candidate, 'invalid-image'); continue; }
      localImages.push(image);
    } catch { onSkipped?.(candidate, 'invalid-image'); }
  }
  return localImages;
}

export async function downloadPermittedImages(product, options) {
  const { rootDir, maxImages = 4, timeoutMs = 20_000, onSkipped } = options;
  const localImages = await collectApprovedGalleryImages(product._gallery, {
    maxImages,
    onSkipped,
    download: async (candidate, number) => {
      const destination = localImagePath(rootDir, product, number);
      const temporary = `${destination}.source`; const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(candidate.sourceUrl, { headers: { 'User-Agent': 'LAVAALL-Icecat-Importer/1.0' }, signal: controller.signal });
      if (!response.ok) return null;
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.length) return null;
      await fs.mkdir(path.dirname(destination), { recursive: true }); await fs.writeFile(temporary, bytes);
      await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', temporary, '-vf', 'scale=1600:1600:force_original_aspect_ratio=decrease', '-c:v', 'libwebp', '-q:v', '88', destination]);
      const dimensions = await imageDimensions(destination);
      if (!dimensions.width || !dimensions.height) { await fs.rm(destination, { force: true }); return null; }
      return { path: publicImagePath(product, number), sourceUrl: candidate.sourceUrl, isMain: candidate.isMain || number === 1, width: dimensions.width, height: dimensions.height, mediaUsageStatus: 'permitted' };
    }
    finally { clearTimeout(timer); await fs.rm(temporary, { force: true }); }
    }
  });
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
