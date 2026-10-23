import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { stageFixture } from '../src/dev/fixtures';
import { finishOpening } from './opening-support';
import { mockServerTime } from './time-support';
import { BIRTHDAY_LETTERS, MAIL_ASSETS } from '../src/data/birthdayMail';

const OPEN = '2026-10-27T10:27:00+08:00';
const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => { const list: string[] = []; errors.set(page, list); page.on('pageerror', (error) => list.push(error.message)); });
test.afterEach(({ page }) => { expect(errors.get(page)).toEqual([]); });
const key = (info: TestInfo) => info.project.name.startsWith('production') ? 'irminsul.player.v2' : 'irminsul.development.v2';
async function launch(page: Page, info: TestInfo, reduced = false) {
  await mockServerTime(page, OPEN);
  const now = new Date(OPEN); await page.clock.install({ time: now }); await page.clock.pauseAt(new Date(now.getTime() + 1000));
  const fixture = stageFixture('G', now.getTime());
  await page.addInitScript(({ save, key, date }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(save));
    sessionStorage.setItem('irminsul.development.clock', JSON.stringify({ offset: Date.parse(date) - Date.now(), simulated: true }));
  }, { save: { ...fixture, settings: { ...fixture.settings, reducedMotion: reduced } }, key: key(info), date: OPEN });
  await page.goto('/'); await finishOpening(page, true);
  await expect(page.getByTestId('reality-scene')).toBeVisible();
  await expect.poll(async () => { await page.clock.runFor(50); return page.locator('.nahida-avatar').getAttribute('data-renderer'); }, { timeout: 20000 }).toMatch(/ready|fallback/);
}
async function open(page: Page, year = 2023, reduced = false) {
  await page.getByRole('button', { name: `展开 ${year} 年生日来信`, exact: true }).click();
  await page.clock.runFor(reduced ? 250 : 1000);
  const book = page.getByTestId('birthday-mail'); await expect(book).toHaveAttribute('data-phase', 'reading'); return book;
}
async function picture(page: Page, info: TestInfo, name: string) {
  mkdirSync('artifacts/birthday-mail', { recursive: true }); await page.screenshot({ path: `artifacts/birthday-mail/${info.project.name}-${name}.png` });
}
async function next(page: Page, name = '下一年') {
  await page.getByRole('button', { name, exact: true }).click(); await page.clock.runFor(750);
}

