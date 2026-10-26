import { openSettings } from './settings-support';
import { finishOpening } from './opening-support';
import { finishSceneEntrance } from './scene-support';
import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { OPENING_RULES, openingBounces, openingGeometry } from '../src/game/opening/choreography';
import { stageFixture } from '../src/dev/fixtures';
import { mockServerTime } from './time-support';
import { E_SKILL_PATTERN } from '../src/data/assets';

async function pausedClock(page: Page) {
  const start = new Date('2026-10-22T02:27:00Z');
  await page.clock.install({ time: start }); await page.clock.pauseAt(new Date(start.getTime() + 1000));
}

async function seek(page: Page, time: number) {
  await page.locator('.opening-shell').evaluate((element, reveal) => { element.setAttribute('data-opening-phase', reveal ? 'reveal' : 'throw'); }, time >= OPENING_RULES.splitMs);
  await page.locator('.opening-content, .opening-flight, .opening-flight-travel, .opening-flight-bounce, .opening-frame, .opening-center, .opening-structure, .opening-scan, [data-opening-corner]').evaluateAll((elements, time) => {
    for (const element of elements) for (const animation of element.getAnimations()) { animation.pause(); animation.currentTime = time; }
  }, time);
}

test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.project.name.startsWith('production')) await mockServerTime(page, '2026-10-27T13:27:00+08:00');
});

