import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GameController } from '../src/game/core/GameController';
import { StageLoadingDirector } from '../src/game/loading/StageLoadingDirector';
import { StageLoadingScreen } from '../src/components/StageLoadingScreen';
import { LOADING_COLORS, STAGE_LOADING_ART, STAGE_LOADING_RULES } from '../src/data/stageLoading';
import { STAGES } from '../src/data/stages';
import { SCHEDULE } from '../src/data/schedule';
import { dialogueTiming, PRESENTATION_RULES } from '../src/data/presentation';
import { SaveManager, validateSave } from '../src/game/save/SaveManager';
import { TimeGateService } from '../src/game/time/TimeGateService';
import { stageFixture } from '../src/dev/fixtures';
import type { StageLoading } from '../src/types/game';
import { startScene, startGame, TestClock, testGame } from './support';

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

function until(condition: () => boolean, maximum = 120000) {
  for (let elapsed = 0; elapsed < maximum && !condition(); elapsed += 50) vi.advanceTimersByTime(50);
  expect(condition()).toBe(true);
}

function atBoundary() {
  return testGame({ growth: 211, completedVisits: ['visit-A', 'visit-A-2'] }, new TestClock(Date.parse(SCHEDULE[1].at)));
}

function ready(game: GameController) {
  until(() => game.getSnapshot().stageLoading?.phase === 'loading');
  const loading = game.getSnapshot().stageLoading!;
  game.stageSceneReady(loading.id, loading.to);
  game.stageArtworkReady(loading.id, loading.artId);
  until(() => game.getSnapshot().stageLoading === null);
}

