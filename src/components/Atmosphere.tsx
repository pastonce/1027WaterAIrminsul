import { useEffect, useRef } from 'react';
import type { SecretEffect, StageConfig } from '../types/game';
import { ASSETS, getStageBackground } from '../data/assets';
import type { BackgroundAsset } from '../data/assets';
import { SpineBackground } from './SpineBackground';
import type { RoamingLayer } from '../game/encounters/RoamingLayer';
import { STAGE_LOADING_RULES } from '../data/stageLoading';

export function Atmosphere({ stage, offset, reduced, effects, night, paused = false, onBackgroundFrame, onBackgroundReady, inhabitants }: { stage: StageConfig; offset: number; reduced: boolean; effects: SecretEffect[]; night: boolean; paused?: boolean; onBackgroundFrame?: (asset: BackgroundAsset | null, time: number) => void; onBackgroundReady?: (asset: BackgroundAsset | null) => void; inhabitants?: RoamingLayer }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const moon = night || effects.includes('moon');
  const petals = stage.environment.includes('petals') || effects.includes('petals') || effects.includes('birthday');
  const background = getStageBackground(stage.id);
  const landscape = useRef<HTMLImageElement>(null);
  useEffect(() => {
    if (stage.id !== 'G' || !onBackgroundReady) return;
    const image = landscape.current;
    if (image?.complete && image.naturalWidth > 0) onBackgroundReady(null);
    const timeout = setTimeout(() => { if (image && (!image.complete || image.naturalWidth === 0)) { image.hidden = true; onBackgroundReady(null); } }, STAGE_LOADING_RULES.imageTimeoutMs);
    return () => clearTimeout(timeout);
  }, [stage.id, onBackgroundReady]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    let width = 0;
    let height = 0;
    let frame = 0;
    let lastFrame = 0;
    const draw = (timestamp: number) => {
      if (document.hidden) return;
      if (timestamp - lastFrame > 32 || reduced) {
        lastFrame = timestamp;
        context.clearRect(0, 0, width, height);
        const count = reduced ? 8 : 34;
        for (let index = 0; index < count; index++) {
          const phase = reduced ? index : timestamp / 5000 + index * 2.4;
          const horizontal = ((index * 137.5 + Math.sin(phase) * 15) % width + width) % width;
          const vertical = ((index * 79 - (reduced ? 0 : timestamp / (70 + index * 2))) % height + height) % height;
          context.beginPath();
          context.fillStyle = `rgba(223,238,164,${0.15 + (Math.sin(phase) + 1) * 0.15})`;
          context.arc(horizontal, vertical, index % 3 === 0 ? 2 : 1, 0, Math.PI * 2);
          context.fill();
        }
      }
      if (!reduced && !paused) frame = requestAnimationFrame(draw);
    };
    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      width = bounds.width; height = bounds.height;
      const density = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(width * density); canvas.height = Math.round(height * density);
      context.setTransform(density, 0, 0, density, 0, 0);
      if (reduced || paused) draw(0);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    const visibility = () => { cancelAnimationFrame(frame); if (!document.hidden && !paused) frame = requestAnimationFrame(draw); };
    document.addEventListener('visibilitychange', visibility);
    resize();
    frame = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); document.removeEventListener('visibilitychange', visibility); };
  }, [reduced, paused]);

  return <div className={`atmosphere theme-${stage.theme} ${moon ? 'is-moonlit' : ''} ${background ? `has-spine-background scenery-${background.id}` : ''}`} aria-hidden="true">
    {!background && <img ref={landscape} className="landscape-image" src={stage.id === 'G' ? ASSETS.realityBackground.src : ASSETS.dreamBackground.src} alt="" onLoad={() => onBackgroundReady?.(null)} onError={(event) => { event.currentTarget.hidden = true; onBackgroundReady?.(null); }} style={{ transform: `translateY(${Math.min(offset * 0.045, 120)}px) scale(1.16)` }}/>}
    {stage.id !== 'G' && <SpineBackground asset={background} offset={offset} paused={paused} reduced={reduced} onFrame={onBackgroundFrame} onReady={onBackgroundReady} inhabitants={inhabitants}/>}
    <div className="sun-halo" style={{ transform: `translateY(${offset * 0.07}px)` }}/>
    <div className="light-rays"/>
    <svg className="forest-silhouette far-forest" viewBox="0 0 1600 900" preserveAspectRatio="none" style={{ transform: `translateY(${Math.min(offset * 0.1, 170)}px)` }}>
      <path d="M0 0h106q-50 210 3 364l101-173-68 225 95-70-122 154L80 900H0ZM1600 0h-115q62 210-4 364l-115-170 85 234-110-84 132 173 40 383h87Z" fill="#0b2526"/>
      <path d="M0 0h305L180 64l131 65-151-15-40 77L74 80 0 126ZM1600 0h-310l135 69-149 63 164-21 58 85 34-123 68 69Z" fill="#123e36"/>
    </svg>
    <svg className="forest-silhouette near-forest" viewBox="0 0 1600 900" preserveAspectRatio="none"><path d="M0 900V654q70 15 112 101-11-114 46-138 43 80 22 158 57-90 122-70-20 71-60 89 110-12 161 106Zm1600 0V652q-75 15-116 108 10-121-49-149-41 82-17 164-60-93-127-71 17 70 62 89-105-11-168 107Z" fill="#0c2b26"/></svg>
    {stage.environment.includes('dome') && <div className="dream-dome"><span/><span/><span/></div>}
    {stage.environment.includes('embers') && !background?.treatment && <div className="ember-haze"/>}
    {effects.includes('memory') && <div className="memory-rings"><span/><span/><span/></div>}
    {moon && <div className="secret-moon"/>}
    {petals && <div className="petal-rain">{Array.from({ length: reduced ? 3 : 14 }, (_, index) => <i key={index} style={{ left: `${index * 7.3}%`, animationDelay: `${index * -1.8}s`, animationDuration: `${9 + index % 4}s` }}/>)}</div>}
    <canvas ref={canvasRef} className="ambient-canvas"/>
  </div>;
}
