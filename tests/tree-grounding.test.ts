import { describe, expect, it } from 'vitest';
import { createTreeGrowthModel } from '../src/game/tree/presentation';
import { createTreeModel } from '../src/game/tree/model';
import { TREE_ANIMATIONS, treeAnimationPose } from '../src/game/tree/timeline';
import { TREE_WORLD } from '../src/game/tree/geometry';
import { treeGrowthStep } from '../src/game/tree/growth';

describe('早期树苗贴合土坡且原生长轨保留', () => {
  it.each([20, 40, 60, 80, 100, 120])('成长%i时树脚深入草坡中心接触带，地面与树苗尺寸不变', (growth) => {
    const model = createTreeGrowthModel(growth);
    const foot = Math.max(...model.body.map((part) => part.y + part.height));
    expect(foot).toBeGreaterThanOrEqual(TREE_WORLD.ground - 10);
    expect(foot).toBeLessThanOrEqual(TREE_WORLD.ground + 4);
    expect(model.roots.find((part) => part.id === 'grass')).toEqual(createTreeGrowthModel(0).roots[0]);
    const source = treeAnimationPose(treeGrowthStep(growth));
    for (const part of model.parts) {
      const original = source.find((entry) => entry.id === part.id)!;
      expect(part.matrix.slice(0, 5)).toEqual(original.matrix.slice(0, 5));
    }
  });

  it('原回弹全过程叶和树体保持相对位置，早期切图后不遗留偏移', () => {
    for (let step = 1; step <= 12; step++) for (const fraction of [0, .25, .5, .75, 1]) {
      const time = TREE_ANIMATIONS[step].duration * fraction;
      const source = treeAnimationPose(step, time);
      const model = createTreeModel(step, time);
      const body = model.body[0];
      if (!body) continue;
      const original = source.find((part) => part.id === body.id)!;
      for (const leaf of model.crown) {
        const originalLeaf = source.find((part) => part.id === leaf.id)!;
        expect(leaf.matrix[5] - body.matrix[5]).toBeCloseTo(originalLeaf.matrix[5] - original.matrix[5]);
      }
      if (body.asset !== 'tree01' && body.asset !== 'tree1') expect(model.parts.map((part) => part.matrix)).toEqual(source.map((part) => part.matrix));
    }
  });
});
