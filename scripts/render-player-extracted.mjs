import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import ts from 'typescript';
import { json, projectRoot } from './player-spine-utils.mjs';
import { extractedRootName } from './player-extract-config.mjs';
import { startAssetServer } from './player-validation-server.mjs';

const manifest = json(path.join(projectRoot, extractedRootName, 'manifest.json'));
const screenshots = path.join(projectRoot, 'docs/screenshots/player-extracted');
fs.mkdirSync(screenshots, { recursive: true });
const server = await startAssetServer();
let browser;
try {
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? (process.platform === 'win32' ? 'chrome' : undefined), headless: true });
  const report = { browser: await browser.version(), geometryPixelCases: [], standaloneCases: [], typeScriptHelper: null };
  const page = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 });
  for (const asset of manifest.assets) {
    await page.goto(`${server.url}/scripts/player-extracted-validation.html?asset=${encodeURIComponent(asset.id)}`);
    await page.waitForFunction(() => window.extractionValidation?.ready || window.extractionValidation?.error, null, { timeout: 60000 });
    assert.equal(await page.evaluate(() => window.extractionValidation.error), undefined);
    const result = await page.evaluate(() => window.extractionValidation.result);
    console.log(asset.id, 'pixel mean', Math.max(...result.comparisons.map((item) => item.mean)).toFixed(5), 'motion', result.motion.changed);
    assert.equal(result.glError, 0); assert.equal(result.contextLost, false);
    for (const comparison of result.comparisons) assert.ok(comparison.mean < 0.15, `${asset.id}: repacked texture changed rendering: ${JSON.stringify(comparison)}`);
    assert.ok(result.motion.changed > 50, `${asset.id}: no visible motion`);
    const snapshot = await page.evaluate(() => window.extractionValidation.snapshot());
    fs.writeFileSync(path.join(screenshots, asset.id.replace('/', '-') + '.png'), Buffer.from(snapshot.split(',')[1], 'base64'));
    report.geometryPixelCases.push(result);
  }
  await page.close();
  for (const viewport of [{ width: 1280, height: 800, name: 'desktop' }, { width: 844, height: 390, name: 'mobile-landscape' }]) {
    const demo = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1, isMobile: viewport.name !== 'desktop', hasTouch: viewport.name !== 'desktop' });
    const requests = [], errors = [];
    demo.on('request', (request) => requests.push(new URL(request.url()).pathname));
    demo.on('pageerror', (error) => errors.push(error.message));
    await demo.goto(`${server.url}/${extractedRootName}/web/`);
    for (const asset of manifest.assets) {
      await demo.waitForFunction(() => window.extractedPreview?.ready || window.extractedPreview?.error, null, { timeout: 60000 });
      assert.equal(await demo.evaluate(() => window.extractedPreview.error), undefined);
      if (asset.id !== manifest.assets[0].id) await demo.selectOption('#character', asset.id);
      await demo.waitForFunction((id) => window.extractedPreview?.ready && window.extractedPreview.id === id, asset.id, { timeout: 60000 });
      const metadata = await demo.evaluate(() => { const player = window.extractedPreview.player; return { version: player.skeleton.data.version, slots: player.skeleton.slots.length, glError: player.context.gl.getError(), contextLost: player.context.gl.isContextLost(), canvas: [player.canvas.width, player.canvas.height] }; });
      assert.equal(metadata.version, '4.0.17'); assert.equal(metadata.slots, asset.slots); assert.equal(metadata.glError, 0); assert.equal(metadata.contextLost, false);
      await demo.click('#pause'); assert.equal(await demo.evaluate(() => window.extractedPreview.player.paused), true);
      await demo.click('#pause'); assert.equal(await demo.evaluate(() => window.extractedPreview.player.paused), false);
      report.standaloneCases.push({ id: asset.id, viewport, ...metadata });
    }
    assert.deepEqual(errors, []);
    assert.ok(requests.every((url) => url.startsWith('/asserts/player-extracted/') || url === '/favicon.ico'), 'The portable demo requested files outside the extracted folder.');
    await demo.screenshot({ path: path.join(screenshots, 'demo-' + viewport.name + '.png') });
    if (viewport.name === 'desktop') {
      const helperFile = path.join(projectRoot, extractedRootName, 'web/mountSpineCharacter.ts');
      const helper = ts.transpileModule(fs.readFileSync(helperFile, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
        .replace(/import \{ SpinePlayer \} from ['"]@esotericsoftware\/spine-player['"];?/, 'const { SpinePlayer } = window.spine;')
        .replace(/import ['"]@esotericsoftware\/spine-player\/dist\/spine-player.css['"];?/, '');
      const helperResult = await demo.evaluate(async (encoded) => {
        window.extractedPreview.player.dispose();
        const module = await import('data:text/javascript;base64,' + encoded);
        const host = document.createElement('div'); host.style.cssText = 'width:300px;height:420px'; document.body.append(host);
        const player = await module.mountSpineCharacter(host, '../image_2/nahida_swing/nahida_swing');
        const result = { loaded: true, version: player.skeleton.data.version, glError: player.context.gl.getError(), abortedLoadRejected: false };
        player.pause(); player.play(); player.dispose();
        const controller = new AbortController(); controller.abort();
        try { await module.mountSpineCharacter(host, '../image_2/nahida_swing/nahida_swing', { signal: controller.signal }); }
        catch (error) { result.abortedLoadRejected = error.name === 'AbortError'; }
        host.remove(); return result;
      }, Buffer.from(helper).toString('base64'));
      assert.deepEqual(helperResult, { loaded: true, version: '4.0.17', glError: 0, abortedLoadRejected: true });
      report.typeScriptHelper = helperResult;
    }
    await demo.close();
  }
  const overview = await browser.newPage({ viewport: { width: 1400, height: 780 }, deviceScaleFactor: 1 });
  await overview.setContent(`<meta charset="utf-8"><style>*{box-sizing:border-box}html,body{margin:0;background:#e4ece5;color:#253c2c;font-family:Arial,sans-serif}body{padding:20px;display:grid;grid-template-columns:repeat(6,1fr);gap:10px;align-content:start}.card{height:233px;background:#f8faf5;border-radius:8px;display:grid;grid-template-rows:1fr auto;overflow:hidden}.card img{width:100%;height:205px;object-fit:contain}.card p{margin:0;padding:3px 4px;text-align:center;font-size:12px}</style>${manifest.assets.map((asset) => `<div class="card"><img src="${server.url}/docs/screenshots/player-extracted/${asset.id.replace('/', '-')}.png"><p>${asset.id}</p></div>`).join('')}`);
  await overview.locator('img').evaluateAll((images) => Promise.all(images.map((image) => image.decode())));
  await overview.screenshot({ path: path.join(screenshots, 'overview.png'), fullPage: true });
  await overview.close();
  fs.writeFileSync(path.join(projectRoot, 'docs/player-extracted/browser-validation.json'), JSON.stringify(report, null, 2) + '\n');
  console.log('17 pixel comparisons and 34 standalone desktop/mobile cases passed.');
} finally { await browser?.close(); await server.close(); }
