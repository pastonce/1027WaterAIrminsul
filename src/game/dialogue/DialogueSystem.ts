import { DIALOGUE_POOLS, DIALOGUE_RULES } from '../../data/dialogues';
import type { DialogueEntry } from '../../types/game';

export type DialogueDecks = Record<string, string[]>;
export type DreamDialogueCategory = 'visit' | 'story' | 'mechanism' | 'limit' | 'normal';

export function drawDialogue(decks: DialogueDecks, key: string, random = Math.random): { entry: DialogueEntry; decks: DialogueDecks } {
  const entries = DIALOGUE_POOLS[key];
  if (!entries?.length) throw new Error(`Empty dialogue pool: ${key}`);
  const allowed = new Set(entries.map((entry) => entry.id));
  const current = [...new Set((decks[key] ?? []).filter((id) => allowed.has(id)))];
  const remaining = current.length ? current : [...allowed];
  const index = Math.min(remaining.length - 1, Math.max(0, Math.floor(random() * remaining.length)));
  const selected = remaining[index];
  return { entry: entries.find((entry) => entry.id === selected)!, decks: { ...decks, [key]: remaining.filter((id) => id !== selected) } };
}

export function dreamDialogueCategory(roll: number, options: { visitAllowed: boolean; guaranteed: boolean; capped: boolean; story: number; mechanism: number }): DreamDialogueCategory {
  if (options.visitAllowed && options.guaranteed) return 'visit';
  if (roll < DIALOGUE_RULES.visitChance) return options.visitAllowed ? 'visit' : 'normal';
  if (roll < 0.17) return options.story < DIALOGUE_RULES.storyMaximum ? 'story' : 'normal';
  if (roll < 0.21) return options.mechanism < DIALOGUE_RULES.mechanismMaximum ? 'mechanism' : 'normal';
  if (options.capped && roll < 0.66) return 'limit';
  return 'normal';
}
