import type { DewObstacle } from './placement';
import { TREE_WORLD } from '../tree/geometry';
import { treeGrowthBeat, treeGrowthFrame } from '../tree/growthRoute';
import { presentedTreeBounds, treeGrowthFrameModel } from '../tree/presentation';

export function treeDewObstacles(growth: number, width: number, root: number, scale: number, moving = false, procedural = false, seed = 1027): DewObstacle[] {
  const boxes = new Map<string, DewObstacle>();
  const add = (key: string, part: { x: number; y: number; width: number; height: number }) => {
    const padding = moving ? 12 : 3;
    const left = width / 2 + (part.x - TREE_WORLD.width / 2) * scale - padding;
    const top = root + (part.y - TREE_WORLD.ground) * scale - padding;
    const right = left + part.width * scale + padding * 2;
    const bottom = top + part.height * scale + padding * 2;
    const before = boxes.get(key);
    const x = before ? Math.min(left, before.left) : left;
    const y = before ? Math.min(top, before.top) : top;
    boxes.set(key, { left: x, top: y, width: Math.max(right, before ? before.left + before.width : right) - x, height: Math.max(bottom, before ? before.top + before.height : bottom) - y });
  };
  if (procedural) {
    for (const value of moving ? [Math.max(0, growth - 20), growth] : [growth]) {
      const model = presentedTreeBounds(value, true, seed);
      [...model.body, ...model.crown, ...model.roots].forEach((part, index) => add(`procedural-${index}`, part));
    }
  } else {
    const frame = treeGrowthFrame(growth);
    const frames = [frame];
    if (moving) {
      const previous = treeGrowthFrame(Math.max(0, growth - 20)); frames.push(previous);
      for (let index = previous.index + 1; index <= frame.index; index++) {
        const duration = treeGrowthBeat(index).duration;
        for (const progress of [0, .25, .5, .75]) frames.push({ index, time: duration * progress });
      }
    }
    for (const entry of frames) for (const part of treeGrowthFrameModel(entry).parts) add(part.id, part);
  }
  return [...boxes.values()].filter((box) => box.width > 0 && box.height > 0);
}
