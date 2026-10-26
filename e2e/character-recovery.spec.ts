import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import { stageFixture } from '../src/dev/fixtures';
import { ASSETS, CHARACTER_ASSETS } from '../src/data/assets';
import type { StageId } from '../src/types/game';
import { finishOpening } from './opening-support';
import { finishSceneEntrance } from './scene-support';
import { mockServerTime } from './time-support';

const OPEN = '2026-10-27T13:27:00+08:00';
async function rendererReady(page: Page) {
  const avatar = page.locator('.nahida-avatar');
  for (let elapsed = 0; elapsed < 25000 && await avatar.getAttribute('data-renderer') !== 'ready'; elapsed += 100) await page.clock.runFor(100);
  await expect(avatar).toHaveAttribute('data-renderer', 'ready');
}
async function launch(page: Page, info: TestInfo, stage: StageId) {
  await mockServerTime(page, OPEN);
  await page.clock.install({ time: new Date(OPEN) }); await page.clock.pauseAt(new Date(Date.parse(OPEN) + 1000));
  const fixture = stageFixture(stage, Date.parse(OPEN));
  const key = info.project.name.startsWith('production') ? 'irminsul.player.v2' : 'irminsul.development.v2';
  await page.addInitScript(({ key, save, now }) => {
    localStorage.setItem('irminsul.notice.seen.v1', '1'); localStorage.setItem(key, JSON.stringify(save));
    sessionStorage.setItem('irminsul.development.clock', JSON.stringify({ offset: now - Date.now(), simulated: true }));
  }, { key, save: { ...fixture, settings: { ...fixture.settings, music: false }, ...(stage !== 'G' ? { pendingVisits: [`visit-${stage}`] } : {}) }, now: Date.parse(OPEN) });
  await page.goto('/'); await finishOpening(page, true); await finishSceneEntrance(page, true);
  if (stage !== 'G') for (let elapsed = 0; elapsed < 45000 && !await page.locator('.nahida-avatar').count(); elapsed += 100) await page.clock.fastForward(100);
}

test('A到G各形态预载后都能建立真实播放器，后续场景不滞留默认回退', async ({ page }, info) => {
  test.setTimeout(150000);
  for (const stage of ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const) {
    await launch(page, info, stage); await rendererReady(page);
    await expect(page.locator('.nahida-avatar canvas')).toHaveCount(1);
    await expect(page.locator(`img[src="${ASSETS.nahida.src}"]`)).toHaveCount(0);
    await expect(page.locator('.opening-shell')).toHaveAttribute('data-preload-failed', '0');
    if (stage !== 'G') await expect(page.locator('.background-scenery')).toHaveAttribute('data-renderer', /ready|static|fallback/);
    else await expect(page.getByRole('button', { name: '送上生日祝福', exact: true })).toBeVisible();
  }
});

test('B/E及G缺少WebGL时只展示自身透明姿态，不泄露Nidaha彩蛋', async ({ page }, info) => {
  test.setTimeout(120000);
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...args: unknown[]) {
      if (kind === 'webgl' || kind === 'experimental-webgl' || kind === 'webgl2') return null;
      return Reflect.apply(original, this, [kind, ...args]);
    } as typeof original;
  });
  for (const stage of ['B', 'E', 'G'] as const) {
    await launch(page, info, stage);
    const avatar = page.locator('.nahida-avatar'); const variant = stage === 'G' ? 'reality' : 'dream';
    await expect(avatar).toHaveAttribute('data-character', variant);
    await expect(avatar.locator('.character-static')).toHaveAttribute('src', CHARACTER_ASSETS[variant].poster);
    await expect.poll(() => avatar.locator('.character-static').evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await expect(page.locator(`img[src="${ASSETS.nahida.src}"]`)).toHaveCount(0);
  }
});

test('手机角色上下文被回收后恢复单个原形象播放器，重建期间不出现彩蛋', async ({ page }, info) => {
  await launch(page, info, 'G');
  const avatar = page.locator('.nahida-avatar');
  await rendererReady(page);
  await avatar.locator('canvas').evaluate((canvas) => { const target = canvas as HTMLCanvasElement; const gl = target.getContext('webgl2') ?? target.getContext('webgl'); gl!.getExtension('WEBGL_lose_context')!.loseContext(); });
  await expect(avatar).toHaveAttribute('data-renderer', 'fallback');
  await expect(avatar.locator('.character-static')).toHaveAttribute('src', CHARACTER_ASSETS.reality.poster);
  await page.clock.runFor(1200);
  await rendererReady(page);
  await expect(avatar.locator('canvas')).toHaveCount(1);
  await expect(page.locator(`img[src="${ASSETS.nahida.src}"]`)).toHaveCount(0);
  await page.keyboard.type('Nidaha');
  await expect(avatar).toHaveAttribute('data-renderer', 'placeholder');
  await expect(avatar.locator('.character-static')).toHaveAttribute('src', ASSETS.nahida.src);
  await page.keyboard.type('Nidaha');
  await rendererReady(page);
  await expect(avatar.locator('canvas')).toHaveCount(1);
  await expect(page.locator(`img[src="${ASSETS.nahida.src}"]`)).toHaveCount(0);
});
