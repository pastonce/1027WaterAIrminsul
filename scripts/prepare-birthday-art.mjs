import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const upstream = 'https://webstatic.mihoyo.com/upload/static-resource/2022/08/08/';
const supplementUrls = {
  arrow: upstream + '82aca37e7353f1e5226b20deddb3e76b_5260178833428137342.png',
  arrowHover: upstream + '8c14aeaa672c05733f437bee0d4e921a_4856927836271920421.png',
  point: upstream + 'ea38d12f9c9090deda3b27657427578f_8679499811700261961.png',
  pointActive: upstream + '4c9abe79d083bedcf9d8218d5482003c_5582781450020130201.png',
};
const jobs = [
  ...[23, 24, 25, 26].map((year) => ({ id: String(2000 + year), source: `asserts/生日贺图/${year}.png`, widths: [768, 1280], quality: .9 })),
  { id: 'book', source: 'asserts/3.0/_other_resources/book_bg.93a06b3e.png', widths: [1103], quality: 1 },
  ...Object.entries({ arrow: 'arrow', arrowHover: 'arrow-hover', point: 'point', pointActive: 'point-active' }).map(([id, name]) => ({ id, source: `asserts/reference-supplements/birthday-mail/${name}.png`, widths: [118], quality: 1, url: supplementUrls[id] })),
];
const manifest = { version: 1, reference: 'https://webstatic.mihoyo.com/ys/event/e20220814prev/index.html', inputs: [], files: [], sourceBytes: 0, publishedBytes: 0 };
const runtime = { art: {}, book: '', arrow: '', arrowHover: '', point: '', pointActive: '' };
mkdirSync('public/asserts/birthday-mail', { recursive: true });
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? (process.platform === 'win32' ? 'chrome' : undefined), headless: true });
try {
  const page = await browser.newPage();
  for (const job of jobs) {
    const bytes = readFileSync(job.source);
    if (!bytes.length) {
      if (job.id !== '2026') throw new Error(`Unexpected empty image: ${job.source}`);
      manifest.inputs.push({ file: job.source, bytes: 0, sha256: hash(bytes), placeholder: true });
      runtime.art[job.id] = null;
      continue;
    }
    const result = await page.evaluate(async ({ encoded, job }) => {
      const image = await createImageBitmap(await (await fetch(`data:image/png;base64,${encoded}`)).blob());
      const original = { width: image.width, height: image.height };
      const files = job.widths.map((target) => {
        const scale = Math.min(1, target / image.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
        const context = canvas.getContext('2d'); context.imageSmoothingQuality = 'high';
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const file = { width: canvas.width, height: canvas.height, data: canvas.toDataURL('image/webp', job.quality).split(',')[1] };
        canvas.width = 0; canvas.height = 0;
        return file;
      });
      image.close();
      return { original, files };
    }, { encoded: bytes.toString('base64'), job });
    manifest.inputs.push({ file: job.source, bytes: bytes.length, sha256: hash(bytes), ...result.original, ...(job.url ? { url: job.url } : {}) });
    manifest.sourceBytes += bytes.length;
    const outputs = result.files.map((file) => {
      const payload = Buffer.from(file.data, 'base64'); const digest = hash(payload);
      const filename = `${job.id}-${file.width}-${digest.slice(0, 12)}.webp`;
      const target = `public/asserts/birthday-mail/${filename}`;
      writeFileSync(target, payload);
      const src = '/' + path.relative('public', target).replaceAll('\\', '/');
      manifest.files.push({ file: target, src, bytes: statSync(target).size, sha256: digest, width: file.width, height: file.height, source: job.source });
      manifest.publishedBytes += payload.length;
      return src;
    });
    if (job.id.startsWith('20')) runtime.art[job.id] = { compact: outputs[0], full: outputs[1] };
    else runtime[job.id] = outputs[0];
    console.log(`${job.id}: ${bytes.length} -> ${manifest.files.filter((file) => file.source === job.source).reduce((sum, file) => sum + file.bytes, 0)} B`);
  }
} finally { await browser.close(); }
writeFileSync('src/data/birthdayMailAssets.generated.json', JSON.stringify(runtime, null, 2) + '\n');
writeFileSync('docs/birthday-mail-assets.manifest.json', JSON.stringify(manifest, null, 2) + '\n');
console.log(`Birthday art: ${manifest.sourceBytes} -> ${manifest.publishedBytes} B`);
