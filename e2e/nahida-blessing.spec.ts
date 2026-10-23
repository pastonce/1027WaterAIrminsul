import { openSettings } from './settings-support';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { stageFixture } from '../src/dev/fixtures';
import { STAGES } from '../src/data/stages';
import { SCHEDULE } from '../src/data/schedule';
import { PRESENTATION_RULES } from '../src/data/presentation';
import { VISIT_EMITTERS, visitGrowth } from '../src/data/visits';
import { finishOpening } from './opening-support';
import { finishSceneEntrance } from './scene-support';
import type { DreamStageId, GameSave } from '../src/types/game';

const readSave = (page: Page): Promise<GameSave> => page.evaluate(() => JSON.parse(localStorage.getItem('irminsul.development.v2')!));

async function seed(page: Page, stage: DreamStageId, patch: Partial<GameSave> = {}) {
  const now = Date.parse(SCHEDULE[5].at);
  const fixture = stageFixture(stage, now);
  const save = { ...fixture, playedDialogues: [...fixture.playedDialogues, STAGES[stage].transition.id], ...patch };
  await page.goto('/');
  await finishOpening(page, true);
  await page.evaluate(({ save, now }) => {
    localStorage.setItem('irminsul.development.v2', JSON.stringify(save));
    sessionStorage.setItem('irminsul.development.clock', JSON.stringify({ offset: now - Date.now(), simulated: true }));
  }, { save, now });
  await page.reload();
  await finishOpening(page, true);
  await finishSceneEntrance(page, true);
  for (let attempt = 0; attempt < 40 && await page.locator('.dialogue-bubble[data-speaker=tree]').count(); attempt++) await page.clock.fastForward(250);
}

async function channel(page: Page) {
  for (let step = 0; step < 100 && await page.locator('.dendro-blessing[data-phase=channel]').count() === 0; step++) await page.clock.fastForward(500);
  await expect(page.locator('.dendro-blessing')).toHaveAttribute('data-phase', 'channel');
}

test('严格 0.1 抽选，倒数第二浇保底 E 剩余 12 由纳西妲补满', async ({ page }) => {
  await page.clock.install(); await page.addInitScript(() => { Math.random = () => Number(Reflect.get(window, '__visitTestRoll') ?? 0.99); });
  await seed(page, 'A', { growth: 26, wateringCounts: { A: 2 } });
  await page.evaluate(() => { Reflect.set(window, '__visitTestRoll', 0.1); }); await page.getByRole('button', { name: '浇灌梦中的树', exact: true }).click();
  expect((await readSave(page)).pendingVisits).toEqual([]);
  await seed(page, 'A', { growth: 26, wateringCounts: { A: 2 } });
  await page.evaluate(() => { Reflect.set(window, '__visitTestRoll', 0.099999); }); await page.getByRole('button', { name: '浇灌梦中的树', exact: true }).click();
  expect((await readSave(page)).pendingVisits).toEqual(['visit-A']);
  await seed(page, 'E', { growth: STAGES.E.growth.end - 25, wateringCounts: { E: 6 } });
  await page.getByRole('button', { name: '浇灌梦中的树', exact: true }).click();
  expect((await readSave(page)).growth).toBe(STAGES.E.growth.end - 12); expect((await readSave(page)).guaranteedVisits).toEqual(['visit-E']);
  await channel(page); await page.clock.fastForward(PRESENTATION_RULES.blessingTravelMs);
  expect((await readSave(page)).growth).toBe(STAGES.E.growth.end); expect((await readSave(page)).dew).toBe(0);
  await page.clock.fastForward(900); await page.clock.fastForward(8000); await page.clock.fastForward(500);
  expect((await readSave(page)).completedVisits.filter((id) => id.startsWith('visit-E'))).toEqual(['visit-E']);
  expect((await readSave(page)).pendingVisits).not.toContain('visit-E-2');
});

