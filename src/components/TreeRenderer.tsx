import { useEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import { createSkeleton, TREE_WORLD, trunkPath, trunkX } from '../game/tree/geometry';
import type { StageConfig } from '../types/game';

interface Props { height: number; seed: number; stage: StageConfig; reduced: boolean; growing: boolean; onInteract(keyboard?: boolean): void }

export function TreeRenderer({ height, seed, stage, reduced, growing, onInteract }: Props) {
  const [renderedHeight, setRenderedHeight] = useState(height);
  const animated = useRef({ value: height });
  const pointerType = useRef('mouse');
  const branches = useMemo(() => createSkeleton(seed), [seed]);

  useEffect(() => {
    const tween = gsap.to(animated.current, {
      value: height, duration: reduced ? 0.08 : 1.2, ease: 'power2.out',
      onUpdate: () => setRenderedHeight(animated.current.value),
    });
    return () => { tween.kill(); };
  }, [height, reduced]);

  const crownY = TREE_WORLD.ground - renderedHeight;
  const crownX = trunkX(renderedHeight);
  const crownWidth = 70 + Math.min(130, renderedHeight / 12);
  const crownLeaves = Math.min(25, Math.max(3, Math.floor(renderedHeight / 18)));
  const flowering = stage.environment.includes('loop-flowers') || stage.environment.includes('petals');

  return <svg className={`dream-tree ${growing ? 'is-growing' : ''} ${stage.environment.includes('shadow') ? 'is-shadowed' : ''}`} viewBox={`0 0 ${TREE_WORLD.width} ${TREE_WORLD.height}`} width={TREE_WORLD.width} height={TREE_WORLD.height} pointerEvents="none" role="button" aria-label="梦中的树" tabIndex={0}
    onPointerDown={(event) => { pointerType.current = event.pointerType; }}
    onPointerUp={(event) => { if (event.pointerType !== 'mouse' && event.target !== event.currentTarget) onInteract(); }}
    onClick={(event) => { if (event.detail === 0) onInteract(true); else if (pointerType.current === 'mouse' && event.target !== event.currentTarget) onInteract(); }}
    onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onInteract(true); } }}>
    <defs>
      <linearGradient id="bark" x1="0" x2="1"><stop stopColor="#46634b"/><stop offset=".38" stopColor="#abc586"/><stop offset=".6" stopColor="#70976b"/><stop offset="1" stopColor="#304e42"/></linearGradient>
      <linearGradient id="leaf" x2=".8" y2="1"><stop stopColor="#e6efad"/><stop offset=".4" stopColor="#a8ce7c"/><stop offset="1" stopColor="#3b8f69"/></linearGradient>
      <radialGradient id="tree-halo"><stop stopColor="#c5efa4" stopOpacity=".22"/><stop offset="1" stopColor="#b9e8a0" stopOpacity="0"/></radialGradient>
      <path id="leaf-shape" d="M0 0C-22-2-35-27-29-48C-5-48 12-24 0 0Z" fill="url(#leaf)"/>
      <filter id="gentle-glow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="4"/></filter>
    </defs>
    <g className="tree-art" pointerEvents="visiblePainted">
    <ellipse cx={crownX} cy={crownY + 20} rx={crownWidth * 2.3} ry="260" fill="url(#tree-halo)" pointerEvents="none"/>
    <g className="tree-roots" stroke="url(#bark)" strokeWidth={5 + Math.min(17, height / 120)} fill="none" strokeLinecap="round">
      <path d="M500 3295Q460 3328 405 3331M498 3300Q522 3334 580 3336M496 3300Q470 3347 453 3352M510 3300Q532 3314 542 3344"/>
    </g>
    <path className="tree-hit-target" d={trunkPath(renderedHeight)} fill="url(#bark)"/>
    <path d={`M500 3300 Q480 ${3300 - renderedHeight * 0.45} ${crownX} ${crownY}`} fill="none" stroke="#e3e7af" strokeWidth="2" opacity=".4"/>
    {branches.filter((branch) => branch.height < renderedHeight - 12).map((branch) => {
      const emergence = Math.min(1, (renderedHeight - branch.height) / 90);
      return <g key={branch.id} data-history={branch.historical ?? undefined}>
        <path d={branch.path} fill="none" stroke={branch.historical === 'freedom' ? '#d0cf8a' : 'url(#bark)'} strokeWidth={Math.max(3, 9 - branch.height / 700)} strokeLinecap="round" pathLength="1" strokeDasharray="1" strokeDashoffset={1 - emergence}/>
        {branch.leaves.map((leaf, index) => {
          const opacity = Math.max(0, (emergence - leaf.ratio * 0.6) / 0.4);
          return <use key={index} href="#leaf-shape" opacity={opacity} pointerEvents={opacity > 0 ? 'visiblePainted' : 'none'} transform={`translate(${branch.startX + branch.direction * branch.length * leaf.ratio} ${branch.startY - branch.rise * leaf.ratio ** 2}) rotate(${leaf.rotation * (index % 2 === 0 ? 1 : -1)}) scale(${leaf.size})`}/>;
        })}
        {branch.historical === 'first-leaf' && <path d={`M${branch.endX} ${branch.endY}q-24-4-17-28q28 1 17 28Z`} fill="#e6df94" className="first-leaf"/>}
        {branch.historical === 'freedom' && <g stroke="#e7dda5" strokeWidth="1" fill="none"><circle cx={branch.endX} cy={branch.endY + 22} r="13"/><path d={`M${branch.endX} ${branch.endY}v38`}/></g>}
      </g>;
    })}
    <g className="tree-crown" style={{ transformOrigin: `${crownX}px ${crownY + 35}px` }}>
      {Array.from({ length: crownLeaves }, (_, index) => {
        const angle = index * 2.39996;
        const radius = Math.sqrt((index + 1) / 25);
        const leafX = crownX + Math.cos(angle) * crownWidth * radius;
        const leafY = crownY + 35 + Math.sin(angle) * Math.min(85, crownWidth * 0.6) * radius;
        return <g key={index}>
          <path d={`M${crownX} ${crownY + 90}Q${leafX} ${crownY + 65} ${leafX} ${leafY}`} fill="none" stroke="#86ac71" strokeWidth="3"/>
          <use href="#leaf-shape" transform={`translate(${leafX} ${leafY + 15}) rotate(${Math.cos(angle) * 65}) scale(${1.1 + radius * 0.45})`}/>
          {flowering && index % 3 === 0 && <g className="tree-flower" transform={`translate(${leafX} ${leafY - 15})`}>{[0, 72, 144, 216, 288].map((angle) => <ellipse key={angle} cy="-6" rx="4" ry="6" transform={`rotate(${angle})`} fill="#f1dece"/>)}<circle r="3" fill="#ffeab0"/></g>}
        </g>;
      })}
    </g>
    {growing && <path d={trunkPath(renderedHeight)} fill="#e1f5af" opacity=".18" filter="url(#gentle-glow)" pointerEvents="none"/>}
    </g>
  </svg>;
}
