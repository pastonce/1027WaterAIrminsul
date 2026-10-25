import { STAGES } from './stages';
import { GAME_RULES } from './schedule';
import { TREE_GROWTH_STEPS, TREE_STEP_GROWTH } from '../game/tree/growth';
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

export function visitGrowthCap(stage: DreamStageId, cap: number) {
  return Math.min(cap, STAGES[stage].growth.end, stage === 'F' ? TREE_GROWTH_STEPS * TREE_STEP_GROWTH : Infinity);
}

export function visitGrowth(stage: DreamStageId, growth: number, cap: number) {
  const remaining = Math.max(0, visitGrowthCap(stage, cap) - growth);
  return Math.round((growth + Math.min(remaining, GAME_RULES.growthPerVisit)) * 10) / 10;
}
