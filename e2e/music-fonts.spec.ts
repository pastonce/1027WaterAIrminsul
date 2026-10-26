import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { stageFixture } from '../src/dev/fixtures';
import type { GameSave, StageId } from '../src/types/game';
import music from '../src/data/music.generated.json' with { type: 'json' };
import fonts from '../src/data/fonts.generated.json' with { type: 'json' };
import { finishOpening } from './opening-support';
import { finishSceneEntrance } from './scene-support';
import { mockServerTime } from './time-support';
import { openSettings } from './settings-support';

const OPEN = '2026-10-27T13:27:00+08:00';
const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => { const collected: string[] = []; errors.set(page, collected); page.on('pageerror', (error) => collected.push(error.message)); });
test.afterEach(({ page }) => expect(errors.get(page)).toEqual([]));
const key = (info: TestInfo) => info.project.name.startsWith('production') ? 'irminsul.player.v2' : 'irminsul.development.v2';
async function launch(page: Page, info: TestInfo, stage: StageId = 'A', patch: Partial<GameSave> = {}) {
  await mockServerTime(page, OPEN); const now = new Date(OPEN);
  await page.clock.install({ time: now }); await page.clock.pauseAt(new Date(now.getTime() + 1000));
  await page.addInitScript(({ save, storage, date }) => {
    localStorage.setItem('irminsul.notice.seen.v1', '1');
    if (!localStorage.getItem(storage)) localStorage.setItem(storage, JSON.stringify(save));
    sessionStorage.setItem('irminsul.development.clock', JSON.stringify({ offset: date - Date.now(), simulated: true }));
    const NativeAudio = window.Audio; const media: HTMLAudioElement[] = [];
    Reflect.set(window, '__musicMedia', media);
    Reflect.set(window, 'Audio', function (src?: string) { const audio = new NativeAudio(src); media.push(audio); return audio; });
    Math.random = () => 0.99;
  }, { save: { ...stageFixture(stage, now.getTime()), ...patch }, storage: key(info), date: now.getTime() });
  await page.goto('/'); await finishOpening(page, true); await finishSceneEntrance(page, true);
  await page.evaluate(() => document.fonts.load('14px Irminsul', '梦中的世界树纳西妲'));
}
async function playing(page: Page) {
  await expect.poll(() => page.locator('.music-button').getAttribute('data-playing'), { timeout: 15000 }).toBe('true');
  await expect.poll(() => page.evaluate(() => (Reflect.get(window, '__musicMedia') as HTMLAudioElement[])[0]?.readyState)).toBeGreaterThanOrEqual(2);
}
async function begin(page: Page) { await page.mouse.click(20, 120); await page.clock.runFor(100); await page.clock.fastForward(8000); await playing(page); }
async function picture(page: Page, info: TestInfo, name: string) {
  if (name.includes('settings')) {
    await page.clock.runFor(300);
    await expect(page.locator('.modal-backdrop')).toHaveCSS('opacity', '1');
  }
  mkdirSync('artifacts/music-fonts', { recursive: true }); await page.screenshot({ path: `artifacts/music-fonts/${info.project.name}-${name}.png` });
}

async function volume(page: Page, percent: number) {
  await page.getByRole('slider', { name: '背景音乐音量', exact: true }).evaluate((input, value) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, `${value}`);
    input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }));
  }, percent);
}

test('设置独立于场景立即可见、可操作，真实时钟截图无需结束动画', async ({ page }, info) => {
  await launch(page, info); await page.clock.resume(); await openSettings(page);
  const panel = page.getByRole('dialog', { name: '设置' });
  await expect(panel).toBeVisible(); expect(await panel.evaluate((element) => element.closest('[data-modal-portal]')?.parentElement === document.body)).toBe(true);
  await expect(page.locator('.game-content')).toHaveAttribute('inert', '');
  await expect(page.locator('.game-content')).toHaveAttribute('aria-hidden', 'true');
  await expect(panel).toHaveCSS('opacity', '1'); await expect(panel).toHaveCSS('animation-name', 'none');
  const slider = page.getByRole('slider', { name: '背景音乐音量', exact: true });
  expect(await slider.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2) === element;
  })).toBe(true);
  await page.locator('.opening-content').evaluate((element) => { (element as HTMLElement).style.clipPath = 'inset(45%)'; });
  expect(await slider.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2) === element;
  })).toBe(true);
  await volume(page, 61); await expect(slider).toHaveValue('61');
  await page.locator('.opening-content').evaluate((element) => { (element as HTMLElement).style.removeProperty('clip-path'); });
  mkdirSync('artifacts/ui-refinements', { recursive: true }); await page.screenshot({ path: `artifacts/ui-refinements/${info.project.name}-settings.png` });
  await page.keyboard.press('Tab'); expect(await panel.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape'); await expect(panel).toHaveCount(0);
  await expect(page.getByRole('button', { name: '设置', exact: true })).toBeFocused();
});

