import { GameController } from '../src/game/core/GameController';
import { SaveManager, SAVE_KEYS, createSave } from '../src/game/save/SaveManager';
import type { StorageLike } from '../src/game/save/SaveManager';
import { TimeGateService } from '../src/game/time/TimeGateService';
import type { Clock } from '../src/game/time/TimeGateService';
import type { GameSave } from '../src/types/game';
import { vi } from 'vitest';
import { SCHEDULE } from '../src/data/schedule';

export class MemoryStorage implements StorageLike {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

export class TestClock implements Clock {
  constructor(public value = Date.parse(SCHEDULE[0].at)) {}
  now() { return this.value; }
}

export function testGame(patch: Partial<GameSave> = {}, clock = new TestClock(), storage = new MemoryStorage()) {
  storage.setItem(SAVE_KEYS.player, JSON.stringify({ ...createSave(clock.now()), introSeen: true, ...patch }));
  const game = new GameController(new TimeGateService(clock), new SaveManager(storage), () => 0.99);
  return { game, clock, storage };
}

export function startScene(game: GameController) {
  game.start();
  game.sceneEntranceReady('A');
}

export function startGame(game: GameController) {
  startScene(game);
  for (let elapsed = 0; elapsed < 10000 && game.getSnapshot().speech?.entry.id === 'R01'; elapsed += 10) vi.advanceTimersByTime(10);
}
