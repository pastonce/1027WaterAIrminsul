import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import ts from 'typescript';
import { DIALOGUE_ENTRIES } from '../src/data/dialogues';
import { DIALOGUE_LAYOUT } from '../src/data/dialogueLayout';
import { PRESENTATION_RULES } from '../src/data/presentation';
import { stageFixture } from '../src/dev/fixtures';
import type { GameSave, StageId } from '../src/types/game';
import { finishOpening } from './opening-support';
import { finishSceneEntrance } from './scene-support';
import { mockServerTime } from './time-support';

const OPEN = '2026-10-27T10:27:00+08:00';
const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => { const errors: string[] = []; pageErrors.set(page, errors); page.on('pageerror', (error) => errors.push(error.message)); });
test.afterEach(({ page }) => { expect(pageErrors.get(page)).toEqual([]); });
const storageKey = (info: TestInfo) => info.project.name.startsWith('production') ? 'irminsul.player.v2' : 'irminsul.development.v2';
const bubble = (page: Page) => page.locator('.dialogue-bubble');
async function launch(page: Page, info: TestInfo, stage: StageId = 'A', patch: Partial<GameSave> = {}) {
  await mockServerTime(page, OPEN); const now = new Date(OPEN);
  await page.clock.install({ time: now }); await page.clock.pauseAt(new Date(now.getTime() + 1000));
  const save = { ...stageFixture(stage, now.getTime()), ...patch };
  await page.addInitScript(({ save, key, date }) => {
    localStorage.setItem(key, JSON.stringify(save));
    sessionStorage.setItem('irminsul.development.clock', JSON.stringify({ offset: date - Date.now(), simulated: true }));
    Math.random = () => 0.99;
  }, { save, key: storageKey(info), date: now.getTime() });
  await page.goto('/'); await finishOpening(page, true); await finishSceneEntrance(page, true); await page.mouse.move(1, 1);
  await expect(page.getByTestId(stage === 'G' ? 'reality-scene' : 'dream-scene')).toBeVisible();
}
async function until(page: Page, condition: () => Promise<boolean>, maximum = 40000) {
  for (let elapsed = 0; elapsed < maximum && !await condition(); elapsed += 50) await page.clock.fastForward(50);
  expect(await condition()).toBe(true);
}
async function waitHolding(page: Page) { await until(page, async () => await bubble(page).getAttribute('data-phase') === 'holding'); }
async function save(page: Page, info: TestInfo): Promise<GameSave> { return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), storageKey(info)); }
async function capture(page: Page, info: TestInfo, name: string) {
  mkdirSync('artifacts/speech-playback', { recursive: true });
  await page.screenshot({ path: `artifacts/speech-playback/${info.project.name}-${name}.png` });
}
async function layout(page: Page) {
  return bubble(page).evaluate((element) => {
    const paragraph = element.querySelector('.bubble-text')!; const style = getComputedStyle(paragraph);
    const text = paragraph.querySelector('[aria-hidden]')!; const range = document.createRange(); range.selectNodeContents(text);
    return {
      height: element.getBoundingClientRect().height, body: paragraph.getBoundingClientRect().height,
      lineHeight: parseFloat(style.lineHeight), rows: new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size,
      clipped: paragraph.scrollHeight > paragraph.clientHeight + 1,
    };
  });
}

