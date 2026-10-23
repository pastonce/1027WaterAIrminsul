import { openSettings } from './settings-support';
import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { stageFixture } from '../src/dev/fixtures';
import { STAGES } from '../src/data/stages';
import { completeLoadingArtChoices, getLoadingArt, loadingArtSource, STAGE_LOADING_RULES } from '../src/data/stageLoading';
import pageAssets from '../src/data/pageAssets.generated.json' with { type: 'json' };
import type { GameSave } from '../src/types/game';
import { mockServerTime } from './time-support';
import { finishOpening } from './opening-support';
import { finishSceneEntrance } from './scene-support';

const OPEN = '2026-10-27T10:27:00+08:00';
const key = (info: TestInfo) => info.project.name.startsWith('production') ? 'irminsul.player.v2' : 'irminsul.development.v2';
async function saved(page: Page, info: TestInfo): Promise<GameSave> { return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), key(info)); }

async function launch(page: Page, info: TestInfo, stage: 'A' | 'F' | 'G', boundary = false, visit = false) {
  await mockServerTime(page, OPEN);
  const now = new Date(OPEN); await page.clock.install({ time: now }); await page.clock.pauseAt(new Date(now.getTime() + 1000));
  const fixture = stageFixture(stage, now.getTime());
  const save = { ...fixture, growth: stage === 'G' ? fixture.growth : boundary ? STAGES[stage].growth.end + 1 : STAGES[stage].growth.start + 13, loadingArtChoices: completeLoadingArtChoices({}, () => 0), pendingVisits: visit ? [`visit-${stage}`] : [], completedVisits: visit || stage === 'G' ? fixture.completedVisits : [...fixture.completedVisits, `visit-${stage}`, `visit-${stage}-2`], playedDialogues: [...fixture.playedDialogues, STAGES[stage].transition.id] };
  await page.addInitScript(({ save, key, date }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(save));
    Math.random = () => Number(sessionStorage.getItem('page-art-test-rng') ?? '0');
    sessionStorage.setItem('irminsul.development.clock', JSON.stringify({ offset: Date.parse(date) - Date.now(), simulated: true }));
  }, { save, key: key(info), date: OPEN });
  await page.goto('/'); await finishOpening(page, true); await finishSceneEntrance(page, true);
  if (visit) for (let attempt = 0; attempt < 40 && !await page.locator('.dialogue-bubble[data-speaker=nahida]').count(); attempt++) await page.clock.fastForward(250);
  if (stage === 'G') await expect(page.getByTestId('reality-scene')).toBeVisible();
  else await expect(page.locator('.background-scenery')).toHaveAttribute('data-renderer', /ready|static|fallback/);
}

async function cover(page: Page) {
  for (let attempt = 0; attempt < 120 && !await page.getByTestId('stage-loading').count(); attempt++) await page.clock.runFor(500);
  await expect(page.getByTestId('stage-loading')).toBeVisible(); await page.clock.runFor(150);
}

async function finish(page: Page) {
  await expect(page.locator('.background-scenery')).toHaveAttribute('data-renderer', /ready|static|fallback/);
  for (let attempt = 0; attempt < 25 && await page.getByTestId('stage-loading').count(); attempt++) await page.clock.runFor(500);
  await expect(page.getByTestId('stage-loading')).toHaveCount(0);
}