describe('对白后才覆盖、切换及持久化', () => {
  it('日期与成长必须同时满足；设备日期不能替代服务器权限', () => {
    const closed = testGame({ growth: 210, completedVisits: ['visit-A', 'visit-A-2'] });
    startScene(closed.game); vi.advanceTimersByTime(90000); expect(closed.game.getSnapshot().stageLoading).toBeNull(); closed.game.stop();
    const insufficient = testGame({ growth: 197 }, new TestClock(Date.parse(SCHEDULE[1].at)));
    startScene(insufficient.game); vi.advanceTimersByTime(90000); expect(insufficient.game.getSnapshot().stage).toBe('A'); expect(insufficient.game.getSnapshot().stageLoading).toBeNull(); insufficient.game.stop();
    class PermissionClock extends TestClock { permissionNow() { return Date.parse(SCHEDULE[0].at); } }
    const unconfirmed = testGame({ growth: 210, completedVisits: ['visit-A', 'visit-A-2'] }, new PermissionClock(Date.parse(SCHEDULE[5].at)));
    startScene(unconfirmed.game); vi.advanceTimersByTime(90000); expect(unconfirmed.game.getSnapshot().stageLoading).toBeNull(); unconfirmed.game.stop();
  });

  it('旧景对白连淡出结束后才覆盖，真实新景就绪才播目标阶段转场对白', () => {
    const { game } = atBoundary(); startScene(game);
    expect(game.getSnapshot().speech?.entry.id).toBe('R01');
    const timing = dialogueTiming(game.getSnapshot().speech!.entry, 35, false);
    vi.advanceTimersByTime(timing.durationMs + PRESENTATION_RULES.fadeMs - 1);
    expect(game.getSnapshot().speech?.phase).toBe('fading'); expect(game.getSnapshot().stageLoading).toBeNull(); expect(game.getSnapshot().stage).toBe('A');
    vi.advanceTimersByTime(1); expect(game.getSnapshot().stageLoading?.phase).toBe('cover'); expect(game.getSnapshot().stage).toBe('A');
    vi.advanceTimersByTime(STAGE_LOADING_RULES.coverMs - 1); expect(game.getSnapshot().stage).toBe('A');
    vi.advanceTimersByTime(1); const loading = game.getSnapshot().stageLoading!;
    expect(game.getSnapshot().stage).toBe('B'); expect(game.getSnapshot().save.sceneStage).toBe('A'); expect(game.water()).toBe(false);
    game.stageSceneReady(loading.id - 1, 'B'); game.stageSceneReady(loading.id, 'A');
    vi.advanceTimersByTime(30000); expect(game.getSnapshot().stageLoading?.progress).toBeLessThan(1); expect(game.getSnapshot().presentationPaused).toBe(true);
    game.stageSceneReady(loading.id, 'B'); vi.advanceTimersByTime(10000); expect(game.getSnapshot().stageLoading).not.toBeNull();
    game.stageArtworkReady(loading.id - 1, loading.artId); game.stageArtworkReady(loading.id, 'FG1'); vi.advanceTimersByTime(5000); expect(game.getSnapshot().stageLoading).not.toBeNull();
    game.stageArtworkReady(loading.id, loading.artId); until(() => game.getSnapshot().stageLoading === null);
    expect(game.getSnapshot().save.sceneStage).toBe('B'); expect(game.getSnapshot().speech?.entry.id).toBe('B3Z'); expect(game.getSnapshot().mode).toBe('idle'); expect(game.getSnapshot().presentationPaused).toBe(false); game.stop(); expect(vi.getTimerCount()).toBe(0);
  });

  it('纳西妲补满不附加树回应，下一浇跨上限后才加载和播放转场句', () => {
    const { game } = testGame({ growth: 195, dew: 13, wateringCounts: { A: 15 } }, new TestClock(Date.parse(SCHEDULE[1].at)));
    startGame(game); game.water(); until(() => game.getSnapshot().blessing?.phase === 'channel');
    vi.advanceTimersByTime(PRESENTATION_RULES.blessingTravelMs);
    expect(game.getSnapshot().save.growth).toBe(210); expect(game.getSnapshot().stage).toBe('A'); expect(game.getSnapshot().stageLoading).toBeNull();
    until(() => game.getSnapshot().save.completedVisits.includes('visit-A') && game.getSnapshot().companion === null);
    expect(game.getSnapshot().save.pendingWaterings).toEqual([]); expect(game.getSnapshot().save.completedVisits).toContain('visit-A');
    expect(game.getSnapshot().stageLoading).toBeNull(); expect(game.getSnapshot().speech).toBeNull();
    for (let attempt = 0; attempt < 10 && game.getSnapshot().save.dew < 13; attempt++) { game.spawnDew(); const particle = game.getSnapshot().dewParticles.find((entry) => !entry.collected && !entry.expiring); if (particle) game.collectDew(particle.id); }
    expect(game.water()).toBe(true); ready(game); expect(game.getSnapshot().speech?.entry.id).toBe('B3Z'); game.stop();
  });

  it('已满时日期解锁仍等正在播放的树对白结束，不弹确认按钮', () => {
    const { game, clock } = testGame({ growth: 210, dew: 13, completedVisits: ['visit-A', 'visit-A-2'] }); startGame(game); game.talk();
    const line = game.getSnapshot().speech!.entry.id; clock.value = Date.parse(SCHEDULE[1].at); game.tick(); game.water();
    expect(game.getSnapshot().speech?.entry.id).toBe(line); expect(game.getSnapshot().stageLoading).toBeNull(); expect(game.getSnapshot().stage).toBe('A');
    until(() => game.getSnapshot().stageLoading !== null); expect(game.getSnapshot().save.playedDialogues).toContain(line); ready(game); game.stop();
  });

  it('加载中刷新保留旧场景收据，重启不会重扣费、重赠或丢失转场', () => {
    const { game, clock, storage } = atBoundary(); startGame(game); until(() => game.getSnapshot().stageLoading?.phase === 'loading');
    expect(game.getSnapshot().save.sceneStage).toBe('A'); game.stop();
    const restored = new GameController(new TimeGateService(clock), new SaveManager(storage), () => 0.99); startGame(restored);
    expect(restored.getSnapshot().stage).toBe('A'); expect(restored.getSnapshot().stageLoading?.phase).toBe('cover'); expect(restored.getSnapshot().speech).toBeNull();
    ready(restored); expect(restored.getSnapshot().save.growth).toBe(211); expect(restored.getSnapshot().save.dew).toBe(0); restored.stop();
    const completed = new GameController(new TimeGateService(clock), new SaveManager(storage)); startScene(completed);
    expect(completed.getSnapshot().stage).toBe('B'); expect(completed.getSnapshot().stageLoading).toBeNull(); completed.stop();
  });

  it('后台暂停覆盖 / 进度 / 解锁；权限撤回、重置和退出撤销旧回调', () => {
    const { game, clock } = atBoundary(); startGame(game); until(() => game.getSnapshot().stageLoading !== null);
    game.setSuspended(true); const paused = game.getSnapshot().stageLoading; vi.advanceTimersByTime(60000);
    expect(game.getSnapshot().stageLoading).toEqual(paused); expect(game.getSnapshot().stage).toBe('A');
    game.setSuspended(false); until(() => game.getSnapshot().stageLoading?.phase === 'loading'); const id = game.getSnapshot().stageLoading!.id;
    game.setSuspended(true); game.stageSceneReady(id, 'B'); const progress = game.getSnapshot().stageLoading!.progress; vi.advanceTimersByTime(60000); expect(game.getSnapshot().stageLoading!.progress).toBe(progress);
    clock.value = Date.parse(SCHEDULE[0].at) - 1; game.tick(); expect(game.getSnapshot().stageLoading).toBeNull(); expect(game.getSnapshot().stage).toBe('A');
    game.stageSceneReady(id, 'B'); game.setSuspended(false); vi.advanceTimersByTime(5000); expect(game.getSnapshot().save.sceneStage).toBe('A');
    clock.value = Date.parse(SCHEDULE[1].at); game.tick(); game.sceneEntranceReady('A'); until(() => game.getSnapshot().stageLoading !== null); game.reset(); vi.advanceTimersByTime(30000);
    expect(game.getSnapshot().mode).toBe('intro'); expect(game.getSnapshot().stageLoading).toBeNull(); game.stop(); expect(vi.getTimerCount()).toBe(0);
  });

  it('最终梦醒也先覆盖再进入现实，G 入场对白在加载结束后播放', () => {
    const clock = new TestClock(Date.parse(SCHEDULE[5].at));
    const fixture = stageFixture('F', clock.now());
    const { game } = testGame({ ...fixture, growth: 1028, completedVisits: [...fixture.completedVisits, 'visit-F', 'visit-F-2'], playedDialogues: [...fixture.playedDialogues, STAGES.F.transition.id] }, clock);
    startGame(game); until(() => game.getSnapshot().stageLoading !== null);
    expect(game.getSnapshot().stage).toBe('F'); expect(game.getSnapshot().stageLoading?.to).toBe('G'); expect(game.getSnapshot().speech).toBeNull();
    ready(game); expect(game.getSnapshot().mode).toBe('waking'); until(() => game.getSnapshot().waking === null); expect(game.getSnapshot().stage).toBe('G'); expect(game.getSnapshot().speech?.entry.id).toBe('G6N'); game.stop();
  });

  it('场景收据兼容旧 v2，非法值不会新增权限', () => {
    expect(validateSave({ sceneStage: 'unknown' }).sceneStage).toBeUndefined(); expect(validateSave({ sceneStage: 'D' }).sceneStage).toBe('D');
    const { game } = testGame({ ...stageFixture('G', 0) }); expect(game.getSnapshot().stage).toBe('C'); game.stop();
  });

  it('开场覆盖期间校时可恢复曾展示的场景，不重放已经完成的阶段', () => {
    const { game, clock } = testGame(stageFixture('G', 0));
    game.setSuspended(true); startScene(game); expect(game.getSnapshot().stage).toBe('C');
    clock.value = Date.parse(SCHEDULE[5].at); game.tick();
    expect(game.getSnapshot().stage).toBe('G'); expect(game.getSnapshot().stageLoading).toBeNull();
    game.setSuspended(false); vi.advanceTimersByTime(10000); expect(game.getSnapshot().stageLoading).toBeNull(); game.stop();
  });

  it('开场之后校时恢复已有收据使用一次遮挡，不丢失更后面的历史场景', () => {
    const { game, clock } = testGame(stageFixture('G', 0)); startGame(game);
    clock.value = Date.parse(SCHEDULE[4].at); game.tick();
    expect(game.getSnapshot().stageLoading?.to).toBe('E'); ready(game);
    expect(game.getSnapshot().stage).toBe('E'); expect(game.getSnapshot().save.sceneStage).toBe('G');
    clock.value = Date.parse(SCHEDULE[5].at); game.tick();
    until(() => game.getSnapshot().stageLoading?.to === 'G'); ready(game); expect(game.getSnapshot().stage).toBe('G'); game.stop();
  });
});

