import { DevelopmentClock } from './DevelopmentClock';
import { GameController } from '../game/core/GameController';
import { SaveManager } from '../game/save/SaveManager';
import { TimeGateService } from '../game/time/TimeGateService';
import { SCHEDULE } from '../data/schedule';
import type { GameSave } from '../types/game';

export function createTestingSession(save: GameSave) {
  const clock = new DevelopmentClock({ persist: false, now: Date.parse(SCHEDULE.at(-1)!.at) + 1000 });
  const key = 'irminsul.session-test.v2';
  const values = new Map([[key, JSON.stringify({ ...save, introSeen: true })]]);
  const storage = { getItem: (name: string) => values.get(name) ?? null, setItem: (name: string, value: string) => { values.set(name, value); }, removeItem: (name: string) => { values.delete(name); } };
  const game = new GameController(new TimeGateService(clock), new SaveManager(storage, key));
  return { game, clock, testing: true };
}
