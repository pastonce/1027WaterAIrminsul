import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const output = new URL('../docs/screenshots/', import.meta.url);
const budgetFile = new URL('background-budget.json', output);
const stages = [...(process.env.BACKGROUND_STAGES ?? 'ABCDEF')];
const previous = JSON.parse(readFileSync(budgetFile, 'utf8')).filter((entry) => !stages.includes(entry.stage));
const measurements = [];
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? (process.platform === 'win32' ? 'chrome' : undefined), headless: true });
try {
  for (const viewport of [{ width: 1600, height: 900 }, { width: 844, height: 390 }]) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
    await page.goto(process.env.BACKGROUND_PREVIEW_URL ?? 'http://127.0.0.1:5173');
    for (const stage of stages) {
      const result = await page.evaluate(async ({ stage, viewport }) => {
        const [{ getStageBackground }, { createBackgroundScene }, { backgroundQuality, BACKGROUND_RULES }] = await Promise.all([
          import('/src/data/backgrounds.ts'), import('/src/game/backgrounds/scene.ts'), import('/src/game/backgrounds/policy.ts'),
        ]);
        const asset = getStageBackground(stage); const quality = backgroundQuality(viewport.width, viewport.height, 1);
        const canvas = document.createElement('canvas'); canvas.width = viewport.width; canvas.height = viewport.height;
        const graphics = canvas.getContext('webgl', { alpha: false, antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: true });
        if (!graphics) throw new Error('WebGL unavailable for background audit');
        const scene = await createBackgroundScene(canvas, graphics, asset, quality, new AbortController().signal);
        try {
          scene.draw(0, viewport.width, viewport.height);
          const visible = document.createElement('canvas'); visible.width = viewport.width; visible.height = viewport.height;
          const width = canvas.width / BACKGROUND_RULES.overscan; const height = canvas.height / BACKGROUND_RULES.overscan;
          visible.getContext('2d').drawImage(canvas, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height, 0, 0, visible.width, visible.height);
          const error = graphics.getError(); if (error) throw new Error(`background-gl-${error}`);
          return { image: visible.toDataURL('image/png').split(',')[1], budget: { stage, viewport, layers: scene.layers, planes: (asset.planes ?? []).filter((plane) => !quality.compact || !plane.optional).length, textureBytes: scene.textureBytes } };
        } finally { scene.dispose(); graphics.getExtension('WEBGL_lose_context')?.loseContext(); }
      }, { stage, viewport });
      const size = viewport.width === 1600 ? 'reference-size' : 'mobile-landscape';
      writeFileSync(new URL(`background-${stage}-clean-${size}.png`, output), Buffer.from(result.image, 'base64'));
      measurements.push(result.budget); console.log(JSON.stringify(result.budget));
    }
    await page.close();
  }
} finally { await browser.close(); }
writeFileSync(budgetFile, JSON.stringify([...previous, ...measurements], null, 2) + '\n');
