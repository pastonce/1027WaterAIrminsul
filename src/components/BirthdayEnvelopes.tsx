import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BIRTHDAY_LETTERS } from '../data/birthdayMail';
import { Icon } from './Icon';
import { PausableTimer } from '../game/core/PausableTimer';

export function EnvelopeGlyph({ year }: { year: number }) {
  return <span className="envelope-glyph" aria-hidden="true">
    <svg className="envelope-base" viewBox="0 0 120 82" fill="none"><rect x="2" y="10" width="116" height="69" rx="4" fill="var(--envelope-paper, #f3ead3)" stroke="#bda77a" strokeWidth="2"/><path d="M3 77 44 41h32l41 36" fill="#e5dfbf" stroke="#bbab80"/><path d="m6 75 37-31m34 0 37 31" stroke="#fff8e1" strokeWidth="2"/><path d="M8 16h104v57H8z" stroke="#b3b78d" strokeWidth=".8"/></svg>
    <span className="envelope-note"><Icon name="leaf" size={25}/></span>
    <svg className="envelope-flap" viewBox="0 0 120 82" fill="none"><path d="M3 12h114L68 51c-5 4-11 4-16 0Z" fill="#f7f1dc" stroke="#bda77a" strokeWidth="1.8"/><path d="M10 16h100L66 47c-4 3-8 3-12 0Z" stroke="#d0c099"/></svg>
    <span className="envelope-seal"><Icon name="leaf" size={15}/></span>
    <span className="envelope-year">{year}</span>
  </span>;
}

export function BirthdayEnvelopes({ disabled, paused, reduced, opened, onOpen }: { disabled: boolean; paused: boolean; reduced: boolean; opened: number | null; onOpen: (index: number, button: HTMLButtonElement) => void }) {
  const timer = useRef(new PausableTimer());
  const random = useRef(((Date.now() ^ Math.floor(performance.now() * 1000)) >>> 0) || 1);
  const [wiggle, setWiggle] = useState({ index: -1, revision: 0 });
  useEffect(() => {
    if (reduced) return;
    const next = () => { random.current = (Math.imul(random.current, 1664525) + 1013904223) >>> 0; return random.current / 4294967296; };
    const schedule = () => timer.current.schedule(() => {
      setWiggle((current) => ({ index: Math.floor(next() * 4), revision: current.revision + 1 }));
      schedule();
    }, 3200 + next() * 4600);
    schedule();
    return () => timer.current.clear();
  }, [reduced]);
  useLayoutEffect(() => { timer.current.setPaused(paused || disabled); }, [paused, disabled]);
  return <div className="birthday-envelopes" role="group" aria-label="生日来信" data-paused={paused || disabled} data-reduced={reduced}>
    {BIRTHDAY_LETTERS.map((letter, index) => <button key={letter.year} className="birthday-envelope" aria-label={`展开 ${letter.year} 年生日来信`} title={`${letter.year} 年生日来信`} disabled={disabled} data-opened={opened === index} data-year={letter.year} onClick={(event) => onOpen(index, event.currentTarget)}>
      <span key={wiggle.index === index ? wiggle.revision : 'rest'} className={wiggle.index === index ? 'envelope-wiggle' : ''}><EnvelopeGlyph year={letter.year}/></span>
    </button>)}
  </div>;
}
