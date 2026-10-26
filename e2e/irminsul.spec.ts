import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { stageFixture } from '../src/dev/fixtures';
import { stageVisitIds } from '../src/data/visits';
import { E_SKILL_PATTERN } from '../src/data/assets';
import { DIALOGUE_ENTRIES } from '../src/data/dialogues';
import type { GameSave } from '../src/types/game';
import { finishOpening } from './opening-support';
import { finishSceneEntrance } from './scene-support';
import { mockServerTime } from './time-support';

const OPEN = '2026-10-27T13:27:00+08:00';
const key = (info: TestInfo) => info.project.name.startsWith('production') ? 'irminsul.player.v2' : 'irminsul.development.v2';
async function launch(page: Page, info: TestInfo, stage: 'C' | 'G', patch: Partial<GameSave> = {}) {
  await mockServerTime(page, OPEN); await page.clock.install({ time: new Date(OPEN) }); await page.clock.pauseAt(new Date(Date.parse(OPEN) + 1000));
  const fixture = stageFixture(stage, Date.parse(OPEN));
  const save = { ...fixture, growth: stage === 'C' ? 380 : fixture.growth, dew: 80, completedVisits: stage === 'C' ? [...fixture.completedVisits, ...stageVisitIds('C')] : fixture.completedVisits, settings: { ...fixture.settings, music: false }, ...patch };
  await page.addInitScript(({ save, key, now }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(save));
    localStorage.setItem('irminsul.notice.seen.v1', '1');
    sessionStorage.setItem('irminsul.development.clock', JSON.stringify({ offset: Date.parse(now) - Date.now(), simulated: true }));
    Math.random = () => .99;
  }, { save, key: key(info), now: OPEN });
  await page.goto('/'); await finishOpening(page, true); await finishSceneEntrance(page, true); await page.clock.runFor(6000);
  mkdirSync('artifacts/irminsul', { recursive: true });
}

async function redeem(page: Page, code: string, touch: boolean) {
  if (touch) {
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.locator('.hidden-code-entry input').fill(code);
    await expect(page.locator('.hidden-code-entry input')).toHaveValue('');
    await page.getByRole('button', { name: '关闭', exact: true }).click();
  } else { await page.keyboard.type(code); }
}

test('Irminsul沿同等成长切换、浇灌和暂停续播，刷新恢复正式树', async ({ page, isMobile }, info) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await launch(page, info, 'C');
  const original = await page.evaluate((key) => localStorage.getItem(key), key(info));
  const imageTree = await page.locator('.dream-tree').getAttribute('data-tree-index');
  await redeem(page, 'I-r-m-i-n-s-u-l', isMobile);
  await expect(page.locator('.dream-tree')).toHaveAttribute('data-tree-style', 'procedural');
  await expect(page.locator('.dream-tree')).toHaveAttribute('data-tree-index', imageTree!);
  await expect(page.locator('.procedural-tree-art')).toBeVisible(); await expect(page.locator('.dream-tree image')).toHaveCount(1);
  expect(await page.evaluate((key) => localStorage.getItem(key), key(info))).toBe(original);
  await page.screenshot({ path: `artifacts/irminsul/${info.project.name}-procedural.png` });
  await page.getByRole('button', { name: '梦中的树', exact: true }).press('Enter');
  await expect(page.locator('.dialogue-bubble[data-speaker=tree]')).toBeVisible();
  await page.getByRole('button', { name: '浇灌梦中的树', exact: true }).click(); await page.clock.runFor(850);
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const held = await page.locator('.dream-tree').getAttribute('data-tree-time');
  await page.locator('.hidden-code-entry input').fill('IRminsul');
  await expect(page.locator('.dream-tree')).toHaveAttribute('data-tree-style', 'irminsul');
  await page.clock.runFor(15000); await expect(page.locator('.dream-tree')).toHaveAttribute('data-tree-time', held!);
  await page.getByRole('button', { name: '关闭', exact: true }).click(); await page.clock.runFor(4000);
  const grown = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), key(info));
  expect(grown.growth).toBe(400); expect(grown.dew).toBe(60); expect(grown).not.toHaveProperty('proceduralTree');
  await redeem(page, 'Irminsul', isMobile); await expect(page.locator('.dream-tree')).toHaveAttribute('data-tree-style', 'procedural');
  await page.reload(); await finishOpening(page, true); await expect(page.locator('.dream-tree')).toHaveAttribute('data-tree-style', 'irminsul');
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).growth, key(info))).toBe(400);
  expect(errors).toEqual([]);
});

