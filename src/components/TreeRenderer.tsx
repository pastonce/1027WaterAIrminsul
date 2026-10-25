import { useEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import { TREE_WORLD } from '../game/tree/geometry';
import { createTreeModel, treeBodyPath } from '../game/tree/model';
import { treeGrowthStep } from '../game/tree/growth';
import { TREE_ANIMATIONS, treePlayback } from '../game/tree/timeline';
import { foliageDuration } from '../game/tree/foliage';
import type { TreeFrame } from '../game/tree/timeline';
import type { TreePart } from '../game/tree/model';
import { TREE_ART, treeArtSource } from '../data/treeArt';
import type { TreeArtId } from '../data/treeArt';
import type { StageId } from '../types/game';

interface Props { growth: number; stage?: StageId; reduced: boolean; growing: boolean; paused?: boolean; compact?: boolean; onInteract(keyboard?: boolean): void }

function ArtPart({ part, compact, interactive, onError, failed }: { part: TreePart; compact: boolean; interactive: boolean; onError(asset: TreeArtId): void; failed: boolean }) {
  const shape = TREE_ART[part.art].outline;
  return <g transform={`matrix(${part.matrix.join(' ')})`} data-tree-part={part.id} data-tree-asset={part.asset} data-tree-art={part.art} data-tree-foliage={part.foliage} data-tree-site={part.site} data-tree-phase={part.phase} data-tree-motion={part.motion}>
    <g transform={`matrix(${TREE_ART[part.art].registration.join(' ')})`}>
      {failed ? <path d={shape} fill="url(#irminsul-leaf)" fillRule="evenodd" pointerEvents="none"/> : <image href={treeArtSource(part.art, compact)} width="1000" height="1000" preserveAspectRatio="none" pointerEvents="none" onError={() => onError(part.art)}/>}
      {interactive && <path className="tree-part-hit" d={shape} fill="#fff" fillOpacity="0" fillRule="evenodd" pointerEvents="visibleFill"/>}
    </g>
  </g>;
}

export function TreeRenderer({ growth, stage, reduced, growing, paused = false, compact = false, onInteract }: Props) {
  const step = treeGrowthStep(growth);
  const continuousLeaves = stage === 'E' || stage === 'F';
  const duration = continuousLeaves ? foliageDuration(step) : TREE_ANIMATIONS[step].duration;
  const [frame, setFrame] = useState<TreeFrame>(() => ({ step, time: duration }));
  const [failed, setFailed] = useState<Set<TreeArtId>>(() => new Set());
  const current = useRef(frame);
  const animation = useRef<gsap.core.Tween | null>(null);
  const pauseState = useRef(paused); pauseState.current = paused;
  const pointerType = useRef('mouse');
  const model = useMemo(() => createTreeModel(frame.step, frame.time, continuousLeaves), [frame, continuousLeaves]);
  const bodyPath = useMemo(() => treeBodyPath(model.body), [model]);
  const onError = (asset: TreeArtId) => setFailed((loaded) => loaded.has(asset) ? loaded : new Set([...loaded, asset]));

  useEffect(() => {
    const present = (value: TreeFrame) => { current.current = value; setFrame(value); };
    if (reduced || step < current.current.step || step > current.current.step + 1) {
      present({ step, time: duration }); return;
    }
    const playback = treePlayback(current.current, step, continuousLeaves ? foliageDuration : 0);
    if (!playback.duration) { present({ step, time: duration }); return; }
    const cursor = { elapsed: 0 };
    const tween = gsap.to(cursor, {
      elapsed: playback.duration, duration: playback.duration, ease: 'none', paused: pauseState.current,
      onUpdate: () => present(playback.at(cursor.elapsed)),
    });
    animation.current = tween;
    return () => { tween.kill(); if (animation.current === tween) animation.current = null; };
  }, [step, reduced, continuousLeaves, duration]);
  useEffect(() => { animation.current?.paused(paused); }, [paused]);

  return <svg className={`dream-tree ${growing ? 'is-growing' : ''}`} data-paused={paused} data-reduced={reduced} data-tree-animation={TREE_ANIMATIONS[frame.step].name} data-tree-time={frame.time} viewBox={`0 0 ${TREE_WORLD.width} ${TREE_WORLD.height}`} width={TREE_WORLD.width} height={TREE_WORLD.height} pointerEvents="none" role="button" aria-label="梦中的树" tabIndex={0}
    onPointerDown={(event) => { pointerType.current = event.pointerType; }}
    onPointerUp={(event) => { if (!paused && event.pointerType !== 'mouse' && event.target !== event.currentTarget) onInteract(); }}
    onClick={(event) => { if (paused) return; if (event.detail === 0) onInteract(true); else if (pointerType.current === 'mouse' && event.target !== event.currentTarget) onInteract(); }}
    onKeyDown={(event) => { if (!paused && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onInteract(true); } }}>
    <defs><linearGradient id="irminsul-leaf" x2=".8" y2="1"><stop stopColor="#f5f0e6"/><stop offset=".42" stopColor="#c1e9dd"/><stop offset="1" stopColor="#5db1bc"/></linearGradient></defs>
    <g className="tree-art" pointerEvents="visiblePainted">
      {model.parts.map((part) => <ArtPart key={part.id} part={part} compact={compact} interactive={part.id !== 'grass' && !model.body.includes(part) && Math.abs(part.matrix[0] * part.matrix[3] - part.matrix[1] * part.matrix[2]) > .000001} failed={failed.has(part.art)} onError={onError}/>)}
      <path className="tree-hit-target" d={bodyPath} fill="#fff" fillOpacity="0" fillRule="nonzero" pointerEvents="visibleFill"/>
    </g>
  </svg>;
}