test('树名加粗，短句始终保留两行高度，淡出期间仍可收露浇灌', async ({ page }, info) => {
  await launch(page, info); await expect(bubble(page).locator('.bubble-name')).toHaveText('梦中的世界树？');
  expect(await bubble(page).locator('.bubble-name').evaluate((element) => Number(getComputedStyle(element).fontWeight))).toBeGreaterThanOrEqual(700);
  const start = await layout(page); await page.clock.runFor(300); expect((await layout(page)).height).toBe(start.height);
  const fontSize = await bubble(page).locator('.bubble-text').evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
  const width = (await bubble(page).boundingBox())!.width;
  if (page.viewportSize()!.height <= 600) { expect(fontSize).toBe(10.5); expect(width).toBe(236); expect(start.height).toBeLessThan(80); }
  else { expect(fontSize).toBe(14); expect(width).toBe(326); }
  await waitHolding(page); const holding = await layout(page); expect(holding.height).toBe(start.height);
  expect(holding.body).toBeCloseTo(holding.lineHeight * 2, 1); expect(holding.rows).toBeLessThanOrEqual(2); expect(holding.clipped).toBe(false);
  await capture(page, info, 'tree'); await page.clock.runFor(PRESENTATION_RULES.minimumHoldMs);
  await expect(bubble(page)).toHaveAttribute('data-phase', 'fading'); expect((await layout(page)).height).toBe(start.height);
  await page.clock.runFor(200); const opacity = await bubble(page).evaluate((element) => Number(getComputedStyle(element).opacity));
  expect(opacity).toBeLessThan(1); expect(opacity).toBeGreaterThan(0);
  await page.clock.runFor(250); await expect(bubble(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: '浇灌梦中的树', exact: true })).toBeEnabled();
});

test('长句按实际字体分成两段，所有段高度一致、均不超过两行', async ({ page }, info) => {
  await launch(page, info, 'G', { dialogueDecks: { 'G/nahida': ['G6N'] } });
  await page.getByRole('button', { name: '和纳西妲聊天', exact: true }).click(); await page.mouse.move(1, 1);
  await expect(bubble(page)).toHaveAttribute('data-segment', '1');
  const count = Number(await bubble(page).getAttribute('data-segments')); expect(count).toBe(2);
  const height = (await layout(page)).height; const parts: string[] = [];
  for (let index = 1; index <= count; index++) {
    await expect(bubble(page)).toHaveAttribute('data-segment', `${index}`); await waitHolding(page);
    parts.push((await bubble(page).locator('.bubble-text .sr-only').textContent())!);
    const measured = await layout(page); expect(measured.height).toBe(height); expect(measured.rows).toBeLessThanOrEqual(2); expect(measured.clipped).toBe(false);
    await capture(page, info, `long-${index}`);
    if (index < count) await page.clock.runFor(PRESENTATION_RULES.segmentHoldMs);
  }
  expect(parts.join('')).toBe(DIALOGUE_ENTRIES.G6N.text);
  await page.clock.runFor(PRESENTATION_RULES.minimumHoldMs - 100); await expect(bubble(page)).toHaveAttribute('data-phase', 'holding');
  await page.clock.runFor(PRESENTATION_RULES.fadeMs + 100); await expect(bubble(page)).toHaveCount(0);
});

test('鼠标悬停保留对白，移开后重新停留完整时间，手机触摸不锁死', async ({ page }, info) => {
  await launch(page, info); await waitHolding(page); await page.clock.runFor(1000);
  const bounds = (await bubble(page).boundingBox())!; await page.mouse.move(bounds.x + 20, bounds.y + 20);
  await page.clock.runFor(6000); await expect(bubble(page)).toHaveAttribute('data-phase', 'holding');
  await page.mouse.move(1, 1); await page.clock.runFor(PRESENTATION_RULES.minimumHoldMs - 1); await expect(bubble(page)).toHaveAttribute('data-phase', 'holding');
  await page.clock.runFor(451); await expect(bubble(page)).toHaveCount(0);
  await page.getByRole('button', { name: '梦中的树', exact: true }).press('Enter'); await waitHolding(page);
  if (info.project.use.hasTouch) { const touch = (await bubble(page).boundingBox())!; await page.touchscreen.tap(touch.x + 20, touch.y + 20); }
  await page.clock.runFor(PRESENTATION_RULES.minimumHoldMs + PRESENTATION_RULES.fadeMs); await expect(bubble(page)).toHaveCount(0);
});

