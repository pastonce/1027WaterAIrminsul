import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { stageFixture } from '../src/dev/fixtures';
import { TREE_ART } from '../src/data/treeArt';
import { treeGrowthStep } from '../src/game/tree/growth';
import { getTreeHeight } from '../src/game/growth/GrowthSystem';
import { TREE_ANIMATIONS, treeAnimationPose } from '../src/game/tree/timeline';
import { createTreeModel, treeBodyPath } from '../src/game/tree/model';
import { FOLIAGE_ATTACHMENTS, foliageDuration } from '../src/game/tree/foliage';
import { FOLIAGE_SITES } from '../src/game/tree/foliagePlan';
import type { DreamStageId, GameSave } from '../src/types/game';
import { stageVisitIds } from '../src/data/visits';
import { finishOpening } from './opening-support';
import { finishSceneEntrance } from './scene-support';
import { mockServerTime } from './time-support';

const OPEN = '2026-10-27T10:27:00+08:00';
const key = (info: TestInfo) => info.project.name.startsWith('production') ? 'irminsul.player.v2' : 'irminsul.development.v2';
async function launch(page: Page, info: TestInfo, stage: DreamStageId, growth: number, patch: Partial<GameSave> = {}, now = OPEN) {
  await mockServerTime(page, now); await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install({ time: new Date(now) });
  const base = stageFixture(stage, Date.parse(now));
  const fixture = { ...base, growth, seed: 1027, completedVisits: [...base.completedVisits, ...stageVisitIds(stage)], settings: { ...base.settings, music: false }, ...patch };
  await page.addInitScript(({ save, storageKey, now }) => {
    const pending = sessionStorage.getItem('irminsul.e2e.next-tree-fixture');
    if (pending) { localStorage.setItem(storageKey, pending); sessionStorage.removeItem('irminsul.e2e.next-tree-fixture'); }
    else if (!localStorage.getItem(storageKey)) localStorage.setItem(storageKey, JSON.stringify(save));
    localStorage.setItem('irminsul.notice.seen.v1', '1');
    sessionStorage.setItem('irminsul.development.clock', JSON.stringify({ offset: Date.parse(now) - Date.now(), simulated: true }));
    Math.random = () => .99;
  }, { save: fixture, storageKey: key(info), now });
  await page.goto('/'); await finishOpening(page, true); await finishSceneEntrance(page, true); await page.clock.runFor(200);
  await expect(page.locator('.dream-tree')).toBeVisible();
}

