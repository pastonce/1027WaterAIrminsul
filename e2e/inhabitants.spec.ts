import { openSettings } from './settings-support';
import { expect, test } from '@playwright/test';
import { finishOpening } from './opening-support';
import type { Page } from '@playwright/test';
import { VISIT_FORMS } from '../src/data/inhabitants';
import type { DreamStageId, GameSave } from '../src/types/game';

async function debug(page: Page, action: () => Promise<unknown>) {
  await page.locator('.debug-panel > summary').click(); await action(); await page.locator('.debug-panel > summary').click();
}
async function stage(page: Page, id: DreamStageId) { await debug(page, () => page.getByLabel(`调试切换到${id}阶段`, { exact: true }).click()); }
async function enter(page: Page) { await page.clock.install(); await page.goto('/'); await finishOpening(page, true); await page.getByRole('button', { name: '沉入梦乡' }).click(); }
async function save(page: Page): Promise<GameSave> { return page.evaluate(() => JSON.parse(localStorage.getItem('irminsul.development.v2')!)); }

test('四种纳西妲按姿态出现，气泡在角色旁且 UI 不新增阶段说明', async ({ page }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message)); await enter(page);
  for (const id of ['A', 'C', 'D', 'F'] as const) {
    await stage(page, id);
    await debug(page, () => page.getByRole('button', { name: '触发纳西妲来访', exact: true }).click());
    await page.clock.fastForward(12000); await page.clock.fastForward(500); await page.clock.fastForward(700);
    await expect(page.locator(`.nahida-avatar[data-character=${VISIT_FORMS[id]}]`)).toHaveAttribute('data-renderer', 'ready', { timeout: 20000 });
    await expect(page.locator('.dialogue-bubble[data-speaker=nahida]')).toBeVisible();
    const box = (await page.locator('.nahida-companion').boundingBox())!; const viewport = page.viewportSize()!;
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThan(viewport.width - 40);
    expect(box.y).toBeGreaterThanOrEqual(85); expect(box.y + box.height).toBeLessThanOrEqual(viewport.height - 18);
    const bubble = (await page.locator('.dialogue-bubble[data-speaker=nahida]').boundingBox())!;
    expect(bubble.x + bubble.width).toBeLessThanOrEqual(viewport.width - 10); expect(bubble.y + bubble.height).toBeLessThan(viewport.height - 20);
    await expect(page.locator('.growth-meter, .scene-copy, .story-overlay, .listen-button')).toHaveCount(0);
    await page.screenshot({ path: `docs/screenshots/inhabitants-${id}-${testInfo.project.name}.png`, animations: 'disabled' });
  }
  expect(errors).toEqual([]);
});

test('兰那罗按活动时间出现、暂停和退场，三只上限与形象互斥', async ({ page }, testInfo) => {
  await enter(page); await expect(page.locator('.background-scenery')).toHaveAttribute('data-renderer', 'ready', { timeout: 20000 }); await page.clock.fastForward(60000);
  await expect(page.locator('.creature-roaming')).toHaveCount(1);
  await page.clock.runFor(1000); await expect(page.locator('.forest-inhabitants')).toHaveAttribute('data-renderer', 'ready');
  await openSettings(page); await page.clock.fastForward(60000);
  await expect(page.locator('.creature-roaming')).toHaveCount(1);
  await page.getByRole('button', { name: '关闭', exact: true }).click(); await page.clock.fastForward(21000); await page.clock.fastForward(800);
  await expect(page.locator('.creature-roaming')).toHaveCount(0);
  await stage(page, 'A'); await debug(page, () => page.getByRole('button', { name: '查看三个藏身点', exact: true }).click());
  await page.clock.runFor(900); await expect(page.locator('.creature-roaming')).toHaveCount(3);
  expect(new Set(await page.locator('.creature-roaming').evaluateAll((elements) => elements.map((element) => element.getAttribute('data-asset')))).size).toBe(3);
  await debug(page, () => page.getByRole('button', { name: '召来一只兰那罗', exact: true }).click());
  await expect(page.locator('.creature-roaming')).toHaveCount(3);
  await page.screenshot({ path: `docs/screenshots/inhabitants-hiding-${testInfo.project.name}.png`, animations: 'disabled' });
  await stage(page, 'B'); await expect(page.locator('.creature-roaming, .creature-fixed')).toHaveCount(0);
});

test('互动洒出独立奖励，满额留场、浇灌后继续收取、六十秒消失', async ({ page, isMobile }) => {
  await enter(page); await stage(page, 'A');
  await debug(page, () => page.getByRole('button', { name: '召来一只兰那罗', exact: true }).click());
  await page.clock.runFor(1000);
  const button = page.locator('.creature-roaming .creature-hit').first(); if (isMobile) await button.tap(); else await button.click();
  await page.mouse.move(0, 0);
  const reward = page.locator('.dew-particle[data-dew-kind=reward]:not(.is-collected):not(.is-expiring)');
  expect(await reward.count()).toBeGreaterThan(7); await page.clock.fastForward(8000); expect(await reward.count()).toBeGreaterThan(7);
  await reward.first().dispatchEvent('click'); await expect(page.getByTestId('dew-count')).toHaveText('13');
  await expect(page.locator('.dew-counter')).toHaveAttribute('data-feedback', 'full');
  await page.getByRole('button', { name: '浇灌梦中的树', exact: true }).click(); await reward.first().dispatchEvent('click');
  expect(Number(await page.getByTestId('dew-count').textContent())).toBeGreaterThan(0);
  await page.clock.fastForward(61000); await page.clock.fastForward(400); await expect(reward).toHaveCount(0);
});

