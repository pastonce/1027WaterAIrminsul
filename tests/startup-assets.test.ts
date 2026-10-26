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
  it.each(['A', 'C', 'F', 'G'] as const)('仅将当前%s曲目优先加入真实下载进度，其他六首不预载', (stage) => {
    const plan = startupPlan(choices, 1440, 900, 1, false, stage);
    const music = plan.files.filter((file) => file.url.endsWith('.m4a'));
    expect(music).toEqual([{ url: MUSIC_ASSETS.tracks[stage].src, bytes: catalog.files[MUSIC_ASSETS.tracks[stage].src as keyof typeof catalog.files] }]);
    expect(plan.files[0]).toEqual(music[0]);
  });
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
  it('预选立即保存且同页重复准备不重抽，版本目录逐文件哈希与字节数匹配', () => {
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

describe('下载并发、真实成功门控与重试', () => {
  it('三路下载，进度单调按字节推进，结束后不保留所有解码图像', async () => {
    expect(STARTUP_RULES.concurrency).toBe(3);
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
    const cache = { match: vi.fn(async () => new Response('abc')) } as unknown as Cache;
    const updates: StartupProgress[] = [];
    await new StartupLoader(download, async () => cache, warm).load({ ...simple, dynamic: true }, (state) => updates.push(state));
    expect(download).not.toHaveBeenCalled(); expect(warm).toHaveBeenCalledTimes(1); expect(updates.at(-1)?.failed).toBe(0);
  });
  it('失败、204和空响应重试后仍失败就停在加载页，不伪造100%', async () => {
    vi.useFakeTimers();
    const download = vi.fn(async (url: RequestInfo | URL) => {
      if (url === '/file-1.png') return new Response('abc');
      if (url === '/file-2.png') throw new Error('offline');
      return url === '/file-3.png' ? new Response('') : new Response(null, { status: 204 });
    });
    const updates: StartupProgress[] = [];
    const put = vi.fn(async () => {});
    const cache = { match: async () => undefined, put } as unknown as Cache;
    const pending = new StartupLoader(download, async () => cache).load(simple, (state) => updates.push(state));
    await vi.runAllTimersAsync(); await pending;
    expect(updates.at(-1)).toMatchObject({ completed: 1, failed: 3, done: false, blocked: true });
    expect(updates.at(-1)!.progress).toBeLessThan(1);
    expect(put).toHaveBeenCalledTimes(1);
    expect(download).toHaveBeenCalledTimes(10);
  });
  it('不响应的请求与模块最终提供重试，不会当作资源准备成功', async () => {
    vi.useFakeTimers(); const download = vi.fn(() => new Promise<Response>(() => {})); const updates: StartupProgress[] = [];
    const pending = new StartupLoader(download, async () => null, () => new Promise<void>(() => {})).load({ ...simple, dynamic: true }, (state) => updates.push(state));
    await vi.runAllTimersAsync(); await pending;
    expect(updates.at(-1)).toMatchObject({ failed: 5, completed: 0, done: false, blocked: true }); expect(vi.getTimerCount()).toBe(0);
  });
  it('逐文件无进展三十秒后重试，卸载后没有进度回调或遗留时钟', async () => {
    vi.useFakeTimers(); const updates: StartupProgress[] = [];
    const download = vi.fn((_url: RequestInfo | URL, options?: RequestInit) => new Promise<Response>((_resolve, reject) => options?.signal?.addEventListener('abort', () => reject(new Error('aborted')))));
    const loader = new StartupLoader(download, async () => null);
    const pending = loader.load(simple, (state) => updates.push(state));
    await vi.runAllTimersAsync(); await pending;
    expect(updates.at(-1)?.failed).toBe(4);
    const next = new StartupLoader(download, async () => null);
    const stopped = next.load(simple, (state) => updates.push(state));
    await Promise.resolve(); const count = updates.length; next.cancel();
    await vi.runAllTimersAsync(); await stopped;
    expect(updates).toHaveLength(count); expect(vi.getTimerCount()).toBe(0);
  });

  it('持续有真实字节进展的慢下载超过一分钟仍等待完整资源', async () => {
    vi.useFakeTimers(); const updates: StartupProgress[] = [];
    const download = vi.fn(async () => new Response(new ReadableStream({ start(controller) {
      for (let index = 1; index <= 4; index++) setTimeout(() => { controller.enqueue(new Uint8Array([index])); if (index === 4) controller.close(); }, index * 20000);
    } })));
    const pending = new StartupLoader(download, async () => null).load({ ...simple, bytes: 4, files: [{ url: '/slow', bytes: 4 }] }, (state) => updates.push(state));
    await vi.advanceTimersByTimeAsync(60001);
    expect(updates.at(-1)).toMatchObject({ done: false, completed: 0, failed: 0 });
    expect(updates.at(-1)!.progress).toBe(.75);
    await vi.advanceTimersByTimeAsync(20000); await pending;
    expect(updates.at(-1)).toMatchObject({ done: true, completed: 1, failed: 0, progress: 1 });
    expect(download).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
  });

  it('截断200和旧缓存截断响应不被信任，重新下载完整字节才计成功', async () => {
    vi.useFakeTimers(); const updates: StartupProgress[] = [];
    const remove = vi.fn(async () => true); const put = vi.fn<Cache['put']>(async () => {});
    const cache = { match: async () => new Response('a'), delete: remove, put } as unknown as Cache;
    const download = vi.fn().mockResolvedValueOnce(new Response('ab')).mockResolvedValueOnce(new Response('abc', { headers: { 'Content-Encoding': 'gzip' } }));
    const pending = new StartupLoader(download, async () => cache).load({ ...simple, bytes: 3, files: [simple.files[0]] }, (state) => updates.push(state));
    await vi.runAllTimersAsync(); await pending;
    expect(remove).toHaveBeenCalledWith('/file-1.png'); expect(download).toHaveBeenCalledTimes(2);
    expect(updates.at(-1)).toMatchObject({ done: true, completed: 1, failed: 0 });
    const stored = put.mock.calls[0][1] as Response;
    expect(stored.headers.get('Content-Encoding')).toBeNull(); expect(stored.headers.get('Content-Length')).toBe('3');
    expect(await stored.text()).toBe('abc');
  });

  it.each(['open', 'match', 'put'] as const)('CacheStorage %s悬挂不阻塞完整HTTP下载', async (mode) => {
    vi.useFakeTimers(); const updates: StartupProgress[] = [];
    const never = () => new Promise<never>(() => {});
    const cache = { match: mode === 'match' ? never : async () => undefined, put: mode === 'put' ? never : async () => {} } as unknown as Cache;
    const download = vi.fn(async () => new Response('abc'));
    const pending = new StartupLoader(download, mode === 'open' ? never : async () => cache).load(simple, (state) => updates.push(state));
    await vi.runAllTimersAsync(); await pending;
    expect(updates.at(-1)).toMatchObject({ done: true, completed: 4, failed: 0 }); expect(download).toHaveBeenCalledTimes(4);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('版本缓存与浏览器兼容', () => {
  it('已缓存素材直接读取，兼容没有 throwIfAborted 的信号，API永不经过素材缓存', async () => {
    vi.resetModules(); const match = vi.fn(async () => new Response('cached', { headers: { 'X-Irminsul-Bytes': String(catalog.files[FONT_ASSETS.common as keyof typeof catalog.files]) } }));
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
  it('运行时CacheStorage匹配悬挂在800ms后回退网络，且取消仍生效', async () => {
    vi.useFakeTimers(); vi.resetModules();
    vi.stubGlobal('caches', { open: async () => ({ match: () => new Promise(() => {}) }) });
    const download = vi.fn(async () => new Response('network')); vi.stubGlobal('fetch', download);
    const { fetchAsset } = await import('../src/game/assets/cache');
    const pending = fetchAsset(FONT_ASSETS.common);
    await vi.advanceTimersByTimeAsync(801); expect(await (await pending).text()).toBe('network');
    const controller = new AbortController(); controller.abort();
    await expect(fetchAsset(FONT_ASSETS.common, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(download).toHaveBeenCalledTimes(1);
  });
  it('只清理自有旧版本，保留当前、最近上一版和其他缓存', async () => {
    vi.resetModules(); const remove = vi.fn(async () => true);
    const { pruneAssetCaches, ASSET_CACHE_NAME } = await import('../src/game/assets/cache');
    vi.stubGlobal('caches', { keys: async () => ['other-cache', 'irminsul-assets-0000000000000000', 'irminsul-assets-1111111111111111', ASSET_CACHE_NAME], delete: remove });
    await pruneAssetCaches(); expect(remove.mock.calls).toEqual([['irminsul-assets-0000000000000000']]);
  });
});
