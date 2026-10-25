import { leafMotionDuration } from './leafMotion';
import type { LeafMotionKind } from './leafMotion';
import { boundedTreeStep, TREE_ANIMATIONS } from './timeline';

export interface LeafMotionEvent {
  kind: LeafMotionKind;
  delay?: number;
}

const cutTimes: Partial<Record<number, number>> = { 36: .3333, 42: .3333, 45: .3333, 50: .4167 };
const nonnegative = (seconds: number) => Number.isFinite(seconds) ? Math.max(0, seconds) : 0;

export function foliageEventDelay(step: number) {
  return cutTimes[boundedTreeStep(step)] ?? 0;
}

export function leafMotionProgress(kind: LeafMotionKind, elapsed: number, delay = 0) {
  const seconds = Number.isNaN(elapsed) ? 0 : elapsed;
  const start = nonnegative(delay);
  const duration = leafMotionDuration(kind);
  if (seconds <= start) return 0;
  if (seconds >= start + duration) return 1;
  return (seconds - start) / duration;
}

export function foliageStepDuration(step: number, events: readonly LeafMotionEvent[] = []) {
  const frame = boundedTreeStep(step);
  return events.reduce((duration, event) => Math.max(duration, nonnegative(event.delay ?? foliageEventDelay(frame)) + leafMotionDuration(event.kind)), TREE_ANIMATIONS[frame].duration);
}
