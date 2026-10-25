import source from './dialogues.generated.json' with { type: 'json' };
import type { DialogueEntry } from '../types/game';
import type { DialogueCatalog } from './dialogueSource';
import type { StageId } from '../types/game';

export const DIALOGUE_RULES = { visitChance: 0.13, storyChance: 0.13, mechanismChance: 0.07, limitChance: 0.45, storyMaximum: 2, mechanismMaximum: 1, dreamIdleMs: 60000, realityIdleMs: 20000 } as const;
export const DIALOGUE_POOLS: Record<string, DialogueEntry[]> = Object.fromEntries(Object.entries(source.pools as DialogueCatalog).map(([key, entries]) => [key, entries.map((entry) => ({ ...entry, speaker: entry.anchor === 'user' ? '你' : entry.anchor === 'nahida' ? '纳西妲' : '梦中的世界树？', color: entry.anchor === 'user' ? '#e8ead0' : entry.anchor === 'nahida' ? '#315c2d' : '#d5efb7', speed: entry.anchor === 'nahida' ? 40 : 35, box: 'dream' as const }))]));
export const DIALOGUE_ENTRIES: Record<string, DialogueEntry> = Object.fromEntries(Object.values(DIALOGUE_POOLS).flat().map((entry) => [entry.id, entry]));
export function dialoguePool(key: string) { return DIALOGUE_POOLS[key] ?? []; }
export function dialogueEntry(id: string) { return DIALOGUE_ENTRIES[id]; }
export function transitionDialoguePool(stage: StageId) { return stage === 'G' ? 'G/nahida' : `${stage}/transition`; }

export function dialogueArchive(played: readonly string[], available: readonly StageId[]) {
  const read = new Set(played);
  const unlocked = new Set<string>(available);
  return Object.entries(DIALOGUE_POOLS).flatMap(([key, entries]) => {
    const [scope] = key.split('/');
    return scope === 'shared' || unlocked.has(scope) ? entries.filter((entry) => read.has(entry.id)) : [];
  });
}
