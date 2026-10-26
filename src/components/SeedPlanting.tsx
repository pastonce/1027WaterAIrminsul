import { useEffect, useLayoutEffect, useRef } from 'react';
import type { CSSProperties, RefObject } from 'react';
import { SEED_ART, SEED_RULES } from '../data/seed';
import type { SeedOrigin } from '../data/seed';
import type { GameSnapshot } from '../types/game';
import { InteractionCue } from './InteractionCue';

export function SeedPlanting({ phase, width, height, root, scale, origin, frameRef, paused, reduced, onPlant }: {
  phase: NonNullable<GameSnapshot['seedPhase']>; width: number; height: number; root: number; scale: number; origin: SeedOrigin | null;
  frameRef: RefObject<HTMLDivElement | null>; paused: boolean; reduced: boolean; onPlant(): void;
}) {
  const button = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    frameRef.current?.style.setProperty('--seed-entry-x', `${phase === 'arriving' ? (origin?.x ?? width / 2) - width / 2 : 0}px`);
    frameRef.current?.style.setProperty('--seed-entry-y', `${phase === 'arriving' ? (origin?.y ?? height / 2) - height / 2 : 0}px`);
    frameRef.current?.style.setProperty('--seed-entry-scale', String(phase === 'arriving' && origin ? origin.width / (height <= 600 ? 48 : 64) : 1));
  }, [frameRef, phase, origin, width, height]);
  useEffect(() => { if (phase === 'waiting' && !paused) button.current?.focus({ preventScroll: true }); }, [phase, paused]);
  return <div ref={frameRef} className="seed-onboarding" data-phase={phase} data-paused={paused} data-reduced={reduced} style={{ '--seed-drop': `${root + 16 * scale - height / 2}px`, '--seed-fall-duration': `${reduced ? SEED_RULES.reducedFallMs : SEED_RULES.fallMs}ms` } as CSSProperties}>
    <div className="seed-flight"><button ref={button} className="plant-seed" disabled={phase !== 'waiting' || paused} onClick={onPlant} aria-label="种下这颗种子" data-no-drag><img src={SEED_ART.src} alt="" draggable={false}/></button>
      {phase === 'waiting' && <InteractionCue className="seed-click-hint" label="点击种下种子" paused={paused} reduced={reduced}/>}
    </div>
  </div>;
}
