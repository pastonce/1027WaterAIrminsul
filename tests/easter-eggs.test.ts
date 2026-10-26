import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CodeSequence, easterCode, EASTER_CODES } from '../src/game/secrets/codes';
import { placeRainstorm } from '../src/game/dew/rainstorm';
import { stageFixture } from '../src/dev/fixtures';
import { createTestingSession } from '../src/dev/createTestingSession';
import { GameController } from '../src/game/core/GameController';
import { SaveManager, SAVE_KEYS } from '../src/game/save/SaveManager';
import { TimeGateService } from '../src/game/time/TimeGateService';
import { MemoryStorage, TestClock, testGame, startScene } from './support';
import type { GameSave, StageId } from '../src/types/game';
import { openingSpinStop, OPENING_SPIN } from '../src/game/opening/choreography';

const OPEN = Date.parse('2026-10-27T13:27:00+08:00');
const games: GameController[] = [];
function setup(stage: StageId = 'A', patch: Partial<GameSave> = {}) {
  const clock = new TestClock(OPEN);
  const { game, storage } = testGame({ ...stageFixture(stage, OPEN), ...patch }, clock);
  games.push(game); startScene(game); vi.advanceTimersByTime(10000); return { game, storage };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => { games.splice(0).forEach((game) => game.stop()); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('隐藏彩蛋代码与隔离测试', () => {
  it('Past是唯一测试入口代码，旧test代码不再兑换', () => {
    expect(easterCode('pAsT')).toBe('past');
    expect(easterCode('test')).toBeNull();
    const stream = new CodeSequence();
    expect([...'test'].flatMap((key) => stream.key(key) ?? [])).toEqual([]);
    stream.clear();
    expect([...'PaSt'].flatMap((key) => stream.key(key) ?? [])).toEqual(['past']);
  });
  it.each(EASTER_CODES)('%s 大小写不敏感，连续键入一次只触发一次', (code) => {
    expect(easterCode(` ${code.toUpperCase()} `)).toBe(code);
    const stream = new CodeSequence();
    expect([...`xx${code.toUpperCase()}`].flatMap((key) => stream.key(key) ?? [])).toEqual([code]);
    expect(stream.key('a')).toBeNull(); stream.clear();
    expect([...code].flatMap((key) => stream.key(key) ?? [])).toEqual([code]);
  });
  it('非字母和失焦清空前缀，退格可修正，无效代码无反馈', () => {
    const stream = new CodeSequence(); 'rai'.split('').forEach((key) => stream.key(key)); stream.key(' ');
    expect('nstorm'.split('').some((key) => stream.key(key))).toBe(false);
    'nidx'.split('').forEach((key) => stream.key(key)); stream.key('Backspace');
    expect('aha'.split('').flatMap((key) => stream.key(key) ?? [])).toEqual(['nidaha']);
    expect(easterCode('nahidax')).toBeNull(); expect(setup().game.easterEgg('incorrect')).toBeNull();
  });
  it.each(['A', 'C', 'D', 'E', 'F'] as const)('%s 可召来兰那罗且仍遵循同屏上限与姿态不重复', (stage) => {
    const { game } = setup(stage);
    for (let index = 0; index < 4; index++) game.easterEgg('Aranara');
    const encounters = game.getSnapshot().encounters;
    expect(encounters).toHaveLength(3); expect(new Set(encounters.map((entry) => entry.asset)).size).toBe(3);
  });
  it('B、G 不召兰那罗；G 不降雨、不来访，原型形象可在所有场景来回切换', () => {
    expect(setup('B').game.easterEgg('aranara')).toBeNull();
    const { game } = setup('G');
    for (const code of ['Aranara', 'Rainstorm', 'Nahida']) expect(game.easterEgg(code)).toBeNull();
    expect(game.easterEgg('Nidaha')).toBeTruthy(); expect(game.getSnapshot().nahidaPlaceholder).toBe(true);
    expect(game.easterEgg('NIDAHA')).toBeTruthy(); expect(game.getSnapshot().nahidaPlaceholder).toBe(false);
  });
  it('四十颗额外梦露独立三分钟，已存最多1027、部分收取保留原寿命，设置暂停', () => {
    const { game } = setup('C', { dew: 1026 });
    expect(game.easterEgg('Rainstorm')).toBeTruthy();
    const drops = game.getSnapshot().dewParticles.filter((particle) => particle.kind === 'rainstorm'); expect(drops).toHaveLength(40);
    const drop = drops[0]; game.collectDew(drop.id);
    expect(game.getSnapshot().save.dew).toBe(1027);
    expect(game.getSnapshot().dewParticles.find((particle) => particle.id === drop.id)?.value).toBe(drop.value - 1);
    expect(game.collectDew(drop.id)).toBe(false);
    vi.advanceTimersByTime(100000); game.openPanel('settings'); vi.advanceTimersByTime(200000);
    expect(game.getSnapshot().dewParticles.filter((particle) => particle.kind === 'rainstorm')).toHaveLength(40);
    game.closePanel(); vi.advanceTimersByTime(79999);
    expect(game.getSnapshot().dewParticles.find((particle) => particle.id === drop.id)?.expiring).not.toBe(true);
    vi.advanceTimersByTime(1); expect(game.getSnapshot().dewParticles.find((particle) => particle.id === drop.id)?.expiring).toBe(true);
    vi.advanceTimersByTime(300); expect(game.getSnapshot().dewParticles.filter((particle) => particle.kind === 'rainstorm')).toHaveLength(0);
  });
  it('重复降雨替换当前批次，普通梦露不算入40；重置清理所有临时状态', () => {
    const { game } = setup('C'); game.spawnDew(); const ordinary = game.getSnapshot().dewParticles.filter((particle) => !particle.kind);
    expect(game.easterEgg('rainstorm')).toBeTruthy(); const original = game.getSnapshot().dewParticles.filter((particle) => particle.kind === 'rainstorm').map((particle) => particle.id);
    expect(game.easterEgg('rainstorm')).toBeTruthy();
    const drops = game.getSnapshot().dewParticles; expect(drops.filter((particle) => particle.kind === 'rainstorm')).toHaveLength(40);
    expect(drops.some((particle) => original.includes(particle.id))).toBe(false); expect(drops.filter((particle) => !particle.kind)).toEqual(ordinary);
    game.easterEgg('Nidaha'); game.reset(); expect(game.getSnapshot().dewParticles).toEqual([]); expect(game.getSnapshot().nahidaPlaceholder).toBe(false);
  });
  it('额外来访不占两次自然来访收据，仍演出并赠固定20成长', () => {
    const { game } = setup('C', { completedVisits: ['visit-A', 'visit-B', 'visit-C', 'visit-C-2'], blessedVisits: ['visit-C', 'visit-C-2'] });
    const before = game.getSnapshot().save;
    expect(game.easterEgg('Nahida')).toBeTruthy();
    vi.advanceTimersByTime(25000);
    expect(game.getSnapshot().save.growth).toBeCloseTo(before.growth + 20);
    expect(game.getSnapshot().save.completedVisits).toEqual(before.completedVisits);
    expect(game.getSnapshot().save.blessedVisits).toEqual(before.blessedVisits);
    expect(game.getSnapshot().save.pendingVisits).toEqual(before.pendingVisits);
  });
  it('设置中可以预约来访和兰那罗，关闭后才演出', () => {
    const { game } = setup('C'); game.openPanel('settings');
    expect(game.easterEgg('aranara')).toBeTruthy(); expect(game.easterEgg('nahida')).toBeTruthy();
    expect(game.getSnapshot().companion).toBeNull(); expect(game.getSnapshot().encounters).toHaveLength(0);
    game.closePanel(); expect(game.getSnapshot().companion).not.toBeNull(); expect(game.getSnapshot().encounters).toHaveLength(1);
  });
  it('Past 在内存中复制当前进度，切段、重置、模拟时间不写正式或开发存储', () => {
    const storage = new MemoryStorage(); const clock = new TestClock(OPEN);
    storage.setItem(SAVE_KEYS.player, JSON.stringify(stageFixture('D', OPEN)));
    const formal = new GameController(new TimeGateService(clock), new SaveManager(storage)); games.push(formal);
    const snapshot = formal.getSnapshot().save; const before = storage.getItem(SAVE_KEYS.player);
    const session = new MemoryStorage(); const writes = vi.spyOn(session, 'setItem'); vi.stubGlobal('sessionStorage', session);
    const testing = createTestingSession(snapshot); games.push(testing.game);
    testing.game.restore({ ...stageFixture('G', OPEN), dew: 9 }); testing.clock.set(OPEN + 86400000); testing.game.reset();
    expect(storage.getItem(SAVE_KEYS.player)).toBe(before); expect(formal.getSnapshot().save).toBe(snapshot); expect(writes).not.toHaveBeenCalled();
    expect(testing.game.getSnapshot().save.growth).toBe(0); expect(formal.getSnapshot().save.sceneStage).toBe('D');
  });
});

describe('暴雨位置与惯性停止', () => {
  it.each([{ width: 1440, height: 900, scale: 1 }, { width: 844, height: 390, scale: 220 / 510 }, { width: 568, height: 320, scale: 180 / 510 }])('$width×$height 布置40颗且避开树体、顶部与固定按钮', (viewport) => {
    const drops = placeRainstorm(viewport, [], () => 0.4); expect(drops).toHaveLength(40);
    expect(new Set(drops.map((drop) => JSON.stringify(drop))).size).toBe(40);
    for (const drop of drops) {
      expect(drop.y * viewport.height / 100).toBeGreaterThanOrEqual(100);
      expect(Math.abs(drop.x * viewport.width / 100 - viewport.width / 2)).toBeGreaterThanOrEqual(330 * viewport.scale + 34 - 0.01);
    }
  });
  it('空间完全被遮挡时静默失败，不放到树或按钮上', () => {
    expect(placeRainstorm({ width: 844, height: 390, scale: .43, blocked: [{ left: 0, top: 0, width: 844, height: 390 }] }, [])).toEqual([]);
  });
  it.each([0, 10, 600, 1305, 6250, 30000])('%sms 后沿惯性继续转动再阻尼停到90度的整数倍', (elapsed) => {
    const stop = openingSpinStop(elapsed);
    expect(stop.from).toBeCloseTo(elapsed * OPENING_SPIN.degreesPerSecond / 1000);
    expect(stop.to % 90).toBe(0); expect(stop.to).toBeGreaterThan(stop.from);
    expect(stop.glideMs).toBeGreaterThanOrEqual(0); expect(stop.durationMs).toBeLessThanOrEqual(1300);
    expect(stop.to - stop.from).toBeCloseTo(stop.glideMs / 1000 * OPENING_SPIN.degreesPerSecond + stop.brakingAngle);
  });
});
