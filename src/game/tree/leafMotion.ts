import { multiplyTreeMatrix, TREE_ANIMATIONS, treeAnimationPose } from './timeline';
import type { TreeMatrix } from './timeline';

export type LeafMotionKind = 'bud' | 'leaf' | 'cluster1' | 'cluster2' | 'cluster3';

const templates: Record<LeafMotionKind, { step: number; slot: string }> = {
  bud: { step: 25, slot: 'leaf4_1' },
  leaf: { step: 35, slot: 'leaf1_3' },
  cluster1: { step: 37, slot: 'bunch1_3' },
  cluster2: { step: 38, slot: 'bunch2' },
  cluster3: { step: 46, slot: 'bunch3_1' },
};

interface MotionCache {
  inverse: TreeMatrix | undefined;
  progress?: number;
  matrix?: TreeMatrix;
}

const cache = new Map<LeafMotionKind, MotionCache>();
const identity = (): TreeMatrix => [1, 0, 0, 1, 0, 0];

export function leafMotionDuration(kind: LeafMotionKind) {
  return TREE_ANIMATIONS[templates[kind].step].duration;
}

function inverseMatrix(matrix: TreeMatrix): TreeMatrix | undefined {
  const [scaleX, skewY, skewX, scaleY, offsetX, offsetY] = matrix;
  const determinant = scaleX * scaleY - skewX * skewY;
  if (!matrix.every(Number.isFinite) || Math.abs(determinant) < 1e-12) return;
  return [scaleY / determinant, -skewY / determinant, -skewX / determinant, scaleX / determinant, (skewX * offsetY - scaleY * offsetX) / determinant, (skewY * offsetX - scaleX * offsetY) / determinant];
}

export function sampleLeafMotion(kind: LeafMotionKind, progress: number): TreeMatrix {
  const amount = Math.max(0, Math.min(1, Number.isNaN(progress) ? 0 : progress));
  const template = templates[kind];
  let entry = cache.get(kind);
  if (!entry) {
    const settled = treeAnimationPose(template.step).find((part) => part.id === template.slot);
    entry = { inverse: settled ? inverseMatrix(settled.matrix) : undefined };
    cache.set(kind, entry);
  }
  if (entry.progress !== amount || !entry.matrix) {
    const current = amount < 1 && entry.inverse ? treeAnimationPose(template.step, leafMotionDuration(kind) * amount).find((part) => part.id === template.slot) : undefined;
    const matrix = current && entry.inverse ? multiplyTreeMatrix(entry.inverse, current.matrix) : identity();
    entry.matrix = matrix.every(Number.isFinite) ? matrix : identity();
    entry.progress = amount;
  }
  return [...entry.matrix];
}

export function applyLeafMotion(kind: LeafMotionKind, progress: number, settledMatrix: TreeMatrix): TreeMatrix {
  return multiplyTreeMatrix(settledMatrix, sampleLeafMotion(kind, progress));
}
