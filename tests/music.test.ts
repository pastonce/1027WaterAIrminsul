import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MUSIC_RULES, MusicManager } from '../src/game/audio/MusicManager';
import assets from '../src/data/music.generated.json';
import manifest from '../docs/music-assets.manifest.json';
import fontManifest from '../docs/font-assets.manifest.json';
import { createSave, validateSave } from '../src/game/save/SaveManager';
import { testGame } from './support';

class FakeAudio {
  src = ''; currentTime = 0; duration = 100; volume = 1; paused = true; preload = ''; loop = false;
  onplaying: (() => void) | null = null; onpause: (() => void) | null = null; onwaiting: (() => void) | null = null;
  ontimeupdate: (() => void) | null = null; onended: (() => void) | null = null; onerror: (() => void) | null = null;
  play = vi.fn(async () => { this.paused = false; this.onplaying?.(); });
  pause = vi.fn(() => { this.paused = true; this.onpause?.(); });
  load = vi.fn(); setAttribute = vi.fn();
  removeAttribute = vi.fn(() => { this.src = ''; });
}
const managers: MusicManager[] = [];
const options = { stage: 'A' as const, enabled: true, paused: false };
async function setup() {
  const media = new FakeAudio(); const factory = vi.fn(() => media as unknown as HTMLAudioElement);
  const manager = new MusicManager(() => null, factory); managers.push(manager); manager.configure(options);
  await manager.unlock(); media.play.mockClear(); return { media, manager, factory };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => { managers.splice(0).forEach((manager) => manager.dispose()); expect(vi.getTimerCount()).toBe(0); vi.useRealTimers(); });

