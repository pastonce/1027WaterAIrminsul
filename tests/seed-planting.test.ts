import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { GameController } from '../src/game/core/GameController';
import { createSave, SaveManager, SAVE_KEYS, validateSave } from '../src/game/save/SaveManager';
import { TimeGateService } from '../src/game/time/TimeGateService';
import { SCHEDULE } from '../src/data/schedule';
import { SEED_ART, SEED_RULES } from '../src/data/seed';
import { startupPlan } from '../src/game/assets/startupPlan';
import { MemoryStorage, TestClock } from './support';
import type { GameSave } from '../src/types/game';
import manifest from '../docs/seed-assets.manifest.json' with { type: 'json' };

const games: GameController[] = [];
beforeEach(() => vi.useFakeTimers());
afterEach(() => { games.splice(0).forEach((game) => game.stop()); expect(vi.getTimerCount()).toBe(0); vi.useRealTimers(); });

function setup(patch?: Partial<GameSave>, storage = new MemoryStorage(), clock = new TestClock()) {
  if (patch) storage.setItem(SAVE_KEYS.player, JSON.stringify({ ...createSave(clock.now()), ...patch }));
  const game = new GameController(new TimeGateService(clock), new SaveManager(storage), () => .99);
  games.push(game); game.start();
  return { game, storage, clock };
}

function arrive(game: GameController) {
  game.enterDream(); game.sceneEntranceReady('A');
  expect(game.getSnapshot().seedPhase).toBe('waiting');
}

