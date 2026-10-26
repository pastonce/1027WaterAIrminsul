import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameController } from '../src/game/core/GameController';
import { SaveManager } from '../src/game/save/SaveManager';
import { TimeGateService } from '../src/game/time/TimeGateService';
import { SCHEDULE } from '../src/data/schedule';
import { STAGES } from '../src/data/stages';
import { stageFixture } from '../src/dev/fixtures';
import { startGame, testGame, TestClock } from './support';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

function advanceUntil(condition: () => boolean, maximum = 120000, renderer?: GameController) {
  for (let elapsed = 0; elapsed < maximum && !condition(); elapsed += 500) {
    const loading = renderer?.getSnapshot().stageLoading;
    if (loading?.phase === 'loading' && renderer) { renderer.stageArtworkReady(loading.id, loading.artId); renderer.stageSceneReady(loading.id, loading.to); }
    vi.advanceTimersByTime(500);
  }
  expect(condition()).toBe(true);
}

function finishLoading(game: GameController) {
  advanceUntil(() => game.getSnapshot().stageLoading?.phase === 'loading');
  const loading = game.getSnapshot().stageLoading!;
  game.stageSceneReady(loading.id, loading.to);
  game.stageArtworkReady(loading.id, loading.artId);
  advanceUntil(() => game.getSnapshot().stageLoading === null);
}

function fillDew(game: GameController) {
  vi.advanceTimersByTime(600);
  for (let attempt = 0; attempt < 10 && game.getSnapshot().save.dew < 20; attempt++) {
    game.spawnDew();
    const particle = game.getSnapshot().dewParticles.find((entry) => !entry.collected && !entry.expiring && !entry.launch);
    if (!particle) { vi.advanceTimersByTime(300); continue; }
    game.collectDew(particle.id);
  }
  expect(game.getSnapshot().save.dew).toBeGreaterThanOrEqual(20);
}

