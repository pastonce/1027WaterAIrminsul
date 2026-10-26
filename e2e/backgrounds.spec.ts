import { openSettings } from './settings-support';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { BACKGROUND_ASSETS } from '../src/data/backgrounds';
import { finishOpening } from './opening-support';
import type { StageId, GameSave } from '../src/types/game';

async function selectStage(page: Page, stage: StageId) {
  await page.locator('.debug-panel > summary').click();
  await page.getByLabel(`调试切换到${stage}阶段`, { exact: true }).click();
  await page.locator('.debug-panel > summary').click();
}

async function enter(page: Page) {
  await page.clock.install(); await page.goto('/');
  await finishOpening(page, true);
  await page.getByRole('button', { name: '沉入梦乡' }).click();
}

async function pixels(page: Page) {
  return page.locator('.background-canvas').evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const graphics = canvas.getContext('webgl')!;
    const data = new Uint8Array(canvas.width * canvas.height * 4);
    graphics.readPixels(0, 0, canvas.width, canvas.height, graphics.RGBA, graphics.UNSIGNED_BYTE, data);
    let hash = 2166136261;
    const colors = new Set<string>();
    for (let index = 0; index < data.length; index += 1004) {
      hash = Math.imul(hash ^ data[index], 16777619);
      colors.add(`${data[index]},${data[index + 1]},${data[index + 2]}`);
    }
    return { hash, colors: colors.size };
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, options?: WebGLContextAttributes) {
      return Reflect.apply(original, this, [kind, kind.startsWith('webgl') ? { ...options, preserveDrawingBuffer: true } : options]);
    } as typeof original;
  });
});

