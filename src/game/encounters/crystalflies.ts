import { CRYSTALFLIES } from '../../data/inhabitants';
import { seededRandom, TREE_WORLD } from '../tree/geometry';
import { createTreeModel } from '../tree/model';
import { treeGrowthStep } from '../tree/growth';
import { FOLIAGE_ATTACHMENTS, FOLIAGE_START_STEP } from '../tree/foliage';
import { transformTreePoint } from '../tree/timeline';

const models = new Map<string, ReturnType<typeof createTreeModel>>();
function modelAt(step: number, followBranches = false) {
  const key = `${step}-${followBranches}`;
  if (!models.has(key)) models.set(key, createTreeModel(step, undefined, followBranches));
  return models.get(key)!;
}

function buildPlan(seed: number) {
  const random = seededRandom(seed ^ 0x6b4a91d3);
  const intervals = Array.from({ length: 14 }, () => 0.65 + random() * 0.7);
  const total = intervals.reduce((sum, value) => sum + value, 0);
  const used = new Set<string>();
  const sources: string[] = [];
  let threshold = 100;
  let previous = '';
  const entries = Array.from({ length: 15 }, (_, index) => {
    if (index) threshold += intervals[index - 1] / total * 900;
    const unlockedAt = Math.min(1000, Math.ceil(threshold / 20) * 20);
    const model = modelAt(treeGrowthStep(unlockedAt));
    const candidates = model.crown.filter((part) => !used.has(part.id));
    const leaves = candidates.length ? candidates : model.crown;
    const leaf = leaves[Math.floor(random() * leaves.length)] ?? model.body[0]; used.add(leaf.id);
    sources.push(leaf.id);
    const available = CRYSTALFLIES.filter((asset) => asset !== previous);
    const asset = available[Math.floor(random() * available.length)]; previous = asset;
    const elevation = TREE_WORLD.ground - leaf.y - leaf.height * (.25 + random() * .35);
    const horizontal = leaf.x + leaf.width * (.25 + random() * .5) - TREE_WORLD.width / 2 + (random() - .5) * 24;
    return { id: `crystal-${index}`, asset, threshold: unlockedAt, horizontal, elevation, width: 44 + random() * 24, phase: random() * 8 };
  });
  return { entries, sources };
}

interface BranchBinding { site: string; origin: { x: number; y: number }; horizontal: number; elevation: number }
interface CachedPlan extends ReturnType<typeof buildPlan> {
  bindings?: BranchBinding[];
  steps: Map<number, ReturnType<typeof buildPlan>['entries']>;
}
const plans = new Map<number, CachedPlan>();
function planFor(seed: number) {
  if (!plans.has(seed)) {
    plans.set(seed, { ...buildPlan(seed), steps: new Map() });
    if (plans.size > 8) plans.delete(plans.keys().next().value!);
  }
  return plans.get(seed)!;
}
export function crystalPlan(seed: number) {
  return planFor(seed).entries;
}

function anchorsAt(step: number) {
  return modelAt(step, true).crown.filter((part) => part.site).map((part) => ({
    site: part.site!, point: transformTreePoint(part.artMatrix, ...FOLIAGE_ATTACHMENTS[part.asset]),
  }));
}

export function crystalPerches(seed: number, growth: number, followBranches = false) {
  const plan = planFor(seed); const step = treeGrowthStep(growth);
  if (!followBranches || step <= FOLIAGE_START_STEP) return plan.entries;
  if (plan.steps.has(step)) return plan.steps.get(step)!;
  if (!plan.bindings) {
    const used = new Set<string>();
    plan.bindings = plan.entries.map((entry, index) => {
      const anchors = anchorsAt(Math.max(FOLIAGE_START_STEP, treeGrowthStep(entry.threshold)));
      const arriving = entry.threshold > FOLIAGE_START_STEP * 20;
      const available = arriving ? anchors.filter((anchor) => !used.has(anchor.site)) : anchors;
      const candidates = available.length ? available : anchors;
      const horizontal = entry.horizontal + TREE_WORLD.width / 2; const vertical = TREE_WORLD.ground - entry.elevation;
      const anchor = candidates.find((candidate) => candidate.site === plan.sources[index]) ?? candidates.reduce((nearest, candidate) =>
        (candidate.point.x - horizontal) ** 2 + (candidate.point.y - vertical) ** 2 < (nearest.point.x - horizontal) ** 2 + (nearest.point.y - vertical) ** 2 ? candidate : nearest);
      used.add(anchor.site);
      return {
        site: anchor.site, origin: anchor.point,
        horizontal: arriving ? anchor.point.x - TREE_WORLD.width / 2 + Math.sin(entry.phase) * entry.width * .2 : entry.horizontal,
        elevation: arriving ? TREE_WORLD.ground - anchor.point.y + (.35 + Math.cos(entry.phase) * .1) * entry.width : entry.elevation,
      };
    });
  }
  const current = new Map(anchorsAt(step).map((anchor) => [anchor.site, anchor.point]));
  const entries = plan.entries.map((entry, index) => {
    if (growth < entry.threshold) return entry;
    const binding = plan.bindings![index]; const point = current.get(binding.site);
    return point ? { ...entry, horizontal: binding.horizontal + (point.x - binding.origin.x), elevation: binding.elevation - (point.y - binding.origin.y) } : entry;
  });
  plan.steps.set(step, entries);
  return entries;
}
