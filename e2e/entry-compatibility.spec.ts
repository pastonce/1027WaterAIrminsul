import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import { stageFixture } from '../src/dev/fixtures';
import { SCHEDULE } from '../src/data/schedule';
import { finishOpening } from './opening-support';
import { mockServerTime } from './time-support';
import { openSettings } from './settings-support';
import { mkdirSync } from 'node:fs';

async function launch(page: Page, info: TestInfo, saved = true, date = SCHEDULE[0].at) {
  const now = new Date(date);
  await mockServerTime(page, date);
  await page.clock.install({ time: now }); await page.clock.pauseAt(new Date(now.getTime() + 1000));
  await page.addInitScript(({ save, key, date }) => {
    if (save) localStorage.setItem(key, JSON.stringify(save));
    sessionStorage.setItem('irminsul.development.clock', JSON.stringify({ offset: date - Date.now(), simulated: true }));
  }, { save: saved ? stageFixture('A', now.getTime()) : null, key: info.project.name.startsWith('production') ? 'irminsul.player.v2' : 'irminsul.development.v2', date: now.getTime() });
  await page.goto('/'); await finishOpening(page, true);
}

test('首屏文案完整且始终两行，桌面和窄横屏无溢出', async ({ page }, info) => {
  await launch(page, info, false); await page.evaluate(() => document.fonts.ready);
  await expect(page.getByRole('button', { name: '沉入梦乡', exact: true })).toBeVisible();
  const invitation = page.locator('.intro-invitation');
  await expect(invitation).toHaveText('植物的生长，需要水，需要风，需要养料与阳光。梦景的天成，源于形，源于声，源于喧嚣与幽思。');
  await expect(invitation.locator('br')).toHaveCount(1);
  await expect(page.locator('.intro-note')).toHaveCount(0);
  await expect(page.locator('.intro-footer > span:last-child')).toHaveText('非商业同人生贺企划 · 不代表任何官方立场');
  mkdirSync('artifacts/intro', { recursive: true });
  for (const viewport of [info.project.use.viewport!, { width: 640, height: 360 }, { width: 568, height: 320 }]) {
    await page.setViewportSize(viewport);
    await expect(invitation).toHaveCSS('font-size', viewport.height <= 360 ? '10.5px' : viewport.height <= 600 ? '11px' : '14px');
    const layout = await invitation.evaluate((element) => ({ height: element.getBoundingClientRect().height, line: parseFloat(getComputedStyle(element).lineHeight), color: getComputedStyle(element).color }));
    expect(Math.abs(layout.height - layout.line * 2)).toBeLessThan(1);
    expect(layout.color).toBe('rgb(53, 92, 75)');
    for (const selector of ['.intro-brand', '.intro-emblem', '.intro-content h1', '.intro-invitation', '.enter-dream', '.intro-footer > span']) {
      const bounds = await page.locator(selector).evaluateAll((elements) => elements.filter((element) => getComputedStyle(element).display !== 'none').map((element) => element.getBoundingClientRect().toJSON()));
      for (const rectangle of bounds) {
        expect(rectangle.x).toBeGreaterThanOrEqual(0); expect(rectangle.y).toBeGreaterThanOrEqual(0);
        expect(rectangle.right).toBeLessThanOrEqual(viewport.width); expect(rectangle.bottom).toBeLessThanOrEqual(viewport.height);
      }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/intro/${info.project.name}-${viewport.width}.png` });
  }
});

test('首屏开放前提示不遮挡按钮或页脚，点击仍不进入梦境', async ({ page }, info) => {
  await launch(page, info, false, '2026-10-25T10:00:00+08:00'); await page.evaluate(() => document.fonts.ready);
  for (const viewport of [info.project.use.viewport!, { width: 640, height: 360 }, { width: 568, height: 320 }]) {
    await page.setViewportSize(viewport); await page.getByRole('button', { name: '沉入梦乡', exact: true }).click();
    await expect(page.locator('.intro-notice')).toHaveText('梦境尚未开启，请稍后再来。');
    const button = (await page.locator('.enter-dream').boundingBox())!;
    const notice = (await page.locator('.intro-notice').boundingBox())!;
    const footer = (await page.locator('.intro-footer').boundingBox())!;
    expect(notice.y).toBeGreaterThan(button.y + button.height + 6);
    expect(notice.y + notice.height).toBeLessThan(footer.y - 2);
    await expect(page.getByTestId('dream-scene')).toHaveCount(0);
  }
});

test('首屏缺图与强制色模式仍能清楚显示文字、聚焦按钮', async ({ page }, info) => {
  await page.route('**/asserts/backgrounds/**', (route) => route.abort());
  await launch(page, info, false);
  await expect(page.locator('.intro-landscape')).toBeHidden();
  await expect(page.locator('.intro-scene')).toHaveCSS('background-color', 'rgb(227, 241, 229)');
  const button = page.getByRole('button', { name: '沉入梦乡', exact: true });
  await button.focus(); await expect(button).toBeFocused();
  await page.emulateMedia({ forcedColors: 'active' });
  await expect(page.locator('.intro-scene .background-parallax')).toHaveCSS('display', 'none');
  await expect(page.locator('.intro-invitation')).toHaveCSS('text-shadow', 'none');
  await expect(button).toBeVisible(); await expect(button).toBeFocused();
});

test('A 回访等待真实镜头落位，设置暂停不消耗入场时间', async ({ page }, info) => {
  await launch(page, info);
  await expect(page.locator('.background-scenery')).toHaveAttribute('data-renderer', 'ready', { timeout: 20000 });
  await expect(page.locator('.dialogue-bubble')).toHaveCount(0);
  await page.clock.runFor(2000); await expect(page.locator('.dialogue-bubble')).toHaveCount(0);
  await openSettings(page); const entrance = await page.getByTestId('dream-scene').getAttribute('data-ground-entrance');
  await page.clock.runFor(20000); expect(await page.getByTestId('dream-scene').getAttribute('data-ground-entrance')).toBe(entrance);
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.clock.runFor(1700);
  await expect(page.getByTestId('dream-scene')).toHaveAttribute('data-ground-entrance', '0');
  await expect(page.locator('.dialogue-bubble[data-speaker=tree]')).toBeVisible();
  const key = info.project.name.startsWith('production') ? 'irminsul.player.v2' : 'irminsul.development.v2';
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).pendingDialogues[0].lines, key)).toEqual(['R01']);
});

for (const behavior of ['noop', 'throws', 'missing'] as const) {
  test(`设置不依赖失效原生 dialog API：${behavior}`, async ({ page }, info) => {
    await page.addInitScript((behavior) => {
      Reflect.set(window, '__nativeDialogCalls', 0);
      Reflect.set(HTMLDialogElement.prototype, 'showModal', behavior === 'missing' ? undefined : function () {
        Reflect.set(window, '__nativeDialogCalls', Number(Reflect.get(window, '__nativeDialogCalls')) + 1);
        if (behavior === 'throws') throw new Error('Unsupported browser modal');
      });
    }, behavior);
    await launch(page, info); await openSettings(page);
    const dialog = page.getByRole('dialog', { name: '设置' });
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((element) => element.closest('[data-modal-portal]')?.parentElement === document.body)).toBe(true);
    expect(await page.evaluate(() => Reflect.get(window, '__nativeDialogCalls'))).toBe(0);
    const slider = page.getByRole('slider', { name: '背景音乐音量', exact: true });
    await slider.focus(); await page.keyboard.press('ArrowRight'); await expect(slider).toHaveValue('46');
    await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
    await expect(page.locator('.game-content')).not.toHaveAttribute('inert', '');
    await expect(page.getByRole('button', { name: '设置', exact: true })).toBeFocused();
  });
}

test('开放前点入梦只显示提示，不挂载树、对白、音乐或消耗存档', async ({ page }, info) => {
  const musicRequests: string[] = [];
  page.on('request', (request) => { if (request.url().includes('/asserts/music/')) musicRequests.push(request.url()); });
  await launch(page, info, false, '2026-10-25T10:00:00+08:00');
  const button = page.getByRole('button', { name: '沉入梦乡' });
  await button.click(); await expect(page.getByRole('status')).toHaveText('梦境尚未开启，请稍后再来。');
  await expect(button).toBeVisible();
  await page.clock.runFor(20000);
  await expect(page.getByTestId('dream-scene')).toHaveCount(0);
  await expect(page.locator('.dialogue-bubble, .dew-particle, .nahida-companion, .background-canvas')).toHaveCount(0);
  expect(musicRequests).toEqual([]);
});
