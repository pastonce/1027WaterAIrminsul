import { useEffect, useId, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import { TREE_WORLD } from '../game/tree/geometry';
import { treeBodyPath } from '../game/tree/model';
import { treeGrowthBeat, treeGrowthFrame, treeGrowthPlayback } from '../game/tree/growth';
import type { TreeGrowthFrame } from '../game/tree/growth';
import { TREE_ANIMATIONS } from '../game/tree/timeline';
import { treeGrowthFrameModel } from '../game/tree/presentation';
import { proceduralGrowthAtFrame } from '../game/tree/procedural';
import { ProceduralTreeArt } from './ProceduralTreeArt';
import type { TreePart } from '../game/tree/model';
import { TREE_ART, treeArtSource } from '../data/treeArt';
import type { TreeArtId } from '../data/treeArt';
import type { StageId } from '../types/game';

interface Props { growth: number; stage?: StageId; reduced: boolean; growing: boolean; paused?: boolean; compact?: boolean; procedural?: boolean; seed?: number; onInteract(keyboard?: boolean): void }

function ArtPart({ part, compact, interactive, onError, failed, rootBlend }: { part: TreePart; compact: boolean; interactive: boolean; onError(asset: TreeArtId): void; failed: boolean; rootBlend: string }) {
  const shape = TREE_ART[part.art].outline;
  return <g transform={`matrix(${part.matrix.join(' ')})`} data-tree-part={part.id} data-tree-asset={part.asset} data-tree-art={part.art} data-tree-foliage={part.foliage} data-tree-site={part.site} data-tree-phase={part.phase} data-tree-motion={part.motion}>
    <g transform={`matrix(${TREE_ART[part.art].registration.join(' ')})`} data-root-treatment={part.id.startsWith('overlay') ? 'soft-neck' : undefined} mask={part.id.startsWith('overlay') ? `url(#${rootBlend})` : undefined} clipPath={part.id.startsWith('overlay') ? `url(#${rootBlend}-clip)` : undefined}>
      {failed ? <path d={shape} fill="url(#irminsul-leaf)" fillRule="evenodd" pointerEvents="none"/> : <image href={treeArtSource(part.art, compact)} width="1000" height="1000" preserveAspectRatio="none" pointerEvents="none" onError={() => onError(part.art)}/>}
      {interactive && <path className="tree-part-hit" d={shape} fill="#fff" fillOpacity="0" fillRule="evenodd" pointerEvents="visibleFill"/>}
    </g>
  </g>;
}

export function TreeRenderer({ growth, reduced, growing, paused = false, compact = false, procedural = false, seed = 1027, onInteract }: Props) {
  const rootBlend = `tree-root-${useId().replace(/:/g, '')}`;
  const target = treeGrowthFrame(growth);
  const [frame, setFrame] = useState<TreeGrowthFrame>(() => target);
  const [failed, setFailed] = useState<Set<TreeArtId>>(() => new Set());
  const current = useRef(frame);
  const animation = useRef<gsap.core.Tween | null>(null);
  const pauseState = useRef(paused); pauseState.current = paused;
  const pointerType = useRef('mouse');
  const model = useMemo(() => treeGrowthFrameModel(frame), [frame]);
  const beat = treeGrowthBeat(frame.index);
  const bodyPath = useMemo(() => treeBodyPath(model.body), [model]);
  const onError = (asset: TreeArtId) => setFailed((loaded) => loaded.has(asset) ? loaded : new Set([...loaded, asset]));

  useEffect(() => {
    const present = (value: TreeGrowthFrame) => { current.current = value; setFrame(value); };
    if (reduced || target.index < current.current.index || !growing && target.index > current.current.index + 2) {
      present(target); return;
    }
    const playback = treeGrowthPlayback(current.current, growth);
    if (!playback.duration) { present(target); return; }
    const cursor = { elapsed: 0 };
    const tween = gsap.to(cursor, {
      elapsed: playback.duration, duration: playback.duration, ease: 'none', paused: pauseState.current,
      onUpdate: () => present(playback.at(cursor.elapsed)),
    });
    animation.current = tween;
    return () => { tween.kill(); if (animation.current === tween) animation.current = null; };
  }, [target.index, reduced]);
  useEffect(() => { animation.current?.paused(paused); }, [paused]);

  return <svg className={`dream-tree ${growing ? 'is-growing' : ''}`} data-tree-style={procedural ? 'procedural' : 'irminsul'} data-paused={paused} data-reduced={reduced} data-tree-animation={TREE_ANIMATIONS[beat.step].name} data-tree-time={frame.time} data-tree-index={frame.index} data-tree-pass={beat.pass} viewBox={`0 0 ${TREE_WORLD.width} ${TREE_WORLD.height}`} width={TREE_WORLD.width} height={TREE_WORLD.height} pointerEvents="none" role="button" aria-label="梦中的树" tabIndex={0}
    onPointerDown={(event) => { pointerType.current = event.pointerType; }}
    onPointerUp={(event) => { if (!paused && event.pointerType !== 'mouse' && event.target !== event.currentTarget) onInteract(); }}
    onClick={(event) => { if (paused) return; if (event.detail === 0) onInteract(true); else if (pointerType.current === 'mouse' && event.target !== event.currentTarget) onInteract(); }}
    onKeyDown={(event) => { if (!paused && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onInteract(true); } }}>
    <defs><linearGradient id="irminsul-leaf" x2=".8" y2="1"><stop stopColor="#f5f0e6"/><stop offset=".42" stopColor="#c1e9dd"/><stop offset="1" stopColor="#5db1bc"/></linearGradient>
      <linearGradient id={`${rootBlend}-gradient`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="440"><stop offset=".36" stopColor="white" stopOpacity="0"/><stop offset="1" stopColor="white"/></linearGradient>
      <mask id={rootBlend} maskUnits="userSpaceOnUse" x="0" y="0" width="1000" height="1000" style={{ maskType: 'alpha' }}><rect width="1000" height="1000" fill={`url(#${rootBlend}-gradient)`}/></mask>
      <clipPath id={`${rootBlend}-clip`}><rect y="160" width="1000" height="840"/></clipPath>
    </defs>
    <g className="tree-art" pointerEvents="visiblePainted">
      {procedural ? <><ProceduralTreeArt growth={proceduralGrowthAtFrame(frame)} seed={seed} prefix={rootBlend} flowering={growth >= 680}/>{model.roots.filter((part) => part.id === 'grass').map((part) => <ArtPart key={part.id} part={part} compact={compact} rootBlend={rootBlend} interactive={false} failed={failed.has(part.art)} onError={onError}/>)}</> : <>
        {model.parts.map((part) => <ArtPart key={part.id} part={part} compact={compact} rootBlend={rootBlend} interactive={part.id !== 'grass' && !model.body.includes(part) && Math.abs(part.matrix[0] * part.matrix[3] - part.matrix[1] * part.matrix[2]) > .000001} failed={failed.has(part.art)} onError={onError}/>)}
        <path className="tree-hit-target" d={bodyPath} fill="#fff" fillOpacity="0" fillRule="nonzero" pointerEvents="visibleFill"/>
      </>}
    </g>
  </svg>;
}
