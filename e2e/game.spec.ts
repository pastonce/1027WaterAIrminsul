import { openSettings } from './settings-support';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { GameSave } from '../src/types/game';
import { STAGES } from '../src/data/stages';
import { dialoguePool } from '../src/data/dialogues';
import { finishOpening } from './opening-support';
import { finishSceneEntrance } from './scene-support';
import { OPENING_RULES } from '../src/game/opening/choreography';

async function enter(page: Page) {
  await page.clock.install();
  await page.goto('/');
  await finishOpening(page, true);
  await page.getByRole('button', { name: '沉入梦乡' }).click();
  await expect(page.getByTestId('dream-scene')).toBeVisible();
  await finishSceneEntrance(page, true);
  for (let attempt = 0; attempt < 40 && await page.locator('.dialogue-bubble').count() && await page.locator('.dialogue-bubble p .sr-only').textContent() === dialoguePool('shared/welcome')[0].text; attempt++) await page.clock.fastForward(250);
}

async function saved(page: Page): Promise<GameSave> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('irminsul.development.v2') ?? '{}') as GameSave);
}

async function debug(page: Page) {
  const details = page.locator('.debug-panel');
  if (!await details.evaluate((element) => element.hasAttribute('open'))) await details.locator('summary').click();
}

async function closeDebug(page: Page) {
  const details = page.locator('.debug-panel');
  if (await details.evaluate((element) => element.hasAttribute('open'))) await details.locator('summary').click();
}

async function settleAmbient(page: Page) {
  for (let iteration = 0; iteration < 28; iteration++) {
    const pending = await page.locator('.dialogue-bubble, .nahida-companion, .dream-scene.is-watering, .dream-tree.is-growing, .game-app.is-awakening, .stage-loading-screen').count();
    if (!pending) return;
    if (await page.locator('.stage-loading-screen[data-phase=loading]').count() && await page.locator('.background-scenery').count()) await expect(page.locator('.background-scenery')).toHaveAttribute('data-renderer', /ready|static|fallback/);
    await page.locator('.game-app').dispatchEvent('pointerdown'); await page.clock.fastForward(5000);
  }
  throw new Error('Automatic presentation did not finish');
}

async function fillDew(page: Page, mobile: boolean) {
  for (let iteration = 0; iteration < 10; iteration++) {
    if (await page.getByTestId('dew-count').textContent() === '13') break;
    await page.clock.fastForward(2100);
    const dew = page.locator('.dew-particle:not(.is-collected):not(.is-expiring)').first();
    if (mobile) await dew.tap(); else { await dew.click(); await page.mouse.move(0, 0); }
    await page.clock.fastForward(550);
  }
  await expect(page.getByTestId('dew-count')).toHaveText('13');
}

async function treePoint(page: Page) {
  return page.evaluate(() => {
    const tree = document.querySelector('.tree-hit-target');
    if (!tree) throw new Error('Missing tree');
    const bounds = tree.getBoundingClientRect();
    const left = bounds.left + bounds.width / 2;
    const minimum = Math.max(90, bounds.top + 8);
    const maximum = Math.min(window.innerHeight - 80, bounds.bottom - 8);
    for (let fraction = 0.5; fraction <= 1; fraction += 0.1) {
      const top = minimum + (maximum - minimum) * fraction;
      if (document.elementFromPoint(left, top)?.closest('.dream-tree')) return { x: left, y: top };
    }
    throw new Error('No unobstructed point on the tree');
  });
}

async function touchTree(page: Page, mobile: boolean) {
  await expect(page.locator('.background-scenery')).toHaveAttribute('data-renderer', /ready|fallback|static/, { timeout: 20000 });
  if (Number(await page.getByTestId('dream-scene').getAttribute('data-ground-entrance')) > 1) await page.clock.runFor(3600);
  const point = await treePoint(page);
  if (mobile) await page.touchscreen.tap(point.x, point.y); else await page.mouse.click(point.x, point.y);
}

