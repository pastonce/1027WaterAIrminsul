import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { E_SKILL_PATTERN as pattern } from '../data/assets';
import { PausableTimer } from '../game/core/PausableTimer';
import { openingGeometry, openingTracks, openingSpinStop, OPENING_RULES, OPENING_SPIN } from '../game/opening/choreography';
import { StartupLoader } from '../game/assets/StartupLoader';
import type { StartupProgress } from '../game/assets/StartupLoader';
import type { StartupPlan } from '../game/assets/startupPlan';
import { ESkillPiece } from './ESkillPiece';

type OpeningPhase = 'throw' | 'loading' | 'settling' | 'reveal';

export function OpeningReveal({ children, active, reduced, paused, plan, onComplete }: { children: ReactNode; active: boolean; reduced: boolean; paused: boolean; plan: StartupPlan | null; onComplete: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<'loading' | 'playing' | 'fallback'>('loading');
  const [phase, setPhase] = useState<OpeningPhase>('throw');
  const phaseRef = useRef<OpeningPhase>('throw');
  const [held, setHeld] = useState(false);
  const [progress, setProgress] = useState<StartupProgress>({ progress: 0, completed: 0, total: 0, failed: 0, done: false });
  const [retry, setRetry] = useState(0);
  const players = useRef<Array<{ animation: Animation; selector: string }>>([]);
  const spinner = useRef<Animation | null>(null);
  const restAngle = useRef(0);
  const timer = useRef(new PausableTimer());
  const pausedRef = useRef(paused);
  const complete = useRef(onComplete);
  pausedRef.current = paused;
  complete.current = onComplete;
  const changePhase = (next: OpeningPhase) => { phaseRef.current = next; setPhase(next); };
  const playback = () => {
    for (const player of players.current) {
      if (pausedRef.current || ['loading', 'settling'].includes(phaseRef.current)) player.animation.pause();
      else player.animation.play();
    }
    if (pausedRef.current) spinner.current?.pause(); else spinner.current?.play();
  };
  const viewport = () => {
    const bounds = host.current?.getBoundingClientRect();
    return { width: bounds?.width || window.innerWidth, height: bounds?.height || window.innerHeight };
  };
  const rotation = () => {
    const { width, height } = viewport();
    const frame = openingTracks(width, height).find((track) => track.selector === '.opening-flight')!.frames.find((frame) => frame.offset === OPENING_RULES.arriveMs / OPENING_RULES.durationMs)!;
    return Number(String(frame.transform).match(/-?[\d.]+/)![0]);
  };
  const updateTracks = () => {
    const root = host.current;
    if (!root) return;
    const { width, height } = viewport();
    const { artSize, leafSize } = openingGeometry(width, height);
    root.style.setProperty('--opening-art-size', `${artSize}px`);
    root.style.setProperty('--opening-leaf-size', `${leafSize}px`);
    const tracks = openingTracks(width, height);
    for (const player of players.current) {
      const track = tracks.find((entry) => entry.selector === player.selector);
      if (!track || !(player.animation.effect instanceof KeyframeEffect)) continue;
      const frames = track.frames.map((frame) => player.selector === '.opening-flight' && Number(frame.offset) >= OPENING_RULES.arriveMs / OPENING_RULES.durationMs ? { ...frame, transform: `rotate(${Number(String(frame.transform).match(/-?[\d.]+/)![0]) + restAngle.current}deg)` } : frame);
      player.animation.effect.setKeyframes(frames);
    }
  };

  useEffect(() => {
    if (!active || !plan) return;
    const loader = new StartupLoader();
    void loader.load(plan, setProgress);
    return () => loader.cancel();
  }, [active, plan, retry]);

  useEffect(() => {
    if (!active) return;
    if (reduced || typeof Element.prototype.animate !== 'function' || !CSS.supports('clip-path', 'inset(1px)')) { setMode('fallback'); return; }
    let cancelled = false;
    const image = new Image();
    const timeout = setTimeout(() => { if (!cancelled) { cancelled = true; setMode('fallback'); } }, OPENING_RULES.assetWaitMs);
    const settle = (next: 'playing' | 'fallback') => {
      if (cancelled) return;
      cancelled = true; clearTimeout(timeout); setMode(next);
    };
    image.src = pattern.texture;
    void image.decode().then(() => settle('playing'), () => settle('fallback'));
    return () => { cancelled = true; clearTimeout(timeout); image.src = ''; };
  }, [active, reduced]);

  useLayoutEffect(() => {
    if (!active || mode === 'loading' || !host.current || !content.current) return;
    restAngle.current = 0; setHeld(false); updateTracks();
    timer.current.setPaused(pausedRef.current);
    if (mode === 'fallback') {
      changePhase('loading'); content.current.style.opacity = '0';
    } else {
      try {
        const { width, height } = viewport();
        for (const track of openingTracks(width, height)) {
          const target = host.current.querySelector(track.selector);
          if (target) players.current.push({ selector: track.selector, animation: target.animate(track.frames, { duration: OPENING_RULES.durationMs, fill: 'both' }) });
        }
        changePhase('throw'); playback();
        timer.current.schedule(() => {
          changePhase('loading');
          players.current.forEach((player) => { player.animation.pause(); player.animation.currentTime = OPENING_RULES.arriveMs; });
          const leaf = host.current?.querySelector('.opening-flight');
          if (leaf) {
            const angle = rotation();
            spinner.current = leaf.animate([{ transform: `rotate(${angle}deg)`, opacity: 1 }, { transform: `rotate(${angle + 360}deg)`, opacity: 1 }], { duration: 360000 / OPENING_SPIN.degreesPerSecond, iterations: Infinity, fill: 'both' });
            playback();
          }
          timer.current.schedule(() => setHeld(true), OPENING_RULES.holdMs);
        }, OPENING_RULES.arriveMs);
      } catch { setMode('fallback'); }
    }
    window.addEventListener('resize', updateTracks);
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(updateTracks) : null;
    observer?.observe(host.current);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateTracks);
      timer.current.clear(); spinner.current?.cancel(); spinner.current = null;
      players.current.forEach((player) => player.animation.cancel()); players.current = [];
      content.current?.style.removeProperty('clip-path'); content.current?.style.removeProperty('opacity');
    };
  }, [active, mode]);

  useEffect(() => {
    if (!active || !progress.done || phase !== 'loading') return;
    if (mode === 'fallback') {
      changePhase('reveal');
      if (content.current) {
        content.current.style.clipPath = 'none';
        try {
          if (typeof content.current.animate === 'function') players.current.push({ selector: 'fallback', animation: content.current.animate([{ opacity: 0 }, { opacity: 1 }], { duration: OPENING_RULES.fallbackMs, fill: 'both' }) });
          else content.current.style.opacity = '1';
        } catch { content.current.style.opacity = '1'; }
      }
      playback(); timer.current.schedule(() => complete.current(), OPENING_RULES.fallbackMs); return;
    }
    if (!held || mode !== 'playing') return;
    changePhase('settling');
    const stop = openingSpinStop(Number(spinner.current?.currentTime ?? 0));
    const angle = rotation();
    spinner.current?.cancel();
    const leaf = host.current?.querySelector('.opening-flight');
    if (leaf) spinner.current = leaf.animate([
      { offset: 0, transform: `rotate(${angle + stop.from}deg)`, opacity: 1 },
      { offset: stop.glideMs / stop.durationMs, transform: `rotate(${angle + stop.to - stop.brakingAngle}deg)`, opacity: 1, easing: 'cubic-bezier(.3333333333,.6666666667,.6666666667,1)' },
      { offset: 1, transform: `rotate(${angle + stop.to}deg)`, opacity: 1 },
    ], { duration: stop.durationMs, fill: 'both' });
    playback();
    timer.current.schedule(() => {
      restAngle.current = stop.to; updateTracks();
      players.current.forEach((player) => { player.animation.currentTime = OPENING_RULES.splitMs; });
      spinner.current?.cancel(); spinner.current = null;
      changePhase('reveal'); playback();
      timer.current.schedule(() => complete.current(), OPENING_RULES.durationMs - OPENING_RULES.splitMs);
    }, stop.durationMs);
  }, [active, progress.done, phase, held, mode]);

  useLayoutEffect(() => { timer.current.setPaused(paused); playback(); }, [paused]);

  useEffect(() => {
    if (!active) return;
    const previous = document.activeElement;
    overlay.current?.focus({ preventScroll: true });
    const keys = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || /^F\d+$/.test(event.key)) return;
      if (event.target instanceof Element && event.target.closest('.rotate-overlay')) return;
      const retryButton = host.current?.querySelector<HTMLButtonElement>('.opening-retry');
      if (retryButton && event.key === 'Tab') { event.preventDefault(); retryButton.focus(); return; }
      if (retryButton?.contains(event.target as Node) && ['Enter', ' '].includes(event.key)) return;
      if (window.innerWidth <= 900 && window.innerHeight > window.innerWidth && event.key === 'Tab') {
        event.preventDefault(); document.querySelector<HTMLButtonElement>('.rotate-overlay button')?.focus(); return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const wheel = (event: WheelEvent) => event.preventDefault();
    const panel = overlay.current;
    document.addEventListener('keydown', keys, true);
    panel?.addEventListener('wheel', wheel, { passive: false });
    return () => {
      document.removeEventListener('keydown', keys, true);
      panel?.removeEventListener('wheel', wheel);
      if (previous instanceof HTMLElement && content.current?.contains(previous)) previous.focus({ preventScroll: true });
      else content.current?.focus({ preventScroll: true });
    };
  }, [active]);

  const corner = pattern.pieces.find((piece) => piece.name === 'corner_tr')!;
  const centerX = pattern.openingWindow.left + pattern.openingWindow.size / 2;
  const centerY = pattern.openingWindow.top + pattern.openingWindow.size / 2;
  const recenter = `translate(${-centerX} ${-centerY})`;
  return <div ref={host} className="opening-shell" data-opening={active} data-opening-mode={active ? mode : 'complete'} data-paused={paused} data-opening-phase={active ? phase : 'complete'} data-preload-complete={progress.done} data-preload-failed={progress.failed} data-preload-total={progress.total}>
    <div ref={content} className="opening-content" inert={active} aria-hidden={active || undefined} tabIndex={-1}>{children}</div>
    {active && <div ref={overlay} className="opening-overlay" tabIndex={-1} role="status" aria-label="梦境正在展开">
      <span className="sr-only">梦境正在展开</span>
      {mode !== 'loading' && <div className="opening-anchor" aria-hidden="true">
        <div className="opening-flight-travel"><div className="opening-flight-bounce"><svg className={`opening-flight ${mode === 'fallback' ? 'opening-still' : ''}`} data-opening-piece={corner.name} viewBox={`0 0 ${corner.region[2]} ${corner.region[3]}`}><ESkillPiece piece={corner}/></svg></div></div>
        <svg className="opening-frame opening-art" viewBox={pattern.viewBox.join(' ')}>
          <defs><linearGradient id="opening-scan-light"><stop stopColor="#d9ffac" stopOpacity="0"/><stop offset=".5" stopColor="#f0ffce"/><stop offset="1" stopColor="#d9ffac" stopOpacity="0"/></linearGradient><clipPath id="opening-scan-window"><rect x={pattern.openingWindow.left + 2} y={pattern.openingWindow.top + 2} width={pattern.openingWindow.size - 4} height={pattern.openingWindow.size - 4}/></clipPath></defs>
          <g transform={recenter}>{pattern.pieces.filter((piece) => piece.name.startsWith('corner_')).map((piece) => <g key={piece.name} data-opening-corner={piece.name}><g transform={`matrix(${piece.matrix.join(' ')})`}><ESkillPiece piece={piece}/></g></g>)}<g className="opening-structure">{pattern.pieces.filter((piece) => !piece.name.startsWith('corner_')).map((piece) => <g key={piece.name} transform={`matrix(${piece.matrix.join(' ')})`}><ESkillPiece piece={piece}/></g>)}</g><g clipPath="url(#opening-scan-window)"><rect className="opening-scan" x="-250" y="-1" width="500" height="2" fill="url(#opening-scan-light)"/></g></g>
        </svg>
        <svg className="opening-center opening-art" viewBox={pattern.viewBox.join(' ')}><g transform={recenter}><g transform={`matrix(${pattern.openingCenter.matrix.join(' ')})`}><ESkillPiece piece={pattern.openingCenter}/></g></g></svg>
      </div>}
      {mode !== 'loading' && (phase === 'loading' || mode === 'fallback' && phase !== 'reveal') && <div className="opening-loading"><div className="opening-progress" role="progressbar" aria-label="梦境准备" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(progress.progress * 100)}><span style={{ width: `${progress.progress * 100}%` }}/></div><span className="opening-percentage" aria-hidden="true">{Math.floor(progress.progress * 100)}%</span>{progress.blocked && <div className="opening-load-error" role="alert"><p>部分素材未能加载</p><button className="opening-retry" onClick={() => { setProgress({ progress: 0, completed: 0, total: plan?.files.length ?? 0, failed: 0, done: false }); setRetry((value) => value + 1); }}>重试加载</button></div>}</div>}
    </div>}
  </div>;
}
