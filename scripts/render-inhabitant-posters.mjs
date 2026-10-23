import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import assets from '../src/data/inhabitants.generated.json' with { type: 'json' };

const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? (process.platform === 'win32' ? 'chrome' : undefined), headless: true });
const outputs = [];
try {
  const page = await browser.newPage(); await page.goto(process.env.BACKGROUND_PREVIEW_URL ?? 'http://127.0.0.1:5173');
  for (const asset of Object.values(assets)) {
    const image = await page.evaluate(async (asset) => {
      const module = '/src/game/encounters/CreatureRenderer.ts'; const { createCreatureRenderer } = await import(module);
      const height = 640; const width = Math.round(height * asset.bounds.width / asset.bounds.height);
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const original = canvas.getContext.bind(canvas);
      canvas.getContext = (kind, options) => original(kind, kind === 'webgl' ? { ...options, preserveDrawingBuffer: true } : options);
      let resolve; let reject; const loaded = new Promise((yes, no) => { resolve = yes; reject = no; });
      const renderer = await createCreatureRenderer(canvas, (_, status, error) => { if (status === 'ready') resolve(); if (status === 'fallback') reject(new Error(`poster-asset: ${String(error)}`)); }, 2048);
      try {
        renderer.setViewport(width, height, false, 2048); renderer.setPaused(true, true);
        renderer.setActors([{ id: 'poster', asset: asset.id, kind: 'poster', left: 0, top: 0, width, height }]);
        await loaded; renderer.draw(0);
        const image = document.createElement('canvas'); image.width = width; image.height = height;
        image.getContext('2d').drawImage(canvas, 0, 0);
        return image.toDataURL('image/webp', 0.86).split(',')[1];
      } finally { renderer.dispose(); }
    }, asset);
    const buffer = Buffer.from(image, 'base64'); outputs.push({ asset, buffer });
    console.log(`${asset.id}: ${buffer.length} bytes`);
  }
} finally { await browser.close(); }
for (const { asset, buffer } of outputs) writeFileSync(new URL(`../public${asset.poster}`, import.meta.url), buffer);
