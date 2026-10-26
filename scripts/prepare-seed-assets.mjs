import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const original = readFileSync('asserts/seed.png');
const cutout = readFileSync('asserts/seed-cutout/seed.png');
const manifestPath = 'docs/seed-assets.manifest.json';
if (existsSync(manifestPath) && JSON.parse(readFileSync(manifestPath, 'utf8')).sourceSha256 !== hash(original)) throw new Error('seed-source-changed: regenerate the transparent cutout first');
const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'chrome' : undefined, headless: true });
let result;
try {
  const page = await browser.newPage();
  result = await page.evaluate(async (encoded) => {
    const image = await createImageBitmap(await (await fetch(`data:image/png;base64,${encoded}`)).blob());
    const source = document.createElement('canvas'); source.width = image.width; source.height = image.height;
    const context = source.getContext('2d', { willReadFrequently: true }); context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, source.width, source.height).data;
    let left = image.width; let right = 0; let top = image.height; let bottom = 0; let transparent = 0;
    for (let vertical = 0; vertical < image.height; vertical += 1) for (let horizontal = 0; horizontal < image.width; horizontal += 1) {
      if (pixels[(vertical * image.width + horizontal) * 4 + 3] === 0) { transparent += 1; continue; }
      left = Math.min(left, horizontal); right = Math.max(right, horizontal); top = Math.min(top, vertical); bottom = Math.max(bottom, vertical);
    }
    if (transparent / (image.width * image.height) < .05) throw new Error('seed-cutout-not-transparent');
    const width = right - left + 1; const height = bottom - top + 1;
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = Math.round(height / width * 236 + 20);
    const output = canvas.getContext('2d'); output.imageSmoothingQuality = 'high'; output.drawImage(image, left, top, width, height, 10, 10, 236, canvas.height - 20);
    image.close();
    return { data: canvas.toDataURL('image/webp', .94).split(',')[1], width: canvas.width, height: canvas.height, transparentFraction: transparent / (source.width * source.height) };
  }, cutout.toString('base64'));
} finally { await browser.close(); }
const bytes = Buffer.from(result.data, 'base64'); const sha256 = hash(bytes);
const src = `/asserts/ui/seed-${sha256.slice(0, 12)}.webp`;
mkdirSync('public/asserts/ui', { recursive: true }); writeFileSync(`public${src}`, bytes);
writeFileSync('src/data/seedAssets.generated.json', JSON.stringify({ src, width: result.width, height: result.height }, null, 2) + '\n');
writeFileSync(manifestPath, JSON.stringify({ source: 'asserts/seed.png', sourceSha256: hash(original), cutout: 'asserts/seed-cutout/seed.png', cutoutSha256: hash(cutout), method: 'built-in image_gen transparent background extraction; offline alpha-preserving WebP encoding', generated: 'C:/Users/guoxu/.codex/generated_images/01a13e71-2378-7cf1-b0d5-392d6f3531bb/exec-d95c0e61-9b06-4a5c-9d34-e23649ed8304.png', prompt: 'Use case: background-extraction. Edit target: the supplied local seed.png. Create a clean isolated transparent RGBA cutout of exactly the existing single brown elongated seed with its narrow green seam. Preserve the seed\'s artwork, identity, colors, shading, silhouette, diagonal orientation, and proportions precisely. Remove only the white backdrop and any detached background corner marks; the output must contain only this seed and fully transparent pixels around it. No redesign, no new leaves, no added glow, no shadow, no text, no props. Tight transparent padding around the seed. This is a small animated website sprite; do not bake animation effects into the asset.', src, bytes: bytes.length, sha256, width: result.width, height: result.height, transparentFraction: result.transparentFraction }, null, 2) + '\n');
console.log(JSON.stringify({ src, bytes: bytes.length, width: result.width, height: result.height }));
