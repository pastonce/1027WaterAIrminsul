import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const relative = (file) => path.relative(root, file).replaceAll('\\', '/');
const loadingNames = ['AB1.png', 'AB2.png', 'BC1.png', 'BC2.png', 'CD1.jpg', 'CD2.png', 'DE1.png', 'DE2.png', 'EF1.png', 'EF2.png', 'FG1.png'];
const jobs = [
  ...loadingNames.map((name) => ({ id: path.parse(name).name, source: `asserts/阶段转场/${name}`, directory: 'loading/art', widths: [1280, 1920], quality: 0.86, cropLeft: name === 'CD2.png' ? 580 : 0 })),
  { id: 'realityBackground', source: 'asserts/background.png', directory: 'backgrounds/reality', widths: [1067], quality: 0.91 },
  { id: 'dialogue', source: 'asserts/dialog.jpg', directory: 'ui', widths: [840], quality: 0.9 },
  { id: 'icon', source: 'asserts/icon.png', directory: 'ui', widths: [128], quality: 1, square: true },
];
const manifest = { version: 1, inputs: [], files: [], sourceBytes: 0, publishedBytes: 0 };
const runtime = { loading: {}, realityBackground: '', dialogue: '', icon: '' };
const previews = [];
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? (process.platform === 'win32' ? 'chrome' : undefined), headless: true });
try {
  const page = await browser.newPage();
  for (const job of jobs) {
    const input = readFileSync(path.join(root, job.source));
    const result = await page.evaluate(async ({ encoded, job }) => {
      const image = await createImageBitmap(await (await fetch(`data:application/octet-stream;base64,${encoded}`)).blob());
      const width = image.width - (job.cropLeft ?? 0);
      const height = image.height;
      const render = (target, kind, quality, shape) => {
        const scale = Math.min(1, target / width, shape ? target / height : Infinity);
        const canvas = document.createElement('canvas');
        canvas.width = shape ? target : Math.round(width * scale);
        canvas.height = shape ? target : Math.round(height * scale);
        const context = canvas.getContext('2d');
        context.imageSmoothingQuality = 'high';
        if (shape) {
          const drawWidth = Math.round(width * scale); const drawHeight = Math.round(height * scale);
          context.drawImage(image, job.cropLeft ?? 0, 0, width, height, (target - drawWidth) / 2, (target - drawHeight) / 2, drawWidth, drawHeight);
        } else context.drawImage(image, job.cropLeft ?? 0, 0, width, height, 0, 0, canvas.width, canvas.height);
        const output = { width: canvas.width, height: canvas.height, data: canvas.toDataURL(kind, quality).split(',')[1] };
        canvas.width = 0; canvas.height = 0;
        return output;
      };
      const files = job.widths.map((target) => render(target, job.square ? 'image/png' : 'image/webp', job.quality, job.square));
      const preview = job.id.length === 3 ? render(320, 'image/webp', 0.8) : null;
      const original = { width: image.width, height: image.height };
      image.close();
      return { original, files, preview };
    }, { encoded: input.toString('base64'), job });
    manifest.inputs.push({ file: job.source, bytes: input.length, sha256: digest(input), ...result.original, cropLeft: job.cropLeft ?? 0 });
    manifest.sourceBytes += input.length;
    const outputs = [];
    for (const file of result.files) {
      const encoded = Buffer.from(file.data, 'base64');
      const retainJpeg = job.id === 'dialogue' && encoded.length >= input.length;
      const bytes = retainJpeg ? input : encoded;
      const hash = digest(bytes);
      const filename = `${job.id.toLowerCase()}-${file.width}.${hash.slice(0, 12)}.${job.square ? 'png' : retainJpeg ? 'jpg' : 'webp'}`;
      const target = path.join(root, 'public/asserts', job.directory, filename);
      mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, bytes);
      const output = { src: `/asserts/${job.directory}/${filename}`, width: file.width, height: file.height };
      manifest.files.push({ file: relative(target), bytes: bytes.length, sha256: hash, source: job.source, ...output });
      manifest.publishedBytes += bytes.length;
      outputs.push(output);
    }
    if (job.id.length === 3) {
      runtime.loading[job.id] = { compact: outputs[0].src, full: outputs[1].src, aspect: outputs[1].width / outputs[1].height, cropped: Boolean(job.cropLeft) };
      previews.push({ id: job.id, data: result.preview.data });
    } else runtime[job.id] = outputs[0].src;
    console.log(`${job.id}: ${input.length} -> ${manifest.files.filter((file) => file.source === job.source).reduce((sum, file) => sum + file.bytes, 0)} B`);
  }
  const preview = await page.evaluate(async (entries) => {
    const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 660;
    const context = canvas.getContext('2d'); context.fillStyle = '#f6f7f1'; context.fillRect(0, 0, canvas.width, canvas.height);
    for (const [index, entry] of entries.entries()) {
      const image = await createImageBitmap(await (await fetch(`data:image/webp;base64,${entry.data}`)).blob());
      const left = index % 4 * 320; const top = Math.floor(index / 4) * 220;
      const scale = Math.min(304 / image.width, 190 / image.height);
      context.drawImage(image, left + (320 - image.width * scale) / 2, top + 24, image.width * scale, image.height * scale);
      context.fillStyle = '#244e3d'; context.font = '16px sans-serif'; context.fillText(entry.id, left + 10, top + 19); image.close();
    }
    return canvas.toDataURL('image/png').split(',')[1];
  }, previews);
  mkdirSync(path.join(root, '.asset-work'), { recursive: true });
  writeFileSync(path.join(root, '.asset-work/loading-art-contact.png'), Buffer.from(preview, 'base64'));
} finally { await browser.close(); }
writeFileSync(path.join(root, 'src/data/pageAssets.generated.json'), JSON.stringify(runtime, null, 2) + '\n');
writeFileSync(path.join(root, 'docs/page-assets.manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Total: ${manifest.sourceBytes} -> ${manifest.publishedBytes} B`);
