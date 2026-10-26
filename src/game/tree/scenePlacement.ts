import { createTreeModel } from './model';
import { TREE_WORLD } from './geometry';

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));
interface TreeBounds { x: number; y: number; width: number; height: number }
export interface TreeBoundsModel { crown: readonly TreeBounds[]; body: readonly TreeBounds[]; roots: readonly TreeBounds[] }
export const TREE_BASE_DEPTH = Math.ceil(Math.max(...createTreeModel(0).roots.map((part) => part.y + part.height)) - TREE_WORLD.ground);

export function sceneRoot(height: number, scale: number, _ground?: number) {
  return height - TREE_BASE_DEPTH * scale + 1;
}

export function treeCanopyFocus(model: TreeBoundsModel, width: number, height: number, root: number, scale: number) {
  const parts = model.crown.length ? model.crown : model.body.length ? model.body : model.roots;
  const left = width / 2 + (Math.min(...parts.map((part) => part.x)) - TREE_WORLD.width / 2) * scale;
  const right = width / 2 + (Math.max(...parts.map((part) => part.x + part.width)) - TREE_WORLD.width / 2) * scale;
  const top = root + (Math.min(...parts.map((part) => part.y)) - TREE_WORLD.ground) * scale;
  const bottom = root + (Math.max(...parts.map((part) => part.y + part.height)) - TREE_WORLD.ground) * scale;
  const visibleTop = Math.max(height <= 600 ? 84 : 104, top);
  const visibleBottom = Math.max(visibleTop, Math.min(height - 105, bottom));
  return { x: clamp((left + right) / 2, 100, width - 100), y: clamp((visibleTop + visibleBottom) / 2, height <= 600 ? 105 : 120, height - 105),
    left, right, top, bottom, radiusX: Math.max(12, (right - left) / 2), radiusY: Math.max(8, (visibleBottom - visibleTop) / 2) };
}