describe('单播放器、留白与渐变', () => {
  it('F→G 同一播放器延续八秒留白，读信暂停剩余时间，G 曲终留白十二秒', async () => {
    const { media, manager, factory } = await setup(); await vi.advanceTimersByTimeAsync(10000);
    manager.configure({ ...options, stage: 'G', paused: true }); await vi.advanceTimersByTimeAsync(30000);
    expect(media.src).toBe(''); expect(manager.getSnapshot().playing).toBe(false);
    manager.configure({ ...options, stage: 'G' }); await vi.advanceTimersByTimeAsync(3000);
    manager.configure({ ...options, stage: 'G', paused: true }); await vi.advanceTimersByTimeAsync(60000);
    manager.configure({ ...options, stage: 'G' }); await vi.advanceTimersByTimeAsync(4999); expect(media.src).toBe('');
    await vi.advanceTimersByTimeAsync(1); expect(media.src).toBe(assets.tracks.G.src); expect(factory).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1800); expect(media.volume).toBeCloseTo(.45);
    media.paused = true; media.onended?.(); await vi.advanceTimersByTimeAsync(11999); expect(media.paused).toBe(true);
    await vi.advanceTimersByTimeAsync(1); expect(media.paused).toBe(false); expect(media.src).toBe(assets.tracks.G.src);
  });
  it('留白 / 请求解码 / 实际播放 / 缓冲区分，音量调整不重复发起挂起的播放', async () => {
    const { media, manager } = await setup(); expect(manager.getSnapshot().phase).toBe('waiting');
    let resolve!: () => void;
    media.play.mockImplementationOnce(() => new Promise<void>((done) => { resolve = done; }));
    await vi.advanceTimersByTimeAsync(8000); expect(manager.getSnapshot()).toEqual({ phase: 'loading', playing: false });
    manager.configure({ ...options, volume: 0.7 }); expect(media.play).toHaveBeenCalledOnce();
    media.paused = false; media.onplaying?.(); resolve(); await vi.advanceTimersByTimeAsync(1800);
    expect(manager.getSnapshot().phase).toBe('playing'); expect(media.volume).toBeCloseTo(0.7);
    media.onwaiting?.(); expect(manager.getSnapshot()).toEqual({ phase: 'buffering', playing: false });
    media.onplaying?.(); await vi.advanceTimersByTimeAsync(400); expect(manager.getSnapshot().playing).toBe(true);
  });
  it('音量连续调整不换曲、不重置位置或留白，静音后保留播放位置', async () => {
    const { media, manager } = await setup(); await vi.advanceTimersByTimeAsync(10000); media.currentTime = 18;
    const requests = media.play.mock.calls.length;
    manager.configure({ ...options, volume: 0.8 }); await vi.advanceTimersByTimeAsync(150);
    expect(media.volume).toBeCloseTo(0.8); expect(media.play).toHaveBeenCalledTimes(requests); expect(media.currentTime).toBe(18);
    manager.configure({ ...options, volume: 0 }); await vi.advanceTimersByTimeAsync(350); expect(media.paused).toBe(true);
    manager.configure({ ...options, volume: 0.6 }); await vi.advanceTimersByTimeAsync(1800);
    expect(media.volume).toBeCloseTo(0.6); expect(media.currentTime).toBe(18);
  });
  it('复用音效上下文与单个媒体节点，以原生增益包络渐入淡出并释放连接', async () => {
    const media = new FakeAudio();
    const parameter = { value: 0, setValueAtTime: vi.fn(), cancelAndHoldAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() };
    const source = { connect: vi.fn(), disconnect: vi.fn() }; const gain = { gain: parameter, connect: vi.fn(), disconnect: vi.fn() };
    const context = { currentTime: 7, state: 'running', destination: {}, createMediaElementSource: vi.fn(() => source), createGain: vi.fn(() => gain), close: vi.fn() };
    const manager = new MusicManager(() => context as unknown as AudioContext, () => media as unknown as HTMLAudioElement);
    managers.push(manager); manager.configure(options); await manager.unlock(); await vi.advanceTimersByTimeAsync(8000);
    expect(context.createMediaElementSource).toHaveBeenCalledExactlyOnceWith(media); expect(source.connect).toHaveBeenCalledWith(gain);
    expect(gain.connect).toHaveBeenCalledWith(context.destination); expect(parameter.linearRampToValueAtTime).toHaveBeenLastCalledWith(0.45, 8.8);
    media.currentTime = 98; media.ontimeupdate?.(); expect(parameter.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, 9);
    manager.configure({ ...options, stage: 'B' }); await vi.advanceTimersByTimeAsync(9200); expect(context.createMediaElementSource).toHaveBeenCalledOnce();
    manager.dispose(); expect(source.disconnect).toHaveBeenCalledOnce(); expect(gain.disconnect).toHaveBeenCalledOnce(); expect(context.close).not.toHaveBeenCalled();
  });
  it('没有手势不创建播放器或加载曲目，授权后留白八秒才请求当前一首', async () => {
    const media = new FakeAudio(); const factory = vi.fn(() => media as unknown as HTMLAudioElement);
    const manager = new MusicManager(() => null, factory); managers.push(manager); manager.configure(options);
    await vi.advanceTimersByTimeAsync(60000); expect(factory).not.toHaveBeenCalled(); expect(manager.getSnapshot().phase).toBe('blocked');
    await manager.unlock(); expect(factory).toHaveBeenCalledOnce(); expect(media.src).toBe('');
    await vi.advanceTimersByTimeAsync(7999); expect(media.src).toBe(''); await vi.advanceTimersByTimeAsync(1);
    expect(media.src).toBe(assets.tracks.A.src); expect(media.loop).toBe(false); expect(manager.getSnapshot().playing).toBe(true);
    expect(media.volume).toBe(0); await vi.advanceTimersByTimeAsync(MUSIC_RULES.fadeInMs); expect(media.volume).toBeCloseTo(0.45);
  });
  it('曲尾渐隐，结束留白十二秒后仅重播同一首，不请求其他阶段', async () => {
    const { media, manager, factory } = await setup(); await vi.advanceTimersByTimeAsync(10000);
    media.currentTime = 98; media.ontimeupdate?.(); await vi.advanceTimersByTimeAsync(2000); expect(media.volume).toBe(0);
    media.paused = true; media.onended?.(); expect(manager.getSnapshot().playing).toBe(false);
    const count = media.play.mock.calls.length; await vi.advanceTimersByTimeAsync(11999); expect(media.play).toHaveBeenCalledTimes(count);
    await vi.advanceTimersByTimeAsync(1); expect(media.play).toHaveBeenCalledTimes(count + 1);
    expect(media.src).toBe(assets.tracks.A.src); expect(factory).toHaveBeenCalledOnce(); expect(media.currentTime).toBe(0);
  });
  it('切换先淡出旧曲，完成之后留白才加载新曲，无场景时释放', async () => {
    const { media, manager } = await setup(); await vi.advanceTimersByTimeAsync(10000);
    manager.configure({ ...options, stage: 'B' }); expect(media.src).toBe(assets.tracks.A.src);
    await vi.advanceTimersByTimeAsync(MUSIC_RULES.sceneFadeMs); expect(media.src).toBe('');
    await vi.advanceTimersByTimeAsync(7999); expect(media.src).toBe(''); await vi.advanceTimersByTimeAsync(1); expect(media.src).toBe(assets.tracks.B.src);
    manager.configure({ ...options, stage: null }); await vi.advanceTimersByTimeAsync(MUSIC_RULES.sceneFadeMs);
    expect(manager.getSnapshot().phase).toBe('silent'); expect(media.src).toBe(''); await vi.advanceTimersByTimeAsync(60000); expect(media.src).toBe('');
  });
  it('暂停 / 恢复保留播放位置，静默间隔也保留余量', async () => {
    const { media, manager } = await setup(); await vi.advanceTimersByTimeAsync(3000);
    manager.configure({ ...options, paused: true }); await vi.advanceTimersByTimeAsync(90000); expect(media.src).toBe('');
    manager.configure(options); await vi.advanceTimersByTimeAsync(4999); expect(media.src).toBe(''); await vi.advanceTimersByTimeAsync(1);
    media.currentTime = 35; manager.configure({ ...options, enabled: false }); await vi.advanceTimersByTimeAsync(MUSIC_RULES.pauseFadeMs);
    expect(media.paused).toBe(true); expect(media.currentTime).toBe(35);
    manager.configure(options); await vi.advanceTimersByTimeAsync(0); expect(media.paused).toBe(false); expect(media.currentTime).toBe(35);
  });
  it('后台立即停止，淡出中被隐藏也立即释放，恢复不补播后台时间', async () => {
    const { media, manager } = await setup(); await vi.advanceTimersByTimeAsync(10000);
    media.currentTime = 20; manager.configure({ ...options, paused: true, immediate: true }); expect(media.paused).toBe(true); expect(media.volume).toBe(0);
    await vi.advanceTimersByTimeAsync(50000); expect(media.currentTime).toBe(20); manager.configure(options); await vi.advanceTimersByTimeAsync(0);
    manager.configure({ ...options, stage: 'C' }); manager.configure({ ...options, stage: 'C', paused: true, immediate: true });
    expect(media.paused).toBe(true); expect(media.src).toBe('');
  });
  it('连续静默换景仅加载最后目标，加载页期间不启动', async () => {
    const { media, manager } = await setup(); await vi.advanceTimersByTimeAsync(3000);
    manager.configure({ ...options, stage: 'B', paused: true }); manager.configure({ ...options, stage: 'F', paused: true });
    await vi.advanceTimersByTimeAsync(90000); expect(media.src).toBe('');
    manager.configure({ ...options, stage: 'F' }); await vi.advanceTimersByTimeAsync(8000); expect(media.src).toBe(assets.tracks.F.src);
  });
  it('播放失败可手动重试，不自动循环请求，不影响主流程', async () => {
    const { media, manager } = await setup(); media.play.mockRejectedValueOnce(new Error('decode'));
    await vi.advanceTimersByTimeAsync(8000); expect(manager.getSnapshot().phase).toBe('error');
    const count = media.play.mock.calls.length; await vi.advanceTimersByTimeAsync(90000); expect(media.play).toHaveBeenCalledTimes(count);
    await manager.unlock(); await vi.advanceTimersByTimeAsync(8000); expect(manager.getSnapshot().phase).toBe('playing');
  });
  it('自动播放被拒绝保留进度，下一真实手势可以重新授权', async () => {
    const { media, manager } = await setup(); media.play.mockRejectedValueOnce(new DOMException('blocked', 'NotAllowedError'));
    await vi.advanceTimersByTimeAsync(8000); expect(manager.getSnapshot().phase).toBe('blocked');
    await manager.unlock(); await vi.advanceTimersByTimeAsync(0); expect(manager.getSnapshot().playing).toBe(true);
  });
  it('挂起的播放承诺在暂停后拒绝，不把主动暂停误报为错误', async () => {
    const { media, manager } = await setup(); let reject!: (error: unknown) => void;
    media.play.mockImplementationOnce(() => new Promise<void>((_, fail) => { reject = fail; }));
    await vi.advanceTimersByTimeAsync(8000); manager.configure({ ...options, enabled: false }); reject(new DOMException('aborted', 'AbortError'));
    await vi.advanceTimersByTimeAsync(500); expect(manager.getSnapshot().phase).toBe('paused');
  });
  it('无响应的解码十五秒有界失败，退出清除计时及媒体来源', async () => {
    const { media, manager } = await setup(); media.play.mockImplementationOnce(() => new Promise<void>(() => {}));
    await vi.advanceTimersByTimeAsync(23000); expect(manager.getSnapshot().phase).toBe('error');
    manager.dispose(); expect(media.src).toBe(''); expect(vi.getTimerCount()).toBe(0);
  });
});

