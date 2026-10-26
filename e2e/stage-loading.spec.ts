import { openSettings } from './settings-support';
import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { STAGES } from '../src/data/stages';
import { stageFixture } from '../src/dev/fixtures';
import { getStageBackground } from '../src/data/backgrounds';
import { completeLoadingArtChoices, LOADING_COLORS, STAGE_LOADING_RULES } from '../src/data/stageLoading';
import type { DreamStageId, GameSave } from '../src/types/game';
import { finishOpening } from './opening-support';
import { finishSceneEntrance } from './scene-support';
import { mockServerTime } from './time-support';

const OPEN = '2026-10-27T13:27:00+08:00';
function saveKey(info: TestInfo) { return info.project.name.startsWith('production') ? 'irminsul.player.v2' : 'irminsul.development.v2'; }

async function launch(page: Page, info: TestInfo, stage: DreamStageId = 'A', date = OPEN, growth = STAGES[stage].growth.end + 1) {
  const fixture = stageFixture(stage, Date.parse(date));
  const save = { ...fixture, growth, loadingArtChoices: completeLoadingArtChoices({}, () => info.project.name.includes('mobile') ? 0.999 : 0), completedVisits: [...fixture.completedVisits, `visit-${stage}`, `visit-${stage}-2`], playedDialogues: [...fixture.playedDialogues, STAGES[stage].transition.id] };
  if (page.url() === 'about:blank') {
    const now = new Date(OPEN); await page.clock.install({ time: now }); await page.clock.pauseAt(new Date(now.getTime() + 10));
    await page.addInitScript(({ save, key, date }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(save));
      sessionStorage.setItem('irminsul.development.clock', JSON.stringify({ offset: Date.parse(date) - Date.now(), simulated: true }));
    }, { save, key: saveKey(info), date });
  } else await page.evaluate(({ save, key }) => localStorage.setItem(key, JSON.stringify(save)), { save, key: saveKey(info) });
  await page.goto('/');
  await expect(page.locator('.background-scenery')).toHaveAttribute('data-renderer', /ready|static|fallback/);
  await finishOpening(page, true); await finishSceneEntrance(page, true);
}

async function advanceToCover(page: Page) {
  for (let attempt = 0; attempt < 120 && !await page.getByTestId('stage-loading').count(); attempt++) await page.clock.runFor(500);
  await expect(page.getByTestId('stage-loading')).toBeVisible();
}

async function finishLoading(page: Page) {
  const scenery = page.locator('.background-scenery');
  if (await scenery.count()) await expect(scenery).toHaveAttribute('data-renderer', /ready|static|fallback/);
  for (let attempt = 0; attempt < 20 && await page.getByTestId('stage-loading').count(); attempt++) await page.clock.runFor(500);
  await expect(page.getByTestId('stage-loading')).toHaveCount(0);
  for (let attempt = 0; attempt < 20 && await page.getByTestId('waking-reveal').count(); attempt++) await page.clock.runFor(500);
  await expect(page.getByTestId('waking-reveal')).toHaveCount(0);
}

async function saved(page: Page, info: TestInfo): Promise<GameSave> { return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), saveKey(info)); }