test('开场仅下载六张已选图、空闲只补下一张，刷新重新预选，图标使用新 PNG', async ({ page }, info) => {
  const images: string[] = []; page.on('request', (request) => { if (request.url().includes('/loading/art/')) images.push(new URL(request.url()).pathname); });
  await launch(page, info, 'A'); await page.clock.runFor(6000);
  const save = await saved(page, info); const selected = getLoadingArt('B', save.loadingArtChoices.B)!;
  const viewport = page.viewportSize()!;
  const source = loadingArtSource(selected, viewport.width, viewport.height, 1);
  await expect(page.locator('head link[rel=prefetch]')).toHaveAttribute('href', source);
  const chosen = (save: GameSave) => Object.entries(save.loadingArtChoices).map(([stage, choice]) => loadingArtSource(getLoadingArt(stage as keyof typeof STAGES, choice)!, viewport.width, viewport.height, 1));
  expect(new Set(images)).toEqual(new Set(chosen(save)));
  await expect(page.locator('link[rel=icon]')).toHaveAttribute('href', pageAssets.icon);
  const icon = await page.request.get(pageAssets.icon); expect(icon.ok()).toBe(true); expect(icon.headers()['content-type']).toContain('image/png');
  await openSettings(page); await expect(page.locator('head link[rel=prefetch]')).toHaveCount(0);
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.evaluate(() => sessionStorage.setItem('page-art-test-rng', '.99'));
  await page.reload(); await finishOpening(page, true); await finishSceneEntrance(page, true);
  const reopened = await saved(page, info); expect(reopened.loadingArtChoices.B).toBe('AB2');
  expect(images.every((image) => [...chosen(save), ...chosen(reopened)].includes(image))).toBe(true);
});

test('省流量模式不预取，仍正常显示页面且不下载未选图片', async ({ page }, info) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: true, effectiveType: '4g' } }));
  const images: string[] = []; page.on('request', (request) => { if (request.url().includes('/loading/art/')) images.push(request.url()); });
  await launch(page, info, 'A'); await page.clock.runFor(7000);
  await expect(page.locator('head link[rel=prefetch]')).toHaveCount(0);
  const choices = (await saved(page, info)).loadingArtChoices; const viewport = page.viewportSize()!;
  const selected = Object.entries(choices).map(([stage, choice]) => loadingArtSource(getLoadingArt(stage as keyof typeof STAGES, choice)!, viewport.width, viewport.height, 1));
  expect(images.every((image) => selected.includes(new URL(image).pathname))).toBe(true); expect(new Set(images)).toHaveProperty('size', 6);
  await expect(page.getByRole('button', { name: '浇灌梦中的树' })).toBeEnabled();
});

