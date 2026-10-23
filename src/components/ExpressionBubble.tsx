import { EXPRESSION_ASSETS, EXPRESSION_RULES } from '../data/expressions';
import type { ExpressionPlayback } from '../types/game';
import type { CSSProperties } from 'react';
import { expressionOutline, expressionPosition } from '../game/expressions/placement';
import type { ExpressionAnchor, ExpressionObstacle } from '../game/expressions/placement';

export function ExpressionBubble({ playback, anchor, width, height, paused, reduced, ground = false, obstacles, onReady, onDismiss }: { playback: ExpressionPlayback; anchor: ExpressionAnchor; width: number; height: number; paused: boolean; reduced: boolean; ground?: boolean; obstacles?: ExpressionObstacle[]; onReady(id: number): void; onDismiss(id: number): void }) {
  const frame = expressionPosition(anchor, width, height, playback.angle, obstacles);
  return <div className="expression-pop" data-ready={playback.ready} data-placed={frame.visible} data-angle={frame.angle} data-origin-x={anchor.x} data-origin-y={anchor.y} data-paused={paused} data-reduced={reduced} data-expression={playback.asset} data-anchor={playback.anchor} aria-hidden="true" style={{ left: frame.left, top: frame.top, width: frame.width, height: frame.height, ...(ground ? { translate: '0 var(--ground-entrance-y, 0px)' } : {}), '--expression-duration': `${EXPRESSION_RULES.visibleMs}ms` } as CSSProperties}>
    <div className="expression-disc"><svg className="expression-outline" viewBox="0 0 100 100" focusable="false"><path d={expressionOutline(frame.tailAngle)}/></svg><img src={EXPRESSION_ASSETS[playback.asset]} alt="" draggable={false} decoding="async" onLoad={() => onReady(playback.id)} onError={() => onDismiss(playback.id)}/></div>
  </div>;
}
