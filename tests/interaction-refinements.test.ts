import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GameController } from '../src/game/core/GameController';
import { stageFixture } from '../src/dev/fixtures';
import { SCHEDULE } from '../src/data/schedule';
import { startGame, startScene, testGame, TestClock } from './support';
import { BuildMarker } from '../src/components/BuildMarker';
import { IntroScene } from '../src/scenes/IntroScene';
import { DendroBlessing } from '../src/components/DendroBlessing';
import type { GameSave, StageId } from '../src/types/game';

vi.mock('../src/hooks/useViewportSize', () => ({ useViewportSize: () => ({ width: 1440, height: 900 }) }));

const games: GameController[] = [];
beforeEach(() => vi.useFakeTimers());
afterEach(() => { games.splice(0).forEach((game) => game.stop()); expect(vi.getTimerCount()).toBe(0); vi.useRealTimers(); });
function setup(stage: StageId, patch: Partial<GameSave> = {}) {
  const clock = new TestClock(Date.parse(SCHEDULE.at(-1)!.at));
  const context = testGame({ ...stageFixture(stage, clock.now()), ...patch }, clock);
  games.push(context.game); startGame(context.game); return context;
}

describe('连续点击只保留最新普通对白', () => {
  it('树点击立即替换旧句，清待播且不将打断的句子标读', () => {
    const { game } = setup('A');
    const before = game.getSnapshot().save;
    game.talk(); const first = game.getSnapshot().speech!;
    game.hoverSpeech(first.sequence, true);
    game.talk(); const second = game.getSnapshot().speech!;
    expect(second.sequence).toBeGreaterThan(first.sequence);
    expect(second.entry.id).not.toBe(first.entry.id);
    game.talk(); const third = game.getSnapshot().speech!;
    expect(third.sequence).toBeGreaterThan(second.sequence);
    expect(game.getSnapshot().save.pendingWaterings).toHaveLength(1);
    expect(game.getSnapshot().save.playedDialogues).not.toContain(first.entry.id);
    expect(game.getSnapshot().save.playedDialogues).not.toContain(second.entry.id);
    expect(game.getSnapshot().save.dew).toBe(before.dew);
    expect(game.getSnapshot().save.growth).toBe(before.growth);
    game.hoverSpeech(first.sequence, true); vi.advanceTimersByTime(12000);
    expect(game.getSnapshot().save.playedDialogues).toContain(third.entry.id);
    expect(game.getSnapshot().save.pendingWaterings).toHaveLength(0);
  });

  it('G的普通 / 闲置对白可替换，不积压、不回调旧句或遗留旧表情', () => {
    const { game } = setup('G');
    game.talk(); const first = game.getSnapshot().speech!;
    game.talk(); const second = game.getSnapshot().speech!;
    expect(second.sequence).toBeGreaterThan(first.sequence);
    expect(second.entry.id).not.toBe(first.entry.id);
    game.talk(); const last = game.getSnapshot().speech!;
    expect(game.getSnapshot().save.pendingDialogues.filter((entry) => entry.kind === 'reality')).toHaveLength(1);
    expect(game.getSnapshot().save.playedDialogues).not.toContain(first.entry.id);
    expect(game.getSnapshot().save.playedDialogues).not.toContain(second.entry.id);
    vi.advanceTimersByTime(12000);
    expect(game.getSnapshot().save.playedDialogues).toContain(last.entry.id);
    expect(game.getSnapshot().save.pendingDialogues).toHaveLength(0);
    vi.advanceTimersByTime(8000); const idle = game.getSnapshot().speech!;
    expect(idle).not.toBeNull();
    game.talk(); expect(game.getSnapshot().speech!.sequence).toBeGreaterThan(idle.sequence);
    expect(game.getSnapshot().save.pendingDialogues.filter((entry) => entry.kind === 'idle')).toHaveLength(0);
  });

  it('保护生日祝福整段，仅保留一条祝福后的点击回应', () => {
    const { game } = setup('G'); game.sendWish();
    const speech = game.getSnapshot().speech;
    const event = game.getSnapshot().event;
    for (let count = 0; count < 4; count++) game.talk();
    expect(game.getSnapshot().speech).toEqual(speech);
    expect(game.getSnapshot().event).toEqual(event);
    expect(game.getSnapshot().save.pendingDialogues.filter((entry) => entry.kind === 'wish')).toHaveLength(1);
    expect(game.getSnapshot().save.pendingDialogues.filter((entry) => entry.kind === 'reality')).toHaveLength(1);
  });

  it('阶段固定句与来访不被点击取消，后续树回应不排长队', () => {
    const { game } = setup('C', { pendingDialogues: [{ id: 1, stage: 'C', from: 'B', kind: 'transition', lines: ['C1Z'], cursor: 0 }] });
    const fixed = game.getSnapshot().speech;
    for (let count = 0; count < 4; count++) game.talk();
    expect(game.getSnapshot().speech).toEqual(fixed);
    expect(game.getSnapshot().save.pendingWaterings).toHaveLength(1);
    game.stop();
    const context = testGame({ ...stageFixture('C', Date.parse(SCHEDULE[5].at)), pendingVisits: ['visit-C'], visitLines: { 'visit-C': { dialogueId: 'C1N', read: false } } }, new TestClock(Date.parse(SCHEDULE[5].at)));
    games.push(context.game); startScene(context.game);
    for (let elapsed = 0; elapsed < 20000 && context.game.getSnapshot().event?.type !== 'visit'; elapsed += 100) vi.advanceTimersByTime(100);
    const visit = context.game.getSnapshot().event;
    expect(visit?.type).toBe('visit');
    for (let count = 0; count < 4; count++) context.game.talk();
    expect(context.game.getSnapshot().event).toEqual(visit);
    expect(context.game.getSnapshot().save.pendingWaterings).toHaveLength(1);
  });
});

describe('测试标记与祝福取景', () => {
  it('仅实际测试会话显示标记，普通首屏不显示', () => {
    expect(renderToStaticMarkup(createElement(BuildMarker))).toBe('');
    expect(renderToStaticMarkup(createElement(BuildMarker, { testing: true }))).toContain('开发测试中');
    expect(renderToStaticMarkup(createElement(IntroScene, { onEnter: vi.fn() }))).not.toContain('开发测试中');
    expect(renderToStaticMarkup(createElement(IntroScene, { onEnter: vi.fn(), testing: true }))).toContain('开发测试中');
  });

  it.each(['A', 'B', 'C', 'D', 'E', 'F'] as const)('%s手机只缩放指定四阶段完整图案，桌面保持原尺度', (stage) => {
    const props = { stage, width: 844, height: 390, scale: .43, root: 310, treeHeight: 300, growth: 300, character: { left: 80, top: 120, width: 120, height: 160 }, phase: 'channel' as const, paused: false, reduced: false };
    const compact = renderToStaticMarkup(createElement(DendroBlessing, props));
    expect(compact).toContain(`class="blessing-effect-scale" transform="scale(${['A', 'B', 'C', 'D'].includes(stage) ? .72 : 1})"`);
    expect(compact.match(/class="blessing-pattern-piece"/g)).toHaveLength(16);
    const desktop = renderToStaticMarkup(createElement(DendroBlessing, { ...props, width: 1440, height: 900, scale: 1 }));
    expect(desktop).toContain('class="blessing-effect-scale" transform="scale(1)"');
  });
});
