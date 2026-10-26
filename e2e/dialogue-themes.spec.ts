import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { stageFixture } from '../src/dev/fixtures';
import type { GameSave, StageId } from '../src/types/game';
import type { DialogueTheme } from '../src/game/dialogue/dialogueTheme';
import { DIALOGUE_POOLS } from '../src/data/dialogues';
import pageAssets from '../src/data/pageAssets.generated.json' with { type: 'json' };
import { mockServerTime } from './time-support';
import { finishOpening } from './opening-support';
import { finishSceneEntrance } from './scene-support';

const OPEN = '2026-10-27T13:27:00+08:00';
const failures = new WeakMap<Page, string[]>();
const initialized = new WeakSet<Page>();
test.beforeEach(({ page }) => { const errors: string[] = []; failures.set(page, errors); page.on('pageerror', (error) => errors.push(error.message)); });
test.afterEach(({ page }) => expect(failures.get(page)).toEqual([]));
const bubble = (page: Page) => page.locator('.dialogue-bubble');

async function launch(page: Page, info: TestInfo, stage: StageId = 'A', patch: Partial<GameSave> = {}) {
  const fixture = stageFixture(stage, Date.parse(OPEN));
  const setup = { save: { ...fixture, ...patch, settings: { ...fixture.settings, music: false } }, storage: info.project.name.startsWith('production') ? 'irminsul.player.v2' : 'irminsul.development.v2', date: Date.parse(OPEN) };
  if (!initialized.has(page)) {
    initialized.add(page);
    await mockServerTime(page, OPEN); await page.clock.install({ time: new Date(OPEN) }); await page.clock.pauseAt(new Date(Date.parse(OPEN) + 1000));
    await page.addInitScript(({ save, storage, date }) => {
      if (!localStorage.getItem(storage)) localStorage.setItem(storage, JSON.stringify(save));
      sessionStorage.setItem('irminsul.development.clock', JSON.stringify({ offset: date - Date.now(), simulated: true }));
      Reflect.set(window, '__themeRoll', 0.99); Math.random = () => Reflect.get(window, '__themeRoll');
    }, setup);
  } else await page.evaluate(({ save, storage }) => localStorage.setItem(storage, JSON.stringify(save)), setup);
  await page.goto('/'); await finishOpening(page, true); await finishSceneEntrance(page, true); await page.mouse.move(1, 1);
  await page.evaluate(() => document.fonts.load('14px Irminsul', '梦中的世界树纳西妲'));
}

async function until(page: Page, condition: () => Promise<boolean>, duration = 60000) {
  for (let elapsed = 0; elapsed < duration && !await condition(); elapsed += 100) await page.clock.fastForward(100);
  expect(await condition()).toBe(true);
}
async function drain(page: Page) { await until(page, async () => await bubble(page).count() === 0 && await page.locator('.nahida-companion').count() === 0); }

test('最新机制对白使用红色框并按原规则分段完整播放', async ({ page }, info) => {
  for (const id of ['X04', 'X11', 'X15']) {
    await launch(page, info, 'D', { dialogueDecks: { 'shared/mechanism': [id] } });
    await drain(page); await tree(page, .3);
    await expect(bubble(page)).toHaveAttribute('data-theme', 'mechanism');
    const entry = DIALOGUE_POOLS['shared/mechanism'].find((line) => line.id === id)!;
    if (id === 'X11') expect(entry.text).toContain('2026-10-27 13:27');
    const texts: string[] = [];
    await until(page, async () => await bubble(page).getAttribute('data-phase') === 'holding');
    const segments = Number(await bubble(page).getAttribute('data-segments'));
    expect(segments).toBeLessThanOrEqual(2);
    for (let segment = 1; segment <= segments; segment += 1) {
      await until(page, async () => await bubble(page).getAttribute('data-segment') === String(segment) && await bubble(page).getAttribute('data-phase') === 'holding');
      texts.push(await bubble(page).locator('.bubble-text > [aria-hidden]').innerText());
      await inspect(page, 'mechanism');
      if (segment < segments) await page.clock.fastForward(751);
    }
    expect(texts.join('').replaceAll('\n', '')).toBe(entry.text);
    await capture(page, info, `mechanism-${id}`);
  }
});
async function tree(page: Page, roll: number) { await page.evaluate((roll) => Reflect.set(window, '__themeRoll', roll), roll); await page.getByRole('button', { name: '梦中的树', exact: true }).press('Enter'); }
async function capture(page: Page, info: TestInfo, name: string) {
  mkdirSync('artifacts/dialogue-themes', { recursive: true }); await page.screenshot({ path: `artifacts/dialogue-themes/${info.project.name}-${name}.png` });
}

