import { TREE_ANIMATIONS, treeAnimationHeight } from './timeline';
import { createTreeModel } from './model';
import { TREE_WORLD } from './geometry';
import { foliageDuration } from './foliage';

export const TREE_GROWTH_STEPS = 51;
export const TREE_FINAL_GROWTH = 1027;
export const TREE_STEP_GROWTH = 20;
export const TREE_GROWTH_HEIGHTS = TREE_ANIMATIONS.map((_, step) => treeAnimationHeight(step));

export function treeGrowthStep(growth: number) {
  return Math.max(0, Math.min(TREE_GROWTH_STEPS, Number.isFinite(growth) ? Math.floor(growth / TREE_STEP_GROWTH) : 0));
}

const restoredHeights = new Map<number, number>();
export function treeHeightAtGrowth(growth: number, restoreCrown = false) {
  const step = treeGrowthStep(growth); const original = TREE_GROWTH_HEIGHTS[step];
  if (!restoreCrown) return original;
  if (!restoredHeights.has(step)) restoredHeights.set(step, Math.max(original, ...createTreeModel(step, undefined, true).parts.filter((part) => part.id !== 'grass').map((part) => TREE_WORLD.ground - part.y)));
  return restoredHeights.get(step)!;
}

export function treeGrowthDuration(fromGrowth: number, toGrowth: number) {
  const from = treeGrowthStep(fromGrowth); const to = treeGrowthStep(toGrowth);
  return Math.round(TREE_ANIMATIONS.slice(from + 1, to + 1).reduce((duration, _, index) => duration + foliageDuration(from + 1 + index) * 1000, 0));
}
