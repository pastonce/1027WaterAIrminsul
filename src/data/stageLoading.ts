import type { StageId } from '../types/game';
import pageAssets from './pageAssets.generated.json' with { type: 'json' };

export const LOADING_COLORS = ['#EC4923', '#498FCC', '#359697', '#6957C2', '#66AD16', '#35AACC', '#CC9046'] as const;
export const LOADING_ICON = '/asserts/loading/seven-elements.webp';
export const LOADING_ICON_CENTERS = [54.5, 200.5, 356.5, 512, 669.5, 822.5, 966.5] as const;
export type LoadingArtId = keyof typeof pageAssets.loading;
export interface LoadingArt { id: LoadingArtId; compact: string; full: string; aspect: number; cropped: boolean }
export type LoadingArtChoices = Partial<Record<StageId, LoadingArtId>>;
const art = (...ids: LoadingArtId[]): LoadingArt[] => ids.map((id) => ({ id, ...pageAssets.loading[id] }));
export const STAGE_LOADING_ART: Record<StageId, readonly LoadingArt[]> = {
  A: [], B: art('AB1', 'AB2'), C: art('BC1', 'BC2'), D: art('CD1', 'CD2'),
  E: art('DE1', 'DE2'), F: art('EF1', 'EF2'), G: art('FG1'),
};
export function validateLoadingArtChoices(value: unknown): LoadingArtChoices {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(STAGE_LOADING_ART).flatMap(([stage, entries]) => {
    const choice = (value as Record<string, unknown>)[stage];
    return entries.some((entry) => entry.id === choice) ? [[stage, choice]] : [];
  }));
}
export function completeLoadingArtChoices(value: unknown, random = Math.random): LoadingArtChoices {
  const choices = validateLoadingArtChoices(value);
  for (const [stage, entries] of Object.entries(STAGE_LOADING_ART)) if (entries.length && !choices[stage as StageId]) choices[stage as StageId] = entries[entries.length === 1 ? 0 : Math.min(entries.length - 1, Math.floor(random() * entries.length))].id;
  return choices;
}
export function getLoadingArt(stage: StageId, choice?: string) { return STAGE_LOADING_ART[stage].find((entry) => entry.id === choice) ?? STAGE_LOADING_ART[stage][0]; }
export function loadingArtSource(artwork: LoadingArt, width: number, height: number, density = 1) {
  const compact = width <= 950 || height <= 600;
  return width * Math.min(Math.max(1, density), compact ? 1 : 1.25) <= 1280 ? artwork.compact : artwork.full;
}
export const STAGE_LOADING_RULES = { coverMs: 120, minimumMs: 1800, settleMs: 900, lastMidpoint: LOADING_ICON_CENTERS[6] / 1024, lastPauseMs: 1100, fullMs: 180, revealMs: 280, imageTimeoutMs: 10000 } as const;
