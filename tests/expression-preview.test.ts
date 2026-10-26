import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { testGame, startGame } from './support';
import { stageFixture } from '../src/dev/fixtures';
import { TREE_EXPRESSIONS } from '../src/data/expressions';
import { SCHEDULE } from '../src/data/schedule';
import { GameController } from '../src/game/core/GameController';

const games: GameController[] = [];
beforeEach(() => vi.useFakeTimers());
afterEach(() => { games.splice(0).forEach((game) => game.stop()); expect(vi.getTimerCount()).toBe(0); vi.useRealTimers(); });

describe('开发表情预览复用原临时播放器', () => {
  it('随机使用当前阶段候选，指定编号0有效，不消耗资源或写入存档', () => {
    const { game, storage } = testGame({ growth: 100 }); games.push(game); startGame(game);
    const before = new Map(storage.values); const save = game.getSnapshot().save;
    expect(game.previewExpression()).toBe(true); expect(TREE_EXPRESSIONS.A).toContain(game.getSnapshot().expression?.asset);
    expect(game.previewExpression(0)).toBe(true); expect(game.getSnapshot().expression?.asset).toBe(0);
    expect(game.getSnapshot().expression?.anchor).toBe('tree');
    expect(game.getSnapshot().save).toEqual(save); expect(storage.values).toEqual(before);
    const id = game.getSnapshot().expression!.id; game.expressionReady(id); game.openPanel('settings');
    vi.advanceTimersByTime(10000); expect(game.getSnapshot().expression?.id).toBe(id);
    game.closePanel(); vi.advanceTimersByTime(2800); expect(game.getSnapshot().expression).toBeNull();
  });

  it('不绕过种植、对白、面板、开放权限或非法编号', () => {
    const { game, clock } = testGame({ seedPlanted: false }); games.push(game); startGame(game);
    expect(game.previewExpression(2)).toBe(false);
    game.restore({ ...game.getSnapshot().save, seedPlanted: true }); game.sceneEntranceReady('A');
    expect(game.previewExpression(2)).toBe(false);
    vi.advanceTimersByTime(20000); expect(game.previewExpression(12)).toBe(false); expect(game.previewExpression(NaN)).toBe(false);
    game.openPanel('settings'); expect(game.previewExpression(2)).toBe(false); game.closePanel();
    clock.value = Date.parse(SCHEDULE[0].at) - 1; game.tick(); expect(game.previewExpression(2)).toBe(false);
  });

  it('G预览落在纳西妲头部，换景清理且不修改祝福 / 来访收据', () => {
    const { game, clock } = testGame(); games.push(game); startGame(game);
    clock.value = Date.parse(SCHEDULE[5].at); game.restore(stageFixture('G', clock.now()));
    const before = game.getSnapshot().save;
    expect(game.previewExpression(7)).toBe(true); expect(game.getSnapshot().expression?.anchor).toBe('nahida');
    expect(game.getSnapshot().save).toEqual(before);
    game.restore(stageFixture('C', clock.now())); expect(game.getSnapshot().expression).toBeNull();
  });
});