test('四封来信在祝福上方，原书页 / 叶形按钮循环四年，正文完整且不裁贺图', async ({ page }, info) => {
  await launch(page, info); await expect(page.locator('.birthday-envelope')).toHaveCount(4);
  const row = await page.locator('.birthday-envelopes').boundingBox(); const wish = await page.getByRole('button', { name: '送上生日祝福', exact: true }).boundingBox();
  expect(row!.y + row!.height).toBeLessThan(wish!.y); await picture(page, info, 'envelopes');
  const canvases = await page.locator('canvas').count(); const background = await page.locator('.atmosphere img').first().getAttribute('src');
  const book = await open(page); await expect(page.locator('.game-content')).toHaveAttribute('inert', '');
  await expect(page.locator('.mail-art-frame > img')).toHaveCSS('object-fit', 'contain');
  await expect.poll(() => page.locator('.mail-art-frame > img').evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(book).toHaveAttribute('data-year', '2023'); await expect(book.getByRole('heading', { name: BIRTHDAY_LETTERS[0].title, exact: true })).toBeVisible(); await picture(page, info, '2023');
  for (const year of [2024, 2025, 2026, 2023]) { await next(page); await expect(book).toHaveAttribute('data-year', String(year)); }
  await next(page, '上一年'); await expect(book).toHaveAttribute('data-year', '2026'); await expect(page.locator('.mail-art-placeholder')).toContainText('贺图尚未发布');
  await expect(book).toContainText('这封生日邮件尚未公开。'); await picture(page, info, '2026-placeholder');
  await next(page, '2024 年'); await expect(book).toHaveAttribute('data-year', '2024');
  const text = page.locator('.mail-letter-scroll');
  for (const paragraph of [...BIRTHDAY_LETTERS[1].mail, ...BIRTHDAY_LETTERS[1].reply]) await expect(text).toContainText(paragraph);
  await text.evaluate((element) => { element.scrollTop = element.scrollHeight; }); await picture(page, info, '2024-reply');
  await expect(page.locator('canvas')).toHaveCount(canvases); expect(await page.locator('.atmosphere img').first().getAttribute('src')).toBe(background);
  await page.setViewportSize({ width: 640, height: 360 }); await page.clock.runFor(100); await expect(page.locator('.mail-book-flight')).toBeInViewport(); await expect(page.getByRole('button', { name: '收起生日来信' })).toBeInViewport(); await picture(page, info, '640');
});

test('收页返回原信封再合上，读信不消耗闲置时钟或写已读，完成后才恢复交互', async ({ page }, info) => {
  await launch(page, info); const before = await page.evaluate((key) => localStorage.getItem(key), key(info));
  const book = await open(page, 2024); await next(page); await page.clock.runFor(60000);
  expect(await page.evaluate((key) => localStorage.getItem(key), key(info))).toBe(before); await expect(page.locator('.dialogue-bubble')).toHaveCount(0);
  await page.getByRole('button', { name: '收起生日来信' }).click(); await expect(book).toHaveAttribute('data-phase', 'folding');
  await page.clock.runFor(350); await expect(book).toHaveAttribute('data-phase', 'returning'); await picture(page, info, 'returning');
  await page.clock.runFor(620); await expect(book).toHaveAttribute('data-phase', 'sealing'); await expect(page.locator('.game-content')).toHaveAttribute('inert', '');
  await page.clock.runFor(260); await expect(book).toHaveCount(0); await expect(page.locator('.game-content')).not.toHaveAttribute('inert');
  const origin = page.getByRole('button', { name: '展开 2024 年生日来信' }); await expect(origin).toBeFocused(); await expect(origin).toBeVisible();
  await page.clock.runFor(19000); await expect(page.locator('.dialogue-bubble')).toHaveCount(0);
  await page.clock.runFor(1000); await expect(page.locator('.dialogue-bubble')).toHaveAttribute('data-speaker', 'nahida');
});

test('键盘 / 滑动翻页，后台和竖屏暂停开合且不锁转屏，Escape 收信', async ({ page }, info) => {
  await launch(page, info); await page.getByRole('button', { name: '展开 2025 年生日来信' }).click(); await page.clock.runFor(500);
  const book = page.getByTestId('birthday-mail'); await expect(book).toHaveAttribute('data-phase', 'expanding');
  await page.setViewportSize({ width: 390, height: 844 }); await page.clock.runFor(15000); await expect(book).toHaveAttribute('data-paused', 'true'); await expect(book).toHaveAttribute('data-phase', 'expanding');
  await expect(page.getByRole('button', { name: /开启横屏体验/ })).toBeVisible();
  await page.setViewportSize(info.project.use.viewport!); await page.clock.runFor(500); await expect(book).toHaveAttribute('data-phase', 'reading');
  await page.keyboard.press('ArrowRight'); await page.clock.runFor(750); await expect(book).toHaveAttribute('data-year', '2026');
  await page.keyboard.press('ArrowRight'); await page.clock.runFor(750); await expect(book).toHaveAttribute('data-year', '2023');
  const art = page.locator('.mail-art-frame'); await art.dispatchEvent('pointerdown', { clientX: 220, clientY: 160 }); await art.dispatchEvent('pointerup', { clientX: 110, clientY: 170 }); await page.clock.runFor(750); await expect(book).toHaveAttribute('data-year', '2024');
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.clock.runFor(30000); await expect(book).toHaveAttribute('data-paused', 'true');
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect(book).toHaveAttribute('data-paused', 'false');
  await page.getByRole('button', { name: '收起生日来信' }).focus(); await page.keyboard.press('Shift+Tab');
  expect(await book.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape'); await page.clock.runFor(1230); await expect(book).toHaveCount(0);
});

test('缺图 / 缺书底安全回退，减少动态仍能收信和继续送祝福', async ({ page }, info) => {
  await page.route(`**${MAIL_ASSETS.book}`, (route) => route.abort()); await page.route('**/asserts/birthday-mail/2023-*', (route) => route.abort());
  await launch(page, info, true); const book = await open(page, 2023, true);
  await expect(book).toHaveAttribute('data-reduced', 'true'); await expect(page.locator('.mail-book')).toHaveAttribute('data-paper-failed', 'true');
  await expect(page.locator('.mail-art-placeholder')).toContainText('贺图暂时未能展开'); await expect(book.getByRole('heading', { name: BIRTHDAY_LETTERS[0].title })).toBeVisible();
  await picture(page, info, 'fallback'); await page.keyboard.press('Escape'); await page.clock.runFor(360); await expect(book).toHaveCount(0);
  await page.getByRole('button', { name: '送上生日祝福', exact: true }).click(); await expect(page.getByTestId('birthday-offering')).toBeVisible();
  for (const envelope of await page.locator('.birthday-envelope').all()) await expect(envelope).toBeDisabled();
});

test('展开中的刷新不保存读信状态，重进 G 仍是原页面', async ({ page }, info) => {
  await launch(page, info); await open(page, 2026); await page.reload(); await finishOpening(page, true);
  await expect(page.getByTestId('birthday-mail')).toHaveCount(0); await expect(page.getByTestId('reality-scene')).toBeVisible();
  await expect(page.getByRole('button', { name: '送上生日祝福', exact: true })).toBeEnabled(); await expect(page.locator('.birthday-envelope')).toHaveCount(4);
});
