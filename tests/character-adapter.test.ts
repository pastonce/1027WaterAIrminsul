import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHARACTER_LOADING_RULES, createSpineAdapter } from '../src/game/visits/CharacterAdapter';
import { CHARACTER_ASSETS } from '../src/data/assets';
import { readFileSync } from 'node:fs';
import { Downloader } from '@esotericsoftware/spine-core';

const spinePlayer = vi.hoisted(() => vi.fn());
vi.mock('spine-player-4-0', () => ({ SpinePlayer: spinePlayer }));

function fakePlayer() {
  return {
    canvas: new EventTarget(),
    animationState: { setAnimation: vi.fn(() => ({ animation: { duration: 6 }, trackTime: 0 })), addAnimation: vi.fn() },
    context: { gl: { getExtension: vi.fn(() => ({ loseContext: vi.fn() })) } },
    play: vi.fn(), pause: vi.fn(), setAnimation: vi.fn(), dispose: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => new Response(readFileSync(new URL(`../public${url}`, import.meta.url)))));
  spinePlayer.mockImplementation(function () { return fakePlayer(); });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('角色素材适配与生命周期', () => {
  it.each(['dream', 'reality'] as const)('%s 的真实文件、运行时、动画和图集页映射一致', (variant) => {
    const asset = CHARACTER_ASSETS[variant];
    const data = JSON.parse(readFileSync(new URL(`../public${asset.json}`, import.meta.url), 'utf8'));
    const atlas = readFileSync(new URL(`../public${asset.atlas}`, import.meta.url), 'utf8');
    expect(data.skeleton.spine.startsWith(`${asset.runtime}.`)).toBe(true);
    expect(data.skeleton.width).toBe(asset.bounds.width); expect(data.skeleton.height).toBe(asset.bounds.height);
    expect(data.animations).toHaveProperty(asset.animation);
    expect(atlas.trimStart().split(/\r?\n/)[0]).toBe(asset.atlasTexture.split('/').at(-1));
    expect(readFileSync(new URL(`../public${asset.texture}`, import.meta.url)).subarray(1, 4).toString()).toBe('PNG');
  });

  it.each(['dream', 'reality'] as const)('%s 只加载匹配的运行时，关闭播放器控件并使用透明背景', async (variant) => {
    const host = { replaceChildren: vi.fn() } as unknown as HTMLElement;
    const status = vi.fn(); const adapter = createSpineAdapter(host, variant, status, false);
    await vi.dynamicImportSettled();
    expect(spinePlayer).toHaveBeenCalledTimes(1);
    const config = spinePlayer.mock.calls[0][1]; const player = spinePlayer.mock.results[0].value;
    expect(config.jsonUrl).toBe(CHARACTER_ASSETS[variant].json); expect(config.showControls).toBe(false); expect(config.alpha).toBe(true);
    expect(config.rawDataURIs[CHARACTER_ASSETS[variant].atlasTexture]).toMatch(/^blob:/);
    expect(config.rawDataURIs[CHARACTER_ASSETS[variant].json]).toMatch(/^data:application\/json,/);
    expect(config.rawDataURIs[CHARACTER_ASSETS[variant].atlas]).toMatch(/^data:text\/plain,/);
    expect(config.premultipliedAlpha).toBe(false);
    config.success(player); expect(player.setAnimation).toHaveBeenCalledWith(CHARACTER_ASSETS[variant].animation, true); expect(status).toHaveBeenCalledWith('ready');
    adapter.dispose(); expect(player.dispose).toHaveBeenCalledTimes(1); expect(host.replaceChildren).toHaveBeenCalled();
  });

  it('浮现接入 in → loop，切换观察动作不重建播放器或打断已排的动画', async () => {
    const adapter = createSpineAdapter({ replaceChildren: vi.fn() } as unknown as HTMLElement, 'dream', vi.fn(), false);
    adapter.play('arrive'); await vi.dynamicImportSettled();
    const player = spinePlayer.mock.results[0].value; spinePlayer.mock.calls[0][1].success(player);
    expect(player.animationState.setAnimation).toHaveBeenCalledWith(0, 'in', false); expect(player.animationState.addAnimation).toHaveBeenCalledWith(0, 'loop', true, 0);
    expect(player.animationState.setAnimation.mock.results[0].value.trackTime).toBeCloseTo(5.35);
    adapter.play('observe'); adapter.play('leave'); expect(spinePlayer).toHaveBeenCalledTimes(1); expect(player.animationState.setAnimation).toHaveBeenCalledTimes(1); adapter.dispose();
  });

  it('加载前暂停和减少动态在首帧就生效，恢复不重新加载', async () => {
    const adapter = createSpineAdapter({ replaceChildren: vi.fn() } as unknown as HTMLElement, 'dream', vi.fn(), true);
    adapter.play('arrive'); adapter.setPaused(true); await vi.dynamicImportSettled();
    const player = spinePlayer.mock.results[0].value; spinePlayer.mock.calls[0][1].success(player);
    expect(player.pause).toHaveBeenCalled(); expect(player.play).not.toHaveBeenCalled(); expect(player.animationState.setAnimation).not.toHaveBeenCalled();
    adapter.setPaused(false); expect(player.play).not.toHaveBeenCalled(); expect(spinePlayer).toHaveBeenCalledTimes(1); adapter.dispose();
  });

  it('素材失败回退并释放图形资源，重复清理不会重复销毁', async () => {
    const status = vi.fn(); const adapter = createSpineAdapter({ replaceChildren: vi.fn() } as unknown as HTMLElement, 'reality', status, false);
    await vi.dynamicImportSettled(); const player = spinePlayer.mock.results[0].value;
    spinePlayer.mock.calls[0][1].error(player, 'missing-atlas'); await Promise.resolve();
    expect(status).toHaveBeenCalledWith('fallback'); expect(player.dispose).toHaveBeenCalledTimes(1); expect(player.context.gl.getExtension).toHaveBeenCalledWith('WEBGL_lose_context');
    adapter.dispose(); expect(player.dispose).toHaveBeenCalledTimes(1);
  });

  it('预载任一文件失败直接回退，不等待运行时的图集计数或抛出页面异常', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('offline'));
    const status = vi.fn(); const adapter = createSpineAdapter({ replaceChildren: vi.fn() } as unknown as HTMLElement, 'reality', status, false);
    await vi.dynamicImportSettled(); expect(status).toHaveBeenCalledWith('fallback'); expect(spinePlayer).not.toHaveBeenCalled(); adapter.dispose();
  });

  it('异步导入完成前离开场景，不会创建幽灵画布或回调', async () => {
    const status = vi.fn(); const adapter = createSpineAdapter({ replaceChildren: vi.fn() } as unknown as HTMLElement, 'dream', status, false);
    status.mockClear(); adapter.dispose(); await vi.dynamicImportSettled(); expect(spinePlayer).not.toHaveBeenCalled(); expect(status).not.toHaveBeenCalled();
  });

  it('已下载后的解码卡住会回退本姿态并有界重试，旧success不能重新占用画面', async () => {
    vi.useFakeTimers();
    const status = vi.fn(); const host = { replaceChildren: vi.fn() } as unknown as HTMLElement;
    const adapter = createSpineAdapter(host, 'reality', status, false);
    await vi.dynamicImportSettled(); const stale = spinePlayer.mock.calls[0][1]; const first = spinePlayer.mock.results[0].value;
    await vi.advanceTimersByTimeAsync(CHARACTER_LOADING_RULES.decodeTimeoutMs);
    expect(status).toHaveBeenLastCalledWith('fallback'); expect(first.dispose).toHaveBeenCalledTimes(1);
    stale.success(first); expect(status).toHaveBeenLastCalledWith('fallback');
    await vi.advanceTimersByTimeAsync(CHARACTER_LOADING_RULES.retryMs); await vi.dynamicImportSettled();
    expect(spinePlayer).toHaveBeenCalledTimes(2);
    const next = spinePlayer.mock.results[1].value; spinePlayer.mock.calls[1][1].success(next);
    expect(status).toHaveBeenLastCalledWith('ready'); expect(first.dispose).toHaveBeenCalledTimes(1);
    adapter.dispose(); expect(next.dispose).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
  });

  it('瞬时下载失败可恢复，最多三次；慢但仍下载中的响应不被解码看门狗提前取消', async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
      const bytes = readFileSync(new URL(`../public${url}`, import.meta.url)); let cursor = 0;
      return new Response(new ReadableStream({ async pull(controller) {
        if (cursor >= bytes.length) { controller.close(); return; }
        await new Promise((resolve) => setTimeout(resolve, 10000));
        const next = Math.min(bytes.length, cursor + Math.ceil(bytes.length / 4)); controller.enqueue(bytes.subarray(cursor, next)); cursor = next;
      } }));
    });
    const status = vi.fn(); const adapter = createSpineAdapter({ replaceChildren: vi.fn() } as unknown as HTMLElement, 'dream', status, false);
    await vi.advanceTimersByTimeAsync(CHARACTER_LOADING_RULES.decodeTimeoutMs + 5000);
    expect(spinePlayer).not.toHaveBeenCalled(); expect(status).not.toHaveBeenCalledWith('fallback');
    await vi.advanceTimersByTimeAsync(20000); await vi.dynamicImportSettled(); spinePlayer.mock.calls[0][1].success(spinePlayer.mock.results[0].value);
    expect(status).toHaveBeenLastCalledWith('ready'); adapter.dispose();

    spinePlayer.mockClear(); status.mockClear(); vi.mocked(fetch).mockRejectedValue(new Error('offline'));
    const failed = createSpineAdapter({ replaceChildren: vi.fn() } as unknown as HTMLElement, 'dream', status, false);
    await vi.dynamicImportSettled(); await vi.advanceTimersByTimeAsync(CHARACTER_LOADING_RULES.retryMs); await vi.dynamicImportSettled();
    await vi.advanceTimersByTimeAsync(CHARACTER_LOADING_RULES.retryMs * 2); await vi.dynamicImportSettled();
    expect(status.mock.calls.filter(([value]) => value === 'fallback')).toHaveLength(3);
    expect(spinePlayer).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0); failed.dispose();
  });

  it('手机WebGL上下文丢失后重建单个播放器，保留暂停状态并清理监听', async () => {
    vi.useFakeTimers();
    const status = vi.fn(); const adapter = createSpineAdapter({ replaceChildren: vi.fn() } as unknown as HTMLElement, 'dream', status, false);
    adapter.setPaused(true); await vi.dynamicImportSettled(); const first = spinePlayer.mock.results[0].value;
    spinePlayer.mock.calls[0][1].success(first); first.canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    await vi.advanceTimersByTimeAsync(CHARACTER_LOADING_RULES.retryMs); await vi.dynamicImportSettled();
    const next = spinePlayer.mock.results[1].value; spinePlayer.mock.calls[1][1].success(next);
    expect(status).toHaveBeenLastCalledWith('ready'); expect(next.pause).toHaveBeenCalled(); expect(next.play).not.toHaveBeenCalled(); expect(first.dispose).toHaveBeenCalledTimes(1);
    adapter.dispose(); first.canvas.dispatchEvent(new Event('webglcontextlost'));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('真实Spine4.0下载器按原始文本契约完整读取JSON和非ASCII atlas，保留#/%/中文', async () => {
    const adapter = createSpineAdapter({ replaceChildren: vi.fn() } as unknown as HTMLElement, 'dream', vi.fn(), false);
    await vi.dynamicImportSettled(); const config = spinePlayer.mock.calls[0][1];
    for (const [path, type] of [[CHARACTER_ASSETS.dream.json, 'application/json'], [CHARACTER_ASSETS.dream.atlas, 'text/plain']]) {
      const uri = config.rawDataURIs[path]; expect(uri).toMatch(new RegExp(`^data:${type},`));
      const text = readFileSync(new URL(`../public${path}`, import.meta.url), 'utf8');
      const downloader = new Downloader(); expect(downloader.dataUriToString(uri)).toBe(text);
      downloader.rawDataUris[path] = uri;
      const success = vi.fn(); const failure = vi.fn();
      if (type === 'application/json') { downloader.downloadJson(path, success, failure); expect(success).toHaveBeenCalledWith(JSON.parse(text)); }
      else { downloader.downloadText(path, success, failure); expect(success).toHaveBeenCalledWith(text); }
      expect(failure).not.toHaveBeenCalled();
    }
    const downloader = new Downloader(); const source = '{"note":"中文 #100% ?"}';
    downloader.rawDataUris['edge.json'] = `data:application/json,${source}`;
    const parsed = vi.fn(); downloader.downloadJson('edge.json', parsed, vi.fn()); expect(parsed).toHaveBeenCalledWith(JSON.parse(source));
    adapter.dispose();
  });
});
