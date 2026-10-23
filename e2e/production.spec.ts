import { expect, test } from '@playwright/test';
import { stageFixture } from '../src/dev/fixtures';
import { STAGES } from '../src/data/stages';
import { mockServerTime } from './time-support';
import { openSettings } from './settings-support';

test.beforeEach(async ({ page }) => { await mockServerTime(page, '2026-10-25T10:27:00+08:00'); });

test('生产包排除开发入口，普通界面没有阶段和成长组件', async ({ page }) => {
  await page.goto('/?debug=true&admin=1&skipTime=1'); await page.getByRole('button', { name: '沉入梦乡' }).click();
  await expect(page.locator('.debug-panel, .scene-copy, .growth-meter, .journal-chapters, .story-overlay, .listen-button')).toHaveCount(0);
  const scripts = await page.locator('script[src]').evaluateAll((elements) => elements.map((element) => (element as HTMLScriptElement).src));
  for (const script of scripts) {
    const response = await page.request.get(script); const code = await response.text();
    expect(code).not.toContain('模拟日期时间'); expect(code).not.toContain('DevelopmentClock'); expect(code).not.toContain('stageFixture');
  }
});

test('未来存档不会提前开放现实，隐藏数值也不削弱时间锁', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2050-10-27T22:27:00+08:00'));
  await page.addInitScript((save) => localStorage.setItem('irminsul.player.v2', JSON.stringify(save)), stageFixture('G', Date.parse('2026-10-27T22:27:00+08:00')));
  await page.goto('/'); await expect(page.getByTestId('dream-scene')).toBeVisible(); await expect(page.getByTestId('reality-scene')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '梦中的树', exact: true })).toHaveAccessibleName('梦中的树');
  await expect(page.locator('.theme-loop')).toBeVisible(); await expect(page.locator('[data-testid=growth-count]')).toHaveCount(0);
  await openSettings(page); await expect(page.getByRole('dialog')).not.toContainText(STAGES.F.transition.text);
});

test('正式开放之前点入梦只提示，不进入观赏或浇灌流程', async ({ page }) => {
  await mockServerTime(page, '2026-10-21T10:27:00+08:00');
  await page.clock.setFixedTime(new Date('2050-10-27T22:27:00+08:00'));
  await page.goto('/'); await page.getByRole('button', { name: '沉入梦乡' }).click();
  await expect(page.locator('.intro-notice')).toHaveText('梦境尚未开启，请稍后再来。');
  await expect(page.getByTestId('dream-scene')).toHaveCount(0);
  await expect(page.locator('.dialogue-bubble, .dew-particle, .time-gate, .story-overlay')).toHaveCount(0);
});