test('黑屏、弹跳翻转、四角成框、真实页面揭示、等比扩框与中心淡出', async ({ page }, testInfo) => {
  const errors: string[] = []; const textures: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => { if (request.url().endsWith(E_SKILL_PATTERN.texture)) textures.push(request.url()); });
  await pausedClock(page); await page.goto('/');
  const shell = page.locator('.opening-shell');
  await expect(shell).toHaveAttribute('data-opening-mode', 'playing');
  await expect(page.locator('.opening-content')).toHaveAttribute('inert', '');
  await expect(page.getByRole('button', { name: '沉入梦乡' })).toHaveCount(0);
  await expect(page.locator('canvas')).toHaveCount(0);
  await expect(page.locator('.opening-flight')).toHaveAttribute('data-opening-piece', 'corner_tr');
  await expect(page.locator('.opening-flight > svg')).toHaveAttribute('viewBox', '620 4 180 180');
  const original = await page.locator('.intro-content').boundingBox();
  mkdirSync('docs/screenshots/opening', { recursive: true });
  const bounces = openingBounces();
  const rollMiddle = (OPENING_RULES.rollMs + OPENING_RULES.arriveMs) / 2;
  for (const [name, time] of [['black', 0], ['throw', 300], ['contact', OPENING_RULES.firstBounceMs], ['leaf', bounces[0].peakMs], ['settle', bounces[2].peakMs], ['roll', rollMiddle], ['hold', (OPENING_RULES.arriveMs + OPENING_RULES.splitMs) / 2], ['split', OPENING_RULES.splitMs + 310], ['window', OPENING_RULES.windowMs + 90], ['expand', (OPENING_RULES.expandMs + OPENING_RULES.expandedMs) / 2], ['center', OPENING_RULES.expandedMs + 220]] as const) {
    await seek(page, time);
    expect(await page.locator('.intro-content').boundingBox()).toEqual(original);
    if (name === 'leaf') {
      expect(Number(await page.locator('.opening-flight').evaluate((element) => getComputedStyle(element).opacity))).toBe(1);
      const contacts = [OPENING_RULES.firstBounceMs, ...bounces.map((arc) => arc.endMs)];
      for (const time of [200, ...contacts, ...bounces.map((arc) => arc.peakMs), OPENING_RULES.rollMs, rollMiddle, OPENING_RULES.splitMs]) {
        await seek(page, time);
        const scale = await page.locator('.opening-flight').evaluate((element) => { const matrix = new DOMMatrix(getComputedStyle(element).transform); return { horizontal: Math.hypot(matrix.a, matrix.b), vertical: Math.hypot(matrix.c, matrix.d) }; });
        expect(scale.horizontal).toBeCloseTo(1, 5); expect(scale.vertical).toBeCloseTo(1, 5);
        const bounds = (await page.locator('.opening-flight').boundingBox())!; const viewport = page.viewportSize()!;
        expect(bounds.y + bounds.height / 2).toBeLessThanOrEqual(viewport.height / 2 + 0.05);
        if (contacts.includes(time) || time >= OPENING_RULES.rollMs) expect(bounds.y + bounds.height / 2).toBeCloseTo(viewport.height / 2, 1);
        if (time >= OPENING_RULES.firstBounceMs && time <= OPENING_RULES.rollMs) {
          expect(bounds.x).toBeGreaterThan(0); expect(bounds.y).toBeGreaterThan(0);
          expect(bounds.x + bounds.width).toBeLessThan(viewport.width / 2);
          if (time === OPENING_RULES.firstBounceMs) expect(bounds.x + bounds.width / 2).toBeCloseTo(viewport.width * 0.16, 1);
        }
      }
      await seek(page, 0);
      const initialBounds = (await page.locator('.opening-flight').boundingBox())!;
      expect(initialBounds.x + initialBounds.width).toBeLessThan(0);
      for (const junction of contacts) {
        const samples: { position: number; angle: number }[] = [];
        for (const sample of [junction - 1, junction, junction + 1]) {
          await seek(page, sample);
          samples.push(await page.evaluate(() => {
            const travel = new DOMMatrix(getComputedStyle(document.querySelector('.opening-flight-travel')!).transform);
            const rotation = new DOMMatrix(getComputedStyle(document.querySelector('.opening-flight')!).transform);
            return { position: travel.m41, angle: Math.atan2(rotation.b, rotation.a) * 180 / Math.PI };
          }));
        }
        const incoming = samples[1].position - samples[0].position;
        const outgoing = samples[2].position - samples[1].position;
        expect(incoming).toBeGreaterThan(0); expect(outgoing).toBeGreaterThan(0);
        expect(Math.abs(incoming - outgoing)).toBeLessThan(0.01);
        const turn = (samples[2].angle - samples[0].angle + 540) % 360 - 180;
        const radius = openingGeometry(page.viewportSize()!.width, page.viewportSize()!.height).rollingRadius;
        expect(Math.abs(turn - (incoming + outgoing) / radius * 180 / Math.PI)).toBeLessThan(0.01);
      }
      await seek(page, time);
    }
    if (name === 'hold') {
      for (const time of [OPENING_RULES.arriveMs + 20, OPENING_RULES.splitMs - 20]) {
        await seek(page, time);
        const bounds = (await page.locator('.opening-flight').boundingBox())!; const viewport = page.viewportSize()!;
        expect(bounds.x + bounds.width / 2).toBeCloseTo(viewport.width / 2, 1); expect(bounds.y + bounds.height / 2).toBeCloseTo(viewport.height / 2, 1);
        expect(Number(await page.locator('.opening-flight').evaluate((element) => getComputedStyle(element).opacity))).toBe(1);
        expect(Number(await page.locator('[data-opening-corner]').first().evaluate((element) => getComputedStyle(element).opacity))).toBe(0);
      }
      await seek(page, time);
    }
    if (name === 'window') {
      const screenshot = await page.screenshot({ path: `docs/screenshots/opening/${name}-${testInfo.project.name}.png` });
      const pixels = await page.evaluate(async (encoded) => {
        const image = await createImageBitmap(await (await fetch(`data:image/png;base64,${encoded}`)).blob());
        const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
        const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0); image.close();
        return { outside: [...context.getImageData(8, 8, 1, 1).data], inside: [...context.getImageData(canvas.width / 2 + 30, canvas.height / 2 + 20, 1, 1).data] };
      }, screenshot.toString('base64'));
      expect(pixels.outside).toEqual([0, 0, 0, 255]); expect(pixels.inside.slice(0, 3).some((value) => value > 10)).toBe(true);
    } else await page.screenshot({ path: `docs/screenshots/opening/${name}-${testInfo.project.name}.png` });
    if (name === 'expand') {
      const geometry = openingGeometry(page.viewportSize()!.width, page.viewportSize()!.height);
      const actual = await page.evaluate(() => {
        const content = getComputedStyle(document.querySelector('.opening-content')!);
        const halfEdge = Number(content.clipPath.match(/50%\s*-\s*([\d.]+)px/)?.[1] ?? 0);
        const scale = new DOMMatrix(getComputedStyle(document.querySelector('.opening-frame')!).transform).a;
        return { edge: halfEdge * 2, scale };
      });
      expect(Math.abs(actual.edge - geometry.edge * actual.scale)).toBeLessThan(0.2);
    }
  }
  await shell.evaluate((element) => { element.setAttribute('data-opening-phase', 'throw'); });
  await finishOpening(page, true);
  await expect(shell).toHaveAttribute('data-opening', 'false');
  await expect(page.locator('.opening-overlay')).toHaveCount(0);
  expect(await page.locator('.opening-content').evaluate((element) => getComputedStyle(element).clipPath)).toBe('none');
  await expect(page.getByRole('button', { name: '沉入梦乡' })).toBeEnabled();
  await page.screenshot({ path: `docs/screenshots/opening/complete-${testInfo.project.name}.png` });
  expect(new Set(textures).size).toBe(1); expect(errors).toEqual([]);
});