test('六套背景按映射实际渲染，只有一个动态背景画布，横屏缩减纹理与层数', async ({ page }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await enter(page);
  const original = await page.locator('.background-canvas').elementHandle();
  for (const [stage, id] of [['A', 'forest'], ['B', 'dunes'], ['C', 'canopy'], ['D', 'sanctuary'], ['E', 'embers'], ['F', 'festival']] as const) {
    await selectStage(page, stage);
    const host = page.locator('.background-scenery');
    await expect(host).toHaveAttribute('data-renderer', 'ready', { timeout: 20000 });
    const compact = testInfo.project.name.includes('mobile');
    expect(Number(await host.getAttribute('data-layer-count'))).toBe(BACKGROUND_ASSETS[id].layers.filter((layer) => !compact || !layer.optional).length);
    expect(Number(await host.getAttribute('data-texture-bytes'))).toBeLessThan((compact ? 40 : 96) * 1024 * 1024);
    await expect(page.locator('.background-canvas')).toHaveCount(1);
    await expect(page.locator('.background-poster')).toHaveAttribute('src', BACKGROUND_ASSETS[id].poster!);
    expect(await original!.evaluate((element) => element.isConnected)).toBe(true);
    await page.clock.runFor(stage === 'A' ? 3600 : 100);
    await page.clock.fastForward(1200);
    await expect(page.locator('.sky-wash, .vignette, .scene-grain, .intro-shade')).toHaveCount(0);
    await expect(page.locator('.background-canvas')).toHaveCSS('filter', 'none');
    expect((await pixels(page)).colors).toBeGreaterThan(30);
    await page.screenshot({ path: `docs/screenshots/background-${stage}-${testInfo.project.name}.png`, animations: 'disabled' });
  }
  await expect(page.locator('.growth-meter, .time-gate, .story-overlay, .scene-copy')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('背景播放不遮挡浇灌、树体和梦露，镜头移动不重新请求素材', async ({ page }) => {
  const requests: string[] = []; page.on('request', (request) => { if (/\/backgrounds\/.*\.(json|atlas)$/.test(request.url())) requests.push(request.url()); });
  await enter(page); await selectStage(page, 'A');
  await expect(page.locator('.background-scenery')).toHaveAttribute('data-renderer', 'ready', { timeout: 20000 });
  const before = requests.length;
  await page.getByRole('button', { name: '浇灌梦中的树', exact: true }).click();
  await expect(page.getByTestId('dew-count')).toHaveText('0');
  expect(await page.evaluate(() => (JSON.parse(localStorage.getItem('irminsul.development.v2')!) as GameSave).growth)).toBe(13);
  await page.clock.fastForward(1600);
  await expect(page.locator('.dialogue-bubble[data-speaker=tree]')).toBeVisible();


  await page.clock.fastForward(2500);
  const particle = page.locator('.dew-particle:not(.is-collected):not(.is-expiring)').first(); await particle.click();
  await expect.poll(async () => Number(await page.getByTestId('dew-count').textContent())).toBeGreaterThan(0);
  expect(requests).toHaveLength(before);
});

test('六套动态背景持续变化，F 恢复原生循环', async ({ page }) => {
  await enter(page);
  for (const stage of ['A', 'B', 'C', 'D', 'E', 'F'] as const) {
    await selectStage(page, stage);
    await expect(page.locator('.background-scenery')).toHaveAttribute('data-renderer', 'ready', { timeout: 20000 });
    await page.clock.runFor(100);
    const initial = await pixels(page);
    await page.clock.runFor(1200);
    expect((await pixels(page)).hash, stage).not.toBe(initial.hash);
  }
});

test('入场和旧背景不再有全屏压暗层，仅保留文字局部阴影', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.intro-landscape')).toHaveCSS('opacity', '1');
  await expect(page.locator('.intro-landscape')).toHaveCSS('filter', 'none');
  await expect(page.locator('.intro-shade')).toHaveCount(0);
  await page.getByRole('button', { name: '沉入梦乡' }).click();
  for (const stage of ['E', 'F', 'G'] as const) {
    await selectStage(page, stage);
    await expect(page.locator('.sky-wash, .vignette, .scene-grain')).toHaveCount(0);
    const backdrop = page.locator(stage === 'G' ? '.landscape-image' : '.background-poster');
    await expect(backdrop).toHaveCSS('opacity', '1');
    await expect(backdrop).toHaveCSS('filter', 'none');
    await expect(backdrop).toHaveCSS('mix-blend-mode', 'normal');
    await expect(page.locator('.game-header')).toHaveCSS('filter', 'none');
  }
});

test('森林分层入场可暂停续播，不遮挡首次浇灌', async ({ page }, testInfo) => {
  await enter(page);
  await expect(page.locator('.background-scenery')).toHaveAttribute('data-renderer', 'ready', { timeout: 20000 });
  const beginning = await pixels(page);
  await page.screenshot({ path: `docs/screenshots/background-A-entrance-start-${testInfo.project.name}.png`, animations: 'disabled' });
  await page.getByRole('button', { name: '浇灌梦中的树', exact: true }).click();
  await expect(page.getByTestId('dew-count')).toHaveText('0');
  await page.clock.runFor(900);
  expect((await pixels(page)).hash).not.toBe(beginning.hash);
  await openSettings(page);
  const paused = await pixels(page); await page.clock.fastForward(3000);
  expect(await pixels(page)).toEqual(paused);
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.clock.runFor(2800);
  expect((await pixels(page)).hash).not.toBe(paused.hash);
  await page.screenshot({ path: `docs/screenshots/background-A-entrance-end-${testInfo.project.name}.png`, animations: 'disabled' });
  await expect(page.locator('.story-overlay, .dialogue-next')).toHaveCount(0);
});

test('入梦取景不跳变，慢加载时树苗在画面外，自动下移后固定在倒木前', async ({ page }, testInfo) => {
  const start = new Date('2026-10-22T02:27:00Z');
  await page.clock.install({ time: start }); await page.clock.pauseAt(new Date(start.getTime() + 10));
  await page.goto('/');
  await finishOpening(page, true);
  await expect.poll(() => page.locator('.background-base-plane').evaluate((image) => (image as HTMLImageElement).complete)).toBe(true);
  const opening = await page.locator('.background-base-plane').boundingBox();
  let release!: () => void; const waiting = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/forest/qianjin.json', async (route) => { await waiting; await route.continue(); });
  await page.getByRole('button', { name: '沉入梦乡' }).click();
  await expect(page.locator('.background-scenery')).toHaveAttribute('data-renderer', 'loading');
  expect(await page.locator('.background-base-plane').boundingBox()).toEqual(opening);
  const root = () => page.locator('.dream-tree').evaluate((element) => {
    const tree = element as SVGSVGElement; const point = tree.createSVGPoint(); point.x = 500; point.y = 3300;
    const screen = point.matrixTransform(tree.getScreenCTM()!); return { horizontal: screen.x, vertical: screen.y };
  });
  const initial = await root(); expect(initial.vertical).toBeGreaterThan(page.viewportSize()!.height + 100);
  await page.clock.runFor(2000); expect(await root()).toEqual(initial);
  release(); await expect(page.locator('.background-scenery')).toHaveAttribute('data-renderer', 'ready', { timeout: 20000 });
  expect(await page.locator('.background-base-plane').boundingBox()).toEqual(opening);
  const error = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('.background-canvas')!;
    const cover = document.querySelector<HTMLImageElement>('.background-base')!;
    const plane = document.querySelector<HTMLImageElement>('.background-base-plane')!;
    const expected = document.createElement('canvas'); expected.width = window.innerWidth; expected.height = window.innerHeight;
    const context = expected.getContext('2d')!; const coverRect = cover.getBoundingClientRect();
    const scale = Math.max(coverRect.width / cover.naturalWidth, coverRect.height / cover.naturalHeight);
    context.drawImage(cover, coverRect.left + (coverRect.width - cover.naturalWidth * scale) / 2, coverRect.top + (coverRect.height - cover.naturalHeight * scale) / 2, cover.naturalWidth * scale, cover.naturalHeight * scale);
    const planeRect = plane.getBoundingClientRect(); context.drawImage(plane, planeRect.x, planeRect.y, planeRect.width, planeRect.height);
    const actual = document.createElement('canvas'); actual.width = expected.width; actual.height = expected.height;
    const width = canvas.width / 1.12; const height = canvas.height / 1.12;
    actual.getContext('2d')!.drawImage(canvas, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height, 0, 0, actual.width, actual.height);
    const source = context.getImageData(0, 0, expected.width, expected.height).data;
    const target = actual.getContext('2d')!.getImageData(0, 0, actual.width, actual.height).data;
    let difference = 0; let count = 0;
    for (let index = 0; index < source.length; index += 64) for (let channel = 0; channel < 3; channel++) { difference += Math.abs(source[index + channel] - target[index + channel]); count++; }
    return difference / count;
  });
  expect(error).toBeLessThan(4);
  await page.clock.runFor(1500);
  const middle = await root(); expect(middle.vertical).toBeLessThan(initial.vertical);
  const remaining = Number(await page.getByTestId('dream-scene').getAttribute('data-ground-entrance'));
  await page.clock.runFor(2100); const settled = await root();
  expect(middle.vertical - remaining).toBeCloseTo(settled.vertical, 1);
  expect(settled.vertical).toBeLessThan(page.viewportSize()!.height - 30);
  expect(settled.horizontal).toBeCloseTo(page.viewportSize()!.width / 2, 1);
  await page.screenshot({ path: `docs/screenshots/dream-ground-anchor-${testInfo.project.name}.png`, animations: 'disabled' });
});

