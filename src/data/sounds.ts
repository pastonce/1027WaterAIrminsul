import assets from './sounds.generated.json' with { type: 'json' };

export const SOUND_RULES = { defaultVolume: 0.6, maximumVoices: 6, loadTimeoutMs: 5000, maximumBytes: 128 * 1024, retryMs: 5000 } as const;
export const INTERACTION_SOUNDS = {
  dew: { asset: assets.dew, gain: 0.9, rate: 1, cooldownMs: 85, maximum: 2, deadlineMs: 400 },
  water: { asset: assets.water, gain: 0.85, rate: 1, cooldownMs: 350, maximum: 1, deadlineMs: 700 },
  'aranara-appear': { asset: assets.rustle, gain: 0.28, rate: 1, cooldownMs: 100, maximum: 2, deadlineMs: 450 },
  'aranara-disappear': { asset: assets.rustle, gain: 0.22, rate: 0.92, cooldownMs: 100, maximum: 2, deadlineMs: 450 },
  'aranara-jump': { asset: assets.jump, gain: 0.75, rate: 1, cooldownMs: 90, maximum: 2, deadlineMs: 450 },
  transition: { asset: assets.transition, gain: 1, rate: 1, cooldownMs: 1000, maximum: 1, deadlineMs: 1200 },
} as const;
export type InteractionSound = keyof typeof INTERACTION_SOUNDS;
