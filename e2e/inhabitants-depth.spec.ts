import { openSettings } from './settings-support';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';

async function preview(page: Page, slot: number) {
  await page.locator('.debug-panel > summary').click(); await page.getByLabel('调试藏身点', { exact: true }).selectOption(String(slot));
  await page.getByRole('button', { name: '查看指定藏身点', exact: true }).click(); await page.locator('.debug-panel > summary').click();
}

test('真实背景 / 兰那罗按多层次穿插，五套同上下文运动与释放正常', async ({ page }, testInfo) => {
  test.setTimeout(120000); await page.goto('/');
  const result = await page.evaluate(async () => {
    const paths = ['/src/data/backgrounds.ts', '/src/game/backgrounds/scene.ts', '/src/game/backgrounds/policy.ts', '/src/game/encounters/RoamingLayer.ts', '/src/game/encounters/layout.ts', '/src/data/inhabitants.ts'];
    const [{ getStageBackground }, { createBackgroundScene }, { backgroundQuality }, { RoamingLayer }, { creatureLayout }, { HIDING_PLACES }] = await Promise.all([
      ...paths.map((path) => import(path)),
    ]);
    const results = [];
    for (const stage of ['A', 'C', 'D', 'E', 'F']) {
      const asset = getStageBackground(stage); const width = 1200; const height = Math.round(width * asset.view.height / asset.view.width);
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const graphics = canvas.getContext('webgl', { alpha: false, preserveDrawingBuffer: true, antialias: false })!;
      const resources = Object.fromEntries(['Texture', 'Program', 'Buffer', 'Framebuffer'].map((name) => [name, new Set()]));
      const methods = graphics as unknown as Record<string, (...args: unknown[]) => unknown>;
      for (const [name, live] of Object.entries(resources)) { const create = methods[`create${name}`].bind(graphics); const remove = methods[`delete${name}`].bind(graphics); methods[`create${name}`] = () => { const value = create(); if (value) live.add(value); return value; }; methods[`delete${name}`] = (value) => { live.delete(value); return remove(value); }; }
      const bridge = new RoamingLayer();
      const quality = { ...backgroundQuality(width, height, 1), compact: true, textureSize: 512 };
      const scene = await createBackgroundScene(canvas, graphics, asset, quality, new AbortController().signal, bridge);
      try {
        const actors = creatureLayout(stage, HIDING_PLACES[stage].map((anchor: { allowed?: string[] }, slot: number) => ({ id: slot, slot, asset: anchor.allowed?.[0] ?? 'aranara_01', phase: 'watching' })), { width, height, scale: 0.5, offset: 0, root: height - 100, treeHeight: 95, seed: 1027, growth: 0 }, []).filter((actor: { kind: string }) => actor.kind === 'roaming');
        bridge.setActors(actors, width, height);
        await new Promise<void>((resolve, reject) => { const check = () => { const states = bridge.snapshot(); if (actors.every((actor: { asset: string }) => states[actor.asset] === 'ready')) { clearTimeout(timeout); unsubscribe(); resolve(); } else if (Object.values(states).includes('fallback')) { clearTimeout(timeout); unsubscribe(); reject(new Error('depth-asset')); } }; const timeout = setTimeout(() => { unsubscribe(); reject(new Error('depth-timeout')); }, 20000); const unsubscribe = bridge.subscribe(check); check(); });
        for (let frame = 0; frame < 20; frame++) scene.draw(0.05, width, height);
        const capture = () => { const pixels = new Uint8Array(width * height * 4); graphics.readPixels(0, 0, width, height, graphics.RGBA, graphics.UNSIGNED_BYTE, pixels); return pixels; };
        const visible = capture();
        bridge.setActors(actors.map((actor: { left: number }) => ({ ...actor, left: -10000 })), width, height); scene.draw(0, width, height); const hidden = capture();
        let changes = 0; for (let index = 0; index < visible.length; index += 4) if (Math.abs(visible[index] - hidden[index]) + Math.abs(visible[index + 1] - hidden[index + 1]) + Math.abs(visible[index + 2] - hidden[index + 2]) > 15) changes++;
        const edges = actors.filter((actor: { edge?: string }) => actor.edge).map((actor: { edge: string; hit: { left: number; top: number } }) => {
          let changed = 0;
          for (let vertical = 0; vertical < 44; vertical++) for (let horizontal = 0; horizontal < 44; horizontal++) {
            const column = Math.floor((actor.hit.left + horizontal + width * 0.06) / 1.12); const row = height - 1 - Math.floor((actor.hit.top + vertical + height * 0.06) / 1.12);
            const index = (row * width + column) * 4;
            if (Math.abs(visible[index] - hidden[index]) + Math.abs(visible[index + 1] - hidden[index + 1]) + Math.abs(visible[index + 2] - hidden[index + 2]) > 15) changed++;
          }
          return { edge: actor.edge, changed };
        });
        bridge.setActors(actors, width, height); scene.draw(0, width, height);
        const image = document.createElement('canvas'); image.width = width; image.height = height; const context = image.getContext('2d')!; context.drawImage(canvas, -width * 0.06, -height * 0.06, width * 1.12, height * 1.12);
        const screenshot = image.toDataURL('image/png').split(',')[1];
        bridge.setActors([], width, height); scene.draw(0, width, height); const baseline = capture();
        let backgroundDelta = 0; for (let index = 0; index < hidden.length; index += 4) backgroundDelta += Math.abs(hidden[index] - baseline[index]) + Math.abs(hidden[index + 1] - baseline[index + 1]) + Math.abs(hidden[index + 2] - baseline[index + 2]);
        backgroundDelta /= width * height * 3;
        const error = graphics.getError(); scene.dispose();
        results.push({ stage, changes, edges, backgroundDelta, error, screenshot, remaining: Object.fromEntries(Object.entries(resources).map(([name, values]) => [name, values.size])) });
      } finally { scene.dispose(); graphics.getExtension('WEBGL_lose_context')?.loseContext(); }
    }
    return results;
  });
  for (const entry of result) {
    expect(entry.changes, entry.stage).toBeGreaterThan(100); expect(entry.error, entry.stage).toBe(0);
    expect(entry.backgroundDelta, `${entry.stage}-background`).toBeLessThan(4);
    for (const edge of entry.edges) expect(edge.changed, `${entry.stage}-${edge.edge}`).toBeGreaterThan(15);
    expect(entry.remaining, entry.stage).toEqual({ Texture: 0, Program: 0, Buffer: 0, Framebuffer: 0 });
    writeFileSync(`docs/screenshots/hiding/${entry.stage}-native-${testInfo.project.name}.png`, Buffer.from(entry.screenshot, 'base64'));
    await testInfo.attach(`hiding-native-${entry.stage}`, { body: Buffer.from(entry.screenshot, 'base64'), contentType: 'image/png' });
  }
  writeFileSync(`docs/inhabitants/hiding-gpu-${testInfo.project.name}.json`, JSON.stringify(result.map(({ screenshot, ...metrics }) => { void screenshot; return metrics; }), null, 2) + '\n');
});

