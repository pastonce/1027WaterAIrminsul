import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import { stageFixture } from '../src/dev/fixtures';
import type { GameSave, StageId } from '../src/types/game';
import { finishOpening } from './opening-support';
import { mockServerTime } from './time-support';
import { openSettings } from './settings-support';
import { mkdirSync } from 'node:fs';
import { OPENING_RULES } from '../src/game/opening/choreography';

const OPEN = '2026-10-27T10:27:00+08:00';
const keyFor = (info: TestInfo) => info.project.name.startsWith('production') ? 'irminsul.player.v2' : 'irminsul.development.v2';
async function launch(page: Page, info: TestInfo, stage: StageId = 'C', patch: Partial<GameSave> = {}) {
  await mockServerTime(page, OPEN);
  const now = new Date(OPEN); await page.clock.install({ time: now }); await page.clock.pauseAt(new Date(now.getTime() + 1000));
  const fixture = { ...stageFixture(stage, now.getTime()), ...patch };
  await page.addInitScript(({ key, fixture, date }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(fixture));
    sessionStorage.setItem('irminsul.development.clock', JSON.stringify({ offset: Date.parse(date) - Date.now(), simulated: true }));
    Math.random = () => .99;
  }, { key: keyFor(info), fixture, date: OPEN });
  await page.goto('/'); await finishOpening(page, true); await page.clock.runFor(10000);
}
async function saved(page: Page, info: TestInfo): Promise<GameSave> { return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), keyFor(info)); }
async function avatarReady(page: Page) { await expect.poll(async () => { await page.clock.runFor(50); return page.locator('.nahida-avatar').getAttribute('data-renderer'); }, { timeout: 20000 }).toBe('ready'); }

test('隐藏键盘代码、40颗额外梦露、形象开关、正确反馈和手机空输入框', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await launch(page, info, 'C');
  await expect(page.locator('.game-brand .build-marker')).toHaveText('（开发测试中）');
  await page.keyboard.type('RaInStOrM'); await expect(page.locator('[data-dew-kind=rainstorm]')).toHaveCount(40);
  await page.keyboard.type('ArAnArA'); await expect(page.locator('.creature-roaming')).toHaveCount(1);
  await page.keyboard.type('NaHiDa'); await avatarReady(page);
  await page.keyboard.type('NiDaHa'); await expect(page.locator('.nahida-avatar')).toHaveAttribute('data-renderer', 'placeholder');
  await expect(page.locator('.nahida-avatar .character-static')).toHaveAttribute('src', '/asserts/characters/nahida-placeholder.svg');
  await page.keyboard.type('NIDAHA'); await avatarReady(page);
  await page.clock.runFor(3000); await expect(page.locator('.secret-toast')).toHaveCount(0);
  await openSettings(page);
  const input = page.locator('.hidden-code-entry input'); await expect(input).toBeVisible();
  expect(await input.getAttribute('placeholder')).toBeNull();
  await input.fill('wrong-code'); await input.press('Enter'); await expect(page.locator('.secret-toast')).toHaveCount(0);
  await input.fill('RAINSTORM'); await expect(input).toHaveValue(''); await expect(page.locator('.secret-toast')).toHaveText('梦露落成了一场细雨。');
  expect(await page.locator('.secret-toast').evaluate((element) => element.parentElement === document.body)).toBe(true);
  await page.getByRole('button', { name: '关闭', exact: true }).click(); await expect(page.locator('[data-dew-kind=rainstorm]')).toHaveCount(40);
  expect((await saved(page, info)).dew).toBe(13);
  mkdirSync('docs/screenshots/secrets', { recursive: true }); await page.screenshot({ path: `docs/screenshots/secrets/rain-${info.project.name}.png` });
  expect(errors).toEqual([]);
});

test('test 切段和改时间只作用于内存，刷新后退出并恢复原进度', async ({ page }, info) => {
  await launch(page, info, 'D');
  const before = await saved(page, info);
  const time = await page.evaluate(() => sessionStorage.getItem('irminsul.development.clock'));
  if (info.project.name.startsWith('production')) await expect(page.locator('.debug-panel')).toHaveCount(0);
  await page.keyboard.type('tEsT'); await expect(page.locator('.game-app')).toHaveAttribute('data-testing', 'true');
  await expect.poll(async () => { await page.clock.runFor(100); return page.locator('.debug-panel').count(); }).toBe(1);
  await page.locator('.debug-panel > summary').click();
  await expect(page.getByText('本页测试 · 内存存档，刷新后退出', { exact: true })).toBeVisible();
  await expect(page.locator('.bubble-dialogue-id')).toHaveCount(1);
  await page.getByRole('button', { name: '调试切换到G阶段' }).click(); await expect(page.getByTestId('reality-scene')).toBeVisible();
  await page.keyboard.type('Nidaha'); await expect(page.locator('.reality-character .nahida-avatar')).toHaveAttribute('data-renderer', 'placeholder');
  await page.getByRole('button', { name: '调试切换到B阶段' }).click();
  await expect(page.getByTestId('debug-stage')).toHaveText('B');
  await page.getByLabel('调试梦露', { exact: true }).fill('6');
  expect(await saved(page, info)).toEqual(before); expect(await page.evaluate(() => sessionStorage.getItem('irminsul.development.clock'))).toBe(time);
  mkdirSync('docs/screenshots/secrets', { recursive: true }); await page.screenshot({ path: `docs/screenshots/secrets/test-${info.project.name}.png` });
  await page.reload(); await finishOpening(page, true);
  await expect(page.locator('.game-app')).toHaveAttribute('data-testing', 'false');
  expect((await saved(page, info)).sceneStage).toBe('D'); expect((await saved(page, info)).growth).toBe(before.growth);
});

