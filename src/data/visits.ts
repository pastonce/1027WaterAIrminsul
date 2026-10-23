import { STAGES } from './stages';
import type { DreamStageId } from '../types/game';

export function stageVisitIds(stage: DreamStageId) { return [STAGES[stage].visit.id, `${STAGES[stage].visit.id}-2`]; }
export function visitDialogue(stage: DreamStageId, id: string) { return id.endsWith('-2') ? STAGES[stage].visit.returnDialogue : STAGES[stage].visit.dialogue; }

interface VisitPlacement { side: 'left' | 'right'; elevation: number; inset?: number }

export const VISIT_PLACEMENTS: Record<DreamStageId, readonly [VisitPlacement, VisitPlacement]> = {
  A: [{ side: 'left', elevation: 0 }, { side: 'right', elevation: 0.08 }],
  B: [{ side: 'left', elevation: 0 }, { side: 'left', elevation: 0.04, inset: 0.08 }],
  C: [{ side: 'left', elevation: 0 }, { side: 'right', elevation: 0.12 }],
  D: [{ side: 'left', elevation: 0 }, { side: 'left', elevation: 0.12, inset: 0.08 }],
  E: [{ side: 'left', elevation: 0 }, { side: 'left', elevation: 0.04, inset: 0.08 }],
  F: [{ side: 'left', elevation: 0 }, { side: 'right', elevation: 0.05 }],
};

export const VISIT_EMITTERS: Record<DreamStageId, { x: number; y: number }> = {
  A: { x: 0.7, y: 0.52 }, B: { x: 0.55, y: 0.42 }, C: { x: 0.5, y: 0.42 },
  D: { x: 0.62, y: 0.5 }, E: { x: 0.55, y: 0.42 }, F: { x: 0.42, y: 0.63 },
};

export function visitGrowth(stage: DreamStageId, growth: number, cap: number, guaranteed: boolean) {
  const config = STAGES[stage];
  const remaining = Math.max(0, Math.min(cap, config.growth.end) - growth);
  return Math.round((growth + Math.min(remaining, guaranteed ? remaining : (config.growth.end - config.growth.start) / 10)) * 10) / 10;
}
