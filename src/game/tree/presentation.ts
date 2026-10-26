import { treeGrowthBeat, treeGrowthFrame } from './growthRoute';
import type { TreeGrowthFrame } from './growthRoute';
import { createTreeModel } from './model';
import { foliageDuration, FOLIAGE_START_STEP } from './foliage';
import { proceduralTree } from './procedural';

export function treeGrowthFrameModel(frame: TreeGrowthFrame) {
  const beat = treeGrowthBeat(frame.index);
  const time = Math.max(0, Math.min(beat.duration, Number.isFinite(frame.time) ? frame.time : 0));
  const rawTime = beat.pass === 'clusters' ? foliageDuration(beat.step) : time;
  const playback = beat.pass === 'full' ? undefined : { pass: beat.pass, time };
  return { ...createTreeModel(beat.step, rawTime, beat.step >= FOLIAGE_START_STEP, playback), index: frame.index, pass: beat.pass };
}

export function createTreeGrowthModel(growth: number) {
  return treeGrowthFrameModel(treeGrowthFrame(growth));
}

export function presentedTreeBounds(growth: number, procedural = false, seed = 1027) {
  return procedural ? proceduralTree(growth, seed).bounds : createTreeGrowthModel(growth);
}
