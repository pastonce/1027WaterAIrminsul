import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { stageFixture } from '../src/dev/fixtures';
import { E_SKILL_PATTERN } from '../src/data/assets';
import { OPENING_RULES } from '../src/game/opening/choreography';
import { visitExpressionAnchor } from '../src/game/expressions/placement';
import { finishOpening } from './opening-support';
import { finishSceneEntrance } from './scene-support';
import { mockServerTime } from './time-support';

const OPEN = '2026-10-27T13:27:00+08:00';
async function prepare(page: Page, stage: 'A' | 'B', visit = false) {
  await mockServerTime(page, OPEN);
  await page.clock.install({ time: new Date(OPEN) });
  await page.clock.pauseAt(new Date(Date.parse(OPEN) + 1000));
  const fixture = stageFixture(stage, Date.parse(OPEN));
  await page.addInitScript(({ save, visit }) => {
    localStorage.setItem('irminsul.notice.seen.v1', '1');
    localStorage.setItem('irminsul.player.v2', JSON.stringify({ ...save, growth: save.sceneStage === 'A' ? 140 : 200,
      settings: { ...save.settings, music: false }, ...(visit ? { pendingVisits: ['visit-B'], visitPositions: { 'visit-B': 1 }, visitLines: { 'visit-B': { id: 'B1N', read: false } } } : {}) }));
    let seed = 1027;
    Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  }, { save: fixture, visit });
}

for (const viewport of [{ width: 1024, height: 768 }, { width: 1180, height: 820 }]) test.describe(`平板${viewport.width}×${viewport.height}`, () => {
  test.use({ viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  test('加载期黑底完整覆盖，实际内容尺寸有偏差也不漏景，预载使用当前技能图集', async ({ page }) => {
    await prepare(page, 'A');
    const requests: string[] = []; page.on('request', (request) => requests.push(request.url()));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    await page.route('**/asserts/music/a-*.m4a', async (route) => { await gate; await route.continue(); });
    await page.goto('/');
    const shell = page.locator('.opening-shell');
    await expect(shell).toHaveAttribute('data-opening-mode', 'playing');
    await page.clock.runFor(OPENING_RULES.arriveMs);
    await expect(shell).toHaveAttribute('data-opening-phase', 'loading');
    await page.locator('.opening-content').evaluate((element) => {
      Object.assign((element as HTMLElement).style, { width: `${innerWidth + 80}px`, height: `${innerHeight + 80}px` });
    });
    await expect(page.locator('.opening-content')).toHaveCSS('opacity', '0');
    await expect(page.locator('.opening-overlay')).toHaveCSS('background-color', 'rgb(0, 0, 0)');
    mkdirSync('artifacts/tablet-layout', { recursive: true });
    const screenshot = await page.screenshot({ path: `artifacts/tablet-layout/${viewport.width}-loading.png` });
    const pixels = await page.evaluate(async (encoded) => {
      const image = await createImageBitmap(await (await fetch(`data:image/png;base64,${encoded}`)).blob());
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0); image.close();
      return [[8, 8], [innerWidth - 8, 8], [8, innerHeight - 8], [innerWidth - 8, innerHeight - 8], [innerWidth / 2 + 100, innerHeight / 2 + 75]].map(([x, y]) => [...context.getImageData(x * devicePixelRatio, y * devicePixelRatio, 1, 1).data]);
    }, screenshot.toString('base64'));
    expect(pixels.every((pixel) => JSON.stringify(pixel) === '[0,0,0,255]')).toBe(true);
    await expect(page.locator('link[rel=preload][as=image]')).toHaveAttribute('href', E_SKILL_PATTERN.texture);
    expect(requests.some((url) => url.endsWith('/effects/e-skill-frame.png'))).toBe(false);
    await page.locator('.opening-content').evaluate((element) => { (element as HTMLElement).style.removeProperty('width'); (element as HTMLElement).style.removeProperty('height'); });
    release(); await finishOpening(page, true);
    await expect(page.locator('.opening-content')).not.toHaveAttribute('inert');
  });

  test('普通梦露分布到当前树形外的中部空地，跨生命周期仍保持分散', async ({ page }) => {
    await prepare(page, 'A'); await page.goto('/'); await finishOpening(page, true); await finishSceneEntrance(page, true);
    const samples = new Map<string, number>();
    for (let second = 0; second < 30; second++) {
      await page.clock.runFor(1000);
      const points = await page.locator('.dew-particle[data-dew-kind=ordinary]').evaluateAll((elements) => elements.map((element) => ({ id: element.getAttribute('data-dew-id')!, x: parseFloat((element as HTMLElement).style.left) })));
      for (const point of points) samples.set(point.id, point.x);
    }
    const points = [...samples.values()]; expect(points.length).toBeGreaterThan(12);
    expect(points.filter((x) => x > 20 && x < 80).length).toBeGreaterThan(points.length * .35);
    expect(Math.min(...points)).toBeLessThan(20); expect(Math.max(...points)).toBeGreaterThan(75);
    await page.screenshot({ path: `artifacts/tablet-layout/${viewport.width}-dew.png` });
  });

  test('B较左来访时气泡与真实头部保持间距', async ({ page }) => {
    await prepare(page, 'B', true); await page.goto('/'); await finishOpening(page, true);
    const bubble = page.locator('.dialogue-bubble[data-speaker=nahida]');
    for (let elapsed = 0; elapsed < 20000 && !await bubble.count(); elapsed += 100) await page.clock.runFor(100);
    await expect(bubble).toBeVisible();
    const character = page.locator('.nahida-companion'); await expect(character).toHaveAttribute('data-position', '1');
    const bounds = (await character.boundingBox())!;
    const head = visitExpressionAnchor({ left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height }, 'B');
    const frame = (await bubble.boundingBox())!;
    expect(frame.x >= head.x + head.radiusX + 8 || frame.x + frame.width <= head.x - head.radiusX - 8 || frame.y + frame.height <= head.y - head.radiusY - 8 || frame.y >= head.y + head.radiusY + 8).toBe(true);
    await page.screenshot({ path: `artifacts/tablet-layout/${viewport.width}-nahida.png` });
  });
});
