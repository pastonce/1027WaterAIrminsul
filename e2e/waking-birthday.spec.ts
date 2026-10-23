import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { stageFixture } from '../src/dev/fixtures';
import type { GameSave } from '../src/types/game';
import { finishOpening } from './opening-support';
import { mockServerTime } from './time-support';
import { openSettings } from './settings-support';

const OPEN = '2026-10-27T10:27:00+08:00';
const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => { const list: string[] = []; errors.set(page, list); page.on('pageerror', (error) => list.push(error.message)); });
test.afterEach(({ page }) => { expect(errors.get(page)).toEqual([]); });
const key = (info: TestInfo) => info.project.name.startsWith('production') ? 'irminsul.player.v2' : 'irminsul.development.v2';
async function saved(page: Page, info: TestInfo): Promise<GameSave> { return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), key(info)); }
async function launch(page: Page, info: TestInfo, stage: 'F' | 'G' = 'G', reduced = false) {
  await mockServerTime(page, OPEN);
  const now = new Date(OPEN); await page.clock.install({ time: now }); await page.clock.pauseAt(new Date(now.getTime() + 1000));
  const fixture = stageFixture(stage, now.getTime());
  const save = { ...fixture, ...(stage === 'F' ? { growth: 1028, completedVisits: [...fixture.completedVisits, 'visit-F', 'visit-F-2'] } : {}), settings: { ...fixture.settings, reducedMotion: reduced } };
  await page.addInitScript(({ save, key, date }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(save));
    sessionStorage.setItem('irminsul.development.clock', JSON.stringify({ offset: Date.parse(date) - Date.now(), simulated: true }));
    Math.random = () => 0.99;
  }, { save, key: key(info), date: OPEN });
  await page.goto('/'); await finishOpening(page, true);
  if (stage === 'G') {
    await expect(page.getByTestId('reality-scene')).toBeVisible();
    await expect.poll(async () => { await page.clock.runFor(50); return page.locator('.nahida-avatar').getAttribute('data-renderer'); }, { timeout: 20000 }).toMatch(/ready|fallback/);
  }
  else await expect(page.locator('.background-scenery')).toHaveAttribute('data-renderer', /ready|static|fallback/, { timeout: 20000 });
}
async function until(page: Page, condition: () => Promise<boolean>, limit = 60000, step = 100) {
  for (let elapsed = 0; elapsed < limit && !await condition(); elapsed += step) await page.clock.runFor(step);
  expect(await condition()).toBe(true);
}
async function picture(page: Page, info: TestInfo, name: string) {
  mkdirSync('artifacts/awakening', { recursive: true }); await page.screenshot({ path: `artifacts/awakening/${info.project.name}-${name}.png` });
}

test('G 页标题简化、两行按钮图标文字对齐，设置居中且没有手记', async ({ page }, info) => {
  const requests: string[] = []; page.on('request', (request) => { if (request.url().includes('/asserts/gifts/')) requests.push(request.url()); });
  await launch(page, info);
  await expect(page.locator('.reality-copy h1')).toHaveText('生日快乐纳西妲'); await expect(page.locator('.reality-date')).toHaveCount(0);
  const alignment = await page.locator('.reality-actions').evaluate((element) => [...element.querySelectorAll('button')].map((button) => {
    const icon = button.querySelector('svg')!.getBoundingClientRect();
    const range = document.createRange(); const text = [...button.childNodes].find((node) => node.nodeType === Node.TEXT_NODE)!; range.selectNodeContents(text);
    const bounds = range.getBoundingClientRect(); return { icon: icon.x, left: bounds.left, right: bounds.right };
  }));
  expect(alignment[0].icon).toBeCloseTo(alignment[1].icon, 1); expect(alignment[0].left).toBeCloseTo(alignment[1].left, 1); expect(alignment[0].right).toBeCloseTo(alignment[1].right, 1);
  expect(requests.map((url) => new URL(url).pathname).sort()).toEqual(['/asserts/gifts/date-candy.png', '/asserts/gifts/halvamazd.png']);
  await expect(page.locator('.birthday-offering, img[src*="/asserts/gifts/"]')).toHaveCount(0); await picture(page, info, 'g-page');
  await openSettings(page); const panel = page.getByRole('dialog', { name: '设置', exact: true });
  await expect(panel).toBeVisible(); await expect(panel.getByRole('heading', { name: '设置' })).toHaveCSS('text-align', 'center');
  await expect(panel.locator('.eyebrow, .journal-tools, .dialogue-archive, .secret-form')).toHaveCount(0);
  await expect(panel.getByRole('button', { name: '梦境手记' })).toHaveCount(0);
  await expect(panel.getByRole('slider', { name: '背景音乐音量', exact: true })).toBeVisible(); await picture(page, info, 'settings');
});

