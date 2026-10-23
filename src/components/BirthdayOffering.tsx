import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import type { BirthdayPlayback } from '../types/game';
import { realityLayout } from '../game/camera/sceneLayout';
import { birthdayParticles } from '../game/awakening/birthdayParticles';

const GIFTS = ['date-candy', 'halvamazd', 'date-candy', 'halvamazd', 'date-candy', 'halvamazd', 'halvamazd'];

export function BirthdayOffering({ playback, paused, width, height }: { playback: BirthdayPlayback; paused: boolean; width: number; height: number }) {
  const layout = realityLayout(width, height);
  const character = layout.character;
  const target = { x: character.left + character.width * 0.51, y: character.top + character.height * 0.57 };
  const origin = { x: layout.userBubble.left - 16, y: height - layout.userBubble.bottom - (height <= 600 ? 110 : 150) };
  const particles = useMemo(() => birthdayParticles(playback.id, height <= 600, playback.reduced), [playback.id, height <= 600, playback.reduced]);
  return <div className="birthday-offering" data-testid="birthday-offering" data-phase={playback.phase} data-paused={paused} data-reduced={playback.reduced} aria-hidden="true">
    {playback.phase === 'gifting' && GIFTS.map((gift, index) => {
      const side = index % 2 ? 1 : -1;
      const start = { x: origin.x + index % 2 * 14, y: origin.y + (index % 3 - 1) * 12 };
      const spread = (height <= 600 ? 25 : 36) + Math.floor(index / 2) * (height <= 600 ? 8 : 12);
      return <span key={`${gift}-${index}`} className="birthday-gift" data-gift={gift} style={{ left: start.x, top: start.y, '--gift-x': `${target.x - start.x + side * spread}px`, '--gift-y': `${target.y - start.y + (index % 3 - 1) * 14}px`, '--gift-arc-x': `${(target.x - start.x) * .43 + side * spread}px`, '--gift-arc-y': `${Math.min(-48, target.y - start.y - 70) - index % 3 * 20}px`, '--gift-delay': `${index * 190}ms` } as CSSProperties}><img src={`/asserts/gifts/${gift}.png`} alt="" draggable={false} decoding="async" onError={(event) => { event.currentTarget.style.visibility = 'hidden'; }}/></span>;
    })}
    {particles.map((particle, index) => <span key={index} className="birthday-falling" style={{ left: `${particle.left}%`, color: particle.color, width: (particle.candy ? height <= 600 ? 26 : 35 : 9) * particle.size, height: (particle.candy ? height <= 600 ? 17 : 23 : 31) * particle.size, '--fall-start': `${-particle.start}px`, '--fall-drift': `${particle.drift * width}px`, '--fall-mid-x': `${(particle.drift * 0.44 + particle.sway) * width}px`, '--fall-drop': `${height + 150 + particle.start}px`, '--fall-rotation': `${particle.rotation}deg`, '--fall-mid-spin': `${particle.rotation + particle.spin * 0.5}deg`, '--fall-spin': `${particle.rotation + particle.spin}deg`, '--fall-delay': `${particle.delay}ms`, '--fall-duration': `${particle.duration}ms` } as CSSProperties}><span className={`birthday-drifting ${particle.candy ? 'birthday-candy' : 'birthday-ribbon'}`}>{particle.candy && <svg viewBox="0 0 36 22"><path d="m12 7-9-5 2 9-2 9 9-5m12-8 9-5-2 9 2 9-9-5" fill="currentColor" stroke="#fff5dc" strokeWidth="1.2"/><rect x="10" y="4" width="16" height="14" rx="6" fill="currentColor" stroke="#fff5dc" strokeWidth="1.5"/><path d="m14 6 8 10m-11-4 8 5" stroke="#fff9e8" strokeWidth="2" fill="none"/></svg>}</span></span>)}
  </div>;
}
