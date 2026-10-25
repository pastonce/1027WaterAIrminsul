import { GAME_RULES } from '../../data/schedule';

export function randomDewValue(random = Math.random) {
  const sample = random();
  const amount = Number.isFinite(sample) ? Math.floor(sample * (GAME_RULES.dewValueMax - GAME_RULES.dewValueMin + 1)) : 0;
  return Math.max(GAME_RULES.dewValueMin, Math.min(GAME_RULES.dewValueMax, GAME_RULES.dewValueMin + amount));
}
