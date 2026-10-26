import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { SCHEDULE } from '../src/data/schedule';
import { SEED_ART } from '../src/data/seed';
import { finishOpening } from './opening-support';
import { finishSceneEntrance } from './scene-support';
import { mockServerTime } from './time-support';
import type { GameSave } from '../src/types/game';

function key(info: TestInfo) { return info.project.name.startsWith('production') ? 'irminsul.player.v2' : 'irminsul.development.v2'; }
async function saved(page: Page, info: TestInfo): Promise<GameSave> { return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), key(info)); }

async function launch(page: Page) {
  await mockServerTime(page, SCHEDULE[0].at);
  const date = Date.parse(SCHEDULE[0].at);
  await page.clock.install({ time: new Date(date) }); await page.clock.pauseAt(new Date(date + 1000));
  await page.addInitScript((date) => {
    Math.random = () => .99;
    sessionStorage.setItem('irminsul.development.clock', JSON.stringify({ offset: date - Date.now(), simulated: true }));
    localStorage.setItem('irminsul.notice.seen.v1', '1');
  }, date);
  await page.goto('/'); await finishOpening(page, true);
}

test('种子从入口衔接真实镜头，种下后引导收露与首次浇灌', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await launch(page);
  const initial = page.locator('.intro-seed img');
  await expect(initial).toHaveAttribute('src', SEED_ART.src);
  const original = (await initial.boundingBox())!;
  const enter = (await page.getByRole('button', { name: '沉入梦乡', exact: true }).boundingBox())!;
  expect(original.y).toBeGreaterThan(enter.y + enter.height);
  mkdirSync('artifacts/seed', { recursive: true });
  await page.screenshot({ path: `artifacts/seed/${info.project.name}-intro.png` });
  await page.getByRole('button', { name: '沉入梦乡', exact: true }).click();
  const seed = page.locator('.seed-onboarding');
  await expect(seed).toHaveAttribute('data-phase', 'arriving');
  const arrived = (await page.locator('.plant-seed').boundingBox())!;
  expect(Math.abs(arrived.x + arrived.width / 2 - original.x - original.width / 2)).toBeLessThan(3);
  expect(Math.abs(arrived.width - original.width)).toBeLessThan(3);
  await expect(page.getByRole('button', { name: '浇灌梦中的树' })).toBeDisabled();
  await expect(page.locator('.seed-click-hint, .dialogue-bubble, .dew-particle')).toHaveCount(0);
  await expect(page.locator('.background-scenery')).toHaveAttribute('data-renderer', 'ready', { timeout: 20000 });
  await page.clock.runFor(1600); await expect(seed).toHaveAttribute('data-phase', 'arriving');
  await finishSceneEntrance(page, true); await expect(seed).toHaveAttribute('data-phase', 'waiting');
  const center = (await page.locator('.plant-seed').boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(Math.abs(center.x + center.width / 2 - viewport.width / 2)).toBeLessThan(1);
  expect(Math.abs(center.y + center.height / 2 - viewport.height / 2)).toBeLessThan(1);
  await expect(page.locator('.seed-click-hint')).toHaveText('点击种下种子');
  await expect(page.locator('.seed-click-hint > .sr-only')).toHaveClass('sr-only');
  await expect(page.locator('.seed-click-hint svg .cue-touch')).toHaveCount(1);
  await expect(page.locator('.seed-click-hint')).toHaveCSS('pointer-events', 'none');
  await expect(page.locator('.dialogue-bubble')).toHaveCount(0);
  await page.screenshot({ path: `artifacts/seed/${info.project.name}-waiting.png` });
  await page.getByRole('button', { name: '种下这颗种子' }).click();
  await expect(seed).toHaveAttribute('data-phase', 'falling');
  const trajectory = await page.locator('.seed-flight').evaluate((element) => {
    const animation = element.getAnimations()[0];
    animation.pause(); animation.currentTime = 0; const start = element.getBoundingClientRect();
    animation.currentTime = 600; const middle = element.getBoundingClientRect();
    animation.currentTime = 1200; const end = element.getBoundingClientRect();
    const result = { startX: start.x, middleX: middle.x, endX: end.x, startY: start.y, endY: end.y, opacity: getComputedStyle(element).opacity };
    animation.currentTime = 0; animation.play(); return result;
  });
  expect(trajectory.startX).toBeCloseTo(trajectory.middleX, 1); expect(trajectory.startX).toBeCloseTo(trajectory.endX, 1);
  expect(trajectory.endY).toBeGreaterThan(trajectory.startY); expect(trajectory.opacity).toBe('0');
  await page.clock.runFor(1200); await expect(seed).toHaveCount(0); expect((await saved(page, info)).seedPlanted).toBe(true);
  await expect(page.locator('.dream-tree')).toHaveAttribute('data-tree-animation', 'start');
  await page.clock.runFor(2000); await expect(page.locator('.dew-collect-hint')).toHaveText('轻触收集梦露');
  for (let attempt = 0; attempt < 12 && (await saved(page, info)).dew < 20; attempt++) {
    const dew = page.locator('.dew-particle:not(:disabled)').first();
    if (await dew.count()) await dew.click({ force: true });
    await page.clock.runFor(1100);
  }
  expect((await saved(page, info)).dew).toBeGreaterThanOrEqual(20);
  await expect(page.locator('.dew-collect-hint')).toHaveCount(0); await expect(page.locator('.watering-guide')).toHaveText('点击浇灌');
  expect(await page.locator('.watering-guide').evaluate((element) => element.parentElement?.classList.contains('water-action'))).toBe(true);
  await page.screenshot({ path: `artifacts/seed/${info.project.name}-watering-cue.png` });
  await page.getByRole('button', { name: '浇灌梦中的树' }).click();
  expect((await saved(page, info)).growth).toBe(20); await expect(page.locator('.watering-guide')).toHaveCount(0);
  await page.clock.runFor(3000); await expect(page.locator('.dream-tree')).toHaveAttribute('data-tree-animation', 'grow1');
  await page.screenshot({ path: `artifacts/seed/${info.project.name}-first-growth.png` });
  expect(errors).toEqual([]);
});

