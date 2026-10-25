import source from '../../data/treeGrowth.generated.json' with { type: 'json' };
import type { TreeArtId } from '../../data/treeArt';
import { TREE_WORLD } from './geometry';

interface VectorKey { time?: number; x?: number; y?: number; curve?: 'stepped' }
interface RotateKey { time?: number; value?: number; curve?: 'stepped' }
interface AttachmentKey { time?: number; name?: string }
interface BoneTimelines { translate?: VectorKey[]; scale?: VectorKey[]; shear?: VectorKey[]; rotate?: RotateKey[] }
interface Bone { name: string; parent?: string; x?: number; y?: number; rotation?: number; scaleX?: number; scaleY?: number; shearX?: number; shearY?: number }
interface Attachment { x?: number; y?: number; rotation?: number; scaleX?: number; scaleY?: number; width: number; height: number }
interface Clip { name: string; duration: number; bones: Record<string, BoneTimelines>; slots: Record<string, { attachment: AttachmentKey[] }> }
interface TreeSource { space: { scale: number; originX: number; groundY: number }; bones: Bone[]; slots: { name: string; bone: string; attachment?: string }[]; attachments: Record<string, Record<string, Attachment>>; clips: Clip[] }
export type TreeMatrix = [number, number, number, number, number, number];
export interface TreeFrame { step: number; time: number }
export interface TreeSlot { id: string; asset: TreeArtId; matrix: TreeMatrix }

const data = source as unknown as TreeSource;
export const TREE_ANIMATIONS = data.clips;
const radians = (degrees: number) => degrees * Math.PI / 180;
export const boundedTreeStep = (step: number) => Math.max(0, Math.min(51, Number.isFinite(step) ? Math.floor(step) : 0));

function sample(keys: (VectorKey | RotateKey)[] | undefined, field: 'x' | 'y' | 'value', time: number, fallback: number) {
  if (!keys?.length || time < (keys[0].time ?? 0)) return fallback;
  const next = keys.findIndex((key) => (key.time ?? 0) > time);
  const previous = keys[next < 0 ? keys.length - 1 : next - 1];
  const value = (key: VectorKey | RotateKey) => (key as { x?: number; y?: number; value?: number })[field] ?? fallback;
  if (next < 0 || previous.curve === 'stepped') return value(previous);
  const amount = (time - (previous.time ?? 0)) / ((keys[next].time ?? 0) - (previous.time ?? 0));
  return value(previous) + (value(keys[next]) - value(previous)) * amount;
}

export function transformTreePoint(matrix: TreeMatrix, horizontal: number, vertical: number) {
  return { x: matrix[0] * horizontal + matrix[2] * vertical + matrix[4], y: matrix[1] * horizontal + matrix[3] * vertical + matrix[5] };
}

export function multiplyTreeMatrix(parent: TreeMatrix, local: TreeMatrix): TreeMatrix {
  const origin = transformTreePoint(parent, local[4], local[5]);
  return [parent[0] * local[0] + parent[2] * local[1], parent[1] * local[0] + parent[3] * local[1], parent[0] * local[2] + parent[2] * local[3], parent[1] * local[2] + parent[3] * local[3], origin.x, origin.y];
}

export function treeAnimationPose(step: number, time = TREE_ANIMATIONS[boundedTreeStep(step)].duration): TreeSlot[] {
  const clip = TREE_ANIMATIONS[boundedTreeStep(step)];
  const elapsed = Math.max(0, Math.min(clip.duration, Number.isFinite(time) ? time : 0));
  const matrices = new Map<string, TreeMatrix>();
  for (const bone of data.bones) {
    const timelines = clip.bones[bone.name];
    const rotation = (bone.rotation ?? 0) + sample(timelines?.rotate, 'value', elapsed, 0);
    const horizontal = radians(rotation + (bone.shearX ?? 0) + sample(timelines?.shear, 'x', elapsed, 0));
    const vertical = radians(rotation + 90 + (bone.shearY ?? 0) + sample(timelines?.shear, 'y', elapsed, 0));
    const scaleX = (bone.scaleX ?? 1) * sample(timelines?.scale, 'x', elapsed, 1);
    const scaleY = (bone.scaleY ?? 1) * sample(timelines?.scale, 'y', elapsed, 1);
    const local: TreeMatrix = [Math.cos(horizontal) * scaleX, Math.sin(horizontal) * scaleX, Math.cos(vertical) * scaleY, Math.sin(vertical) * scaleY, (bone.x ?? 0) + sample(timelines?.translate, 'x', elapsed, 0), (bone.y ?? 0) + sample(timelines?.translate, 'y', elapsed, 0)];
    matrices.set(bone.name, bone.parent ? multiplyTreeMatrix(matrices.get(bone.parent)!, local) : local);
  }
  const { scale, originX, groundY } = data.space;
  const world: TreeMatrix = [scale, 0, 0, -scale, TREE_WORLD.width / 2 - originX * scale, TREE_WORLD.ground + groundY * scale];
  return data.slots.flatMap((slot) => {
    const keys = clip.slots[slot.name]?.attachment;
    const key = keys?.filter((entry) => (entry.time ?? 0) <= elapsed).at(-1);
    const name = key ? key.name : slot.attachment;
    if (!name) return [];
    const attachment = data.attachments[slot.name][name];
    const rotation = radians(attachment.rotation ?? 0);
    const width = attachment.width * (attachment.scaleX ?? 1); const height = attachment.height * (attachment.scaleY ?? 1);
    const local: TreeMatrix = [Math.cos(rotation) * width / 1000, Math.sin(rotation) * width / 1000, Math.sin(rotation) * height / 1000, -Math.cos(rotation) * height / 1000, (attachment.x ?? 0) - Math.cos(rotation) * width / 2 - Math.sin(rotation) * height / 2, (attachment.y ?? 0) - Math.sin(rotation) * width / 2 + Math.cos(rotation) * height / 2];
    return [{ id: slot.name, asset: name as TreeArtId, matrix: multiplyTreeMatrix(world, multiplyTreeMatrix(matrices.get(slot.bone)!, local)) }];
  });
}

export function treeAnimationHeight(step: number) {
  const parts = treeAnimationPose(step);
  const body = parts.filter((part) => part.id !== 'grass');
  const top = Math.min(...(body.length ? body : parts).flatMap((part) => [[0, 0], [1000, 0], [0, 1000], [1000, 1000]].map(([horizontal, vertical]) => transformTreePoint(part.matrix, horizontal, vertical).y)));
  return Math.max(0, TREE_WORLD.ground - top);
}

export function treePlayback(from: TreeFrame, target: number, minimumDuration: number | ((step: number) => number) = 0) {
  const destination = boundedTreeStep(target);
  const stepDuration = (step: number) => {
    const minimum = typeof minimumDuration === 'function' ? minimumDuration(step) : minimumDuration;
    return Math.max(TREE_ANIMATIONS[step].duration, Number.isFinite(minimum) ? minimum : 0);
  };
  const segments: { step: number; time: number; start: number; end: number }[] = [];
  let duration = 0;
  for (let step = from.step; step <= destination; step++) {
    const time = step === from.step ? from.time : 0;
    const remaining = stepDuration(step) - time;
    if (remaining <= .000001) continue;
    segments.push({ step, time, start: duration, end: duration + remaining }); duration += remaining;
  }
  return {
    duration,
    at(elapsed: number): TreeFrame {
      const segment = segments.find((entry) => elapsed < entry.end);
      return segment ? { step: segment.step, time: segment.time + Math.max(0, elapsed - segment.start) } : { step: destination, time: stepDuration(destination) };
    },
  };
}
