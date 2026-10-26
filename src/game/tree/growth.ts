import { TREE_ANIMATIONS, treeAnimationHeight } from './timeline';
import { createTreeGrowthModel } from './presentation';
import { TREE_WORLD } from './geometry';
import { FOLIAGE_START_STEP } from './foliage';
import { treeGrowthBeat, treeGrowthFrame, treeGrowthPlayback } from './growthRoute';

export { treeGrowthBeat, treeGrowthFrame, treeGrowthPlayback } from './growthRoute';
export type { TreeGrowthBeat, TreeGrowthFrame, TreeGrowthPass } from './growthRoute';

export const TREE_GROWTH_STEPS = 51;
export const TREE_FINAL_GROWTH = 1027;
export const TREE_STEP_GROWTH = 20;
export const TREE_GROWTH_HEIGHTS = TREE_ANIMATIONS.map((_, step) => treeAnimationHeight(step));

export function treeGrowthStep(growth: number) {
  return treeGrowthBeat(treeGrowthFrame(growth).index).step;
}

const restoredHeights = new Map<number, number>();
export function treeHeightAtGrowth(growth: number, restoreCrown = false) {
  const frame = treeGrowthFrame(growth); const step = treeGrowthStep(growth); const original = TREE_GROWTH_HEIGHTS[step];
  if (step < FOLIAGE_START_STEP && !restoreCrown) return original;
  if (!restoredHeights.has(frame.index)) restoredHeights.set(frame.index, Math.max(original, ...createTreeGrowthModel(growth).parts.filter((part) => part.id !== 'grass').map((part) => TREE_WORLD.ground - part.y)));
  return restoredHeights.get(frame.index)!;
}

export function treeGrowthDuration(fromGrowth: number, toGrowth: number) {
  return Math.round(treeGrowthPlayback(treeGrowthFrame(fromGrowth), toGrowth).duration * 1000);
}
