import { GAME_RULES } from '../../data/schedule';
import { STAGES } from '../../data/stages';
import { DREAM_STAGES } from '../../types/game';
import type { GameSave, StageId } from '../../types/game';
import type { TimeGateService } from '../time/TimeGateService';
import { treeHeightAtGrowth } from '../tree/growth';

export function getActiveStage(save: GameSave, time: TimeGateService): StageId {
  const available = time.getGate().available;
  if (save.endingComplete && available.includes('F') && save.growth >= STAGES.F.growth.end) return 'G';
  for (const stage of DREAM_STAGES) {
    if (!available.includes(stage)) return DREAM_STAGES[Math.max(0, DREAM_STAGES.indexOf(stage) - 1)];
    if (save.growth < STAGES[stage].growth.end || !save.completedStages.includes(stage)) return stage;
  }
  return save.endingComplete ? 'G' : 'F';
}

export function stageOrder(stage: StageId) { return [...DREAM_STAGES, 'G'].indexOf(stage); }

export function getSceneStage(save: GameSave, time: TimeGateService): StageId {
  const eligible = getActiveStage(save, time);
  const pending = save.pendingWaterings.map((entry) => entry.stage);
  for (const stage of DREAM_STAGES) if (save.pendingVisits.some((id) => id === `visit-${stage}` || id === `visit-${stage}-2`)) pending.push(stage);
  const saved = save.sceneStage ?? pending.sort((first, second) => stageOrder(first) - stageOrder(second))[0] ?? eligible;
  return stageOrder(saved) <= stageOrder(eligible) ? saved : eligible;
}

export type WateringResult =
  | { ok: true; growth: number; dew: number; gained: number }
  | { ok: false; reason: 'locked' | 'insufficient' | 'finished' };

export function calculateWatering(growth: number, dew: number, cap: number, advanceOnly = false): WateringResult {
  if (cap === 0) return { ok: false, reason: 'locked' };
  if (growth >= cap && !advanceOnly) return { ok: false, reason: 'finished' };
  if (dew < GAME_RULES.wateringCost) return { ok: false, reason: 'insufficient' };
  const nextGrowth = advanceOnly ? growth : Math.min(cap, growth + GAME_RULES.growthPerWatering);
  return { ok: true, growth: nextGrowth, dew: dew - GAME_RULES.wateringCost, gained: nextGrowth - growth };
}

export function getTreeHeight(growth: number, stage?: StageId) {
  return treeHeightAtGrowth(growth, stage === 'E' || stage === 'F');
}
