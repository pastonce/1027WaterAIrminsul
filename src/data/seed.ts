export { default as SEED_ART } from './seedAssets.generated.json' with { type: 'json' };
export const SEED_RULES = { fallMs: 1200, reducedFallMs: 100 } as const;
export interface SeedOrigin { x: number; y: number; width: number }
