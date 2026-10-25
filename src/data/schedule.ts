import type { DreamStageId } from '../types/game';

export const SCHEDULE: ReadonlyArray<{ stage: DreamStageId; at: string; cap: number }> = [
  { stage: 'A', at: '2026-10-25T10:27:00+08:00', cap: 180 },
  { stage: 'B', at: '2026-10-25T10:27:00+08:00', cap: 340 },
  { stage: 'C', at: '2026-10-25T10:27:00+08:00', cap: 520 },
  { stage: 'D', at: '2026-10-26T10:27:00+08:00', cap: 680 },
  { stage: 'E', at: '2026-10-26T10:27:00+08:00', cap: 840 },
  { stage: 'F', at: '2026-10-27T10:27:00+08:00', cap: 1027 },
];

export const GAME_RULES = {
  dewCapacity: 1027,
  dewValueMin: 4,
  dewValueMax: 6,
  wateringCost: 20,
  growthPerWatering: 20,
  growthPerVisit: 20,
  maxParticles: 7,
  spawnMin: 1000,
  spawnMax: 2000,
  dewLifetimeMs: 5000,
  dewFadeMs: 300,
  wateringMs: 600,
  growingMs: 800,
} as const;
