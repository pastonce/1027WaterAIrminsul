import type { BackgroundEntrance } from '../../data/backgrounds';

export const FOREST_ENTRANCE_SECONDS = 61 / 18;

export function entrancePose(entrance: BackgroundEntrance | undefined, seconds: number) {
  if (!entrance || seconds >= entrance.end / 18) return { vertical: 0, scale: 1, opacity: 1 };
  const frame = Math.max(0, seconds) * 18;
  const start = entrance.start ?? 0;
  const progress = Math.max(0, Math.min(1, (frame - start) / (entrance.end - start)));
  const remaining = 1 - progress;
  const eased = entrance.ease === 'back' ? 1 - 2.70158 * remaining ** 3 + 1.70158 * remaining ** 2 : 1 - remaining ** 3;
  let opacity = start > 0 ? Math.max(0, Math.min(1, (frame - start) / 8)) : 1;
  if (entrance.light) {
    const pulse = frame < 34 ? 0 : frame < 38 ? (frame - 34) / 4 : frame < 42 ? (42 - frame) / 4 : Math.min(1, (frame - 42) / 14);
    opacity = (1 - Math.cos(Math.PI * pulse)) / 2 * (frame < 42 ? 0.5 : 1);
  }
  return { vertical: entrance.vertical * (1 - eased), scale: 1, opacity };
}
