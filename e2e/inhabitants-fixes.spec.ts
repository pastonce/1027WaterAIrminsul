import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

async function preview(page: Page, stage: string, slot: number) {
  await page.locator('.debug-panel > summary').click();
  await page.getByLabel(`调试切换到${stage}阶段`, { exact: true }).click();
  await page.getByLabel('调试藏身点', { exact: true }).selectOption(String(slot));
  await page.getByRole('button', { name: '查看指定藏身点', exact: true }).click();
  await page.locator('.debug-panel > summary').click();
}

async function sample(page: Page, time: number) {
  return page.locator('.roaming-poster-anchor .creature-poster').evaluate((image, time) => {
    const animation = image.getAnimations()[0]; if (!animation) throw new Error('missing-creature-animation');
    animation.pause(); animation.currentTime = time;
    const style = getComputedStyle(image); const transform = new DOMMatrixReadOnly(style.transform);
    const bounds = image.getBoundingClientRect();
    return { horizontal: transform.m41, vertical: transform.m42, opacity: Number(style.opacity), top: bounds.top, bottom: bounds.bottom, left: bounds.left, right: bounds.right };
  }, time);
}

test('C4 / C6 六姿态在桌面及两档横屏避开固定 UI，可真实点击领奖', async ({ page, isMobile }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.clock.install(); await page.goto('/');
  await page.getByRole('button', { name: '沉入梦乡', exact: true }).click();
  mkdirSync('docs/screenshots/hiding-fixes', { recursive: true });
  for (const viewport of [page.viewportSize()!, { width: 640, height: 360 }]) {
    await page.setViewportSize(viewport);
    for (const slot of [3, 5]) {
      await preview(page, 'C', slot); await page.clock.runFor(1000);
      const checks = await page.evaluate(async ({ viewport, slot }) => {
        const layoutModule = '/src/game/encounters/layout.ts'; const dataModule = '/src/data/inhabitants.ts';
        const [{ creatureLayout }, { ROAMING_ARANARA }] = await Promise.all([import(layoutModule), import(dataModule)]);
        const blocked = [...document.querySelectorAll('.game-header, .camera-controls, .water-action, .debug-panel > summary')].map((element) => element.getBoundingClientRect());
        return ROAMING_ARANARA.map((asset: string) => {
          const actor = creatureLayout('C', [{ id: 1, slot, asset, phase: 'watching' }], { ...viewport, scale: 0.4, offset: 0, root: viewport.height - 70, treeHeight: 360, seed: 1027 }, [])[0];
          const area = actor.hit;
          return { asset, inside: area.left >= 0 && area.top >= 0 && area.left + area.width <= viewport.width && area.top + area.height <= viewport.height, clear: blocked.every((block) => area.left + area.width <= block.left || area.left >= block.right || area.top + area.height <= block.top || area.top >= block.bottom) };
        });
      }, { viewport, slot });
      for (const check of checks) { expect(check.inside, `${slot}-${check.asset}`).toBe(true); expect(check.clear, `${slot}-${check.asset}`).toBe(true); }
      await page.screenshot({ path: `docs/screenshots/hiding-fixes/C${slot + 1}-${viewport.width}-${testInfo.project.name}.png`, animations: 'disabled' });
      const button = page.locator('.creature-roaming .creature-hit'); if (isMobile) await button.tap(); else await button.click();
      await expect(page.locator('.creature-roaming')).toHaveAttribute('data-celebrated', 'true');
      expect(await page.locator('.dew-particle[data-dew-kind=reward]').count()).toBeGreaterThan(0);
    }
  }
});