describe('持续交互与自动对白', () => {
  it.each([100, 700])('浇灌演出 %s ms 时设置可打开，跨面板暂停并正确续播，不重复扣费', (elapsed) => {
    const { game } = testGame({ dew: 20 }); startGame(game); expect(game.water()).toBe(true);
    vi.advanceTimersByTime(elapsed); const mode = game.getSnapshot().mode; const growth = game.getSnapshot().save.growth;
    game.openPanel('settings'); expect(game.getSnapshot().mode).toBe('settings');
    vi.advanceTimersByTime(5000); expect(game.getSnapshot().mode).toBe('settings');
    game.openPanel('journal'); vi.advanceTimersByTime(5000); expect(game.getSnapshot().mode).toBe('journal');
    game.closePanel(); expect(game.getSnapshot().mode).toBe(mode); vi.advanceTimersByTime(1400 - elapsed);
    expect(game.getSnapshot().mode).toBe('idle'); expect(game.getSnapshot().save.growth).toBe(growth); expect(game.getSnapshot().save.dew).toBe(0); game.stop();
  });
  it('设置中重置不恢复旧浇灌计时或资源事务', () => {
    const { game } = testGame({ dew: 20 }); startGame(game); game.water(); game.openPanel('settings'); game.reset();
    vi.advanceTimersByTime(10000); expect(game.getSnapshot().mode).toBe('intro'); expect(game.getSnapshot().save.growth).toBe(0); game.stop();
  });
  it.each(['A', 'B', 'C', 'D', 'E', 'F'] as const)('每次浇灌从 %s 的常态对白池抽选，历史阅读不代替抽签轮次', (stage) => {
    const clock = new TestClock(Date.parse(SCHEDULE[5].at));
    const fixture = stageFixture(stage, clock.now());
    const { game } = testGame({ ...fixture, playedDialogues: [...fixture.playedDialogues, STAGES[stage].transition.id, ...STAGES[stage].dialogue.map((entry) => entry.id)] }, clock);
    startGame(game); expect(game.water()).toBe(true); vi.advanceTimersByTime(1400);
    expect(game.getSnapshot().speech?.entry).toEqual(STAGES[stage].dialogue.at(-1));
    expect(game.getSnapshot().event?.type).toBe('watering');
    advanceUntil(() => game.getSnapshot().event === null);
    expect(game.getSnapshot().save.pendingWaterings).toEqual([]); game.stop();
  });

  it('连续浇灌立即打断旧树对白，只保留最新回应', () => {
    const { game } = testGame({ dew: 20 }); startGame(game); game.talk();
    const original = game.getSnapshot().speech!.sequence;
    game.water(); const first = game.getSnapshot().speech!.sequence; expect(first).toBeGreaterThan(original);
    vi.advanceTimersByTime(1400); fillDew(game); game.water();
    expect(game.getSnapshot().save.pendingWaterings).toHaveLength(1);
    expect(game.getSnapshot().speech!.sequence).toBeGreaterThan(first);
    expect(game.getSnapshot().speech!.entry.id).toBe(game.getSnapshot().save.pendingWaterings[0].dialogueId);
    advanceUntil(() => game.getSnapshot().mode === 'idle' && game.getSnapshot().event === null && game.getSnapshot().speech === null);
    expect(game.getSnapshot().save.pendingWaterings).toEqual([]); game.stop();
  });

  it('浇灌后立刻刷新会恢复已经抽选的对白，不再次扣费或重新随机', () => {
    const { game, clock, storage } = testGame({ dew: 20 }); startGame(game); game.water();
    const pending = game.getSnapshot().save.pendingWaterings[0]; game.stop();
    const restored = new GameController(new TimeGateService(clock), new SaveManager(storage), () => 0); startGame(restored);
    expect(restored.getSnapshot().speech?.entry.id).toBe(pending.dialogueId);
    expect(restored.getSnapshot().save.growth).toBe(20); expect(restored.getSnapshot().save.dew).toBe(0);
    advanceUntil(() => restored.getSnapshot().event === null); expect(restored.getSnapshot().save.pendingWaterings).toEqual([]); restored.stop();
  });

  it('到达时间上限的免费观赏浇灌也播放树的随机对白', () => {
    const { game } = testGame({ ...stageFixture('C', new TestClock().now()), growth: STAGES.C.growth.end, dew: 9, completedVisits: ['visit-C', 'visit-C-2'] }); startGame(game);
    expect(game.water()).toBe(false); vi.advanceTimersByTime(600);
    expect(game.getSnapshot().speech?.entry.id).toMatch(/^C\d+$/);
    expect(game.getSnapshot().save.dew).toBe(9); expect(game.getSnapshot().save.growth).toBe(STAGES.C.growth.end); game.stop();
  });

  it('正式开放前不进入养成或播放对白，心跳不绕过入梦门控', () => {
    const clock = new TestClock(Date.parse(SCHEDULE[0].at) - 60000); const { game } = testGame({}, clock); startGame(game);
    expect(game.water()).toBe(false); vi.advanceTimersByTime(1600);
    expect(game.getSnapshot().mode).toBe('intro'); expect(game.getSnapshot().speech).toBeNull(); expect(game.getSnapshot().save.growth).toBe(0); expect(game.getSnapshot().save.dew).toBe(0); game.stop();
  });

  it('连续点击只扣一次费、增加一次成长', () => {
    const { game } = testGame({ dew: 20 }); startGame(game);
    expect(game.water()).toBe(true); expect(game.water()).toBe(false); expect(game.water()).toBe(false);
    expect(game.getSnapshot().save.growth).toBe(20); expect(game.getSnapshot().save.dew).toBe(0);
    vi.advanceTimersByTime(1400); expect(game.getSnapshot().mode).toBe('idle'); game.stop();
  });

  it('动画中刷新不重复扣费或增长', () => {
    const { game, clock, storage } = testGame({ dew: 20 }); startGame(game); game.water(); game.stop();
    const restored = new GameController(new TimeGateService(clock), new SaveManager(storage), () => 0.99); startGame(restored);
    expect(restored.getSnapshot().save.growth).toBe(20); expect(restored.getSnapshot().save.dew).toBe(0); expect(restored.getSnapshot().mode).toBe('idle'); restored.stop();
  });

  it('资源不足与满额收取只触发计数反馈，不弹出文字或扣费', () => {
    const { game } = testGame(); startGame(game);
    expect(game.water()).toBe(false); expect(game.getSnapshot().dewFeedback).toBe('insufficient'); expect(game.getSnapshot().dewFeedbackRevision).toBe(1);
    game.water(); expect(game.getSnapshot().dewFeedbackRevision).toBe(2); expect(game.getSnapshot().message).toBe('');
    expect(game.getSnapshot().save.pendingWaterings).toEqual([]); expect(game.getSnapshot().speech).toBeNull();
    fillDew(game); expect(game.getSnapshot().dewFeedback).toBeNull(); game.restore({ ...game.getSnapshot().save, dew: 1027 }); game.spawnDew();
    const particle = game.getSnapshot().dewParticles.find((entry) => !entry.collected)!;
    expect(game.collectDew(particle.id)).toBe(false); expect(game.getSnapshot().dewFeedback).toBe('full');
    expect(game.getSnapshot().save.dew).toBe(1027); expect(game.getSnapshot().message).toBe('');
    expect(game.water()).toBe(true); expect(game.getSnapshot().dewFeedback).toBeNull(); game.stop();
  });

  it('同一颗梦露不能重复收集，存储最多 1027', () => {
    const { game } = testGame({ dew: 1026 }); startGame(game); game.spawnDew();
    const particle = game.getSnapshot().dewParticles[0];
    expect(game.collectDew(particle.id)).toBe(true); expect(game.collectDew(particle.id)).toBe(false); expect(game.getSnapshot().save.dew).toBe(1027); game.stop();
  });

  it('对白自动播放并消失，重复点击立即改播新句', () => {
    const { game } = testGame(); startGame(game); game.talk();
    const speech = game.getSnapshot().speech!;
    expect(speech.anchor).toBe('tree'); expect(game.getSnapshot().mode).toBe('idle');
    vi.advanceTimersByTime(500); game.talk(); const replacement = game.getSnapshot().speech!;
    expect(replacement.sequence).toBeGreaterThan(speech.sequence);
    advanceUntil(() => game.getSnapshot().speech === null);
    expect(game.getSnapshot().save.playedDialogues).not.toContain(speech.entry.id);
    expect(game.getSnapshot().save.playedDialogues).toContain(replacement.entry.id); expect(game.getSnapshot().mode).toBe('idle'); game.stop();
  });

  it('对白期间仍能收露、浇灌，资源可以在生长动画中继续收集', () => {
    const { game } = testGame({ dew: 20 }); startGame(game); game.talk();
    expect(game.water()).toBe(true); expect(game.getSnapshot().speech).not.toBeNull(); game.spawnDew();
    expect(game.collectDew(game.getSnapshot().dewParticles[0].id)).toBe(true);
    expect(game.getSnapshot().save.dew).toBe(6); expect(game.getSnapshot().save.growth).toBe(20); game.stop();
  });

  it('设置与手记暂停计时，关闭后接着播放而非提前消失', () => {
    const { game } = testGame(); startGame(game); game.talk(); vi.advanceTimersByTime(500);
    const id = game.getSnapshot().speech!.entry.id; game.openPanel('settings');
    const elapsed = game.getSnapshot().speech!.elapsedMs;
    expect(game.getSnapshot().presentationPaused).toBe(true); vi.advanceTimersByTime(60000);
    expect(game.getSnapshot().save.playedDialogues).not.toContain(id); expect(game.getSnapshot().speech!.elapsedMs).toBe(elapsed);
    game.closePanel(); expect(game.getSnapshot().presentationPaused).toBe(false);
    advanceUntil(() => game.getSnapshot().speech === null); expect(game.getSnapshot().save.playedDialogues).toContain(id); game.stop();
  });

  it('修改语速后完整重播当前句，关闭设置后正常结束', () => {
    const { game } = testGame(); startGame(game); game.talk(); vi.advanceTimersByTime(600); game.openPanel('settings');
    const sequence = game.getSnapshot().speech!.sequence;
    game.setSettings({ textSpeed: 100 }); expect(game.getSnapshot().speech!.sequence).toBeGreaterThan(sequence);
    vi.advanceTimersByTime(10000); expect(game.getSnapshot().speech).not.toBeNull();
    game.closePanel(); advanceUntil(() => game.getSnapshot().speech === null); game.stop();
  });

  it('页面隐藏暂停来访对白和梦露交互，回到前台继续', () => {
    const { game } = testGame(); startGame(game); game.requestVisit(); vi.advanceTimersByTime(1000); game.spawnDew();
    const particle = game.getSnapshot().dewParticles[0]; game.setSuspended(true); vi.advanceTimersByTime(60000);
    expect(game.getSnapshot().save.completedVisits).toEqual([]); expect(game.collectDew(particle.id)).toBe(false);
    game.setSuspended(false); advanceUntil(() => game.getSnapshot().save.completedVisits.includes('visit-A')); game.stop();
  });

  it('面板暂停梦露收集与浇灌，同屏数量有上限', () => {
    const { game } = testGame(); startGame(game);
    game.setDewViewport({ width: 1440, height: 900, scale: 1 });
    for (let index = 0; index < 20; index++) game.spawnDew();
    expect(game.getSnapshot().dewParticles).toHaveLength(7); game.openPanel('journal');
    expect(game.collectDew(game.getSnapshot().dewParticles[0].id)).toBe(false); expect(game.water()).toBe(false);
    vi.advanceTimersByTime(10000); expect(game.getSnapshot().dewParticles).toHaveLength(7); game.stop();
  });
});