test('开场等候真实预载、缓转、不可交互、无批量GL，完成后缓存跨刷新复用', async ({ page }, info) => {
  await mockServerTime(page, OPEN); const now = new Date(OPEN);
  await page.clock.install({ time: now }); await page.clock.pauseAt(new Date(now.getTime() + 1000));
  let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/asserts/backgrounds/festival/image_2_14.png', async (route) => { await held; await route.continue(); });
  const requested: string[] = []; page.on('request', (request) => requested.push(new URL(request.url()).pathname));
  await page.goto('/'); await expect(page.locator('.opening-shell')).toHaveAttribute('data-opening-mode', 'playing');
  await page.clock.runFor(OPENING_RULES.arriveMs);
  const shell = page.locator('.opening-shell'); await expect(shell).toHaveAttribute('data-opening-phase', 'loading');
  await expect(page.getByRole('progressbar', { name: '梦境准备' })).toBeVisible();
  await expect(page.locator('.opening-content')).toHaveAttribute('inert', ''); await expect(page.locator('canvas')).toHaveCount(0);
  await page.clock.runFor(2000); await expect(shell).toHaveAttribute('data-opening-phase', 'loading');
  const spin = await page.locator('.opening-flight').evaluate((element) => element.getAnimations().find((animation) => animation.effect?.getTiming().iterations === Infinity)?.effect?.getTiming());
  expect(spin?.duration).toBe(4000);
  expect(requested.some((url) => url.includes('/music/'))).toBe(false); expect(requested.some((url) => url.includes('irminsul-extended'))).toBe(false);
  release(); await finishOpening(page, true);
  await expect(shell).toHaveAttribute('data-preload-failed', '0'); await expect(page.locator('.intro-brand .build-marker')).toHaveText('（开发测试中）');
  await expect(page.locator('.opening-overlay')).toHaveCount(0);
  expect(requested.filter((url) => url.includes('/loading/art/'))).toHaveLength(6);
  const firstChoices = (await saved(page, info)).loadingArtChoices;
  const count = requested.filter((url) => url.endsWith('/festival/image_2_14.png')).length;
  await page.reload(); await finishOpening(page, true);
  expect(requested.filter((url) => url.endsWith('/festival/image_2_14.png')).length).toBe(count);
  expect((await saved(page, info)).loadingArtChoices).toEqual(firstChoices);
});

test('阶段限制不提示错误，G 形象开关保持，其余不适用代码静默', async ({ page }, info) => {
  await launch(page, info, 'G');
  for (const code of ['Aranara', 'Rainstorm', 'Nahida']) await page.keyboard.type(code);
  await expect(page.locator('.secret-toast')).toHaveCount(0); await expect(page.locator('.dew-particle, .creature-roaming')).toHaveCount(0);
  await page.keyboard.type('Nidaha'); await expect(page.locator('.nahida-avatar')).toHaveAttribute('data-renderer', 'placeholder');
  await page.keyboard.type('nidaha'); await avatarReady(page);
});

test('开放前手机也可从首屏设置输入test，不提前入梦或覆盖正式进度', async ({ page }, info) => {
  const date = '2026-10-24T10:27:00+08:00'; await mockServerTime(page, date);
  const now = new Date(date); await page.clock.install({ time: now }); await page.clock.pauseAt(new Date(now.getTime() + 1000));
  await page.addInitScript(({ key, fixture, date }) => {
    localStorage.setItem(key, JSON.stringify(fixture));
    sessionStorage.setItem('irminsul.development.clock', JSON.stringify({ offset: Date.parse(date) - Date.now(), simulated: true }));
  }, { key: keyFor(info), fixture: { ...stageFixture('A', now.getTime()), introSeen: false }, date });
  await page.goto('/'); await finishOpening(page, true); await openSettings(page);
  await expect(page.getByRole('dialog', { name: '设置' })).toBeVisible();
  await expect(page.getByTestId('dream-scene')).toHaveCount(0); await expect(page.locator('canvas')).toHaveCount(0);
  await page.locator('.hidden-code-entry input').fill('test');
  await expect(page.locator('.game-app')).toHaveAttribute('data-testing', 'true');
  await expect(page.getByTestId('dream-scene')).toHaveCount(1);
  expect((await saved(page, info)).introSeen).toBe(false); expect((await saved(page, info)).growth).toBe(0);
});
