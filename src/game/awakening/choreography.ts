import type { StageId, WakingPhase } from '../../types/game';

export const WAKING_SEQUENCE: readonly { phase: WakingPhase; durationMs: number }[] = [
  { phase: 'black', durationMs: 800 },
  { phase: 'first-opening', durationMs: 1000 },
  { phase: 'first-hold', durationMs: 500 },
  { phase: 'first-closing', durationMs: 600 },
  { phase: 'first-closed', durationMs: 450 },
  { phase: 'second-opening', durationMs: 1200 },
  { phase: 'second-hold', durationMs: 650 },
  { phase: 'second-closing', durationMs: 700 },
  { phase: 'second-closed', durationMs: 450 },
  { phase: 'final-opening', durationMs: 1800 },
  { phase: 'settling', durationMs: 250 },
];

export const WAKING_REDUCED_MS = 650;
export const WAKING_DURATION_MS = WAKING_SEQUENCE.reduce((total, step) => total + step.durationMs, 0);
export function needsWakingReveal(from: StageId, to: StageId, sceneStage?: StageId) { return from === 'F' && to === 'G' && sceneStage !== 'G'; }