for (const narrow of [false, true]) test(`六阶段原向双落点、BDE 均在树左侧，身体发射点同步且气泡完整（${narrow ? '640×360' : '默认视口'}）`, async ({ page }, testInfo) => {
  test.setTimeout(120000); await page.clock.install(); mkdirSync('docs/screenshots/blessing', { recursive: true });
  const viewport = narrow ? { width: 640, height: 360 } : page.viewportSize()!;
  await page.setViewportSize(viewport);
  for (const stage of ['A', 'B', 'C', 'D', 'E', 'F'] as const) {
    const positions = [];
    for (const position of [0, 1] as const) {
      await seed(page, stage, { pendingVisits: [`visit-${stage}`], visitPositions: { [`visit-${stage}`]: position } });
      await page.clock.fastForward(800);
      await expect(page.locator('.nahida-avatar')).toHaveAttribute('data-renderer', 'ready', { timeout: 20000 });
      const character = (await page.locator('.nahida-companion').boundingBox())!;
      const bubble = (await page.locator('.dialogue-bubble[data-speaker=nahida]').boundingBox())!;
      expect(character.x).toBeGreaterThanOrEqual(0); expect(character.x + character.width).toBeLessThanOrEqual(viewport.width - 40);
      expect(character.y).toBeGreaterThanOrEqual(85); expect(character.y + character.height).toBeLessThanOrEqual(viewport.height - 18);
      expect(bubble.x).toBeGreaterThanOrEqual(0); expect(bubble.x + bubble.width).toBeLessThanOrEqual(viewport.width - 10); expect(bubble.y + bubble.height).toBeLessThanOrEqual(viewport.height - 10);
      expect(await page.locator('.nahida-companion').getAttribute('data-flipped')).toBeNull();
      const horizontalScale = await page.locator('.nahida-companion .spine-host').evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).a);
      expect(horizontalScale).toBe(1);
      const bodyX = character.x + character.width * VISIT_EMITTERS[stage].x;
      if (['B', 'D', 'E'].includes(stage) || position === 0) expect(bodyX).toBeLessThan(viewport.width / 2 - 16);
      else expect(bodyX).toBeGreaterThan(viewport.width / 2 + 16);
      positions.push({ x: character.x, y: character.y });
      if (viewport.width !== 640) await page.screenshot({ path: `docs/screenshots/blessing/${stage}-position-${position}-${testInfo.project.name}.png`, animations: 'disabled' });
      await page.locator('.nahida-avatar').evaluate((element) => { (element as HTMLElement).style.animationPlayState = 'paused'; });
      await channel(page); await page.clock.runFor(40);
      const emitter = VISIT_EMITTERS[stage];
      const alignment = await page.locator('.blessing-flow-path').first().evaluate((element, emitter) => {
        const path = element as SVGPathElement; const origin = path.getPointAtLength(0).matrixTransform(path.getScreenCTM()!);
        const character = document.querySelector('.nahida-avatar')!.getBoundingClientRect();
        return Math.hypot(origin.x - character.left - character.width * emitter.x, origin.y - character.top - character.height * emitter.y);
      }, emitter);
      expect(alignment).toBeLessThan(2);
    }
    expect(positions[0]).not.toEqual(positions[1]);
  }
});

test('轮廓光效 → 花叶 → 素材扫描框 → 成长，暂停与一次结算不阻断浇灌', async ({ page }, testInfo) => {
  await page.clock.install(); await page.addInitScript(() => { Math.random = () => 0.99; }); await seed(page, 'A'); await page.clock.runFor(3800);
  await page.locator('.debug-panel > summary').click(); await page.getByRole('button', { name: '触发纳西妲来访', exact: true }).click(); await page.locator('.debug-panel > summary').click();
  await channel(page); expect((await readSave(page)).growth).toBe(0);
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 10));
  await expect(page.locator('.blessing-dendro-icon')).toHaveCount(1); await expect(page.locator('.blessing-pattern-piece')).toHaveCount(16);
  await expect(page.locator('.blessing-source, .blessing-circuit, .blessing-data-packet, .blessing-focus-frame, [data-piece=center_emblem]')).toHaveCount(0);
  const onTree = await page.locator('.blessing-target').evaluate((element) => {
    const target = element as SVGGElement; const tree = document.querySelector('.dream-tree') as SVGSVGElement;
    const screen = new DOMPoint(0, 0).matrixTransform(target.getScreenCTM()!); const local = screen.matrixTransform(tree.getScreenCTM()!.inverse());
    return (tree.querySelector('.tree-hit-target') as SVGPathElement).isPointInFill(local);
  }); expect(onTree).toBe(true);
  expect((await page.request.get('/asserts/effects/dendro.png')).ok()).toBe(true);
  expect((await page.request.get('/asserts/effects/e-skill-frame.png')).ok()).toBe(true);
  const scan = await page.locator('.blessing-scan').evaluate((element) => { const animation = element.getAnimations()[0]; animation.currentTime = 900; const start = getComputedStyle(element).transform; animation.currentTime = 1350; const end = getComputedStyle(element).transform; return { start, end }; });
  expect(scan.start).not.toBe(scan.end);
  const flow = await page.locator('.blessing-flow-particle').first().evaluate((element) => { const animation = element.getAnimations()[0]; animation.currentTime = 400; const start = getComputedStyle(element).offsetDistance; animation.currentTime = 700; const end = getComputedStyle(element).offsetDistance; return { start, end }; });
  expect(flow.start).not.toBe(flow.end);
  mkdirSync('docs/screenshots/blessing', { recursive: true });
  for (const [frame, time] of [['aura', 200], ['flow', 550], ['channel', 1250]] as const) {
    await page.locator('.dendro-blessing, .nahida-companion').evaluateAll((elements, time) => { for (const element of elements) { element.setAttribute('data-paused', 'true'); for (const animation of element.getAnimations({ subtree: true })) animation.currentTime = time; } }, time);
    const opacity = Number(await page.locator('.blessing-analysis').evaluate((element) => getComputedStyle(element).opacity)); expect(opacity > 0).toBe(frame === 'channel');
    if (frame === 'aura') {
      expect(Number(await page.locator('.blessing-flow-particle').first().evaluate((element) => getComputedStyle(element).opacity))).toBe(0);
      expect(await page.locator('.nahida-companion .spine-host').evaluate((element) => getComputedStyle(element).filter)).toContain('drop-shadow');
    }
    await page.screenshot({ path: `docs/screenshots/blessing/${frame}-${testInfo.project.name}.png` });
  }
  await page.locator('.dendro-blessing, .nahida-companion').evaluateAll((elements) => { for (const element of elements) element.setAttribute('data-paused', 'false'); });
  const target = await page.locator('.blessing-target').getAttribute('transform');
  await openSettings(page); await page.clock.fastForward(30000);
  await expect(page.locator('.dendro-blessing')).toHaveAttribute('data-paused', 'true'); expect((await readSave(page)).growth).toBe(0);
  const states = await page.locator('.dendro-blessing').evaluate((element) => element.getAnimations({ subtree: true }).map((animation) => animation.playState)); expect(states.length).toBeGreaterThanOrEqual(10); expect(states.every((state) => state === 'paused')).toBe(true);
  expect(await page.locator('.nahida-companion .spine-host').evaluate((element) => element.getAnimations().every((animation) => animation.playState === 'paused'))).toBe(true);
  await page.getByRole('button', { name: '关闭', exact: true }).click(); await page.clock.fastForward(1500);
  await expect(page.locator('.dendro-blessing')).toHaveAttribute('data-phase', 'bloom'); expect((await readSave(page)).growth).toBe(21); expect((await readSave(page)).blessedVisits).toEqual(['visit-A']);
  expect(await page.locator('.blessing-target').getAttribute('transform')).toBe(target);
  expect(await page.locator('.dendro-blessing').evaluate((element) => getComputedStyle(element).pointerEvents)).toBe('none');
  await page.locator('.dendro-blessing').evaluate((element) => { for (const animation of element.getAnimations({ subtree: true })) { animation.pause(); animation.currentTime = 250; } });
  mkdirSync('docs/screenshots/blessing', { recursive: true }); await page.screenshot({ path: `docs/screenshots/blessing/bloom-${testInfo.project.name}.png` });
  await page.clock.fastForward(900); await page.getByRole('button', { name: '梦中的树', exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(page.locator('.dialogue-bubble[data-speaker=tree]')).toBeVisible(); await page.getByRole('button', { name: '浇灌梦中的树', exact: true }).click(); expect((await readSave(page)).growth).toBe(34);
  await page.reload(); await finishOpening(page, true); await page.clock.fastForward(3000); expect((await readSave(page)).growth).toBe(34);
});

