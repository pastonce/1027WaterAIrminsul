import { openSettings } from './settings-support';
import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { DIALOGUE_ENTRIES, dialoguePool } from '../src/data/dialogues';
import { stageFixture } from '../src/dev/fixtures';
import { STAGES } from '../src/data/stages';
import type { GameSave, StageId } from '../src/types/game';
import { finishOpening } from './opening-support';
import { finishSceneEntrance } from './scene-support';
import { mockServerTime } from './time-support';

const OPEN = '2026-10-27T13:27:00+08:00';
const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => { const errors: string[] = []; pageErrors.set(page, errors); page.on('pageerror', (error) => errors.push(error.message)); });
test.afterEach(({ page }) => { expect(pageErrors.get(page)).toEqual([]); });
const key = (info: TestInfo) => info.project.name.startsWith('production') ? 'irminsul.player.v2' : 'irminsul.development.v2';
async function saved(page: Page, info: TestInfo): Promise<GameSave> { return page.evaluate((storageKey) => JSON.parse(localStorage.getItem(storageKey)!), key(info)); }
async function roll(page: Page, value: number) { await page.evaluate((value) => Reflect.set(window, '__dialogueRoll', value), value); }

async function launch(page: Page, info: TestInfo, stage: StageId = 'A', patch: Partial<GameSave> = {}, date = OPEN) {
  await mockServerTime(page, date);
  const now = new Date(OPEN); await page.clock.install({ time: now }); await page.clock.pauseAt(new Date(now.getTime() + 1000));
  const save = { ...stageFixture(stage, Date.parse(date)), ...patch };
  await page.addInitScript(({ save, storageKey, date }) => {
    if (!localStorage.getItem(storageKey)) localStorage.setItem(storageKey, JSON.stringify(save));
    sessionStorage.setItem('irminsul.development.clock', JSON.stringify({ offset: Date.parse(date) - Date.now(), simulated: true }));
    Reflect.set(window, '__dialogueRoll', 0.99); Math.random = () => Reflect.get(window, '__dialogueRoll');
  }, { save, storageKey: key(info), date });
  await page.goto('/'); await finishOpening(page, true); await finishSceneEntrance(page, true);
  if (stage === 'G') await expect(page.getByTestId('reality-scene')).toBeVisible();
  else await expect(page.locator('.background-scenery')).toHaveAttribute('data-renderer', /ready|static|fallback/);
}

async function until(page: Page, condition: () => Promise<boolean>, maximum = 60000) {
  for (let elapsed = 0; elapsed < maximum && !await condition(); elapsed += 250) await page.clock.fastForward(250);
  expect(await condition()).toBe(true);
}
async function drain(page: Page) { await until(page, async () => await page.locator('.dialogue-bubble, .nahida-companion').count() === 0); }
async function line(page: Page, pattern: RegExp) {
  const bubble = page.locator('.dialogue-bubble'); await expect(bubble).toBeVisible();
  const text = await bubble.locator('p .sr-only').textContent();
  const entry = Object.values(DIALOGUE_ENTRIES).find((entry) => !!text && entry.text.startsWith(text) && pattern.test(entry.id));
  expect(entry, `Expected ${pattern}, received ${text}`).toBeTruthy(); return entry!;
}
async function tree(page: Page) { await page.getByRole('button', { name: '梦中的树', exact: true }).press('Enter'); }
async function screenshot(page: Page, info: TestInfo, name: string) {
  mkdirSync('artifacts/dialogues', { recursive: true }); await page.screenshot({ path: `artifacts/dialogues/${info.project.name}-${name}.png` });
}

test('欢迎对白仅在测试显示原编号；树点击轮流抽取且不召来纳西妲', async ({ page }, info) => {
  await launch(page, info);
  await line(page, /^R01$/);
  const label = page.locator('.bubble-dialogue-id');
  if (info.project.name.startsWith('production')) await expect(label).toHaveCount(0);
  else { await expect(label).toHaveText('R01'); await expect(label).toHaveAttribute('aria-hidden', 'true'); }
  await drain(page); await roll(page, 0.01); await tree(page); const first = await line(page, /^A\d+$/);
  expect((await saved(page, info)).pendingVisits).toEqual([]); await drain(page); await tree(page);
  expect((await line(page, /^A\d+$/)).id).not.toBe(first.id);
  await screenshot(page, info, 'tree-bubble');
});

test('树点击共享剧情两次和机制一次配额，耗尽分支回落常态', async ({ page }, info) => {
  await launch(page, info); await drain(page); await roll(page, 0.12);
  const chosen = new Set<string>();
  for (let index = 0; index < 2; index++) { await tree(page); chosen.add((await line(page, /^A\dQ$/)).id); await drain(page); }
  expect(chosen.size).toBe(2); await tree(page); await line(page, /^A\d+$/); await drain(page);
  await roll(page, 0.18); await tree(page); await line(page, /^X\d+$/); await drain(page); await tree(page); await line(page, /^A\d+$/);
  expect((await saved(page, info)).dialogueCounts.A).toEqual({ story: 2, mechanism: 1 });
  const history = (await saved(page, info)).playedDialogues;
  for (const id of chosen) expect(history).toContain(id);
  await openSettings(page); await expect(page.getByRole('button', { name: '梦境手记', exact: true })).toHaveCount(0);
});