test('种子落下可由设置与竖屏暂停，刷新仅重演未完成种植', async ({ page }, info) => {
  await launch(page); await page.getByRole('button', { name: '沉入梦乡', exact: true }).click(); await finishSceneEntrance(page, true);
  await page.getByRole('button', { name: '种下这颗种子' }).click(); await page.clock.runFor(400);
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await expect(page.locator('.seed-onboarding')).toHaveAttribute('data-paused', 'true');
  await expect(page.locator('.seed-flight')).toHaveCSS('animation-play-state', 'paused');
  await page.clock.runFor(10000); expect((await saved(page, info)).seedPlanted).toBe(false);
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  const viewport = page.viewportSize()!; await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.seed-onboarding')).toHaveAttribute('data-paused', 'true');
  await page.clock.runFor(10000); expect((await saved(page, info)).seedPlanted).toBe(false);
  await page.setViewportSize(viewport); await expect(page.locator('.seed-onboarding')).toHaveAttribute('data-paused', 'false');
  await page.reload(); await finishOpening(page, true); await finishSceneEntrance(page, true);
  await expect(page.locator('.seed-onboarding')).toHaveAttribute('data-phase', 'waiting');
  await expect(page.locator('.dialogue-bubble')).toHaveCount(0);
  await page.getByRole('button', { name: '种下这颗种子' }).press('Enter'); await page.clock.runFor(1200);
  expect((await saved(page, info)).seedPlanted).toBe(true);
  await page.reload(); await finishOpening(page, true); await finishSceneEntrance(page, true);
  await expect(page.locator('.seed-onboarding')).toHaveCount(0); await expect(page.locator('.dialogue-bubble[data-speaker=tree]')).toBeVisible();
});
