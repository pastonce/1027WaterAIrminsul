import source from './dialogues.generated.json' with { type: 'json' };
import assets from './expressionAssets.generated.json' with { type: 'json' };
import type { DreamStageId, ExpressionChoice, ExpressionMarker, ExpressionMode } from '../types/game';

export const EXPRESSION_RULES = { idleMs: 10000, chance: 0.5, visibleMs: 2800, assetWaitMs: 2000, angleMin: -60, angleMax: 30 } as const;
export const EXPRESSION_ASSETS: Record<number, string> = assets;
export const TREE_EXPRESSIONS = source.treeExpressions as Partial<Record<DreamStageId, number[]>>;
export const REALITY_EXPRESSION_IDS = new Set([...source.pools['G/reply'], ...source.pools['G/nahida']].map((entry) => entry.id));

export function pickExpression(choices: readonly number[], random = Math.random) {
  const available = [...new Set(choices.filter((asset) => Number.isInteger(asset) && Boolean(EXPRESSION_ASSETS[asset])))];
  return available[Math.min(available.length - 1, Math.max(0, Math.floor(random() * available.length)))];
}

export function chooseDialogueExpression(markers: readonly ExpressionMarker[] = [], random = Math.random): ExpressionChoice | undefined {
  const modes = (['before', 'middle', 'after'] as ExpressionMode[]).filter((mode) => markers.some((marker) => marker.mode === mode && marker.choices.some((asset) => Boolean(EXPRESSION_ASSETS[asset]))));
  if (!modes.length) return;
  const mode = modes[Math.min(modes.length - 1, Math.max(0, Math.floor(random() * modes.length)))];
  const available = markers.filter((marker) => marker.mode === mode && marker.choices.some((asset) => Boolean(EXPRESSION_ASSETS[asset])));
  const marker = available.length === 1 ? available[0] : available[Math.min(available.length - 1, Math.max(0, Math.floor(random() * available.length)))];
  const asset = pickExpression(marker.choices, random);
  return asset === undefined ? undefined : { asset, mode, offset: marker.offset };
}
