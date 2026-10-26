import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { stageFixture } from '../src/dev/fixtures';
import { SCHEDULE } from '../src/data/schedule';
import { finishOpening } from './opening-support';
import { finishSceneEntrance } from './scene-support';
import { mockServerTime } from './time-support';
import type { GameSave, StageId } from '../src/types/game';

const OPEN = SCHEDULE.at(-1)!.at;
const key = (info: TestInfo) => info.project.name.startsWith('production') ? 'irminsul.player.v2' : 'irminsul.development.v2';
const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => { const list: string[] = []; errors.set(page, list); page.on('pageerror', (error) => list.push(error.message)); });
test.afterEach(({ page }) => expect(errors.get(page)).toEqual([]));
async function launch(page: Page, info: TestInfo, stage: StageId, patch: Partial<GameSave> = {}) {
  const now = Date.parse(OPEN); const fixture = stageFixture(stage, now);
  await mockServerTime(page, OPEN); await page.clock.install({ time: new Date(now) }); await page.clock.pauseAt(new Date(now + 1000));
  await page.addInitScript(({ save, storage, now }) => {
    localStorage.setItem(storage, JSON.stringify(save)); localStorage.setItem('irminsul.notice.seen.v1', '1');
    sessionStorage.setItem('irminsul.development.clock', JSON.stringify({ offset: now - Date.now(), simulated: true }));
    Math.random = () => .99;
  }, { save: { ...fixture, ...patch, settings: { ...fixture.settings, music: false } }, storage: key(info), now });
  await page.goto('/'); await finishOpening(page, true); if (patch.introSeen !== false) await finishSceneEntrance(page, true);
  await page.mouse.move(1, 1);
}
async function saved(page: Page, info: TestInfo): Promise<GameSave> { return page.evaluate((storage) => JSON.parse(localStorage.getItem(storage)!), key(info)); }

for (const stage of ['A', 'G'] as const) test(`${stage}连续点击立即改播且只保留最新一句`, async ({ page }, info) => {
  await launch(page, info, stage);
  const button = page.getByRole('button', { name: stage === 'G' ? '和纳西妲聊天' : '梦中的树', exact: true });
  const ids: string[] = [];
  for (let index = 0; index < 3; index++) {
    await button.press('Enter');
    const save = await saved(page, info);
    const pending = stage === 'G' ? save.pendingDialogues.filter((entry) => entry.kind === 'reality') : save.pendingWaterings;
    expect(pending).toHaveLength(1);
    const id = 'dialogueId' in pending[0] ? pending[0].dialogueId : pending[0].lines[0]; ids.push(id);
    await expect(page.locator('.dialogue-bubble')).toHaveAttribute('data-phase', 'speaking');
    await page.clock.runFor(100);
    expect((await saved(page, info)).playedDialogues).not.toContain(id);
  }
  expect(new Set(ids).size).toBe(3);
  await expect(page.locator('.build-marker')).toHaveCount(0);
  expect((await saved(page, info)).playedDialogues).not.toContain(ids[0]);
  await page.clock.runFor(12000);
  const final = await saved(page, info);
  expect(final.playedDialogues).toContain(ids[2]); expect(final.playedDialogues).not.toContain(ids[1]);
});

test('手机新档首屏圆徽与种子在390、360、320高横屏完整可见', async ({ page }, info) => {
  await launch(page, info, 'A', { introSeen: false, seedPlanted: false, growth: 0, dew: 0 });
  for (const viewport of [{ width: 844, height: 390 }, { width: 640, height: 360 }, { width: 568, height: 320 }]) {
    await page.setViewportSize(viewport); await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('.intro-emblem')).toBeVisible(); await expect(page.locator('.intro-seed img')).toBeVisible();
    for (const selector of ['.intro-brand > svg', '.intro-emblem', '.intro-emblem > svg', '.intro-content h1', '.intro-invitation', '.enter-dream', '.intro-seed']) {
      const bounds = (await page.locator(selector).boundingBox())!;
      expect(bounds.y).toBeGreaterThanOrEqual(selector === '.intro-emblem' ? 6 : 0);
      expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height - 20);
    }
    const emblem = (await page.locator('.intro-emblem').boundingBox())!;
    expect(emblem.width).toBeCloseTo(emblem.height, 1);
    const brand = (await page.locator('.intro-brand').boundingBox())!;
    expect(emblem.y - 5).toBeGreaterThan(brand.y + brand.height);
    const seed = (await page.locator('.intro-seed').boundingBox())!;
    const footer = (await page.locator('.intro-footer').boundingBox())!;
    expect(seed.y + seed.height + 4).toBeLessThanOrEqual(footer.y);
    mkdirSync('artifacts/interaction-refinements', { recursive: true });
    await page.screenshot({ path: `artifacts/interaction-refinements/${info.project.name}-intro-${viewport.width}.png` });
  }
});

test('手机早期祝福完整缩小，光流仍从角色发向树冠', async ({ page }, info) => {
  await launch(page, info, 'C', { pendingVisits: ['visit-C'], visitLines: { 'visit-C': { dialogueId: 'C1N', read: false } } });
  for (let elapsed = 0; elapsed < 45000 && !await page.locator('.dendro-blessing').count(); elapsed += 100) await page.clock.runFor(100);
  const skill = page.locator('.dendro-blessing'); await expect(skill).toBeVisible();
  await expect(skill.locator('.blessing-effect-scale')).toHaveAttribute('transform', `scale(${page.viewportSize()!.height <= 600 ? .72 : 1})`);
  await expect(skill.locator('.blessing-pattern-piece')).toHaveCount(16);
  await page.clock.runFor(1000);
  const frameWidth = await skill.locator('.blessing-skill-pattern').evaluate((element) => {
    const svg = element as SVGSVGElement; const matrix = svg.getScreenCTM()!;
    return Math.hypot(matrix.a, matrix.b) * svg.viewBox.baseVal.width;
  });
  const nominal = page.viewportSize()!.height <= 600 ? 164 * .72 : 196;
  expect(frameWidth).toBeGreaterThan(nominal * .9); expect(frameWidth).toBeLessThanOrEqual(nominal + .5);
  const start = await skill.locator('.blessing-flow-path').first().getAttribute('d');
  expect(start).toMatch(/^M[\d.-]+ [\d.-]+C/);
  mkdirSync('artifacts/interaction-refinements', { recursive: true });
  await page.screenshot({ path: `artifacts/interaction-refinements/${info.project.name}-blessing.png` });
});
