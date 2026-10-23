import { useId, useLayoutEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import type { WakingPlayback } from '../types/game';

export function WakingReveal({ playback, paused, portrait }: { playback: WakingPlayback | null; paused: boolean; portrait: boolean }) {
  const mask = `${useId()}-waking-eye`;
  const panel = useRef<HTMLDivElement>(null);
  const id = playback?.id;
  useLayoutEffect(() => {
    if (id === undefined || portrait) return;
    panel.current?.focus({ preventScroll: true });
    return () => { queueMicrotask(() => {
      const target = document.querySelector<HTMLElement>('.reality-character:not(:disabled)');
      if (target?.isConnected && !target.closest('[inert]')) target.focus({ preventScroll: true });
    }); };
  }, [id, portrait]);
  useLayoutEffect(() => {
    const element = panel.current;
    const preventWheel = (event: WheelEvent) => event.preventDefault();
    element?.addEventListener('wheel', preventWheel, { passive: false });
    return () => element?.removeEventListener('wheel', preventWheel);
  }, []);
  return <div ref={panel} className="waking-reveal" data-testid="waking-reveal" data-phase={playback?.phase ?? 'black'} data-paused={paused} data-reduced={playback?.reduced ?? false} style={{ '--waking-duration': `${playback?.durationMs ?? 0}ms` } as CSSProperties} tabIndex={-1} role="status" aria-label="正从梦中醒来" aria-busy="true">
    <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
      <defs><mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width="1000" height="1000" style={{ maskType: 'luminance' }}><rect width="1000" height="1000" fill="white"/><ellipse className="waking-eye" cx="500" cy="500" rx="710" ry="710" fill="black"/></mask></defs>
      <rect width="1000" height="1000" fill="black" mask={`url(#${mask})`}/>
    </svg>
  </div>;
}
