import { useLayoutEffect, useRef } from 'react';
import type { CSSProperties, RefObject } from 'react';
import { presentedTreeBounds } from '../game/tree/presentation';
import type { TreeBoundsModel } from '../game/tree/scenePlacement';
import { treeCanopyFocus } from '../game/tree/scenePlacement';
import { DENDRO_ICON, E_SKILL_PATTERN as pattern } from '../data/assets';
import { PRESENTATION_RULES } from '../data/presentation';
import { ESkillPiece } from './ESkillPiece';
import type { DreamStageId } from '../types/game';

function SkillPattern({ size }: { size: number }) {
  const focusStart = PRESENTATION_RULES.blessingAuraMs + PRESENTATION_RULES.blessingFlowMs;
  return <svg className="blessing-skill-pattern" x={-size / 2} y={-size / 2} width={size} height={size} viewBox={pattern.viewBox.join(' ')}>{pattern.pieces.map((piece) => <g key={piece.name} className="blessing-pattern-piece" data-piece={piece.name} transform={`matrix(${piece.matrix.join(' ')})`} style={{ '--piece-wait': `${focusStart + piece.showDelayMs}ms`, '--piece-reveal': `${piece.showDurationMs}ms` } as CSSProperties}><ESkillPiece piece={piece}/></g>)}</svg>;
}

function Flower() {
  return <g className="blessing-flower">{[0, 90, 180, 270].map((angle) => <path key={angle} transform={`rotate(${angle})`} d="M0 0C-5-3-5-8 0-10C5-8 5-3 0 0Z"/>)}<circle r="1.6"/></g>;
}

