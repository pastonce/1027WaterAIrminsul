import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WakingDirector } from '../src/game/awakening/WakingDirector';
import { WAKING_DURATION_MS, WAKING_REDUCED_MS, WAKING_SEQUENCE, needsWakingReveal } from '../src/game/awakening/choreography';
import { BirthdayDirector, BIRTHDAY_RULES } from '../src/game/awakening/BirthdayDirector';
import { birthdayParticles } from '../src/game/awakening/birthdayParticles';
import { GameController } from '../src/game/core/GameController';
import { SaveManager, validateSave } from '../src/game/save/SaveManager';
import { TimeGateService } from '../src/game/time/TimeGateService';
import { stageFixture } from '../src/dev/fixtures';
import { SCHEDULE } from '../src/data/schedule';
import type { BirthdayPlayback, WakingPlayback } from '../src/types/game';
import { startScene, testGame, TestClock } from './support';

const games: GameController[] = [];
beforeEach(() => vi.useFakeTimers());
afterEach(() => { games.splice(0).forEach((game) => game.stop()); expect(vi.getTimerCount()).toBe(0); vi.useRealTimers(); });
function until(condition: () => boolean, limit = 90000) {
  for (let elapsed = 0; elapsed < limit && !condition(); elapsed++) vi.advanceTimersByTime(1);
  expect(condition()).toBe(true);
}
function setup(stage: 'F' | 'G' = 'G', patch = {}) {
  const clock = new TestClock(Date.parse(SCHEDULE[5].at));
  const context = testGame({ ...stageFixture(stage, clock.now()), ...patch }, clock);
  games.push(context.game); startScene(context.game);
  return context;
}
function finishLoading(game: GameController) {
  until(() => game.getSnapshot().stageLoading?.phase === 'loading');
  const loading = game.getSnapshot().stageLoading!;
  game.stageSceneReady(loading.id, loading.to); game.stageArtworkReady(loading.id, loading.artId);
  until(() => !game.getSnapshot().stageLoading);
}
function reload(context: ReturnType<typeof setup>) {
  context.game.stop();
  const game = new GameController(new TimeGateService(context.clock), new SaveManager(context.storage), () => 0.99);
  games.push(game); startScene(game); return game;
}

