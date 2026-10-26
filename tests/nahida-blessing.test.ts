import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STAGES } from '../src/data/stages';
import { SCHEDULE } from '../src/data/schedule';
import { PRESENTATION_RULES } from '../src/data/presentation';
import { stageVisitIds, visitGrowth, VISIT_EMITTERS, VISIT_PLACEMENTS } from '../src/data/visits';
import { VISIT_FORMS } from '../src/data/inhabitants';
import { GameController } from '../src/game/core/GameController';
import { SaveManager, SAVE_KEYS, createSave, validateSave } from '../src/game/save/SaveManager';
import { TimeGateService } from '../src/game/time/TimeGateService';
import { dreamLayout } from '../src/game/camera/sceneLayout';
import { stageFixture } from '../src/dev/fixtures';
import type { GameSave } from '../src/types/game';
import { startScene, MemoryStorage, TestClock } from './support';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { DENDRO_ICON } from '../src/data/assets';
import { DendroBlessing } from '../src/components/DendroBlessing';

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

function setup(patch: Partial<GameSave> = {}, initialRoll = 0.99, clock = new TestClock()) {
  const storage = new MemoryStorage();
  storage.setItem(SAVE_KEYS.player, JSON.stringify({ ...createSave(clock.now()), introSeen: true, seedPlanted: true, dew: 20, ...patch }));
  let roll = initialRoll;
  const game = new GameController(new TimeGateService(clock), new SaveManager(storage), () => roll);
  startScene(game);
  return { game, storage, clock, roll: (value: number) => { roll = value; } };
}

function until(condition: () => boolean) {
  for (let elapsed = 0; elapsed < 120000 && !condition(); elapsed += 100) vi.advanceTimersByTime(100);
  expect(condition()).toBe(true);
}

describe('13%抽选、单次保底与两次上限', () => {
  it.each([0, 0.129999, 0.13, 0.99])('随机值 %s 严格按 0.13 分界，不使用第三 / 第六次保底', (roll) => {
    const { game } = setup({ growth: 26, wateringCounts: { A: 2 } }, roll);
    game.water(); expect(game.getSnapshot().save.pendingVisits).toHaveLength(roll < 0.13 ? 1 : 0); game.stop();
  });

  it('倒数第二浇保底仅一次，E 剩余20由固定祝福补满，不再第二次保底', () => {
    const clock = new TestClock(Date.parse(SCHEDULE[4].at));
    const fixture = stageFixture('E', clock.now());
    const { game } = setup({ ...fixture, growth: STAGES.E.growth.end - 40, wateringCounts: { E: 6 }, playedDialogues: [...fixture.playedDialogues, STAGES.E.transition.id] }, 0.99, clock);
    expect(game.getSnapshot().save.pendingVisits).toEqual([]); game.water();
    expect(game.getSnapshot().save.growth).toBe(STAGES.E.growth.end - 20); expect(game.getSnapshot().save.guaranteedVisits).toEqual(['visit-E']);
    until(() => game.getSnapshot().save.completedVisits.includes('visit-E'));
    expect(game.getSnapshot().save.growth).toBe(STAGES.E.growth.end); expect(game.getSnapshot().save.dew).toBe(0);
    vi.advanceTimersByTime(30000); expect(game.getSnapshot().save.completedVisits.filter((id) => id.startsWith('visit-E'))).toEqual(['visit-E']); game.stop();
  });

  it('已来访一次不会在边界补第二次，旧满额存档也不自行发起首访', () => {
    const { game } = setup({ ...stageFixture('C', 0), growth: STAGES.C.growth.end, completedVisits: ['visit-C'] }); vi.advanceTimersByTime(60000);
    expect(game.getSnapshot().save.pendingVisits).toEqual([]); expect(game.getSnapshot().save.completedVisits).toEqual(['visit-C']); game.stop();
    const legacy = setup({ ...stageFixture('C', 0), growth: STAGES.C.growth.end }); expect(legacy.game.getSnapshot().save.pendingVisits).toEqual([]); legacy.game.water(); expect(legacy.game.getSnapshot().save.pendingVisits).toEqual([]); legacy.game.stop();
  });

  it('最多预约两次，位置独立抽选并持久保存，刷新不重抽', () => {
    const context = setup({}, 0.2); context.game.requestVisit(); context.roll(0.8); context.game.requestVisit(); context.game.requestVisit();
    expect(context.game.getSnapshot().save.pendingVisits).toEqual(stageVisitIds('A'));
    expect(context.game.getSnapshot().save.visitPositions).toEqual({ 'visit-A': 0, 'visit-A-2': 1 }); context.game.stop();
    const restored = new GameController(new TimeGateService(context.clock), new SaveManager(context.storage), () => 0.1); startScene(restored);
    expect(restored.getSnapshot().companionPosition).toBe(0); expect(restored.getSnapshot().save.visitPositions['visit-A-2']).toBe(1); restored.stop();
  });

  it('梦露不足、未开放及锁日期满额的免费观赏均不抽来访', () => {
    const failed = setup({ dew: 0 }, 0); failed.game.water(); expect(failed.game.getSnapshot().save.pendingVisits).toEqual([]); failed.game.stop();
    const locked = setup({}, 0, new TestClock(Date.parse(SCHEDULE[0].at) - 1)); locked.game.water(); expect(locked.game.getSnapshot().save.pendingVisits).toEqual([]); locked.game.stop();
    const full = setup({ ...stageFixture('C', 0), growth: STAGES.C.growth.end, completedVisits: ['visit-C'] }, 0); full.game.water(); expect(full.game.getSnapshot().save.pendingVisits).toEqual([]); full.game.stop();
  });
});

