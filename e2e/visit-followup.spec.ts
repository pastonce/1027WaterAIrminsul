import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dialoguePool } from '../src/data/dialogues';
import { stageFixture } from '../src/dev/fixtures';
import type { GameSave } from '../src/types/game';
import { finishOpening } from './opening-support';
import { finishSceneEntrance } from './scene-support';
import { mockServerTime } from './time-support';

const OPEN = '2026-10-27T10:27:00+08:00';
const errors = new WeakMap<Page, string[]>();
const key = (info: TestInfo) => info.project.name.startsWith('production') ? 'irminsul.player.v2' : 'irminsul.development.v2';
const readSave = (page: Page, info: TestInfo) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!) as GameSave, key(info));
test.beforeEach(({ page }) => { const list: string[] = []; errors.set(page, list); page.on('pageerror', (error) => list.push(error.message)); });
test.afterEach(({ page }) => expect(errors.get(page)).toEqual([]));
async function launch(page: Page, info: TestInfo) {
  await mockServerTime(page, OPEN); const now = new Date(OPEN);
  await page.clock.install({ time: now }); await page.clock.pauseAt(new Date(now.getTime() + 1000));
  const fixture = stageFixture('A', now.getTime());
  await page.addInitScript(({ save, key, date }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(save));
    sessionStorage.setItem('irminsul.development.clock', JSON.stringify({ offset: Date.parse(date) - Date.now(), simulated: true }));
    Math.random = () => .99;
  }, { save: { ...fixture, pendingVisits: ['visit-A'], visitLines: { 'visit-A': { dialogueId: dialoguePool('A/nahida')[0].id, read: false } }, visitPositions: { 'visit-A': 1 } }, key: key(info), date: OPEN });
  await page.goto('/'); await finishOpening(page, true); await finishSceneEntrance(page, true);
  await until(page, async () => await page.locator('.nahida-companion').count() === 1, 20000);
  await page.clock.runFor(700);
}
async function until(page: Page, condition: () => Promise<boolean>, maximum = 40000) {
  for (let elapsed = 0; elapsed < maximum && !await condition(); elapsed += 50) await page.clock.runFor(50);
  expect(await condition()).toBe(true);
}

test('点击来访角色预约一次新台词与表情，原祝福完整完成，追加对白不会被浇灌打断', async ({ page }, info) => {
  await launch(page, info);
  const button = page.getByRole('button', { name: '和纳西妲说话', exact: true });
  await expect(button).toBeEnabled(); await button.click(); await expect(button).toBeDisabled();
  const extra = (await readSave(page, info)).visitLines['visit-A'].followup!;
  expect(extra.dialogueId).not.toBe(dialoguePool('A/nahida')[0].id); expect([1, 2, 4, 5, 6, 7]).toContain(extra.expression);
  await until(page, async () => (await readSave(page, info)).completedVisits.includes('visit-A'));
  const bubble = page.locator('.dialogue-bubble[data-speaker=nahida]');
  const text = dialoguePool('A/nahida').find((entry) => entry.id === extra.dialogueId)!.text;
  await expect.poll(async () => text.startsWith(await bubble.locator('.bubble-text .sr-only').innerText())).toBe(true);
  const expression = page.locator('.expression-pop[data-anchor=nahida]');
  await expect(expression).toHaveAttribute('data-expression', String(extra.expression)); await expect(expression).toHaveAttribute('data-placed', 'true');
  await expect(expression).toHaveAttribute('data-ready', 'true'); await expect(expression).toBeInViewport();
  const growth = (await readSave(page, info)).growth; expect(growth).toBe(21);
  mkdirSync('artifacts/visit-followup', { recursive: true }); await page.screenshot({ path: `artifacts/visit-followup/${info.project.name}-expression.png` });
  await page.getByRole('button', { name: '浇灌梦中的树', exact: true }).click();
  expect(text.includes(await bubble.locator('.bubble-text .sr-only').innerText())).toBe(true);
  await until(page, async () => (await readSave(page, info)).visitLines['visit-A'].followup?.read === true);
  const saved = await readSave(page, info); expect(saved.blessedVisits.filter((id) => id === 'visit-A')).toHaveLength(1); expect(saved.growth).toBe(growth + 13);
});

test('停留期可用键盘追加一次，设置暂停与刷新恢复均不重抽或重复祝福', async ({ page }, info) => {
  await launch(page, info);
  await until(page, async () => (await readSave(page, info)).completedVisits.includes('visit-A'));
  const button = page.getByRole('button', { name: '和纳西妲说话', exact: true });
  await button.focus(); await page.keyboard.press('Enter');
  const extra = (await readSave(page, info)).visitLines['visit-A'].followup!;
  await page.getByRole('button', { name: '设置', exact: true }).click(); await page.clock.runFor(30000);
  expect((await readSave(page, info)).visitLines['visit-A'].followup?.read).toBe(false);
  await page.keyboard.press('Escape'); await page.reload(); await finishOpening(page, true); await finishSceneEntrance(page, true);
  const text = dialoguePool('A/nahida').find((entry) => entry.id === extra.dialogueId)!.text;
  await until(page, async () => await page.locator('.dialogue-bubble[data-speaker=nahida]').count() === 1 && text.includes(await page.locator('.dialogue-bubble .bubble-text .sr-only').innerText()));
  await expect(page.getByRole('button', { name: '和纳西妲说话', exact: true })).toBeDisabled();
  expect((await readSave(page, info)).growth).toBe(21);
  expect((await readSave(page, info)).visitLines['visit-A'].followup).toEqual(extra);
});
