import { TREE_ART, treeArtVariant } from '../../data/treeArt';
import type { TreeArtId } from '../../data/treeArt';
import { TREE_WORLD } from './geometry';
import { boundedTreeStep, multiplyTreeMatrix, treeAnimationPose, transformTreePoint } from './timeline';
import type { TreeMatrix } from './timeline';
import { continuousFoliage, FOLIAGE_START_STEP } from './foliage';
import type { FoliagePlayback, FoliageSlot } from './foliage';
import { anchorTreeLeaves } from './leafAnchors';

type Point = [number, number];
export interface TreePart extends FoliageSlot {
  art: TreeArtId; artMatrix: TreeMatrix;
  x: number; y: number; width: number; height: number;
}
const contours = Object.fromEntries(Object.entries(TREE_ART).map(([name, asset]) => [name, asset.outline.split('M').filter(Boolean).map((loop) => loop.replace('Z', '').split('L').map((point) => point.split(' ').map(Number) as Point))])) as Record<TreeArtId, Point[][]>;
const bounds = Object.fromEntries(Object.entries(contours).map(([name, loops]) => {
  const points = loops.flat();
  return [name, { left: Math.min(...points.map((point) => point[0])), right: Math.max(...points.map((point) => point[0])), top: Math.min(...points.map((point) => point[1])), bottom: Math.max(...points.map((point) => point[1])) }];
})) as Record<TreeArtId, { left: number; right: number; top: number; bottom: number }>;

export function createTreeModel(step: number, time?: number, restoreCrown = false, playback?: FoliagePlayback) {
  const pose = treeAnimationPose(step, time);
  const seedling = pose.some((part) => part.asset === 'tree01' || part.asset === 'tree1');
  const grounded = seedling ? pose.map((part) => part.id === 'grass' ? part : { ...part, matrix: [...part.matrix.slice(0, 5), part.matrix[5] + 16] as TreeMatrix }) : pose;
  const source = anchorTreeLeaves(step, grounded);
  const visual = restoreCrown ? continuousFoliage(step, time, source, playback) : source;
  const parts: TreePart[] = visual.map((part) => {
    const art = treeArtVariant(part.asset, restoreCrown);
    const artMatrix = multiplyTreeMatrix(part.matrix, TREE_ART[art].registration as TreeMatrix);
    const box = bounds[art];
    const corners = [[box.left, box.top], [box.right, box.top], [box.left, box.bottom], [box.right, box.bottom]].map(([horizontal, vertical]) => transformTreePoint(artMatrix, horizontal, vertical));
    const left = Math.min(...corners.map((point) => point.x)); const top = Math.min(...corners.map((point) => point.y));
    return { ...part, art, artMatrix, x: left, y: top, width: Math.max(...corners.map((point) => point.x)) - left, height: Math.max(...corners.map((point) => point.y)) - top };
  });
  const body = parts.filter((part) => /^tree(?:01|[1-9])$/.test(part.asset));
  const crown = parts.filter((part) => part.asset.startsWith('leaf'));
  const roots = parts.filter((part) => part.id === 'grass' || part.id.startsWith('overlay'));
  const upper = body.length || crown.length ? [...body, ...crown] : roots;
  const top = Math.min(...upper.map((part) => part.y));
  const nearTop = upper.filter((part) => part.y < top + 65);
  const canopy = restoreCrown && step >= FOLIAGE_START_STEP ? upper : nearTop;
  const left = Math.min(...canopy.map((part) => part.x)); const right = Math.max(...canopy.map((part) => part.x + part.width));
  return { step: boundedTreeStep(step), parts, body, crown, roots, crownAnchor: { x: (left + right) / 2, y: top + 12, radiusX: Math.max(18, (right - left) / 2), radiusY: Math.min(60, (TREE_WORLD.ground - top) * .16) } };
}

export function treeBodyPath(parts: TreePart[]) {
  return parts.flatMap((part) => contours[part.art].map((loop) => `M${loop.map(([horizontal, vertical]) => {
    const point = transformTreePoint(part.artMatrix, horizontal, vertical);
    return `${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
  }).join('L')}Z`)).join('');
}

export function treeTrunkCenter(step: number, elevation: number, restoreCrown = false) {
  return treeTrunkCenterFromModel(createTreeModel(step, undefined, restoreCrown), elevation);
}

export function treeTrunkCenterFromModel(model: ReturnType<typeof createTreeModel>, elevation: number) {
  const body = model.body[0];
  if (!body) return TREE_WORLD.width / 2;
  const vertical = TREE_WORLD.ground - Math.max(0, elevation);
  let nearest = { distance: Infinity, x: TREE_WORLD.width / 2 };
  for (let row = 0; row <= 64; row++) {
    const point = transformTreePoint(body.artMatrix, TREE_ART[body.art].centerline[row], row / 64 * 1000);
    const distance = Math.abs(point.y - vertical);
    if (distance < nearest.distance) nearest = { distance, x: point.x };
  }
  return nearest.x;
}

export function treeCrown(step: number, restoreCrown = false) { return createTreeModel(step, undefined, restoreCrown).crownAnchor; }