describe('对白后的祝福、暂停与刷新事务', () => {
  it('祝福包括在对白后 3～7 秒内，不另加 2.4 秒延长停留', () => {
    for (const roll of [0, 0.5, 0.99]) {
      const { game } = setup({}, roll); let started: number | undefined; let left: number | undefined;
      game.subscribe(() => { if (started === undefined && game.getSnapshot().blessing?.phase === 'channel') started = Date.now(); if (left === undefined && game.getSnapshot().companion === 'leave') left = Date.now(); });
      game.requestVisit(); until(() => left !== undefined); expect(left! - started!).toBe(3000 + roll * 4000); game.stop();
    }
  });

  it.each(['A', 'B', 'C', 'D', 'E', 'F'] as const)('%s 普通祝福精确增加固定20，不消耗梦露', (stage) => {
    expect(STAGES[stage].visit.chance).toBe(0.13);
    const clock = new TestClock(Date.parse(SCHEDULE[5].at)); const fixture = stageFixture(stage, clock.now());
    const { game } = setup({ ...fixture, playedDialogues: [...fixture.playedDialogues, STAGES[stage].transition.id] }, 0.99, clock);
    let channelAt: number | undefined;
    const unsubscribe = game.subscribe(() => { if (channelAt === undefined && game.getSnapshot().blessing?.phase === 'channel') channelAt = Date.now(); });
    game.requestVisit(); until(() => game.getSnapshot().blessing?.phase === 'channel');
    expect(game.getSnapshot().save.growth).toBe(fixture.growth); expect(game.getSnapshot().speech).toBeNull();
    vi.advanceTimersByTime(channelAt! + PRESENTATION_RULES.blessingTravelMs - Date.now() - 1); expect(game.getSnapshot().save.growth).toBe(fixture.growth);
    vi.advanceTimersByTime(1);
    expect(game.getSnapshot().save.growth).toBe(fixture.growth + 20);
    expect(game.getSnapshot().save.dew).toBe(20); unsubscribe(); game.stop();
  });

  it('聚光可暂停，恢复到达后只结算一次，停留开始后树对白 / 浇灌均可用', () => {
    const { game } = setup(); game.requestVisit(); until(() => game.getSnapshot().blessing?.phase === 'channel');
    vi.advanceTimersByTime(500); game.openPanel('settings'); vi.advanceTimersByTime(30000);
    expect(game.getSnapshot().save.growth).toBe(0); expect(game.getSnapshot().blessing?.phase).toBe('channel'); game.closePanel();
    vi.advanceTimersByTime(1000); expect(game.getSnapshot().save.growth).toBe(20); expect(game.getSnapshot().save.blessedVisits).toEqual(['visit-A']);
    vi.advanceTimersByTime(900); expect(game.getSnapshot().blessing).toBeNull(); expect(game.getSnapshot().companion).toBe('observe');
    game.talk(); expect(game.getSnapshot().speech?.anchor).toBe('tree'); expect(game.water()).toBe(true); game.stop(); expect(vi.getTimerCount()).toBe(0);
  });

  it('光流中刷新恢复未结算祝福，落点后刷新不再重复赠送', () => {
    const { game, clock, storage } = setup(); game.requestVisit(); until(() => game.getSnapshot().blessing?.phase === 'channel'); game.stop();
    const restored = new GameController(new TimeGateService(clock), new SaveManager(storage), () => 0.99); startScene(restored);
    until(() => restored.getSnapshot().blessing?.phase === 'bloom'); expect(restored.getSnapshot().save.growth).toBe(20); restored.stop();
    const completed = new GameController(new TimeGateService(clock), new SaveManager(storage), () => 0.99); startScene(completed);
    until(() => completed.getSnapshot().save.completedVisits.includes('visit-A')); expect(completed.getSnapshot().save.growth).toBe(20);
    expect(completed.getSnapshot().blessing).toBeNull(); completed.stop();
  });

  it('只补所属阶段余量、不跨日期；权限收回、退出与重置不会由旧回调发奖', () => {
    expect(visitGrowth('A', 178, 180)).toBe(180); expect(visitGrowth('B', 220, 180)).toBe(220);
    const context = setup(); context.game.requestVisit(); until(() => context.game.getSnapshot().blessing?.phase === 'channel');
    context.clock.value = Date.parse(SCHEDULE[0].at) - 1; context.game.tick(); vi.advanceTimersByTime(10000);
    expect(context.game.getSnapshot().save.growth).toBe(0); expect(context.game.getSnapshot().blessing).toBeNull(); context.game.stop();
    const reset = setup(); reset.game.requestVisit(); until(() => reset.game.getSnapshot().blessing?.phase === 'channel'); reset.game.reset(); vi.advanceTimersByTime(10000);
    expect(reset.game.getSnapshot().save.growth).toBe(0); expect(reset.game.getSnapshot().save.blessedVisits).toEqual([]); reset.game.stop();
  });

  it('旧 v2 已完成来访不追赠，小数成长和合法位置 / 保底 / 结算 ID 保留', () => {
    const legacy = validateSave({ growth: 229.1, completedVisits: ['visit-A'], pendingVisits: ['visit-B'], visitPositions: { 'visit-A': 1, 'visit-B': 7, unknown: 1 }, guaranteedVisits: ['visit-B', 'unknown'] });
    expect(legacy.growth).toBe(229.1); expect(legacy.blessedVisits).toEqual(['visit-A']); expect(legacy.visitPositions).toEqual({ 'visit-A': 1, 'visit-B': 0 }); expect(legacy.guaranteedVisits).toEqual(['visit-B']);
    expect(validateSave({ ...legacy, blessedVisits: ['unknown', 'visit-B', 'visit-B'] }).blessedVisits).toEqual(['visit-B']);
  });

  it('切换梦境回访清理当前光流，返回后仍恢复未结算祝福', () => {
    const clock = new TestClock(Date.parse(SCHEDULE[5].at)); const fixture = stageFixture('B', clock.now());
    const { game } = setup({ ...fixture, playedDialogues: [...fixture.playedDialogues, STAGES.B.transition.id] }, 0.99, clock);
    game.requestVisit(); until(() => game.getSnapshot().blessing?.phase === 'channel'); game.openPanel('journal'); game.review('A');
    expect(game.getSnapshot().blessing).toBeNull(); expect(game.getSnapshot().companion).toBeNull();
    vi.advanceTimersByTime(30000); expect(game.getSnapshot().save.growth).toBe(fixture.growth);
    game.review(null); until(() => game.getSnapshot().save.blessedVisits.includes('visit-B')); expect(game.getSnapshot().save.growth).toBe(visitGrowth('B', fixture.growth, STAGES.B.growth.end)); game.stop();
  });
});

