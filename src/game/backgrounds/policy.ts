export const BACKGROUND_RULES = { transitionMs: 900, timeoutMs: 20000, concurrency: 2, overscan: 1.12 };

export interface BackgroundQuality { compact: boolean; fps: number; density: number; textureSize: number }

export function backgroundQuality(width: number, height: number, density: number): BackgroundQuality {
  const compact = width <= 950 || height <= 600;
  return { compact, fps: compact ? 20 : 30, density: Math.min(Math.max(1, density || 1), compact ? 1 : 1.25), textureSize: compact ? 1024 : 2048 };
}

export function backgroundView(width: number, height: number, design: { width: number; height: number }) {
  const scale = Math.max(width / design.width, height / design.height);
  return { width: width / scale, height: height / scale };
}

export function backgroundParallax(offset: number, height: number) {
  return Math.max(0, Math.min(offset * 0.025, height * 0.04, 36));
}
