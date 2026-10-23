import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FirstVisitNotice, FIRST_NOTICE_KEY } from '../src/game/notice/firstVisit';
import { createBirthdaySession } from '../src/game/secrets/birthdaySession';
import { createSave } from '../src/game/save/SaveManager';
import { SpeechDirector } from '../src/game/dialogue/SpeechDirector';
import { PRESENTATION_RULES } from '../src/data/presentation';
import { STAGES } from '../src/data/stages';
import { SCHEDULE } from '../src/data/schedule';
import { WAKING_DURATION_MS } from '../src/game/awakening/choreography';
import { stageFixture } from '../src/dev/fixtures';
import { startGame, startScene, testGame, TestClock, MemoryStorage } from './support';
import type { GameController } from '../src/game/core/GameController';
import type { SpeechPlayback } from '../src/types/game';

const games: GameController[] = [];
beforeEach(() => vi.useFakeTimers());
afterEach(() => { games.splice(0).forEach((game) => game.stop()); expect(vi.getTimerCount()).toBe(0); vi.useRealTimers(); });
function until(condition: () => boolean, limit = 60000) { for (let elapsed = 0; elapsed < limit && !condition(); elapsed += 10) vi.advanceTimersByTime(10); expect(condition()).toBe(true); }

describe('首次加载完成后的公告收据', () => {
  it('实际显示前不写收据，显示一次后刷新与进度重置不再自动弹出', () => {
    const storage = new MemoryStorage(); const notice = new FirstVisitNotice(storage);
    expect(notice.pending).toBe(true); expect(storage.getItem(FIRST_NOTICE_KEY)).toBeNull();
    notice.shown(); expect(storage.getItem(FIRST_NOTICE_KEY)).toBe('1'); notice.shown();
    storage.setItem('irminsul.player.v2', JSON.stringify(createSave())); expect(new FirstVisitNotice(storage).pending).toBe(false);
  });
  it('不接受无效收据，存储不可用时本页仍只展示一次而不抛异常', () => {
    const storage = new MemoryStorage(); storage.setItem(FIRST_NOTICE_KEY, 'false'); expect(new FirstVisitNotice(storage).pending).toBe(true);
    for (const target of [null, { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => {} }]) {
      const notice = new FirstVisitNotice(target); expect(notice.pending).toBe(true); expect(() => notice.shown()).not.toThrow(); expect(notice.pending).toBe(false);
    }
  });
});