test('扫描框纹理失败不阻断中心扫描、浇灌及祝福结算', async ({ page }) => {
  await page.clock.install(); await page.route('**/e-skill-frame.png', (route) => route.abort());
  await seed(page, 'D', { pendingVisits: ['visit-D'] }); await channel(page);
  await expect(page.locator('.blessing-dendro-icon')).toHaveCount(1); await expect(page.locator('.blessing-scan')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '浇灌梦中的树', exact: true })).toBeEnabled();
  const before = await readSave(page); await page.clock.fastForward(1500);
  expect((await readSave(page)).growth).toBe(Math.round((before.growth + (STAGES.D.growth.end - STAGES.D.growth.start) / 10) * 10) / 10);
  expect((await readSave(page)).blessedVisits).toContain('visit-D');
});

test('减少动态 / 无 WebGL 的来访仍祝福，光流中刷新不丢奖励', async ({ page }) => {
  await page.clock.install();
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...options: unknown[]) { return kind.includes('webgl') ? null : Reflect.apply(original, this, [kind, ...options]); } as typeof original;
  });
  await page.emulateMedia({ reducedMotion: 'reduce' }); await seed(page, 'C', { pendingVisits: ['visit-C'], visitPositions: { 'visit-C': 0 } });
  await channel(page); await expect(page.locator('.dendro-blessing')).toHaveAttribute('data-reduced', 'true'); await expect(page.locator('.blessing-flow-particle')).toHaveCount(0); await expect(page.locator('.blessing-dendro-icon')).toHaveCount(1); await expect(page.locator('.blessing-pattern-piece')).toHaveCount(16);
  await expect(page.locator('.nahida-avatar')).toHaveAttribute('data-renderer', 'fallback');
  expect(await page.locator('.nahida-companion').getAttribute('data-flipped')).toBeNull();
  await expect(page.locator('.nahida-companion .character-static')).toHaveCSS('transform', 'none');
  await page.reload(); await finishOpening(page, true); await channel(page); await page.clock.fastForward(1500);
  const expected = visitGrowth('C', STAGES.C.growth.start + 1, STAGES.C.growth.end, false);
  expect((await readSave(page)).growth).toBe(expected); expect((await readSave(page)).blessedVisits).toContain('visit-C');
  await page.reload(); await finishOpening(page, true); await page.clock.fastForward(3000); expect((await readSave(page)).growth).toBe(expected);
});
