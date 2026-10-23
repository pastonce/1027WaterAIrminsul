import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { getStageBackground } from '../src/data/backgrounds.ts';

const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? (process.platform === 'win32' ? 'chrome' : undefined), headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 2000, height: 864 }, deviceScaleFactor: 1 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(process.env.BACKGROUND_PREVIEW_URL ?? 'http://127.0.0.1:5173');
  for (const stage of (process.env.BACKGROUND_STAGES ?? 'ABCDEF')) {
    const asset = getStageBackground(stage);
    const result = await page.evaluate(async (stage) => {
      const [{ getStageBackground }, { createBackgroundScene }, { backgroundQuality }] = await Promise.all([
        import('/src/data/backgrounds.ts'), import('/src/game/backgrounds/scene.ts'), import('/src/game/backgrounds/policy.ts'),
      ]);
      const asset = getStageBackground(stage);
      const width = 2000; const height = Math.round(width * asset.view.height / asset.view.width);
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const graphics = canvas.getContext('webgl', { alpha: false, antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: true });
      if (!graphics) throw new Error('WebGL unavailable for poster generation');
      const scene = await createBackgroundScene(canvas, graphics, asset, backgroundQuality(width, height, 1), new AbortController().signal);
      try {
        scene.draw(0, width, height);
        const image = document.createElement('canvas'); image.width = width; image.height = height;
        image.getContext('2d').drawImage(canvas, 0, 0, image.width, image.height);
        return image.toDataURL('image/webp', 0.84).split(',')[1];
      } finally { scene.dispose(); graphics.getExtension('WEBGL_lose_context')?.loseContext(); }
    }, stage);
    const output = new URL(`../public/asserts/backgrounds/${asset.id}/poster.webp`, import.meta.url);
    mkdirSync(new URL('./', output), { recursive: true });
    const buffer = Buffer.from(result, 'base64'); writeFileSync(output, buffer);
    console.log(`${asset.id}: ${buffer.length} bytes, 2000x${Math.round(2000 * asset.view.height / asset.view.width)}`);
  }
} finally { await browser.close(); }
