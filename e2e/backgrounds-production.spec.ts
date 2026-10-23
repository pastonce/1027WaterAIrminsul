import { expect, test } from '@playwright/test';
import { finishOpening } from './opening-support';
import { stageFixture } from '../src/dev/fixtures';
import { BACKGROUND_ASSETS } from '../src/data/backgrounds';
import { mockServerTime, seedPlayer } from './time-support';

test('生产包实际播放森林入场、沙海和流雾，保留单画布与无全屏遮暗', async ({ page }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.clock.install();
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, options?: WebGLContextAttributes) {
      return Reflect.apply(original, this, [kind, kind.startsWith('webgl') ? { ...options, preserveDrawingBuffer: true } : options]);
    } as typeof original;
  });
  const server = await mockServerTime(page, '2026-10-27T10:27:00+08:00');
  await seedPlayer(page, stageFixture('A', server.now)); await page.goto('/'); await finishOpening(page);
  const signature = () => page.locator('.background-canvas').evaluate((element) => {
    const canvas = element as HTMLCanvasElement; const graphics = canvas.getContext('webgl')!;
    const data = new Uint8Array(canvas.width * canvas.height * 4);
    graphics.readPixels(0, 0, canvas.width, canvas.height, graphics.RGBA, graphics.UNSIGNED_BYTE, data);
    let hash = 2166136261;
    for (let index = 0; index < data.length; index += 1004) hash = Math.imul(hash ^ data[index], 16777619);
    return hash;
  });
  for (const [stage, id] of [['A', 'forest'], ['B', 'dunes'], ['D', 'sanctuary']] as const) {
    if (stage !== 'A') { await page.evaluate((save) => localStorage.setItem('irminsul.player.v2', JSON.stringify(save)), stageFixture(stage, server.now)); await page.reload(); await finishOpening(page); }
    await expect(page.locator('.background-scenery')).toHaveAttribute('data-renderer', 'ready', { timeout: 20000 });
    await expect(page.locator('.background-poster')).toHaveAttribute('src', BACKGROUND_ASSETS[id].poster!);
    const initial = await signature(); await page.clock.runFor(stage === 'A' ? 3600 : 600);
    expect(await signature(), stage).not.toBe(initial);
    await expect(page.locator('.background-canvas')).toHaveCount(1);
    await expect(page.locator('.background-canvas')).toHaveCSS('filter', 'none');
    await expect(page.locator('.sky-wash, .vignette, .scene-grain, .debug-panel, .story-overlay')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '浇灌梦中的树', exact: true })).toBeEnabled();
    await page.screenshot({ path: `docs/screenshots/background-${stage}-${testInfo.project.name}.png`, animations: 'disabled' });
  }
  expect(errors).toEqual([]);
});

test('生产 C 背景使用匹配的 4.1 动画，角色仍用 4.0，窄屏无溢出', async ({ page }, testInfo) => {
  const server = await mockServerTime(page, '2026-10-25T10:27:00+08:00');
  const save = stageFixture('C', server.now); save.pendingVisits = ['visit-C'];
  await seedPlayer(page, save); await page.goto('/'); await finishOpening(page);
  await expect(page.locator('.background-scenery')).toHaveAttribute('data-renderer', 'ready', { timeout: 20000 });
  await expect(page.locator('.background-poster')).toHaveAttribute('src', BACKGROUND_ASSETS.canopy.poster!);
  await expect(page.locator('.nahida-avatar[data-character=nahida_wave]')).toHaveAttribute('data-renderer', 'ready', { timeout: 20000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.locator('.debug-panel, .growth-meter, .story-overlay')).toHaveCount(0);
  await page.screenshot({ path: `docs/screenshots/background-production-${testInfo.project.name}.png`, animations: 'disabled' });
});

for (const stage of ['E', 'F'] as const) {
  test(`生产 ${stage} 使用正式背景并保留独立角色、单画布与交互`, async ({ page }, testInfo) => {
    const resources: string[] = []; const errors: string[] = [];
    page.on('request', (request) => { if (request.url().includes('/backgrounds/')) resources.push(request.url()); });
    page.on('pageerror', (error) => errors.push(error.message));
    const server = await mockServerTime(page, stage === 'E' ? '2026-10-26T10:27:00+08:00' : '2026-10-27T10:27:00+08:00');
    const save = stageFixture(stage, server.now); save.pendingVisits = [`visit-${stage}`];
    await seedPlayer(page, save);
    await page.goto('/');
    await finishOpening(page);
    await expect(page.locator(stage === 'E' ? '.theme-embers' : '.theme-festival')).toBeVisible();
    await expect(page.locator('.background-scenery')).toHaveAttribute('data-renderer', 'ready', { timeout: 20000 });
    await expect(page.locator('.landscape-image, .ember-haze, .sky-wash, .vignette, .story-overlay, .debug-panel')).toHaveCount(0);
    await expect(page.locator('.background-poster')).toHaveAttribute('src', BACKGROUND_ASSETS[stage === 'E' ? 'embers' : 'festival'].poster!);
    await expect(page.locator('.background-canvas')).toHaveCount(1);
    await expect(page.locator('.background-canvas')).toHaveCSS('filter', 'none');
    await expect(page.locator(`.nahida-avatar[data-character=${stage === 'F' ? 'nahida_swing' : 'dream'}]`)).toHaveAttribute('data-renderer', 'ready', { timeout: 20000 });
    if (stage === 'F') expect(resources.some((url) => /image_2_15|\/player\//.test(url))).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByRole('button', { name: '浇灌梦中的树', exact: true })).toBeEnabled();
    await page.screenshot({ path: `docs/screenshots/background-${stage}-${testInfo.project.name}.png`, animations: 'disabled' });
    expect(errors).toEqual([]);
  });
}
