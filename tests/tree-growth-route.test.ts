import { describe, expect, it } from 'vitest';
import { treeGrowthBeat, treeGrowthDuration, treeGrowthFrame, treeGrowthPlayback, treeGrowthStep } from '../src/game/tree/growth';
import { foliageDuration } from '../src/game/tree/foliage';
import { foliageLeafStep, FOLIAGE_SITES } from '../src/game/tree/foliagePlan';
import { TREE_ANIMATIONS } from '../src/game/tree/timeline';

const frameAt = (unit: number) => treeGrowthFrame(unit * 20);

describe('保持成长预算的前移生长节拍', () => {
  it('A/B保持原17拍，C/D部分浇灌完整串播两段原轨', () => {
    expect(Array.from({ length: 18 }, (_, unit) => treeGrowthStep(unit * 20))).toEqual(Array.from({ length: 18 }, (_, unit) => unit));
    expect(Array.from({ length: 9 }, (_, index) => treeGrowthStep((18 + index) * 20))).toEqual([18, 20, 21, 23, 24, 26, 27, 29, 30]);
    expect(Array.from({ length: 8 }, (_, index) => treeGrowthStep((27 + index) * 20))).toEqual([31, 33, 34, 36, 37, 39, 40, 41]);
    expect(treeGrowthDuration(360, 380)).toBe(Math.round((foliageDuration(19) + foliageDuration(20)) * 1000));
    const playback = treeGrowthPlayback(frameAt(18), 380);
    expect(treeGrowthBeat(playback.at(0).index).step).toBe(19);
    expect(treeGrowthBeat(playback.at(foliageDuration(19) + .01).index).step).toBe(20);
    expect(playback.at(playback.duration)).toEqual(frameAt(19));
  });

  it('E/F仍各八与十次浇灌，前17次每次均有独立完整动作而非停住半次回弹', () => {
    const beats = Array.from({ length: 17 }, (_, index) => treeGrowthBeat(frameAt(35 + index).index));
    expect(beats.map((beat) => `${beat.step}-${beat.pass}`)).toEqual([
      '42-leaves', '42-clusters', '43-leaves', '43-clusters', '44-leaves', '44-clusters',
      '45-leaves', '45-clusters', '46-leaves', '46-clusters', '47-leaves', '47-clusters',
      '48-leaves', '48-clusters', '49-full', '50-full', '51-full',
    ]);
    for (const beat of beats) {
      expect(beat.duration).toBeGreaterThan(0);
      if (beat.pass === 'leaves') {
        expect(FOLIAGE_SITES.some((site) => site.birth === beat.step || foliageLeafStep(site) === beat.step)).toBe(true);
        expect(beat.duration).toBe(foliageDuration(beat.step));
      }
      if (beat.pass === 'clusters') {
        expect(FOLIAGE_SITES.some((site) => foliageLeafStep(site) + 1 === beat.step)).toBe(true);
        expect(beat.duration).toBe(.25);
      }
    }
    expect(treeGrowthBeat(frameAt(42).index)).toMatchObject({ step: 45, pass: 'clusters' });
    expect(treeGrowthBeat(frameAt(43).index)).toMatchObject({ step: 46, pass: 'leaves' });
  });

  it('原51条轨均有一次完整木质播放，只多分出七拍独立成簇', () => {
    const beats = Array.from({ length: 58 }, (_, index) => treeGrowthBeat(index + 1));
    expect(beats.filter((beat) => beat.pass !== 'clusters').map((beat) => beat.step)).toEqual(Array.from({ length: 51 }, (_, index) => index + 1));
    expect(beats.filter((beat) => beat.pass === 'clusters').map((beat) => beat.step)).toEqual([42, 43, 44, 45, 46, 47, 48]);
    expect(TREE_ANIMATIONS).toHaveLength(52);
    for (const beat of beats.filter((entry) => entry.pass !== 'clusters')) expect(beat.duration).toBeGreaterThanOrEqual(TREE_ANIMATIONS[beat.step].duration);
    const seconds = beats.reduce((sum, beat) => sum + beat.duration, 0);
    expect(treeGrowthDuration(0, 1020)).toBe(Math.round(seconds * 1000));
  });

  it('同一原grow的两拍具有不同游标，暂停后准确续帧且可以继续串下一拍', () => {
    const from = frameAt(34);
    const initial = treeGrowthPlayback(from, 700);
    const paused = initial.at(.4);
    expect(paused).toEqual({ index: 42, time: .4 });
    const resumed = treeGrowthPlayback(paused, 720);
    expect(resumed.at(.1)).toEqual({ index: 42, time: .5 });
    expect(resumed.at(resumed.duration - .1)).toMatchObject({ index: 43 });
    expect(resumed.at(resumed.duration)).toEqual(frameAt(36));
    const cluster = treeGrowthPlayback(frameAt(35), 720);
    expect(cluster.duration).toBe(.25);
    expect(cluster.at(.1)).toEqual({ index: 43, time: .1 });
    expect(treeGrowthPlayback(cluster.at(.1), 720).duration).toBeCloseTo(.15, 12);
    expect(treeGrowthPlayback(frameAt(36), 720).duration).toBe(0);
  });

  it('读档按成长值稳定重建节拍，最后7点及边界补浇不新增动画', () => {
    for (let unit = 0; unit <= 51; unit++) {
      const frame = frameAt(unit);
      expect(frame.time).toBe(treeGrowthBeat(frame.index).duration);
      expect(treeGrowthFrame(unit * 20 + 19)).toEqual(frame);
      expect(treeGrowthPlayback(frame, unit * 20).duration).toBe(0);
      if (unit) expect(frame.index).toBeGreaterThan(frameAt(unit - 1).index);
    }
    expect(treeGrowthFrame(1020)).toEqual(treeGrowthFrame(1027));
    expect(treeGrowthStep(1027)).toBe(51);
    expect(treeGrowthDuration(1020, 1027)).toBe(0);
    expect(treeGrowthDuration(680, 680)).toBe(0);
    expect(treeGrowthFrame(-20)).toEqual(frameAt(0));
    expect(treeGrowthFrame(NaN)).toEqual(frameAt(0));
    expect(treeGrowthFrame(Infinity)).toEqual(frameAt(0));
    expect(treeGrowthBeat(-1)).toEqual(treeGrowthBeat(0));
    expect(treeGrowthBeat(100)).toEqual(treeGrowthBeat(58));
    expect(treeGrowthPlayback(frameAt(20), 0).duration).toBe(0);
  });
});