test('浇灌抽中来访只播放一句角色对白，随后祝福且不额外排树回应', async ({ page }, info) => {
  await launch(page, info); await drain(page); await roll(page, 0.01);
  await page.getByRole('button', { name: '浇灌梦中的树' }).click();
  await until(page, async () => await page.locator('.dialogue-bubble[data-speaker=nahida]').count() === 1);
  const entry = await line(page, /^A\dN$/); const save = await saved(page, info);
  expect(save.pendingWaterings).toEqual([]); expect(save.visitLines['visit-A'].dialogueId).toBe(entry.id);
  await expect.poll(async () => { await page.clock.runFor(50); return page.locator('.nahida-avatar').getAttribute('data-renderer'); }).toBe('ready');
  await page.clock.runFor(1200); await screenshot(page, info, 'visit-bubble');
  await until(page, async () => (await saved(page, info)).blessedVisits.includes('visit-A'));
  expect((await saved(page, info)).growth).toBe(34); await drain(page);
});

test('锁日期满额仍可观赏浇灌并抽上限提示，但不再来访或扣露', async ({ page }, info) => {
  await launch(page, info, 'C', { growth: STAGES.C.growth.end, dew: 13 }, '2026-10-25T10:27:00+08:00'); await drain(page); await roll(page, 0.3);
  await page.getByRole('button', { name: '浇灌梦中的树' }).click();
  await until(page, async () => await page.locator('.dialogue-bubble').count() === 1); await line(page, /^L\d+$/);
  expect((await saved(page, info)).growth).toBe(STAGES.C.growth.end); expect((await saved(page, info)).dew).toBe(13);
  expect((await saved(page, info)).pendingVisits).toEqual([]); await drain(page); await roll(page, 0.01);
  await page.getByRole('button', { name: '浇灌梦中的树' }).click(); await until(page, async () => await page.locator('.dialogue-bubble').count() === 1); await line(page, /^C\d+$/);
  expect((await saved(page, info)).pendingVisits).toEqual([]);
});

test('六十秒闲置才说话，点击重置，设置内不偷走闲置时间', async ({ page }, info) => {
  await launch(page, info); await drain(page); await page.mouse.click(20, 120); await page.clock.fastForward(59000);
  await expect(page.locator('.dialogue-bubble')).toHaveCount(0);
  await openSettings(page); await page.clock.fastForward(120000);
  expect((await saved(page, info)).pendingDialogues.filter((entry) => entry.kind === 'idle')).toEqual([]);
  await page.getByRole('button', { name: '关闭', exact: true }).click(); await page.clock.fastForward(59000);
  await expect(page.locator('.dialogue-bubble')).toHaveCount(0); await page.clock.fastForward(1000); await line(page, /^I\d+$/);
});

test('转场对白在插图和新背景加载结束之后播放，使用目标阶段编号', async ({ page }, info) => {
  let release!: () => void; const waiting = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/backgrounds/dunes/*.json', async (route) => { await waiting; await route.continue().catch(() => {}); });
  await launch(page, info, 'A', { growth: 211, completedVisits: ['visit-A', 'visit-A-2'] }); await line(page, /^R01$/);
  await until(page, async () => await page.getByTestId('stage-loading').count() === 1);
  const pending = (await saved(page, info)).pendingDialogues.find((entry) => entry.kind === 'transition')!;
  expect(pending.from).toBe('A'); expect(pending.lines).toEqual(['B3Z']);
  await page.clock.runFor(6500); await expect(page.locator('.dialogue-bubble')).toHaveCount(0);
  expect((await saved(page, info)).sceneStage).toBe('A'); release();
  await expect(page.locator('.background-scenery')).toHaveAttribute('data-renderer', /ready|static|fallback/);
  await until(page, async () => await page.getByTestId('stage-loading').count() === 0);
  await line(page, /^B3Z$/); expect((await saved(page, info)).sceneStage).toBe('B');
});

test('现实祝福先显示下方用户气泡，再由纳西妲回复，刷新不重抽用户句', async ({ page }, info) => {
  await launch(page, info, 'G'); await page.getByRole('button', { name: '送上生日祝福', exact: true }).click();
  const wish = await line(page, /^U\d+$/); await expect(page.locator('.dialogue-bubble')).toHaveAttribute('data-speaker', 'user');
  const bounds = (await page.locator('.dialogue-bubble').boundingBox())!; expect(bounds.y + bounds.height / 2).toBeGreaterThan(page.viewportSize()!.height * 0.65);
  await expect(page.getByRole('button', { name: '送上生日祝福', exact: true })).toBeDisabled(); await page.clock.runFor(1000); await screenshot(page, info, 'wish-bubble');
  await until(page, async () => await page.locator('.dialogue-bubble[data-speaker=nahida]').count() === 1);
  const reply = await line(page, /^N\d+$/); const before = await saved(page, info);
  expect(before.pendingDialogues.find((entry) => entry.kind === 'wish')?.cursor).toBe(1);
  await page.reload(); await finishOpening(page, true); await finishSceneEntrance(page, true); await line(page, new RegExp(`^${reply.id}$`));
  expect((await saved(page, info)).dialogueDecks['G/wish']).not.toContain(wish.id);
  await page.clock.runFor(2000); await screenshot(page, info, 'reply-bubble');
});

test('现实角色点击和二十秒闲置共用六句无放回对白，其他点击只重置计时', async ({ page }, info) => {
  await launch(page, info, 'G'); const character = page.getByRole('button', { name: '和纳西妲聊天', exact: true });
  await character.click(); const first = await line(page, /^G\dN$/); await drain(page);
  await page.mouse.click(20, 120); await page.clock.fastForward(19000); await expect(page.locator('.dialogue-bubble')).toHaveCount(0);
  await page.mouse.click(20, 120); await page.clock.fastForward(19000); await expect(page.locator('.dialogue-bubble')).toHaveCount(0);
  await page.clock.fastForward(1000); expect((await line(page, /^G\dN$/)).id).not.toBe(first.id);
  expect((await saved(page, info)).dialogueDecks['G/nahida']).toHaveLength(dialoguePool('G/nahida').length - 2);
});
