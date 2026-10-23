import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { startupPlan } from '../src/game/assets/startupPlan';
import type { StartupPlan } from '../src/game/assets/startupPlan';
import { StartupLoader, STARTUP_RULES } from '../src/game/assets/StartupLoader';
import type { StartupProgress } from '../src/game/assets/StartupLoader';
import { completeLoadingArtChoices, getLoadingArt, loadingArtSource } from '../src/data/stageLoading';
import { FONT_ASSETS, MUSIC_ASSETS } from '../src/data/assets';
import manifest from '../docs/startup-assets.manifest.json' with { type: 'json' };
import catalog from '../src/data/startupAssets.generated.json' with { type: 'json' };
import { testGame } from './support';
import { SaveManager } from '../src/game/save/SaveManager';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const choices = completeLoadingArtChoices({}, () => .99);
const simple: StartupPlan = { id: 'unit', dynamic: false, bytes: 12, files: [1, 2, 3, 4].map((id) => ({ url: `/file-${id}.png`, bytes: 3 })) };

describe('开场集中预载计划', () => {
  it.each([{ width: 1440, height: 900 }, { width: 844, height: 390 }])('$width×$height 仅选一种转场规格、排除BGM和罕用字、不创建所有场景', ({ width, height }) => {
    const plan = startupPlan(choices, width, height, 1, false);
    const urls = plan.files.map((file) => file.url);
    expect(new Set(urls).size).toBe(urls.length); expect(plan.bytes).toBeLessThan(80 * 1024 * 1024);
    expect(urls.filter((url) => url.includes('/loading/art/'))).toHaveLength(6);
    for (const stage of ['B', 'C', 'D', 'E', 'F', 'G'] as const) expect(urls).toContain(loadingArtSource(getLoadingArt(stage, choices[stage])!, width, height, 1));
    expect(urls).toContain(FONT_ASSETS.common); expect(urls).not.toContain(FONT_ASSETS.extended);
    for (const asset of Object.values(MUSIC_ASSETS.tracks)) expect(urls).not.toContain(asset.src);
    expect(urls.some((url) => url.includes('/effects/e-skill-frame'))).toBe(true);
    expect(urls.some((url) => url.includes('/sfx/'))).toBe(true);
    expect(plan.bytes).toBe(plan.files.reduce((sum, file) => sum + statSync(`public${file.url}`).size, 0));
  });
  it('减少动态预载真实静态姿态与分带，跳过背景和生物动画，保留角色冻结首帧所需素材', () => {
    const plan = startupPlan(choices, 844, 390, 1, true);
    expect(plan.dynamic).toBe(false); expect(plan.bytes).toBeLessThan(startupPlan(choices, 844, 390, 1, false).bytes / 2);
    expect(plan.files.some((file) => /\.(atlas|json)$/.test(file.url) && file.url.includes('/backgrounds/'))).toBe(false);
    expect(plan.characterRuntime).toBe(true);
    expect(plan.files.some((file) => file.url.includes('/hiding-band-'))).toBe(true);
  });
  it('预选立即保存且刷新不重抽，版本目录逐文件哈希与字节数匹配', () => {
    const { game, storage } = testGame(); game.prepareOpeningAssets();
    const selected = game.getSnapshot().save.loadingArtChoices; expect(Object.keys(selected)).toHaveLength(6);
    expect(new SaveManager(storage).load().loadingArtChoices).toEqual(selected);
    game.prepareOpeningAssets(); expect(game.getSnapshot().save.loadingArtChoices).toEqual(selected);
    expect(catalog.revision).toBe(manifest.revision);
    for (const file of manifest.files) {
      const content = readFileSync(`public${file.url}`);
      expect(content.length).toBe(file.bytes); expect(createHash('sha256').update(content).digest('hex')).toBe(file.sha256);
    }
  });
});

