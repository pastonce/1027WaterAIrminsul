import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import manifest from '../docs/cursor-assets.manifest.json' with { type: 'json' };
import { finishOpening } from './opening-support';
import { mockServerTime } from './time-support';

test('桌面语义指针覆盖首屏与Portal，触屏和强制色保留系统光标，公告含作者及许可', async ({ page }) => {
  const errors: string[] = []; const cursorRequests: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => { if (request.url().endsWith('.cur')) cursorRequests.push(request.url()); });
  await mockServerTime(page, '2026-10-24T10:27:00+08:00');
  await page.goto('/');
  const desktop = await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches);
  const normal = manifest.files.find((file) => file.role === 'normal')!;
  if (desktop) await expect(page.locator('body')).toHaveCSS('cursor', new RegExp(normal.src));
  else expect(await page.locator('body').evaluate((element) => getComputedStyle(element).cursor)).not.toContain('.cur');
  await finishOpening(page);
  const enter = page.getByRole('button', { name: '沉入梦乡', exact: true });
  const cursor = (role: string) => new RegExp(manifest.files.find((file) => file.role === role)!.src);
  if (desktop) await expect(enter).toHaveCSS('cursor', cursor('pointer'));
  else await expect(enter).toHaveCSS('cursor', 'pointer');
  await page.getByRole('button', { name: '公告与声明', exact: true }).click();
  const panel = page.locator('.notice-modal');
  await expect(panel).toContainText('SAM TOKI STUDIO');
  const author = panel.getByRole('link', { name: 'SAM TOKI STUDIO', exact: true });
  await expect(author).toHaveAttribute('href', manifest.sourceUrl);
  await expect(panel.getByRole('link', { name: '查看原版权说明' })).toHaveAttribute('href', '/asserts/cursor/COPYRIGHT.txt');
  if (desktop) await expect(author).toHaveCSS('cursor', cursor('pointer'));
  const license = await page.request.get('/asserts/cursor/COPYRIGHT.txt'); expect(license.ok()).toBe(true);
  expect(await license.text()).toContain('SAM TOKI STUDIO');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const volume = page.getByRole('slider', { name: '背景音乐音量', exact: true });
  if (desktop) await expect(volume).toHaveCSS('cursor', cursor('horizontal'));
  await page.evaluate(() => {
    const samples = document.createElement('div'); samples.id = 'cursor-samples'; samples.setAttribute('aria-hidden', 'true');
    samples.innerHTML = '<input type="text"><button disabled>disabled</button><abbr title="help">help</abbr><svg><path class="tree-art"/></svg><button class="creature-hit">creature</button>';
    document.body.append(samples);
  });
  const sample = page.locator('#cursor-samples');
  if (desktop) {
    await expect(sample.locator('input')).toHaveCSS('cursor', cursor('text'));
    await expect(sample.locator('button:disabled')).toHaveCSS('cursor', cursor('unavailable'));
    await expect(sample.locator('abbr')).toHaveCSS('cursor', cursor('help'));
    await expect(sample.locator('.tree-art')).toHaveCSS('cursor', cursor('pointer'));
    await expect(sample.locator('.creature-hit')).toHaveCSS('cursor', cursor('pointer'));
    for (const file of manifest.files) await expectCursorFile(page, file.src);
    await page.emulateMedia({ forcedColors: 'active' });
    await expect(page.getByRole('button', { name: '关闭', exact: true })).toHaveCSS('cursor', 'pointer');
    expect(await page.locator('body').evaluate((element) => getComputedStyle(element).cursor)).not.toContain('.cur');
  } else expect(cursorRequests).toEqual([]);
  expect(errors).toEqual([]);
});

async function expectCursorFile(page: Page, source: string) {
  const response = await page.request.get(source);
  expect(response.ok()).toBe(true); expect((await response.body()).readUInt16LE(2)).toBe(2);
}

test('真实设置与开发测试面板的按钮、标签、日期和全部后代继承指针', async ({ page }) => {
  const errors: string[] = []; const requests: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => { if (request.url().endsWith('.cur')) requests.push(request.url()); });
  await mockServerTime(page, '2026-10-24T10:27:00+08:00');
  await page.goto('/'); await finishOpening(page);
  const desktop = await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches);
  const cursor = (role: string) => new RegExp(manifest.files.find((file) => file.role === role)!.src);
  await page.keyboard.type('test'); await expect(page.locator('.game-app')).toHaveAttribute('data-testing', 'true');
  const summary = page.locator('.debug-panel > summary'); await expect(summary).toBeVisible();
  if (desktop) await expect(summary).toHaveCSS('cursor', cursor('pointer'));
  await summary.click();
  await page.getByRole('button', { name: '调试切换到C阶段', exact: true }).click();
  const debug = page.locator('.debug-content');
  if (desktop) {
    for (const selector of ['label', 'button:not(:disabled)', 'select']) for (const element of await debug.locator(selector).all()) await expect(element).toHaveCSS('cursor', cursor('pointer'));
    for (const element of await debug.locator('input').all()) await expect(element).toHaveCSS('cursor', cursor('text'));
    const mismatches = await debug.evaluate((root) => [root, ...root.querySelectorAll('*')].filter((element) => !getComputedStyle(element).cursor.includes('/asserts/cursor/')).map((element) => `${element.tagName}.${element.className}`));
    expect(mismatches).toEqual([]);
  }
  await page.getByLabel('模拟日期时间', { exact: true }).fill('2026-10-27T10:28');
  await expect(page.getByLabel('模拟日期时间', { exact: true })).toHaveValue('2026-10-27T10:28');
  await page.getByRole('button', { name: '调试切换到G阶段', exact: true }).click();
  if (desktop) await expect(debug.getByRole('button', { name: '触发纳西妲来访', exact: true })).toHaveCSS('cursor', cursor('unavailable'));
  await summary.click(); await page.getByRole('button', { name: '设置', exact: true }).click();
  const settings = page.locator('.settings-modal');
  if (desktop) {
    for (const element of await settings.locator('label, button').all()) await expect(element).toHaveCSS('cursor', cursor('pointer'));
    await expect(settings.locator('input[type="checkbox"]')).toHaveCSS('cursor', cursor('pointer'));
    await expect(settings.locator('.hidden-code-entry input')).toHaveCSS('cursor', cursor('text'));
    for (const element of await settings.locator('input[type="range"]').all()) await expect(element).toHaveCSS('cursor', cursor('horizontal'));
    expect(await page.locator('.modal-backdrop').evaluate((root) => [root, ...root.querySelectorAll('*')].filter((element) => !getComputedStyle(element).cursor.includes('/asserts/cursor/')).map((element) => element.tagName))).toEqual([]);
  }
  const checkbox = settings.locator('input[type="checkbox"]'); const checked = await checkbox.isChecked();
  await checkbox.locator('..').locator('span').first().click(); await expect(checkbox).toBeChecked({ checked: !checked });
  await page.keyboard.press('Escape'); await expect(settings).toHaveCount(0);
  if (!desktop) expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});
