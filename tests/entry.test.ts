import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SCHEDULE } from '../src/data/schedule';
import { GameController } from '../src/game/core/GameController';
import { createSave, SaveManager, SAVE_KEYS } from '../src/game/save/SaveManager';
import { TimeGateService } from '../src/game/time/TimeGateService';
import { MemoryStorage, TestClock } from './support';

const games: GameController[] = [];
beforeEach(() => vi.useFakeTimers());
afterEach(() => { games.splice(0).forEach((game) => game.stop()); expect(vi.getTimerCount()).toBe(0); vi.useRealTimers(); });

function setup(open = true, saved = false) {
  const clock = new TestClock(Date.parse(SCHEDULE[0].at) - (open ? 0 : 1));
  const storage = new MemoryStorage();
  if (saved) storage.setItem(SAVE_KEYS.player, JSON.stringify({ ...createSave(clock.now()), introSeen: true, growth: 13, dew: 9 }));
  const game = new GameController(new TimeGateService(clock), new SaveManager(storage), () => .99);
  games.push(game); game.start(); return { game, clock, storage };
}

describe('入梦门控与 A 实际镜头就绪', () => {
  it('开放前点击只提示，不写入入梦收据、抽对白、生成资源或角色', () => {
    const { game, storage } = setup(false);
    expect(game.enterDream()).toBe(false); game.sceneEntranceReady('A'); vi.advanceTimersByTime(90000);
    const state = game.getSnapshot();
    expect(state.mode).toBe('intro'); expect(state.message).toContain('尚未开启'); expect(state.save.introSeen).toBe(false);
    expect(state.speech).toBeNull(); expect(state.expression).toBeNull(); expect(state.encounters).toEqual([]); expect(state.dewParticles).toEqual([]);
    expect(state.save.pendingDialogues).toEqual([]); expect(state.save.loadingArtChoices).toEqual({}); expect(storage.getItem(SAVE_KEYS.player)).toBeNull();
  });
  it('无档在开放正点后仍需点击，镜头完成且种下种子才播放 A 入场句', () => {
    const { game, clock } = setup(false); clock.value += 1; game.tick(); expect(game.getSnapshot().mode).toBe('intro');
    expect(game.enterDream()).toBe(true); vi.advanceTimersByTime(5000); expect(game.getSnapshot().speech).toBeNull();
    game.sceneEntranceReady('B'); expect(game.getSnapshot().speech).toBeNull(); game.sceneEntranceReady('A');
    expect(game.getSnapshot().speech).toBeNull(); expect(game.getSnapshot().save.pendingDialogues).toEqual([]);
    expect(game.plantSeed()).toBe(true); vi.advanceTimersByTime(1200);
    expect(game.getSnapshot().save.pendingDialogues[0].kind).toBe('opening'); expect(game.getSnapshot().speech?.entry.id).toMatch(/^A\dZ$/u);
  });
  it('有档欢迎等待真实镜头信号，墙钟经过不能提前开播', () => {
    const { game } = setup(true, true); vi.advanceTimersByTime(30000);
    expect(game.getSnapshot().speech).toBeNull(); expect(game.getSnapshot().save.pendingDialogues).toEqual([]);
    game.sceneEntranceReady('A'); expect(game.getSnapshot().speech?.entry.id).toBe('R01');
    const sequence = game.getSnapshot().speech!.sequence; game.sceneEntranceReady('A'); expect(game.getSnapshot().speech!.sequence).toBe(sequence);
  });
  it('有档在开放前保留资源且停在入口，服务器确认开放后恢复但仍等镜头', () => {
    const { game, clock } = setup(false, true); expect(game.getSnapshot().mode).toBe('intro'); expect(game.enterDream()).toBe(false);
    expect(game.getSnapshot().save.growth).toBe(13); expect(game.getSnapshot().save.dew).toBe(9); clock.value += 1; game.tick();
    expect(game.getSnapshot().mode).toBe('idle'); expect(game.getSnapshot().speech).toBeNull(); game.sceneEntranceReady('A'); expect(game.getSnapshot().speech?.entry.id).toBe('R01');
  });
  it('镜头信号不解除面板 / 后台暂停，退出后的旧信号不再推进', () => {
    const { game } = setup(true, true); game.setSuspended(true); game.sceneEntranceReady('A'); expect(game.getSnapshot().speech).toBeNull();
    game.setSuspended(false); expect(game.getSnapshot().speech?.entry.id).toBe('R01'); game.stop(); game.sceneEntranceReady('A'); expect(game.getSnapshot().speech).toBeNull();
  });
});