test('飞沙、红色流动、阳光和雾各自改变真实像素，重复重画不推进，程序与纹理完全释放', async ({ page }, testInfo) => {
  await page.goto('/');
  const result = await page.evaluate(async ({ width, height }) => {
    const dataModule = '/src/data/backgrounds.ts'; const sceneModule = '/src/game/backgrounds/scene.ts'; const policyModule = '/src/game/backgrounds/policy.ts';
    const [{ BACKGROUND_ASSETS }, { createBackgroundScene }, { backgroundQuality }] = await Promise.all([import(dataModule), import(sceneModule), import(policyModule)]);
    const results: Array<{ effect: string; difference: number; changed: number; frozen: boolean; programs: number; textures: number; error: number }> = [];
    const candidates = [
      ...BACKGROUND_ASSETS.dunes.planes.filter((plane: { effect: string; order: number }) => plane.effect === 'red-flow' || plane.effect === 'sunlight' || plane.effect === 'sand' && (plane.order === 9.5 || plane.order === 10.5)),
      BACKGROUND_ASSETS.sanctuary.planes.find((plane: { effect: string }) => plane.effect === 'mist'),
    ];
    for (const plane of candidates) {
      const canvas = document.createElement('canvas'); canvas.width = Math.min(960, width); canvas.height = Math.round(canvas.width * height / width);
      const graphics = canvas.getContext('webgl', { alpha: false, antialias: false, preserveDrawingBuffer: true })!;
      let programs = 0; let textures = 0;
      const createProgram = graphics.createProgram.bind(graphics); const deleteProgram = graphics.deleteProgram.bind(graphics);
      const createTexture = graphics.createTexture.bind(graphics); const deleteTexture = graphics.deleteTexture.bind(graphics);
      graphics.createProgram = () => { const program = createProgram(); if (program) programs++; return program; };
      graphics.deleteProgram = (program) => { if (program && graphics.isProgram(program)) programs--; deleteProgram(program); };
      graphics.createTexture = () => { const texture = createTexture(); if (texture) textures++; return texture; };
      graphics.deleteTexture = (texture) => { if (texture && graphics.isTexture(texture)) textures--; deleteTexture(texture); };
      const base = document.createElement('canvas'); base.width = 1; base.height = 1; base.getContext('2d')!.fillRect(0, 0, 1, 1);
      const asset = { ...BACKGROUND_ASSETS.dunes, base: { src: base.toDataURL(), source: '' }, baseBounds: undefined, layers: [], planes: [{ ...plane, horizontal: 0, vertical: 0 }], view: { horizontal: 0, vertical: 0, width: plane.width, height: plane.height } };
      const scene = await createBackgroundScene(canvas, graphics, asset, backgroundQuality(width, height, 1), new AbortController().signal);
      const capture = () => { const data = new Uint8Array(canvas.width * canvas.height * 4); graphics.readPixels(0, 0, canvas.width, canvas.height, graphics.RGBA, graphics.UNSIGNED_BYTE, data); return data; };
      try {
        scene.draw(0, width, height); const initial = capture();
        for (let frame = 0; frame < 60; frame++) scene.draw(0.05, width, height);
        const animated = capture(); let difference = 0; let changed = 0; let samples = 0;
        for (let index = 0; index < initial.length; index += 16) {
          for (let channel = 0; channel < 3; channel++) difference += Math.abs(initial[index + channel] - animated[index + channel]);
          if (initial[index] !== animated[index] || initial[index + 1] !== animated[index + 1] || initial[index + 2] !== animated[index + 2]) changed++;
          samples++;
        }
        scene.draw(0, width, height); const frozen = capture().every((value, index) => value === animated[index]);
        const error = graphics.getError(); scene.dispose();
        results.push({ effect: `${plane.effect}-${plane.order}`, difference: difference / samples / 3, changed: changed / samples, frozen, programs, textures, error });
      } finally { scene.dispose(); graphics.getExtension('WEBGL_lose_context')?.loseContext(); }
    }
    return results;
  }, page.viewportSize()!);
  await testInfo.attach('isolated-background-effects', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  for (const effect of result) {
    expect(effect.difference, effect.effect).toBeGreaterThan(0.02);
    expect(effect.changed, effect.effect).toBeGreaterThan(0.01);
    expect(effect.frozen, effect.effect).toBe(true);
    expect(effect.programs, effect.effect).toBe(0); expect(effect.textures, effect.effect).toBe(0); expect(effect.error, effect.effect).toBe(0);
  }
});

test('静态回退使用原站宽高比，与桌面或横屏动态取景一致', async ({ page }) => {
  await enter(page);
  for (const stage of ['A', 'B', 'C', 'D', 'E', 'F'] as const) {
    await selectStage(page, stage);
    await expect(page.locator('.background-scenery')).toHaveAttribute('data-renderer', 'ready', { timeout: 20000 });
    if (stage === 'A') {
      await page.clock.runFor(3600);
      await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    }
    await expect.poll(() => page.locator('.background-poster').evaluate((image) => (image as HTMLImageElement).complete)).toBe(true);
    const result = await page.locator('.background-scenery').evaluate((host) => {
      const source = host.querySelector<HTMLCanvasElement>('.background-canvas')!;
      const poster = host.querySelector<HTMLImageElement>('.background-poster')!;
      const live = document.createElement('canvas'); live.width = 400; live.height = Math.round(400 * source.height / source.width);
      const still = document.createElement('canvas'); still.width = live.width; still.height = live.height;
      live.getContext('2d')!.drawImage(source, 0, 0, live.width, live.height);
      const scale = Math.max(still.width / poster.naturalWidth, still.height / poster.naturalHeight);
      const width = poster.naturalWidth * scale; const height = poster.naturalHeight * scale;
      still.getContext('2d')!.drawImage(poster, (still.width - width) / 2, (still.height - height) / 2, width, height);
      const actual = live.getContext('2d')!.getImageData(0, 0, live.width, live.height).data;
      const expected = still.getContext('2d')!.getImageData(0, 0, live.width, live.height).data;
      let error = 0; let count = 0;
      for (let vertical = Math.round(live.height * 0.2); vertical < live.height * 0.85; vertical += 4) {
        for (let horizontal = 100; horizontal < 300; horizontal += 4) {
          const pixel = (vertical * live.width + horizontal) * 4;
          for (let channel = 0; channel < 3; channel++) { error += Math.abs(actual[pixel + channel] - expected[pixel + channel]); count++; }
        }
      }
      return { width: poster.naturalWidth, height: poster.naturalHeight, error: error / count };
    });
    expect(result.width).toBe(2000); expect(result.height).toBe(stage === 'F' ? 1125 : 864);
    expect(result.error, stage).toBeLessThan(18);
  }
});

test('慢加载保留旧画面且可浇灌，快速切换后旧请求不能覆盖新背景', async ({ page }) => {
  await enter(page); await selectStage(page, 'A');
  await expect(page.locator('.background-scenery')).toHaveAttribute('data-renderer', 'ready', { timeout: 20000 });
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/backgrounds/dunes/L_steps_3.json', async (route) => { await waiting; await route.abort().catch(() => {}); });
  await selectStage(page, 'B');
  await expect(page.locator('.background-scenery')).toHaveAttribute('data-renderer', 'loading');
  await expect(page.locator('.background-previous')).toBeVisible();
  await expect(page.locator('.background-previous')).toHaveCSS('opacity', '1');
  await page.getByRole('button', { name: '浇灌梦中的树', exact: true }).click();
  await expect(page.getByTestId('dew-count')).toHaveText('0');
  await selectStage(page, 'C'); await selectStage(page, 'D'); release();
  await expect(page.locator('.background-scenery')).toHaveAttribute('data-renderer', 'ready', { timeout: 20000 });
  await expect(page.locator('.background-poster')).toHaveAttribute('src', BACKGROUND_ASSETS.sanctuary.poster!);
  await page.clock.fastForward(50); await page.clock.fastForward(1200);
  await expect(page.locator('.background-previous')).toBeHidden();
  await expect(page.locator('.background-canvas')).toHaveCount(1);
});

test('设置、后台和竖屏暂停实际像素，减少动态改静态图且恢复不新增画布', async ({ page }) => {
  await enter(page); await selectStage(page, 'D');
  const host = page.locator('.background-scenery');
  await expect(host).toHaveAttribute('data-renderer', 'ready', { timeout: 20000 });
  const original = await page.locator('.background-canvas').elementHandle();
  await openSettings(page);
  await expect(host).toHaveAttribute('data-paused', 'true');
  const paused = await pixels(page); await page.clock.fastForward(3000);
  expect(await pixels(page)).toEqual(paused);
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect(host).toHaveAttribute('data-paused', 'true');
  const hidden = await pixels(page); await page.clock.fastForward(3000); expect(await pixels(page)).toEqual(hidden);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.rotate-overlay')).toBeVisible(); await expect(host).toHaveAttribute('data-paused', 'true');
  await expect(host).toHaveAttribute('data-renderer', 'ready');
  const portrait = await pixels(page); await page.clock.fastForward(3000); expect(await pixels(page)).toEqual(portrait);
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.locator('.rotate-overlay')).toBeHidden();
  await openSettings(page);
  await page.getByRole('checkbox', { name: /减少动态效果/ }).check();
  await expect(host).toHaveAttribute('data-renderer', 'static');
  await expect(host).toHaveAttribute('data-texture-bytes', '0');
  await expect(page.locator('.background-poster')).toBeVisible();
  expect(await page.locator('.background-canvas').evaluate((canvas) => (canvas as HTMLCanvasElement).width)).toBe(1);
  await page.getByRole('checkbox', { name: /减少动态效果/ }).uncheck();
  await expect(host).toHaveAttribute('data-renderer', 'ready', { timeout: 20000 });
  expect(await original!.evaluate((element) => element.isConnected)).toBe(true);
});