test('演出锁定鼠标、触摸、键盘与游戏计时，每次刷新重播但不修改待访或进度', async ({ page }, testInfo) => {
  await pausedClock(page);
  const key = testInfo.project.name.startsWith('production') ? 'irminsul.player.v2' : 'irminsul.development.v2';
  const fixture = { ...stageFixture('A', Date.parse('2026-10-27T13:27:00+08:00')), growth: 26, pendingVisits: ['visit-A'], visitPositions: { 'visit-A': 1 as const } };
  await page.addInitScript(({ key, fixture }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(fixture)); }, { key, fixture });
  await page.goto('/'); await expect(page.locator('.opening-shell')).toHaveAttribute('data-opening-mode', 'playing');
  await expect(page.getByTestId('dream-scene')).toHaveAttribute('data-paused', 'true');
  await expect(page.locator('.nahida-companion, .dialogue-bubble, .dew-particle')).toHaveCount(0);
  const button = (await page.locator('.water-action').boundingBox())!;
  if (testInfo.project.use.hasTouch) await page.touchscreen.tap(button.x + 20, button.y + 20);
  else await page.mouse.click(button.x + 20, button.y + 20);
  await page.keyboard.press('Tab'); await page.keyboard.press('Enter'); await page.keyboard.press('Space'); await page.mouse.wheel(0, 600);
  await page.locator('.water-action').dispatchEvent('click');
  const saved = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), key);
  expect((await saved()).growth).toBe(26); expect((await saved()).dew).toBe(13); expect((await saved()).blessedVisits).toEqual([]);
  await finishOpening(page, true);
  await expect(page.locator('.opening-overlay')).toHaveCount(0);
  await expect(page.getByTestId('dream-scene')).toHaveAttribute('data-paused', 'false');
  await finishSceneEntrance(page, true);
  await expect(page.locator('.dialogue-bubble[data-speaker=tree]')).toBeVisible();
  for (let attempt = 0; attempt < 40 && !await page.locator('.nahida-companion').count(); attempt++) await page.clock.fastForward(250);
  await expect(page.locator('.nahida-companion')).toHaveCount(1);
  await page.reload(); await expect(page.locator('.opening-shell')).toHaveAttribute('data-opening-mode', 'playing');
  expect((await saved()).growth).toBe(26); expect((await saved()).pendingVisits).toContain('visit-A');
  await expect(page.locator('.nahida-companion')).toHaveCount(0);
  await finishOpening(page, true);
  await openSettings(page); await page.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(page.locator('.opening-overlay')).toHaveCount(0);
});

test('后台同时暂停动效与解锁时钟，窗口变化只更新几何不重播', async ({ page }) => {
  await pausedClock(page); await page.goto('/');
  await expect(page.locator('.opening-shell')).toHaveAttribute('data-opening-mode', 'playing');
  await page.clock.runFor(850);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect(page.locator('.opening-shell')).toHaveAttribute('data-paused', 'true');
  const before = await page.locator('.opening-flight').evaluate((element) => element.getAnimations()[0].currentTime);
  await page.clock.fastForward(30000); await page.setViewportSize({ width: 640, height: 360 });
  expect(await page.locator('.opening-flight').evaluate((element) => element.getAnimations()[0].currentTime)).toBe(before);
  const states = await page.locator('.opening-shell').evaluate((element) => element.getAnimations({ subtree: true }).map((animation) => animation.playState));
  expect(states).toHaveLength(12); expect(states.every((state) => state === 'paused')).toBe(true);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.clock.runFor(OPENING_RULES.arriveMs - 851); await expect(page.locator('.opening-overlay')).toHaveCount(1);
  await finishOpening(page, true); await expect(page.locator('.opening-overlay')).toHaveCount(0);
});

