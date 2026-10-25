import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { applyLeafMotion, sampleLeafMotion } from '../src/game/tree/leafMotion';
import type { LeafMotionKind } from '../src/game/tree/leafMotion';
import * as timeline from '../src/game/tree/timeline';
import type { TreeMatrix } from '../src/game/tree/timeline';

const templates: { kind: LeafMotionKind; step: number; slot: string; peak: number }[] = [
  { kind: 'bud', step: 25, slot: 'leaf4_1', peak: .5 },
  { kind: 'leaf', step: 35, slot: 'leaf1_3', peak: .5 },
  { kind: 'cluster1', step: 37, slot: 'bunch1_3', peak: 0 },
  { kind: 'cluster2', step: 38, slot: 'bunch2', peak: 0 },
  { kind: 'cluster3', step: 46, slot: 'bunch3_1', peak: 0 },
];
const identity: TreeMatrix = [1, 0, 0, 1, 0, 0];
const area = (matrix: TreeMatrix) => Math.abs(matrix[0] * matrix[3] - matrix[1] * matrix[2]);

describe('原生枝叶切图回弹模板', () => {
  it.each(templates)('$kind 完整复原原附件的位移、旋转、缩放与剪切', ({ kind, step, slot }) => {
    const settled = timeline.treeAnimationPose(step).find((part) => part.id === slot)!;
    for (let frame = 0; frame <= 30; frame++) {
      const progress = frame / 30;
      const original = timeline.treeAnimationPose(step, timeline.TREE_ANIMATIONS[step].duration * progress).find((part) => part.id === slot)!;
      const restored = timeline.multiplyTreeMatrix(settled.matrix, sampleLeafMotion(kind, progress));
      restored.forEach((value, coefficient) => expect(value).toBeCloseTo(original.matrix[coefficient], 8));
    }
  });

  it.each(templates)('$kind 复用原超量峰值并回到精确终态，不使用透明度', ({ kind, peak }) => {
    expect(area(sampleLeafMotion(kind, peak))).toBeGreaterThan(1.06);
    expect(area(sampleLeafMotion(kind, .85))).toBeLessThan(area(sampleLeafMotion(kind, peak)));
    expect(sampleLeafMotion(kind, 1)).toEqual(identity);
    expect(Object.keys(sampleLeafMotion(kind, .5))).toHaveLength(6);
  });

  it.each(templates)('$kind 可注册到独立枝位并严格回稳', ({ kind }) => {
    const settled: TreeMatrix = [.12, .03, -.01, .09, 380, 2400];
    expect(applyLeafMotion(kind, 1, settled)).toEqual(settled);
    const original = [...settled];
    const actual = applyLeafMotion(kind, .5, settled);
    expect(actual).toEqual(timeline.multiplyTreeMatrix(settled, sampleLeafMotion(kind, .5)));
    expect(actual.every(Number.isFinite)).toBe(true);
    expect(settled).toEqual(original);
  });

  it.each(templates)('$kind 将进度限制于闭区间，NaN 按开头处理', ({ kind }) => {
    expect(sampleLeafMotion(kind, -1)).toEqual(sampleLeafMotion(kind, 0));
    expect(sampleLeafMotion(kind, -Infinity)).toEqual(sampleLeafMotion(kind, 0));
    expect(sampleLeafMotion(kind, NaN)).toEqual(sampleLeafMotion(kind, 0));
    expect(sampleLeafMotion(kind, 2)).toEqual(identity);
    expect(sampleLeafMotion(kind, Infinity)).toEqual(identity);
  });

  it('相同模板同一帧复用解析结果，返回数组不暴露缓存可变引用', () => {
    const parser = vi.spyOn(timeline, 'treeAnimationPose');
    try {
      const first = sampleLeafMotion('leaf', .123456789);
      const count = parser.mock.calls.length;
      const second = sampleLeafMotion('leaf', .123456789);
      expect(second).toEqual(first); expect(parser).toHaveBeenCalledTimes(count);
      first[0] = 999;
      expect(sampleLeafMotion('leaf', .123456789)).toEqual(second);
      sampleLeafMotion('leaf', .223456789);
      expect(parser).toHaveBeenCalledTimes(count + 1);
    } finally { parser.mockRestore(); }
  });

  it.each([undefined, [0, 0, 0, 0, 0, 0], [NaN, 0, 0, 1, 0, 0]] as const)('缺失或无效模板安全回退且不产生非有限矩阵 %s', async (matrix) => {
    vi.resetModules();
    const isolatedTimeline = await import('../src/game/tree/timeline');
    const parser = vi.spyOn(isolatedTimeline, 'treeAnimationPose').mockReturnValue(matrix ? [{ id: 'leaf4_1', asset: 'leaf4', matrix: [...matrix] }] : []);
    try {
      const isolatedMotion = await import('../src/game/tree/leafMotion');
      expect(isolatedMotion.sampleLeafMotion('bud', .5)).toEqual(identity);
      expect(isolatedMotion.sampleLeafMotion('bud', 1)).toEqual(identity);
    } finally { parser.mockRestore(); vi.resetModules(); }
  });

  it('采样不修改原始智慧树文件或原关键帧', () => {
    const sourcePath = new URL('../asserts/Tree of Wisdom/TreeofWisdom.skel', import.meta.url);
    const before = readFileSync(sourcePath);
    const clips = JSON.stringify(timeline.TREE_ANIMATIONS);
    for (const { kind } of templates) for (let frame = 0; frame <= 16; frame++) sampleLeafMotion(kind, frame / 16);
    expect(readFileSync(sourcePath).equals(before)).toBe(true);
    expect(JSON.stringify(timeline.TREE_ANIMATIONS)).toBe(clips);
  });
});
