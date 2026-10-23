import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { preload } from 'react-dom';
import type { CSSProperties } from 'react';
import type { SpeechPlayback } from '../types/game';
import { NAHIDA_DIALOGUE_BACKGROUND } from '../data/assets';
import { revealedCharacters, splitDialogue } from '../game/dialogue/textPlayback';
import { dialogueTheme } from '../game/dialogue/dialogueTheme';
import { DialogueOrnament } from './DialogueOrnament';
import { EXPRESSION_ASSETS } from '../data/expressions';

interface BubbleProps {
  speech: SpeechPlayback;
  position: CSSProperties;
  reduced: boolean;
  testing?: boolean;
  side?: 'left' | 'right' | 'bottom';
  onSegments?(sequence: number, parts: string[]): void;
  onHover?(sequence: number, hovered: boolean): void;
  onReveal?(sequence: number, visible: number): void;
}

export function DialogueBubble({ speech, position, reduced, testing = false, side = 'left', onSegments, onHover, onReveal }: BubbleProps) {
  const theme = dialogueTheme(speech.entry, speech.anchor);
  const bubble = useRef<HTMLDivElement>(null);
  const paragraph = useRef<HTMLParagraphElement>(null);
  const probe = useRef<HTMLParagraphElement>(null);
  const sequence = useRef(speech.sequence);
  sequence.current = speech.sequence;
  const text = speech.text ?? speech.entry.text;
  const visibleCount = () => {
    const elapsed = speech.elapsedMs + Math.max(0, Date.now() - speech.startedAt);
    return reduced || speech.typingMs === 0 || speech.phase !== 'speaking' ? text.length : speech.reveal ? revealedCharacters(speech.reveal, elapsed) : Math.min(text.length, Math.floor(elapsed / speech.typingMs * text.length));
  };
  const [visible, setVisible] = useState(visibleCount);
  useEffect(() => { if (speech.expression) preload(EXPRESSION_ASSETS[speech.expression.asset], { as: 'image' }); }, [speech.expression?.asset]);
  useLayoutEffect(() => { onReveal?.(speech.sequence, visibleCount()); }, [speech.sequence, speech.startedAt, visible, reduced, onReveal]);
  useLayoutEffect(() => {
    let active = true;
    const measure = () => {
      if (!active || !paragraph.current || !probe.current || !bubble.current) return;
      const width = paragraph.current.getBoundingClientRect().width;
      const lineHeight = parseFloat(getComputedStyle(paragraph.current).lineHeight);
      if (width <= 0 || !Number.isFinite(lineHeight)) return;
      const measurement = probe.current;
      measurement.style.width = `${width}px`;
      const parts = splitDialogue(speech.entry.text, (part) => {
        measurement.textContent = part;
        return measurement.getBoundingClientRect().height <= lineHeight * 2 + 0.5;
      });
      onSegments?.(speech.sequence, parts);
      onHover?.(speech.sequence, window.matchMedia('(hover: hover)').matches && bubble.current.matches(':hover'));
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    if (paragraph.current) observer?.observe(paragraph.current);
    document.fonts?.ready.then(() => { if (active) measure(); });
    document.fonts?.addEventListener('loadingdone', measure);
    return () => { active = false; observer?.disconnect(); document.fonts?.removeEventListener('loadingdone', measure); };
  }, [speech.sequence, speech.entry.text, onSegments, onHover]);
  useEffect(() => () => onHover?.(sequence.current, false), [onHover]);
  useLayoutEffect(() => {
    setVisible(visibleCount());
    if (reduced || speech.typingMs === 0 || speech.phase !== 'speaking') return;
    let timer: ReturnType<typeof setTimeout>;
    const update = () => {
      const count = visibleCount();
      setVisible(count);
      if (count >= text.length) return;
      const elapsed = speech.elapsedMs + Math.max(0, Date.now() - speech.startedAt);
      const next = speech.reveal?.find((step) => step.end > count)?.at ?? speech.typingMs * (count + 1) / text.length;
      timer = setTimeout(update, Math.max(1, next - elapsed));
    };
    update();
    return () => clearTimeout(timer);
  }, [speech.sequence, speech.startedAt, speech.elapsedMs, speech.phase, reduced]);

  return <div ref={bubble} className={`dialogue-bubble bubble-${side} ${speech.phase === 'fading' ? 'bubble-fading' : ''}`} style={{ ...position, ...(theme === 'nahida' ? { '--bubble-texture': `url("${NAHIDA_DIALOGUE_BACKGROUND}")` } : {}) } as CSSProperties} role="status" aria-live="polite" aria-atomic="true" data-no-drag data-speaker={speech.anchor} data-theme={theme} data-segment={(speech.segment ?? 0) + 1} data-segments={speech.segments ?? 1} data-phase={speech.phase} onPointerEnter={(event) => { if (event.pointerType === 'mouse') onHover?.(speech.sequence, true); }} onPointerLeave={(event) => { if (event.pointerType === 'mouse') onHover?.(speech.sequence, false); }}>
    <DialogueOrnament theme={theme}/>
    {(import.meta.env.DEV || testing) && <span className="bubble-dialogue-id" aria-hidden="true">{speech.entry.id}</span>}
    <strong className="bubble-name">{speech.entry.speaker}</strong>
    <p ref={paragraph} className="bubble-text"><span aria-hidden="true">{text.slice(0, visible)}</span><span className="sr-only">{text}</span></p>
    <p ref={probe} className="bubble-measure" aria-hidden="true"/>
  </div>;
}