test('系统与存档减少动态使用短淡入，竖屏开场不会锁住转屏按钮', async ({ page }, testInfo) => {
  await pausedClock(page); await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
  await expect(page.locator('.opening-shell')).toHaveAttribute('data-opening-mode', 'fallback');
  await expect(page.locator('.opening-still')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '开启横屏体验' })).toBeEnabled();
  await page.setViewportSize({ width: 844, height: 390 }); await finishOpening(page, true);
  await expect(page.locator('.opening-overlay')).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const key = testInfo.project.name.startsWith('production') ? 'irminsul.player.v2' : 'irminsul.development.v2';
  await page.evaluate(({ key, fixture }) => { const save = JSON.parse(localStorage.getItem(key)!) ?? fixture; save.settings.reducedMotion = true; localStorage.setItem(key, JSON.stringify(save)); }, { key, fixture: stageFixture('A', Date.parse('2026-10-22T10:27:00+08:00')) });
  await page.reload(); await expect(page.locator('.opening-shell')).toHaveAttribute('data-opening-mode', 'fallback');
  await finishOpening(page, true); await expect(page.locator('.opening-overlay')).toHaveCount(0);
});

test('图集损坏或超过等待上限时自动解锁，不留下黑屏与输入拦截', async ({ page }) => {
  await pausedClock(page);
  await page.route(`**${E_SKILL_PATTERN.texture}`, (route) => route.abort());
  await page.goto('/'); await expect(page.locator('.opening-shell')).toHaveAttribute('data-opening-mode', 'fallback');
  await finishOpening(page, true); await expect(page.getByRole('button', { name: '沉入梦乡' })).toBeEnabled();
  await page.unroute(`**${E_SKILL_PATTERN.texture}`);
  const held: Route[] = []; await page.route(`**${E_SKILL_PATTERN.texture}`, (route) => { held.push(route); });
  await page.reload({ waitUntil: 'domcontentloaded' }); await expect(page.locator('.opening-shell')).toHaveAttribute('data-opening-mode', 'loading');
  await page.clock.runFor(OPENING_RULES.assetWaitMs); await expect(page.locator('.opening-shell')).toHaveAttribute('data-opening-mode', 'fallback');
  await page.clock.runFor(11000); await finishOpening(page, true); await expect(page.locator('.opening-overlay')).toHaveCount(0);
  for (const route of held) await route.abort();
  await page.getByRole('button', { name: '沉入梦乡' }).click(); await expect(page.getByTestId('dream-scene')).toBeVisible();
});

test('没有 Web Animations 或 WebGL 时安全显示原页面', async ({ page }) => {
  await pausedClock(page);
  await page.addInitScript(() => {
    Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: undefined });
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, options?: WebGLContextAttributes) { return kind.includes('webgl') ? null : Reflect.apply(original, this, [kind, options]); } as typeof original;
  });
  await page.goto('/'); await finishOpening(page, true);
  await expect(page.locator('.opening-overlay')).toHaveCount(0); await expect(page.getByRole('button', { name: '沉入梦乡' })).toBeEnabled();
  await page.getByRole('button', { name: '沉入梦乡' }).click(); await expect(page.locator('.background-scenery')).toHaveAttribute('data-renderer', 'fallback');
});

test('浏览器拒绝创建动画时也能解锁，不把错误留成黑屏', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await pausedClock(page);
  await page.addInitScript(() => { Element.prototype.animate = () => { throw new DOMException('Animation unavailable', 'NotSupportedError'); }; });
  await page.goto('/'); await finishOpening(page, true); await expect(page.locator('.opening-shell')).toHaveAttribute('data-opening', 'false');
  await expect(page.locator('.opening-overlay')).toHaveCount(0); await expect(page.getByRole('button', { name: '沉入梦乡' })).toBeEnabled();
  expect(await page.locator('.opening-content').evaluate((element) => element.getAnimations().length)).toBe(0); expect(errors).toEqual([]);
});