async function characterPixels(page: Page) {
  return page.locator('.reality-character canvas').evaluate((element) => new Promise<{ hash: number; visible: number }>((resolve) => requestAnimationFrame(() => {
    const canvas = element as HTMLCanvasElement;
    const graphics = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!graphics) throw new Error('Missing character graphics context');
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    graphics.readPixels(0, 0, canvas.width, canvas.height, graphics.RGBA, graphics.UNSIGNED_BYTE, pixels);
    let hash = 2166136261; let visible = 0;
    for (let index = 3; index < pixels.length; index += 4) { const occupied = pixels[index] > 0 ? 1 : 0; hash = Math.imul(hash ^ occupied, 16777619); visible += occupied; }
    resolve({ hash, visible });
  })));
}

test('主界面隐藏成长信息，浇灌按钮位于右下角', async ({ page }) => {
  await enter(page);
  await expect(page.locator('.scene-copy, .growth-meter, .growth-note, .scene-hint, .listen-button, .time-gate, .story-overlay, .game-toast')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '听树说话' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '梦中的树', exact: true })).toBeVisible();
  const button = await page.getByRole('button', { name: '浇灌梦中的树', exact: true }).boundingBox();
  const viewport = page.viewportSize()!;
  expect(button!.x).toBeGreaterThan(viewport.width * 0.7); expect(button!.y).toBeGreaterThan(viewport.height * 0.7);
  await openSettings(page);
  await expect(page.locator('.journal-chapters, .journal-stats')).toHaveCount(0);
  await expect(page.getByRole('dialog')).not.toContainText(/CHAPTER|成长值|初生|幽禁|破晓/);
});

