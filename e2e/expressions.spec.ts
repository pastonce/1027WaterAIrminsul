import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { stageFixture } from '../src/dev/fixtures';
import type { GameSave, StageId } from '../src/types/game';
import { finishOpening } from './opening-support';
import { finishSceneEntrance } from './scene-support';
import { mockServerTime } from './time-support';
import { openSettings } from './settings-support';
import { TREE_BASE_DEPTH } from '../src/game/tree/scenePlacement';

const OPEN = '2026-10-27T13:27:00+08:00';
const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => { const collected: string[] = []; errors.set(page, collected); page.on('pageerror', (error) => collected.push(error.message)); });
test.afterEach(({ page }) => expect(errors.get(page)).toEqual([]));
const bubble = (page: Page) => page.locator('.dialogue-bubble');
const expression = (page: Page) => page.locator('.expression-pop');
const key = (info: TestInfo) => info.project.name.startsWith('production') ? 'irminsul.player.v2' : 'irminsul.development.v2';

async function launch(page: Page, info: TestInfo, stage: StageId = 'A', patch: Partial<GameSave> = {}) {
  const fixture = stageFixture(stage, Date.parse(OPEN));
  await mockServerTime(page, OPEN); await page.clock.install({ time: new Date(OPEN) }); await page.clock.pauseAt(new Date(Date.parse(OPEN) + 1000));
  await page.addInitScript(({ save, storage, date }) => {
    localStorage.setItem(storage, JSON.stringify(save)); sessionStorage.setItem('irminsul.development.clock', JSON.stringify({ offset: date - Date.now(), simulated: true }));
    Reflect.set(window, '__expressionRoll', .99); Math.random = () => Reflect.get(window, '__expressionRoll');
  }, { save: { ...fixture, ...patch, settings: { ...fixture.settings, music: false, ...patch.settings } }, storage: key(info), date: Date.parse(OPEN) });
  await page.goto('/'); await finishOpening(page, true); await finishSceneEntrance(page, true); await page.mouse.move(1, 1);
}
async function roll(page: Page, value: number) { await page.evaluate((value) => Reflect.set(window, '__expressionRoll', value), value); }
async function until(page: Page, condition: () => Promise<boolean>, maximum = 45000) {
  for (let elapsed = 0; elapsed < maximum && !await condition(); elapsed += 50) await page.clock.fastForward(50);
  expect(await condition()).toBe(true);
}
async function drain(page: Page) { await until(page, async () => await bubble(page).count() === 0); }
async function ready(page: Page, asset: string) { await expect(expression(page)).toHaveAttribute('data-expression', asset); await expect(expression(page)).toHaveAttribute('data-ready', 'true'); }
async function capture(page: Page, info: TestInfo, name: string) {
  await expression(page).locator('.expression-disc').evaluate((element) => { for (const animation of element.getAnimations()) { animation.pause(); animation.currentTime = 900; } });
  mkdirSync('artifacts/expressions', { recursive: true }); await page.screenshot({ path: `artifacts/expressions/${info.project.name}-${name}.png` });
}
async function inspect(page: Page) {
  const frame = (await expression(page).boundingBox())!; const viewport = page.viewportSize()!;
  expect(frame.width).toBe(frame.height); expect(frame.x).toBeGreaterThanOrEqual(12); expect(frame.x + frame.width).toBeLessThanOrEqual(viewport.width - 12);
  expect(frame.y).toBeGreaterThanOrEqual(24); expect(frame.y + frame.height).toBeLessThanOrEqual(viewport.height - 24);
  expect(frame.width).toBe(viewport.height <= 600 ? 70 : 96); await expect(expression(page)).toHaveAttribute('data-placed', 'true');
  const origin = { x: Number(await expression(page).getAttribute('data-origin-x')), y: Number(await expression(page).getAttribute('data-origin-y')) };
  const angle = Math.atan2(frame.x + frame.width / 2 - origin.x, origin.y - frame.y - frame.height / 2) * 180 / Math.PI;
  expect(angle).toBeGreaterThanOrEqual(-60.02); expect(angle).toBeLessThanOrEqual(30.02);
  await expect(expression(page)).toHaveAttribute('aria-hidden', 'true'); await expect(expression(page)).toHaveCSS('pointer-events', 'none');
  await expect(expression(page).locator('.expression-outline path')).toHaveCSS('fill', 'rgb(255, 255, 255)');
  await expect(expression(page).locator('.expression-outline path')).toHaveAttribute('d', / A 48 48 0 1 1 .+ L .+ Z/u); await expect(expression(page).getByRole('button')).toHaveCount(0);
}

test('成熟固定视角的表情与对白靠近可见冠部，根部仍在画面中', async ({ page }, info) => {
  await launch(page, info, 'F', { growth: 1020 }); await drain(page); await roll(page, 0);
  await until(page, async () => await expression(page).count() > 0, 12000);
  await expect(expression(page)).toHaveAttribute('data-ready', 'true'); await inspect(page);
  const geometry = await page.locator('.dream-tree').evaluate((element, depth) => {
    const matrix = (element as SVGSVGElement).getScreenCTM()!;
    return { bottom: new DOMPoint(500, 3300 + depth).matrixTransform(matrix).y, height: innerHeight };
  }, TREE_BASE_DEPTH);
  expect(geometry.bottom).toBeGreaterThanOrEqual(geometry.height); expect(geometry.bottom).toBeLessThanOrEqual(geometry.height + 1.1);
  await expect(page.getByTestId('dream-scene')).toHaveAttribute('data-camera-offset', '0');
  await capture(page, info, 'fixed-root-mature');
  await roll(page, .99); await page.getByRole('button', { name: '梦中的树', exact: true }).press('Enter');
  await expect(bubble(page)).toBeVisible(); const bounds = (await bubble(page).boundingBox())!;
  expect(bounds.y).toBeGreaterThanOrEqual(80); expect(bounds.y + bounds.height).toBeLessThan(geometry.height);
});