test('新背景提前就绪也等待插图加载，未完成时只保留末元素同一次停顿', async ({ page }, info) => {
  let release!: () => void; const waiting = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/loading/art/ab1-*', async (route) => { await waiting; await route.continue().catch(() => {}); });
  await launch(page, info, 'A', true); await cover(page);
  await expect(page.locator('.background-scenery')).toHaveAttribute('data-renderer', /ready|fallback/);
  await page.clock.runFor(6500);
  await expect(page.getByTestId('stage-loading')).toBeVisible();
  expect(Number(await page.locator('.element-loading-bar').getAttribute('data-progress'))).toBeCloseTo(STAGE_LOADING_RULES.lastMidpoint, 4);
  expect((await saved(page, info)).sceneStage).toBe('A');
  release(); await expect.poll(() => page.locator('.stage-loading-art').evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await finish(page); expect((await saved(page, info)).sceneStage).toBe('B');
});

test('插图等待超时自动白底回退，原存档与操作恢复，不留下空白锁屏', async ({ page }, info) => {
  await page.route('**/loading/art/ab1-*', () => {});
  await launch(page, info, 'A', true); await cover(page);
  await expect(page.locator('.background-scenery')).toHaveAttribute('data-renderer', /ready|fallback/);
  await page.clock.runFor(STAGE_LOADING_RULES.imageTimeoutMs + 1500); await finish(page);
  expect((await saved(page, info)).sceneStage).toBe('B'); await expect(page.getByRole('button', { name: '浇灌梦中的树' })).toBeEnabled();
});

test('F 恢复原壁纸循环、四只常驻和独立秋千，纳西妲气泡纹样更清晰', async ({ page }, info) => {
  const images: string[] = []; const errors: string[] = [];
  page.on('request', (request) => images.push(request.url())); page.on('pageerror', (error) => errors.push(error.message));
  await launch(page, info, 'F', false, true);
  await expect(page.locator('.background-scenery')).toHaveAttribute('data-renderer', 'ready');
  expect(Number(await page.locator('.background-scenery').getAttribute('data-texture-bytes'))).toBeLessThan(40 * 1024 * 1024);
  await expect(page.locator('.creature-fixed')).toHaveCount(4);
  await expect.poll(async () => {
    await page.clock.runFor(100);
    return page.locator('.nahida-avatar[data-character=nahida_swing]').getAttribute('data-renderer');
  }).toBe('ready');
  await page.clock.runFor(1000); const bubble = page.locator('.dialogue-bubble[data-speaker=nahida]'); await expect(bubble).toBeVisible();
  expect(await bubble.evaluate((element) => getComputedStyle(element).backgroundImage)).toContain(pageAssets.dialogue);
  await expect(bubble).toHaveCSS('color', 'rgb(32, 61, 46)');
  await expect(bubble).toHaveAttribute('data-theme', 'nahida');
  expect(images.some((url) => url.endsWith('/backgrounds/festival/festival.json'))).toBe(true);
  expect(images.some((url) => url.endsWith(pageAssets.realityBackground))).toBe(false);
  expect(images.some((url) => url.includes('/festival-frame/') || url.endsWith('/image_2_15.png'))).toBe(false);
  mkdirSync('docs/screenshots/page-art', { recursive: true });
  await page.screenshot({ path: `docs/screenshots/page-art/festival-dialogue-${info.project.name}.png` });
  for (const id of ['aranara_07', 'aranara_08', 'aranara_09', 'aranara_10']) {
    await page.locator(`.creature-fixed[data-asset=${id}] .creature-hit`).click();
    await expect(page.locator(`.creature-fixed[data-asset=${id}] .creature-hit`)).toBeDisabled();
  }
  expect((await saved(page, info)).claimedAranara).toHaveLength(4);
  expect(images.some((url) => url.endsWith('/characters/nahida-placeholder.svg'))).toBe(false); expect(errors).toEqual([]);
  await page.reload(); await finishOpening(page, true); await finishSceneEntrance(page, true);
  await expect(page.locator('.creature-fixed .creature-hit:disabled')).toHaveCount(4);
});

test('G 仅换静态底图，原角色、拱廊与祝福交互保持', async ({ page }, info) => {
  const images: string[] = []; page.on('request', (request) => images.push(request.url()));
  await launch(page, info, 'G');
  const background = page.locator('.landscape-image');
  await expect(background).toHaveAttribute('src', pageAssets.realityBackground);
  await expect.poll(() => background.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBe(1067);
  await expect(background).toHaveCSS('object-fit', 'cover');
  await expect(page.locator('.background-canvas')).toHaveCount(0);
  await expect(page.locator('.courtyard-arch')).toBeVisible();
  await expect(page.locator('.reality-character .nahida-avatar')).toHaveAttribute('data-character', 'reality');
  await page.getByRole('button', { name: '送上生日祝福', exact: true }).click();
  await expect(page.locator('.dialogue-bubble[data-speaker=user]')).toBeVisible();
  for (let attempt = 0; attempt < 40 && !await page.locator('.dialogue-bubble[data-speaker=nahida]').count(); attempt++) await page.clock.fastForward(250);
  const bubble = page.locator('.dialogue-bubble[data-speaker=nahida]'); await expect(bubble).toBeVisible();
  await expect(bubble).toHaveAttribute('data-theme', 'celebration');
  expect(await bubble.evaluate((element) => getComputedStyle(element).backgroundImage)).not.toContain(pageAssets.dialogue);
  expect(images.some((url) => url.includes('/backgrounds/festival/'))).toBe(false);
  await page.clock.runFor(1000); mkdirSync('docs/screenshots/page-art', { recursive: true });
  await page.screenshot({ path: `docs/screenshots/page-art/reality-dialogue-${info.project.name}.png` });
});