describe('梦醒三次睁眼', () => {
  it('只对首次 F→G 启用，完整演出 6000ms 且每次可见范围递增', () => {
    expect(WAKING_DURATION_MS).toBe(6000);
    expect(needsWakingReveal('F', 'G', 'F')).toBe(true);
    expect(needsWakingReveal('F', 'G', 'G')).toBe(false);
    expect(needsWakingReveal('E', 'F')).toBe(false);
    const frames: WakingPlayback[] = []; const completed = vi.fn();
    const director = new WakingDirector((frame) => frames.push(frame), completed);
    director.start(4, false);
    vi.advanceTimersByTime(WAKING_DURATION_MS - 1); expect(completed).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); expect(completed).toHaveBeenCalledTimes(1);
    expect(frames.map((frame) => frame.phase)).toEqual(WAKING_SEQUENCE.map((frame) => frame.phase));
    director.stop();
  });
  it('后台暂停保留当前眼睑阶段与剩余时间', () => {
    let frame: WakingPlayback | undefined; const completed = vi.fn();
    const director = new WakingDirector((value) => { frame = value; }, completed);
    director.start(1, false); vi.advanceTimersByTime(1100); expect(frame?.phase).toBe('first-opening');
    director.setPaused(true); vi.advanceTimersByTime(30000); expect(frame?.phase).toBe('first-opening');
    director.setPaused(false); vi.advanceTimersByTime(199); expect(frame?.phase).toBe('first-opening');
    vi.advanceTimersByTime(1); expect(frame?.phase).toBe('first-hold');
    director.stop(); vi.advanceTimersByTime(10000); expect(completed).not.toHaveBeenCalled();
  });
  it('减少动态直接柔和揭开，中途改偏好也不重播眨眼', () => {
    const update = vi.fn(); const completed = vi.fn(); const director = new WakingDirector(update, completed);
    director.start(1, false); vi.advanceTimersByTime(3000); director.reduce(); director.reduce();
    expect(update.mock.lastCall?.[0]).toMatchObject({ phase: 'final-opening', reduced: true });
    vi.advanceTimersByTime(WAKING_REDUCED_MS); expect(completed).toHaveBeenCalledTimes(1);
    director.start(2, true); vi.advanceTimersByTime(WAKING_REDUCED_MS); expect(completed).toHaveBeenCalledTimes(2); director.stop();
  });
  it('加载交接时先黑屏，完整醒来才记 G 收据、启动对白并开放输入', () => {
    const { game } = setup('F', { growth: 1027, completedStages: ['A', 'B', 'C', 'D', 'E', 'F'] }); finishLoading(game);
    expect(game.getSnapshot()).toMatchObject({ mode: 'waking', waking: { phase: 'black' }, stage: 'G', presentationPaused: true, speech: null });
    expect(game.getSnapshot().save.sceneStage).toBe('F');
    const sequence = game.getSnapshot().save.dialogueSequence;
    game.talk(); game.sendWish(); game.openPanel('settings'); expect(game.water()).toBe(false);
    expect(game.getSnapshot().save.dialogueSequence).toBe(sequence);
    vi.advanceTimersByTime(WAKING_DURATION_MS);
    expect(game.getSnapshot()).toMatchObject({ mode: 'idle', waking: null, presentationPaused: false });
    expect(game.getSnapshot().save.sceneStage).toBe('G'); expect(game.getSnapshot().speech?.anchor).toBe('nahida');
  });
  it('醒来中刷新保留原转场句与成长，重播未完成梦醒而不重复抽句', () => {
    const context = setup('F', { growth: 1027, completedStages: ['A', 'B', 'C', 'D', 'E', 'F'] }); finishLoading(context.game); vi.advanceTimersByTime(3600);
    const before = context.game.getSnapshot().save; const game = reload(context); finishLoading(game);
    expect(game.getSnapshot().mode).toBe('waking');
    expect(game.getSnapshot().save.pendingDialogues.filter((entry) => entry.kind === 'transition')).toEqual(before.pendingDialogues.filter((entry) => entry.kind === 'transition'));
    expect(game.getSnapshot().save.growth).toBe(1027);
    vi.advanceTimersByTime(WAKING_DURATION_MS); expect(game.getSnapshot().save.sceneStage).toBe('G');
  });
  it('既有 G 存档不眨眼，日期撤销与重置清除临时演出', () => {
    const existing = setup(); expect(existing.game.getSnapshot().waking).toBeNull();
    const context = setup('F', { growth: 1027, completedStages: ['A', 'B', 'C', 'D', 'E', 'F'] }); finishLoading(context.game);
    context.clock.value = Date.parse(SCHEDULE[3].at); context.game.tick(); expect(context.game.getSnapshot().waking).toBeNull(); expect(context.game.getSnapshot().stage).not.toBe('G');
    existing.game.sendWish(); existing.game.reset(); expect(existing.game.getSnapshot().birthday).toBeNull();
  });
});