test('公告底部标语单行显示，新N01按原祝福流程和分段播放', async ({ page }, info) => {
  await launch(page, info, 'G', { dialogueDecks: { 'G/wish': ['U01'], 'G/reply': ['N01'] } });
  await page.getByRole('button', { name: '公告与声明', exact: true }).click();
  const slogan = page.locator('.notice-tagline p'); await slogan.scrollIntoViewIfNeeded();
  await expect(slogan).toHaveText('曾有梦编织树荫，成为求知者的栖所。');
  const layout = await slogan.evaluate((element) => { const style = getComputedStyle(element); const parent = element.closest('article')!; return { height: element.getBoundingClientRect().height, line: parseFloat(style.lineHeight), width: element.getBoundingClientRect().width, available: parent.getBoundingClientRect().width, font: parseFloat(style.fontSize), body: parseFloat(getComputedStyle(parent).fontSize), last: element.closest('footer') === parent.lastElementChild }; });
  expect(layout.height).toBeCloseTo(layout.line, 0); expect(layout.width).toBeLessThanOrEqual(layout.available + 1); expect(layout.font).toBeGreaterThan(layout.body); expect(layout.last).toBe(true);
  await page.screenshot({ path: `artifacts/irminsul/${info.project.name}-notice.png` });
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: '送上生日祝福', exact: true }).click();
  const segments = new Map<string, string>();
  for (let elapsed = 0; elapsed < 50000; elapsed += 100) {
    await page.clock.runFor(100);
    const bubble = page.locator('.dialogue-bubble[data-speaker=nahida][data-theme=celebration]');
    if (!await bubble.count()) continue;
    const segment = (await bubble.getAttribute('data-segment'))!;
    const text = await bubble.locator('.bubble-text > .sr-only').textContent();
    if (text) segments.set(segment, text);
    if ([...segments.values()].join('') === DIALOGUE_ENTRIES.N01.text) break;
  }
  expect([...segments.values()].join('')).toBe(DIALOGUE_ENTRIES.N01.text);
  expect(segments.size).toBeLessThanOrEqual(2); expect([...segments.values()].join('')).not.toMatch(/\[(?:179|79)\]/);
  await page.screenshot({ path: `artifacts/irminsul/${info.project.name}-N01.png` });
});

test('技能四角独立完整，珠链无花瓣残片，仍使用原世界几何', async ({ page }, info) => {
  await launch(page, info, 'C');
  const metrics = await page.evaluate(async (pattern) => {
    const image = await createImageBitmap(await (await fetch(pattern.texture)).blob());
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0); image.close();
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    return pattern.pieces.filter((piece) => piece.name.startsWith('corner_')).map((piece) => {
      const [left, top, width, height] = piece.region; let count = 0; let outside = 0;
      for (let vertical = 0; vertical < height; vertical++) for (let horizontal = 0; horizontal < width; horizontal++) if (pixels[((top + vertical) * canvas.width + left + horizontal) * 4 + 3] >= 64) {
        count++; if (horizontal < 30 || horizontal >= width - 30 || vertical < 30 || vertical >= height - 30) outside++;
      }
      return { name: piece.name, count, outside };
    });
  }, E_SKILL_PATTERN);
  expect(metrics).toHaveLength(4); for (const metric of metrics) { expect(metric.count).toBeGreaterThan(2500); expect(metric.outside).toBe(0); }
  expect(new Set(metrics.map((entry) => entry.count)).size).toBe(1);
});
