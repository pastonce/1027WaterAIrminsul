import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { stageFixture } from '../src/dev/fixtures';
import type { GameSave, StageId } from '../src/types/game';
import { finishOpening } from './opening-support';
import { finishSceneEntrance } from './scene-support';
import { mockServerTime } from './time-support';
import { openSettings } from './settings-support';
import assets from '../src/data/sounds.generated.json' with { type: 'json' };

const OPEN = '2026-10-27T13:27:00+08:00';
const storageKey = (info: TestInfo) => info.project.name.startsWith('production') ? 'irminsul.player.v2' : 'irminsul.development.v2';
const requests = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const files: string[] = []; requests.set(page, files);
  page.on('request', (request) => { if (request.url().includes('/asserts/sfx/') && request.url().endsWith('.json')) files.push(new URL(request.url()).pathname); });
});

async function launch(page: Page, info: TestInfo, stage: StageId = 'A', patch: Partial<GameSave> = {}) {
  await mockServerTime(page, OPEN); const now = new Date(OPEN);
  await page.clock.install({ time: now }); await page.clock.pauseAt(new Date(now.getTime() + 1000));
  const save = { ...stageFixture(stage, now.getTime()), ...patch };
  await page.addInitScript(({ save, key, date }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(save));
    sessionStorage.setItem('irminsul.development.clock', JSON.stringify({ offset: Date.parse(date) - Date.now(), simulated: true }));
    Math.random = () => 0.99;
    const probe = { contexts: [] as AudioContext[], starts: [] as { duration: number; state: string }[], stops: 0, media: 0 };
    Reflect.set(window, '__soundProbe', probe);
    const NativeContext = window.AudioContext;
    class ObservedContext extends NativeContext {
      constructor(options?: AudioContextOptions) { super(options); probe.contexts.push(this); }
      createBufferSource() {
        const source = super.createBufferSource(); const start = source.start.bind(source); const stop = source.stop.bind(source);
        source.start = (...args: Parameters<AudioBufferSourceNode['start']>) => { probe.starts.push({ duration: source.buffer?.duration ?? 0, state: this.state }); start(...args); };
        source.stop = (...args: Parameters<AudioBufferSourceNode['stop']>) => { probe.stops++; stop(...args); };
        return source;
      }
    }
    Reflect.set(window, 'AudioContext', ObservedContext);
    const NativeAudio = window.Audio;
    Reflect.set(window, 'Audio', function (src?: string) { probe.media++; return new NativeAudio(src); });
  }, { save, key: storageKey(info), date: OPEN });
  await page.goto('/'); await finishOpening(page, true); await finishSceneEntrance(page, true);
  await expect.poll(async () => { await page.clock.runFor(50); return page.locator('.background-scenery').getAttribute('data-renderer'); }, { timeout: 20000 }).toMatch(/ready|static|fallback/);
}
function expectPreloaded(page: Page) { expect([...(requests.get(page) ?? [])].sort()).toEqual(Object.values(assets).map((asset) => asset.src).sort()); }
async function starts(page: Page) { return page.evaluate(() => (Reflect.get(window, '__soundProbe') as { starts: { duration: number; state: string }[] }).starts); }
async function played(page: Page, minimum: number) { await expect.poll(async () => (await starts(page)).length, { timeout: 15000 }).toBeGreaterThanOrEqual(minimum); }
async function setVolume(page: Page, percent: number) {
  await page.getByRole('slider', { name: '交互音效音量', exact: true }).evaluate((element, value) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, `${value}`);
    element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true }));
  }, percent);
}
async function saved(page: Page, info: TestInfo): Promise<GameSave> { return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), storageKey(info)); }