test('各背景严格使用原槽位组合与紧凑尺寸，单档加载且不再人为接高', async ({ page, isMobile }, info) => {
  test.setTimeout(180000); const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await launch(page, info, 'A', 0);
  const visits = [['A', 0], ['B', 220], ['C', 500], ['D', 600], ['E', 680], ['E', 740], ['E', 800], ['E', 840], ['F', 900], ['F', 960], ['F', 1000], ['F', 1027]] as const;
  for (const [stage, growth] of visits) {
    if (stage !== 'A') {
      await page.evaluate((save) => sessionStorage.setItem('irminsul.e2e.next-tree-fixture', JSON.stringify(save)), { ...stageFixture(stage, Date.parse(OPEN)), growth, seed: 1027 });
      await page.reload(); await finishOpening(page, true); await finishSceneEntrance(page, true); await page.clock.runFor(200);
    }
    const model = createTreeModel(treeGrowthStep(growth), undefined, stage === 'E' || stage === 'F');
    const images = page.locator('.dream-tree image'); expect(await images.count()).toBe(model.parts.length);
    const sources = await images.evaluateAll((elements) => elements.map((element) => element.getAttribute('href')!));
    for (const source of sources) expect(Object.entries(TREE_ART).some(([name, asset]) => name !== 'trunk_column' && asset[isMobile ? 'compact' : 'full'] === source)).toBe(true);
    await expect(page.locator('.dream-tree')).toHaveAttribute('pointer-events', 'none');
    await expect(page.locator('.dream-tree')).toHaveAttribute('data-tree-animation', TREE_ANIMATIONS[treeGrowthStep(growth)].name);
    const slots = await page.locator('.tree-art [data-tree-part]').evaluateAll((parts) => parts.map((part) => part.getAttribute('data-tree-part')));
    expect(slots).toEqual(model.parts.map((part) => part.id));
    expect(await page.locator('.tree-hit-target').getAttribute('d')).toBe(treeBodyPath(model.body));
    expect(getTreeHeight(growth)).toBeLessThan(650);
    await expect(page.locator('.dream-tree .tree-branch, .dream-tree .tree-flower, .dream-tree mask')).toHaveCount(0);
    if (stage === 'F' && growth >= 1020) {
      const wood = await page.locator('.tree-art [data-tree-part]:not([data-tree-foliage])').evaluateAll((parts) => parts.map((part) => part.getAttribute('data-tree-part')));
      expect(wood).toEqual(['tree9', 'grass', 'overlay9']);
      await expect(page.locator('[data-tree-art=tree9_growth]')).toHaveCount(1);
      await expect(page.locator('[data-tree-foliage=retained]:not([data-tree-part$="-crown"])')).toHaveCount(15);
      await expect(page.locator('[data-tree-foliage=extension]')).toHaveCount(FOLIAGE_SITES.length);
      await expect(page.locator('[data-tree-foliage][opacity], [data-tree-part$="-crown"]')).toHaveCount(0);
      await expect(page.locator('[data-tree-graft]')).toHaveCount(0);
    }
    await page.getByRole('button', { name: '返回树冠', exact: true }).click(); await page.clock.runFor(200);
    expect(Number(await page.getByTestId('dream-scene').getAttribute('data-camera-offset'))).toBeLessThan(600);
    mkdirSync('artifacts/foliage', { recursive: true }); await page.screenshot({ path: `artifacts/foliage/${info.project.name}-${stage}-crown.png`, animations: 'disabled' });
    if (stage === 'E' || stage === 'F') await page.screenshot({ path: `artifacts/foliage/${info.project.name}-${stage}-${growth}-complete.png`, animations: 'disabled' });
    await page.getByRole('button', { name: '回到树根', exact: true }).click(); await page.clock.runFor(200);
    await page.screenshot({ path: `artifacts/foliage/${info.project.name}-${stage}-root.png`, animations: 'disabled' });
  }
  expect(errors).toEqual([]);
});