test('设置开启时转竖屏释放顶层模态，转回横屏恢复且关闭后可再次开启', async ({ page }, info) => {
  await launch(page, info); await openSettings(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('[data-modal-portal]')).toHaveCount(0);
  const rotate = page.getByRole('button', { name: /开启横屏体验/ });
  await expect(rotate).toBeVisible();
  expect(await rotate.evaluate((element) => {
    const bounds = element.getBoundingClientRect(); return element.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2));
  })).toBe(true);
  await page.setViewportSize(info.project.use.viewport!);
  await expect(page.getByRole('dialog', { name: '设置' })).toBeVisible();
  expect(await page.locator('[data-modal-portal]').evaluate((element) => element.parentElement === document.body)).toBe(true);
  await page.getByRole('button', { name: '关闭', exact: true }).click(); await openSettings(page);
  await expect(page.getByRole('slider', { name: '背景音乐音量', exact: true })).toBeVisible();
});

test('无顶层模态 API 时设置仍可打开、操作并用键盘关闭', async ({ page }, info) => {
  await page.addInitScript(() => { Reflect.set(HTMLDialogElement.prototype, 'showModal', undefined); });
  await launch(page, info); await openSettings(page);
  await expect(page.getByRole('dialog', { name: '设置' })).toBeVisible();
  await volume(page, 58); await expect(page.getByRole('slider', { name: '背景音乐音量', exact: true })).toHaveValue('58');
  await page.keyboard.press('Escape'); await expect(page.locator('[data-modal-portal]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '设置', exact: true })).toBeFocused();
});

test('设置在浇灌中直接响应，无手记入口，关闭后续播', async ({ page }, info) => {
  await launch(page, info); await page.getByRole('button', { name: '浇灌梦中的树', exact: true }).click(); await openSettings(page);
  await page.clock.fastForward(10000); await expect(page.getByRole('dialog', { name: '设置' })).toBeVisible();
  await expect(page.getByRole('button', { name: '梦境手记', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('对梦境说一句悄悄话')).toHaveCount(0); await page.clock.fastForward(5000);
  const heading = page.getByRole('heading', { name: '设置', exact: true }); await expect(heading).toHaveCSS('text-align', 'center');
  await expect(page.getByRole('dialog', { name: '设置' }).locator('.eyebrow')).toHaveCount(0);
  await picture(page, info, 'direct-settings'); await page.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(page.getByRole('button', { name: '设置', exact: true })).toBeFocused(); await page.clock.runFor(1400);
  await expect(page.getByRole('button', { name: '浇灌梦中的树', exact: true })).toBeEnabled();
  expect(await page.evaluate((storage) => JSON.parse(localStorage.getItem(storage)!).growth, key(info))).toBe(13);
});

test('音乐音量整合静音、保留上次音量并随存档恢复，原设置仍在', async ({ page }, info) => {
  await launch(page, info); await begin(page); await openSettings(page);
  await expect(page.getByRole('checkbox', { name: '背景音乐', exact: true })).toHaveCount(0);
  await volume(page, 73); await expect(page.getByRole('slider', { name: '背景音乐音量', exact: true })).toHaveValue('73');
  await volume(page, 0); await expect(page.getByRole('slider', { name: '背景音乐音量', exact: true })).toHaveAttribute('aria-valuetext', '静音');
  await page.getByRole('button', { name: '关闭', exact: true }).click(); await page.getByRole('button', { name: '播放背景音乐', exact: true }).click(); await playing(page);
  await openSettings(page); await expect(page.getByRole('slider', { name: '背景音乐音量', exact: true })).toHaveValue('73');
  await expect(page.getByRole('slider', { name: '交互音效音量', exact: true })).toBeVisible(); await expect(page.getByRole('checkbox', { name: /减少动态效果/ })).toBeVisible();
  await expect(page.getByRole('slider', { name: /文字播放间隔/ })).toBeVisible(); await page.reload(); await finishOpening(page, true); await openSettings(page);
  await expect(page.getByRole('slider', { name: '背景音乐音量', exact: true })).toHaveValue('73'); await picture(page, info, 'volume-settings');
});

test('留白、真实加载与缓冲均提示兰那罗练嗓，只有实际播放才旋转', async ({ page }, info) => {
  await page.addInitScript(() => { Object.defineProperty(window, 'caches', { configurable: true, value: undefined }); });
  await launch(page, info); const button = page.locator('.music-button');
  await page.mouse.click(20, 120); await page.clock.runFor(100);
  await expect(button).toHaveAttribute('title', '兰那罗们正在练嗓...');
  let release!: () => void; const requestGate = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/asserts/music/*.m4a', async (route) => { await requestGate; await route.continue(); });
  await button.click(); await page.clock.runFor(100); await expect(button).toHaveAttribute('data-music-phase', 'loading');
  await expect(button).toHaveAttribute('title', '兰那罗们正在练嗓...'); await expect(button).toHaveAttribute('aria-description', '兰那罗们正在练嗓...'); await expect(button).toHaveAttribute('aria-busy', 'true');
  await expect(button.locator('img')).toHaveCSS('animation-play-state', 'paused'); release(); await playing(page);
  await page.evaluate(() => (Reflect.get(window, '__musicMedia') as HTMLAudioElement[])[0].dispatchEvent(new Event('waiting')));
  await expect(button).toHaveAttribute('title', '兰那罗们正在练嗓...'); await expect(button).toHaveAttribute('data-playing', 'false');
  await page.evaluate(() => (Reflect.get(window, '__musicMedia') as HTMLAudioElement[])[0].dispatchEvent(new Event('playing')));
  await expect(button).toHaveAttribute('title', '暂停背景音乐'); await expect(button).toHaveAttribute('aria-busy', 'false');
});

test('开场仅预载当前音乐，主动播放立即复用压缩缓存，暂停静止且偏好可恢复', async ({ page }, info) => {
  const requests: string[] = []; page.on('request', (request) => { if (request.url().includes('/asserts/music/')) requests.push(request.url()); });
  await launch(page, info); await page.clock.fastForward(30000);
  expect(requests).toHaveLength(1); expect(requests.every((url) => url.endsWith(music.tracks.A.src))).toBe(true);
  expect(await page.evaluate(() => (Reflect.get(window, '__musicMedia') as HTMLAudioElement[]).length)).toBe(0);
  await page.getByRole('button', { name: '播放背景音乐', exact: true }).click(); await page.clock.runFor(100); await playing(page);
  expect(requests).toHaveLength(1);
  expect(await page.evaluate(() => (Reflect.get(window, '__musicMedia') as HTMLAudioElement[])[0].currentSrc)).toMatch(/^blob:/);
  const button = page.locator('.music-button'); await expect(button.locator('img')).toHaveCSS('animation-play-state', 'running');
  await expect(button.locator('feFuncA')).toHaveAttribute('slope', '18'); expect((await button.locator('img').boundingBox())!.width).toBeGreaterThanOrEqual(25);
  await picture(page, info, 'playing');
  await page.evaluate(() => { (Reflect.get(window, '__musicMedia') as HTMLAudioElement[])[0].currentTime = 25; });
  await button.click(); await page.clock.runFor(350); await expect(button).toHaveAttribute('data-playing', 'false');
  await expect(button.locator('img')).toHaveCSS('animation-play-state', 'paused');
  expect(await page.evaluate(() => (Reflect.get(window, '__musicMedia') as HTMLAudioElement[])[0].paused)).toBe(true);
  await page.reload(); await finishOpening(page, true); await page.mouse.click(20, 120); await page.clock.fastForward(20000);
  expect(await page.evaluate((storage) => JSON.parse(localStorage.getItem(storage)!).settings.music, key(info))).toBe(false);
  await expect(page.getByRole('button', { name: '播放背景音乐', exact: true })).toBeVisible();
});

test('真实音频曲尾后留白十二秒再单曲循环，设置不打断播放', async ({ page }, info) => {
  await launch(page, info); await begin(page);
  await page.evaluate(() => { const media = (Reflect.get(window, '__musicMedia') as HTMLAudioElement[])[0]; media.currentTime = media.duration - 0.25; });
  await expect.poll(() => page.evaluate(() => { const media = (Reflect.get(window, '__musicMedia') as HTMLAudioElement[])[0]; return media.paused && media.currentTime === 0; })).toBe(true);
  await page.clock.fastForward(11900); await expect(page.locator('.music-button')).toHaveAttribute('data-playing', 'false');
  await page.clock.fastForward(200); await playing(page);
  await page.evaluate(() => { (Reflect.get(window, '__musicMedia') as HTMLAudioElement[])[0].currentTime = 30; });
  await openSettings(page); await page.clock.runFor(350);
  expect(await page.evaluate(() => (Reflect.get(window, '__musicMedia') as HTMLAudioElement[])[0].paused)).toBe(false);
  await page.clock.fastForward(30000); const position = await page.evaluate(() => (Reflect.get(window, '__musicMedia') as HTMLAudioElement[])[0].currentTime);
  expect(position).toBeLessThan(32); await page.getByRole('button', { name: '关闭', exact: true }).click(); await playing(page);
  await expect(page.getByRole('button', { name: '设置', exact: true })).toBeFocused();
});

test('G沿用留白与单曲播放，仅请求生日曲目，设置中音乐继续', async ({ page }, info) => {
  const requests: string[] = []; page.on('request', (request) => { if (request.url().includes('/asserts/music/')) requests.push(request.url()); });
  await launch(page, info, 'G'); await page.mouse.click(20, 120); await page.clock.runFor(100); await page.clock.runFor(7700);
  expect(requests).toHaveLength(1); await expect(page.locator('.music-button')).toHaveAttribute('data-playing', 'false'); await page.clock.runFor(300); await playing(page);
  expect(requests.length).toBeGreaterThan(0); expect(requests.every((url) => url.endsWith(music.tracks.G.src))).toBe(true);
  await openSettings(page); await page.clock.runFor(350); await expect(page.locator('.music-button img')).toHaveCSS('animation-play-state', 'running');
  await page.keyboard.press('Escape'); await playing(page); await picture(page, info, 'g-music');
});

test('设置、公告与读信保持同一音频连续播放，不触发暂停或重复创建播放器', async ({ page }, info) => {
  await launch(page, info, 'G'); await begin(page);
  const initial = await page.evaluate(() => {
    const audio = (Reflect.get(window, '__musicMedia') as HTMLAudioElement[])[0];
    Reflect.set(window, '__panelPauseCount', 0);
    audio.addEventListener('pause', () => Reflect.set(window, '__panelPauseCount', Number(Reflect.get(window, '__panelPauseCount')) + 1));
    return { source: audio.currentSrc, position: audio.currentTime };
  });
  for (const name of ['设置', '公告与声明']) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible(); await page.clock.runFor(1000);
    await expect(page.locator('.music-button')).toHaveAttribute('data-playing', 'true');
    await page.waitForTimeout(250);
    const current = await page.evaluate(() => {
      const list = Reflect.get(window, '__musicMedia') as HTMLAudioElement[]; const audio = list[0];
      return { source: audio.currentSrc, position: audio.currentTime, paused: audio.paused, count: list.length, pauses: Reflect.get(window, '__panelPauseCount') };
    });
    expect(current.source).toBe(initial.source); expect(current.position).toBeGreaterThan(initial.position);
    expect(current.paused).toBe(false); expect(current.count).toBe(1); expect(current.pauses).toBe(0);
    await page.keyboard.press('Escape');
  }
  await page.getByRole('button', { name: '展开 2023 年生日来信', exact: true }).click();
  await page.clock.runFor(1000); await expect(page.getByTestId('birthday-mail')).toHaveAttribute('data-phase', 'reading');
  await expect(page.locator('.music-button')).toHaveAttribute('data-playing', 'true');
  expect(await page.evaluate(() => {
    const list = Reflect.get(window, '__musicMedia') as HTMLAudioElement[];
    return { paused: list[0].paused, source: list[0].currentSrc, count: list.length, pauses: Reflect.get(window, '__panelPauseCount') };
  })).toEqual({ paused: false, source: initial.source, count: 1, pauses: 0 });
  await page.keyboard.press('Escape'); await page.clock.runFor(1500); await expect(page.getByTestId('birthday-mail')).toHaveCount(0);
});

test('全部文字使用新字体，常用包独立加载，扩展字按需加载且设置仍可访问', async ({ page }, info) => {
  const requests: string[] = []; page.on('request', (request) => { if (request.url().includes('/asserts/fonts/')) requests.push(request.url()); });
  await launch(page, info); await expect.poll(() => requests.some((url) => url.endsWith(fonts.common))).toBe(true);
  expect(requests.some((url) => url.endsWith(fonts.extended))).toBe(false);
  const invalid = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.game-app *')].filter((element) => {
    const style = getComputedStyle(element);
    return [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && !!node.textContent?.trim()) && style.visibility !== 'hidden' && element.getBoundingClientRect().width > 0 && !style.fontFamily.includes('Irminsul');
  }).map((element) => element.className)); expect(invalid).toEqual([]);
  await page.evaluate(() => document.fonts.load('14px Irminsul', '龘')); await expect.poll(() => requests.some((url) => url.endsWith(fonts.extended))).toBe(true);
  await openSettings(page); await expect(page.getByRole('dialog', { name: '设置' })).toBeVisible();
  await expect(page.getByLabel('背景音乐音量', { exact: true })).toHaveValue('45'); await picture(page, info, 'settings');
});

test('音乐失败不阻断交互且可重试，减少动态时按钮不旋转', async ({ page }, info) => {
  await page.route('**/asserts/music/*.m4a', (route) => route.abort('failed'));
  await launch(page, info); await page.mouse.click(20, 120); await page.clock.runFor(100); await page.clock.fastForward(8100);
  await expect(page.getByRole('button', { name: '重试背景音乐' })).toBeVisible();
  await expect(page.getByRole('button', { name: '浇灌梦中的树' })).toBeEnabled();
  await page.mouse.click(20, 120); await page.clock.fastForward(20000); await expect(page.getByRole('button', { name: '重试背景音乐' })).toBeVisible();
  await page.unroute('**/asserts/music/*.m4a'); await page.getByRole('button', { name: '重试背景音乐' }).click(); await page.clock.fastForward(8100); await playing(page);
  await page.emulateMedia({ reducedMotion: 'reduce' }); await expect(page.locator('.music-button img')).toHaveCSS('animation-play-state', 'paused');
});

test('六阶段分别加载各自曲目，换景留白，始终复用同一播放器', async ({ page }, info) => {
  test.skip(info.project.name.startsWith('production'), '生产版本无跳景调试入口'); test.setTimeout(120000);
  await launch(page, info); await begin(page);
  for (const stage of ['B', 'C', 'D', 'E', 'F'] as const) {
    await page.locator('.debug-panel > summary').click(); await page.locator('.debug-stages').getByRole('button', { name: `调试切换到${stage}阶段`, exact: true }).click();
    await page.locator('.debug-panel > summary').click(); await page.clock.fastForward(1200);
    await expect(page.locator('.music-button')).toHaveAttribute('data-playing', 'false');
    await page.clock.fastForward(8100); await playing(page);
    expect(await page.evaluate(() => (Reflect.get(window, '__musicMedia') as HTMLAudioElement[])[0].currentSrc)).toContain(music.tracks[stage].src);
    await picture(page, info, `music-${stage.toLowerCase()}`);
  }
  expect(await page.evaluate(() => (Reflect.get(window, '__musicMedia') as HTMLAudioElement[]).length)).toBe(1);
  await picture(page, info, 'festival');
});