test('树累积十秒才作半概率判断，失败重计、成功只请求选中图片且不阻断操作', async ({ page }, info) => {
  const requests: string[] = []; page.on('request', (request) => { if (request.url().includes('/asserts/expressions/')) requests.push(request.url()); });
  await launch(page, info); await drain(page); expect(requests).toEqual([]);
  await roll(page, .5); await page.clock.fastForward(10000); await expect(expression(page)).toHaveCount(0);
  await roll(page, .01); await page.clock.fastForward(9999); await expect(expression(page)).toHaveCount(0);
  await page.clock.fastForward(1); await ready(page, '1'); await inspect(page);
  expect(new Set(requests).size).toBe(1); await expect(page.getByRole('button', { name: '浇灌梦中的树', exact: true })).toBeEnabled();
  await capture(page, info, 'tree'); await page.clock.fastForward(2800); await expect(expression(page)).toHaveCount(0);
});

test('树的空闲累积与已弹出表情在设置中暂停，关闭只走余量', async ({ page }, info) => {
  await launch(page, info); await drain(page); await roll(page, .01); await page.clock.fastForward(6000); await openSettings(page);
  await page.clock.fastForward(30000); await expect(expression(page)).toHaveCount(0); await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.clock.fastForward(3999); await expect(expression(page)).toHaveCount(0); await page.clock.fastForward(1); await ready(page, '1');
  await page.clock.fastForward(1000); await openSettings(page); await page.clock.fastForward(20000);
  await expect(expression(page)).toHaveAttribute('data-paused', 'true'); await expect(expression(page)).toHaveCSS('visibility', 'hidden');
  await page.getByRole('button', { name: '关闭', exact: true }).click(); await page.clock.fastForward(1799); await expect(expression(page)).toHaveCount(1);
  await page.clock.fastForward(1); await expect(expression(page)).toHaveCount(0);
});

for (const sample of [{ mode: 'before', roll: 0, asset: '5' }, { mode: 'middle', roll: .45, asset: '3' }, { mode: 'after', roll: .99, asset: '8' }]) test(`G 日常${sample.mode}模式按原标记位置只弹一次，数字不进入正文`, async ({ page }, info) => {
  await launch(page, info, 'G', { dialogueDecks: { 'G/nahida': ['G5N'] } }); await roll(page, sample.roll);
  await page.getByRole('button', { name: '和纳西妲聊天', exact: true }).click(); await page.mouse.move(1, 1);
  if (sample.mode !== 'before') await expect(expression(page)).toHaveCount(0);
  await until(page, async () => await expression(page).count() === 1); await ready(page, sample.asset); await inspect(page);
  const visible = (await bubble(page).locator('.bubble-text > [aria-hidden=true]').textContent())!;
  if (sample.mode === 'before') expect(visible.length).toBeLessThan(2);
  if (sample.mode === 'middle') { await expect(bubble(page)).toHaveAttribute('data-segment', '1'); expect(visible).toContain('特别呢？'); }
  if (sample.mode === 'after') { await expect(bubble(page)).toHaveAttribute('data-segment', '2'); expect(visible).toContain('讲给我听'); }
  expect(await bubble(page).locator('.bubble-text .sr-only').textContent()).not.toMatch(/\[\d+\]/u);
  await capture(page, info, `daily-${sample.mode}`);
  await roll(page, .99); await drain(page); await page.clock.fastForward(2800); await expect(expression(page)).toHaveCount(0);
  const save = await page.evaluate((storage) => JSON.parse(localStorage.getItem(storage)!), key(info)); expect(save.playedDialogues).toContain('G5N');
});

test('G 用户祝福不触发表情，纳西妲回复按同一随机模式机制弹出', async ({ page }, info) => {
  await launch(page, info, 'G', { dialogueDecks: { 'G/reply': ['N05'] } }); await roll(page, 0);
  await page.getByRole('button', { name: '送上生日祝福', exact: true }).click(); await page.mouse.move(1, 1);
  await expect(bubble(page)).toHaveAttribute('data-speaker', 'user'); await expect(expression(page)).toHaveCount(0);
  await until(page, async () => await bubble(page).getAttribute('data-speaker') === 'nahida'); await ready(page, '2'); await inspect(page);
  await expect(expression(page)).toHaveAttribute('data-anchor', 'nahida'); await expect(bubble(page)).toHaveAttribute('data-theme', 'celebration');
  await capture(page, info, 'reply'); await drain(page); await expect(page.getByRole('button', { name: '送上生日祝福', exact: true })).toBeEnabled();
});

test('减少动态或瞬时正文不漏表情，缺图不阻断对白与祝福按钮', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await launch(page, info, 'G', { dialogueDecks: { 'G/nahida': ['G2N'] } }); await roll(page, .99);
  await page.getByRole('button', { name: '和纳西妲聊天', exact: true }).click(); await page.mouse.move(1, 1); await ready(page, '6');
  await expect(expression(page)).toHaveAttribute('data-reduced', 'true'); await inspect(page); await drain(page);
  await page.route('**/asserts/expressions/**', (route) => route.abort('failed'));
  await roll(page, 0); await page.getByRole('button', { name: '和纳西妲聊天', exact: true }).click();
  await page.clock.fastForward(2000); await expect(expression(page)).toHaveCount(0); await drain(page);
  await expect(page.getByRole('button', { name: '送上生日祝福', exact: true })).toBeEnabled();
});