describe('自动阶段衔接与来访持久化', () => {
  it('有已展示场景收据的旧存档不会补造此前未预约的转场对白', () => {
    const clock = new TestClock(Date.parse(SCHEDULE[3].at));
    const { game } = testGame({ ...stageFixture('D', clock.now()), playedDialogues: [] }, clock); startGame(game);
    expect(game.getSnapshot().speech).toBeNull(); expect(game.getSnapshot().stage).toBe('D');
    advanceUntil(() => game.getSnapshot().event === null);
    expect(game.getSnapshot().save.playedDialogues.filter((id) => /^[A-F]\dZ$/.test(id))).toEqual([]);
    expect(game.getSnapshot().save.growth).toBe(STAGES.D.growth.start); game.stop();
  });

  it('跨越阶段上限后先加载，再播放目标阶段转场池的一句', () => {
    const clock = new TestClock(Date.parse(SCHEDULE[1].at));
    const { game } = testGame({ growth: 160, dew: 20, completedVisits: ['visit-A', 'visit-A-2'] }, clock); startGame(game);
    expect(game.getSnapshot().speech).toBeNull(); game.water(); vi.advanceTimersByTime(1400);
    expect(game.getSnapshot().stage).toBe('A'); expect(game.getSnapshot().speech?.entry.id).toMatch(/^A\d+$/);
    finishLoading(game); expect(game.getSnapshot().stage).toBe('B');
    expect(game.getSnapshot().speech?.entry.id).toBe('B3Z'); expect(game.getSnapshot().mode).toBe('idle');
    advanceUntil(() => game.getSnapshot().event === null); game.tick();
    expect(game.getSnapshot().speech).toBeNull(); expect(game.getSnapshot().save.playedDialogues).toContain('B3Z'); game.stop();
  });

  it('恰好上限时日期解锁不自行换景，补浇不增长后才有转场对白', () => {
    const { game, clock } = testGame({ growth: 180, dew: 20, completedVisits: ['visit-A', 'visit-A-2'] }); startGame(game);
    expect(game.getSnapshot().speech).toBeNull(); clock.value = Date.parse(SCHEDULE[1].at); game.tick();
    expect(game.getSnapshot().speech).toBeNull(); expect(game.getSnapshot().stageLoading).toBeNull();
    game.water(); finishLoading(game); expect(game.getSnapshot().speech?.entry.id).toBe('B3Z');
    advanceUntil(() => game.getSnapshot().event === null); game.tick(); expect(game.getSnapshot().speech).toBeNull(); game.stop();
  });

  it('普通阶段等气泡和来访结束后自动加载，无确认按钮；等待期间仍可收露', () => {
    const clock = new TestClock(Date.parse(SCHEDULE[1].at));
    const { game } = testGame({ growth: 160, dew: 20, completedVisits: ['visit-A', 'visit-A-2'], playedDialogues: ['milestone-A'] }, clock); startGame(game); game.water(); vi.advanceTimersByTime(1400);
    expect(game.getSnapshot().stage).toBe('A'); expect(game.getSnapshot().mode).toBe('idle'); expect(game.getSnapshot().save.completedStages).toContain('A');
    expect(game.getSnapshot().event?.type).toBe('watering'); fillDew(game);
    expect(game.water()).toBe(false); expect(game.getSnapshot().save.growth).toBe(180);
    advanceUntil(() => game.getSnapshot().stageLoading !== null); finishLoading(game);
    expect(game.water()).toBe(true); expect(game.getSnapshot().save.growth).toBe(200); game.stop();
  });

  it('成长到时间上限后免费观赏浇灌，日期开放后需补浇换景', () => {
    const { game, clock } = testGame({ ...stageFixture('C', new TestClock().now()), growth: STAGES.C.growth.end, dew: 20, completedVisits: ['visit-C', 'visit-C-2'] }); startGame(game);
    expect(game.getSnapshot().stage).toBe('C'); expect(game.getSnapshot().save.completedStages).not.toContain('C');
    expect(game.water()).toBe(false); expect(game.getSnapshot().message).toBe(''); vi.advanceTimersByTime(600);
    clock.value = Date.parse(SCHEDULE[3].at) - 1; game.tick(); expect(game.getSnapshot().stage).toBe('C');
    clock.value += 1; vi.advanceTimersByTime(1000); expect(game.getSnapshot().stage).toBe('C'); expect(game.getSnapshot().mode).toBe('idle');
    expect(game.getSnapshot().stageLoading).toBeNull(); game.water(); finishLoading(game); expect(game.getSnapshot().stage).toBe('D'); game.stop();
  });

  it('倒数第二次浇灌保底来访，自动祝福和离开，不锁住主交互', () => {
    const { game } = testGame({ growth: 140, dew: 20, wateringCounts: { A: 15 } }); startGame(game); game.water(); vi.advanceTimersByTime(1400);
    expect(game.getSnapshot().save.pendingWaterings).toEqual([]);
    advanceUntil(() => game.getSnapshot().event?.id === 'visit-A');
    expect(game.getSnapshot().event?.id).toBe('visit-A'); expect(game.getSnapshot().companion).toBe('arrive'); expect(game.getSnapshot().mode).toBe('idle');
    vi.advanceTimersByTime(700); expect(game.getSnapshot().companion).toBe('observe'); expect(game.getSnapshot().speech?.anchor).toBe('nahida');
    advanceUntil(() => game.getSnapshot().save.completedVisits.includes('visit-A'));
    expect(game.getSnapshot().companion).toBe('observe'); advanceUntil(() => game.getSnapshot().companion === null);
    expect(game.getSnapshot().companion).toBeNull(); expect(game.getSnapshot().speech).toBeNull(); game.tick(); expect(game.getSnapshot().event).toBeNull(); game.stop();
  });

  it('跨过边界后刷新，旧段落的未完成来访仍会恢复', () => {
    const clock = new TestClock(Date.parse(SCHEDULE[1].at));
    const { game, storage } = testGame({ growth: 211, pendingVisits: ['visit-A'], playedDialogues: ['milestone-A', 'milestone-B'] }, clock); startGame(game);
    expect(game.getSnapshot().stage).toBe('A'); expect(game.getSnapshot().event?.id).toBe('visit-A'); game.stop();
    const restored = new GameController(new TimeGateService(clock), new SaveManager(storage)); startGame(restored);
    expect(restored.getSnapshot().event?.id).toBe('visit-A'); advanceUntil(() => restored.getSnapshot().save.completedVisits.includes('visit-A')); expect(restored.getSnapshot().save.completedVisits).not.toContain('visit-A-2');
    advanceUntil(() => restored.getSnapshot().stageLoading !== null); finishLoading(restored); advanceUntil(() => restored.getSnapshot().event === null); restored.stop();
    const completed = new GameController(new TimeGateService(clock), new SaveManager(storage)); startGame(completed); expect(completed.getSnapshot().stage).toBe('B'); expect(completed.getSnapshot().event).toBeNull(); completed.stop();
  });

  it('早期随机 / 手动触发来访的资格会保存，刷新不丢失', () => {
    const { game, clock, storage } = testGame(); startGame(game); game.requestVisit();
    expect(game.getSnapshot().save.pendingVisits).toEqual(['visit-A']); game.stop();
    const restored = new GameController(new TimeGateService(clock), new SaveManager(storage)); startGame(restored); expect(restored.getSnapshot().event?.id).toBe('visit-A');
    advanceUntil(() => restored.getSnapshot().save.completedVisits.includes('visit-A')); expect(restored.getSnapshot().save.pendingVisits).toEqual([]); restored.stop();
  });

  it('晚间没有额外事件或完成收据，G 继续正常聊天', () => {
    const clock = new TestClock(Date.parse('2026-10-27T22:26:00+08:00'));
    const { game } = testGame(stageFixture('G', clock.now()), clock); startGame(game);
    clock.value += 60000; game.tick(); expect(game.getSnapshot().event).toBeNull(); expect(game.getSnapshot().effects).not.toContain('moon');
    game.talk(); expect(game.getSnapshot().speech?.entry.id).toMatch(/^G\dN$/); expect(game.getSnapshot().save.nightComplete).toBe(false); game.stop();
  });

  it('旧夜间待播仅保留存档兼容，不再播放或阻塞 G 的祝福', () => {
    const clock = new TestClock(Date.parse(SCHEDULE[5].at));
    const legacy = { id: 88, stage: 'G' as const, kind: 'night' as const, lines: ['G1N'], cursor: 0 };
    const { game } = testGame({ ...stageFixture('G', clock.now()), pendingDialogues: [legacy] }, clock); startGame(game);
    expect(game.getSnapshot().speech).toBeNull(); expect(game.getSnapshot().save.pendingDialogues).toContainEqual(legacy);
    game.sendWish(); expect(game.getSnapshot().speech?.entry.id).toMatch(/^U/); expect(game.getSnapshot().save.nightComplete).toBe(false); game.stop();
  });

  it('回访梦境不改写已通关进度，返回现实后可以继续聊天', () => {
    const clock = new TestClock(Date.parse(SCHEDULE[5].at)); const { game } = testGame(stageFixture('G', clock.now()), clock); startGame(game); game.review('F');
    expect(game.getSnapshot().reviewStage).toBe('F'); expect(game.water()).toBe(false); expect(game.getSnapshot().save.growth).toBe(1027);
    game.talk(); expect(game.getSnapshot().speech?.entry.id).toMatch(/^F\d+$/); game.review(null);
    expect(game.getSnapshot().stage).toBe('G'); expect(game.getSnapshot().speech).toBeNull(); game.talk(); expect(game.getSnapshot().speech?.anchor).toBe('nahida'); game.stop();
  });

  it('10 月 27 日新玩家可连续 A→G，所有来访与对白自动完成', () => {
    const clock = new TestClock(Date.parse(SCHEDULE[5].at)); const { game, storage } = testGame({}, clock);
    const observed = new Set<string>(['A']); game.subscribe(() => observed.add(game.getSnapshot().stage)); startGame(game);
    for (let iteration = 0; iteration < 120 && game.getSnapshot().stage !== 'G'; iteration++) {
      advanceUntil(() => game.getSnapshot().mode === 'idle' && game.getSnapshot().event === null && game.getSnapshot().speech === null && game.getSnapshot().companion === null && game.getSnapshot().stageLoading === null, 120000, game);
      if (game.getSnapshot().stage === 'G') break;
      fillDew(game); game.water(); vi.advanceTimersByTime(1400);
    }
    advanceUntil(() => game.getSnapshot().stage === 'G' && game.getSnapshot().stageLoading === null && game.getSnapshot().waking === null, 600000, game);
    advanceUntil(() => game.getSnapshot().speech === null);
    expect([...observed]).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
    expect(game.getSnapshot().save.completedVisits).toHaveLength(6); expect(game.getSnapshot().save.completedStages).toHaveLength(6); expect(game.getSnapshot().save.growth).toBe(1027); game.stop();
    const restored = new GameController(new TimeGateService(clock), new SaveManager(storage)); startGame(restored); expect(restored.getSnapshot().stage).toBe('G'); expect(restored.getSnapshot().event).toBeNull(); restored.stop();
  });
});