test('对白后才遮住换景，统一七色图标在下方；真实背景未完成不报满、不提前请求', async ({ page }, info) => {
  await mockServerTime(page, OPEN);
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  let requested = 0; let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/backgrounds/dunes/*.json', async (route) => { requested++; await held; await route.continue().catch(() => {}); });
  await launch(page, info);
  await expect(page.locator('.dialogue-bubble')).toBeVisible(); expect(requested).toBe(0);
  await expect(page.locator('.atmosphere')).toHaveClass(/scenery-forest/);
  await page.evaluate(() => {
    const record = () => { const cover = document.querySelector('.stage-loading-screen'); if (cover && !document.documentElement.dataset.firstCover) document.documentElement.dataset.firstCover = `${cover.getAttribute('data-phase')}:${document.querySelector('.atmosphere')?.className}`; };
    new MutationObserver(record).observe(document.body, { childList: true, subtree: true });
  });
  await advanceToCover(page);
  expect(await page.locator('html').getAttribute('data-first-cover')).toMatch(/^cover:.*scenery-forest/);
  await expect(page.locator('.dialogue-bubble')).toHaveCount(0);
  await page.clock.runFor(150); await expect.poll(() => requested).toBeGreaterThan(0);
  await expect(page.locator('.stage-loading-art')).toHaveAttribute('data-illustration', info.project.name.includes('mobile') ? 'AB2' : 'AB1');
  await expect.poll(() => page.locator('.stage-loading-art').evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  const before = await saved(page, info);
  await page.locator('.water-action').dispatchEvent('click');
  await page.keyboard.press('Enter'); await page.keyboard.press('Space'); await page.mouse.wheel(0, 400);
  expect((await saved(page, info)).growth).toBe(before.growth); expect((await saved(page, info)).dew).toBe(before.dew);
  await expect(page.locator('.game-content')).toHaveAttribute('inert', '');
  await expect(page.getByRole('button', { name: '浇灌梦中的树' })).toHaveCount(0);
  const bounds = (await page.locator('.element-loading-bar').boundingBox())!; const viewport = page.viewportSize()!;
  expect(bounds.x + bounds.width / 2).toBeCloseTo(viewport.width / 2, 1); expect(bounds.y).toBeGreaterThan(viewport.height * 0.65);
  expect(await page.locator('.element-loading-bar stop').evaluateAll((stops) => stops.filter((_, index) => index % 2 === 0).map((stop) => stop.getAttribute('stop-color')))).toEqual(LOADING_COLORS);
  expect(await page.locator('.element-loading-progress').evaluate((element) => getComputedStyle(element).transitionDuration)).toBe('0s');
  await page.clock.runFor(7000);
  const progress = Number(await page.locator('.element-loading-bar').getAttribute('data-progress')); expect(progress).toBeCloseTo(STAGE_LOADING_RULES.lastMidpoint, 4);
  const visualMidpoint = await page.locator('.element-loading-bar image').evaluate(async (element) => {
    const image = await createImageBitmap(await (await fetch(element.getAttribute('href')!)).blob());
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0); image.close();
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const columns: number[] = [];
    for (let column = 900; column < canvas.width; column++) for (let row = 0; row < canvas.height; row++) {
      const offset = (row * canvas.width + column) * 4;
      if (pixels[offset + 3] > 128 && pixels[offset] > 192 && pixels[offset + 1] > 192 && pixels[offset + 2] > 192) { columns.push(column); break; }
    }
    return (columns[0] + columns.at(-1)! + 1) / 2 / canvas.width;
  });
  expect(progress).toBeCloseTo(visualMidpoint, 4);
  await page.clock.runFor(1000); expect(Number(await page.locator('.element-loading-bar').getAttribute('data-progress'))).toBe(progress);
  mkdirSync('docs/screenshots/stage-loading', { recursive: true });
  const capture = await page.screenshot({ path: `docs/screenshots/stage-loading/waiting-${info.project.name}.png` });
  const corners = await page.evaluate(async (encoded) => {
    const image = await createImageBitmap(await (await fetch(`data:image/png;base64,${encoded}`)).blob());
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0); image.close();
    const points = [[8, 8], [canvas.width - 9, 8], [8, canvas.height - 9], [canvas.width - 9, canvas.height - 9]];
    const actual = points.map(([horizontal, vertical]) => [...context.getImageData(horizontal, vertical, 1, 1).data]);
    const element = document.querySelector<HTMLImageElement>('.stage-loading-art')!;
    const artwork = await createImageBitmap(await (await fetch(element.src)).blob());
    const scale = Math.max(canvas.width / artwork.width, canvas.height / artwork.height);
    const width = artwork.width * scale; const height = artwork.height * scale;
    const left = element.dataset.illustration === 'CD2' ? canvas.width - width : (canvas.width - width) / 2;
    context.clearRect(0, 0, canvas.width, canvas.height); context.drawImage(artwork, left, (canvas.height - height) / 2, width, height); artwork.close();
    return points.map(([horizontal, vertical], index) => {
      const expected = [...context.getImageData(horizontal, vertical, 1, 1).data];
      const difference = expected.slice(0, 3).reduce((total, value, channel) => total + Math.abs(value - actual[index][channel]), 0) / 3;
      return { horizontal, vertical, actual: actual[index], expected, difference };
    });
  }, capture.toString('base64'));
  for (const corner of corners) { expect(corner.actual[3]).toBe(255); expect(corner.difference, JSON.stringify(corner)).toBeLessThan(10); }
  release(); await finishLoading(page);
  expect((await saved(page, info)).sceneStage).toBe('B'); await expect(page.locator('.atmosphere')).toHaveClass(/scenery-dunes/);
  await expect(page.getByRole('button', { name: '浇灌梦中的树' })).toBeEnabled(); expect(errors).toEqual([]);
});

test('后续各套背景及梦醒使用对应抽选图片，等比铺满视口且图标覆盖其上', async ({ page }, info) => {
  test.setTimeout(120000); await mockServerTime(page, OPEN);
  mkdirSync('docs/screenshots/stage-loading', { recursive: true });
  for (const stage of ['B', 'C', 'D', 'E', 'F'] as const) {
    await launch(page, info, stage); await advanceToCover(page); await page.clock.runFor(150);
    const target = stage === 'B' ? 'C' : stage === 'C' ? 'D' : stage === 'D' ? 'E' : stage === 'E' ? 'F' : 'G';
    await expect(page.getByTestId('stage-loading')).toHaveAttribute('data-art', target);
    const expected = (await saved(page, info)).loadingArtChoices[target]!;
    await expect(page.locator('.stage-loading-art')).toHaveAttribute('data-illustration', expected);
    await expect.poll(() => page.locator('.stage-loading-art').evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await expect(page.locator('.stage-loading-art')).toHaveCSS('object-fit', 'cover');
    const picture = (await page.locator('.stage-loading-artwork').boundingBox())!;
    const bar = (await page.locator('.element-loading-bar').boundingBox())!;
    expect(picture).toEqual({ x: 0, y: 0, ...page.viewportSize()! });
    expect(bar.y).toBeGreaterThan(picture.height / 2); expect(bar.y + bar.height).toBeLessThanOrEqual(picture.height);
    await expect(page.locator('.element-loading-bar')).toHaveCSS('z-index', '1');
    if (expected === 'CD2') await expect(page.locator('.stage-loading-art')).toHaveCSS('object-position', '100% 50%');
    if (expected === 'CD2') expect(await page.locator('.stage-loading-art').evaluate((element) => (element as HTMLImageElement).naturalWidth / (element as HTMLImageElement).naturalHeight)).toBeCloseTo(16 / 9);
    await expect(page.getByTestId('stage-loading').getByRole('button')).toHaveCount(0);
    await page.screenshot({ path: `docs/screenshots/stage-loading/to-${target}-${info.project.name}.png` });
    await finishLoading(page); expect((await saved(page, info)).sceneStage).toBe(target);
    if (target === 'G') { await expect(page.getByTestId('reality-scene')).toBeVisible(); await expect(page.locator('.dialogue-bubble')).toBeVisible(); }
    else await expect(page.locator('.atmosphere')).toHaveClass(new RegExp(`scenery-${getStageBackground(target)!.id}`));
  }
});

test('未解锁日期或未达成长不切换；日期开放也等待正在播放的树对白', async ({ page }, info) => {
  const date = '2026-10-25T10:27:00+08:00'; const server = await mockServerTime(page, date);
  await launch(page, info, 'C', date, STAGES.C.growth.end); await page.clock.runFor(10000); await expect(page.getByTestId('stage-loading')).toHaveCount(0);
  await page.getByRole('button', { name: '浇灌梦中的树' }).click(); await page.clock.runFor(600);
  await expect(page.locator('.dialogue-bubble')).toBeVisible(); const text = await page.locator('.dialogue-bubble p .sr-only').textContent();
  if (info.project.name.startsWith('production')) {
    server.now = Date.parse(OPEN); await openSettings(page);
    await page.getByRole('button', { name: '重新校时', exact: true }).click(); await expect(page.locator('.time-sync-setting')).toContainText('时间已校准');
    await page.getByRole('button', { name: '关闭', exact: true }).click();
  } else {
    await page.locator('.debug-panel summary').click(); await page.getByLabel('模拟日期时间').fill('2026-10-27T13:27'); await page.getByRole('button', { name: '应用时间', exact: true }).click(); await page.locator('.debug-panel summary').click();
  }
  await expect(page.locator('.atmosphere')).toHaveClass(/scenery-canopy/); await expect(page.getByTestId('stage-loading')).toHaveCount(0);
  expect(await page.locator('.dialogue-bubble p .sr-only').textContent()).toBe(text);
  await page.getByRole('button', { name: '浇灌梦中的树' }).click();
  await advanceToCover(page); await page.clock.runFor(150); await finishLoading(page);
  await launch(page, info, 'A', date, 197); await page.clock.runFor(10000); await expect(page.getByTestId('stage-loading')).toHaveCount(0);
});

test('后台与竖屏暂停加载且转屏按钮可用，加载中刷新不跳场或重复结算', async ({ page }, info) => {
  await mockServerTime(page, OPEN); await launch(page, info); await advanceToCover(page); await page.clock.runFor(150);
  await expect(page.locator('.background-scenery')).toHaveAttribute('data-renderer', /ready|fallback/);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  const progress = await page.locator('.element-loading-bar').getAttribute('data-progress'); await page.clock.fastForward(60000);
  expect(await page.locator('.element-loading-bar').getAttribute('data-progress')).toBe(progress);
  const viewport = page.viewportSize()!; await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: /开启横屏体验/ })).toBeEnabled();
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.clock.runFor(5000); expect((await saved(page, info)).sceneStage).toBe('A');
  await page.setViewportSize(viewport); await page.reload();
  await expect(page.locator('.atmosphere')).toHaveClass(/scenery-forest/); await expect(page.getByTestId('stage-loading')).toHaveCount(0);
  await finishOpening(page, true); await finishSceneEntrance(page, true); await advanceToCover(page); await page.clock.runFor(150); await finishLoading(page);
  const result = await saved(page, info); expect(result.sceneStage).toBe('B'); expect(result.growth).toBe(211); expect(result.dew).toBe(13);
});

test('减少动态及静态图全部失败仍自动解锁，图标损坏使用本地七色回退', async ({ page }, info) => {
  await mockServerTime(page, OPEN); await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/asserts/backgrounds/**', (route) => route.abort('failed'));
  await page.route('**/loading/seven-elements.webp', (route) => route.abort('failed'));
  await page.route('**/loading/art/**', (route) => route.abort('failed'));
  await launch(page, info); await advanceToCover(page); await page.clock.runFor(150);
  await expect(page.locator('.element-loading-bar circle')).toHaveCount(7);
  await expect(page.locator('.element-loading-bar mask circle').last()).toHaveAttribute('cx', String(1024 * STAGE_LOADING_RULES.lastMidpoint));
  await expect(page.locator('.background-scenery')).toHaveAttribute('data-renderer', 'static'); await finishLoading(page);
  expect((await saved(page, info)).sceneStage).toBe('B'); await expect(page.getByRole('button', { name: '浇灌梦中的树' })).toBeEnabled();
});

test('动态背景超过原有超时自动使用真实 poster，加载页不无限挂起', async ({ page }, info) => {
  await mockServerTime(page, OPEN);
  await page.route('**/backgrounds/dunes/*.json', () => {});
  await launch(page, info); await advanceToCover(page); await page.clock.runFor(150);
  await expect(page.locator('.background-scenery')).toHaveAttribute('data-renderer', 'loading');
  await page.clock.runFor(21000); await expect(page.locator('.background-scenery')).toHaveAttribute('data-renderer', 'fallback');
  await finishLoading(page); expect((await saved(page, info)).sceneStage).toBe('B');
});