test('四周藏身点在减少动态时仍可见 / 点击，不使用身体裁切或补画叶沿', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.clock.install(); await page.goto('/'); await page.getByRole('button', { name: '沉入梦乡' }).click();
  for (const [slot, edge] of [[6, 'left'], [7, 'right'], [8, 'top'], [9, 'bottom']] as const) {
    await preview(page, slot);
    await expect(page.locator(`.creature-roaming[data-edge=${edge}]`)).toBeVisible();
    await expect(page.locator('.roaming-poster-anchor .creature-poster')).toHaveCount(1);
    await expect(page.locator('.creature-hide-lip, .creature-roaming .creature-fallback-mask')).toHaveCount(0);
    await page.screenshot({ path: `docs/screenshots/hiding/edge-${edge}-${testInfo.project.name}.png`, animations: 'disabled' });
    await page.locator(`.creature-roaming[data-edge=${edge}] .creature-hit`).click();
    await expect(page.locator('.creature-roaming')).toHaveAttribute('data-celebrated', 'true');
    await page.clock.runFor(1400); await expect(page.locator('.creature-roaming')).toHaveCount(0);
  }
});

test('可收梦露从对应兰那罗中心散开，飞行和钻回过程可暂停', async ({ page }) => {
  await page.clock.install(); await page.goto('/'); await page.getByRole('button', { name: '沉入梦乡' }).click();
  await expect(page.locator('.background-scenery')).toHaveAttribute('data-renderer', 'ready', { timeout: 20000 });
  await preview(page, 0); await expect(page.locator('.forest-inhabitants')).toHaveAttribute('data-renderer', 'ready', { timeout: 20000 }); await page.clock.runFor(1000);
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
  const freeze = await page.addStyleTag({ content: '.dew-particle[data-launching=true] { animation-play-state: paused !important; }' });
  const button = page.locator('.creature-roaming .creature-hit'); const origin = (await button.boundingBox())!;
  await button.click(); const particles = page.locator('.dew-particle[data-launching=true]'); expect(await particles.count()).toBeGreaterThan(0);
  const centers = await particles.evaluateAll((elements) => elements.map((element) => { const bounds = element.getBoundingClientRect(); return { horizontal: bounds.x + bounds.width / 2, vertical: bounds.y + bounds.height / 2 }; }));
  for (const center of centers) { expect(Math.abs(center.horizontal - origin.x - origin.width / 2)).toBeLessThan(3); expect(Math.abs(center.vertical - origin.y - origin.height / 2)).toBeLessThan(3); }
  await freeze.evaluate((element) => (element as HTMLStyleElement).remove());
  await openSettings(page); await page.clock.fastForward(10000); expect(await particles.count()).toBeGreaterThan(0);
  await page.getByRole('button', { name: '关闭', exact: true }).click(); await page.clock.runFor(850); await expect(particles).toHaveCount(0);
  await page.clock.runFor(500); await expect(page.locator('.creature-roaming')).toHaveCount(0);
});