describe('资源保护、字体与设置迁移', () => {
  it('音量迁移默认 45%，保留小数、钳位异常且零音量关闭音乐', () => {
    expect(validateSave({ settings: { music: false } }).settings).toMatchObject({ music: false, musicVolume: 0.45 });
    for (const volume of [0.27, 0.8]) expect(validateSave({ settings: { musicVolume: volume } }).settings.musicVolume).toBe(volume);
    expect(validateSave({ settings: { musicVolume: 0 } }).settings.music).toBe(false);
    expect(validateSave({ settings: { musicVolume: -1 } }).settings.musicVolume).toBe(0);
    expect(validateSave({ settings: { musicVolume: 2 } }).settings.musicVolume).toBe(1);
    expect(validateSave({ settings: { musicVolume: NaN } }).settings.musicVolume).toBe(0.45);
  });
  it('七曲 48k 双声道 AAC 高质量压缩，原文件哈希不变，只发布一档且显著小于原 MP3', () => {
    expect(Object.keys(assets.tracks)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G']); expect(manifest.bitrate).toBe(192000);
    expect(manifest.sampleRate).toBe(48000); expect(manifest.channels).toBe(2); expect(manifest.publishedBytes).toBeLessThan(manifest.sourceBytes * 0.65);
    for (const file of manifest.files) {
      expect(createHash('sha256').update(readFileSync(file.source)).digest('hex')).toBe(file.sourceSha256);
      const bytes = readFileSync(file.file); expect(bytes.length).toBe(file.bytes); expect(createHash('sha256').update(bytes).digest('hex')).toBe(file.sha256);
      expect(bytes.subarray(4, 8).toString()).toBe('ftyp');
    }
    expect(readFileSync(manifest.button.source).equals(readFileSync(manifest.button.file))).toBe(true);
  });
  it('使用 0.87 字体，常用 / 扩展 WOFF2 哈希与全量字形覆盖登记完整', () => {
    expect(fontManifest.source).toContain('0.87.ttf'); expect(fontManifest.glyphs).toBe(33477);
    expect(createHash('sha256').update(readFileSync(fontManifest.source)).digest('hex')).toBe(fontManifest.sourceSha256);
    expect(fontManifest.files.reduce((count, file) => count + file.characters, 0)).toBe(33477);
    expect(fontManifest.files[0].bytes).toBeLessThan(250000);
    for (const file of fontManifest.files) { const bytes = readFileSync(file.file); expect(bytes.subarray(0, 4).toString()).toBe('wOF2'); expect(createHash('sha256').update(bytes).digest('hex')).toBe(file.sha256); }
    expect(readFileSync('src/styles/game.css', 'utf8')).not.toMatch(/Georgia|Noto Serif SC|font-synthesis:none/);
  });
  it('旧存档默认开启音乐但不改变音效偏好，显式关闭随存档恢复', () => {
    expect(createSave().settings.music).toBe(true); expect(validateSave({ settings: { sound: true } }).settings).toMatchObject({ sound: true, music: true });
    expect(validateSave({ settings: { music: false } }).settings.music).toBe(false);
  });
  it('从手记进入设置不短暂恢复游戏计时，关闭后正常恢复', () => {
    const { game } = testGame(); game.start(); game.openPanel('journal'); expect(game.getSnapshot().presentationPaused).toBe(true);
    game.openPanel('settings'); expect(game.getSnapshot().mode).toBe('settings'); expect(game.getSnapshot().presentationPaused).toBe(true);
    game.closePanel(); expect(game.getSnapshot().mode).toBe('idle'); game.stop();
  });
});
