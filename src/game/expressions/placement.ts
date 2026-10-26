import { presentedTreeBounds } from '../tree/presentation';
import { treeCanopyFocus } from '../tree/scenePlacement';
import { EXPRESSION_RULES } from '../../data/expressions';
import type { DreamStageId } from '../../types/game';

export interface ExpressionAnchor { x: number; y: number; radiusX: number; radiusY: number; gap?: number }
export interface ExpressionObstacle { left: number; top: number; width: number; height: number }

export function treeExpressionAnchor(width: number, root: number, growth: number, scale: number, height = root + 40 + 100 * scale, stage?: DreamStageId, procedural = false, seed = 1027): ExpressionAnchor {
  const focus = treeCanopyFocus(presentedTreeBounds(growth, procedural, seed), width, height, root, scale);
  const compact = height <= 600;
  const early = stage ? ['A', 'B', 'C', 'D'].includes(stage) : growth <= 680;
  return { x: focus.x - Math.min(28, focus.radiusX * .12), y: Math.min(height - 80, focus.y + (compact ? 58 : 80)), radiusX: Math.min(compact ? 42 : 64, focus.radiusX * .22), radiusY: compact ? 16 : 22, gap: early ? compact ? 18 : 30 : compact ? 4 : 8 };
}

export function nahidaExpressionAnchor(character: ExpressionObstacle): ExpressionAnchor {
  return { x: character.left + character.width * .48, y: character.top + character.height * .25, radiusX: character.width * .28, radiusY: character.height * .14 };
}

export function visitExpressionAnchor(character: ExpressionObstacle, stage: DreamStageId): ExpressionAnchor {
  const heads: Record<DreamStageId, [number, number, number, number]> = {
    A: [.73, .3, .19, .2], B: [.54, .3, .26, .24], C: [.47, .2, .25, .18],
    D: [.63, .31, .23, .19], E: [.54, .3, .26, .24], F: [.48, .48, .19, .14],
  };
  const [headX, headY, radiusX, radiusY] = heads[stage];
  return { x: character.left + character.width * headX, y: character.top + character.height * headY, radiusX: character.width * radiusX, radiusY: character.height * radiusY };
}

export function expressionPosition(anchor: ExpressionAnchor, width: number, height: number, angle: number, obstacles: ExpressionObstacle[] = []) {
  const compact = height <= 600;
  const size = compact ? 70 : 96;
  const gap = anchor.gap ?? (compact ? 16 : 22);
  const margin = 16;
  const toolbar = compact ? 58 : 82;
  const excluded = [{ left: 0, top: 0, width: compact ? 235 : 320, height: toolbar }, { left: width - (compact ? 260 : 350), top: 0, width: compact ? 260 : 350, height: toolbar }, ...obstacles];
  const at = (degrees: number) => {
    const radians = degrees * Math.PI / 180;
    const direction = { x: Math.sin(radians), y: -Math.cos(radians) };
    const extent = Math.hypot(anchor.radiusX * direction.x, anchor.radiusY * direction.y);
    const distance = extent + size * .7 + gap;
    return { left: anchor.x + direction.x * distance - size / 2, top: anchor.y + direction.y * distance - size / 2, width: size, height: size, angle: degrees, tailAngle: radians + Math.PI / 2 };
  };
  const candidates = Array.from({ length: EXPRESSION_RULES.angleMax - EXPRESSION_RULES.angleMin + 1 }, (_, index) => at(EXPRESSION_RULES.angleMin + index)).filter((frame) => {
    const bounds = { left: frame.left - 8, top: frame.top - 8, right: frame.left + size + 8, bottom: frame.top + size + 8 };
    return anchor.y >= 0 && anchor.y <= height && bounds.left >= margin && bounds.right <= width - margin && bounds.top >= margin && bounds.bottom <= height - margin && !excluded.some((area) => bounds.left < area.left + area.width && bounds.right > area.left && bounds.top < area.top + area.height && bounds.bottom > area.top);
  });
  const fraction = Math.max(0, Math.min(1, (angle - EXPRESSION_RULES.angleMin) / (EXPRESSION_RULES.angleMax - EXPRESSION_RULES.angleMin)));
  return { ...(candidates[Math.min(candidates.length - 1, Math.floor(fraction * candidates.length))] ?? at(Math.max(EXPRESSION_RULES.angleMin, Math.min(EXPRESSION_RULES.angleMax, angle)))), visible: candidates.length > 0 };
}

export function expressionOutline(angle: number) {
  const point = (radians: number, radius = 48) => `${50 + Math.cos(radians) * radius} ${50 + Math.sin(radians) * radius}`;
  return `M ${point(angle + .24)} A 48 48 0 1 1 ${point(angle - .24)} L ${point(angle, 64)} Z`;
}
