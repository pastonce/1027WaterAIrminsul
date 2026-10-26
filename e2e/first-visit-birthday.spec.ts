import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { stageFixture } from '../src/dev/fixtures';
import { FIRST_NOTICE_KEY } from '../src/game/notice/firstVisit';
import { WAKING_DURATION_MS } from '../src/game/awakening/choreography';
import { PRESENTATION_RULES } from '../src/data/presentation';
import { DIALOGUE_ENTRIES } from '../src/data/dialogues';
import type { GameSave, StageId } from '../src/types/game';
import { finishOpening } from './opening-support';
import { finishSceneEntrance } from './scene-support';
import { mockServerTime } from './time-support';

const OPEN = '2026-10-27T13:27:00+08:00';
const CLOSED = '2026-10-24T10:27:00+08:00';
const errors = new WeakMap<Page, string[]>();
const key = (info: TestInfo) => info.project.name.startsWith('production') ? 'irminsul.player.v2' : 'irminsul.development.v2';
test.beforeEach(({ page }) => { const list: string[] = []; errors.set(page, list); page.on('pageerror', (error) => list.push(error.message)); });
test.afterEach(({ page }) => { expect(errors.get(page)).toEqual([]); });

async function prepare(page: Page, info: TestInfo, stage: StageId, date: string, intro = false) {
  await mockServerTime(page, date); const now = new Date(date); await page.clock.install({ time: now }); await page.clock.pauseAt(new Date(now.getTime() + 1000));
  const fixture = stageFixture(stage, now.getTime());
  await page.addInitScript(({ save, key, date }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(save));
    sessionStorage.setItem('irminsul.development.clock', JSON.stringify({ offset: Date.parse(date) - Date.now(), simulated: true }));
    Math.random = () => .99;
  }, { save: { ...fixture, introSeen: !intro, completedVisits: [...fixture.completedVisits, `visit-${stage}`, `visit-${stage}-2`], dialogueDecks: { 'A/normal': ['A01', 'A02', 'A03'] } }, key: key(info), date });
  await page.goto('/');
}
async function saved(page: Page, info: TestInfo): Promise<GameSave> { return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), key(info)); }
async function until(page: Page, condition: () => Promise<boolean>, maximum = 30000, step = 50) { for (let elapsed = 0; elapsed < maximum && !await condition(); elapsed += step) await page.clock.runFor(step); expect(await condition()).toBe(true); }
async function picture(page: Page, info: TestInfo, name: string) { mkdirSync('artifacts/first-visit-birthday', { recursive: true }); await page.screenshot({ path: `artifacts/first-visit-birthday/${info.project.name}-${name}.png` }); }

test('首访加载和揭幕完成才自动公告，刷新 / 重置不重复，入口仍可手动查看', async ({ page }, info) => {
  await prepare(page, info, 'A', CLOSED, true);
  await expect(page.locator('.opening-shell')).toHaveAttribute('data-opening', 'true'); await expect(page.locator('.notice-modal')).toHaveCount(0);
  expect(await page.evaluate((key) => localStorage.getItem(key), FIRST_NOTICE_KEY)).toBeNull();
  await finishOpening(page, true, false); const notice = page.locator('.notice-modal'); await expect(notice).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), FIRST_NOTICE_KEY)).toBe('1'); await expect(page.getByTestId('dream-scene')).toHaveCount(0); await picture(page, info, 'first-announcement');
  await page.setViewportSize({ width: 390, height: 844 }); await page.clock.runFor(10000); await expect(notice).toHaveCount(0); await expect(page.getByRole('button', { name: /开启横屏体验/ })).toBeVisible();
  await page.setViewportSize(info.project.use.viewport!); await page.clock.runFor(100); await expect(notice).toBeVisible(); await page.keyboard.press('Escape'); await expect(notice).toHaveCount(0);
  await page.reload(); await finishOpening(page, true, false); await expect(notice).toHaveCount(0);
  await page.getByRole('button', { name: '设置', exact: true }).click(); await page.getByRole('button', { name: '开始下一轮梦的轮回', exact: true }).click(); await page.getByRole('button', { name: '再次点击，清除当前存档并重新入梦', exact: true }).click(); await expect(notice).toHaveCount(0);
  await page.getByRole('button', { name: '公告与声明', exact: true }).click(); await expect(notice).toBeVisible();
});