describe('恢复、清理与辅助交互', () => {
  it('口令只影响外观，不改变成长、资源和时间', () => {
    const { game } = testGame(); startGame(game); game.openPanel('journal'); game.secret('月亮');
    expect(game.getSnapshot().effects).toContain('moon'); expect(game.getSnapshot().save.growth).toBe(0); expect(game.getSnapshot().save.dew).toBe(0);
    game.secret('花神诞祭'); expect(game.getSnapshot().effects).not.toContain('petals'); game.stop();
  });

  it('重置会撤销旧气泡、来访与计时器，不污染新存档', () => {
    const { game } = testGame(); startGame(game); game.requestVisit(); vi.advanceTimersByTime(1000); game.reset(); vi.advanceTimersByTime(30000);
    expect(game.getSnapshot().mode).toBe('intro'); expect(game.getSnapshot().companion).toBeNull(); expect(game.getSnapshot().speech).toBeNull();
    expect(game.getSnapshot().save.completedVisits).toEqual([]); expect(game.getSnapshot().save.playedDialogues).toEqual([]); game.stop(); expect(vi.getTimerCount()).toBe(0);
  });

  it('停止时清除来访、气泡和养成的全部定时器', () => {
    const { game } = testGame({ dew: 20 }); startGame(game); game.requestVisit(); game.water(); game.stop(); expect(vi.getTimerCount()).toBe(0);
  });

  it('所有正式成长数值仍集中于配置，最终时间锁不会被自动推进跳过', () => {
    const clock = new TestClock(Date.parse(SCHEDULE[4].at)); const { game } = testGame({ ...stageFixture('E', clock.now()), growth: STAGES.E.growth.end }, clock); startGame(game);
    vi.advanceTimersByTime(60000); expect(game.getSnapshot().stage).toBe('E'); expect(game.getSnapshot().save.endingComplete).toBe(false); expect(game.getSnapshot().growth).toBe(STAGES.E.growth.end); game.stop();
  });
});