test('缺纹理与缺静态图逐级回退，不阻断主交互，切换后可恢复', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/forest/zhongjing2_3.png', (route) => route.abort());
  await page.route('**/forest/poster.webp', (route) => route.abort());
  await enter(page);
  await expect(page.locator('.background-scenery')).toHaveAttribute('data-renderer', 'fallback', { timeout: 20000 });
  await expect(page.locator('.background-poster')).toHaveAttribute('src', BACKGROUND_ASSETS.forest.base.src);
  expect(await page.locator('.background-poster').evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await selectStage(page, 'A'); await page.getByRole('button', { name: '浇灌梦中的树', exact: true }).click();
  await expect(page.getByTestId('dew-count')).toHaveText('0');
  await selectStage(page, 'D');
  await expect(page.locator('.background-scenery')).toHaveAttribute('data-renderer', 'ready', { timeout: 20000 });
  expect(errors).toEqual([]);
});

test('真实 WebGL 上下文丢失后静态回退并恢复，离开梦境释放背景画布', async ({ page }) => {
  await enter(page); await selectStage(page, 'C');
  const host = page.locator('.background-scenery');
  await expect(host).toHaveAttribute('data-renderer', 'ready', { timeout: 20000 });
  const canvas = await page.locator('.background-canvas').elementHandle();
  const extension = await page.locator('.background-canvas').evaluateHandle((canvas) => (canvas as HTMLCanvasElement).getContext('webgl')!.getExtension('WEBGL_lose_context')!);
  await extension.evaluate((extension) => extension.loseContext());
  await expect(host).toHaveAttribute('data-renderer', 'fallback');
  await expect(page.locator('.background-poster')).toBeVisible();
  await expect(page.getByRole('button', { name: '浇灌梦中的树', exact: true })).toBeEnabled();
  await page.waitForTimeout(1100); await extension.evaluate((extension) => extension.restoreContext());
  await expect(host).toHaveAttribute('data-renderer', 'ready', { timeout: 20000 });
  expect(await canvas!.evaluate((element) => element.isConnected)).toBe(true);
  expect((await pixels(page)).colors).toBeGreaterThan(30);
  await selectStage(page, 'G');
  await expect(page.getByTestId('reality-scene')).toBeVisible();
  await expect(page.locator('.background-canvas')).toHaveCount(0);
});

