import { useEffect, useRef, useState } from 'react';
import { ASSETS, CHARACTER_ASSETS } from '../data/assets';
import type { CharacterVariant } from '../data/assets';
import { createSpineAdapter } from '../game/visits/CharacterAdapter';
import type { CharacterAdapter } from '../game/visits/CharacterAdapter';
import type { CharacterAction } from '../types/game';

export function NahidaAvatar({ action = 'idle', className = '', variant, paused = false, reduced = false, placeholder = false }: { action?: CharacterAction; className?: string; variant: CharacterVariant; paused?: boolean; reduced?: boolean; placeholder?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const adapter = useRef<CharacterAdapter | null>(null);
  const [failed, setFailed] = useState(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'fallback'>('loading');
  useEffect(() => {
    if (!ref.current) return;
    if (placeholder) { setStatus('fallback'); setFailed(false); return; }
    setStatus('loading');
    setFailed(false);
    const instance = createSpineAdapter(ref.current, variant, setStatus, reduced);
    adapter.current = instance;
    return () => { instance.dispose(); adapter.current = null; };
  }, [variant, reduced, placeholder]);
  useEffect(() => { adapter.current?.play(action); }, [action, variant, reduced, placeholder]);
  useEffect(() => { adapter.current?.setPaused(paused); }, [paused, variant, reduced, placeholder]);
  return <div className={`nahida-avatar ${className}`} data-action={action} data-character={variant} data-renderer={placeholder ? 'placeholder' : status} data-paused={paused || reduced} style={{ aspectRatio: CHARACTER_ASSETS[variant].bounds.width / CHARACTER_ASSETS[variant].bounds.height }} role="img" aria-label="纳西妲">
    <div className="spine-host" ref={ref} aria-hidden="true"/>
    {(placeholder || status !== 'ready') && (failed ? <div className="character-fallback" aria-hidden="true">✧<span>纳西妲</span></div> : <img className="character-static" src={placeholder ? ASSETS.nahida.src : CHARACTER_ASSETS[variant].poster ?? ASSETS.nahida.src} alt="" draggable="false" onError={() => setFailed(true)}/>)}
    <span className="character-shadow"/>
  </div>;
}
