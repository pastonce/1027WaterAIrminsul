import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameController } from '../src/game/core/GameController';
import { testGame, startGame } from './support';
import { stageFixture } from '../src/dev/fixtures';
import { CodeSequence, easterCode } from '../src/game/secrets/codes';
import { createSave, SaveManager } from '../src/game/save/SaveManager';
import { TimeGateService } from '../src/game/time/TimeGateService';
import { TestClock } from './support';
import { TREE_MAX_HALF_WIDTH } from '../src/data/treeArt';
import { proceduralGrowthAtFrame, proceduralHeight, proceduralTree, PROCEDURAL_TREE_RULES } from '../src/game/tree/procedural';
import { treeGrowthFrame, treeGrowthPlayback } from '../src/game/tree/growthRoute';
import { TreeRenderer } from '../src/components/TreeRenderer';
import { crystalPerches, crystalPlan } from '../src/game/encounters/crystalflies';
import { DIALOGUE_ENTRIES } from '../src/data/dialogues';
import { parseNotice } from '../src/game/notice/markdown';
import { readFileSync } from 'node:fs';

const games: GameController[] = [];
const OPEN = Date.parse('2026-10-27T13:27:00+08:00');
beforeEach(() => vi.useFakeTimers());
afterEach(() => { games.splice(0).forEach((game) => game.stop()); expect(vi.getTimerCount()).toBe(0); vi.useRealTimers(); });

function setup(stage: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G', growth?: number) {
  const clock = new TestClock(OPEN);
  const fixture = stageFixture(stage, OPEN);
  const state = testGame({ ...fixture, ...(growth === undefined ? {} : { growth }), settings: { ...fixture.settings, reducedMotion: true } }, clock);
  games.push(state.game); startGame(state.game); vi.advanceTimersByTime(4000); return state;
}

describe('X05 Irminsul本页形态', () => {
  it('兼容原稿逐字拼写及大小写，不替其他代码忽略标点', () => {
    expect(easterCode(' I-r-m-i-n-s-u-l ')).toBe('irminsul');
    expect(easterCode('IRmInsUl')).toBe('irminsul'); expect(easterCode('ra-instorm')).toBeNull();
    const stream = new CodeSequence(); expect([...'I-r-M-i-N-s-u-L'].flatMap((key) => stream.key(key) ?? [])).toEqual(['irminsul']);
  });
  it.each(['A', 'B', 'C', 'D', 'E', 'F'] as const)('%s双向切换不动当前成长、资源、抽取轮次或待播收据，刷新还原', (stage) => {
    const { game, storage, clock } = setup(stage);
    const before = game.getSnapshot(); const persisted = new Map(storage.values);
    expect(game.easterEgg('Irminsul')).toBeTruthy(); expect(game.getSnapshot().proceduralTree).toBe(true);
    expect(game.getSnapshot().save).toBe(before.save); expect(game.getSnapshot().growth).toBe(before.growth);
    expect(game.getSnapshot().dewParticles).toBe(before.dewParticles); expect(game.getSnapshot().mode).toBe(before.mode);
    expect(storage.values).toEqual(persisted);
    expect(game.easterEgg('I-R-M-I-N-S-U-L')).toBeTruthy(); expect(game.getSnapshot().proceduralTree).toBe(false);
    game.easterEgg('irminsul'); game.stop();
    const refreshed = new GameController(new TimeGateService(clock), new SaveManager(storage)); games.push(refreshed);
    expect(refreshed.getSnapshot().proceduralTree).toBe(false); expect(refreshed.getSnapshot().save.growth).toBe(before.save.growth);
  });
  it('未种植、开放前与G拒绝变形，重置取消临时形态', () => {
    const { game } = setup('A'); game.restore({ ...createSave(OPEN), introSeen: true }); game.sceneEntranceReady('A');
    expect(game.easterEgg('irminsul')).toBeNull(); expect(setup('G').game.easterEgg('irminsul')).toBeNull();
    const source = setup('C'); source.game.easterEgg('irminsul'); source.game.reset(); expect(source.game.getSnapshot().proceduralTree).toBe(false);
    source.clock.value = 0; source.game.tick(); expect(source.game.easterEgg('irminsul')).toBeNull();
  });
  it('浇灌和面板中切换不重置剩余成长计时，继续原20点结算', () => {
    const { game } = setup('C', 360); game.restore({ ...game.getSnapshot().save, dew: 40 }); game.sceneEntranceReady('A');
    expect(game.water()).toBe(true); const growing = game.getSnapshot();
    game.openPanel('settings'); expect(game.easterEgg('irminsul')).toBeTruthy(); vi.advanceTimersByTime(10000);
    expect(game.getSnapshot().mode).toBe('settings'); expect(game.getSnapshot().save.growth).toBe(growing.save.growth);
    game.closePanel(); vi.advanceTimersByTime(5000); expect(game.getSnapshot().mode).toBe('idle');
    expect(game.getSnapshot().save.growth).toBe(380); expect(game.getSnapshot().save.dew).toBe(20);
  });
});

