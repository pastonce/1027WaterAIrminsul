import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GAME_RULES, SCHEDULE } from '../src/data/schedule';
import { STAGES } from '../src/data/stages';
import { stageVisitIds, visitGrowth } from '../src/data/visits';
import { stageFixture } from '../src/dev/fixtures';
import { GameController } from '../src/game/core/GameController';
import { SaveManager, validateSave } from '../src/game/save/SaveManager';
import { getTreeHeight } from '../src/game/growth/GrowthSystem';
import { TimeGateService } from '../src/game/time/TimeGateService';
import { DREAM_STAGES } from '../src/types/game';
import { startScene, testGame, TestClock } from './support';

const games: GameController[] = [];
beforeEach(() => vi.useFakeTimers());
afterEach(() => { games.splice(0).forEach((game) => game.stop()); expect(vi.getTimerCount()).toBe(0); vi.useRealTimers(); });
function drain(game: GameController) {
  for (let elapsed = 0; elapsed < 90000; elapsed += 50) {
    const state = game.getSnapshot();
    if (state.stageLoading?.phase === 'loading') { game.stageArtworkReady(state.stageLoading.id, state.stageLoading.artId); game.stageSceneReady(state.stageLoading.id, state.stageLoading.to); }
    if (state.mode === 'idle' && !state.event && !state.speech && !state.companion && !state.stageLoading) return;
    vi.advanceTimersByTime(50);
  }
  throw new Error('Presentation did not settle');
}

