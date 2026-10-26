import { chromium } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';

const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? (process.platform === 'win32' ? 'chrome' : undefined), headless: true });
const outputs = [];
const audit = {};
try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:5173');
  for (const stage of ['A', 'C', 'D', 'E', 'F']) {
    const result = await page.evaluate(async (stage) => {
      const [{ getStageBackground }, { createBackgroundScene }, { backgroundQuality }] = await Promise.all([import('/src/data/backgrounds.ts'), import('/src/game/backgrounds/scene.ts'), import('/src/game/backgrounds/policy.ts')]);
      const asset = getStageBackground(stage);
      const width = 2000; const height = Math.round(width * asset.view.height / asset.view.width);
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const graphics = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: false });
      const scene = await createBackgroundScene(canvas, graphics, asset, backgroundQuality(width, height, 1), new AbortController().signal);
      const image = document.createElement('canvas'); image.width = width; image.height = height;
      const context = image.getContext('2d');
      const capture = (quality = 0.9) => { context.clearRect(0, 0, width, height); context.drawImage(canvas, 0, 0); return image.toDataURL('image/webp', quality).split(',')[1]; };
      try {
        scene.draw(0, width, height); const poster = capture(0.84);
        scene.draw(0, width, height, Infinity, false, true); const back = capture();
        scene.draw(0, width, height, Infinity, true); const foreground = capture();
        const bands = [];
        for (let band = 0; band <= asset.hiding.cuts.length; band++) { scene.draw(0, width, height, Infinity, false, false, band); bands.push({ band, data: capture() }); }
        const lights = [];
        for (const band of asset.hiding.lightBands ?? []) { scene.draw(0, width, height, Infinity, false, false, band, true); lights.push({ band, data: capture() }); }
        const occluders = [];
        for (const [index, cut] of asset.hiding.cuts.entries()) {
          context.clearRect(0, 0, width, height);
          for (const band of bands.slice(index + 1)) { const layer = new Image(); layer.src = `data:image/webp;base64,${band.data}`; await layer.decode(); context.drawImage(layer, 0, 0); }
          occluders.push({ id: cut.id, data: image.toDataURL('image/webp', 0.9).split(',')[1] });
        }
        const alpha = new Image(); alpha.src = `data:image/webp;base64,${foreground}`; await alpha.decode(); context.clearRect(0, 0, width, height); context.drawImage(alpha, 0, 0);
        const pixels = context.getImageData(0, 0, width, height).data;
        const contours = {};
        for (const horizontal of [-860, -800, -740, -680, -620, -560, 560, 620, 680, 740, 800, 860]) {
          const column = Math.round(width / 2 + horizontal * width / asset.view.width / 1.12);
          const edges = []; let previous = false;
          for (let row = 160; row < height - 15; row++) {
            const opaque = pixels[(row * width + column) * 4 + 3] > 220;
            if (opaque && !previous) edges.push(Math.round((height / 2 - row) * asset.view.width / width * 1.12));
            previous = opaque;
          }
          contours[horizontal] = edges;
        }
        return { id: asset.id, poster, back, foreground, bands, lights, occluders, contours, error: graphics.getError() };
      } finally { scene.dispose(); graphics.getExtension('WEBGL_lose_context')?.loseContext(); }
    }, stage);
    if (result.error) throw new Error(`WebGL ${stage}: ${result.error}`);
    outputs.push({ path: `asserts/calibration/backgrounds/${result.id}/hiding-foreground.webp`, data: result.foreground });
    outputs.push({ path: `asserts/calibration/backgrounds/${result.id}/hiding-back.webp`, data: result.back });
    outputs.push({ path: `public/asserts/backgrounds/${result.id}/poster.webp`, data: result.poster });
    for (const band of result.bands) outputs.push({ path: `public/asserts/backgrounds/${result.id}/hiding-band-${band.band}.webp`, data: band.data });
    for (const light of result.lights) outputs.push({ path: `public/asserts/backgrounds/${result.id}/hiding-light-${light.band}.webp`, data: light.data });
    for (const occluder of result.occluders) outputs.push({ path: `asserts/calibration/backgrounds/${result.id}/hiding-after-${occluder.id}.webp`, data: occluder.data });
    audit[stage] = result.contours;
    console.log(stage, JSON.stringify(result.contours));
  }
} finally { await browser.close(); }
const files = outputs.map((output) => {
  const bytes = Buffer.from(output.data, 'base64'); mkdirSync(dirname(output.path), { recursive: true }); writeFileSync(output.path, bytes); console.log(output.path);
  return { file: output.path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
});
mkdirSync('docs/inhabitants', { recursive: true });
writeFileSync('docs/inhabitants/hiding-layers.json', JSON.stringify({ source: 'src/data/backgrounds.ts · hiding.cuts', files }, null, 2) + '\n');
mkdirSync('.asset-work', { recursive: true });
writeFileSync('.asset-work/hiding-contours.json', JSON.stringify(audit, null, 2));
