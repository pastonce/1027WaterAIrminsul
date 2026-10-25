import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { INTERACTION_SOUNDS, SOUND_RULES } from '../src/data/sounds';
import { SoundManager } from '../src/game/core/SoundManager';
import { EncounterDirector } from '../src/game/encounters/EncounterDirector';
import { ENCOUNTER_RULES } from '../src/data/inhabitants';
import { stageFixture } from '../src/dev/fixtures';
import { SCHEDULE } from '../src/data/schedule';
import { createSave, validateSave } from '../src/game/save/SaveManager';
import { startScene, testGame, TestClock } from './support';
import manifest from '../docs/sfx-assets.manifest.json';
import type { ForestEncounter } from '../src/types/game';

class Parameter {
  value = 0;
  setValueAtTime = vi.fn((value: number) => { this.value = value; });
  linearRampToValueAtTime = vi.fn((value: number) => { this.value = value; });
  setTargetAtTime = vi.fn((value: number) => { this.value = value; });
  cancelScheduledValues = vi.fn();
}
class Source {
  buffer: AudioBuffer | null = null;
  playbackRate = { value: 1 };
  onended: (() => void) | null = null;
  start = vi.fn(); stop = vi.fn(); connect = vi.fn(); disconnect = vi.fn();
}
class Context {
  state: AudioContextState = 'running'; currentTime = 2; destination = {};
  sources: Source[] = [];
  gains: { gain: Parameter; connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[] = [];
  resume = vi.fn(async () => { this.state = 'running'; }); close = vi.fn(async () => { this.state = 'closed'; });
  decodeAudioData = vi.fn(async () => ({ duration: 1 } as AudioBuffer));
  createBufferSource = vi.fn(() => { const source = new Source(); this.sources.push(source); return source; });
  createGain = vi.fn(() => { const gain = { gain: new Parameter(), connect: vi.fn(), disconnect: vi.fn() }; this.gains.push(gain); return gain; });
  createDynamicsCompressor = vi.fn(() => ({ threshold: new Parameter(), knee: new Parameter(), ratio: new Parameter(), attack: new Parameter(), release: new Parameter(), connect: vi.fn(), disconnect: vi.fn() }));
}
const managers: SoundManager[] = [];
const options = { volume: 0.6, paused: false, transitioning: false, scope: 'A-play' };
const response = () => ({ ok: true, arrayBuffer: async () => new TextEncoder().encode(JSON.stringify({ version: 1, audio: 'AAAAAA==' })).buffer } as Response);
function setup() {
  const context = new Context(); const factory = vi.fn(() => context as unknown as AudioContext);
  const fetchAsset = vi.fn(async () => response());
  const manager = new SoundManager(factory, fetchAsset); managers.push(manager); manager.configure(options);
  return { context, factory, fetchAsset, manager };
}
beforeEach(() => vi.useFakeTimers());
afterEach(async () => { managers.splice(0).forEach((manager) => manager.dispose()); await Promise.resolve(); vi.clearAllTimers(); vi.useRealTimers(); });

describe('真实音效素材与独立音量', () => {
  it('七份 AAC 数据包含原始来源 / 授权与哈希，留足峰值余量且合计小于 256 KiB', () => {
    expect(manifest.encoder).toMatch(/^ffmpeg version/); expect(manifest.files).toHaveLength(7);
    expect(manifest.publishedBytes).toBeLessThan(256 * 1024);
    for (const file of manifest.files) {
      expect(createHash('sha256').update(readFileSync(file.source)).digest('hex')).toBe(file.sourceSha256);
      const bytes = readFileSync(file.file);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(file.sha256);
      const payload = JSON.parse(bytes.toString('utf8')); expect(payload.version).toBe(1);
      const audio = Buffer.from(payload.audio, 'base64');
      expect(createHash('sha256').update(audio).digest('hex')).toBe(file.audioSha256);
      expect(audio.subarray(4, 8).toString()).toBe('ftyp'); expect(file.peakDb).toBeLessThanOrEqual(-4);
      expect(file.page).toMatch(/^https:\/\//); expect(file.duration).toBeLessThanOrEqual(3.3);
    }
    expect(manifest.files.find((file) => file.id === 'transition')!.license).toContain('no separate redistribution license');
    const credits = readFileSync('public/asserts/sfx/CREDITS.txt', 'utf8');
    expect(credits).toContain('Boing Raw Copyright 2005 cfork'); expect(credits).toContain('Iwan Gabovitch');
    expect(INTERACTION_SOUNDS['aranara-appear'].gain).toBeLessThan(INTERACTION_SOUNDS.water.gain / 2);
    expect(INTERACTION_SOUNDS['aranara-disappear'].asset.src).toBe(INTERACTION_SOUNDS['aranara-appear'].asset.src);
  });
  it('新存档 60%，旧开关偏好保留，非法 / 非有限音量修正且 0 静音', () => {
    expect(createSave().settings).toMatchObject({ sound: true, soundVolume: SOUND_RULES.defaultVolume, musicVolume: 0.45 });
    expect(validateSave({ settings: { sound: false } }).settings).toMatchObject({ sound: false, soundVolume: 0.6 });
    expect(validateSave({ settings: { sound: true } }).settings).toMatchObject({ sound: true, soundVolume: 0.6 });
    expect(validateSave({ settings: { soundVolume: 0 } }).settings).toMatchObject({ sound: false, soundVolume: 0 });
    expect(validateSave({ settings: { soundVolume: -2 } }).settings.soundVolume).toBe(0);
    expect(validateSave({ settings: { soundVolume: 3 } }).settings.soundVolume).toBe(1);
    for (const volume of [NaN, Infinity, '1', null]) expect(validateSave({ settings: { soundVolume: volume } }).settings.soundVolume).toBe(0.6);
    const { game } = testGame(); game.setSettings({ soundVolume: 0.37 }); game.setSettings({ sound: false });
    expect(game.getSnapshot().save.settings).toMatchObject({ sound: false, soundVolume: 0.37, musicVolume: 0.45 });
    game.setSettings({ sound: true }); expect(game.getSnapshot().save.settings.sound).toBe(true); game.stop();
  });
});

describe('共享上下文、按需请求与短音混音', () => {
  it('真实手势前不创建上下文 / 请求素材，启用后仅加载当前音效并缓存解码', async () => {
    const { manager, factory, fetchAsset, context } = setup();
    await manager.play('dew'); expect(factory).not.toHaveBeenCalled(); expect(fetchAsset).not.toHaveBeenCalled();
    await manager.unlock(); expect(factory).toHaveBeenCalledOnce(); expect(fetchAsset).not.toHaveBeenCalled();
    await manager.play('dew'); expect(fetchAsset).toHaveBeenCalledOnce(); expect(context.decodeAudioData).toHaveBeenCalledOnce();
    expect(manager.getContext()).toBe(context); expect(factory).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(100); await manager.play('dew'); expect(fetchAsset).toHaveBeenCalledOnce();
    expect(context.sources).toHaveLength(2); expect(context.createDynamicsCompressor).toHaveBeenCalledOnce();
    expect(context.gains[0].gain.value).toBe(0.6); expect(context.sources[0].start).toHaveBeenCalledOnce();
    expect(context.gains[1].gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.9, 2.008);
    expect(context.gains[1].gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, 3);
  });
  it('首次手势的 resume 尚未完成，点击音效等待授权但不额外 resume', async () => {
    const { manager, context } = setup(); context.state = 'suspended';
    let resume!: () => void;
    context.resume.mockImplementation(() => new Promise<void>((resolve) => { resume = () => { context.state = 'running'; resolve(); }; }));
    const unlocking = manager.unlock(); const playing = manager.play('water'); manager.unlock();
    expect(context.resume).toHaveBeenCalledOnce(); resume(); await unlocking; await playing;
    expect(context.sources).toHaveLength(1);
  });
  it('鼠标悬停 / 点击去重、85ms 节流，同类最多两声、总数最多六声', async () => {
    const { manager, context, fetchAsset } = setup(); await manager.unlock();
    await Promise.all([manager.play('dew'), manager.play('dew')]); expect(context.sources).toHaveLength(1);
    await manager.play('dew'); expect(context.sources).toHaveLength(1);
    vi.advanceTimersByTime(90); await manager.play('dew'); vi.advanceTimersByTime(90); await manager.play('dew');
    expect(fetchAsset).toHaveBeenCalledOnce(); expect(context.sources[0].stop).toHaveBeenCalledTimes(2);
    for (const kind of ['water', 'aranara-appear', 'aranara-disappear', 'aranara-jump'] as const) await manager.play(kind);
    vi.advanceTimersByTime(150); await manager.play('aranara-jump');
    expect(context.sources.filter((source) => source.onended !== null)).toHaveLength(6);
  });
  it('进退叶声共用同一请求和缓冲，不创建额外媒体播放器', async () => {
    const { manager, context, fetchAsset } = setup(); await manager.unlock();
    await Promise.all([manager.play('aranara-appear'), manager.play('aranara-disappear')]);
    expect(fetchAsset).toHaveBeenCalledOnce(); expect(context.decodeAudioData).toHaveBeenCalledOnce();
    expect(context.sources[1].playbackRate.value).toBe(0.92);
    const end = context.sources[0].onended!; end(); expect(context.sources[0].disconnect).toHaveBeenCalledOnce();
  });
  it('改音量不重新下载，0 / 面板 / 后台停止现有声音且恢复不补播', async () => {
    const { manager, context, fetchAsset } = setup(); await manager.unlock(); await manager.play('water');
    manager.configure({ ...options, volume: 0.31 }); expect(context.gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(0.31, 2, 0.015);
    manager.configure({ ...options, volume: 0 }); expect(context.sources[0].disconnect).toHaveBeenCalledOnce();
    await manager.play('dew'); expect(fetchAsset).toHaveBeenCalledOnce();
    manager.configure(options); manager.configure({ ...options, paused: true }); await manager.play('dew');
    manager.configure(options); expect(context.sources).toHaveLength(1); await manager.play('water'); expect(fetchAsset).toHaveBeenCalledOnce();
  });
  it('加载覆盖时只允许传送声、清除旧声，阶段完成不续播或重播', async () => {
    const { manager, context } = setup(); await manager.unlock(); await manager.play('water');
    manager.configure({ ...options, transitioning: true, scope: 'loading-1' });
    await manager.play('dew'); await manager.play('aranara-appear'); expect(context.sources).toHaveLength(1);
    await manager.play('transition'); expect(context.sources).toHaveLength(2);
    manager.configure({ ...options, scope: 'B-play' }); expect(context.sources[1].disconnect).toHaveBeenCalledOnce();
    expect(context.sources).toHaveLength(2);
  });
  it('慢请求超过点击时限只缓存不迟响，换景 / 静音撤销请求后不得漏声', async () => {
    const { manager, context, fetchAsset } = setup(); await manager.unlock();
    let resolve!: (response: Response) => void;
    fetchAsset.mockImplementationOnce(() => new Promise<Response>((done) => { resolve = done; }));
    const first = manager.play('dew'); vi.advanceTimersByTime(500); resolve(response()); await first;
    expect(context.sources).toHaveLength(0); await manager.play('dew'); expect(context.sources).toHaveLength(1);
    fetchAsset.mockImplementationOnce(() => new Promise<Response>((done) => { resolve = done; }));
    const second = manager.play('water'); manager.configure({ ...options, paused: true }); resolve(response()); await second;
    expect(context.sources).toHaveLength(1); expect(vi.getTimerCount()).toBe(0);
  });
  it('失败五秒内不重复请求，无限加载有界退出；失败 / 缺 Web Audio 不影响交互', async () => {
    const { manager, context, fetchAsset } = setup(); await manager.unlock();
    fetchAsset.mockRejectedValueOnce(new Error('offline')); await manager.play('dew'); vi.advanceTimersByTime(100); await manager.play('dew');
    expect(fetchAsset).toHaveBeenCalledOnce(); vi.advanceTimersByTime(5000); await manager.play('dew'); expect(context.sources).toHaveLength(1);
    fetchAsset.mockImplementationOnce(() => new Promise<Response>(() => undefined));
    const hanging = manager.play('water'); await vi.advanceTimersByTimeAsync(5000); await hanging;
    expect(vi.getTimerCount()).toBe(0); expect(context.sources).toHaveLength(1);
    const unavailable = new SoundManager(() => null); managers.push(unavailable); unavailable.configure(options);
    await unavailable.unlock(); await expect(unavailable.play('transition')).resolves.toBeUndefined();
  });
  it('超大资源、解码失败或节点启动失败均安全释放，卸载关闭共享上下文', async () => {
    const { manager, context, fetchAsset } = setup(); await manager.unlock();
    fetchAsset.mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(SOUND_RULES.maximumBytes + 1) } as Response);
    await manager.play('dew'); expect(context.decodeAudioData).not.toHaveBeenCalled();
    context.decodeAudioData.mockRejectedValueOnce(new Error('invalid audio')); await manager.play('water'); expect(context.sources).toHaveLength(0);
    const create = context.createBufferSource.getMockImplementation()!;
    context.createBufferSource.mockImplementationOnce(() => { const source = create(); source.start.mockImplementation(() => { throw new Error('context closed'); }); return source; });
    await manager.play('aranara-jump'); expect(context.sources[0].disconnect).toHaveBeenCalledOnce();
    manager.dispose(); expect(context.close).toHaveBeenCalledOnce(); expect(context.gains.every((gain) => gain.disconnect.mock.calls.length > 0)).toBe(true);
  });
  it.each([null, { version: 2, audio: 'AAAAAA==' }, { version: 1, audio: '' }, { version: 1, audio: '^^==' }, { version: 1, audio: 'AAA' }, { version: 1, audio: 7 }])('不把损坏 / 非当前版本音频包交给解码器：%j', async (payload) => {
    const { manager, context, fetchAsset } = setup(); await manager.unlock();
    fetchAsset.mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new TextEncoder().encode(JSON.stringify(payload)).buffer } as Response);
    await expect(manager.play('dew')).resolves.toBeUndefined(); expect(context.decodeAudioData).not.toHaveBeenCalled();
  });
});