describe('20点浇灌与51次世界树生长', () => {
  it('不触发来访时52次浇灌按9/8/9/8/8/10分配，只有51次生长，最后7点不再长树', () => {
    const clock = new TestClock(Date.parse(SCHEDULE[5].at));
    const { game } = testGame({ dew: 1027, completedVisits: DREAM_STAGES.flatMap(stageVisitIds), blessedVisits: DREAM_STAGES.flatMap(stageVisitIds) }, clock);
    games.push(game); startScene(game); drain(game);
    const actions = Object.fromEntries(DREAM_STAGES.map((stage) => [stage, 0]));
    let animated = 0;
    for (let index = 0; index < 52; index++) {
      const before = game.getSnapshot(); const stage = before.stage;
      expect(stage).not.toBe('G');
      while (game.getSnapshot().save.dew < GAME_RULES.wateringCost) {
        game.spawnDew(); const drop = game.getSnapshot().dewParticles.find((entry) => !entry.collected && !entry.expiring && !entry.launch);
        if (drop) game.collectDew(drop.id); else vi.advanceTimersByTime(550);
      }
      expect(game.water()).toBe(true);
      actions[stage]++;
      const after = game.getSnapshot();
      expect(after.save.dew).toBeLessThanOrEqual(1027);
      if (index === 51) { expect(before.save.growth).toBe(1020); expect(after.save.growth).toBe(1027); }
      drain(game);
      animated += game.getSnapshot().growthRevision - before.growthRevision;
      if (index === 51) expect(getTreeHeight(after.save.growth)).toBe(getTreeHeight(before.save.growth));
    }
    expect(Object.values(actions)).toEqual([9, 8, 9, 8, 8, 10]);
    expect(animated).toBe(51); expect(game.getSnapshot().stage).toBe('G'); expect(game.getSnapshot().save.endingComplete).toBe(true);
  });

  it.each(['C', 'E'] as const)('%s 在锁日期达到上限，日期开放和刷新均不自动换景，补浇扣20但不生长', (stage) => {
    const date = stage === 'C' ? 0 : 3; const nextDate = stage === 'C' ? 3 : 5;
    const clock = new TestClock(Date.parse(SCHEDULE[date].at)); const cap = STAGES[stage].growth.end;
    const { game, storage } = testGame({ ...stageFixture(stage, clock.now()), growth: cap - 20, dew: 60, completedVisits: DREAM_STAGES.flatMap(stageVisitIds) }, clock);
    games.push(game); startScene(game); drain(game); game.water(); drain(game);
    expect(game.getSnapshot().save.growth).toBe(cap); expect(game.getSnapshot().save.completedStages).not.toContain(stage);
    clock.value = Date.parse(SCHEDULE[nextDate].at); game.tick(); drain(game);
    expect(game.getSnapshot().stage).toBe(stage); game.stop();
    const restored = new GameController(new TimeGateService(clock), new SaveManager(storage), () => .99); games.push(restored); startScene(restored); drain(restored);
    const before = restored.getSnapshot(); expect(before.stage).toBe(stage);
    expect(restored.water()).toBe(true); drain(restored);
    expect(restored.getSnapshot().save.growth).toBe(cap); expect(restored.getSnapshot().growthRevision).toBe(before.growthRevision);
    expect(restored.getSnapshot().save.dew).toBe(before.save.dew - 20); expect(restored.getSnapshot().stage).toBe(DREAM_STAGES[DREAM_STAGES.indexOf(stage) + 1]);
  });

  it('各阶段祝福固定20，保底也不额外补齐，余量与日期截断而不倒扣旧值', () => {
    for (const stage of DREAM_STAGES) {
      expect(visitGrowth(stage, STAGES[stage].growth.start, 1027)).toBe(STAGES[stage].growth.start + 20);
      expect(visitGrowth(stage, STAGES[stage].growth.end - 7, 1027)).toBe(stage === 'F' ? 1020 : STAGES[stage].growth.end);
    }
    expect(visitGrowth('D', 520, 520)).toBe(520);
    expect(visitGrowth('C', 600, 520)).toBe(600);
  });

  it('C由保底祝福补到锁日期上限，开放后仍须补浇且不会重赠或长树', () => {
    const clock = new TestClock(Date.parse(SCHEDULE[0].at));
    const { game } = testGame({ ...stageFixture('C', clock.now()), growth: 480, dew: 40 }, clock);
    games.push(game); startScene(game); drain(game); game.water(); drain(game);
    const capped = game.getSnapshot();
    expect(capped.save.growth).toBe(520); expect(capped.save.blessedVisits).toContain('visit-C'); expect(capped.save.completedStages).not.toContain('C');
    clock.value = Date.parse(SCHEDULE[3].at); game.tick(); drain(game); expect(game.getSnapshot().stage).toBe('C');
    game.water(); drain(game);
    expect(game.getSnapshot().save.growth).toBe(520); expect(game.getSnapshot().growthRevision).toBe(capped.growthRevision);
    expect(game.getSnapshot().stage).toBe('D'); expect(game.getSnapshot().save.dew).toBe(0);
  });

  it('F保底提前到最后一次完整成长之前，祝福至1020后仍由收尾浇灌到1027，不播放第52次生长', () => {
    const clock = new TestClock(Date.parse(SCHEDULE[5].at));
    const { game } = testGame({ ...stageFixture('F', clock.now()), growth: 980, dew: 40 }, clock);
    games.push(game); startScene(game); drain(game);
    game.water(); drain(game);
    const before = game.getSnapshot();
    expect(before.save.growth).toBe(1020); expect(before.save.guaranteedVisits).toContain('visit-F'); expect(before.stage).toBe('F');
    expect(game.water()).toBe(true); expect(game.getSnapshot().save.growth).toBe(1027); drain(game);
    expect(game.getSnapshot().growthRevision).toBe(before.growthRevision); expect(game.getSnapshot().stage).toBe('G');
  });

  it('新存档保存规则版本，13点旧资源不丢失，老阶段收据与1028结局安全迁移', () => {
    const migrated = validateSave({ growth: 314, dew: 13, completedStages: ['A', 'B'], sceneStage: 'C', pendingVisits: ['visit-B'] });
    expect(migrated).toMatchObject({ growth: 340, dew: 13, growthRulesVersion: 2, completedStages: ['A', 'B'], pendingVisits: ['visit-B'] });
    const ending = validateSave({ ...stageFixture('G', 0), growthRulesVersion: undefined, growth: 1028 });
    expect(ending.growth).toBe(1027); expect(ending.endingComplete).toBe(true);
    expect(validateSave({ dew: 5000 }).dew).toBe(1027);
  });
});