test('音效音量替换旧开关、独立保存与静音，启动只下载压缩包不解码，真实点击与音乐共用上下文', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await launch(page, info); expectPreloaded(page);
  expect(await page.evaluate(() => (Reflect.get(window, '__soundProbe') as { contexts: AudioContext[] }).contexts.length)).toBe(0);
  await openSettings(page);
  const slider = page.getByRole('slider', { name: '交互音效音量', exact: true }); await expect(slider).toHaveValue('60');
  await expect(page.getByRole('checkbox', { name: /轻柔的交互音效/ })).toHaveCount(0);
  await setVolume(page, 34); await expect(slider).toHaveValue('34');
  expect((await saved(page, info)).settings).toMatchObject({ sound: true, soundVolume: 0.34, music: true, musicVolume: 0.45 });
  await setVolume(page, 0); await expect(slider).toHaveValue('0');
  expect((await saved(page, info)).settings).toMatchObject({ sound: false, soundVolume: 0.34, music: true });
  await setVolume(page, 52); await expect(slider).toHaveValue('52');
  await page.clock.runFor(350); mkdirSync('artifacts/interaction-audio', { recursive: true });
  await page.screenshot({ path: `artifacts/interaction-audio/${info.project.name}-settings.png` });
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: '浇灌梦中的树', exact: true }).click(); await played(page, 1);
  expect((await starts(page))[0]).toMatchObject({ state: 'running' }); expect((await starts(page))[0].duration).toBeGreaterThan(1.5);
  expectPreloaded(page);
  expect(await page.evaluate(() => { const probe = Reflect.get(window, '__soundProbe') as { contexts: AudioContext[]; media: number }; return { contexts: probe.contexts.length, media: probe.media }; })).toEqual({ contexts: 1, media: 1 });
  await page.clock.runFor(600);
  for (let elapsed = 0; elapsed < 5000 && await page.locator('.dew-particle:not(.is-collected):not(.is-expiring)').count() === 0; elapsed += 100) await page.clock.runFor(100);
  const particle = page.locator('.dew-particle:not(.is-collected):not(.is-expiring)').first();
  await particle.dispatchEvent('pointerenter', { pointerType: 'mouse' }); await particle.dispatchEvent('click'); await played(page, 2);
  expectPreloaded(page); expect((await starts(page)).filter((entry) => entry.duration < 0.4)).toHaveLength(1);
  await page.reload(); await finishOpening(page, true); await finishSceneEntrance(page, true); await openSettings(page);
  await expect(page.getByRole('slider', { name: '交互音效音量', exact: true })).toHaveValue('52'); expect(errors).toEqual([]);
});

test('兰那罗出现及自然退场轻叶声、点击只响可爱跳跃声，暂停不补播', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  const fixture = stageFixture('F', Date.parse(OPEN)); await launch(page, info, 'F', { settings: { ...fixture.settings, music: false } });
  await page.mouse.click(20, 120); expectPreloaded(page);
  await page.clock.fastForward(44700); await expect(page.locator('.creature-roaming')).toHaveCount(1); await played(page, 1);
  expectPreloaded(page); expect((await starts(page))[0].duration).toBeGreaterThan(1);
  await openSettings(page); const count = (await starts(page)).length; await page.clock.fastForward(60000);
  expect((await starts(page)).length).toBe(count); await expect(page.locator('.creature-roaming')).toHaveCount(1);
  await page.getByRole('button', { name: '关闭', exact: true }).click(); await page.clock.fastForward(30000); await played(page, 2);
  await expect(page.locator('.creature-roaming')).toHaveAttribute('data-phase', 'leaving'); expectPreloaded(page);
  const fixed = page.locator('.creature-fixed[data-asset=aranara_08] .creature-hit'); await fixed.click(); await played(page, 3);
  await expect(fixed).toBeDisabled();
  await page.clock.fastForward(14700); await played(page, 4);
  await page.clock.runFor(1000); await expect(page.locator('.creature-roaming')).toHaveAttribute('data-phase', 'watching');
  const roaming = page.locator('.creature-roaming .creature-hit');
  const exposed = await roaming.evaluate((button) => {
    const bounds = button.getBoundingClientRect();
    for (const horizontal of [0.5, 0.2, 0.8, 0.05, 0.95]) for (const vertical of [0.5, 0.2, 0.8, 0.05, 0.95]) {
      const point = { x: bounds.width * horizontal, y: bounds.height * vertical };
      if (document.elementFromPoint(bounds.left + point.x, bounds.top + point.y) === button) return point;
    }
    return null;
  });
  expect(exposed).not.toBeNull(); await roaming.click({ position: exposed! }); await played(page, 5);
  await expect(page.locator('.creature-roaming')).toHaveAttribute('data-celebrated', 'true');
  expectPreloaded(page);
  await expect(fixed).toBeDisabled(); expect((await starts(page)).at(-1)!.duration).toBeLessThan(0.45); expect(errors).toEqual([]);
});

test('对白结束实际盖转场图时仅一次传送声，进度跳动与新景就绪不重复触发', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  const fixture = stageFixture('A', Date.parse(OPEN)); await launch(page, info, 'A', { growth: 210, settings: { ...fixture.settings, music: false } });
  expectPreloaded(page); await expect(page.locator('.stage-loading-screen')).toHaveCount(0);
  await page.getByRole('button', { name: '浇灌梦中的树', exact: true }).click(); await played(page, 1); expectPreloaded(page);
  for (let elapsed = 0; elapsed < 90000 && await page.locator('.stage-loading-screen').count() === 0; elapsed += 500) await page.clock.runFor(500);
  await expect(page.locator('.stage-loading-screen')).toBeVisible();
  await expect.poll(async () => (await starts(page)).filter((entry) => entry.duration > 3).length, { timeout: 15000 }).toBe(1);
  expect(requests.get(page)!.filter((file) => file === assets.transition.src)).toHaveLength(1);
  await page.clock.runFor(700); expect((await starts(page)).filter((entry) => entry.duration > 3)).toHaveLength(1); expect(errors).toEqual([]);
});