test('梦露五秒未收集后淡出，设置暂停剩余时间，过期点击不加资源', async ({ page }) => {
  const start = new Date('2026-10-22T02:27:00Z');
  await page.clock.install({ time: start }); await page.clock.pauseAt(new Date(start.getTime() + 10));
  await page.addInitScript(() => { Math.random = () => 0.5; });
  await page.goto('/'); await finishOpening(page, true); await page.getByRole('button', { name: '沉入梦乡' }).click();
  const firstSpawnDelay = 1500 - OPENING_RULES.durationMs % 1500;
  await page.clock.runFor(firstSpawnDelay);
  const particle = page.locator('.dew-particle[data-dew-id="1"]'); await expect(particle).toBeEnabled();
  await page.clock.runFor(3000); await openSettings(page);
  await page.clock.fastForward(60000); await expect(particle).not.toHaveClass(/is-expiring/);
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.clock.runFor(1999); await expect(particle).toBeEnabled();
  await page.clock.runFor(1); await expect(particle).toHaveClass(/is-expiring/); await expect(particle).toBeDisabled();
  const before = await page.getByTestId('dew-count').textContent();
  await particle.evaluate((element) => element.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await expect(page.getByTestId('dew-count')).toHaveText(before!);
  await page.clock.runFor(300); await expect(particle).toHaveCount(0);
  await expect(page.locator('.dew-particle:enabled').first()).toBeVisible();
});

test('收露、重复浇灌与刷新恢复', async ({ page, isMobile }, testInfo) => {
  await page.addInitScript(() => { Math.random = () => 0.99; });
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await enter(page); await fillDew(page, isMobile);
  await page.screenshot({ path: `docs/screenshots/dream-${testInfo.project.name}.png`, animations: 'disabled' });
  await page.getByRole('button', { name: '浇灌梦中的树', exact: true }).dblclick();
  await expect.poll(async () => (await saved(page)).growth).toBe(13); await expect(page.getByTestId('dew-count')).toHaveText('0');
  await page.reload(); await finishOpening(page, true); await expect.poll(async () => (await saved(page)).growth).toBe(13); await expect(page.getByTestId('dew-count')).toHaveText('0');
  for (let attempt = 0; attempt < 40 && await page.locator('.dialogue-bubble').count() && await page.locator('.dialogue-bubble p .sr-only').textContent() === dialoguePool('shared/welcome')[0].text; attempt++) await page.clock.fastForward(250);
  await expect(page.locator('.dialogue-bubble[data-speaker=tree]')).toBeVisible();
  expect(STAGES.A.dialogue.map((entry) => entry.text)).toContain(await page.locator('.dialogue-bubble .sr-only').textContent());
  expect(errors).toEqual([]);
});

test('每次浇灌播放本阶段随机对白，未耗尽的一轮不重复', async ({ page, isMobile }) => {
  await page.addInitScript(() => { Math.random = () => 0.5; });
  await enter(page);
  const selected = new Set<string>();
  for (let iteration = 0; iteration < 2; iteration++) {
    await fillDew(page, isMobile); await page.getByRole('button', { name: '浇灌梦中的树', exact: true }).click();
    await page.clock.fastForward(1400);
    await expect(page.locator('.dialogue-bubble[data-speaker=tree]')).toBeVisible();
    expect(STAGES.A.dialogue.map((entry) => entry.text)).toContain(await page.locator('.dialogue-bubble .sr-only').textContent());
    selected.add((await page.locator('.dialogue-bubble .sr-only').textContent())!);
    await settleAmbient(page);
  }
  expect(selected.size).toBe(2); expect((await saved(page)).growth).toBe(26); expect((await saved(page)).pendingWaterings).toEqual([]);
});

test('日期解锁后补浇越界，加载完成才播放目标阶段转场句', async ({ page, isMobile }) => {
  await enter(page); await debug(page); await page.getByLabel('调试切换到C阶段', { exact: true }).click(); await page.getByLabel('调试成长值', { exact: true }).fill('520'); await closeDebug(page); await settleAmbient(page);
  await debug(page); await page.getByLabel('模拟日期时间', { exact: true }).fill('2026-10-26T10:27'); await page.getByRole('button', { name: '应用时间', exact: true }).click(); await closeDebug(page);
  await expect(page.getByTestId('stage-loading')).toHaveCount(0); await fillDew(page, isMobile); await page.getByRole('button', { name: '浇灌梦中的树', exact: true }).click();
  for (let attempt = 0; attempt < 100 && !await page.getByTestId('stage-loading').count(); attempt++) await page.clock.fastForward(500);
  await expect(page.getByTestId('stage-loading')).toBeVisible(); await page.clock.fastForward(200);
  await expect(page.locator('.background-scenery')).toHaveAttribute('data-renderer', /ready|static|fallback/);
  for (let attempt = 0; attempt < 50 && await page.getByTestId('stage-loading').count(); attempt++) await page.clock.fastForward(250);
  const chosen = (await page.locator('.dialogue-bubble .sr-only').textContent())!;
  expect(dialoguePool('D/transition').map((entry) => entry.text)).toContain(chosen);
  await expect(page.getByRole('button', { name: '浇灌梦中的树', exact: true })).toBeEnabled();
  await settleAmbient(page); expect((await saved(page)).playedDialogues).toContain(dialoguePool('D/transition').find((entry) => entry.text === chosen)!.id);
  await page.clock.fastForward(30000); await expect(page.locator('.dialogue-bubble')).toHaveCount(0);
});

test('梦露避开树干、枝叶和固定按钮，根冠移动及窄屏仍可收取', async ({ page }) => {
  await enter(page);
  const checkPositions = async () => {
    const problems = await page.locator('.dew-particle:not(.is-collected):not(.is-expiring)').evaluateAll((elements) => {
      const bodies = Array.from(document.querySelectorAll('.tree-crown, .tree-hit-target, .tree-roots, .dream-tree g[data-history]')).map((element) => element.getBoundingClientRect());
      return elements.flatMap((element) => {
        const bounds = element.getBoundingClientRect();
        const center = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
        const overlap = bodies.some((body) => bounds.left < body.right && bounds.right > body.left && bounds.top < body.bottom && bounds.bottom > body.top);
        return overlap || !center?.closest('.dew-particle') ? [{ overlap, intercepted: center?.tagName }] : [];
      });
    });
    expect(problems).toEqual([]);
  };
  for (const stage of ['A', 'D', 'F']) {
    await debug(page); await page.getByLabel(`调试切换到${stage}阶段`, { exact: true }).click(); await closeDebug(page);
    for (let iteration = 0; iteration < 7; iteration++) await page.clock.fastForward(2100);
    expect(await page.locator('.dew-particle:not(.is-collected):not(.is-expiring)').count()).toBeGreaterThan(0); await checkPositions();
    await page.clock.fastForward(1500); await checkPositions();
    await page.clock.fastForward(1500); await checkPositions();
  }
  await page.setViewportSize({ width: 640, height: 360 }); await page.clock.fastForward(1500); await checkPositions();
});

test('不足与满额收取晃动计数，不出现提示框', async ({ page, isMobile }) => {
  await enter(page); await page.getByRole('button', { name: '浇灌梦中的树', exact: true }).click();
  await expect(page.locator('.dew-counter')).toHaveAttribute('data-feedback', 'insufficient');
  const first = await page.locator('.dew-counter').elementHandle();
  await page.getByRole('button', { name: '浇灌梦中的树', exact: true }).click();
  expect(await first!.evaluate((element) => element.isConnected)).toBe(false);
  await fillDew(page, isMobile); await page.clock.fastForward(2100);
  const dew = page.locator('.dew-particle:not(.is-collected):not(.is-expiring)').first();
  if (isMobile) await dew.tap(); else await dew.click();
  await expect(page.locator('.dew-counter')).toHaveAttribute('data-feedback', 'full');
  await expect(page.getByTestId('dew-count')).toHaveText('13');
  await expect(page.locator('.game-toast')).toHaveCount(0);
  await page.getByRole('button', { name: '浇灌梦中的树', exact: true }).click();
  await expect(page.locator('.dew-counter')).not.toHaveAttribute('data-feedback', /.+/);
});

test('点击树体自动播放气泡，期间仍可浇灌且无需确认', async ({ page, isMobile }) => {
  await enter(page); await fillDew(page, isMobile); await touchTree(page, isMobile);
  await expect(page.locator('.dialogue-bubble[data-speaker=tree]')).toBeVisible();
  await page.clock.fastForward(500);
  await expect(page.locator('.dialogue-bubble p > span[aria-hidden=true]')).not.toHaveText('');
  await expect(page.locator('.dialogue-bubble button')).toHaveCount(0); await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '设置', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '浇灌梦中的树', exact: true }).click();
  await expect.poll(async () => (await saved(page)).growth).toBe(13);
  await settleAmbient(page); await expect(page.locator('.dialogue-bubble')).toHaveCount(0);
  const viewport = page.viewportSize()!;
  if (isMobile) await page.touchscreen.tap(viewport.width * 0.7, viewport.height * 0.8); else await page.mouse.click(viewport.width * 0.7, viewport.height * 0.8);
  await expect(page.locator('.dialogue-bubble')).toHaveCount(0);
  await page.getByRole('button', { name: '梦中的树', exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(page.locator('.dialogue-bubble[data-speaker=tree]')).toBeVisible();
});

test('纳西妲浮现在树旁观察，自动离开并保存来访', async ({ page, isMobile }, testInfo) => {
  await enter(page); await fillDew(page, isMobile); await debug(page); await page.getByRole('button', { name: '触发纳西妲来访', exact: true }).click(); await closeDebug(page);
  await expect(page.locator('.nahida-companion')).toBeVisible(); await page.clock.fastForward(1300);
  await expect(page.locator('.nahida-avatar[data-character=nahida_dream]')).toHaveAttribute('data-renderer', 'ready');
  await expect(page.locator('.nahida-companion .nahida-avatar')).toHaveAttribute('data-action', 'observe');
  await expect(page.locator('.dialogue-bubble[data-speaker=nahida]')).toBeVisible();
  await page.clock.fastForward(1000);
  await expect(page.locator('.dialogue-bubble p > span[aria-hidden=true]')).not.toHaveText('');
  const character = await page.locator('.nahida-companion').boundingBox(); const viewport = page.viewportSize()!;
  expect(character!.x).toBeGreaterThanOrEqual(0); expect(character!.x + character!.width).toBeLessThan(viewport.width - 40);
  expect(character!.height).toBeGreaterThanOrEqual(isMobile ? 140 : 300);
  if (isMobile) {
    const bubble = await page.locator('.dialogue-bubble').boundingBox(); const right = await page.locator('.nahida-companion').getAttribute('data-position') === '1';
    if (right) expect(bubble!.x + bubble!.width).toBeLessThanOrEqual(character!.x); else expect(bubble!.x).toBeGreaterThan(character!.x + character!.width);
    await expect(page.locator('.dialogue-bubble')).toHaveClass(right ? /bubble-right/ : /bubble-left/);
  }
  await page.screenshot({ path: `docs/screenshots/visit-${testInfo.project.name}.png`, animations: 'disabled' });
  await page.getByRole('button', { name: '浇灌梦中的树', exact: true }).click();
  await expect.poll(async () => (await saved(page)).growth).toBe(13);
  await settleAmbient(page); await expect(page.locator('.nahida-companion')).toHaveCount(0);
  expect((await saved(page)).completedVisits).toContain('visit-A'); await page.reload(); await finishOpening(page, true);
  await expect(page.locator('.nahida-companion')).toHaveCount(0);
});

test('阶段自动衔接，时间锁生效，花朵不使用心形', async ({ page, isMobile }) => {
  await enter(page); await debug(page); await page.getByLabel('调试切换到C阶段', { exact: true }).click(); await page.getByLabel('调试成长值', { exact: true }).fill('520'); await closeDebug(page);
  expect((await saved(page)).completedStages).not.toContain('C');
  await expect(page.locator('.story-overlay')).toHaveCount(0); await expect(page.getByRole('button', { name: '浇灌梦中的树', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '浇灌梦中的树', exact: true }).click(); expect((await saved(page)).growth).toBe(520); await page.clock.fastForward(1000);
  await debug(page); await page.getByLabel('模拟日期时间', { exact: true }).fill('2026-10-26T10:27'); await page.getByRole('button', { name: '应用时间', exact: true }).click();
  await expect(page.getByTestId('debug-stage')).toHaveText('C'); await closeDebug(page); await settleAmbient(page);
  await fillDew(page, isMobile); await page.getByRole('button', { name: '浇灌梦中的树', exact: true }).click(); await settleAmbient(page);
  await expect(page.locator('.theme-dawn')).toBeVisible();
  await fillDew(page, isMobile); await page.getByRole('button', { name: '浇灌梦中的树', exact: true }).click(); expect((await saved(page)).growth).toBe(534);
  await debug(page); await page.getByLabel('调试切换到C阶段', { exact: true }).click(); await closeDebug(page);
  expect(await page.locator('.tree-flower ellipse').count()).toBeGreaterThan(0); await expect(page.locator('.tree-flower path')).toHaveCount(0);
});

test('拖动树体只观树，不误触对白，随后点击正常', async ({ page, isMobile }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await enter(page); await debug(page); await page.getByLabel('调试切换到D阶段', { exact: true }).click(); await page.getByLabel('调试成长值', { exact: true }).fill('750'); await closeDebug(page);
  await settleAmbient(page); await page.clock.fastForward(3000);
  await page.screenshot({ path: `docs/screenshots/crown-${testInfo.project.name}.png`, animations: 'disabled' });
  await page.clock.fastForward(2500);
  await expect.poll(async () => Number(await page.getByTestId('dream-scene').getAttribute('data-camera-offset'))).toBe(0);
  const point = await treePoint(page);
  if (isMobile) {
    const session = await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x, y: point.y + 25 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x, y: point.y + 65 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await session.detach();
  } else {
    await page.mouse.move(point.x, point.y); await page.mouse.down(); await page.mouse.move(point.x, point.y + 65, { steps: 8 }); await page.mouse.up();
  }
  await expect.poll(async () => Number(await page.getByTestId('dream-scene').getAttribute('data-camera-offset'))).toBe(0);
  await expect(page.locator('.dialogue-bubble')).toHaveCount(0); await touchTree(page, isMobile);
  await expect(page.locator('.dialogue-bubble')).toBeVisible();
  await expect(page.getByRole('button', { name: '返回树冠', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth === window.innerWidth && document.documentElement.scrollHeight === window.innerHeight)).toBe(true);
  expect(errors).toEqual([]);
});

test('设置暂停对白，手记口令不再展示', async ({ page, isMobile }) => {
  await enter(page); await touchTree(page, isMobile); await expect(page.locator('.dialogue-bubble')).toBeVisible();
  const line = await page.locator('.dialogue-bubble .sr-only').textContent(); await openSettings(page);
  await page.clock.fastForward(60000); await expect(page.locator('.dialogue-bubble')).toHaveCount(0); await page.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(page.locator('.dialogue-bubble .sr-only')).toHaveText(line!); await settleAmbient(page);
  await openSettings(page); await expect(page.getByRole('button', { name: '梦境手记', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('对梦境说一句悄悄话')).toHaveCount(0); await page.getByRole('button', { name: '关闭', exact: true }).click(); expect((await saved(page)).growth).toBe(0);
});

test('自动梦醒、梦境回访且 G 后无夜间阶段', async ({ page }, testInfo) => {
  await enter(page); await debug(page); await page.getByRole('button', { name: '准备 F→G 最后浇灌', exact: true }).click(); await closeDebug(page); await settleAmbient(page);
  await page.getByRole('button', { name: '浇灌梦中的树', exact: true }).click(); await settleAmbient(page);
  await expect(page.getByTestId('reality-scene')).toBeVisible(); await expect(page.getByRole('heading', { name: /生日快乐/ })).toBeVisible();
  await expect(page.locator('.nahida-avatar[data-character=reality]')).toHaveAttribute('data-renderer', 'ready');
  await page.screenshot({ path: `docs/screenshots/reality-${testInfo.project.name}.png`, animations: 'disabled' });
  await page.getByRole('button', { name: '回望那场长梦', exact: true }).click(); await expect(page.getByTestId('dream-scene')).toBeVisible();
  expect((await saved(page)).growth).toBe(1028); await page.getByRole('button', { name: '回到现实', exact: true }).click(); await expect(page.getByTestId('reality-scene')).toBeVisible();
  await debug(page); await page.getByLabel('模拟日期时间', { exact: true }).fill('2026-10-27T22:27'); await page.getByRole('button', { name: '应用时间', exact: true }).click(); await closeDebug(page);
  await expect(page.locator('.night-dew, .reality-night')).toHaveCount(0); expect((await saved(page)).nightComplete).toBe(false);
  await page.reload(); await finishOpening(page, true); await expect(page.getByTestId('reality-scene')).toBeVisible(); await expect(page.locator('.night-dew')).toHaveCount(0);
});

test('素材失败、减少动态、窄屏与旋转', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.route('**/asserts/**', (route) => route.abort());
  await enter(page); await debug(page); await page.getByLabel('调试切换到G阶段', { exact: true }).click(); await closeDebug(page);
  await expect(page.locator('.character-fallback')).toContainText('纳西妲'); await expect(page.locator('.game-app')).toHaveClass(/reduced-motion/);
  await expect(page.locator('.nahida-avatar')).toHaveAttribute('data-renderer', 'fallback');
  await page.setViewportSize({ width: 640, height: 360 }); await page.getByRole('button', { name: '和纳西妲聊天', exact: true }).click();
  await expect(page.locator('.dialogue-bubble')).toBeVisible();
  const bounds = await page.locator('.dialogue-bubble').boundingBox(); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(640);
  const fallback = await page.locator('.character-fallback').boundingBox(); expect(fallback!.y + fallback!.height).toBeLessThanOrEqual(360);
  const line = await page.locator('.dialogue-bubble .sr-only').textContent();
  await page.setViewportSize({ width: 390, height: 844 }); await expect(page.locator('.rotate-overlay')).toBeVisible(); await page.clock.fastForward(60000);
  await page.setViewportSize({ width: 844, height: 390 }); await expect(page.locator('.rotate-overlay')).toBeHidden(); await expect(page.getByTestId('reality-scene')).toBeVisible();
  await expect(page.locator('.dialogue-bubble .sr-only')).toHaveText(line!);
});

test('两套角色按场景切换，暂停不重载，减少动态保持静止', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, options?: WebGLContextAttributes) {
      return Reflect.apply(original, this, [kind, kind.startsWith('webgl') ? { ...options, preserveDrawingBuffer: true } : options]);
    } as typeof original;
  });
  await enter(page); await debug(page); await page.getByLabel('调试切换到G阶段', { exact: true }).click(); await closeDebug(page);
  const avatar = page.locator('.nahida-avatar[data-character=reality]'); await expect(avatar).toHaveAttribute('data-renderer', 'ready');
  const canvas = page.locator('.reality-character canvas'); const original = await canvas.elementHandle();
  await openSettings(page); await expect(avatar).toHaveAttribute('data-paused', 'true');
  await page.clock.fastForward(50); const pausedImage = await characterPixels(page); await page.clock.fastForward(2000);
  expect(pausedImage.visible).toBeGreaterThan(100); expect(await characterPixels(page)).toEqual(pausedImage); expect(await original!.evaluate((element) => element.isConnected)).toBe(true);
  await page.getByRole('checkbox', { name: /减少动态效果/ }).check(); await page.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(avatar).toHaveAttribute('data-renderer', 'ready'); await expect(avatar).toHaveAttribute('data-paused', 'true');
  await page.clock.fastForward(50); const reducedImage = await characterPixels(page);
  expect(reducedImage.visible).toBeGreaterThan(100); await page.clock.fastForward(2000); expect(await characterPixels(page)).toEqual(reducedImage);
  await page.getByRole('button', { name: '回望那场长梦', exact: true }).click(); await expect(page.getByTestId('dream-scene')).toBeVisible();
  await expect(page.locator('.reality-character canvas')).toHaveCount(0); expect(await original!.evaluate((element) => element.isConnected)).toBe(false);
  await page.getByRole('button', { name: '回到现实', exact: true }).click(); await expect(avatar).toHaveAttribute('data-renderer', 'ready');
  expect(errors).toEqual([]);
});