test('随机兰那罗缺骨骼仍在真实深度显示，背景上下文丢失与恢复不丢热点', async ({ page }, testInfo) => {
  const pattern = '**/asserts/inhabitants/aranara/**/*.json';
  await page.route(pattern, (route) => route.abort());
  await page.clock.install(); await page.goto('/'); await page.getByRole('button', { name: '沉入梦乡' }).click();
  await expect(page.locator('.background-scenery')).toHaveAttribute('data-renderer', 'ready', { timeout: 20000 });
  await preview(page, 0); await expect(page.locator('.forest-inhabitants')).toHaveAttribute('data-renderer', 'fallback');
  await expect.poll(async () => Number(await page.locator('.forest-inhabitants').getAttribute('data-texture-bytes'))).toBeGreaterThan(0);
  await expect(page.locator('.roaming-poster-anchor')).toHaveCount(0); await page.clock.runFor(1000);
  await page.screenshot({ path: `docs/screenshots/hiding/native-poster-${testInfo.project.name}.png`, animations: 'disabled' });
  const identity = await page.locator('.creature-roaming').getAttribute('data-creature-id');
  await page.unroute(pattern);
  const extension = await page.locator('.background-canvas').evaluateHandle((canvas) => (canvas as HTMLCanvasElement).getContext('webgl')!.getExtension('WEBGL_lose_context')!);
  await extension.evaluate((extension) => extension.loseContext());
  await expect(page.locator('.background-scenery')).toHaveAttribute('data-renderer', 'fallback');
  await expect(page.locator('.roaming-poster-anchor')).toHaveCount(1); await page.waitForTimeout(1100);
  await extension.evaluate((extension) => extension.restoreContext());
  await expect(page.locator('.background-scenery')).toHaveAttribute('data-renderer', 'ready', { timeout: 20000 });
  await expect(page.locator('.forest-inhabitants')).toHaveAttribute('data-renderer', 'ready', { timeout: 20000 });
  await expect(page.locator('.roaming-poster-anchor')).toHaveCount(0);
  await expect(page.locator('.creature-roaming')).toHaveAttribute('data-creature-id', identity!);
  await expect(page.locator('.background-canvas')).toHaveCount(1);
  expect(await page.locator('.background-canvas').evaluate((canvas) => (canvas as HTMLCanvasElement).getContext('webgl')!.getError())).toBe(0);
  await page.locator('.creature-roaming .creature-hit').click(); await expect(page.locator('.creature-roaming')).toHaveAttribute('data-celebrated', 'true');
  expect(await page.locator('.dew-particle[data-dew-kind=reward]').count()).toBeGreaterThan(0);
});