describe('非匀速七元素加载', () => {
  it('增量与间隔均不匀速，长等待不满额；就绪后才完成且可暂停', () => {
    const updates: Array<Pick<StageLoading, 'phase' | 'progress'>> = []; const covered = vi.fn(); const completed = vi.fn();
    const director = new StageLoadingDirector((patch) => updates.push(patch), covered, completed, () => 0.5);
    director.start(false); vi.advanceTimersByTime(120); expect(covered).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(100); expect(updates.at(-1)!.progress).toBeCloseTo(0.12);
    vi.advanceTimersByTime(649); expect(updates.at(-1)!.progress).toBeCloseTo(0.12);
    vi.advanceTimersByTime(1); expect(updates.at(-1)!.progress).toBeCloseTo(0.41); const count = updates.length;
    vi.advanceTimersByTime(819); expect(updates).toHaveLength(count); vi.advanceTimersByTime(1); expect(updates.at(-1)!.progress).toBeCloseTo(0.435);
    vi.advanceTimersByTime(30000); expect(updates.at(-1)!.progress).toBe(STAGE_LOADING_RULES.lastMidpoint); expect(completed).not.toHaveBeenCalled();
    const lastUpdates = updates.filter((entry) => entry.progress >= 6 / 7); expect(lastUpdates).toHaveLength(1);
    director.setPaused(true); director.sceneReady(); const snapshot = updates.slice(); vi.advanceTimersByTime(60000); expect(updates).toEqual(snapshot);
    director.setPaused(false); until(() => completed.mock.calls.length > 0); expect(updates.at(-1)).toEqual({ phase: 'revealing', progress: 1 });
    expect(updates.every((entry, index) => index === 0 || entry.progress >= updates[index - 1].progress)).toBe(true); director.stop(); expect(vi.getTimerCount()).toBe(0);
  });

  it('背景提早就绪也只在末元素正中停顿一次，暂停不会消耗这次长停顿', () => {
    const updates: Array<Pick<StageLoading, 'phase' | 'progress'>> = []; const completed = vi.fn();
    const director = new StageLoadingDirector((patch) => updates.push(patch), () => {}, completed, () => 0.5);
    director.start(false); vi.advanceTimersByTime(STAGE_LOADING_RULES.coverMs); director.sceneReady();
    for (let attempt = 0; attempt < 20 && updates.at(-1)?.progress !== STAGE_LOADING_RULES.lastMidpoint; attempt++) vi.advanceTimersToNextTimer();
    expect(updates.at(-1)?.progress).toBe(STAGE_LOADING_RULES.lastMidpoint);
    vi.advanceTimersByTime(400); const count = updates.length;
    director.setPaused(true); vi.advanceTimersByTime(30000); expect(updates).toHaveLength(count);
    director.setPaused(false); vi.advanceTimersByTime(STAGE_LOADING_RULES.lastPauseMs - 401); expect(updates).toHaveLength(count);
    vi.advanceTimersByTime(1); expect(updates.at(-1)!.progress).toBe(1);
    expect(updates.filter((entry) => entry.progress >= 6 / 7 && entry.progress < 1).map((entry) => entry.progress)).toEqual([STAGE_LOADING_RULES.lastMidpoint]);
    vi.advanceTimersByTime(STAGE_LOADING_RULES.fullMs); expect(updates.at(-1)!.phase).toBe('revealing');
    vi.advanceTimersByTime(STAGE_LOADING_RULES.revealMs); expect(completed).toHaveBeenCalledOnce(); director.stop(); expect(vi.getTimerCount()).toBe(0);
  });

  it('七种指定颜色按原顺序，本地亮度遮罩不染黑边；六次换景各使用对应图片组', () => {
    expect(LOADING_COLORS).toEqual(['#EC4923', '#498FCC', '#359697', '#6957C2', '#66AD16', '#35AACC', '#CC9046']);
    expect(Object.keys(STAGE_LOADING_ART)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G']); expect(Object.values(STAGE_LOADING_ART).map((entries) => entries.length)).toEqual([0, 2, 2, 2, 2, 2, 1]);
    const markup = renderToStaticMarkup(createElement(StageLoadingScreen, { loading: { id: 1, from: 'A', to: 'B', phase: 'loading', progress: 0.5 }, paused: false, reduced: false, portrait: false }));
    expect(markup).toContain('mask-type:luminance'); expect(markup).toContain('width="512"'); expect(markup).toContain('梦境正在展开');
    for (const color of LOADING_COLORS) expect(markup).toContain(color);
    const original = readFileSync('asserts/reference-supplements/loading/seven-elements.webp');
    expect(original.equals(readFileSync('public/asserts/loading/seven-elements.webp'))).toBe(true);
    expect(createHash('sha256').update(original).digest('hex')).toBe('7f68bbea38f5fed758c29074f60470c117eeaa185c58f6cf774d7816cafcf65d');
    expect(markup).not.toContain('https://'); expect(markup).not.toContain('<button');
    expect(readFileSync('src/styles/loading.css', 'utf8')).not.toContain('transition:width');
  });
});
