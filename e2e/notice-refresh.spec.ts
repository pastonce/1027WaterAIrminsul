import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { stageFixture } from '../src/dev/fixtures';
import { getLoadingArt, loadingArtSource } from '../src/data/stageLoading';
import type { GameSave, StageId } from '../src/types/game';
import { finishOpening } from './opening-support';
import { mockServerTime } from './time-support';

const OPEN = '2026-10-27T10:27:00+08:00';
const CLOSED = '2026-10-24T10:27:00+08:00';
const errors = new WeakMap<Page, string[]>();
const saveKey = (info: TestInfo) => info.project.name.startsWith('production') ? 'irminsul.player.v2' : 'irminsul.development.v2';
test.beforeEach(({ page }) => { const list: string[] = []; errors.set(page, list); page.on('pageerror', (error) => list.push(error.message)); });
test.afterEach(({ page }) => { expect(errors.get(page)).toEqual([]); });

async function launch(page: Page, info: TestInfo, intro = false) {
  const date = intro ? CLOSED : OPEN;
  await mockServerTime(page, date);
  const now = new Date(date); await page.clock.install({ time: now }); await page.clock.pauseAt(new Date(now.getTime() + 1000));
  const fixture = { ...stageFixture(intro ? 'A' : 'G', now.getTime()), introSeen: !intro };
  await page.addInitScript(({ save, key, date }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(save));
    Math.random = () => Number(sessionStorage.getItem('notice-test-rng') ?? '0');
    sessionStorage.setItem('irminsul.development.clock', JSON.stringify({ offset: Date.parse(date) - Date.now(), simulated: true }));
  }, { save: fixture, key: saveKey(info), date });
  await page.goto('/'); await finishOpening(page, true);
  if (!intro) await expect(page.getByTestId('reality-scene')).toBeVisible();
}
async function saved(page: Page, info: TestInfo): Promise<GameSave> { return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), saveKey(info)); }
async function picture(page: Page, info: TestInfo, name: string) { mkdirSync('artifacts/notice', { recursive: true }); await page.screenshot({ path: `artifacts/notice/${info.project.name}-${name}.png` }); }
async function notice(page: Page) {
  const opener = page.getByRole('button', { name: '公告与声明', exact: true });
  const left = await opener.boundingBox(); const right = await page.getByRole('button', { name: '设置', exact: true }).boundingBox();
  expect(left!.x + left!.width).toBeLessThanOrEqual(right!.x);
  await opener.click(); const panel = page.locator('.notice-modal'); await expect(panel).toBeVisible(); return panel;
}