for (const mode of ['reduced', 'no-webgl'] as const) {
  test(`${mode} 使用真实合成静态背景，不下载动画纹理或创建循环`, async ({ page }) => {
    const resources: string[] = []; page.on('request', (request) => { if (/\/backgrounds\/.*\.(json|atlas|png)$/.test(request.url())) resources.push(request.url()); });
    if (mode === 'reduced') await page.emulateMedia({ reducedMotion: 'reduce' });
    else await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...options: unknown[]) {
        if (kind.startsWith('webgl') || kind === 'experimental-webgl') return null;
        return Reflect.apply(original, this, [kind, ...options]);
      } as typeof original;
    });
    await enter(page);
    for (const [stage, id] of [['C', 'canopy'], ['E', 'embers'], ['F', 'festival']] as const) {
      await selectStage(page, stage);
      await expect(page.locator('.background-scenery')).toHaveAttribute('data-renderer', mode === 'reduced' ? 'static' : 'fallback');
      await expect(page.locator('.background-poster')).toHaveAttribute('src', BACKGROUND_ASSETS[id].poster!);
      await expect(page.locator('.background-poster')).toBeVisible();
      await expect.poll(() => page.locator('.background-poster').evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      await expect(page.getByRole('button', { name: '浇灌梦中的树', exact: true })).toBeEnabled();
    }
    expect(resources).toEqual([]);
  });
}