describe('最新浇灌替换树回应', () => {
  it('打断不会将未读句记为已读或调用旧完成回调，旧悬停不能锁住新句', () => {
    let playback: SpeechPlayback | null = null; const read = vi.fn(); const finished = vi.fn();
    const director = new SpeechDirector({ options: () => ({ textSpeed: 35, reducedMotion: false }), speech: (value) => { playback = value; }, companion: vi.fn(), read });
    director.start([{ id: 'old', text: '旧句还没有说完。', speaker: '树' }], 'tree', finished);
    const sequence = (playback as SpeechPlayback | null)!.sequence; director.setHovered(sequence, true); expect(director.interruptTree()).toBe(true);
    vi.advanceTimersByTime(10000); expect(read).not.toHaveBeenCalled(); expect(finished).not.toHaveBeenCalled(); expect(playback).toBeNull();
    director.start([{ id: 'new', text: '新句。', speaker: '树' }], 'tree', finished); director.setHovered(sequence, true);
    vi.advanceTimersByTime(10000); expect(read).toHaveBeenCalledOnce(); expect(finished).toHaveBeenCalledOnce(); director.stop();
  });
  it('保留已经完成祝福后的角色停留，不因树对白替换让角色突然消失', () => {
    const companion = vi.fn(); const finished = vi.fn();
    const director = new SpeechDirector({ options: () => ({ textSpeed: 35, reducedMotion: true }), speech: vi.fn(), companion, read: vi.fn() }, () => 1);
    director.start([{ id: 'visit', text: '你好。', speaker: '纳西妲' }], 'nahida', finished, true);
    vi.advanceTimersByTime(PRESENTATION_RULES.arrivalMs + PRESENTATION_RULES.minimumHoldMs + PRESENTATION_RULES.fadeMs);
    expect(finished).toHaveBeenCalledOnce(); expect(director.canVisit).toBe(false);
    director.start([{ id: 'tree', text: '树的回应。', speaker: '树' }], 'tree', vi.fn()); expect(director.interruptTree()).toBe(true);
    expect(director.canVisit).toBe(false); expect(companion.mock.lastCall?.[0]).toBe('observe');
    vi.advanceTimersByTime(PRESENTATION_RULES.lingerMaxMs + PRESENTATION_RULES.leaveMs); expect(director.canVisit).toBe(true); director.stop();
  });
  it('梦露不足不打断当前句，日期锁定满额的免费浇灌也能替换回应', () => {
    const ordinary = testGame({ dew: 0 }); games.push(ordinary.game); startGame(ordinary.game); ordinary.game.talk();
    const speech = ordinary.game.getSnapshot().speech; expect(ordinary.game.water()).toBe(false); expect(ordinary.game.getSnapshot().speech).toEqual(speech);
    const capped = testGame({ ...stageFixture('C', ordinary.clock.now()), growth: STAGES.C.growth.end, dew: 9, completedVisits: ['visit-C', 'visit-C-2'] }); games.push(capped.game); startGame(capped.game);
    capped.game.water(); const first = capped.game.getSnapshot().speech!.sequence; vi.advanceTimersByTime(600); capped.game.water();
    expect(capped.game.getSnapshot().speech!.sequence).toBeGreaterThan(first); expect(capped.game.getSnapshot().save.pendingWaterings).toHaveLength(1); expect(capped.game.getSnapshot().save.dew).toBe(9);
  });
  it('阶段固定对白不被浇灌打断，后续仅保留一条待播树回应', () => {
    const clock = new TestClock(Date.parse(SCHEDULE[5].at)); const context = testGame({ ...stageFixture('C', clock.now()), pendingDialogues: [{ id: 1, stage: 'C', from: 'B', kind: 'transition', lines: ['C1Z'], cursor: 0 }] }, clock); games.push(context.game); startScene(context.game);
    const speech = context.game.getSnapshot().speech; expect(speech?.entry.id).toBe('C1Z'); context.game.water();
    expect(context.game.getSnapshot().speech).toEqual(speech); expect(context.game.getSnapshot().save.pendingWaterings).toHaveLength(1);
  });
  it('纳西妲对白与祝福保留，不让普通浇灌覆盖来访事务', () => {
    const clock = new TestClock(Date.parse(SCHEDULE[5].at)); const { game } = testGame({ ...stageFixture('C', clock.now()), pendingVisits: ['visit-C'], visitLines: { 'visit-C': { dialogueId: 'C1N', read: false } } }, clock); games.push(game); startScene(game);
    until(() => game.getSnapshot().speech?.entry.id === 'C1N'); const speech = game.getSnapshot().speech; expect(game.water()).toBe(true);
    expect(game.getSnapshot().speech).toEqual(speech); expect(game.getSnapshot().event?.id).toBe('visit-C');
    until(() => game.getSnapshot().save.blessedVisits.includes('visit-C')); expect(game.getSnapshot().save.blessedVisits.filter((id) => id === 'visit-C')).toHaveLength(1);
  });
});

describe('Birthday 的本页梦醒预览', () => {
  it.each(['A', 'C', 'G'] as const)('从 %s 进入统一 FG 加载，不改原进度、设置或时钟', (stage) => {
    const clock = new TestClock(Date.parse('2026-10-24T10:27:00+08:00')); const original = testGame(stageFixture(stage, clock.now()), clock); games.push(original.game);
    const before = [...original.storage.values]; const save = JSON.stringify(original.game.getSnapshot().save); const now = clock.now();
    const preview = createBirthdaySession(original.game.getSnapshot().save); games.push(preview.game);
    expect(preview.game.getSnapshot()).toMatchObject({ mode: 'loading', stageLoading: { from: 'F', to: 'G', phase: 'cover' } });
    preview.game.start(); vi.advanceTimersByTime(120); const loading = preview.game.getSnapshot().stageLoading!;
    preview.game.stageSceneReady(loading.id, 'G'); preview.game.stageArtworkReady(loading.id, loading.artId); until(() => preview.game.getSnapshot().mode === 'waking');
    preview.game.setSuspended(true); vi.advanceTimersByTime(10000); expect(preview.game.getSnapshot().waking?.phase).toBe('black');
    preview.game.setSuspended(false); vi.advanceTimersByTime(WAKING_DURATION_MS); expect(preview.game.getSnapshot()).toMatchObject({ stage: 'G', mode: 'idle', waking: null });
    preview.game.sendWish(); preview.game.reset(); expect([...original.storage.values]).toEqual(before); expect(JSON.stringify(original.game.getSnapshot().save)).toBe(save); expect(clock.now()).toBe(now);
  });
  it('缩短对白阅读停留但保留淡出，三次睁眼仍有完整六秒演出', () => {
    expect(PRESENTATION_RULES.minimumHoldMs).toBe(1400); expect(PRESENTATION_RULES.segmentHoldMs).toBe(750); expect(PRESENTATION_RULES.fadeMs).toBe(450); expect(WAKING_DURATION_MS).toBe(6000);
  });
});
