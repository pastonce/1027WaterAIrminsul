import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { CHARACTER_ASSETS } from '../src/data/assets';
import { ASSET_CACHE_NAME } from '../src/game/assets/cache';
import { OPENING_RULES } from '../src/game/opening/choreography';
import { finishOpening } from './opening-support';
import { mockServerTime } from './time-support';

const OPEN = '2026-10-27T13:27:00+08:00';
async function prepare(page: Page) {
  await mockServerTime(page, OPEN);
  await page.clock.install({ time: new Date(OPEN) }); await page.clock.pauseAt(new Date(Date.parse(OPEN) + 1000));
  await page.addInitScript(() => localStorage.setItem('irminsul.notice.seen.v1', '1'));
}

test('素材失败不会进入页面或伪100%，重试只补未完成素材，旧损坏缓存会被替换', async ({ page }) => {
  await prepare(page);
  const target = CHARACTER_ASSETS.nahida_wave.json;
  await page.addInitScript(async ({ name, target }) => {
    await (await caches.open(name)).put(target, new Response('<html>broken</html>', { headers: { 'Content-Type': 'text/html' } }));
  }, { name: ASSET_CACHE_NAME, target });
  let attempts = 0; let ready = false;
  await page.route(`**${target}`, async (route) => { attempts++; if (ready) await route.continue(); else await route.fulfill({ status: 503, body: 'offline' }); });
  await page.goto('/');
  await expect.poll(() => attempts, { timeout: 20000 }).toBe(1);
  await page.clock.fastForward(800); await expect.poll(() => attempts).toBe(2);
  await page.clock.fastForward(1600); await expect.poll(() => attempts).toBe(3);
  await page.clock.runFor(OPENING_RULES.arriveMs);
  const shell = page.locator('.opening-shell');
  await expect(page.getByRole('button', { name: '重试加载', exact: true })).toBeVisible();
  await expect(shell).toHaveAttribute('data-opening', 'true'); await expect(shell).toHaveAttribute('data-preload-complete', 'false');
  await expect(page.locator('.opening-content')).toHaveAttribute('inert');
  expect(Number(await page.getByRole('progressbar', { name: '梦境准备' }).getAttribute('aria-valuenow'))).toBeLessThan(100);
  expect(await page.evaluate(async ({ name, target }) => Boolean(await (await caches.open(name)).match(target)), { name: ASSET_CACHE_NAME, target })).toBe(false);
  ready = true;
  await page.keyboard.press('Tab'); await expect(page.getByRole('button', { name: '重试加载', exact: true })).toBeFocused();
  await page.keyboard.press('Enter'); await finishOpening(page, true);
  await expect(shell).toHaveAttribute('data-preload-failed', '0');
  expect(await page.evaluate(async ({ name, target }) => (await (await caches.open(name)).match(target))?.headers.get('X-Irminsul-Bytes'), { name: ASSET_CACHE_NAME, target })).toMatch(/^\d+$/);
});

test('健康慢网超过60秒仍等待未来角色完整纹理，完成后才揭幕', async ({ page }) => {
  await prepare(page);
  await page.addInitScript((target) => {
    const download = window.fetch.bind(window);
    let used = false;
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
      const response = await download(input, init);
      if (url !== target || used) return response;
      used = true;
      const data = new Uint8Array(await response.arrayBuffer()); const timers: ReturnType<typeof setTimeout>[] = [];
      Reflect.set(window, '__slowAssetStarted', true);
      return new Response(new ReadableStream({ start(controller) {
        for (let index = 1; index <= 4; index++) timers.push(setTimeout(() => {
          controller.enqueue(data.slice(Math.floor(data.length * (index - 1) / 4), Math.floor(data.length * index / 4)));
          Reflect.set(window, '__slowAssetChunks', index); if (index === 4) controller.close();
        }, index * 20000));
      }, cancel() { timers.forEach(clearTimeout); } }), { status: 200, headers: response.headers });
    };
  }, CHARACTER_ASSETS.nahida_swing.texture);
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => Reflect.get(window, '__slowAssetStarted')), { timeout: 25000 }).toBe(true);
  await page.clock.runFor(OPENING_RULES.arriveMs);
  for (let step = 0; step < 6; step++) { await page.clock.fastForward(10000); await page.evaluate(() => Promise.resolve()); }
  await expect(page.locator('.opening-shell')).toHaveAttribute('data-opening-phase', 'loading');
  await expect(page.locator('.opening-shell')).toHaveAttribute('data-preload-complete', 'false');
  expect(await page.evaluate(() => Reflect.get(window, '__slowAssetChunks'))).toBe(3);
  await page.clock.fastForward(10000); await page.clock.fastForward(10000); await finishOpening(page, true);
  await expect(page.locator('.opening-shell')).toHaveAttribute('data-preload-failed', '0');
});
