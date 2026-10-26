import type { DialogueCatalog } from './dialogueSource';

export const DEFERRED_DIALOGUE_POOLS: readonly string[] = [];
export interface DialogueReleaseSnapshot { sha256: string; pools: DialogueCatalog; deferredPools?: Record<string, { sourceSha256: string }> }

export function releaseDialoguePools(pools: DialogueCatalog, previous: DialogueReleaseSnapshot, deferred = DEFERRED_DIALOGUE_POOLS) {
  const released = { ...pools };
  const deferredPools: Record<string, { sourceSha256: string }> = {};
  for (const key of deferred) {
    const entries = previous.pools[key];
    if (!entries?.length) throw new Error(`Missing released dialogue pool: ${key}`);
    released[key] = entries.map((entry) => ({ ...entry }));
    deferredPools[key] = { sourceSha256: previous.deferredPools?.[key]?.sourceSha256 ?? previous.sha256 };
  }
  return { pools: released, deferredPools };
}
