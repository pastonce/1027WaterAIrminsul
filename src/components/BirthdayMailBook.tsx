import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CSSProperties } from 'react';
import { BIRTHDAY_LETTERS, MAIL_ASSETS, birthdayArt, mailBookLayout } from '../data/birthdayMail';
import { BirthdayMailDirector, MAIL_TIMING } from '../game/birthday-mail/BirthdayMailDirector';
import type { MailPlayback } from '../game/birthday-mail/BirthdayMailDirector';
import { useViewportSize } from '../hooks/useViewportSize';
import { Icon } from './Icon';
import { EnvelopeGlyph } from './BirthdayEnvelopes';

export interface OpenedEnvelope { index: number; button: HTMLButtonElement; left: number; top: number; width: number; height: number }

export function BirthdayMailBook({ origin, paused, reduced, onReturning, onComplete }: { origin: OpenedEnvelope; paused: boolean; reduced: boolean; onReturning: () => void; onComplete: () => void }) {
  const viewport = useViewportSize();
  const portrait = viewport.width <= 900 && viewport.height > viewport.width;
  const book = mailBookLayout(viewport.width, viewport.height);
  const callbacks = useRef({ onReturning, onComplete }); callbacks.current = { onReturning, onComplete };
  const [frame, setFrame] = useState<MailPlayback>({ phase: 'unsealing', index: origin.index, direction: 1, reduced });
  const [director] = useState(() => new BirthdayMailDirector(setFrame, () => callbacks.current.onComplete()));
  const [imageState, setImageState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [paperFailed, setPaperFailed] = useState(false);
  const [imageFailed, setImageFailed] = useState<string | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const letter = BIRTHDAY_LETTERS[frame.index];
  const source = birthdayArt(letter.year, viewport.height <= 600 || viewport.width <= 900);
  const reading = frame.phase === 'reading';

  useLayoutEffect(() => { director.open(origin.index, reduced); return () => director.stop(); }, [director, origin.index]);
  useLayoutEffect(() => { director.setReduced(reduced); }, [director, reduced]);
  useLayoutEffect(() => { director.setPaused(paused || portrait); }, [director, paused, portrait]);
  useLayoutEffect(() => { if (frame.phase === 'returning') callbacks.current.onReturning(); }, [frame.phase]);
  useEffect(() => { setImageState('loading'); setImageFailed(null); scroll.current?.scrollTo(0, 0); }, [source, letter.year]);
  useEffect(() => {
    if (!source || imageState !== 'loading') return;
    const timer = setTimeout(() => { setImageState('error'); setImageFailed(source); }, 10000);
    return () => clearTimeout(timer);
  }, [source, imageState]);
  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element || portrait) return;
    element.focus({ preventScroll: true });
    const focusable = () => [...element.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]')];
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); director.close(); }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); director.move(event.key === 'ArrowLeft' ? -1 : 1); }
      if (event.key !== 'Tab') return;
      const items = focusable(); const first = items[0]; const last = items.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === element)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === element)) { event.preventDefault(); first?.focus(); }
    };
    const constrain = (event: FocusEvent) => { if (event.target instanceof Node && !element.contains(event.target)) element.focus({ preventScroll: true }); };
    document.addEventListener('keydown', keyboard); document.addEventListener('focusin', constrain);
    return () => {
      document.removeEventListener('keydown', keyboard); document.removeEventListener('focusin', constrain);
      queueMicrotask(() => { if (origin.button.isConnected && !origin.button.disabled && !origin.button.closest('[inert]')) origin.button.focus({ preventScroll: true }); });
    };
  }, [director, origin.button, portrait]);

  const bounds = origin.button.isConnected && !portrait ? origin.button.getBoundingClientRect() : origin;
  const style = {
    '--mail-origin-x': `${bounds.left + bounds.width / 2 - viewport.width / 2}px`,
    '--mail-origin-y': `${bounds.top + bounds.height / 2 - viewport.height / 2}px`,
    '--mail-origin-scale': Math.min(bounds.width / book.width, bounds.height / book.height),
    '--mail-flight-x': `${viewport.width / 2 - bounds.left - bounds.width / 2}px`,
    '--mail-flight-y': `${viewport.height / 2 - bounds.top - bounds.height / 2}px`,
    '--mail-direction': frame.direction,
    '--mail-arrow': `url("${MAIL_ASSETS.arrow}")`, '--mail-arrow-hover': `url("${MAIL_ASSETS.arrowHover}")`,
    ...Object.fromEntries(Object.entries(MAIL_TIMING).map(([phase, duration]) => [`--mail-${phase}`, `${frame.reduced ? Math.min(120, duration) : duration}ms`])),
  } as CSSProperties;
  return createPortal(<div className="mail-overlay" ref={dialog} role="dialog" aria-modal="true" aria-label="生日来信" tabIndex={-1} aria-hidden={portrait || undefined} data-testid="birthday-mail" data-phase={frame.phase} data-year={letter.year} data-paused={paused || portrait} data-reduced={frame.reduced} data-portrait={portrait} style={style}>
    <button className="mail-close" onClick={() => director.close()} aria-label="收起生日来信" title="收起生日来信"><Icon name="close" size={25}/></button>
    <div className="mail-flight-envelope" data-year={BIRTHDAY_LETTERS[origin.index].year} style={{ left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height }} aria-hidden="true"><EnvelopeGlyph year={BIRTHDAY_LETTERS[origin.index].year}/></div>
    <div className="mail-book-flight" style={book} onPointerDown={(event) => {
      if (!reading || (event.target as Element).closest('button, .mail-letter-scroll')) return;
      swipe.current = { x: event.clientX, y: event.clientY };
    }} onPointerCancel={() => { swipe.current = null; }} onPointerUp={(event) => {
      if (!swipe.current) return;
      const delta = event.clientX - swipe.current.x; const vertical = event.clientY - swipe.current.y; swipe.current = null;
      if (Math.abs(delta) > 40 && Math.abs(delta) > Math.abs(vertical) * 1.5) director.move(delta < 0 ? 1 : -1);
    }}>
      <div className="mail-book" data-paper-failed={paperFailed}>
        {!paperFailed && <img className="mail-book-paper" src={MAIL_ASSETS.book} alt="" draggable={false} onError={() => setPaperFailed(true)}/>}
        <div className="mail-art-page mail-page-content" data-image-state={source ? imageState : 'pending'}>
          <figure className="mail-art-frame">
            {source && imageFailed !== source ? <img key={source} src={source} alt={`${letter.year} 年纳西妲生日贺图`} draggable={false} decoding="async" onLoad={() => setImageState('ready')} onError={() => { setImageState('error'); setImageFailed(source); }}/> : <div className="mail-art-placeholder"><Icon name="leaf" size={60}/><b>{letter.year}</b><span>{source ? '贺图暂时未能展开' : '贺图尚未发布'}</span></div>}
            <figcaption>{letter.year}<span> · </span>花与梦的回信</figcaption>
          </figure>
        </div>
        <div className="mail-letter-page mail-page-content">
          <div className="mail-year-mark" aria-hidden="true"><span/>{letter.year}<span/></div>
          <div className="mail-letter-scroll" ref={scroll} tabIndex={0} aria-label={`${letter.year} 年生日邮件与贺图回复`}>
            <section><div className="mail-section-label"><Icon name="leaf" size={15}/>生日邮件</div><h2>{letter.title || '等待花开的来信'}</h2>
              {letter.mail.length ? letter.mail.map((paragraph, index) => <p key={index}>{paragraph}</p>) : <p className="mail-pending">这封生日邮件尚未公开。</p>}
            </section>
            <section className="mail-reply"><h3><span/>贺图回复<span/></h3>{letter.reply.length ? letter.reply.map((paragraph, index) => <p key={index}>{paragraph}</p>) : <p className="mail-pending">贺图回复尚未公开。</p>}</section>
          </div>
        </div>
        <nav className="mail-navigation" aria-label="年份切换">
          <button className="mail-arrow mail-arrow-left" onClick={() => director.move(-1)} disabled={!reading} aria-label="上一年" title="上一年"/>
          <div className="mail-diamonds">{BIRTHDAY_LETTERS.map((item, index) => <button key={item.year} onClick={() => director.select(index)} aria-label={`${item.year} 年`} aria-current={frame.index === index ? 'page' : undefined} title={`${item.year} 年`} disabled={!reading}><img src={frame.index === index ? MAIL_ASSETS.pointActive : MAIL_ASSETS.point} alt="" draggable={false}/></button>)}</div>
          <button className="mail-arrow mail-arrow-right" onClick={() => director.move(1)} disabled={!reading} aria-label="下一年" title="下一年"/>
        </nav>
      </div>
    </div>
    <span className="sr-only" role="status" aria-live="polite">{reading ? `${letter.year} 年生日来信` : ''}</span>
  </div>, document.body);
}
