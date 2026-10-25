import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const prompts = JSON.parse(readFileSync(path.join(root, 'docs/tree-art-prompts.json')));
const generated = JSON.parse(readFileSync(path.join(root, 'docs/tree-art-generation.json')));
const completions = JSON.parse(readFileSync(path.join(root, 'docs/tree-completion-generation.json')));
const jobs = [...prompts.jobs.map((job) => ({ ...job, raw: generated.outputs.find((output) => output.name === job.name).raw })), ...completions.jobs.map((job) => ({ name: job.asset ?? `${job.name}_complete`, source: job.reference ?? `asserts/world-tree-redraw/${job.name}.png`, raw: job.output.raw, registrationScale: job.registrationScale ?? 1, complete: true }))];
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const manifest = { version: 2, generator: 'built-in image_gen', prompts: 'docs/tree-art-prompts.json', completionPrompts: 'docs/tree-completion-generation.json', alphaThreshold: 128, inputs: [], files: [], publishedBytes: 0 };
const runtime = {};
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? (process.platform === 'win32' ? 'chrome' : undefined), headless: true });
try {
  const page = await browser.newPage();
  for (const job of jobs) {
    const raw = job.raw;
    const input = readFileSync(path.join(root, raw));
    const source = readFileSync(path.join(root, job.source));
    const result = await page.evaluate(async ({ encoded, name, reference, registrationScale }) => {
      const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${encoded}`)).blob());
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d', { willReadFrequently: true });
      const encode = (limit) => {
        const scale = Math.min(1, limit / Math.max(bitmap.width, bitmap.height));
        canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
        context.imageSmoothingQuality = 'high'; context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        return { width: canvas.width, height: canvas.height, data: canvas.toDataURL('image/webp', .8).split(',')[1] };
      };
      const body = /^tree(?:01|[1-9])(?:_complete|_growth)?$/.test(name) || name === 'trunk_column';
      const overlay = name.startsWith('tree_overlay');
      const bunch = name.startsWith('leafbunch');
      const full = encode(body ? 1056 : overlay ? 640 : bunch ? 420 : name === 'tree_grass' ? 900 : 220);
      const compact = encode(body ? 768 : overlay ? 480 : bunch ? 320 : name === 'tree_grass' ? 640 : 180);
      const scale = Math.min(1, 256 / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const width = canvas.width; const height = canvas.height;
      const solid = (horizontal, vertical) => horizontal >= 0 && horizontal < width && vertical >= 0 && vertical < height && pixels[(vertical * width + horizontal) * 4 + 3] >= 128;
      let transparent = 0; let painted = 0;
      const edges = new Map();
      const edge = (startX, startY, endX, endY) => {
        const key = startY * (width + 1) + startX;
        const values = edges.get(key) ?? []; values.push(endY * (width + 1) + endX); edges.set(key, values);
      };
      for (let vertical = 0; vertical < height; vertical++) for (let horizontal = 0; horizontal < width; horizontal++) {
        if (pixels[(vertical * width + horizontal) * 4 + 3] === 0) transparent++;
        if (!solid(horizontal, vertical)) continue;
        painted++;
        if (!solid(horizontal, vertical - 1)) edge(horizontal, vertical, horizontal + 1, vertical);
        if (!solid(horizontal + 1, vertical)) edge(horizontal + 1, vertical, horizontal + 1, vertical + 1);
        if (!solid(horizontal, vertical + 1)) edge(horizontal + 1, vertical + 1, horizontal, vertical + 1);
        if (!solid(horizontal - 1, vertical)) edge(horizontal, vertical + 1, horizontal, vertical);
      }
      const paths = [];
      const loops = [];
      while (edges.size) {
        const start = edges.keys().next().value; let current = start;
        const points = []; let remaining = (width + 1) * (height + 1) * 4;
        do {
          points.push([current % (width + 1), Math.floor(current / (width + 1))]);
          const candidates = edges.get(current);
          if (!candidates?.length) break;
          const next = candidates.pop(); if (!candidates.length) edges.delete(current);
          current = next;
        } while (current !== start && --remaining > 0);
        if (current !== start || points.length < 4) continue;
        const area = points.reduce((sum, point, index) => { const next = points[(index + 1) % points.length]; return sum + point[0] * next[1] - next[0] * point[1]; }, 0) / 2;
        if (Math.abs(area) < 3) continue;
        const corners = points.filter((point, index) => {
          const previous = points[(index + points.length - 1) % points.length]; const next = points[(index + 1) % points.length];
          return (point[0] - previous[0]) * (next[1] - point[1]) !== (point[1] - previous[1]) * (next[0] - point[0]);
        }).map(([horizontal, vertical]) => [Math.round(horizontal / width * 1000), Math.round(vertical / height * 1000)]);
        paths.push(`M${corners.map((point) => point.join(' ')).join('L')}Z`); loops.push(corners);
      }
      const centerline = Array.from({ length: 65 }, (_, index) => {
        const vertical = Math.min(height - 1, Math.floor(index / 64 * height));
        const spans = []; let start = -1;
        for (let horizontal = 0; horizontal <= width; horizontal++) {
          if (solid(horizontal, vertical) && start < 0) start = horizontal;
          if (!solid(horizontal, vertical) && start >= 0) { spans.push([start, horizontal]); start = -1; }
        }
        const nearest = spans.sort((first, second) => (Math.abs((first[0] + first[1]) / 2 - width / 2) - (first[1] - first[0]) * .3) - (Math.abs((second[0] + second[1]) / 2 - width / 2) - (second[1] - second[0]) * .3))[0];
        return nearest ? Math.round((nearest[0] + nearest[1]) / 2 / width * 1000) : index ? null : 500;
      });
      for (let index = 0; index < centerline.length; index++) if (centerline[index] === null) centerline[index] = centerline[index - 1] ?? 500;
      const dimensions = { width: bitmap.width, height: bitmap.height };
      let registration = [1, 0, 0, 1, 0, 0];
      if (reference) {
        const original = await createImageBitmap(await (await fetch(`data:image/png;base64,${reference}`)).blob());
        const anchor = (image) => {
          canvas.width = image.width; canvas.height = image.height;
          context.drawImage(image, 0, 0);
          const alpha = context.getImageData(0, 0, canvas.width, canvas.height).data;
          const start = body ? Math.floor(image.height * .75) : 0;
          let left = image.width; let right = 0; let bottom = 0;
          for (let vertical = start; vertical < image.height; vertical++) for (let horizontal = 0; horizontal < image.width; horizontal++) if (alpha[(vertical * image.width + horizontal) * 4 + 3] >= 128) {
            left = Math.min(left, horizontal); right = Math.max(right, horizontal + 1); bottom = Math.max(bottom, vertical + 1);
          }
          return { center: (left + right) / 2, width: right - left, bottom };
        };
        const target = anchor(original); const completed = anchor(bitmap);
        if (target.width <= 0 || completed.width <= 0) throw new Error('Tree completion needs a painted registration anchor');
        const scale = target.width / completed.width * registrationScale;
        registration = [bitmap.width * scale / original.width, 0, 0, bitmap.height * scale / original.height, (target.center - completed.center * scale) / original.width * 1000, (target.bottom - completed.bottom * scale) / original.height * 1000];
        original.close();
      }
      bitmap.close(); canvas.width = 0; canvas.height = 0;
      return { ...dimensions, full, compact, outline: paths.join(''), centerline, registration, transparentFraction: transparent / (width * height), paintedFraction: painted / (width * height), loops: loops.length };
    }, { encoded: input.toString('base64'), name: job.name, reference: job.complete ? source.toString('base64') : null, registrationScale: job.registrationScale ?? 1 });
    if (result.transparentFraction < .04 || result.paintedFraction < .005 || !result.outline) throw new Error(`Tree art must contain genuine transparency and a usable silhouette: ${job.name}`);
    manifest.inputs.push({ name: job.name, source: job.source, sourceSha256: digest(source), generated: raw, generatedSha256: digest(input), generatedBytes: input.length, width: result.width, height: result.height, transparentFraction: result.transparentFraction, paintedFraction: result.paintedFraction, loops: result.loops, registration: result.registration });
    const variants = {};
    for (const quality of ['compact', 'full']) {
      const variant = result[quality]; const bytes = Buffer.from(variant.data, 'base64'); const hash = digest(bytes);
      const file = `public/asserts/tree/${job.name}-${quality}-${hash.slice(0, 12)}.webp`;
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); writeFileSync(path.join(root, file), bytes);
      variants[quality] = `/${file.replace('public/', '')}`;
      manifest.files.push({ name: job.name, quality, file, src: variants[quality], width: variant.width, height: variant.height, bytes: bytes.length, sha256: hash }); manifest.publishedBytes += bytes.length;
    }
    runtime[job.name] = { ...variants, aspect: result.width / result.height, outline: result.outline, centerline: result.centerline, registration: result.registration };
  }
} finally { await browser.close(); }
writeFileSync(path.join(root, 'src/data/treeAssets.generated.json'), JSON.stringify(runtime) + '\n');
writeFileSync(path.join(root, 'docs/tree-assets.manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ assets: Object.keys(runtime).length, files: manifest.files.length, bytes: manifest.publishedBytes }));