describe('种子种下与首次引导', () => {
  it('新档需要种植，旧版已入梦或有成长的存档兼容跳过，非布尔标志不授予种植', () => {
    expect(createSave().seedPlanted).toBe(false);
    expect(validateSave({ introSeen: true }).seedPlanted).toBe(true);
    expect(validateSave({ introSeen: false }).seedPlanted).toBe(false);
    expect(validateSave({ introSeen: true, seedPlanted: false }).seedPlanted).toBe(false);
    expect(validateSave({ seedPlanted: 'true' }).seedPlanted).toBe(false);
    expect(validateSave({ growth: 20, seedPlanted: false }).seedPlanted).toBe(true);
    expect(validateSave({ seedPlanted: true }).seedPlanted).toBe(true);
  });

  it('开放前、入梦前及真实镜头完成前均不能种植，也不会生成对白或梦露', () => {
    const { game, clock } = setup(undefined, new MemoryStorage(), new TestClock(Date.parse(SCHEDULE[0].at) - 1));
    expect(game.plantSeed()).toBe(false); expect(game.enterDream()).toBe(false);
    clock.value++; game.tick(); expect(game.plantSeed()).toBe(false);
    game.enterDream(); vi.advanceTimersByTime(65000);
    expect(game.plantSeed()).toBe(false); game.sceneEntranceReady('B'); expect(game.plantSeed()).toBe(false);
    expect(game.getSnapshot().speech).toBeNull(); expect(game.getSnapshot().dewParticles).toEqual([]);
    expect(game.getSnapshot().save.pendingDialogues).toEqual([]);
    game.sceneEntranceReady('A'); expect(game.getSnapshot().seedPhase).toBe('waiting');
  });

  it('等待种植时有露也不能浇水、召来访或树对白，60秒待机与表情亦不启动', () => {
    const { game } = setup({ introSeen: true, dew: 40 }); arrive(game);
    expect(game.water()).toBe(false); game.talk(); game.requestVisit(); vi.advanceTimersByTime(65000);
    const state = game.getSnapshot();
    expect(state.save.dew).toBe(40); expect(state.growth).toBe(0); expect(state.speech).toBeNull();
    expect(state.expression).toBeNull(); expect(state.encounters).toEqual([]); expect(state.dewParticles).toEqual([]);
    expect(state.save.pendingVisits).toEqual([]); expect(state.save.pendingDialogues).toEqual([]);
  });

  it('点击一次垂落后才持久化种植，不扣露不长树，之后接 A 入场句', () => {
    const { game, storage } = setup(); arrive(game);
    expect(game.plantSeed()).toBe(true); expect(game.plantSeed()).toBe(false); expect(game.water()).toBe(false);
    expect(game.getSnapshot().seedPhase).toBe('falling');
    vi.advanceTimersByTime(SEED_RULES.fallMs - 1);
    expect(game.getSnapshot().save.seedPlanted).toBe(false); expect(game.getSnapshot().speech).toBeNull();
    vi.advanceTimersByTime(1);
    expect(game.getSnapshot().seedPhase).toBeNull(); expect(game.getSnapshot().save.seedPlanted).toBe(true);
    expect(game.getSnapshot().save.growth).toBe(0); expect(game.getSnapshot().save.dew).toBe(0);
    expect(JSON.parse(storage.getItem(SAVE_KEYS.player)!).seedPlanted).toBe(true);
    expect(game.getSnapshot().save.pendingDialogues[0].kind).toBe('opening');
    expect(game.plantSeed()).toBe(false);
  });

  it.each(['settings', 'notice', 'suspended'] as const)('%s 暂停保留种子落下的剩余时间', (pause) => {
    const { game } = setup(); arrive(game); game.plantSeed(); vi.advanceTimersByTime(400);
    if (pause === 'suspended') game.setSuspended(true); else game.openPanel(pause);
    vi.advanceTimersByTime(20000); expect(game.getSnapshot().save.seedPlanted).toBe(false);
    if (pause === 'suspended') game.setSuspended(false); else game.closePanel();
    vi.advanceTimersByTime(799); expect(game.getSnapshot().save.seedPlanted).toBe(false);
    vi.advanceTimersByTime(1); expect(game.getSnapshot().save.seedPlanted).toBe(true);
  });

  it('刷新落下中不提前种植，种下后的刷新不再演出且仍等 A 镜头播放欢迎', () => {
    const first = setup(); arrive(first.game); first.game.plantSeed(); vi.advanceTimersByTime(400); first.game.stop();
    const second = setup(undefined, first.storage);
    expect(second.game.getSnapshot().save.seedPlanted).toBe(false); expect(second.game.getSnapshot().seedPhase).toBe('arriving');
    arrive(second.game); second.game.plantSeed(); vi.advanceTimersByTime(SEED_RULES.fallMs); second.game.stop();
    const third = setup(undefined, first.storage);
    expect(third.game.getSnapshot().seedPhase).toBeNull(); expect(third.game.getSnapshot().speech).toBeNull();
    third.game.sceneEntranceReady('A'); expect(third.game.getSnapshot().speech?.entry.id).toBe('R01');
  });

  it.each(['reset', 'stop', 'revoke'] as const)('%s 撤销未结束的种植回调，不产生迟到收据', (action) => {
    const { game, clock } = setup(); arrive(game); game.plantSeed(); vi.advanceTimersByTime(400);
    if (action === 'reset') game.reset(); else if (action === 'stop') game.stop();
    else { clock.value = Date.parse(SCHEDULE[0].at) - 1; game.tick(); }
    vi.advanceTimersByTime(5000); expect(game.getSnapshot().save.seedPlanted).toBe(false);
    expect(game.getSnapshot().seedPhase).toBe('arriving'); expect(game.getSnapshot().speech).toBeNull();
  });

  it.each(['system', 'settings'] as const)('落下期间启用 %s 减少动态以短淡出完成，暂停时不推进', (source) => {
    const { game } = setup(); arrive(game); game.plantSeed(); vi.advanceTimersByTime(300); game.openPanel('settings');
    if (source === 'system') game.setSystemReducedMotion(true); else game.setSettings({ reducedMotion: true });
    vi.advanceTimersByTime(5000); expect(game.getSnapshot().save.seedPlanted).toBe(false);
    game.closePanel(); vi.advanceTimersByTime(SEED_RULES.reducedFallMs);
    expect(game.getSnapshot().save.seedPlanted).toBe(true);
  });

  it('种植只开放原有收露和20点浇灌流程，后续成长仍为原始第一拍', () => {
    const { game } = setup({ introSeen: true, dew: 20 }); arrive(game); game.plantSeed(); vi.advanceTimersByTime(SEED_RULES.fallMs);
    for (let elapsed = 0; elapsed < 30000 && game.getSnapshot().speech; elapsed += 100) vi.advanceTimersByTime(100);
    expect(game.water()).toBe(true); expect(game.getSnapshot().save.growth).toBe(20); expect(game.getSnapshot().save.dew).toBe(0);
    expect(game.getSnapshot().save.wateringCounts.A).toBe(1);
  });

  it('运行时仅预载一份真实透明 WebP，原图与去底图登记哈希一致', () => {
    const bytes = readFileSync(`public${SEED_ART.src}`);
    expect(bytes.toString('ascii', 0, 4)).toBe('RIFF'); expect(bytes.toString('ascii', 8, 12)).toBe('WEBP');
    expect(bytes.toString('ascii', 12, 16)).toBe('VP8X'); expect(bytes[20] & 16).toBe(16);
    expect(bytes.length).toBe(manifest.bytes); expect(bytes.length).toBeLessThan(25000);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(manifest.sha256);
    expect(createHash('sha256').update(readFileSync(manifest.source)).digest('hex')).toBe(manifest.sourceSha256);
    expect(createHash('sha256').update(readFileSync(manifest.cutout)).digest('hex')).toBe(manifest.cutoutSha256);
    const urls = startupPlan({}, 844, 390, 1, false, 'A').files.map((file) => file.url);
    expect(urls.filter((url) => url === SEED_ART.src)).toHaveLength(1);
    expect(urls).not.toContain('/asserts/seed.png'); expect(urls).not.toContain('/asserts/seed-cutout/seed.png');
  });
});