export function DendroBlessing({ width, height, scale, root, growth, character, characterRef, emitter = { x: 0.5, y: 0.5 }, phase, paused, reduced, groundFrame, entranceOffset = 0, procedural = false, seed = 1027, stage }: {
  width: number; height: number; scale: number; root: number; treeHeight: number; growth: number;
  character: { left: number; top: number; width: number; height: number };
  characterRef?: RefObject<HTMLDivElement | null>; emitter?: { x: number; y: number };
  phase: 'channel' | 'bloom'; paused: boolean; reduced: boolean;
  groundFrame?: RefObject<((offset: number) => void) | null>; entranceOffset?: number;
  procedural?: boolean; seed?: number; stage?: DreamStageId;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const arrivalTree = useRef<TreeBoundsModel | null>(null);
  const form = useRef(procedural);
  if (form.current !== procedural) { form.current = procedural; arrivalTree.current = null; }
  arrivalTree.current ??= presentedTreeBounds(growth, procedural, seed);
  const size = Math.min(196, Math.max(164, height * .42));
  const effectScale = height <= 600 && stage && ['A', 'B', 'C', 'D'].includes(stage) ? .72 : 1;
  const focus = treeCanopyFocus(arrivalTree.current, width, height, root, scale);
  const targetY = Math.max(size * effectScale / 2 + 16, Math.min(height - size * effectScale / 2 - 16, focus.y));
  const targetX = focus.x;
  const sourceX = character.left + character.width * emitter.x;
  const sourceY = character.top + character.height * emitter.y;
  const distance = targetX - sourceX;
  const route = (offset: number) => `M${sourceX} ${sourceY}C${sourceX + distance * 0.3} ${sourceY - 28} ${targetX - distance * 0.3} ${targetY + offset - 36} ${targetX} ${targetY + offset}`;
  const flow = route(entranceOffset);
  useLayoutEffect(() => {
    let previousOffset = NaN;
    let previousSourceX = NaN; let previousSourceY = NaN;
    const move = (offset: number) => {
      const characterBounds = phase === 'channel' ? characterRef?.current?.querySelector('.nahida-avatar')?.getBoundingClientRect() : null;
      const bounds = characterBounds ? svg.current?.getBoundingClientRect() : null;
      const originX = characterBounds && bounds?.width ? (characterBounds.left + characterBounds.width * emitter.x - bounds.left) * width / bounds.width : sourceX;
      const originY = characterBounds && bounds?.height ? (characterBounds.top + characterBounds.height * emitter.y - bounds.top) * height / bounds.height : sourceY;
      if (offset === previousOffset && originX === previousSourceX && originY === previousSourceY) return;
      previousOffset = offset;
      previousSourceX = originX; previousSourceY = originY;
      const separation = targetX - originX;
      const path = `M${originX} ${originY}C${originX + separation * 0.3} ${originY - 28} ${targetX - separation * 0.3} ${targetY + offset - 36} ${targetX} ${targetY + offset}`;
      svg.current?.querySelector('.blessing-target')?.setAttribute('transform', `translate(${targetX} ${targetY + offset})`);
      svg.current?.querySelectorAll('.blessing-flow-path').forEach((line) => line.setAttribute('d', path));
      svg.current?.querySelectorAll<SVGGElement>('.blessing-flow-particle').forEach((particle) => { particle.style.offsetPath = `path('${path}')`; });
    };
    if (groundFrame) groundFrame.current = move;
    move(entranceOffset);
    return () => { if (groundFrame?.current === move) groundFrame.current = null; };
  }, [sourceX, sourceY, targetX, targetY, entranceOffset, groundFrame, phase, reduced, characterRef, emitter.x, emitter.y, width, height]);
  const timing = {
    '--flow-wait': `${PRESENTATION_RULES.blessingAuraMs}ms`,
    '--flow-duration': `${PRESENTATION_RULES.blessingFlowMs}ms`,
    '--focus-wait': `${PRESENTATION_RULES.blessingAuraMs + PRESENTATION_RULES.blessingFlowMs}ms`,
    '--focus-duration': `${PRESENTATION_RULES.blessingFocusMs}ms`,
  } as CSSProperties;
  return <svg ref={svg} className="dendro-blessing" data-phase={phase} data-paused={paused} data-reduced={reduced} viewBox={`0 0 ${width} ${height}`} style={timing} aria-hidden="true">
    <defs><filter id="blessing-soft-glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="2"/></filter><radialGradient id="blessing-light"><stop stopColor="#dbffb8" stopOpacity=".22"/><stop offset="1" stopColor="#b3f48c" stopOpacity="0"/></radialGradient><linearGradient id="blessing-scan-line"><stop stopColor="#dfffbd" stopOpacity="0"/><stop offset=".5" stopColor="#e5ffbf"/><stop offset="1" stopColor="#dfffbd" stopOpacity="0"/></linearGradient><clipPath id="blessing-scan-window"><rect x="-56" y="-56" width="112" height="112" rx="8"/></clipPath></defs>
    {!reduced && <g className="blessing-flow"><path className="blessing-flow-path blessing-flow-halo" d={flow} pathLength="1"/><path className="blessing-flow-path blessing-flow-thread" d={flow} pathLength="1"/>{Array.from({ length: 9 }, (_, index) => <g key={index} className="blessing-flow-particle" style={{ offsetPath: `path('${flow}')`, '--leaf-delay': `${index * 28}ms` } as CSSProperties}>{index % 3 === 0 ? <Flower/> : <path className="blessing-leaf" d="M-7 0Q0-7 8 0Q0 7-7 0ZM-5 0H6"/>}</g>)}</g>}
    <g transform={`translate(${targetX} ${targetY})`} className="blessing-target"><g className="blessing-effect-scale" transform={`scale(${effectScale})`}><g className="blessing-analysis"><SkillPattern size={size}/><g className="blessing-center"><path className="blessing-lattice" d="M0-45L45 0 0 45-45 0ZM0-32L32 0 0 32-32 0Z"/>{!reduced && <g clipPath="url(#blessing-scan-window)"><rect className="blessing-scan" x="-56" y="-56" width="112" height="3" fill="url(#blessing-scan-line)"/></g>}<image className="blessing-dendro-icon" href={DENDRO_ICON.src} x="-26" y="-26" width="52" height="52"/></g></g>{!reduced && <g className="blessing-resonance">{[0, 1, 2].map((index) => <rect key={index} className="blessing-resolution-ring" x="-37" y="-37" width="74" height="74" rx="6" style={{ '--ring-delay': `${index * 110}ms` } as CSSProperties}/>)}<circle className="blessing-ground-light" r="74" fill="url(#blessing-light)"/></g>}</g></g>
  </svg>;
}
