import { GameController } from '../core/GameController';
import { SaveManager } from '../save/SaveManager';
import { TimeGateService } from '../time/TimeGateService';
import { DREAM_STAGES } from '../../types/game';
import type { GameSave } from '../../types/game';
import { STAGES } from '../../data/stages';
import { SCHEDULE } from '../../data/schedule';
import { stageVisitIds } from '../../data/visits';

export function createBirthdaySession(save: GameSave) {
  const offset = Math.max(0, Date.parse(SCHEDULE.at(-1)!.at) + 1000 - Date.now());
  const clock = { now: () => Date.now() + offset };
  const key = 'irminsul.birthday-preview.v2';
  const preview: GameSave = { ...save, introSeen: true, sceneStage: 'F', growth: STAGES.F.growth.end, endingComplete: true, completedStages: [...DREAM_STAGES], watchedStories: DREAM_STAGES.map((stage) => STAGES[stage].ending.id), completedVisits: DREAM_STAGES.flatMap(stageVisitIds), pendingVisits: [], pendingWaterings: [], pendingDialogues: [], visitLines: {}, updatedAt: clock.now() };
  const values = new Map([[key, JSON.stringify(preview)]]);
  const storage = { getItem: (name: string) => values.get(name) ?? null, setItem: (name: string, value: string) => { values.set(name, value); }, removeItem: (name: string) => { values.delete(name); } };
  const game = new GameController(new TimeGateService(clock), new SaveManager(storage, key));
  game.prepareBirthdayPreview();
  return { game, clock, previewing: true };
}