describe('每阶段两处姿态与气泡布局', () => {
  it.each(['A', 'B', 'C', 'D', 'E', 'F'] as const)('%s 保持原向并按落点分布，所有花叶共用未镜像的身体锚点', (stage) => {
    const anchor = VISIT_EMITTERS[stage];
    expect(VISIT_PLACEMENTS[stage].map((placement) => placement.side)).toEqual(['B', 'D', 'E'].includes(stage) ? ['left', 'left'] : ['left', 'right']);
    for (const position of [0, 1] as const) {
      const layout = dreamLayout(844, 390, 0.43, STAGES[stage].height.start, 0, undefined, VISIT_FORMS[stage] ?? 'dream', stage, position);
      expect(layout).not.toHaveProperty('characterFlipped'); expect(layout.characterEmission).toEqual(anchor);
      const markup = renderToStaticMarkup(createElement(DendroBlessing, { width: 844, height: 390, scale: 0.43, root: 330, treeHeight: STAGES[stage].height.start, growth: STAGES[stage].growth.start, character: layout.character, emitter: layout.characterEmission, phase: 'channel', paused: false, reduced: false }));
      const start = `M${layout.character.left + layout.character.width * layout.characterEmission.x} ${layout.character.top + layout.character.height * layout.characterEmission.y}C`;
      expect(markup).toContain(`d="${start}`); expect(markup.split(start)).toHaveLength(12);
    }
  });

  it('树侧保留一枚真实草元素图标与素材边框，花叶只承担传递而不替代图标', () => {
    const source = readFileSync(DENDRO_ICON.source); const published = readFileSync(`public${DENDRO_ICON.src}`);
    expect(source.equals(published)).toBe(true); expect(createHash('sha256').update(source).digest('hex')).toBe(DENDRO_ICON.sha256);
    expect(source.readUInt32BE(16)).toBe(64); expect(source.readUInt32BE(20)).toBe(64);
    for (const reduced of [false, true]) {
      const markup = renderToStaticMarkup(createElement(DendroBlessing, { width: 844, height: 390, scale: 0.43, root: 300, treeHeight: 140, growth: 100, character: { left: 460, top: 100, width: 180, height: 180 }, phase: 'channel', paused: false, reduced }));
      expect(markup.match(/class="blessing-dendro-icon"/g)).toHaveLength(1); expect(markup).toContain(DENDRO_ICON.src);
      expect(markup.match(/class="blessing-pattern-piece"/g)).toHaveLength(16); expect(markup).toContain('blessing-lattice');
      expect(markup).not.toMatch(/blessing-source|blessing-focus-frame|blessing-circuit|blessing-data-packet|center_emblem/);
      expect(markup.includes('class="blessing-flow-particle"')).toBe(!reduced); expect(markup.includes('class="blessing-scan"')).toBe(!reduced);
    }
  });

  it.each(['A', 'B', 'C', 'D', 'E', 'F'] as const)('%s 两处位置不同且在桌面 / 两档横屏保留完整取景', (stage) => {
    expect(VISIT_PLACEMENTS[stage]).toHaveLength(2);
    for (const viewport of [{ width: 1440, height: 900, scale: 1 }, { width: 844, height: 390, scale: 0.43 }, { width: 640, height: 360, scale: 0.37 }]) {
      const layouts = ([0, 1] as const).map((position) => dreamLayout(viewport.width, viewport.height, viewport.scale, STAGES[stage].height.start, 0, undefined, VISIT_FORMS[stage] ?? 'dream', stage, position));
      expect(layouts[0].character).not.toEqual(layouts[1].character);
      for (const [position, layout] of layouts.entries()) {
        const bodyX = layout.character.left + layout.character.width * VISIT_EMITTERS[stage].x;
        if (['B', 'D', 'E'].includes(stage) || position === 0) expect(bodyX).toBeLessThan(viewport.width / 2 - 16);
        else expect(bodyX).toBeGreaterThan(viewport.width / 2 + 16);
      }
      if (['B', 'D', 'E'].includes(stage)) {
        expect(layouts[1].character.left).toBeLessThan(layouts[0].character.left);
        expect(layouts[1].character.top).toBeLessThan(layouts[0].character.top);
      }
      for (const layout of layouts) for (const area of [layout.character, layout.characterBubble]) {
        expect(area.left).toBeGreaterThanOrEqual(0); expect(area.left + area.width).toBeLessThanOrEqual(viewport.width); expect(area.top).toBeGreaterThanOrEqual(80);
      }
      expect(layouts[1].character.top + layouts[1].character.height).toBeLessThanOrEqual(viewport.height - 19);
    }
  });
});