describe('下载并发、真实字节与有界放行', () => {
  it('三路下载，进度单调按字节推进，结束后不保留所有解码图像', async () => {
    let active = 0; let maximum = 0;
    const download = vi.fn(async () => {
      active++; maximum = Math.max(maximum, active); await Promise.resolve(); active--;
      return new Response(new Uint8Array([1, 2, 3]));
    });
    const updates: StartupProgress[] = [];
    const loader = new StartupLoader(download, async () => null, async () => {});
    await loader.load(simple, (state) => updates.push(state));
    expect(maximum).toBe(3); expect(download).toHaveBeenCalledTimes(4);
    expect(updates.at(-1)).toEqual({ progress: 1, completed: 4, total: 4, failed: 0, done: true });
    expect(updates.map((state) => state.progress)).toEqual([...updates.map((state) => state.progress)].sort((first, second) => first - second));
  });
  it('压缩文件已在本版本磁盘缓存时不再次请求，仅预热模块、不创建播放器', async () => {
    const download = vi.fn(); const warm = vi.fn(async () => {});
    const cache = { match: vi.fn(async () => new Response('cached')) } as unknown as Cache;
    const updates: StartupProgress[] = [];
    await new StartupLoader(download, async () => cache, warm).load({ ...simple, dynamic: true }, (state) => updates.push(state));
    expect(download).not.toHaveBeenCalled(); expect(warm).toHaveBeenCalledTimes(1); expect(updates.at(-1)?.failed).toBe(0);
  });
  it('失败、204和空响应不进入缓存且不阻断揭幕', async () => {
    const download = vi.fn().mockResolvedValueOnce(new Response(null, { status: 204 })).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(new Response('')).mockResolvedValueOnce(new Response('abc'));
    const updates: StartupProgress[] = [];
    const put = vi.fn(async () => {});
    const cache = { match: async () => undefined, put } as unknown as Cache;
    await new StartupLoader(download, async () => cache).load(simple, (state) => updates.push(state));
    expect(updates.at(-1)).toMatchObject({ progress: 1, failed: 3, done: true });
    expect(put).toHaveBeenCalledTimes(1);
  });
  it('全局一分钟上限覆盖不响应的请求与模块，不会永远锁住首屏', async () => {
    vi.useFakeTimers(); const download = vi.fn(() => new Promise<Response>(() => {})); const updates: StartupProgress[] = [];
    const pending = new StartupLoader(download, async () => null, () => new Promise<void>(() => {})).load({ ...simple, dynamic: true }, (state) => updates.push(state));
    await vi.advanceTimersByTimeAsync(STARTUP_RULES.totalTimeoutMs); await pending;
    expect(updates.at(-1)).toMatchObject({ failed: 4, progress: 1, done: true }); expect(vi.getTimerCount()).toBe(0);
  });
  it('逐文件十秒超时失败后继续，卸载后没有进度回调', async () => {
    vi.useFakeTimers(); const updates: StartupProgress[] = [];
    const download = vi.fn((_url: RequestInfo | URL, options?: RequestInit) => new Promise<Response>((_resolve, reject) => options?.signal?.addEventListener('abort', () => reject(new Error('aborted')))));
    const loader = new StartupLoader(download, async () => null);
    const pending = loader.load(simple, (state) => updates.push(state));
    await vi.advanceTimersByTimeAsync(STARTUP_RULES.fileTimeoutMs * 2 + 1); await pending;
    expect(updates.at(-1)?.failed).toBe(4);
    const next = new StartupLoader(download, async () => null);
    const stopped = next.load(simple, (state) => updates.push(state));
    await Promise.resolve(); const count = updates.length; next.cancel();
    await vi.advanceTimersByTimeAsync(STARTUP_RULES.totalTimeoutMs); await stopped;
    expect(updates).toHaveLength(count);
  });
});

describe('版本缓存与浏览器兼容', () => {
  it('已缓存素材直接读取，兼容没有 throwIfAborted 的信号，API永不经过素材缓存', async () => {
    vi.resetModules(); const match = vi.fn(async () => new Response('cached'));
    vi.stubGlobal('caches', { open: vi.fn(async () => ({ match })) });
    const download = vi.fn(async () => new Response('network')); vi.stubGlobal('fetch', download);
    const { fetchAsset } = await import('../src/game/assets/cache');
    const controller = new AbortController(); Object.defineProperty(controller.signal, 'throwIfAborted', { value: undefined });
    expect(await (await fetchAsset(FONT_ASSETS.common, { signal: controller.signal })).text()).toBe('cached');
    await fetchAsset('/api/time?requestId=cache-test'); expect(match).toHaveBeenCalledTimes(1); expect(download).toHaveBeenCalledTimes(1);
    controller.abort(); await expect(fetchAsset(FONT_ASSETS.common, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('隐私模式同步拒绝CacheStorage时回退HTTP，不抛页面异常', async () => {
    vi.resetModules(); vi.stubGlobal('caches', { open: () => { throw new Error('denied'); } });
    const download = vi.fn(async () => new Response('http')); vi.stubGlobal('fetch', download);
    const { fetchAsset } = await import('../src/game/assets/cache');
    expect(await (await fetchAsset(FONT_ASSETS.common)).text()).toBe('http'); expect(download).toHaveBeenCalledTimes(1);
  });
  it('只清理自有旧版本，保留当前、最近上一版和其他缓存', async () => {
    vi.resetModules(); const remove = vi.fn(async () => true);
    const { pruneAssetCaches, ASSET_CACHE_NAME } = await import('../src/game/assets/cache');
    vi.stubGlobal('caches', { keys: async () => ['other-cache', 'irminsul-assets-0000000000000000', 'irminsul-assets-1111111111111111', ASSET_CACHE_NAME], delete: remove });
    await pruneAssetCaches(); expect(remove.mock.calls).toEqual([['irminsul-assets-0000000000000000']]);
  });
});