test('四只庆典常驻可分别点击一次，奖励和领取记录不混淆', async ({ page, isMobile }, testInfo) => {
  await enter(page); await stage(page, 'F');
  await expect(page.locator('.forest-inhabitants')).toHaveAttribute('data-renderer', 'ready', { timeout: 20000 });
  await page.clock.runFor(1000); await expect(page.locator('.creature-fixed')).toHaveCount(4);
  for (const id of ['aranara_07', 'aranara_08', 'aranara_09', 'aranara_10']) {
    const button = page.locator(`[data-creature-id=${id}] .creature-hit`); if (isMobile) await button.tap(); else await button.click();
    await page.mouse.move(0, 0); await expect(button).toBeDisabled();
  }
  expect((await save(page)).claimedAranara).toHaveLength(4);
  await page.screenshot({ path: `docs/screenshots/inhabitants-festival-${testInfo.project.name}.png`, animations: 'disabled' });
  await page.reload(); await finishOpening(page, true); await expect(page.locator('.creature-fixed')).toHaveCount(4); await expect(page.locator('.creature-fixed .creature-hit:enabled')).toHaveCount(0);
});

test('晶蝶随树长高增添且锚在世界枝叶，根冠移动不重复下载', async ({ page }) => {
  const requests: string[] = []; page.on('request', (request) => { if (/inhabitants\/crystalfly\/.*\.(json|atlas|png)$/.test(request.url())) requests.push(request.url()); });
  await enter(page); await expect(page.locator('.creature-crystal')).toHaveCount(0);
  await debug(page, () => page.getByLabel('调试成长值', { exact: true }).fill('99')); await expect(page.locator('.creature-crystal')).toHaveCount(0);
  await debug(page, () => page.getByLabel('调试成长值', { exact: true }).fill('100')); await expect(page.locator('.creature-crystal')).toHaveCount(1);
  await stage(page, 'F');
  await debug(page, () => page.getByLabel('调试成长值', { exact: true }).fill('1027'));
  await expect(page.locator('.creature-crystal')).toHaveCount(15);
  await expect(page.locator('.forest-inhabitants')).toHaveAttribute('data-renderer', 'ready', { timeout: 20000 });
  await page.getByRole('button', { name: '回到树根', exact: true }).click(); await page.clock.runFor(1500);
  const initial = (await page.locator('[data-creature-id=crystal-0]').boundingBox())!; const before = requests.length;
  const offset = Number(await page.getByTestId('dream-scene').getAttribute('data-camera-offset'));
  await page.getByRole('button', { name: '返回树冠', exact: true }).click(); await page.clock.runFor(1500);
  const moved = (await page.locator('[data-creature-id=crystal-0]').boundingBox())!;
  const difference = Number(await page.getByTestId('dream-scene').getAttribute('data-camera-offset')) - offset;
  expect(moved.y - initial.y).toBeCloseTo(difference, 0); expect(requests).toHaveLength(before);
  await expect(page.locator('.creature-canvas')).toHaveCount(1);
});

for (const mode of ['reduced', 'no-webgl'] as const) test(`${mode} 小生物回退仍能互动，四只常驻不丢失`, async ({ page }) => {
  if (mode === 'reduced') await page.emulateMedia({ reducedMotion: 'reduce' });
  else await page.addInitScript(() => { const original = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...args: unknown[]) { return kind.startsWith('webgl') ? null : Reflect.apply(original, this, [kind, ...args]); } as typeof original; });
  await enter(page); await stage(page, 'F');
  await expect(page.locator('.forest-inhabitants')).toHaveAttribute('data-renderer', mode === 'reduced' ? 'static' : 'fallback');
  await expect(page.locator('.creature-fixed')).toHaveCount(4); await expect(page.locator('.creature-fixed .creature-poster')).toHaveCount(4);
  await page.locator('.creature-fixed .creature-hit').first().click();
  expect((await save(page)).claimedAranara).toHaveLength(1); expect(await page.locator('[data-dew-kind=reward]').count()).toBeGreaterThan(0);
});