test('新版现实素材与哈希纹理正常加载，放大后的角色和对白在窄屏不遮挡操作', async ({ page }, testInfo) => {
  const errors: string[] = []; const requests: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => { if (request.url().includes('/characters/reality/')) requests.push(new URL(request.url()).pathname); });
  page.on('response', (response) => { if (response.url().includes('/characters/reality/') && response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await enter(page); await debug(page); await page.getByLabel('调试切换到G阶段', { exact: true }).click(); await closeDebug(page);
  await expect(page.locator('.nahida-avatar[data-character=reality]')).toHaveAttribute('data-renderer', 'ready');
  await page.getByRole('button', { name: '和纳西妲聊天', exact: true }).click();
  const assertLayout = async () => {
    const actor = await page.locator('.reality-character').boundingBox(); const bubble = await page.locator('.dialogue-bubble').boundingBox(); const viewport = page.viewportSize()!;
    expect(actor!.height).toBeGreaterThan(viewport.height * 0.7); expect(actor!.y).toBeGreaterThanOrEqual(55); expect(actor!.y + actor!.height).toBeLessThanOrEqual(viewport.height - 12);
    expect(bubble!.x).toBeGreaterThanOrEqual(16); expect(bubble!.x + bubble!.width).toBeLessThanOrEqual(viewport.width - 16);
    expect(bubble!.x + bubble!.width <= actor!.x || bubble!.x >= actor!.x + actor!.width).toBe(true);
    const covered = await page.locator('.reality-actions button, .night-dew').evaluateAll((elements) => elements.filter((element) => {
      const bounds = element.getBoundingClientRect(); return document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)?.closest('button') !== element;
    }).length);
    expect(covered).toBe(0);
  };
  await expect(page.locator('.dialogue-bubble')).toBeVisible(); await assertLayout();
  await page.screenshot({ path: `docs/screenshots/reality-dialogue-${testInfo.project.name}.png`, animations: 'disabled' });
  await page.setViewportSize({ width: 640, height: 360 }); await page.clock.fastForward(350); await expect(async () => assertLayout()).toPass({ timeout: 5000 });
  await page.screenshot({ path: `docs/screenshots/reality-narrow-${testInfo.project.name}.png`, animations: 'disabled' });
  expect(requests).toContain('/asserts/characters/reality/naxida.json'); expect(requests).toContain('/asserts/characters/reality/naxida.atlas'); expect(requests).toContain('/asserts/characters/reality/naxida.3807ce40.png');
  expect(requests).not.toContain('/asserts/characters/reality/nahida.json'); expect(requests).not.toContain('/asserts/characters/reality/naxida.png'); expect(errors).toEqual([]);
});

test('不支持 WebGL 时静态角色回退不阻断聊天', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...options: unknown[]) {
      if (kind.startsWith('webgl') || kind === 'experimental-webgl') return null;
      return Reflect.apply(original, this, [kind, ...options]);
    } as typeof original;
  });
  await enter(page); await debug(page); await page.getByLabel('调试切换到G阶段', { exact: true }).click(); await closeDebug(page);
  await expect(page.locator('.nahida-avatar')).toHaveAttribute('data-renderer', 'fallback'); await expect(page.locator('.character-static')).toBeVisible();
  await page.getByRole('button', { name: '和纳西妲聊天', exact: true }).click(); await expect(page.locator('.dialogue-bubble[data-speaker=nahida]')).toBeVisible();
  expect(errors).toEqual([]);
});
