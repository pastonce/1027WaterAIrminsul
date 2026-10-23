import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSpineAdapter } from '../src/game/visits/CharacterAdapter';
import { CHARACTER_ASSETS } from '../src/data/assets';
import { readFileSync } from 'node:fs';

const spinePlayer = vi.hoisted(() => vi.fn());
vi.mock('spine-player-4-0', () => ({ SpinePlayer: spinePlayer }));

function fakePlayer() {
  return {
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
afterEach(() => { vi.unstubAllGlobals(); });

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
    adapter.dispose(); await vi.dynamicImportSettled(); expect(spinePlayer).not.toHaveBeenCalled(); expect(status).not.toHaveBeenCalled();
  });
});