test('小生物上下文丢失 / 恢复及动态切换保留四只常驻与领奖记录', async ({ page }) => {
  await enter(page); await stage(page, 'F');
  const layer = page.locator('.forest-inhabitants');
  await expect(layer).toHaveAttribute('data-renderer', 'ready', { timeout: 20000 });
  await page.locator('.creature-fixed .creature-hit').first().click();
  const claimed = (await save(page)).claimedAranara;
  const extension = await page.locator('.creature-canvas').evaluateHandle((canvas) => (canvas as HTMLCanvasElement).getContext('webgl')!.getExtension('WEBGL_lose_context')!);
  await extension.evaluate((value) => value.loseContext());
  await expect(layer).toHaveAttribute('data-renderer', 'fallback');
  await expect(page.locator('.creature-fixed .creature-poster')).toHaveCount(4);
  await extension.evaluate((value) => value.restoreContext());
  await expect(layer).toHaveAttribute('data-renderer', 'ready', { timeout: 20000 });
  await extension.dispose();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(layer).toHaveAttribute('data-renderer', 'static');
  await expect(page.locator('.creature-fixed .creature-poster')).toHaveCount(4);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(layer).toHaveAttribute('data-renderer', 'ready', { timeout: 20000 });
  await expect(page.locator('.creature-canvas')).toHaveCount(1);
  await expect(page.locator('.creature-fixed .creature-hit:disabled')).toHaveCount(1);
  expect((await save(page)).claimedAranara).toEqual(claimed);
});

test('十三只小生物同画布实际运动、暂停不推进，缩图 / 换景后 GPU 完全释放', async ({ page }, testInfo) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const module = '/src/game/encounters/CreatureRenderer.ts'; const registry = '/src/data/inhabitants.ts';
    const [{ createCreatureRenderer }, { INHABITANT_ASSETS }] = await Promise.all([import(module), import(registry)]);
    const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 450;
    const graphics = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true })!;
    const resources = Object.fromEntries(['Texture', 'Program', 'Buffer'].map((name) => [name, new Set()]));
    const methods = graphics as unknown as Record<string, (...args: unknown[]) => unknown>;
    for (const [name, live] of Object.entries(resources)) {
      const create = methods[`create${name}`].bind(graphics); const remove = methods[`delete${name}`].bind(graphics);
      methods[`create${name}`] = () => { const value = create(); if (value) live.add(value); return value; };
      methods[`delete${name}`] = (value) => { live.delete(value); return remove(value); };
    }
    const assets = Object.keys(INHABITANT_ASSETS).filter((id) => !id.startsWith('nahida'));
    const waiting = new Set(assets); let resolve!: () => void; let reject!: (reason: unknown) => void;
    const loaded = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
    const renderer = await createCreatureRenderer(canvas, (asset: string, status: string, error: unknown) => { if (status === 'ready') waiting.delete(asset); if (!waiting.size) resolve(); if (status === 'fallback') reject(error); });
    const capture = () => { const data = new Uint8Array(canvas.width * canvas.height * 4); graphics.readPixels(0, 0, canvas.width, canvas.height, graphics.RGBA, graphics.UNSIGNED_BYTE, data); return data; };
    try {
      renderer.setViewport(800, 450, true); renderer.setPaused(true, false);
      renderer.setActors(assets.map((asset, index) => ({ id: asset, asset, kind: 'fixed', left: index % 7 * 110, top: Math.floor(index / 7) * 200, width: 95, height: 150 })));
      await loaded; renderer.draw(0); const initial = capture(); renderer.setPaused(false, false);
      for (let frame = 0; frame < 40; frame++) renderer.draw(0.05);
      renderer.setPaused(true, false); const animated = capture();
      const pose = () => JSON.stringify([...renderer.instances.values()].map((entry: { trackTime: number; skeleton: import('spine-player-4-0').Skeleton }) => ({ time: entry.trackTime, bones: entry.skeleton.bones.map((bone) => [bone.worldX, bone.worldY, bone.a, bone.b, bone.c, bone.d]), slots: entry.skeleton.slots.map((slot) => slot.deform) })));
      const beforePose = pose(); renderer.draw(0.1); const repeated = capture(); const frozen = repeated.every((value, index) => value === animated[index]);
      const stablePose = beforePose === pose(); const differences = repeated.reduce((total, value, index) => total + Number(value !== animated[index]), 0);
      let changed = 0; for (let index = 0; index < initial.length; index += 4) if (initial[index] !== animated[index] || initial[index + 3] !== animated[index + 3]) changed++;
      const bytes = renderer.textureBytes; renderer.setViewport(640, 360, true); renderer.draw(0); const error = graphics.getError();
      renderer.setActors([]); const emptyBytes = renderer.textureBytes; renderer.dispose();
      return { changed, frozen, stablePose, differences, bytes, error, emptyBytes, remaining: Object.fromEntries(Object.entries(resources).map(([name, values]) => [name, values.size])) };
    } finally { renderer.dispose(); }
  });
  await testInfo.attach('inhabitants-gpu', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  expect(result.changed).toBeGreaterThan(100); expect(result.stablePose).toBe(true); expect(result.frozen, JSON.stringify(result)).toBe(true); expect(result.error).toBe(0); expect(result.emptyBytes).toBe(0);
  expect(result.remaining).toEqual({ Texture: 0, Program: 0, Buffer: 0 }); expect(result.bytes).toBeLessThan(12 * 1024 * 1024);
});