test('对白分段共用原 ID，长来访播完所有段后才施法祝福，缩窗不截字', async ({ page }, info) => {
  await launch(page, info, 'E', { pendingVisits: ['visit-E'], visitLines: { 'visit-E': { dialogueId: 'E6N', read: false } } });
  await until(page, async () => await page.locator('.dialogue-bubble[data-speaker=nahida]').count() === 1);
  await page.setViewportSize({ width: 640, height: 360 }); await page.clock.runFor(50);
  const count = Number(await bubble(page).getAttribute('data-segments')); expect(count).toBe(2);
  for (let index = 1; index <= count; index++) {
    await expect(bubble(page)).toHaveAttribute('data-segment', `${index}`); await waitHolding(page);
    const measured = await layout(page); expect(measured.rows).toBeLessThanOrEqual(2); expect(measured.clipped).toBe(false);
    expect((await save(page, info)).visitLines['visit-E'].read).toBe(false); await expect(page.locator('.dendro-blessing')).toHaveCount(0);
    if (index < count) await page.clock.runFor(PRESENTATION_RULES.segmentHoldMs);
  }
  await capture(page, info, 'visit-compact'); await page.clock.runFor(PRESENTATION_RULES.minimumHoldMs + PRESENTATION_RULES.fadeMs);
  await expect(page.locator('.dendro-blessing')).toHaveAttribute('data-phase', 'channel');
  expect((await save(page, info)).visitLines['visit-E'].read).toBe(true);
  await page.clock.runFor(1500); expect((await save(page, info)).blessedVisits).toContain('visit-E');
});

test('参考句恰好两行，整套原文最多两段且每段不超过两行', async ({ page }, info) => {
  await launch(page, info, 'G', { dialogueDecks: { 'G/nahida': ['G6N'] } });
  await page.getByRole('button', { name: '和纳西妲聊天', exact: true }).click(); await page.mouse.move(1, 1);
  const source = ts.transpileModule(readFileSync('src/game/dialogue/textPlayback.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const failures = await bubble(page).evaluate((element, { source, entries, layout }) => {
    const exports: { splitDialogue?: (text: string, fits: (part: string) => boolean) => string[] } = {};
    new Function('exports', 'require', source)(exports, () => ({ DIALOGUE_LAYOUT: layout }));
    const measurement = element.querySelector('.bubble-measure') as HTMLElement;
    const paragraph = element.querySelector('.bubble-text')!; const lineHeight = parseFloat(getComputedStyle(paragraph).lineHeight);
    const failures: string[] = [];
    for (const width of [paragraph.getBoundingClientRect().width]) {
      measurement.style.width = `${width}px`;
      const fits = (part: string) => { measurement.textContent = part; return measurement.getBoundingClientRect().height <= lineHeight * 2 + 0.5; };
      measurement.textContent = layout.reference;
      if (Math.abs(measurement.getBoundingClientRect().height - lineHeight * 2) > 0.5) failures.push('reference-not-two-lines');
      for (const entry of entries) {
        const parts = exports.splitDialogue!(entry.text, fits);
        if (parts.length > 2 || parts.join('') !== entry.text || parts.some((part) => !fits(part))) failures.push(`${width}:${entry.id}`);
      }
    }
    return failures;
  }, { source, layout: DIALOGUE_LAYOUT, entries: Object.values(DIALOGUE_ENTRIES).map(({ id, text }) => ({ id, text })) });
  expect(failures).toEqual([]);
});

test('实际打字在逗号轻停、问叹长停，段尾不额外加标点停顿', async ({ page }, info) => {
  await launch(page, info, 'G', { dialogueDecks: { 'G/reply': ['N06'] } });
  await page.getByRole('button', { name: '送上生日祝福', exact: true }).click();
  await until(page, async () => await bubble(page).count() > 0 && await bubble(page).getAttribute('data-speaker') === 'nahida');
  const text = bubble(page).locator('.bubble-text > [aria-hidden=true]');
  await until(page, async () => await text.textContent() === '呵呵，');
  await page.clock.runFor(100); await expect(text).toHaveText('呵呵，');
  await page.clock.runFor(200); expect((await text.textContent())!.length).toBeGreaterThan(3);
  await until(page, async () => await text.textContent() === '呵呵，谢谢你！');
  await page.clock.runFor(260); await expect(text).toHaveText('呵呵，谢谢你！');
  await page.clock.runFor(300); expect((await text.textContent())!.length).toBeGreaterThan('呵呵，谢谢你！'.length);
});
