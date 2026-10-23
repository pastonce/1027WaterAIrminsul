import type { StageId, WakingPhase } from '../../types/game';

export const WAKING_SEQUENCE: readonly { phase: WakingPhase; durationMs: number }[] = [
  { phase: 'black', durationMs: 600 },
  { phase: 'first-opening', durationMs: 700 },
  { phase: 'first-hold', durationMs: 350 },
  { phase: 'first-closing', durationMs: 450 },
  { phase: 'first-closed', durationMs: 300 },
  { phase: 'second-opening', durationMs: 850 },
  { phase: 'second-hold', durationMs: 450 },
  { phase: 'second-closing', durationMs: 500 },
  { phase: 'second-closed', durationMs: 300 },
  { phase: 'final-opening', durationMs: 1300 },
  { phase: 'settling', durationMs: 200 },
];

export const WAKING_REDUCED_MS = 650;
export const WAKING_DURATION_MS = WAKING_SEQUENCE.reduce((total, step) => total + step.durationMs, 0);
export function needsWakingReveal(from: StageId, to: StageId, sceneStage?: StageId) { return from === 'F' && to === 'G' && sceneStage !== 'G'; }