describe('音效只跟随真实交互事务', () => {
  it('收集失败 / 已收取 / 重复点击和露水不足均无音效，浇灌与收集各一次', () => {
    const { game } = testGame(); const cue = vi.fn(); game.subscribeSound(cue); startScene(game);
    expect(game.water()).toBe(false); expect(cue).not.toHaveBeenCalled();
    game.spawnDew(); const id = game.getSnapshot().dewParticles[0].id;
    expect(game.collectDew(id)).toBe(true); expect(game.collectDew(id)).toBe(false); expect(cue).toHaveBeenCalledExactlyOnceWith('dew');
    for (let index = 0; index < 20 && game.getSnapshot().save.dew < 20; index++) { game.spawnDew(); const particle = game.getSnapshot().dewParticles.find((entry) => !entry.collected); if (particle) game.collectDew(particle.id); }
    cue.mockClear(); expect(game.water()).toBe(true); expect(game.water()).toBe(false); expect(cue).toHaveBeenCalledExactlyOnceWith('water'); game.stop();
  });
  it('日期锁定满额的免费浇灌仍发声，但面板与挂起不发声', () => {
    const clock = new TestClock(Date.parse(SCHEDULE[0].at)); const save = stageFixture('C', clock.now());
    const { game } = testGame({ ...save, growth: 520, dew: 20 }, clock); const cue = vi.fn(); game.subscribeSound(cue); game.start();
    game.water(); expect(cue).toHaveBeenCalledExactlyOnceWith('water');
    game.openPanel('settings'); cue.mockClear(); game.water(); game.spawnAranara(0); expect(cue).not.toHaveBeenCalled(); game.closePanel();
    game.setSuspended(true); game.water(); expect(cue).not.toHaveBeenCalled(); game.stop();
  });
  it('兰那罗入场 / 自然退场各一次，点击只发跳跃声、清理不误当退场', () => {
    let entries: ForestEncounter[] = []; const cue = vi.fn();
    const director = new EncounterDirector((next) => { entries = next; }, () => 0, cue);
    director.configure('A', false); director.spawn(0); expect(cue).toHaveBeenCalledExactlyOnceWith('aranara-appear');
    director.setAvailable([]); vi.advanceTimersByTime(ENCOUNTER_RULES.lifetimeMs);
    expect(cue.mock.calls.map(([kind]) => kind)).toEqual(['aranara-appear', 'aranara-disappear']);
    director.clear(); cue.mockClear(); director.configure('D', false); director.spawn(0); const id = entries[0].id;
    director.leave(id, true); director.clear(); expect(cue).toHaveBeenCalledExactlyOnceWith('aranara-appear');
  });
  it('随机 / F 常驻领取均只可爱跳出一次，已领取不会重响；音效异常不破坏奖励', () => {
    const clock = new TestClock(Date.parse('2026-10-27T10:27:00+08:00'));
    const { game } = testGame(stageFixture('F', clock.now()), clock); const cue = vi.fn(); game.subscribeSound(cue); game.start();
    game.spawnAranara(0); const id = game.getSnapshot().encounters[0].id; cue.mockClear();
    expect(game.interactAranara(id, { x: 20, y: 50 })).toBe(true); expect(game.interactAranara(id, { x: 20, y: 50 })).toBe(false);
    expect(cue).toHaveBeenCalledExactlyOnceWith('aranara-jump');
    game.subscribeSound(() => { throw new Error('audio unavailable'); }); cue.mockClear();
    expect(game.interactAranara('aranara_07', { x: 80, y: 55 })).toBe(true); expect(game.interactAranara('aranara_07', { x: 80, y: 55 })).toBe(false);
    expect(cue).toHaveBeenCalledExactlyOnceWith('aranara-jump'); expect(game.getSnapshot().save.claimedAranara).toContain('aranara_07'); game.stop();
  });
  it('实际覆盖加载页才发传送声，等待对白 / 等于上限 / 初入不发，进度变化不重响', () => {
    const { game } = testGame({ growth: 180, dew: 20 }); const cue = vi.fn(); game.subscribeSound(cue); startScene(game);
    expect(cue).not.toHaveBeenCalled(); game.water(); expect(cue).toHaveBeenCalledExactlyOnceWith('water');
    for (let elapsed = 0; elapsed < 60000 && !game.getSnapshot().stageLoading; elapsed += 100) vi.advanceTimersByTime(100);
    expect(game.getSnapshot().stageLoading).not.toBeNull(); expect(cue.mock.calls.filter(([kind]) => kind === 'transition')).toHaveLength(1);
    vi.advanceTimersByTime(1000); game.tick(); expect(cue.mock.calls.filter(([kind]) => kind === 'transition')).toHaveLength(1); game.stop();
  });
});