test('E 调色动态与 F 原生循环分别符合预期，缩放后目标 / 程序 / 纹理完全释放', async ({ page }, testInfo) => {
  await page.goto('/');
  const results = await page.evaluate(async ({ width, height }) => {
    const dataModule = '/src/data/backgrounds.ts'; const sceneModule = '/src/game/backgrounds/scene.ts'; const policyModule = '/src/game/backgrounds/policy.ts';
    const [{ BACKGROUND_ASSETS }, { createBackgroundScene }, { backgroundQuality }] = await Promise.all([import(dataModule), import(sceneModule), import(policyModule)]);
    const results = [];
    for (const id of ['embers', 'festival']) {
      const canvas = document.createElement('canvas'); canvas.width = Math.min(960, width); canvas.height = Math.round(canvas.width * height / width);
      const graphics = canvas.getContext('webgl', { alpha: false, antialias: false, preserveDrawingBuffer: true })!;
      const allocations = Object.fromEntries(['Program', 'Texture', 'Buffer', 'Framebuffer'].map((name) => [name, new Set<unknown>()]));
      const methods = graphics as unknown as Record<string, (...args: unknown[]) => unknown>;
      for (const [name, allocated] of Object.entries(allocations)) {
        const create = methods[`create${name}`].bind(graphics); const remove = methods[`delete${name}`].bind(graphics);
        methods[`create${name}`] = () => { const resource = create(); if (resource) allocated.add(resource); return resource; };
        methods[`delete${name}`] = (resource) => { allocated.delete(resource); return remove(resource); };
      }
      const asset = id === 'embers' ? { ...BACKGROUND_ASSETS.embers, layers: [], planes: [], base: { src: BACKGROUND_ASSETS.sanctuary.poster, source: '' } } : BACKGROUND_ASSETS.festival;
      const scene = await createBackgroundScene(canvas, graphics, asset, backgroundQuality(width, height, 1), new AbortController().signal);
      const capture = () => { const data = new Uint8Array(canvas.width * canvas.height * 4); graphics.readPixels(0, 0, canvas.width, canvas.height, graphics.RGBA, graphics.UNSIGNED_BYTE, data); return data; };
      try {
        scene.draw(0, width, height); const initial = capture();
        for (let frame = 0; frame < 40; frame++) scene.draw(0.05, width, height);
        const animated = capture(); let changed = 0;
        for (let index = 0; index < initial.length; index += 4) if (initial[index] !== animated[index] || initial[index + 1] !== animated[index + 1] || initial[index + 2] !== animated[index + 2]) changed++;
        scene.draw(0, width, height); const frozen = capture().every((value, index) => value === animated[index]);
        canvas.width = 640; canvas.height = 360; scene.draw(0, 640, 360);
        const bytes = scene.textureBytes; const error = graphics.getError(); scene.dispose();
        results.push({ id, changed: changed / (initial.length / 4), frozen, bytes, error, remaining: Object.fromEntries(Object.entries(allocations).map(([name, values]) => [name, values.size])) });
      } finally { scene.dispose(); graphics.getExtension('WEBGL_lose_context')?.loseContext(); }
    }
    return results;
  }, page.viewportSize()!);
  await testInfo.attach('background-variants-resources', { body: JSON.stringify(results, null, 2), contentType: 'application/json' });
  for (const result of results) {
    expect(result.changed, result.id).toBeGreaterThan(0.005);
    expect(result.frozen, result.id).toBe(true);
    expect(result.error, result.id).toBe(0); expect(result.remaining, result.id).toEqual({ Program: 0, Texture: 0, Buffer: 0, Framebuffer: 0 });
    expect(result.bytes).toBeLessThan(40 * 1024 * 1024);
  }
});