async function inspect(page: Page, theme: DialogueTheme) {
  await expect(bubble(page)).toHaveAttribute('data-theme', theme);
  await until(page, async () => await bubble(page).getAttribute('data-phase') === 'holding');
  const layout = await bubble(page).evaluate((element) => {
    const paragraph = element.querySelector<HTMLElement>('.bubble-text')!; const name = element.querySelector<HTMLElement>('.bubble-name')!;
    const style = getComputedStyle(element); const body = getComputedStyle(paragraph); const nameStyle = getComputedStyle(name);
    const range = document.createRange(); range.selectNodeContents(paragraph.querySelector('[aria-hidden]')!);
    const paper = document.createElement('span'); paper.style.color = style.getPropertyValue('--bubble-paper'); element.append(paper);
    const background = getComputedStyle(paper).color; paper.remove();
    return {
      height: element.getBoundingClientRect().height, width: element.getBoundingClientRect().width, rows: new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size,
      textHeight: paragraph.getBoundingClientRect().height, lineHeight: parseFloat(body.lineHeight), clipped: paragraph.scrollHeight > paragraph.clientHeight + 1,
      ink: body.color, name: nameStyle.color, weight: Number(nameStyle.fontWeight), background, backgroundImage: style.backgroundImage,
    };
  });
  const luminance = (color: string) => {
    const channels = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map((value) => value / 255).map((value) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
  };
  const contrast = (color: string) => { const values = [luminance(color), luminance(layout.background)].sort((first, second) => second - first); return (values[0] + .05) / (values[1] + .05); };
  expect(contrast(layout.ink)).toBeGreaterThanOrEqual(7); expect(contrast(layout.name)).toBeGreaterThanOrEqual(4.5);
  expect(layout.textHeight).toBeCloseTo(layout.lineHeight * 2, 1); expect(layout.rows).toBeLessThanOrEqual(2); expect(layout.clipped).toBe(false); expect(layout.weight).toBeGreaterThanOrEqual(700);
  expect(layout.width).toBe(page.viewportSize()!.height <= 600 ? 236 : 326);
  if (page.viewportSize()!.height <= 600) expect(layout.height).toBeLessThan(80);
  expect(layout.backgroundImage.includes(pageAssets.dialogue)).toBe(theme === 'nahida');
  await expect(bubble(page).locator('.bubble-decoration')).toHaveAttribute('aria-hidden', 'true');
  await expect(bubble(page).locator('.celebration-bow')).toHaveCount(theme === 'celebration' ? 1 : 0);
  await expect(bubble(page).getByRole('button')).toHaveCount(0);
  return { theme, html: await bubble(page).evaluate((element) => element.outerHTML), height: layout.height };
}

test('五套实际对白气泡统一骨架、分池配色、两行与对比，并生成实景样式图板', async ({ page }, info) => {
  test.setTimeout(120000);
  const frames: { theme: DialogueTheme; html: string; height: number }[] = [];
  await launch(page, info, 'A', { dialogueDecks: { 'A/story': [DIALOGUE_POOLS['A/story'][0].id], 'shared/mechanism': ['X01'] } });
  frames.push(await inspect(page, 'forest')); await capture(page, info, 'forest'); await drain(page);
  await tree(page, .12); frames.push(await inspect(page, 'story')); await capture(page, info, 'story'); await drain(page);
  await tree(page, .18); frames.push(await inspect(page, 'mechanism')); await capture(page, info, 'mechanism');
  expect(new Set(frames.map((frame) => frame.height)).size).toBe(1);
  await launch(page, info, 'C', { pendingVisits: ['visit-C'] });
  await until(page, async () => await bubble(page).getAttribute('data-speaker') === 'nahida');
  frames.push(await inspect(page, 'nahida')); await capture(page, info, 'nahida');
  await launch(page, info, 'G'); await page.getByRole('button', { name: '送上生日祝福', exact: true }).click();
  await until(page, async () => await bubble(page).getAttribute('data-speaker') === 'nahida');
  frames.push(await inspect(page, 'celebration')); await capture(page, info, 'celebration');
  await page.evaluate((frames) => {
    const compact = window.innerHeight <= 600; const width = compact ? 236 : 326; const gap = compact ? 24 : 36; const height = Math.max(...frames.map((frame) => frame.height));
    const board = document.createElement('div'); board.setAttribute('aria-hidden', 'true');
    Object.assign(board.style, { position: 'absolute', zIndex: '60', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: `${width * 2 + gap}px`, height: `${height * 3 + gap * 2}px`, pointerEvents: 'none' });
    frames.forEach((frame, index) => {
      const template = document.createElement('template'); template.innerHTML = frame.html; const element = template.content.firstElementChild as HTMLElement;
      Object.assign(element.style, { position: 'absolute', width: `${width}px`, left: `${index === 4 ? (width + gap) / 2 : index % 2 * (width + gap)}px`, top: `${Math.floor(index / 2) * (height + gap)}px`, bottom: 'auto' });
      element.classList.remove('bubble-right', 'bubble-bottom'); element.classList.add('bubble-left'); element.querySelector('.bubble-dialogue-id')?.remove(); board.append(element);
    });
    document.querySelectorAll<HTMLElement>('.dialogue-bubble').forEach((element) => { element.style.visibility = 'hidden'; });
    document.querySelector('.game-app')!.append(board);
  }, frames);
  await capture(page, info, 'five-themes');
});

test('常态与欢迎共用森林框，稀有外观不影响原编号、配额或连续触树', async ({ page }, info) => {
  await launch(page, info); await inspect(page, 'forest'); await drain(page);
  for (const [roll, theme] of [[.99, 'forest'], [.12, 'story'], [.12, 'story'], [.12, 'forest'], [.18, 'mechanism'], [.18, 'forest']] as const) {
    await tree(page, roll); await expect(bubble(page)).toHaveAttribute('data-theme', theme);
    if (info.project.name.startsWith('production')) await expect(bubble(page).locator('.bubble-dialogue-id')).toHaveCount(0);
    else await expect(bubble(page).locator('.bubble-dialogue-id')).toHaveAttribute('aria-hidden', 'true');
    await drain(page);
  }
  await expect(page.getByRole('button', { name: '浇灌梦中的树', exact: true })).toBeEnabled();
  await expect(page.locator('.nahida-companion')).toHaveCount(0);
});

test('现实用户与回复使用同一明亮祝福框，日常仍用草纹且遵循二十秒机制', async ({ page }, info) => {
  await launch(page, info, 'G'); await page.getByRole('button', { name: '送上生日祝福', exact: true }).click();
  await until(page, async () => await bubble(page).getAttribute('data-speaker') === 'user'); const user = await inspect(page, 'celebration');
  await until(page, async () => await bubble(page).getAttribute('data-speaker') === 'nahida'); const reply = await inspect(page, 'celebration');
  expect(user.height).toBe(reply.height); await drain(page);
  await page.getByRole('button', { name: '和纳西妲聊天', exact: true }).click(); await inspect(page, 'nahida'); await drain(page);
  await page.mouse.click(10, 120); await page.clock.fastForward(19999); await expect(bubble(page)).toHaveCount(0);
  await page.clock.fastForward(1); await expect(bubble(page)).toHaveAttribute('data-theme', 'nahida');
});

test('640 横屏不增高或裁字，强制色模式保留五套正文而隐藏装饰', async ({ page }, info) => {
  await page.setViewportSize({ width: 640, height: 360 }); await launch(page, info); await inspect(page, 'forest');
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  for (const theme of ['forest', 'story', 'mechanism', 'nahida', 'celebration']) {
    await bubble(page).evaluate((element, theme) => { (element as HTMLElement).dataset.theme = theme; }, theme);
    await expect(bubble(page).locator('.bubble-decoration')).toHaveCSS('display', 'none');
    const colors = await bubble(page).evaluate((element) => ({ ink: getComputedStyle(element).color, paper: getComputedStyle(element).backgroundColor }));
    expect(colors.ink).not.toBe(colors.paper); expect(colors.paper).not.toBe('rgba(0, 0, 0, 0)');
  }
});
