import { describe, expect, it } from 'vitest';
import { foliageEventDelay, foliageStepDuration, leafMotionProgress } from '../src/game/tree/foliageTiming';
import { leafMotionDuration, sampleLeafMotion } from '../src/game/tree/leafMotion';
import type { LeafMotionKind } from '../src/game/tree/leafMotion';
import { TREE_ANIMATIONS, treeAnimationPose, treePlayback } from '../src/game/tree/timeline';

const templates: { kind: LeafMotionKind; step: number; seconds: number }[] = [
  { kind: 'bud', step: 25, seconds: .5 },
  { kind: 'leaf', step: 35, seconds: .5 },
  { kind: 'cluster1', step: 37, seconds: .25 },
  { kind: 'cluster2', step: 38, seconds: .25 },
  { kind: 'cluster3', step: 46, seconds: .25 },
];

describe('枝叶真实秒数时钟', () => {
  it.each(templates)('$kind 始终保留早期原 clip 的真实时长', ({ kind, step, seconds }) => {
    expect(leafMotionDuration(kind)).toBe(seconds);
    expect(leafMotionDuration(kind)).toBe(TREE_ANIMATIONS[step].duration);
    for (let sample = 0; sample <= 16; sample++) {
      expect(leafMotionProgress(kind, seconds * sample / 16)).toBeCloseTo(sample / 16, 12);
    }
  });

  it.each([36, 42, 45, 50])('grow%d 切图后才开始完整新芽时钟，不挤入木质剩余时长', (step) => {
    const delay = foliageEventDelay(step);
    expect(delay).toBe(step === 50 ? .4167 : .3333);
    expect(leafMotionProgress('bud', delay - .0001, delay)).toBe(0);
    expect(leafMotionProgress('bud', delay, delay)).toBe(0);
    expect(leafMotionProgress('bud', delay + .25, delay)).toBeCloseTo(.5, 12);
    expect(leafMotionProgress('bud', delay + .5, delay)).toBe(1);
    expect(foliageStepDuration(step, [{ kind: 'bud' }])).toBeCloseTo(delay + .5, 12);
    expect(leafMotionProgress('bud', TREE_ANIMATIONS[step].duration, delay)).toBeLessThan(1);
  });

  it.each(templates)('$kind 延迟不改变原回弹峰值与节奏', ({ kind, seconds }) => {
    const delay = .3333;
    for (let sample = 0; sample <= 16; sample++) {
      const progress = sample / 16;
      const actual = sampleLeafMotion(kind, leafMotionProgress(kind, delay + seconds * progress, delay));
      const expected = sampleLeafMotion(kind, progress);
      actual.forEach((value, coefficient) => expect(value).toBeCloseTo(expected[coefficient], 10));
    }
  });

  it('并行枝叶只延长到最晚落稳的附件，不叠加所有附件时长', () => {
    const events = [{ kind: 'bud' as const }, { kind: 'cluster1' as const }, { kind: 'leaf' as const, delay: .1 }];
    expect(foliageStepDuration(45, events)).toBeCloseTo(.8333, 12);
    expect(events).toEqual([{ kind: 'bud' }, { kind: 'cluster1' }, { kind: 'leaf', delay: .1 }]);
    expect(foliageStepDuration(50, [{ kind: 'cluster3' }])).toBe(TREE_ANIMATIONS[50].duration);
  });

  it('没有新增事件时不改变原始 body 时长，grow49 只有实际枝叶事件才演出', () => {
    for (let step = 0; step <= 51; step++) expect(foliageStepDuration(step)).toBe(TREE_ANIMATIONS[step].duration);
    expect(foliageStepDuration(49)).toBe(0);
    expect(foliageStepDuration(49, [{ kind: 'cluster2' }])).toBe(.25);
    expect(foliageEventDelay(35)).toBe(0);
  });

  it('延长部分只让木质原帧落稳，不重新缩放或推进原关键帧', () => {
    for (const step of [36, 42, 45, 50]) {
      const duration = foliageStepDuration(step, [{ kind: 'bud' }]);
      const settled = treeAnimationPose(step);
      expect(treeAnimationPose(step, duration)).toEqual(settled);
      expect(treeAnimationPose(step, TREE_ANIMATIONS[step].duration + .01)).toEqual(settled);
      expect(leafMotionProgress('bud', duration, foliageEventDelay(step))).toBe(1);
    }
  });

  it('暂停与恢复采样不重置游标，末帧保持1且不回零', () => {
    const delay = foliageEventDelay(45);
    const cursor = delay + .2;
    const paused = leafMotionProgress('leaf', cursor, delay);
    expect(leafMotionProgress('leaf', cursor, delay)).toBe(paused);
    expect(leafMotionProgress('leaf', cursor + .1, delay)).toBeGreaterThan(paused);
    for (const seconds of [delay + .5, delay + 1, Infinity]) expect(leafMotionProgress('leaf', seconds, delay)).toBe(1);
  });

  it('无效时钟与输入安全落在闭区间，不修改原 clip', () => {
    const before = JSON.stringify(TREE_ANIMATIONS);
    for (const elapsed of [-Infinity, -1, NaN]) expect(leafMotionProgress('bud', elapsed)).toBe(0);
    expect(leafMotionProgress('bud', .25, -1)).toBe(.5);
    expect(leafMotionProgress('bud', .25, NaN)).toBe(.5);
    expect(foliageStepDuration(NaN)).toBe(TREE_ANIMATIONS[0].duration);
    expect(foliageStepDuration(100)).toBe(TREE_ANIMATIONS[51].duration);
    expect(JSON.stringify(TREE_ANIMATIONS)).toBe(before);
  });

  it('逐段播放使用同一事件时长函数，原木质按真实秒数取样', () => {
    const duration = (step: number) => foliageStepDuration(step, [{ kind: 'bud' }]);
    const playback = treePlayback({ step: 35, time: TREE_ANIMATIONS[35].duration }, 36, duration);
    expect(playback.duration).toBeCloseTo(.8333, 12);
    expect(playback.at(.25)).toEqual({ step: 36, time: .25 });
    expect(treeAnimationPose(36, playback.at(.25).time)).toEqual(treeAnimationPose(36, .25));
    expect(playback.at(.8)).toEqual({ step: 36, time: .8 });
    expect(playback.at(playback.duration)).toEqual({ step: 36, time: duration(36) });
    expect(treeAnimationPose(36, playback.at(.8).time)).toEqual(treeAnimationPose(36));
  });

  it('逐段播放暂停续接只用剩余活动时间，不重新开始叶片回弹', () => {
    const duration = (step: number) => foliageStepDuration(step, [{ kind: 'bud' }]);
    const playback = treePlayback({ step: 35, time: TREE_ANIMATIONS[35].duration }, 36, duration);
    const paused = playback.at(.6);
    const resumed = treePlayback(paused, 36, duration);
    expect(resumed.duration).toBeCloseTo(playback.duration - .6, 12);
    expect(resumed.at(0)).toEqual(paused);
    expect(resumed.at(.1).time).toBeCloseTo(.7, 12);
    expect(resumed.at(resumed.duration)).toEqual(playback.at(playback.duration));
    expect(treePlayback(resumed.at(resumed.duration), 36, duration).duration).toBe(0);
  });

  it('多段新叶与簇分别保留各自时长，旧数值最小时长参数仍兼容', () => {
    const duration = (step: number) => foliageStepDuration(step, [{ kind: step === 37 ? 'cluster1' : 'bud' }]);
    const playback = treePlayback({ step: 35, time: TREE_ANIMATIONS[35].duration }, 37, duration);
    expect(playback.duration).toBeCloseTo(.8333 + .25, 12);
    expect(playback.at(duration(36))).toEqual({ step: 37, time: 0 });
    expect(playback.at(playback.duration)).toEqual({ step: 37, time: .25 });
    const oldPlayback = treePlayback({ step: 48, time: .25 }, 49, .25);
    expect(oldPlayback.duration).toBe(.25);
    expect(oldPlayback.at(.25)).toEqual({ step: 49, time: .25 });
  });
});
