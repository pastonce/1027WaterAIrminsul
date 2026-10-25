import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { testGame } from './support';
import type { GameController } from '../src/game/core/GameController';

const games: GameController[] = [];
function startGame(dew = 0) {
  const { game } = testGame({ dew }); games.push(game); game.start(); game.spawnDew(); return game;
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => { games.splice(0).forEach((game) => game.stop()); expect(vi.getTimerCount()).toBe(0); vi.useRealTimers(); });

describe('每颗梦露的活动时间寿命', () => {
  it('五秒前可收，五秒后淡出且不能收，淡出结束删除但不改变资源', () => {
    const game = startGame(); const original = game.getSnapshot().dewParticles[0];
    vi.advanceTimersByTime(4999); expect(game.getSnapshot().dewParticles.find((particle) => particle.id === original.id)?.expiring).not.toBe(true);
    vi.advanceTimersByTime(1); expect(game.getSnapshot().dewParticles.find((particle) => particle.id === original.id)?.expiring).toBe(true);
    expect(game.collectDew(original.id)).toBe(false);
    vi.advanceTimersByTime(300); expect(game.getSnapshot().dewParticles.some((particle) => particle.id === original.id)).toBe(false);
    expect(game.getSnapshot().save.dew).toBe(0);
  });

  it('每颗独立计时，新的生成和其他收集不延长旧梦露寿命', () => {
    const game = startGame(); const first = game.getSnapshot().dewParticles[0].id;
    vi.advanceTimersByTime(3000); game.spawnDew();
    const latest = game.getSnapshot().dewParticles.at(-1)!;
    game.collectDew(game.getSnapshot().dewParticles[1].id);
    vi.advanceTimersByTime(2000);
    expect(game.getSnapshot().dewParticles.find((particle) => particle.id === first)?.expiring).toBe(true);
    expect(game.getSnapshot().dewParticles.find((particle) => particle.id === latest.id)?.expiring).not.toBe(true);
  });

  it('到期前收取撤销过期回调，收集只结算一次', () => {
    const game = startGame(); const id = game.getSnapshot().dewParticles[0].id;
    vi.advanceTimersByTime(4999); expect(game.collectDew(id)).toBe(true);
    expect(game.collectDew(id)).toBe(false); vi.advanceTimersByTime(1);
    expect(game.getSnapshot().dewParticles.find((particle) => particle.id === id)?.expiring).not.toBe(true);
    vi.advanceTimersByTime(500); expect(game.getSnapshot().dewParticles.some((particle) => particle.id === id)).toBe(false);
    expect(game.getSnapshot().save.dew).toBe(6);
  });

  it.each(['settings', 'journal', 'background'] as const)('%s 暂停剩余寿命，返回后继续而非重新计算五秒', (pause) => {
    const game = startGame(); const id = game.getSnapshot().dewParticles[0].id;
    vi.advanceTimersByTime(3000);
    if (pause === 'background') game.setSuspended(true); else game.openPanel(pause);
    vi.advanceTimersByTime(60000); expect(game.getSnapshot().dewParticles.find((particle) => particle.id === id)?.expiring).not.toBe(true);
    if (pause === 'background') game.setSuspended(false); else game.closePanel();
    vi.advanceTimersByTime(1999); expect(game.getSnapshot().dewParticles.find((particle) => particle.id === id)?.expiring).not.toBe(true);
    vi.advanceTimersByTime(1); expect(game.getSnapshot().dewParticles.find((particle) => particle.id === id)?.expiring).toBe(true);
  });

  it('盛满的失败点击不加资源也不延长寿命，淡出后新梦露继续生成', () => {
    const game = startGame(1027); const id = game.getSnapshot().dewParticles[0].id;
    vi.advanceTimersByTime(4000); expect(game.collectDew(id)).toBe(false);
    vi.advanceTimersByTime(1300); expect(game.getSnapshot().dewParticles.some((particle) => particle.id === id)).toBe(false);
    vi.advanceTimersByTime(2000); expect(game.getSnapshot().dewParticles.some((particle) => !particle.expiring)).toBe(true);
    expect(game.getSnapshot().save.dew).toBe(1027);
  });

  it('窗口重排不重置寿命，重置与停止清理所有到期回调', () => {
    const game = startGame(); const id = game.getSnapshot().dewParticles[0].id;
    vi.advanceTimersByTime(3000); game.setDewViewport({ width: 844, height: 390, scale: 220 / 510 });
    vi.advanceTimersByTime(2000); expect(game.getSnapshot().dewParticles.find((particle) => particle.id === id)?.expiring).toBe(true);
    game.reset(); vi.advanceTimersByTime(10000); expect(game.getSnapshot().dewParticles).toEqual([]);
    game.enterDream(); game.spawnDew(); game.stop(); expect(vi.getTimerCount()).toBe(0);
  });
});
