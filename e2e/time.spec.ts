import { openSettings } from './settings-support';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { stageFixture } from '../src/dev/fixtures';
import { SCHEDULE } from '../src/data/schedule';
import { dialoguePool } from '../src/data/dialogues';
import { mockServerTime, playerSave, seedPlayer } from './time-support';
import { finishOpening } from './opening-support';
import { finishSceneEntrance } from './scene-support';

async function completeSceneChange(page: Page) {
  for (let attempt = 0; attempt < 120 && !await page.getByTestId('stage-loading').count(); attempt++) await page.clock.runFor(500);
  await expect(page.getByTestId('stage-loading')).toBeVisible();
  await page.clock.runFor(150);
  if (await page.locator('.background-scenery').count()) await expect(page.locator('.background-scenery')).toHaveAttribute('data-renderer', /ready|static|fallback/);
  for (let attempt = 0; attempt < 40 && await page.getByTestId('stage-loading').count(); attempt++) await page.clock.runFor(500);
  await expect(page.getByTestId('stage-loading')).toHaveCount(0);
}

async function synchronize(page: Page) {
  await openSettings(page); await page.getByRole('button', { name: '重新校时', exact: true }).click();
  await expect(page.locator('.time-sync-setting')).toContainText('时间已校准');
  await page.getByRole('button', { name: '关闭', exact: true }).click();
}

test('本地预览端点返回宿主时间与禁止缓存头，设备日期及查询参数不能覆盖', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2050-01-01T00:00:00Z'));
  const before = Date.now();
  const response = await page.request.get('/api/time?requestId=browser-check&now=0&skipTime=1');
  expect(response.ok()).toBe(true); expect(response.headers()['cache-control']).toContain('no-store');
  const message = await response.json() as { now: number; requestId: string };
  expect(message.requestId).toBe('browser-check'); expect(message.now).toBeGreaterThanOrEqual(before); expect(message.now).toBeLessThanOrEqual(Date.now());
  expect((await page.request.post('/api/time')).status()).toBe(405);
  expect(await (await page.request.get('/_routes.json')).json()).toEqual({ version: 1, include: ['/api/time', '/api/time/'], exclude: [] });
});

test('服务器按三批日期恢复历史场景，设备未来日期不越权且 G 后没有夜间阶段', async ({ page }) => {
  await page.clock.install({ time: new Date('2050-10-27T22:27:00+08:00') });
  const server = await mockServerTime(page, '2026-10-25T10:26:59+08:00');
  await seedPlayer(page, stageFixture('G', Date.parse(SCHEDULE[5].at)));
  await page.goto('/?skipTime=1&now=9999999999999'); await finishOpening(page, true);
  await page.getByRole('button', { name: '沉入梦乡' }).click(); await expect(page.locator('.intro-notice')).toBeVisible();
  await expect(page.getByTestId('dream-scene')).toHaveCount(0);
  server.now = Date.parse(SCHEDULE[0].at); await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.locator('.theme-loop')).toBeVisible(); await expect(page.getByTestId('reality-scene')).toHaveCount(0);
  expect((await playerSave(page)).growth).toBe(1028);
  server.now = Date.parse(SCHEDULE[3].at); await synchronize(page); await completeSceneChange(page);
  await expect(page.locator('.theme-embers')).toBeVisible();
  server.now = Date.parse(SCHEDULE[5].at); await synchronize(page); await completeSceneChange(page);
  await expect(page.getByTestId('reality-scene')).toBeVisible();
  server.now = Date.parse('2026-10-27T22:27:00+08:00'); await synchronize(page); await page.clock.runFor(1000);
  await expect(page.locator('.night-dew, .reality-night, .debug-panel, .time-gate, .growth-meter, .story-overlay')).toHaveCount(0);
  expect((await playerSave(page)).nightComplete).toBe(false);
});

test('同页断网沿用已确认权限，离线刷新停在入梦页且保留成长及梦露', async ({ page }) => {
  await page.clock.install(); const server = await mockServerTime(page, SCHEDULE[0].at);
  const initial = stageFixture('A', server.now); initial.growth = 13;
  await seedPlayer(page, initial); await page.goto('/'); await finishOpening(page, true); await finishSceneEntrance(page, true);
  await openSettings(page); server.mode = 'offline'; await page.getByRole('button', { name: '重新校时', exact: true }).click();
  await expect(page.locator('.time-sync-setting')).toContainText('已开放的内容仍可继续');
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: '浇灌梦中的树', exact: true }).click();
  await expect.poll(async () => (await playerSave(page)).growth).toBe(26);
  await page.reload(); await finishOpening(page, true);
  await expect(page.getByRole('button', { name: '沉入梦乡' })).toBeVisible();
  await page.getByRole('button', { name: '沉入梦乡' }).click(); await expect(page.locator('.intro-notice')).toBeVisible();
  await expect(page.getByTestId('dream-scene')).toHaveCount(0); expect((await playerSave(page)).growth).toBe(26); expect((await playerSave(page)).dew).toBe(0);
  server.mode = 'ok'; await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.getByTestId('dream-scene')).toBeVisible(); await finishSceneEntrance(page, true);
  expect((await playerSave(page)).growth).toBe(26); expect((await playerSave(page)).dew).toBe(0);
});

test('26 日边界重新校时，仅完成加载后播放目标 D 段的转场句', async ({ page }) => {
  await page.clock.install(); const server = await mockServerTime(page, '2026-10-26T10:26:59.500+08:00');
  await seedPlayer(page, stageFixture('D', server.now)); await page.goto('/'); await finishOpening(page, true);
  await expect(page.locator('.theme-loop')).toBeVisible();
  server.now = Date.parse(SCHEDULE[3].at); await page.clock.runFor(1000); await completeSceneChange(page);
  await expect(page.locator('.theme-dawn')).toBeVisible();
  const text = await page.locator('.dialogue-bubble p .sr-only').textContent();
  expect(dialoguePool('D/transition').some((entry) => entry.text === text)).toBe(true);
});

for (const mode of ['timeout', 'html', 'stale'] as const) {
  test(`校时 ${mode} 不授予首次入梦权限，联网后恢复旧进度而不扣除资源`, async ({ page }, info) => {
    await page.clock.install({ time: new Date('2050-01-01T00:00:00Z') }); await page.emulateMedia({ reducedMotion: 'reduce' });
    const server = await mockServerTime(page, SCHEDULE[0].at); server.mode = mode;
    const initial = stageFixture('C', server.now); await seedPlayer(page, initial);
    await page.goto('/'); await finishOpening(page, true); await page.clock.runFor(5100);
    await page.getByRole('button', { name: '沉入梦乡' }).click(); await expect(page.locator('.intro-notice')).toBeVisible();
    await expect(page.getByTestId('dream-scene')).toHaveCount(0); expect((await playerSave(page)).growth).toBe(initial.growth); expect((await playerSave(page)).dew).toBe(13);
    server.mode = 'ok'; await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(page.locator('.theme-loop')).toBeVisible(); await openSettings(page);
    await expect(page.locator('.time-sync-setting')).toContainText('时间已校准');
    if (info.project.name.includes('mobile')) await page.setViewportSize({ width: 640, height: 360 });
    expect(await page.getByRole('dialog').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: `docs/screenshots/time-offline-${mode}-${info.project.name}.png` });
  });
}
