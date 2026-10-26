import { seededRandom, TREE_WORLD } from './geometry';
import { treeGrowthBeat, treeGrowthFrame } from './growthRoute';
import type { TreeGrowthFrame } from './growthRoute';

export const PROCEDURAL_TREE_RULES = { maximumHeight: 710, maximumHalfWidth: 300, finalAnimatedGrowth: 1020 } as const;
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const endpoints = Array.from({ length: 52 }, (_, index) => treeGrowthFrame(index * 20).index);
const durations = endpoints.map((end, unit) => Array.from({ length: Math.max(0, end - (endpoints[unit - 1] ?? 0)) }, (_, index) => treeGrowthBeat((endpoints[unit - 1] ?? 0) + index + 1).duration).reduce((sum, duration) => sum + duration, 0));

export function proceduralGrowthAtFrame(frame: TreeGrowthFrame) {
  if (frame.index <= 0) return 0;
  const unit = endpoints.findIndex((index) => index >= frame.index);
  if (unit < 0) return PROCEDURAL_TREE_RULES.finalAnimatedGrowth;
  const start = endpoints[unit - 1] ?? 0;
  let elapsed = Math.max(0, Math.min(treeGrowthBeat(frame.index).duration, frame.time));
  for (let index = start + 1; index < frame.index; index++) elapsed += treeGrowthBeat(index).duration;
  return (unit - 1 + clamp(elapsed / durations[unit])) * 20;
}

export function proceduralHeight(growth: number) {
  const progress = clamp(Number.isFinite(growth) ? growth / PROCEDURAL_TREE_RULES.finalAnimatedGrowth : 0);
  return progress ? 30 + (PROCEDURAL_TREE_RULES.maximumHeight - 30) * progress ** .85 : 0;
}

export const proceduralTrunkX = (height: number) => 500 + Math.sin(height / 310) * 16 + Math.sin(height / 107) * 5;
export const PROCEDURAL_LEAF = 'M0 0C-22-2-35-27-29-48C-5-48 12-24 0 0Z';

export function proceduralTrunkPath(height: number) {
  if (height <= 0) return '';
  const count = Math.ceil(height / 18);
  const samples = Array.from({ length: count + 1 }, (_, index) => index / count * height);
  const baseWidth = 5 + Math.min(24, height / 85);
  const widthAt = (sample: number) => Math.max(2.5, baseWidth * (1 - sample / (height + 90) * .84));
  const left = samples.map((sample) => `${proceduralTrunkX(sample) - widthAt(sample)},${TREE_WORLD.ground - sample}`);
  const right = [...samples].reverse().map((sample) => `${proceduralTrunkX(sample) + widthAt(sample)},${TREE_WORLD.ground - sample}`);
  return `M${left.join('L')}L${right.join('L')}Z`;
}

const skeletons = new Map<number, ReturnType<typeof buildSkeleton>>();
function buildSkeleton(seed: number) {
  const random = seededRandom(seed);
  return Array.from({ length: 30 }, (_, index) => {
    const elevation = 32 + index * 21;
    const direction = index % 2 === 0 ? -1 : 1;
    const length = 75 + random() * 120;
    const rise = 30 + random() * 80;
    return { id: `branch-${index}`, elevation, direction, length, rise, historical: index === 0 ? 'first-leaf' : index === 10 ? 'freedom' : null,
      leaves: Array.from({ length: 7 }, (_, leafIndex) => ({ ratio: .4 + leafIndex * .1, rotation: direction * (30 + random() * 65), size: .65 + random() * .5 })) };
  });
}

export function proceduralTree(growth: number, seed: number) {
  if (!skeletons.has(seed)) {
    skeletons.set(seed, buildSkeleton(seed));
    if (skeletons.size > 8) skeletons.delete(skeletons.keys().next().value!);
  }
  const height = proceduralHeight(growth);
  const crownX = proceduralTrunkX(height);
  const crownY = TREE_WORLD.ground - height;
  const crownWidth = 70 + Math.min(130, height / 12);
  const branches = skeletons.get(seed)!.filter((branch) => branch.elevation < height - 12).map((branch) => {
    const startX = proceduralTrunkX(branch.elevation); const startY = TREE_WORLD.ground - branch.elevation;
    const emergence = clamp((height - branch.elevation) / 90);
    return { ...branch, startX, startY, emergence, endX: startX + branch.direction * branch.length, endY: startY - branch.rise,
      path: `M${startX} ${startY}Q${startX + branch.direction * branch.length * .75} ${startY + 8},${startX + branch.direction * branch.length} ${startY - branch.rise}`,
      leaves: branch.leaves.map((leaf, index) => ({ ...leaf, id: `${branch.id}-leaf-${index}`, x: startX + branch.direction * branch.length * leaf.ratio, y: startY - branch.rise * leaf.ratio ** 2, angle: leaf.rotation * (index % 2 === 0 ? 1 : -1), scale: leaf.size * clamp((emergence - leaf.ratio * .6) / .4) })) };
  });
  const crown = Array.from({ length: height ? Math.min(25, Math.max(3, Math.floor(height / 18))) : 0 }, (_, index) => {
    const angle = index * 2.39996; const radius = Math.sqrt((index + 1) / 25);
    return { id: `crown-${index}`, x: crownX + Math.cos(angle) * crownWidth * radius, y: crownY + 50 + Math.sin(angle) * Math.min(85, crownWidth * .6) * radius, angle: Math.cos(angle) * 65, scale: (1.1 + radius * .45) * clamp((height - index * 18) / 36), flowering: index % 3 === 0 };
  });
  const leaves = [...branches.flatMap((branch) => branch.leaves), ...crown].filter((leaf) => leaf.scale > .01);
  const bounds = leaves.map((leaf) => ({ x: leaf.x - 49 * leaf.scale, y: leaf.y - 49 * leaf.scale, width: 98 * leaf.scale, height: 98 * leaf.scale }));
  return { growth, height, crownX, crownY, branches, crown, leaves, bounds: { crown: bounds, body: height ? [{ x: 468, y: crownY, width: 66, height }] : [], roots: [{ x: 89, y: 3271, width: 821, height: 212 }] } };
}

export function proceduralPerch(seed: number, growth: number, threshold: number, index: number) {
  const elevation = proceduralHeight(threshold) - 100;
  const branch = Math.max(0, Math.min(29, Math.floor((elevation - 32) / 21)));
  const leaf = proceduralTree(growth, seed).leaves.find((entry) => entry.id === `branch-${branch}-leaf-${index % 7}`);
  return leaf ? { horizontal: leaf.x - 500 - 8 * leaf.scale, elevation: TREE_WORLD.ground - leaf.y + 20 * leaf.scale } : undefined;
}
