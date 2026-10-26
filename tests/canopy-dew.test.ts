import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TreeRenderer } from '../src/components/TreeRenderer';
import { TREE_ART, COMPLETED_TREE_ART, TREE_MAX_HALF_WIDTH } from '../src/data/treeArt';
import { randomDewValue } from '../src/game/dew/value';
import { getTreeHeight } from '../src/game/growth/GrowthSystem';
import { createTreeModel, treeBodyPath } from '../src/game/tree/model';
import { TREE_ANIMATIONS, treeAnimationPose, transformTreePoint } from '../src/game/tree/timeline';
import { treeGrowthDuration } from '../src/game/tree/growth';

describe('梦露统一4～6点', () => {
  it.each([[0, 4], [.33332, 4], [1 / 3, 5], [.5, 5], [2 / 3, 6], [.99999, 6], [1, 6], [-1, 4], [NaN, 4]])('随机输入%s生成整数%s', (sample, expected) => {
    expect(randomDewValue(() => sample)).toBe(expected);
  });
  it('三个值按等长区间随机，不生成旧2 / 3点或小数', () => {
    const counts = [0, 0, 0];
    for (let index = 0; index < 9000; index++) counts[randomDewValue(() => index / 9000) - 4]++;
    expect(counts).toEqual([3000, 3000, 3000]);
  });
});

describe('E/F完整补绘不改变原生长动画', () => {
  it('原木质与地面槽位 / 附件 / 矩阵 / 顺序原样保留，E/F叶片单独保持连续', () => {
    for (let step = 0; step <= 51; step++) for (let frame = 0; frame <= 4; frame++) {
      const time = TREE_ANIMATIONS[step].duration * frame / 4;
      const original = createTreeModel(step, time); const restored = createTreeModel(step, time, true);
      const source = treeAnimationPose(step, time);
      const seedling = source.some((part) => part.asset === 'tree01' || part.asset === 'tree1');
      const wood = restored.parts.filter((part) => !part.asset.startsWith('leaf')).map(({ id, asset, matrix }) => ({ id, asset, matrix: seedling && id !== 'grass' ? [...matrix.slice(0, 5), matrix[5] - 16] : matrix }));
      const expected = source.filter((part) => !part.asset.startsWith('leaf'));
      expect(wood.map((part) => [part.id, part.asset])).toEqual(expected.map((part) => [part.id, part.asset]));
      wood.forEach((part, index) => part.matrix.forEach((value, coordinate) => expect(value).toBeCloseTo(expected[index].matrix[coordinate], 9)));
      if (step < 34) expect(restored.parts).toHaveLength(original.parts.length);
      for (const part of restored.parts) {
        expect(part.x).toBeGreaterThanOrEqual(500 - TREE_MAX_HALF_WIDTH);
        expect(part.x + part.width).toBeLessThanOrEqual(500 + TREE_MAX_HALF_WIDTH);
      }
      expect(treeBodyPath(restored.body)).not.toMatch(/NaN|Infinity/);
    }
  });
  it('四张截断树体使用完整补绘，成熟树改为无叶变体而非突现烘焙树冠', () => {
    for (const step of [36, 42, 45, 50, 51]) {
      const model = createTreeModel(step, undefined, true);
      expect(model.body[0].art).toBe(model.body[0].asset === 'tree9' ? 'tree9_growth' : `${model.body[0].asset}_complete`);
    }
    expect(createTreeModel(46, undefined, true).crown.some((part) => part.art === 'leafbunch3_complete')).toBe(true);
    expect(createTreeModel(51, undefined, true).parts.filter((part) => !part.foliage).map((part) => part.id)).toEqual(['tree9', 'grass', 'overlay9']);
    expect(createTreeModel(51, undefined, true).crown.length).toBeGreaterThan(0);
  });
  it('补绘图只按固定根部注册框跟随原骨骼，回弹不引入新曲线或伸缩', () => {
    for (const time of [0, .1667, .3333, .5, .6667]) {
      const body = createTreeModel(51, time, true).body[0];
      const registration = TREE_ART[body.art].registration;
      const local = transformTreePoint(registration as [number, number, number, number, number, number], 500, 800);
      const expected = transformTreePoint(body.matrix, local.x, local.y);
      expect(transformTreePoint(body.artMatrix, 500, 800).x).toBeCloseTo(expected.x, 10);
      expect(transformTreePoint(body.artMatrix, 500, 800).y).toBeCloseTo(expected.y, 10);
    }
    for (const art of Object.values(COMPLETED_TREE_ART)) {
      const registration = TREE_ART[art].registration;
      expect(registration.every(Number.isFinite)).toBe(true); expect(registration[0]).toBeGreaterThan(0); expect(registration[3]).toBeGreaterThan(1);
      expect(registration[5]).toBeLessThan(0);
    }
    expect(treeGrowthDuration(1000, 1020)).toBe(667); expect(treeGrowthDuration(1020, 1027)).toBe(0);
  });
  it.each(['A', 'B', 'C', 'D', 'E', 'F'] as const)('生长路径决定完整补绘，不被背景阶段%s重置', (stage) => {
    const markup = renderToStaticMarkup(createElement(TreeRenderer, { growth: 1027, stage, reduced: true, growing: false, onInteract() {} }));
    expect(markup).toContain('data-tree-art="tree9_growth"');
    expect(markup).not.toMatch(/trunk_column|graft/);
  });
  it('镜头 / 表情使用补冠后包络，但不重建超高树，F最后7点仍是同一造型', () => {
    expect(getTreeHeight(1027, 'F')).toBe(getTreeHeight(1027));
    expect(getTreeHeight(1027, 'F')).toBeLessThan(1100);
    expect(getTreeHeight(1027, 'F')).toBe(getTreeHeight(1020, 'F'));
  });
});