describe('恢复旧程序化枝干与当前统一成长游标', () => {
  it('每个20点终态映射同等成长；C/D多拍及E/F分拍连续，末7点不变', () => {
    for (let growth = 0; growth <= 1020; growth += 20) {
      expect(proceduralGrowthAtFrame(treeGrowthFrame(growth))).toBeCloseTo(growth, 8);
      if (!growth) continue;
      const playback = treeGrowthPlayback(treeGrowthFrame(growth - 20), growth);
      const samples = Array.from({ length: 41 }, (_, index) => proceduralGrowthAtFrame(playback.at(playback.duration * index / 40)));
      expect(samples[0]).toBeGreaterThanOrEqual(growth - 20 - .0001); expect(samples.at(-1)).toBeCloseTo(growth);
      samples.forEach((value, index) => { if (index) expect(value).toBeGreaterThanOrEqual(samples[index - 1] - .0001); });
    }
    expect(proceduralGrowthAtFrame(treeGrowthFrame(1027))).toBe(1020); expect(proceduralHeight(1020)).toBe(proceduralHeight(1027));
  });
  it('确定性复用旧弯干、交错枝与绿叶，不生成外链 / 画布 / 巨大透明命中框', () => {
    for (const seed of [1, 1027, 1949]) for (const growth of [0, 20, 100, 180, 340, 520, 680, 840, 1020]) {
      const tree = proceduralTree(growth, seed); expect(tree).toEqual(proceduralTree(growth, seed));
      expect(tree.height).toBeLessThanOrEqual(PROCEDURAL_TREE_RULES.maximumHeight);
      for (const leaf of tree.bounds.crown) { expect(leaf.x).toBeGreaterThanOrEqual(500 - TREE_MAX_HALF_WIDTH); expect(leaf.x + leaf.width).toBeLessThanOrEqual(500 + TREE_MAX_HALF_WIDTH); }
      const html = renderToStaticMarkup(createElement(TreeRenderer, { growth, procedural: true, seed, reduced: true, growing: false, onInteract() {} }));
      expect(html).toContain('data-tree-style="procedural"'); expect(html).not.toMatch(/<canvas|pointer-events="all"|data-tree-art="tree[1-9]/);
      if (growth) expect(html).toContain('procedural-tree-art');
      expect(html.match(/<image /g)).toHaveLength(1);
    }
  });
  it('晶蝶保留原阈值、形象和相位，已解锁者移到程序化枝叶而不重新随机', () => {
    for (const seed of [1, 1027]) for (const growth of [100, 180, 340, 520, 680, 840, 1020]) {
      const original = crystalPlan(seed); const perches = crystalPerches(seed, growth, undefined, true);
      expect(perches.map(({ id, asset, threshold, width, phase }) => ({ id, asset, threshold, width, phase }))).toEqual(original.map(({ id, asset, threshold, width, phase }) => ({ id, asset, threshold, width, phase })));
      for (const perch of perches.filter((entry) => entry.threshold <= growth)) {
        expect(Math.abs(perch.horizontal)).toBeLessThan(350); expect(perch.elevation).toBeGreaterThan(0);
        expect(perch.elevation).toBeLessThan(proceduralHeight(growth) + 90);
      }
    }
  });
});

describe('最新N01与公告标语', () => {
  it('N01沿原ID / 庆典池，正文及句前 / 句中表情来自唯一原稿', () => {
    const entry = DIALOGUE_ENTRIES.N01;
    expect(entry.text).toBe('嗯！出发吧，我的骑士！像这样美好的礼物，应该被世界永久记录下来。谢谢你们~');
    expect(entry.expressions).toEqual([{ mode: 'before', offset: 0, choices: [1, 7, 9] }, { mode: 'middle', offset: entry.text.indexOf('谢谢'), choices: [7, 9] }]);
  });
  it('末尾单行标语保留可编辑的原文，没有变成普通章节标题', () => {
    const notice = parseNotice(readFileSync('src/content/notice.md', 'utf8'));
    expect(notice.blocks.at(-1)).toEqual({ kind: 'tagline', text: '曾有梦编织树荫，成为求知者的栖所。' });
    expect(notice.blocks.filter((block) => block.kind === 'heading' && block.text.includes('曾有梦'))).toEqual([]);
  });
});
