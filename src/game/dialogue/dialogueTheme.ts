import { DIALOGUE_POOLS } from '../../data/dialogues';
import type { DialogueEntry, SpeechAnchor } from '../../types/game';

export type DialogueTheme = 'forest' | 'story' | 'mechanism' | 'nahida' | 'celebration';

function poolTheme(pool: string): DialogueTheme {
  if (pool === 'G/wish' || pool === 'G/reply') return 'celebration';
  if (pool.endsWith('/story')) return 'story';
  if (pool === 'shared/mechanism') return 'mechanism';
  if (pool.endsWith('/nahida')) return 'nahida';
  return 'forest';
}

const themes = new Map(Object.entries(DIALOGUE_POOLS).flatMap(([pool, entries]) => entries.map((entry) => [entry.id, poolTheme(pool)] as const)));

export function dialogueTheme(entry: DialogueEntry, anchor: SpeechAnchor = entry.anchor ?? 'tree'): DialogueTheme {
  return themes.get(entry.id) ?? (anchor === 'user' ? 'celebration' : anchor === 'nahida' ? 'nahida' : 'forest');
}