test('开放前可查看声明，正文署名 / 许可可编辑，焦点和竖屏恢复不绕过入梦权限', async ({ page }, info) => {
  await launch(page, info, true); const before = await saved(page, info); const panel = await notice(page);
  await expect(page.locator('.game-content')).toHaveAttribute('inert', '');
  await expect(page.locator('canvas')).toHaveCount(0); await expect(page.getByTestId('dream-scene')).toHaveCount(0);
  for (const text of ['独钓', '1666417849', '190497686', '非商业同人', '不是官方', 'CC0']) await expect(panel).toContainText(text);
  await expect(panel.locator('h3')).toHaveCount(5);
  const credits = panel.getByRole('link', { name: '音效来源与署名' });
  await expect(credits).toHaveAttribute('href', '/asserts/sfx/CREDITS.txt'); await expect(credits).toHaveAttribute('rel', 'noopener noreferrer');
  await page.keyboard.press('Tab'); await expect(panel.getByRole('button', { name: '关闭', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(panel.getByRole('link').last()).toBeFocused();
  await picture(page, info, 'intro-declaration');
  await page.setViewportSize({ width: 390, height: 844 }); await page.clock.runFor(30000);
  await expect(panel).toHaveCount(0); await expect(page.getByRole('button', { name: /开启横屏体验/ })).toBeVisible();
  await page.setViewportSize(info.project.use.viewport!); await page.clock.runFor(100); await expect(page.locator('.notice-modal')).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0); await expect(page.getByRole('button', { name: '公告与声明' })).toBeFocused();
  expect((await saved(page, info)).growth).toBe(before.growth); expect((await saved(page, info)).introSeen).toBe(false);
  await page.getByRole('button', { name: '沉入梦乡', exact: true }).click(); await expect(page.locator('.intro-notice')).toBeVisible(); await expect(page.getByTestId('dream-scene')).toHaveCount(0);
});

test('G 底图无额外缩放且优先保留下侧，设置红色轮回按钮居中，声明暂停闲置', async ({ page }, info) => {
  await launch(page, info); const background = page.locator('.reality-landscape');
  await page.mouse.move(1, 1);
  const controls = await page.locator('.header-tool-button').evaluateAll((buttons) => buttons.map((button) => { const style = getComputedStyle(button); return { background: style.backgroundColor, color: style.color, border: style.borderColor, shadow: style.boxShadow }; }));
  expect(controls).toHaveLength(3); expect(controls[1]).toEqual(controls[0]); expect(controls[2]).toEqual(controls[0]); expect(controls[0].background).not.toBe('rgba(0, 0, 0, 0)');
  await expect.poll(() => background.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(background).toHaveCSS('transform', 'none'); await expect(background).toHaveCSS('object-fit', 'cover'); await expect(background).toHaveCSS('object-position', '50% 100%');
  await expect(page.locator('.forest-silhouette')).toHaveCount(0); await picture(page, info, 'reality');
  for (const viewport of [info.project.use.viewport!, { width: 1600, height: 600 }, { width: 640, height: 360 }]) {
    await page.setViewportSize(viewport); await page.clock.runFor(100);
    const bounds = await background.boundingBox(); expect(bounds!.x).toBe(0); expect(bounds!.y).toBe(0); expect(bounds!.width).toBe(viewport.width); expect(bounds!.height).toBe(viewport.height);
    await expect(background).toHaveCSS('object-position', '50% 100%');
  }
  await page.setViewportSize(info.project.use.viewport!); await page.clock.runFor(100);
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const settings = page.getByRole('dialog', { name: '设置', exact: true }); const reset = settings.getByRole('button', { name: '开始下一轮梦的轮回', exact: true });
  await expect(reset).toHaveCSS('text-align', 'center'); expect(await reset.evaluate((element) => getComputedStyle(element).backgroundImage)).toContain('linear-gradient');
  await reset.scrollIntoViewIfNeeded();
  const parent = await settings.boundingBox(); const button = await reset.boundingBox(); expect(Math.abs(button!.x + button!.width / 2 - parent!.x - parent!.width / 2)).toBeLessThan(2);
  await expect(settings.locator('.fanwork-note')).toHaveCount(0); expect(await reset.evaluate((element) => element.nextElementSibling)).toBeNull(); await picture(page, info, 'settings');
  await reset.click(); await expect(settings.getByRole('button', { name: '再次点击，清除当前存档并重新入梦', exact: true })).toBeVisible(); expect((await saved(page, info)).endingComplete).toBe(true);
  await page.keyboard.press('Escape'); await expect(page.getByRole('button', { name: '设置', exact: true })).toBeFocused();
  await notice(page); const before = await page.evaluate((key) => localStorage.getItem(key), saveKey(info)); await page.clock.runFor(60000);
  await expect(page.locator('.dialogue-bubble')).toHaveCount(0); expect(await page.evaluate((key) => localStorage.getItem(key), saveKey(info))).toBe(before);
  await picture(page, info, 'declaration'); await page.keyboard.press('Escape'); await page.clock.runFor(19999); await expect(page.locator('.dialogue-bubble')).toHaveCount(0);
  await page.clock.runFor(1); await expect(page.locator('.dialogue-bubble')).toHaveAttribute('data-speaker', 'nahida');
});

test('整页刷新重新抽六组插图，仅下载本次选中规格，同页面板 / 调整屏幕不重抽', async ({ page }, info) => {
  let images: string[] = []; page.on('request', (request) => { if (request.url().includes('/loading/art/')) images.push(new URL(request.url()).pathname); });
  await launch(page, info, true); const first = await saved(page, info);
  const sources = (save: GameSave) => Object.entries(save.loadingArtChoices).map(([stage, choice]) => loadingArtSource(getLoadingArt(stage as StageId, choice)!, info.project.use.viewport!.width, info.project.use.viewport!.height, 1));
  expect(new Set(images)).toEqual(new Set(sources(first))); expect(first.loadingArtChoices.B).toBe('AB1');
  await notice(page); await page.keyboard.press('Escape'); await page.setViewportSize({ width: 640, height: 360 }); await page.clock.runFor(100); expect((await saved(page, info)).loadingArtChoices).toEqual(first.loadingArtChoices);
  await page.setViewportSize(info.project.use.viewport!); await page.evaluate(() => sessionStorage.setItem('notice-test-rng', '.99')); images = [];
  await page.reload(); await finishOpening(page, true); const second = await saved(page, info);
  expect(second.loadingArtChoices).toEqual({ B: 'AB2', C: 'BC2', D: 'CD2', E: 'DE2', F: 'EF2', G: 'FG1' });
  expect(images.filter((source) => source.includes('/fg1-')).length).toBeLessThanOrEqual(1); expect(images.every((source) => sources(second).includes(source))).toBe(true); expect(images.filter((source) => !source.includes('/fg1-'))).toHaveLength(5);
  for (const field of ['growth', 'dew', 'introSeen', 'completedStages', 'completedVisits', 'playedDialogues'] as const) expect(second[field]).toEqual(first[field]);
});