test('浇灌按原grow时间轴换干回弹，grow51仍保留已有枝位叶片', async ({ page }, info) => {
  await launch(page, info, 'F', 980, { dew: 60 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.getByRole('button', { name: '浇灌梦中的树', exact: true }).click(); await page.clock.runFor(610);
  await expect(page.locator('.dream-tree')).toHaveAttribute('data-tree-animation', 'grow50');
  const samples: { time: number; slots: string[] }[] = [];
  for (let index = 0; index < 8; index++) {
    const frame = await page.locator('.dream-tree').evaluate((element) => ({
      time: Number(element.getAttribute('data-tree-time')),
      slots: [...element.querySelectorAll('[data-tree-part]:not([data-tree-foliage])')].map((part) => part.getAttribute('data-tree-part')!),
      matrices: [...element.querySelectorAll('[data-tree-part]:not([data-tree-foliage])')].map((part) => part.getAttribute('transform')),
    }));
    const expected = treeAnimationPose(50, frame.time).filter((part) => !part.asset.startsWith('leaf'));
    expect(frame.slots).toEqual(expected.map((part) => part.id));
    for (const [index, matrix] of frame.matrices.entries()) {
      const values = matrix!.slice(7, -1).split(' ').map(Number);
      values.forEach((value, coefficient) => expect(value).toBeCloseTo(expected[index].matrix[coefficient], 10));
    }
    samples.push(frame); await page.clock.runFor(100);
  }
  expect(samples.some((frame) => frame.time < .4167 && frame.slots.includes('tree8'))).toBe(true);
  expect(samples.some((frame) => frame.time >= .4167 && frame.slots.includes('tree9'))).toBe(true);
  await page.getByRole('button', { name: '浇灌梦中的树', exact: true }).click(); await page.clock.runFor(1500);
  await expect(page.locator('.dream-tree')).toHaveAttribute('data-tree-animation', 'grow51');
  expect(await page.locator('.tree-art [data-tree-part]:not([data-tree-foliage])').evaluateAll((parts) => parts.map((part) => part.getAttribute('data-tree-part')))).toEqual(['tree9', 'grass', 'overlay9']);
  await expect(page.locator('[data-tree-art=tree9_growth]')).toHaveCount(1);
  await expect(page.locator('[data-tree-foliage=retained]:not([data-tree-part$="-crown"])')).toHaveCount(15);
});

test('树的透明空隙穿透，叶片 / 木质轮廓可点击，键盘仍可对白', async ({ page, isMobile }, info) => {
  await launch(page, info, 'C', 500);
  await page.getByRole('button', { name: '回到树根', exact: true }).click(); await page.clock.runFor(200);
  const empty = await page.locator('.dream-tree').evaluate((element) => {
    const tree = element as SVGSVGElement; const point = new DOMPoint(835, 3260).matrixTransform(tree.getScreenCTM()!);
    const button = document.createElement('button'); button.dataset.underTree = '0'; button.textContent = '底层测试';
    button.style.cssText = `position:absolute;z-index:2;left:${point.x - 20}px;top:${point.y - 20}px;width:40px;height:40px`;
    button.onclick = () => { button.dataset.underTree = '1'; }; document.querySelector('.dream-scene')!.append(button);
    return { x: point.x, y: point.y };
  });
  if (isMobile) await page.touchscreen.tap(empty.x, empty.y); else await page.mouse.click(empty.x, empty.y);
  await expect(page.locator('[data-under-tree]')).toHaveAttribute('data-under-tree', '1');
  const actual = await page.locator('.tree-hit-target').evaluate((element) => {
    const path = element as SVGPathElement; const tree = path.closest('svg')!; const box = path.getBBox();
    for (let vertical = Math.max(box.y, 3000); vertical < 3270; vertical += 8) for (let horizontal = 380; horizontal < 650; horizontal += 4) {
      if (!path.isPointInFill(new DOMPoint(horizontal, vertical))) continue;
      const point = new DOMPoint(horizontal, vertical).matrixTransform(tree.getScreenCTM()!);
      if (document.elementFromPoint(point.x, point.y)?.closest('.dream-tree')) return { x: point.x, y: point.y };
    }
    return null;
  }); expect(actual).not.toBeNull();
  if (isMobile) await page.touchscreen.tap(actual!.x, actual!.y); else await page.mouse.click(actual!.x, actual!.y);
  await expect(page.locator('.dialogue-bubble[data-speaker=tree]')).toBeVisible();
  await page.getByRole('button', { name: '梦中的树', exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(page.locator('.dialogue-bubble[data-speaker=tree]')).toBeVisible();
});

test('真实浇灌更新树体，设置中暂停剩余生长；旧藏点仍可领奖且晶蝶随树显示', async ({ page }, info) => {
  await launch(page, info, 'C', 480);
  await page.emulateMedia({ reducedMotion: 'no-preference' }); await expect(page.locator('.dream-tree')).toHaveAttribute('data-reduced', 'false');
  await page.getByRole('button', { name: '浇灌梦中的树', exact: true }).click(); await page.clock.runFor(800);
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const shape = await page.locator('.tree-art').innerHTML();
  await page.clock.runFor(10000); expect(await page.locator('.tree-art').innerHTML()).toBe(shape);
  await expect(page.locator('.dream-tree')).toHaveAttribute('data-paused', 'true');
  await page.getByRole('button', { name: '关闭', exact: true }).click(); await page.clock.runFor(1500);
  expect(await page.locator('.tree-art').innerHTML() === shape).toBe(false);
  expect(await page.locator('.creature-crystal').count()).toBeGreaterThan(0);
  await page.keyboard.type('test'); await expect(page.locator('.debug-panel strong')).toHaveText('本页测试 · 内存存档，刷新后退出');
  await expect(page.locator('.debug-panel > summary')).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const [stage, slot] of [['C', '3'], ['C', '5'], ['D', '5'], ['E', '5']] as const) {
    await page.locator('.debug-panel > summary').click(); await page.getByLabel(`调试切换到${stage}阶段`, { exact: true }).click();
    await page.getByLabel('调试藏身点', { exact: true }).selectOption(slot);
    await page.getByRole('button', { name: '查看指定藏身点', exact: true }).click(); await page.locator('.debug-panel > summary').click();
    await page.clock.runFor(1000); const creature = page.locator('.creature-roaming');
    await creature.locator('.creature-hit').click(); await expect(creature).toHaveAttribute('data-celebrated', 'true');
    expect(await page.locator('[data-dew-kind=reward]').count()).toBeGreaterThan(0);
  }
});

test('树素材缺图时保留真实轮廓回退，不阻断树与浇灌', async ({ page }, info) => {
  await page.route('**/asserts/tree/*', (route) => route.abort());
  await launch(page, info, 'A', 0);
  await expect(page.locator('.tree-art [data-tree-part] path[fill="url(#irminsul-leaf)"]').first()).toHaveAttribute('fill', 'url(#irminsul-leaf)');
  await page.getByRole('button', { name: '梦中的树', exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(page.locator('.dialogue-bubble[data-speaker=tree]')).toBeVisible();
  await page.getByRole('button', { name: '浇灌梦中的树', exact: true }).click(); await page.clock.runFor(1500);
  await expect(page.getByTestId('dew-count')).toHaveText('0');
});

test('梦露可累积到1027，每浇消耗20，不足20只红色晃动提示', async ({ page }, info) => {
  await launch(page, info, 'A', 0, { dew: 0 });
  await expect(page.locator('.dew-counter')).toHaveAttribute('aria-label', '梦露 0 / 20');
  await expect(page.locator('.dew-counter > span')).toHaveText('/ 20');
  await page.evaluate((storageKey) => { const save = JSON.parse(localStorage.getItem(storageKey)!); save.dew = 1027; sessionStorage.setItem('irminsul.e2e.next-tree-fixture', JSON.stringify(save)); }, key(info));
  await page.reload(); await finishOpening(page, true); await finishSceneEntrance(page, true);
  await expect(page.getByTestId('dew-count')).toHaveText('1027');
  await expect(page.locator('.dew-counter')).toHaveAttribute('aria-label', '梦露 1027 / 20');
  await page.getByRole('button', { name: '浇灌梦中的树', exact: true }).click();
  await expect(page.getByTestId('dew-count')).toHaveText('1007');
  await page.clock.runFor(1500);
  const save = await page.evaluate((storageKey) => JSON.parse(localStorage.getItem(storageKey)!), key(info));
  expect(save.growth).toBe(20);
  await page.evaluate((storageKey) => { const save = JSON.parse(localStorage.getItem(storageKey)!); save.dew = 19; sessionStorage.setItem('irminsul.e2e.next-tree-fixture', JSON.stringify(save)); }, key(info));
  await page.reload(); await finishOpening(page, true); await finishSceneEntrance(page, true);
  await page.getByRole('button', { name: '浇灌梦中的树', exact: true }).click();
  await expect(page.locator('.dew-counter')).toHaveAttribute('data-feedback', 'insufficient');
  await expect(page.locator('.dew-counter')).toHaveCSS('color', 'rgb(255, 204, 204)');
  await expect(page.getByTestId('dew-count')).toHaveText('19');
});

test('F末次浇灌1020到1027不播放树生长，当前封顶后的补浇也不长树', async ({ page }, info) => {
  for (const [stage, growth] of [['C', 520], ['F', 1020]] as const) {
    if (stage === 'C') await launch(page, info, stage, growth);
    else {
      await page.evaluate((save) => sessionStorage.setItem('irminsul.e2e.next-tree-fixture', JSON.stringify(save)), { ...stageFixture(stage, Date.parse(OPEN)), growth, completedVisits: [...stageFixture(stage, Date.parse(OPEN)).completedVisits, ...stageVisitIds(stage)] });
      await page.reload(); await finishOpening(page, true); await finishSceneEntrance(page, true); await page.clock.runFor(200);
    }
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const shape = await page.locator('.tree-hit-target').getAttribute('d');
    await expect(page.getByTestId('stage-loading')).toHaveCount(0);
    await page.getByRole('button', { name: '浇灌梦中的树', exact: true }).click();
    await expect(page.getByTestId('dew-count')).toHaveText('0');
    for (let frame = 0; frame < 12; frame++) {
      await page.clock.runFor(100);
      expect(await page.locator('.tree-hit-target').getAttribute('d')).toBe(shape);
      await expect(page.locator('.dream-tree.is-growing')).toHaveCount(0);
    }
    const save = await page.evaluate((storageKey) => JSON.parse(localStorage.getItem(storageKey)!), key(info));
    expect(save.growth).toBe(stage === 'C' ? 520 : 1027); expect(save.completedStages).toContain(stage);
    if (stage === 'F') {
      for (let elapsed = 0; elapsed < 40000 && await page.getByTestId('stage-loading').count() === 0; elapsed += 200) await page.clock.runFor(200);
      await expect(page.getByTestId('stage-loading')).toHaveAttribute('data-art', 'G');
      for (let elapsed = 0; elapsed < 20000 && (await page.evaluate((storageKey) => JSON.parse(localStorage.getItem(storageKey)!).sceneStage, key(info))) !== 'G'; elapsed += 200) await page.clock.runFor(200);
      await expect(page.getByTestId('reality-scene')).toBeVisible();
      const ending = await page.evaluate((storageKey) => JSON.parse(localStorage.getItem(storageKey)!), key(info));
      expect(ending.endingComplete).toBe(true); expect(ending.sceneStage).toBe('G');
    }
  }
});

test('E/F补绘树冠可直接点击，未生成嫁接或整块透明点击框', async ({ page, isMobile }, info) => {
  await launch(page, info, 'F', 1020, { dew: 0 });
  await expect(page.locator('[data-tree-art=tree9_growth]')).toHaveCount(1);
  await expect(page.locator('[data-tree-graft]')).toHaveCount(0);
  const point = await page.locator('.tree-hit-target').evaluateAll((elements) => {
    for (const element of elements) {
      const path = element as SVGPathElement;
      const box = path.getBBox();
      for (let vertical = box.y; vertical < box.y + box.height * .6; vertical += 10) for (let horizontal = box.x; horizontal < box.x + box.width; horizontal += 10) {
        if (!path.isPointInFill(new DOMPoint(horizontal, vertical))) continue;
        const screen = new DOMPoint(horizontal, vertical).matrixTransform(path.getScreenCTM()!);
        if (screen.y < 95 || screen.y > innerHeight - 80) continue;
        if (document.elementFromPoint(screen.x, screen.y)?.closest('.dream-tree')) return { x: screen.x, y: screen.y };
      }
    }
    return null;
  });
  expect(point).not.toBeNull();
  if (isMobile) await page.touchscreen.tap(point!.x, point!.y); else await page.mouse.click(point!.x, point!.y);
  await expect(page.locator('.dialogue-bubble[data-speaker=tree]')).toBeVisible();
});

test('普通梦露和Rainstorm沿用同一4～6点规则，单次收集不重复结算', async ({ page, isMobile }, info) => {
  await launch(page, info, 'F', 1020, { dew: 0 });
  await page.clock.runFor(2000);
  const ordinary = page.locator('.dew-particle:not(.is-collected):not(.is-expiring)').first();
  const ordinaryBox = await ordinary.boundingBox(); expect(ordinaryBox).not.toBeNull();
  if (isMobile) await page.touchscreen.tap(ordinaryBox!.x + ordinaryBox!.width / 2, ordinaryBox!.y + ordinaryBox!.height / 2); else await page.mouse.move(ordinaryBox!.x + ordinaryBox!.width / 2, ordinaryBox!.y + ordinaryBox!.height / 2);
  await expect(page.getByTestId('dew-count')).toHaveText('6');
  await page.keyboard.type('Rainstorm');
  await expect(page.locator('[data-dew-kind=rainstorm]')).toHaveCount(40);
  const rainBox = await page.locator('[data-dew-kind=rainstorm]:not(.is-collected)').first().boundingBox(); expect(rainBox).not.toBeNull();
  if (isMobile) await page.touchscreen.tap(rainBox!.x + rainBox!.width / 2, rainBox!.y + rainBox!.height / 2); else await page.mouse.move(rainBox!.x + rainBox!.width / 2, rainBox!.y + rainBox!.height / 2);
  await expect(page.getByTestId('dew-count')).toHaveText('12');
});

test('连续枝位沿枝延伸，原回弹切图可暂停续播且刷新不重置', async ({ page }, info) => {
  await launch(page, info, 'F', 960, { dew: 1027 }, '2026-10-28T12:00:00+08:00');
  const sites = async () => page.locator('[data-tree-site]').evaluateAll((parts, anchors) => parts.map((part) => {
    const matrix = (part as SVGGElement).transform.baseVal.consolidate()!.matrix;
    const registration = (part.firstElementChild as SVGGElement).transform.baseVal.consolidate()!.matrix;
    const [horizontal, vertical] = anchors[part.getAttribute('data-tree-asset')!];
    const point = new DOMPoint(horizontal, vertical).matrixTransform(registration).matrixTransform(matrix);
    return { id: part.getAttribute('data-tree-site'), asset: part.getAttribute('data-tree-asset'), x: point.x, y: point.y };
  }), FOLIAGE_ATTACHMENTS);
  const original = await sites(); expect(original).toHaveLength(15 + FOLIAGE_SITES.length);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 200));
  await page.getByRole('button', { name: '浇灌梦中的树', exact: true }).click(); await page.clock.runFor(650);
  await expect(page.locator('.dream-tree')).toHaveAttribute('data-tree-animation', 'grow49');
  expect(Number(await page.locator('.dream-tree').getAttribute('data-tree-time'))).toBeLessThan(.25);
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const paused = await page.locator('.tree-art').innerHTML(); await page.clock.runFor(2000);
  expect(await page.locator('.tree-art').innerHTML()).toBe(paused);
  await page.getByRole('button', { name: '关闭', exact: true }).click(); await page.clock.runFor(400);
  await expect(page.locator('.dream-tree')).toHaveAttribute('data-tree-time', '0.25');
  let complete = await sites();
  expect(complete.map((part) => part.id)).toEqual(original.map((part) => part.id));
  expect(complete.find((part) => part.id === 'crown-growth-5')?.asset).toBe('leafbunch2');
  for (const animation of ['grow50', 'grow51']) {
    await page.getByRole('button', { name: '浇灌梦中的树', exact: true }).click(); await page.clock.runFor(1500);
    await expect(page.locator('.dream-tree')).toHaveAttribute('data-tree-animation', animation);
    const current = await sites(); expect(current).toHaveLength(original.length);
    const model = createTreeModel(animation === 'grow50' ? 50 : 51, undefined, true);
    current.forEach((part, index) => {
      expect(part.id).toBe(original[index].id);
      const expected = model.crown[index]; const [horizontal, vertical] = FOLIAGE_ATTACHMENTS[expected.asset];
      expect(part.x).toBeCloseTo(expected.artMatrix[0] * horizontal + expected.artMatrix[2] * vertical + expected.artMatrix[4], 3);
      expect(part.y).toBeCloseTo(expected.artMatrix[1] * horizontal + expected.artMatrix[3] * vertical + expected.artMatrix[5], 3);
    });
    expect(current.some((part, index) => Math.hypot(part.x - original[index].x, part.y - original[index].y) > 20)).toBe(true);
    complete = current;
  }
  expect(await page.evaluate((storageKey) => JSON.parse(localStorage.getItem(storageKey)!).growth, key(info))).toBe(1020);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload(); await finishOpening(page, true); await finishSceneEntrance(page, true); await page.clock.runFor(1200);
  await expect(page.locator('.dream-tree')).toHaveAttribute('data-tree-animation', 'grow51');
  const restored = await sites(); expect(restored).toHaveLength(complete.length);
  restored.forEach((part, index) => {
    expect(part.id).toBe(complete[index].id); expect(part.asset).toBe(complete[index].asset);
    expect(part.x).toBeCloseTo(complete[index].x, 3); expect(part.y).toBeCloseTo(complete[index].y, 3);
  });
});

for (const stage of ['C', 'D', 'E', 'F'] as const) test(`${stage}逐次真实浇灌检查整树与换干过程，不跳过中间添叶段`, async ({ page }, info) => {
  test.setTimeout(180000);
  const start = { C: 340, D: 520, E: 680, F: 840 }[stage];
  const rounds = { C: 9, D: 8, E: 8, F: 10 }[stage];
  const cap = { C: 520, D: 680, E: 840, F: 1027 }[stage];
  const directory = `artifacts/tree-sequence/${info.project.name}-${stage}`;
  mkdirSync(directory, { recursive: true });
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await launch(page, info, stage, start, { dew: 1027 }, '2026-10-28T12:00:00+08:00');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 200));
  const snapshots: { label: string; svg: string; endpoint: boolean; leaf: boolean }[] = [];
  const metrics: unknown[] = [];
  const snapshot = async (label: string, endpoint: boolean, leaf = false) => {
    const capture = await page.locator('.dream-tree').evaluate((element) => {
      const tree = element as SVGSVGElement;
      const art = tree.querySelector('.tree-art') as SVGGElement;
      const box = art.getBBox(); const clone = tree.cloneNode(true) as SVGSVGElement;
      clone.removeAttribute('class'); clone.removeAttribute('role'); clone.removeAttribute('tabindex');
      clone.setAttribute('width', '350'); clone.setAttribute('height', '370');
      clone.setAttribute('viewBox', `${box.x - 24} ${box.y - 24} ${box.width + 48} ${box.height + 48}`);
      clone.querySelectorAll('image').forEach((image) => image.setAttribute('href', new URL(image.getAttribute('href')!, location.href).href));
      return {
        svg: clone.outerHTML, animation: tree.dataset.treeAnimation, time: Number(tree.dataset.treeTime),
        parts: [...art.querySelectorAll('[data-tree-part]')].map((element) => {
          const part = element as SVGGElement;
          return { id: part.dataset.treePart, site: part.dataset.treeSite, asset: part.dataset.treeAsset, phase: part.dataset.treePhase, motion: part.dataset.treeMotion, alpha: Number(part.getAttribute('opacity') ?? 1), matrix: part.getAttribute('transform')!.slice(7, -1).split(' ').map(Number) };
        }),
      };
    });
    snapshots.push({ label, svg: capture.svg, endpoint, leaf });
    await expect(page.locator('[data-tree-foliage][opacity], [data-tree-part$="-crown"]')).toHaveCount(0);
    const save = await page.evaluate((storageKey) => JSON.parse(localStorage.getItem(storageKey)!), key(info));
    metrics.push({ label, growth: save.growth, dew: save.dew, ...capture, svg: undefined });
    return capture;
  };
  const original = await snapshot(`${stage} entry ${start}`, true);
  let previous = original;
  for (let round = 1; round <= rounds; round++) {
    const growth = Math.min(cap, start + round * 20);
    const step = treeGrowthStep(growth); const duration = growth === 1027 ? 0 : foliageDuration(step);
    await page.getByRole('button', { name: '浇灌梦中的树', exact: true }).click();
    await page.clock.runFor(600);
    const cutover = [18, 23, 36, 42, 45, 50].includes(step);
    for (let frame = 1; frame <= 6; frame++) {
      await page.clock.runFor(duration ? Math.ceil(duration * 1000 / 6) : 40);
      if (cutover && frame < 6) await snapshot(`${stage}${round} grow${step} frame${frame}`, false);
      if (!cutover && duration && frame % 2 && step !== 51) await snapshot(`${stage}${round} grow${step} leaf${frame}`, false, true);
    }
    await page.clock.runFor(Math.max(100, 2500 - 600 - Math.ceil(duration * 1000 / 6) * 6));
    await expect(page.locator('.dream-tree')).toHaveAttribute('data-tree-animation', `grow${step}`);
    const current = await snapshot(`${stage}${round} ${growth} grow${step}`, true);
    const actual = createTreeModel(step, undefined, stage === 'E' || stage === 'F');
    expect(current.parts.map((part) => part.id)).toEqual(actual.parts.map((part) => part.id));
    const deviations = current.parts.flatMap((part, index) => part.matrix.flatMap((value, coefficient) => Math.abs(value - actual.parts[index].matrix[coefficient]) < .00000005 ? [] : [`${part.id} coefficient ${coefficient}: ${value} / ${actual.parts[index].matrix[coefficient]}`]));
    expect(deviations).toEqual([]);
    expect(current.time).toBe(foliageDuration(step));
    for (const part of previous.parts.filter((part) => part.site)) expect(current.parts.some((present) => present.id === part.id && present.alpha === 1)).toBe(true);
    if (growth === 1027) expect(current.parts).toEqual(previous.parts);
    previous = current;
    await page.screenshot({ path: `${directory}/water-${String(round).padStart(2, '0')}.png` });
    const save = await page.evaluate((storageKey) => JSON.parse(localStorage.getItem(storageKey)!), key(info));
    expect(save.growth).toBe(growth); expect(save.dew).toBe(1027 - round * 20);
  }
  writeFileSync(`${directory}/metrics.json`, JSON.stringify(metrics, null, 2));
  for (const category of ['endpoints', 'cutovers', 'leaves'] as const) {
    const selected = snapshots.filter((capture) => category === 'endpoints' ? capture.endpoint : category === 'leaves' ? capture.leaf : !capture.endpoint && !capture.leaf);
    if (!selected.length) continue;
    const sheet = await page.context().newPage(); await sheet.setViewportSize({ width: 1120, height: 800 });
    await sheet.setContent(`<html><head><style>body{margin:0;background:#e4e7e4;color:#243f3b;font:15px sans-serif}main{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:10px}figure{margin:0;background:#f1f1eb;text-align:center;padding:6px}figcaption{padding:8px}</style></head><body><main>${selected.map((capture) => `<figure><figcaption>${capture.label}</figcaption>${capture.svg}</figure>`).join('')}</main></body></html>`);
    await sheet.evaluate(async () => { await Promise.all([...document.querySelectorAll('image')].map((element) => new Promise<void>((resolve) => { const image = new Image(); image.onload = () => resolve(); image.onerror = () => resolve(); image.src = element.getAttribute('href')!; }))); });
    await sheet.screenshot({ path: `${directory}/${category}.png`, fullPage: true });
    await sheet.close();
  }
  expect(errors).toEqual([]);
});
