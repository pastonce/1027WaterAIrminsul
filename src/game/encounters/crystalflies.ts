import { CRYSTALFLIES } from '../../data/inhabitants';
import { createSkeleton, seededRandom, trunkX } from '../tree/geometry';
import { getTreeHeight } from '../growth/GrowthSystem';

export function crystalPlan(seed: number) {
  const random = seededRandom(seed ^ 0x6b4a91d3);
  const branches = createSkeleton(seed);
  const intervals = Array.from({ length: 14 }, () => 0.65 + random() * 0.7);
  const total = intervals.reduce((sum, value) => sum + value, 0);
  const used = new Set<string>();
  let threshold = getTreeHeight(100);
  let previous = '';
  return Array.from({ length: 15 }, (_, index) => {
    if (index) threshold += intervals[index - 1] / total * (3050 - getTreeHeight(100));
    const candidates = branches.filter((branch) => branch.height + branch.rise < threshold && !used.has(branch.id)).slice(-4);
    const branch = candidates[Math.floor(random() * candidates.length)] ?? branches[0]; used.add(branch.id);
    const available = CRYSTALFLIES.filter((asset) => asset !== previous);
    const asset = available[Math.floor(random() * available.length)]; previous = asset;
    const ratio = 0.58 + random() * 0.55;
    const elevation = Math.min(threshold - 20, branch.height + branch.rise * ratio + random() * 24 - 8);
    const horizontal = trunkX(branch.height) - 500 + branch.direction * branch.length * ratio + (random() - 0.5) * 42;
    return { id: `crystal-${index}`, asset, threshold, horizontal, elevation, width: 70 + random() * 42, phase: random() * 8 };
  });
}