test('Birthday 开放前也可本页预览 FG 加载和六秒梦醒，刷新恢复原存档', async ({ page }, info) => {
  await prepare(page, info, 'C', CLOSED); await finishOpening(page, true);
  const original = await page.evaluate((key) => localStorage.getItem(key), key(info)); const before = await saved(page, info);
  const clock = await page.evaluate(() => sessionStorage.getItem('irminsul.development.clock'));
  if (info.project.use.isMobile) { await page.getByRole('button', { name: '设置', exact: true }).click(); await page.locator('.hidden-code-entry input').fill('BiRtHdAy'); }
  else await page.keyboard.type('bIrThDaY');
  await expect(page.locator('.game-app')).toHaveAttribute('data-previewing', 'true');
  const loading = page.getByTestId('stage-loading'); await expect(loading).toBeVisible(); await expect(loading).toHaveAttribute('data-art', 'G'); await expect(page.locator('.stage-loading-art')).toHaveAttribute('data-illustration', 'FG1'); await picture(page, info, 'birthday-loading');
  expect(await page.evaluate((key) => localStorage.getItem(key), key(info))).toBe(original);
  await until(page, async () => await loading.count() === 0); const waking = page.getByTestId('waking-reveal'); await expect(waking).toHaveAttribute('data-phase', 'black');
  await expect(page.locator('.game-content')).toHaveAttribute('inert', '');
  await page.clock.runFor(WAKING_DURATION_MS - 100); await expect(waking).toHaveCount(1); await page.clock.runFor(100); await expect(waking).toHaveCount(0);
  await expect(page.getByTestId('reality-scene')).toBeVisible(); await expect(page.getByRole('button', { name: '送上生日祝福', exact: true })).toBeEnabled(); await picture(page, info, 'birthday-preview');
  await page.getByRole('button', { name: '设置', exact: true }).click(); await expect(page.locator('.save-note')).toContainText('本页生日预览'); await page.keyboard.press('Escape');
  expect(await page.evaluate((key) => localStorage.getItem(key), key(info))).toBe(original); expect(await page.evaluate(() => sessionStorage.getItem('irminsul.development.clock'))).toBe(clock);
  await page.reload(); await finishOpening(page, true); await expect(page.locator('.game-app')).toHaveAttribute('data-previewing', 'false'); await expect(page.getByTestId('reality-scene')).toHaveCount(0);
  const restored = await saved(page, info); expect(restored.growth).toBe(before.growth); expect(restored.sceneStage).toBe(before.sceneStage); expect(restored.endingComplete).toBe(before.endingComplete);
});

test('连续浇灌立即替换树回应而不积压，最后一句停留仅1400ms再渐隐', async ({ page }, info) => {
  await prepare(page, info, 'A', OPEN); await finishOpening(page, true); await finishSceneEntrance(page, true);
  const water = page.getByRole('button', { name: '浇灌梦中的树', exact: true }); const bubble = page.locator('.dialogue-bubble');
  await water.click(); await page.mouse.move(1, 1); const first = (await saved(page, info)).pendingWaterings[0];
  await expect(bubble).toHaveAttribute('data-segment', '1'); expect(DIALOGUE_ENTRIES[first.dialogueId].text.startsWith(await bubble.locator('.bubble-text .sr-only').innerText())).toBe(true);
  await page.clock.runFor(1400); await page.keyboard.type('Rainstorm');
  for (let attempt = 0; attempt < 8 && (await saved(page, info)).dew < 13; attempt++) await page.locator('[data-dew-kind=rainstorm]:enabled').first().click({ force: true });
  expect((await saved(page, info)).dew).toBe(13); await water.click(); await page.mouse.move(1, 1);
  const save = await saved(page, info); expect(save.pendingWaterings).toHaveLength(1); expect(save.pendingWaterings[0].id).toBeGreaterThan(first.id);
  await expect(bubble).toHaveAttribute('data-segment', '1'); expect(DIALOGUE_ENTRIES[save.pendingWaterings[0].dialogueId].text.startsWith(await bubble.locator('.bubble-text .sr-only').innerText())).toBe(true); await picture(page, info, 'latest-tree-reply');
  await until(page, async () => await bubble.getAttribute('data-phase') === 'holding' && await bubble.getAttribute('data-segment') === await bubble.getAttribute('data-segments'), 10000, 25);
  await page.clock.runFor(PRESENTATION_RULES.minimumHoldMs - 26); await expect(bubble).toHaveAttribute('data-phase', 'holding'); await page.clock.runFor(26); await expect(bubble).toHaveAttribute('data-phase', 'fading');
  await page.clock.runFor(PRESENTATION_RULES.fadeMs); await expect(bubble).toHaveCount(0); expect((await saved(page, info)).pendingWaterings).toEqual([]);
});