test('送礼与丰富彩雨同步，匀速下落不突变，整段结束后二十秒才闲置', async ({ page }, info) => {
  await launch(page, info); await page.getByRole('button', { name: '送上生日祝福', exact: true }).click();
  const offering = page.getByTestId('birthday-offering'); await expect(offering).toHaveAttribute('data-phase', 'gifting');
  await expect(page.locator('.dialogue-bubble')).toHaveAttribute('data-speaker', 'user');
  await expect(offering.locator('img')).toHaveCount(2);
  await expect.poll(() => offering.locator('img').evaluateAll((images) => images.every((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  const pieces = await offering.locator('.birthday-falling').count(); expect(pieces).toBeGreaterThanOrEqual(76); expect(pieces).toBeLessThanOrEqual(168);
  await page.clock.runFor(1200); await picture(page, info, 'gifts-and-rain');
  await expect(page.locator('.dialogue-bubble')).toHaveAttribute('data-speaker', 'user');
  const movement = await offering.locator('.birthday-falling').evaluateAll((elements) => elements.map((element) => {
    const style = (element as HTMLElement).style;
    return { left: parseFloat(style.left), delay: parseFloat(style.getPropertyValue('--fall-delay')), drift: parseFloat(style.getPropertyValue('--fall-drift')), color: style.color };
  }));
  expect(new Set(movement.map((piece) => piece.delay)).size).toBe(pieces);
  expect(movement.some((piece, index) => index > 0 && piece.left < movement[index - 1].left)).toBe(true);
  expect(movement.some((piece) => piece.drift < 0) && movement.some((piece) => piece.drift > 0)).toBe(true);
  expect(new Set(movement.map((piece) => piece.color)).size).toBeGreaterThanOrEqual(10);
  const vertical = await offering.locator('.birthday-falling').first().evaluate((element) => {
    const animation = element.getAnimations().find((entry) => (entry as CSSAnimation).animationName === 'birthday-fall')!;
    const timing = animation.effect!.getTiming(); const original = animation.currentTime; const state = animation.playState;
    animation.pause();
    const drop = parseFloat((element as HTMLElement).style.getPropertyValue('--fall-drop'));
    const samples = [0.2, 0.43, 0.44, 0.45, 0.7].map((progress) => {
      animation.currentTime = Number(timing.delay) + Number(timing.duration) * progress;
      return { progress, actual: new DOMMatrix(getComputedStyle(element).transform).m42 / drop };
    });
    animation.currentTime = original; if (state !== 'paused') animation.play();
    return samples;
  });
  for (const sample of vertical) expect(sample.actual).toBeCloseTo(sample.progress, 3);
  const wish = (await saved(page, info)).pendingDialogues.find((entry) => entry.kind === 'wish')!;
  expect(wish.cursor).toBe(0); expect(wish.celebrationComplete).not.toBe(true);
  await openSettings(page); await page.clock.runFor(20000); await expect(offering).toHaveAttribute('data-paused', 'true');
  await expect(offering.locator('.birthday-drifting').first()).toHaveCSS('animation-play-state', 'paused');
  expect((await saved(page, info)).pendingDialogues.find((entry) => entry.id === wish.id)?.celebrationComplete).not.toBe(true);
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await until(page, async () => await offering.count() === 0, 6000);
  await until(page, async () => await page.locator('.dialogue-bubble[data-speaker=nahida]').count() === 1);
  await expect(page.locator('.dialogue-bubble')).toHaveAttribute('data-speaker', 'nahida');
  expect((await saved(page, info)).pendingDialogues.find((entry) => entry.id === wish.id)?.celebrationComplete).toBe(true); await picture(page, info, 'reply');
  await page.setViewportSize({ width: 640, height: 360 }); await expect(page.locator('.dialogue-bubble')).toBeInViewport(); await picture(page, info, 'reply-640'); await page.setViewportSize(info.project.use.viewport!);
  await until(page, async () => !(await saved(page, info)).pendingDialogues.some((entry) => entry.kind === 'wish'));
  await page.clock.runFor(19000); await expect(page.locator('.dialogue-bubble')).toHaveCount(0);
  await page.clock.runFor(1000); await expect(page.locator('.dialogue-bubble')).toHaveAttribute('data-speaker', 'nahida');
});

test('减少动态时送礼和彩雨同步静态淡入淡出，不补第二场彩雨', async ({ page }, info) => {
  await launch(page, info, 'G', true); await page.getByRole('button', { name: '送上生日祝福', exact: true }).click();
  const offering = page.getByTestId('birthday-offering'); await expect(offering).toHaveAttribute('data-reduced', 'true');
  await expect(offering.locator('img')).toHaveCount(2); await expect(offering.locator('.birthday-falling')).toHaveCount(12);
  await expect(offering.locator('.birthday-drifting').first()).toHaveCSS('animation-name', 'none');
  await page.clock.runFor(650); await expect(offering).toHaveCount(0); await expect(page.locator('.dialogue-bubble')).toHaveAttribute('data-speaker', 'user');
  await until(page, async () => await page.locator('.dialogue-bubble[data-speaker=nahida]').count() === 1); await expect(offering).toHaveCount(0);
});

test('F→G 插图后黑屏，两次逐渐睁眼，第三次完整醒来才可交互', async ({ page }, info) => {
  test.setTimeout(90000); await launch(page, info, 'F');
  await until(page, async () => await page.getByTestId('stage-loading').count() > 0);
  const waking = page.getByTestId('waking-reveal'); await expect(waking).toHaveCount(1);
  await until(page, async () => await page.getByTestId('stage-loading').count() === 0, 20000);
  await expect(waking).toHaveAttribute('data-phase', 'black'); await expect(page.locator('.game-content')).toHaveAttribute('inert', '');
  expect((await saved(page, info)).sceneStage).toBe('F'); await picture(page, info, 'black');
  await until(page, async () => await waking.getAttribute('data-phase') === 'first-hold', 3000, 25); await expect(page.locator('.reality-character')).toHaveCSS('opacity', '1'); await picture(page, info, 'first-blink');
  await page.locator('.reality-character').dispatchEvent('click'); expect((await saved(page, info)).sceneStage).toBe('F'); await expect(page.locator('.dialogue-bubble')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 }); await page.clock.runFor(15000);
  await expect(waking).toHaveAttribute('data-paused', 'true'); await expect(page.getByRole('button', { name: /开启横屏体验/ })).toBeVisible();
  await page.setViewportSize(info.project.use.viewport!);
  await until(page, async () => await waking.getAttribute('data-phase') === 'second-hold', 4500, 25); await picture(page, info, 'second-blink');
  await until(page, async () => await waking.getAttribute('data-phase') === 'settling', 4500, 25); await picture(page, info, 'fully-awake');
  await until(page, async () => await waking.count() === 0, 1000);
  expect((await saved(page, info)).sceneStage).toBe('G'); await expect(page.locator('.game-content')).not.toHaveAttribute('inert');
  await expect(page.getByRole('button', { name: '和纳西妲聊天', exact: true })).toBeEnabled(); await expect(page.locator('.dialogue-bubble')).toHaveAttribute('data-speaker', 'nahida');
});

test('减少动态的梦醒不反复眨眼；既有 G 刷新不重新梦醒', async ({ page }, info) => {
  await launch(page, info, 'F', true); await until(page, async () => await page.getByTestId('stage-loading').count() > 0);
  await until(page, async () => await page.getByTestId('stage-loading').count() === 0, 20000, 50);
  const waking = page.getByTestId('waking-reveal'); await expect(waking).toHaveAttribute('data-reduced', 'true'); await expect(waking).toHaveAttribute('data-phase', 'final-opening');
  await until(page, async () => await waking.count() === 0, 1000);
  await page.reload(); await finishOpening(page, true); await expect(waking).toHaveCount(0); await expect(page.getByTestId('stage-loading')).toHaveCount(0);
  expect((await saved(page, info)).sceneStage).toBe('G');
});