describe('生日送礼与彩带糖果', () => {
  it('每次庆典数量不同，落点 / 延迟 / 方向不排成等距或重复序列', () => {
    const batches = Array.from({ length: 20 }, (_, index) => birthdayParticles(index + 1, false));
    expect(new Set(batches.map((batch) => batch.length)).size).toBeGreaterThan(10);
    const batch = batches[0];
    expect(batch.some((piece, index) => index > 0 && piece.left < batch[index - 1].left)).toBe(true);
    expect(new Set(batch.map((piece) => piece.delay)).size).toBe(batch.length);
    expect(batch.some((piece) => piece.drift < 0)).toBe(true); expect(batch.some((piece) => piece.drift > 0)).toBe(true);
    expect(new Set(batch.map((piece) => piece.duration)).size).toBeGreaterThan(20);
    expect(new Set(batch.map((piece) => piece.size)).size).toBe(batch.length);
  });
  it('随机晚落粒子仍在彩雨结束前退场，手机数量有界且减少动态仅十二片', () => {
    for (let id = 1; id < 100; id++) for (const compact of [false, true]) {
      const batch = birthdayParticles(id, compact);
      expect(batch.length).toBeGreaterThanOrEqual(compact ? 76 : 120); expect(batch.length).toBeLessThanOrEqual(compact ? 108 : 168);
      expect(batch.every((piece) => piece.delay + piece.duration <= BIRTHDAY_RULES.showerMs - 100 + 0.001)).toBe(true);
      expect(batch.every((piece) => piece.duration >= 2700 && piece.duration <= 4200)).toBe(true);
    }
    expect(birthdayParticles(1, true, true)).toHaveLength(12);
  });
  it('同一庆典重排不换随机轨迹，也不消耗对白随机源', () => {
    const random = vi.spyOn(Math, 'random'); random.mockClear();
    expect(birthdayParticles(12, false)).toEqual(birthdayParticles(12, false));
    expect(birthdayParticles(12, false)).not.toEqual(birthdayParticles(13, false));
    expect(random).not.toHaveBeenCalled(); random.mockRestore();
  });
  it('送礼和彩雨共用一个时钟，回复只等剩余时间且结束回调各一次', () => {
    const state: { frame: BirthdayPlayback | null } = { frame: null }; const complete = vi.fn(); const reply = vi.fn();
    const director = new BirthdayDirector((value) => { state.frame = value; });
    director.start(2, 'gifting', false, complete); vi.advanceTimersByTime(1000); expect(director.wait(2, reply)).toBe(true); expect(director.wait(3, vi.fn())).toBe(false);
    director.setPaused(true); vi.advanceTimersByTime(10000); expect(state.frame?.phase).toBe('gifting');
    director.setPaused(false); vi.advanceTimersByTime(BIRTHDAY_RULES.showerMs - 1001); expect(complete).not.toHaveBeenCalled(); expect(reply).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); expect(state.frame).toBeNull(); expect(complete).toHaveBeenCalledTimes(1); expect(reply).toHaveBeenCalledTimes(1); director.stop();
  });
  it('新增十四色更鲜明的彩雨，同次颜色丰富且不消耗对白抽签', () => {
    const colors = new Set(Array.from({ length: 10 }, (_, index) => birthdayParticles(index + 1, false)).flat().map((piece) => piece.color));
    expect(colors.size).toBe(14); expect(new Set(birthdayParticles(1, false).map((piece) => piece.color)).size).toBeGreaterThanOrEqual(10);
  });
  it('用户祝福时同步送礼和彩雨，完成便写收据，不等到用户淡出才开始', () => {
    const { game } = setup(); game.sendWish();
    const pending = game.getSnapshot().save.pendingDialogues.find((entry) => entry.kind === 'wish')!;
    expect(game.getSnapshot().birthday?.phase).toBe('gifting'); expect(game.getSnapshot().speech?.entry.id).toBe(pending.lines[0]);
    game.hoverSpeech(game.getSnapshot().speech!.sequence, true);
    vi.advanceTimersByTime(BIRTHDAY_RULES.showerMs);
    expect(game.getSnapshot().speech?.entry.id).toBe(pending.lines[0]); expect(game.getSnapshot().save.pendingDialogues.find((entry) => entry.id === pending.id)?.cursor).toBe(0);
    expect(game.getSnapshot().birthday).toBeNull(); expect(game.getSnapshot().save.pendingDialogues.find((entry) => entry.id === pending.id)?.celebrationComplete).toBe(true);
    game.hoverSpeech(game.getSnapshot().speech!.sequence, false); until(() => game.getSnapshot().speech?.entry.id === pending.lines[1]);
    expect(game.getSnapshot().birthday).toBeNull();
    expect(game.getSnapshot().save.dialogueSequence).toBe(pending.id);
  });
  it('短用户句先读完时只等当前彩雨余量，不从头再下第二场', () => {
    const { game } = setup('G', { pendingDialogues: [{ id: 1, stage: 'G', kind: 'wish', lines: ['U01', 'N01'], cursor: 0 }] });
    game.setSettings({ textSpeed: 10 });
    const started = Date.now(); until(() => game.getSnapshot().speech === null);
    expect(game.getSnapshot().birthday?.phase).toBe('gifting'); expect(Date.now() - started).toBeLessThan(BIRTHDAY_RULES.showerMs);
    vi.advanceTimersByTime(BIRTHDAY_RULES.showerMs - (Date.now() - started));
    expect(game.getSnapshot().birthday).toBeNull(); expect(game.getSnapshot().speech?.entry.id).toBe('N01');
  });
  it('设置暂停同步彩雨，整个祝福结束后才重新开始二十秒闲置计时', () => {
    const { game } = setup(); game.sendWish();
    vi.advanceTimersByTime(800); game.openPanel('settings'); vi.advanceTimersByTime(60000);
    expect(game.getSnapshot().birthday?.phase).toBe('gifting'); expect(game.getSnapshot().save.pendingDialogues.some((entry) => entry.kind === 'idle')).toBe(false);
    game.closePanel(); vi.advanceTimersByTime(BIRTHDAY_RULES.showerMs - 801); expect(game.getSnapshot().birthday).not.toBeNull();
    vi.advanceTimersByTime(1); expect(game.getSnapshot().birthday).toBeNull();
    until(() => !game.getSnapshot().event); vi.advanceTimersByTime(19999); expect(game.getSnapshot().speech).toBeNull();
    vi.advanceTimersByTime(1); expect(game.getSnapshot().speech?.anchor).toBe('nahida');
  });
  it('同步演出中刷新重播未完部分，已完成后刷新只恢复原句，不重复礼物和彩雨', () => {
    const context = setup(); context.game.sendWish(); vi.advanceTimersByTime(1000);
    const pending = context.game.getSnapshot().save.pendingDialogues.find((entry) => entry.kind === 'wish')!;
    const resumed = reload(context); expect(resumed.getSnapshot().birthday?.phase).toBe('gifting'); resumed.hoverSpeech(resumed.getSnapshot().speech!.sequence, true);
    vi.advanceTimersByTime(BIRTHDAY_RULES.showerMs); expect(resumed.getSnapshot().speech?.entry.id).toBe(pending.lines[0]);
    resumed.stop(); const final = new GameController(new TimeGateService(context.clock), new SaveManager(context.storage), () => 0.99); games.push(final); startScene(final);
    expect(final.getSnapshot().birthday).toBeNull(); expect(final.getSnapshot().speech?.entry.id).toBe(pending.lines[0]);
    expect(final.getSnapshot().save.dialogueSequence).toBe(pending.id);
  });
  it('旧已读用户句 / 未完彩雨存档仍只补彩雨和原回复', () => {
    const { game } = setup('G', { pendingDialogues: [{ id: 1, stage: 'G', kind: 'wish', lines: ['U01', 'N01'], cursor: 1 }] });
    expect(game.getSnapshot().birthday?.phase).toBe('shower'); expect(game.getSnapshot().speech).toBeNull();
    vi.advanceTimersByTime(BIRTHDAY_RULES.showerMs); expect(game.getSnapshot().speech?.entry.id).toBe('N01'); expect(game.getSnapshot().birthday).toBeNull();
  });
  it('取消演出同时清理回复等待，中途减少动态也只回调一次', () => {
    const completed = vi.fn(); const reply = vi.fn(); const director = new BirthdayDirector(vi.fn());
    director.start(1, 'gifting', false, completed); director.wait(1, reply); director.stop(); vi.advanceTimersByTime(10000);
    expect(completed).not.toHaveBeenCalled(); expect(reply).not.toHaveBeenCalled();
    director.start(2, 'gifting', false, completed); director.wait(2, reply); director.reduce(); director.reduce(); vi.advanceTimersByTime(BIRTHDAY_RULES.reducedMs);
    expect(completed).toHaveBeenCalledTimes(1); expect(reply).toHaveBeenCalledTimes(1); director.stop();
  });
  it('分段重新测量不重播送礼，连续点击祝福只保留一份待播', () => {
    const { game } = setup(); game.sendWish(); const original = game.getSnapshot().speech!;
    vi.advanceTimersByTime(1000); const text = original.entry.text;
    if (text.length > 12) game.setSpeechSegments(original.sequence, [text.slice(0, 6), text.slice(6)]);
    game.sendWish(); expect(game.getSnapshot().save.pendingDialogues.filter((entry) => entry.kind === 'wish')).toHaveLength(1);
    vi.advanceTimersByTime(BIRTHDAY_RULES.showerMs - 1000); expect(game.getSnapshot().birthday).toBeNull();
  });
  it('减少动态不落雨，仅 650ms 柔和静态提示后继续原回复', () => {
    const { game } = setup(); game.setSystemReducedMotion(true); game.sendWish();
    expect(game.getSnapshot().birthday?.reduced).toBe(true);
    const pending = game.getSnapshot().save.pendingDialogues.find((entry) => entry.kind === 'wish')!;
    vi.advanceTimersByTime(BIRTHDAY_RULES.reducedMs); expect(game.getSnapshot().birthday).toBeNull(); expect(game.getSnapshot().speech?.anchor).toBe('user');
    until(() => game.getSnapshot().speech?.entry.id === pending.lines[1]); expect(game.getSnapshot().birthday).toBeNull();
  });
  it('只有 wish 能保存严格布尔庆典收据，不能注入其他对白事务', () => {
    const common = { id: 1, stage: 'G', kind: 'wish', lines: ['U01', 'N01'], cursor: 1 };
    expect(validateSave({ pendingDialogues: [{ ...common, celebrationComplete: true }] }).pendingDialogues[0].celebrationComplete).toBe(true);
    expect(validateSave({ pendingDialogues: [{ ...common, celebrationComplete: 'true' }] }).pendingDialogues[0].celebrationComplete).toBeUndefined();
    expect(validateSave({ pendingDialogues: [{ ...common, kind: 'reality', lines: ['G1N'], celebrationComplete: true }] }).pendingDialogues[0].celebrationComplete).toBeUndefined();
  });
});
