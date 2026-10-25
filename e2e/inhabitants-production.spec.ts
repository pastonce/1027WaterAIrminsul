import { expect, test } from '@playwright/test';
import { finishOpening } from './opening-support';
import { stageFixture } from '../src/dev/fixtures';
import { STAGES } from '../src/data/stages';
import { VISIT_FORMS } from '../src/data/inhabitants';
import { VISIT_EMITTERS, visitGrowth } from '../src/data/visits';
import { mockServerTime, seedPlayer } from './time-support';

test('生产四种新角色与小生物按需加载，姿态 / 横屏 / 实际画布正常', async ({ page }, testInfo) => {
  test.setTimeout(120000);
  await page.clock.install();
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  const server = await mockServerTime(page, '2026-10-27T10:27:00+08:00');
  for (const id of ['A', 'C', 'D', 'F'] as const) {
    const save = stageFixture(id, server.now); save.pendingVisits = [`visit-${id}`]; save.playedDialogues.push(STAGES[id].transition.id);
    if (id === 'A') await seedPlayer(page, save); else await page.evaluate((save) => localStorage.setItem('irminsul.player.v2', JSON.stringify(save)), save);
    await page.goto('/');
    await finishOpening(page);
    await expect(page.locator(`.nahida-avatar[data-character=${VISIT_FORMS[id]}]`)).toHaveAttribute('data-renderer', 'ready', { timeout: 20000 });
    await expect(page.locator('.forest-inhabitants')).toHaveAttribute('data-renderer', 'ready', { timeout: 20000 });
    await expect(page.locator('.background-scenery')).toHaveAttribute('data-renderer', 'ready', { timeout: 20000 });
    await page.clock.runFor(id === 'A' ? 3600 : 1000);
    await expect(page.locator('.creature-canvas')).toHaveCount(1);
    await expect(page.locator('.debug-panel, .growth-meter, .story-overlay')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `docs/screenshots/inhabitants-${id}-${testInfo.project.name}.png`, animations: 'disabled' });
  }
  expect(errors).toEqual([]);
});

test('生产庆典四只常驻仅领一次，刷新保持且不越过资源容量', async ({ page }) => {
  const server = await mockServerTime(page, '2026-10-27T10:27:00+08:00');
  await seedPlayer(page, stageFixture('F', server.now)); await page.goto('/'); await finishOpening(page);
  await expect(page.locator('.creature-fixed .creature-hit')).toHaveCount(4);
  for (const id of ['aranara_07', 'aranara_08', 'aranara_09', 'aranara_10']) await page.locator(`[data-creature-id=${id}] .creature-hit`).click();
  await expect(page.getByTestId('dew-count')).toHaveText('13'); await expect(page.locator('.creature-fixed .creature-hit:enabled')).toHaveCount(0);
  await page.reload(); await finishOpening(page); await expect(page.locator('.creature-fixed')).toHaveCount(4); await expect(page.locator('.creature-fixed .creature-hit:enabled')).toHaveCount(0);
});

test('生产 BDE 两处来访均在树左侧且保持原向，旧第二落点无需重置存档', async ({ page }, testInfo) => {
  test.setTimeout(120000); await page.clock.install();
  const server = await mockServerTime(page, '2026-10-27T10:27:00+08:00');
  let seeded = false;
  for (const stage of ['B', 'D', 'E'] as const) {
    const locations = [];
    for (const position of [0, 1] as const) {
      const save = stageFixture(stage, server.now); save.pendingVisits = [`visit-${stage}`]; save.visitPositions = { [`visit-${stage}`]: position }; save.playedDialogues.push(STAGES[stage].transition.id);
      if (!seeded) { await seedPlayer(page, save); seeded = true; }
      else await page.evaluate((save) => localStorage.setItem('irminsul.player.v2', JSON.stringify(save)), save);
      await page.goto('/'); await finishOpening(page, true); await page.clock.fastForward(800);
      await expect(page.locator('.nahida-avatar')).toHaveAttribute('data-renderer', 'ready', { timeout: 20000 });
      const bounds = (await page.locator('.nahida-companion').boundingBox())!;
      expect(bounds.x + bounds.width * VISIT_EMITTERS[stage].x).toBeLessThan(page.viewportSize()!.width / 2 - 16);
      expect(await page.locator('.nahida-companion').getAttribute('data-flipped')).toBeNull();
      await expect(page.locator('.nahida-companion .spine-host')).toHaveCSS('transform', 'none');
      expect(await page.evaluate((stage) => JSON.parse(localStorage.getItem('irminsul.player.v2')!).visitPositions[`visit-${stage}`], stage)).toBe(position);
      locations.push({ left: bounds.x, top: bounds.y });
      if (position === 1) await page.screenshot({ path: `docs/screenshots/blessing/${stage}-second-left-${testInfo.project.name}.png`, animations: 'disabled' });
    }
    expect(locations[0]).not.toEqual(locations[1]);
  }
});

test('生产包显示草元素图标与扫描框，服务器权限下祝福结算且刷新不重赠', async ({ page }) => {
  await page.clock.install(); const server = await mockServerTime(page, '2026-10-27T10:27:00+08:00');
  const save = stageFixture('C', server.now); save.pendingVisits = ['visit-C']; save.visitPositions = { 'visit-C': 1 }; save.playedDialogues.push(STAGES.C.transition.id);
  await seedPlayer(page, save); await page.goto('/'); await finishOpening(page, true);
  for (let step = 0; step < 100 && await page.locator('.dendro-blessing[data-phase=channel]').count() === 0; step++) await page.clock.fastForward(500);
  await expect(page.locator('.dendro-blessing')).toHaveAttribute('data-phase', 'channel'); await expect(page.locator('.blessing-dendro-icon')).toHaveCount(1); await expect(page.locator('.blessing-scan')).toHaveCount(1); await expect(page.locator('.blessing-pattern-piece')).toHaveCount(16);
  expect((await page.request.get('/asserts/effects/dendro.png')).ok()).toBe(true);
  expect((await page.request.get('/asserts/effects/e-skill-frame.png')).ok()).toBe(true);
  await page.clock.fastForward(1500);
  const result = await page.evaluate(() => JSON.parse(localStorage.getItem('irminsul.player.v2')!));
  const expected = visitGrowth('C', save.growth, STAGES.C.growth.end);
  expect(result.growth).toBe(expected); expect(result.dew).toBe(13); expect(result.blessedVisits).toContain('visit-C');
  await page.reload(); await finishOpening(page, true); await page.clock.fastForward(3500); expect(await page.evaluate(() => JSON.parse(localStorage.getItem('irminsul.player.v2')!).growth)).toBe(expected);
  await expect(page.locator('.debug-panel, .growth-meter, .story-overlay')).toHaveCount(0);
});