test('无 GL 时逐点渐显 / 下移 / 短程和屏缘直出保留，不退回原位', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...options: unknown[]) {
      return kind.includes('webgl') ? null : Reflect.apply(original, this, [kind, ...options]);
    } as typeof original;
  });
  await page.clock.install(); await page.goto('/'); await page.getByRole('button', { name: '沉入梦乡', exact: true }).click();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
  await page.addStyleTag({ content: '.roaming-poster-anchor .creature-poster { animation-play-state: paused !important; }' });
  for (const [stage, slot] of [['A', 0], ['A', 1], ['C', 2]] as const) {
    await preview(page, stage, slot); await expect(page.locator('.creature-roaming')).toHaveAttribute('data-arrival', 'fade');
    const first = await sample(page, 0); const middle = await sample(page, 375);
    expect(first.opacity).toBe(0); expect(middle.opacity).toBeGreaterThan(0.4); expect(middle.opacity).toBeLessThan(1);
    expect(middle.horizontal).toBeCloseTo(0); expect(middle.vertical).toBeCloseTo(0);
  }
  await page.clock.runFor(800); await page.locator('.creature-roaming .creature-hit').click();
  const bottom = await sample(page, 1350); expect(bottom.top).toBeGreaterThan(page.viewportSize()!.height);
  for (const stage of ['D', 'E']) for (const slot of [0, 1, 5]) {
    await preview(page, stage, slot); await expect(page.locator('.creature-roaming')).toHaveAttribute('data-travel', '0.3');
    const box = (await page.locator('.roaming-poster-anchor').boundingBox())!; const start = await sample(page, 0);
    expect(Math.abs(start.vertical)).toBeLessThan(box.height * 0.28 + 1); expect(Math.abs(start.horizontal)).toBeLessThan(box.width * 0.28 + 1);
  }
  for (const slot of [6, 7]) {
    await preview(page, 'A', slot); await page.clock.runFor(800); await page.locator('.creature-roaming .creature-hit').click();
    const airborne = await sample(page, 1350 * 0.55); const end = await sample(page, 1350);
    expect(airborne.vertical).toBeLessThan(-25); expect(end.vertical).toBeLessThan(-25);
    if (slot === 6) expect(end.right).toBeLessThan(0); else expect(end.left).toBeGreaterThan(page.viewportSize()!.width);
  }
});

