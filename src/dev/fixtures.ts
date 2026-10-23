import { STAGES } from '../data/stages';
import { DREAM_STAGES } from '../types/game';
import type { GameSave, StageId } from '../types/game';
import { createSave } from '../game/save/SaveManager';
import { stageVisitIds } from '../data/visits';

export function stageFixture(stage: StageId, now: number): GameSave {
  const index = stage === 'G' ? 6 : DREAM_STAGES.indexOf(stage);
  const completed = DREAM_STAGES.slice(0, index);
  return {
    ...createSave(now), introSeen: true, sceneStage: stage,
    growth: stage === 'G' ? STAGES.F.growth.end + 1 : STAGES[stage].growth.start + (stage === 'A' ? 0 : 1),
    completedStages: [...completed],
    completedVisits: completed.flatMap(stageVisitIds),
    watchedStories: completed.map((stageId) => STAGES[stageId].ending.id),
    playedDialogues: [...completed.map((stageId) => STAGES[stageId].transition.id), ...(stage === 'G' ? [STAGES.G.transition.id] : [])],
    dew: 13, endingComplete: stage === 'G',
  };
}
