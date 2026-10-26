import { foliageDuration } from './foliage';
import { leafMotionDuration } from './leafMotion';

export type TreeGrowthPass = 'full' | 'leaves' | 'clusters';
export interface TreeGrowthFrame { index: number; time: number }
export interface TreeGrowthBeat { step: number; pass: TreeGrowthPass; duration: number }

const earlyTargets = [
  ...Array.from({ length: 18 }, (_, index) => index),
  18, 20, 21, 23, 24, 26, 27, 29, 30,
  31, 33, 34, 36, 37, 39, 40, 41,
];
const targets = [...earlyTargets, ...Array.from({ length: 17 }, (_, index) => 42 + index)];
const route: { step: number; pass: TreeGrowthPass }[] = [
  ...Array.from({ length: 42 }, (_, step) => ({ step, pass: 'full' as const })),
  ...Array.from({ length: 7 }, (_, index) => [
    { step: 42 + index, pass: 'leaves' as const },
    { step: 42 + index, pass: 'clusters' as const },
  ]).flat(),
  ...[49, 50, 51].map((step) => ({ step, pass: 'full' as const })),
];
const boundedIndex = (index: number) => Math.max(0, Math.min(route.length - 1, Number.isFinite(index) ? Math.floor(index) : 0));

export function treeGrowthBeat(index: number): TreeGrowthBeat {
  const beat = route[boundedIndex(index)];
  return { ...beat, duration: beat.pass === 'clusters' ? leafMotionDuration('cluster1') : foliageDuration(beat.step) };
}

export function treeGrowthFrame(growth: number): TreeGrowthFrame {
  const unit = Math.max(0, Math.min(targets.length - 1, Number.isFinite(growth) ? Math.floor(growth / 20) : 0));
  const index = targets[unit];
  return { index, time: treeGrowthBeat(index).duration };
}

export function treeGrowthPlayback(from: TreeGrowthFrame, toGrowth: number) {
  const destination = treeGrowthFrame(toGrowth);
  const origin = boundedIndex(from.index);
  const segments: { index: number; time: number; start: number; end: number }[] = [];
  let duration = 0;
  for (let index = origin; index <= destination.index; index++) {
    const seconds = treeGrowthBeat(index).duration;
    const time = index === origin ? Math.max(0, Math.min(seconds, Number.isFinite(from.time) ? from.time : 0)) : 0;
    const remaining = seconds - time;
    if (remaining <= .000001) continue;
    segments.push({ index, time, start: duration, end: duration + remaining });
    duration += remaining;
  }
  return {
    duration,
    at(elapsed: number): TreeGrowthFrame {
      const seconds = Number.isNaN(elapsed) ? 0 : Math.max(0, elapsed);
      const segment = segments.find((entry) => seconds < entry.end);
      return segment ? { index: segment.index, time: segment.time + seconds - segment.start } : { ...destination };
    },
  };
}
