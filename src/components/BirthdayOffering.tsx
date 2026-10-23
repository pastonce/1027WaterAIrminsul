import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import type { BirthdayPlayback } from '../types/game';
import { realityLayout } from '../game/camera/sceneLayout';
import { birthdayParticles } from '../game/awakening/birthdayParticles';

const GIFTS = ['date-candy', 'halvamazd'];

export function BirthdayOffering({ playback, paused, width, height }: { playback: BirthdayPlayback; paused: boolean; width: number; height: number }) {
  const layout = realityLayout(width, height);
  const character = layout.character;
  const target = { x: character.left + character.width * 0.51, y: character.top + character.height * 0.57 };
  const origin = { x: layout.userBubble.left - 16, y: height - layout.userBubble.bottom - (height <= 600 ? 110 : 150) };
  const particles = useMemo(() => birthdayParticles(playback.id, height <= 600, playback.reduced), [playback.id, height <= 600, playback.reduced]);
  return <div className="birthday-offering" data-testid="birthday-offering" data-phase={playback.phase} data-paused={paused} data-reduced={playback.reduced} aria-hidden="true">
    {playback.phase === 'gifting' && GIFTS.map((gift, index) => <span key={gift} className="birthday-gift" style={{ left: origin.x, top: origin.y + index * 16, '--gift-x': `${target.x - origin.x + (index ? 46 : -46)}px`, '--gift-y': `${target.y - origin.y - index * 16}px`, '--gift-arc-x': `${(target.x - origin.x) * 0.43 + (index ? 42 : -42)}px`, '--gift-arc-y': `${Math.min(-48, target.y - origin.y - 70) - index * 20}px`, '--gift-delay': `${index * 250}ms` } as CSSProperties}><img src={`/asserts/gifts/${gift}.png`} alt="" draggable={false} decoding="async" onError={(event) => { event.currentTarget.style.visibility = 'hidden'; }}/></span>)}
    {particles.map((particle, index) => <span key={index} className="birthday-falling" style={{ left: `${particle.left}%`, color: particle.color, width: (particle.candy ? height <= 600 ? 26 : 35 : 9) * particle.size, height: (particle.candy ? height <= 600 ? 17 : 23 : 31) * particle.size, '--fall-start': `${-particle.start}px`, '--fall-drift': `${particle.drift * width}px`, '--fall-mid-x': `${(particle.drift * 0.44 + particle.sway) * width}px`, '--fall-drop': `${height + 150 + particle.start}px`, '--fall-rotation': `${particle.rotation}deg`, '--fall-mid-spin': `${particle.rotation + particle.spin * 0.5}deg`, '--fall-spin': `${particle.rotation + particle.spin}deg`, '--fall-delay': `${particle.delay}ms`, '--fall-duration': `${particle.duration}ms` } as CSSProperties}><span className={`birthday-drifting ${particle.candy ? 'birthday-candy' : 'birthday-ribbon'}`}>{particle.candy && <svg viewBox="0 0 36 22"><path d="m12 7-9-5 2 9-2 9 9-5m12-8 9-5-2 9 2 9-9-5" fill="currentColor" stroke="#fff5dc" strokeWidth="1.2"/><rect x="10" y="4" width="16" height="14" rx="6" fill="currentColor" stroke="#fff5dc" strokeWidth="1.5"/><path d="m14 6 8 10m-11-4 8 5" stroke="#fff9e8" strokeWidth="2" fill="none"/></svg>}</span></span>)}
  </div>;
}