test('E / F 暂停续播且主交互可用，调色上下文恢复后仍只用一个画布', async ({ page }) => {
  await enter(page);
  for (const stage of ['E', 'F'] as const) {
    await selectStage(page, stage);
    await expect(page.locator('.background-scenery')).toHaveAttribute('data-renderer', 'ready', { timeout: 20000 });
    await page.clock.runFor(200);
    await page.getByRole('button', { name: '浇灌梦中的树', exact: true }).click();
    await expect(page.getByTestId('dew-count')).toHaveText('0');
    await openSettings(page);
    const initial = await pixels(page); await page.clock.runFor(1000); expect(await pixels(page)).toEqual(initial);
    await page.getByRole('button', { name: '关闭', exact: true }).click(); await page.clock.runFor(1100);
    expect((await pixels(page)).hash).not.toBe(initial.hash);
  }
  await selectStage(page, 'E');
  await expect(page.locator('.background-scenery')).toHaveAttribute('data-renderer', 'ready', { timeout: 20000 });
  const extension = await page.locator('.background-canvas').evaluateHandle((canvas) => (canvas as HTMLCanvasElement).getContext('webgl')!.getExtension('WEBGL_lose_context')!);
  await extension.evaluate((extension) => extension.loseContext());
  await expect(page.locator('.background-scenery')).toHaveAttribute('data-renderer', 'fallback');
  await expect(page.locator('.background-poster')).toHaveAttribute('src', BACKGROUND_ASSETS.embers.poster!);
  await page.waitForTimeout(1100); await extension.evaluate((extension) => extension.restoreContext());
  await expect(page.locator('.background-scenery')).toHaveAttribute('data-renderer', 'ready', { timeout: 20000 });
  await expect(page.locator('.background-canvas')).toHaveCount(1);
  await selectStage(page, 'G'); await expect(page.locator('.background-canvas')).toHaveCount(0);
});