test('树的空白 / 透明区域穿透，命中跟随实际高度且不吞兰那罗点击', async ({ page, isMobile }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.clock.install(); await page.goto('/');
  await page.getByRole('button', { name: '沉入梦乡', exact: true }).click();
  await page.clock.runFor(200);
  await expect.poll(() => page.locator('.tree-world').evaluate((element) => {
    const inline = (element as HTMLElement).style; const computed = getComputedStyle(element);
    const targetScale = Number(inline.transform.match(/scale\(([^)]+)\)/)![1]);
    return Math.max(Math.abs(new DOMMatrix(computed.transform).a - targetScale) * 3400, Math.abs(parseFloat(computed.bottom) - parseFloat(inline.bottom)));
  })).toBeLessThan(0.01);
  const target = await page.evaluate(() => {
    const tree = document.querySelector('.dream-tree') as SVGSVGElement;
    const point = new DOMPoint(690, 3260).matrixTransform(tree.getScreenCTM()!);
    const button = document.createElement('button'); button.dataset.testUnderTree = '0'; button.style.cssText = `position:absolute;z-index:2;left:${point.x - 22}px;top:${point.y - 22}px;width:44px;height:44px;`;
    button.onclick = () => { button.dataset.testUnderTree = String(Number(button.dataset.testUnderTree) + 1); };
    document.querySelector('.dream-scene')!.append(button);
    return { horizontal: point.x, vertical: point.y };
  });
  if (isMobile) await page.touchscreen.tap(target.horizontal, target.vertical); else await page.mouse.click(target.horizontal, target.vertical);
  await expect(page.locator('[data-test-under-tree]')).toHaveAttribute('data-test-under-tree', '1');
  expect(await page.locator('.dream-tree').evaluate((tree) => getComputedStyle(tree).pointerEvents)).toBe('none');
  const rootAnchor = () => page.locator('.dream-tree').evaluate((element) => new DOMPoint(500, 3300).matrixTransform((element as SVGSVGElement).getScreenCTM()!).y);
  const firstRoot = await rootAnchor();
  const first = (await page.locator('.tree-hit-target').boundingBox())!;
  await page.locator('.debug-panel > summary').click(); await page.getByLabel('调试成长值', { exact: true }).fill('104'); await page.locator('.debug-panel > summary').click(); await page.clock.runFor(500);
  const grown = (await page.locator('.tree-hit-target').boundingBox())!; expect(grown.height).toBeGreaterThan(first.height + 20);
  expect(await rootAnchor()).toBeCloseTo(firstRoot, 1);
  expect(await page.locator('.tree-hit-target').getAttribute('fill')).not.toBe('transparent'); await expect(page.locator('.tree-hit-target')).not.toHaveAttribute('pointer-events', 'all');
  await preview(page, 'C', 2); await page.clock.runFor(1000); const button = page.locator('.creature-roaming .creature-hit'); if (isMobile) await button.tap(); else await button.click();
  await expect(page.locator('.creature-roaming')).toHaveAttribute('data-celebrated', 'true');
  await page.getByRole('button', { name: '梦中的树', exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(page.locator('.dialogue-bubble[data-speaker=tree]')).toBeVisible();
});

test('真实 Spine 逐点渐显和短程退场不穿帮，C3 从下方离开', async ({ page }, testInfo) => {
  test.setTimeout(150000); await page.goto('/');
  const result = await page.evaluate(async () => {
    const paths = ['/src/data/backgrounds.ts', '/src/game/backgrounds/scene.ts', '/src/game/backgrounds/policy.ts', '/src/game/encounters/RoamingLayer.ts', '/src/game/encounters/layout.ts', '/src/data/inhabitants.ts'];
    const [{ getStageBackground }, { createBackgroundScene }, { backgroundQuality }, { RoamingLayer }, { creatureLayout }, { ROAMING_ARANARA }] = await Promise.all(paths.map((path) => import(path)));
    const results = [];
    for (const [stage, slots] of [['A', [0, 1]], ['C', [2]], ['D', [0, 1, 5]], ['E', [0, 1, 5]]] as const) {
      const width = 1200; const asset = getStageBackground(stage); const height = Math.round(width * asset.view.height / asset.view.width);
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const graphics = canvas.getContext('webgl', { alpha: false, antialias: false, preserveDrawingBuffer: true })!;
      const bridge = new RoamingLayer(); const scene = await createBackgroundScene(canvas, graphics, asset, { ...backgroundQuality(width, height, 1), compact: true, textureSize: 512 }, new AbortController().signal, bridge);
      const pixels = () => { const buffer = new Uint8Array(width * height * 4); graphics.readPixels(0, 0, width, height, graphics.RGBA, graphics.UNSIGNED_BYTE, buffer); return buffer; };
      const waitForAsset = async (asset: string) => {
        if (bridge.snapshot()[asset] === 'ready') return;
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => { unsubscribe(); reject(new Error('motion-asset-timeout')); }, 20000);
          const unsubscribe = bridge.subscribe(() => { if (bridge.snapshot()[asset] === 'ready') { clearTimeout(timeout); unsubscribe(); resolve(); } });
        });
      };
      const advance = (seconds: number) => { const count = Math.ceil(seconds / 0.05); for (let frame = 0; frame < count; frame++) scene.draw(seconds / count, width, height); };
      try {
        for (const slot of slots) for (const selected of ROAMING_ARANARA) {
          const actor = creatureLayout(stage, [{ id: 1, slot, asset: selected, phase: 'arriving' }], { width, height, scale: 0.5, offset: 0, root: height - 80, treeHeight: 95, seed: 1027 }, [])[0];
          bridge.setActors([actor], width, height); await waitForAsset(selected); scene.draw(0, width, height);
          const difference = () => {
            const visible = pixels(); bridge.setActors([{ ...actor, left: -10000 }], width, height); scene.draw(0, width, height); const hidden = pixels();
            bridge.setActors([actor], width, height); scene.draw(0, width, height);
            let changed = 0; for (let index = 0; index < visible.length; index += 4) if (Math.abs(visible[index] - hidden[index]) + Math.abs(visible[index + 1] - hidden[index + 1]) + Math.abs(visible[index + 2] - hidden[index + 2]) > 30) changed++;
            return changed;
          };
          const entrance = difference(); advance(0.9); const watching = difference();
          actor.phase = 'leaving'; bridge.setActors([actor], width, height); scene.draw(0, width, height); advance(0.7); const departed = difference();
          const error = graphics.getError(); results.push({ stage, slot: slot + 1, asset: selected, entrance, watching, departed, error });
          bridge.setActors([], width, height);
        }
      } finally { scene.dispose(); graphics.getExtension('WEBGL_lose_context')?.loseContext(); }
    }
    return results;
  });
  writeFileSync(`docs/inhabitants/spot-motion-${testInfo.project.name}.json`, JSON.stringify(result, null, 2) + '\n');
  for (const entry of result) {
    expect(entry.error, `${entry.stage}${entry.slot}-${entry.asset}`).toBe(0);
    if (entry.stage === 'A' || entry.stage === 'C') expect(entry.entrance, `${entry.stage}${entry.slot}-${entry.asset}`).toBe(0);
    expect(entry.watching, `${entry.stage}${entry.slot}-${entry.asset}`).toBeGreaterThan(15);
    if (entry.stage !== 'A') expect(entry.departed, `${entry.stage}${entry.slot}-${entry.asset}`).toBe(0);
  }
});
