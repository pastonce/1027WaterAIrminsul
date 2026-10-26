import { describe, expect, it } from 'vitest';
import { treeGrowthBeat, treeGrowthFrame, treeGrowthPlayback } from '../src/game/tree/growth';
import { createTreeGrowthModel, treeGrowthFrameModel } from '../src/game/tree/presentation';
import { createTreeModel } from '../src/game/tree/model';
import { foliageDuration } from '../src/game/tree/foliage';
import { foliageLeafStep, FOLIAGE_SITES } from '../src/game/tree/foliagePlan';

const geometry = (growth: number) => createTreeGrowthModel(growth).parts.map((part) => ({ id: part.id, asset: part.asset, matrix: part.artMatrix, phase: part.phase }));

describe('前移成长的真实显示与分拍恢复', () => {
  it.each([42, 43, 44, 45, 46, 47, 48])('grow%d舒叶后停稳，下一拍只回弹新增叶簇，不重播木质或其他叶片', (step) => {
    const growth = 700 + (step - 42) * 40;
    const leaves = createTreeGrowthModel(growth);
    const clusters = createTreeGrowthModel(growth + 20);
    const identities = leaves.crown.map((part) => part.id);
    expect(leaves.pass).toBe('leaves'); expect(clusters.pass).toBe('clusters');
    expect(clusters.crown.map((part) => part.id)).toEqual(identities);
    expect(leaves.body).toEqual(clusters.body); expect(leaves.roots).toEqual(clusters.roots);
    const upgraded = new Set(FOLIAGE_SITES.flatMap((site, index) => foliageLeafStep(site) + 1 === step ? [`crown-growth-${index}`] : []));
    expect(upgraded.size).toBe(8);
    for (const part of leaves.crown) {
      const next = clusters.crown.find((candidate) => candidate.id === part.id)!;
      if (upgraded.has(part.id)) { expect(part.phase).toBe('leaf'); expect(next.phase).toBe('cluster'); }
      else expect(next).toEqual({ ...part, motion: undefined });
    }
    for (const time of [0, .05, .125, .25]) {
      const frame = treeGrowthFrameModel({ index: clusters.index, time });
      expect(frame.body).toEqual(leaves.body); expect(frame.roots).toEqual(leaves.roots);
      expect(frame.crown.filter((part) => part.motion).map((part) => part.id).sort()).toEqual([...upgraded].sort());
      expect(frame.parts.some((part) => 'opacity' in part)).toBe(false);
    }
    const original = createTreeModel(step, foliageDuration(step), true);
    expect(clusters.parts.map((part) => part.artMatrix)).toEqual(original.parts.map((part) => part.artMatrix));
    expect(treeGrowthFrameModel(treeGrowthFrame(growth)).parts).toEqual(leaves.parts);
  });

  it('E/F每次有效20点都有真实图形变化，最后7点完全保持', () => {
    for (let growth = 700; growth <= 1020; growth += 20) expect(geometry(growth), `${growth - 20}→${growth}`).not.toEqual(geometry(growth - 20));
    expect(geometry(1020)).toEqual(geometry(1027));
  });

  it('C/D一浇的每条中间原轨都可显示，不因跨两段而直接跳终态', () => {
    for (const [from, to] of [[360, 380], [540, 560], [580, 600], [620, 640]]) {
      const playback = treeGrowthPlayback(treeGrowthFrame(from), to);
      const initial = treeGrowthFrame(from); const target = treeGrowthFrame(to);
      expect(target.index - initial.index).toBe(2);
      let elapsed = 0;
      for (let index = initial.index + 1; index <= target.index; index += 1) {
        const beat = treeGrowthBeat(index);
        const frame = playback.at(elapsed + beat.duration / 2);
        expect(frame.index).toBe(index);
        const model = treeGrowthFrameModel(frame);
        expect(model.body).toEqual(createTreeModel(beat.step, frame.time, beat.step >= 34).body);
        elapsed += beat.duration;
      }
      expect(treeGrowthFrameModel(playback.at(playback.duration)).parts).toEqual(createTreeGrowthModel(to).parts);
    }
  });
});
