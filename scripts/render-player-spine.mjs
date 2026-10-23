import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { json, projectRoot, reportRoot } from './player-spine-utils.mjs';
import { startAssetServer } from './player-validation-server.mjs';

const manifest = json(path.join(reportRoot, 'manifest.json'));
const server = await startAssetServer();
const base = server.url;
const output = path.join(projectRoot, 'docs/screenshots/player-spine');
fs.mkdirSync(output, { recursive: true });
let browser;
try {
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? (process.platform === 'win32' ? 'chrome' : undefined), headless: true });
  const report = { browser: await browser.version(), frames: [] };
  for (const viewport of [{ name: 'desktop', width: 1920, height: 1080 }, { name: 'mobile-landscape', width: 844, height: 390 }]) {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1, isMobile: viewport.name !== 'desktop', hasTouch: viewport.name !== 'desktop' });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    for (const definition of manifest.pages) {
      await page.goto(`${base}/scripts/player-spine-preview.html?image=${definition.name}`);
      await page.waitForFunction(() => window.playerSpine?.ready || window.playerSpine?.error, null, { timeout: 60000 });
      assert.equal(await page.evaluate(() => window.playerSpine.error), undefined);
      const check = await page.evaluate(() => window.playerSpine.check());
      assert.equal(check.glError, 0);
      assert.equal(check.contextLost, false);
      assert.ok(check.motion.changedPixels > check.motion.pixelCount * 0.002, 'The scene must actually animate.');
      for (const comparison of check.comparisons) {
        assert.ok(comparison.meanAbsoluteChannelError < 0.2, `${definition.name}: WebGL composition changed: ${JSON.stringify(comparison)}`);
        assert.ok(comparison.changedPixels < comparison.pixelCount * 0.005, `${definition.name}: too many changed pixels`);
      }
      const screenshot = path.join(output, `${definition.name}-${viewport.name}.png`);
      await page.screenshot({ path: screenshot });
      const result = { name: definition.name, viewport, screenshot: path.relative(projectRoot, screenshot).replaceAll(path.sep, '/'), ...check };
      report.frames.push(result);
      console.log(`${definition.name} ${viewport.name}: reference ${check.bestReference.meanAbsoluteChannelError.toFixed(3)} at ${check.bestReference.time.toFixed(3)}s, motion ${check.motion.changedPixels} pixels; deleted source not requested`);
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
  const overview = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await overview.setContent(`<style>html,body{margin:0}body{display:grid;grid-template-columns:1fr 1fr}img{display:block;width:960px;height:540px}</style>${manifest.pages.map((page) => `<img src="${base}/docs/screenshots/player-spine/${page.name}-desktop.png">`).join('')}`);
  await overview.locator('img').evaluateAll((images) => Promise.all(images.map((image) => image.decode())));
  await overview.screenshot({ path: path.join(output, 'overview.png') });
  await overview.close();
  fs.writeFileSync(path.join(reportRoot, 'browser-validation.json'), `${JSON.stringify(report, null, 2)}\n`);
} finally {
  await browser?.close();
  await server.close();
}
