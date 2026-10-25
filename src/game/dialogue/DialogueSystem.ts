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

export function drawUnplayedDialogue(decks: DialogueDecks, key: string, excluded: readonly string[], random = Math.random) {
  const entries = DIALOGUE_POOLS[key]?.filter((entry) => !excluded.includes(entry.id));
  if (!entries?.length) return;
  const current = entries.filter((entry) => decks[key]?.includes(entry.id));
  const remaining = current.length ? current : entries;
  const entry = remaining[Math.min(remaining.length - 1, Math.max(0, Math.floor(random() * remaining.length)))];
  const deck = decks[key]?.length ? decks[key] : DIALOGUE_POOLS[key].map((item) => item.id);
  return { entry, decks: { ...decks, [key]: deck.filter((id) => id !== entry.id) } };
}

export function dreamDialogueCategory(roll: number, options: { visitAllowed: boolean; guaranteed: boolean; capped: boolean; story: number; mechanism: number }): DreamDialogueCategory {
  if (options.visitAllowed && options.guaranteed) return 'visit';
  const storyEnd = DIALOGUE_RULES.visitChance + DIALOGUE_RULES.storyChance;
  const mechanismEnd = storyEnd + DIALOGUE_RULES.mechanismChance;
  if (roll < DIALOGUE_RULES.visitChance) return options.visitAllowed ? 'visit' : 'normal';
  if (roll < storyEnd) return options.story < DIALOGUE_RULES.storyMaximum ? 'story' : 'normal';
  if (roll < mechanismEnd) return options.mechanism < DIALOGUE_RULES.mechanismMaximum ? 'mechanism' : 'normal';
  if (options.capped && roll < mechanismEnd + DIALOGUE_RULES.limitChance) return 'limit';
  return 'normal';
}
